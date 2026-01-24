import { Config } from '../config';
import { metrics } from '../metrics';
import { normalizeError, rateLimitError, unauthorizedError, conflictError, unavailableError, missingDataError, invalidParams, serverError } from '../errors';
import { PortalHeadResponse, PortalRequest, PortalBlockResponse } from './types';
import { parseNdjsonStream } from './ndjson';

export interface PortalClientOptions {
  fetchImpl?: typeof fetch;
  logger?: { info: (obj: Record<string, unknown>, msg: string) => void; warn?: (obj: Record<string, unknown>, msg: string) => void };
}

export class PortalClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiKeyHeader: string;
  private readonly timeoutMs: number;
  private readonly maxNdjsonLineBytes: number;
  private readonly maxNdjsonBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: PortalClientOptions['logger'];

  constructor(private readonly config: Config, options: PortalClientOptions = {}) {
    this.baseUrl = config.portalBaseUrl;
    this.apiKey = config.portalApiKey;
    this.apiKeyHeader = config.portalApiKeyHeader;
    this.timeoutMs = config.httpTimeoutMs;
    this.maxNdjsonLineBytes = config.maxNdjsonLineBytes;
    this.maxNdjsonBytes = config.maxNdjsonBytes;
    this.fetchImpl = options.fetchImpl || fetch;
    this.logger = options.logger;
  }

  async fetchHead(
    baseUrl: string,
    finalized: boolean,
    _requestedFinality: string,
    traceparent?: string
  ): Promise<{ head: PortalHeadResponse; finalizedAvailable: boolean }> {
    const url = `${baseUrl}/${finalized ? 'finalized-head' : 'head'}`;
    const resp = await this.request(url, 'GET', 'application/json', undefined, traceparent);

    if (resp.status === 404 && finalized) {
      metrics.finalized_fallback_total.inc();
      this.logger?.warn?.({ endpoint: 'finalized-head', status: 404 }, 'finalized head not found, fallback to non-finalized');
      return this.fetchHead(baseUrl, false, _requestedFinality, traceparent);
    }

    if (resp.status !== 200) {
      throw mapPortalStatusError(resp.status, await readBody(resp));
    }

    const body = (await resp.json()) as PortalHeadResponse;
    return { head: body, finalizedAvailable: finalized };
  }

  async streamBlocks(
    baseUrl: string,
    finalized: boolean,
    request: PortalRequest,
    traceparent?: string
  ): Promise<PortalBlockResponse[]> {
    const url = `${baseUrl}/${finalized ? 'finalized-stream' : 'stream'}`;
    const resp = await this.request(url, 'POST', 'application/x-ndjson', JSON.stringify(request), traceparent);

    if (resp.status === 204) {
      return [];
    }

    if (resp.status !== 200) {
      throw mapPortalStatusError(resp.status, await readBody(resp));
    }

    const body = resp.body;
    if (!body) {
      return [];
    }

    return parseNdjsonStream(body, {
      maxLineBytes: this.maxNdjsonLineBytes,
      maxBytes: this.maxNdjsonBytes
    });
  }

  private async request(
    url: string,
    method: string,
    accept: string,
    body?: string,
    traceparent?: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: accept
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.apiKey) {
      headers[this.apiKeyHeader] = this.apiKey;
    }
    if (traceparent) {
      headers.traceparent = traceparent;
    }

    const start = performance.now();
    try {
      const resp = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      const elapsed = (performance.now() - start) / 1000;
      metrics.portal_requests_total.labels(endpointLabel(url), String(resp.status)).inc();
      metrics.portal_latency_seconds.labels(endpointLabel(url)).observe(elapsed);
      this.logger?.info({ endpoint: endpointLabel(url), status: resp.status, durationMs: Math.round(elapsed * 1000) }, 'portal response');

      return resp;
    } catch (err) {
      this.logger?.warn?.({ endpoint: endpointLabel(url), error: err instanceof Error ? err.message : String(err) }, 'portal error');
      throw normalizeError(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  buildDatasetBaseUrl(dataset: string): string {
    const base = normalizePortalBaseUrl(this.baseUrl);
    if (base.includes('{dataset}')) {
      return normalizePortalBaseUrl(base.replace('{dataset}', dataset));
    }
    if (base.toLowerCase().endsWith(`/${dataset.toLowerCase()}`)) {
      return normalizePortalBaseUrl(base);
    }
    return normalizePortalBaseUrl(`${base}/${dataset}`);
  }
}

export function normalizePortalBaseUrl(raw: string): string {
  let base = raw.trim();
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  const suffixes = ['/stream', '/finalized-stream', '/head', '/finalized-head'];
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base;
}

function endpointLabel(url: string): string {
  if (url.endsWith('/head')) return 'head';
  if (url.endsWith('/finalized-head')) return 'finalized-head';
  if (url.endsWith('/stream')) return 'stream';
  if (url.endsWith('/finalized-stream')) return 'finalized-stream';
  return 'unknown';
}

async function readBody(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    return text || 'response body unavailable';
  } catch (err) {
    return `response body unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function mapPortalStatusError(status: number, message: string) {
  switch (status) {
    case 400:
      return invalidParams(`invalid portal response: ${message}`);
    case 401:
    case 403:
      return unauthorizedError();
    case 404:
      return missingDataError('block not found');
    case 409:
      return conflictError();
    case 429:
      return rateLimitError('Too Many Requests');
    case 503:
      return unavailableError('unavailable');
    default:
      return serverError('server error');
  }
}
