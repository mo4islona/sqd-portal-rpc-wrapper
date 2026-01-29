import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { gunzip } from 'node:zlib';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { Config } from './config';
import { metrics, metricsPayload } from './metrics';
import { PortalClient, normalizePortalBaseUrl } from './portal/client';
import type { PortalStreamHeaders } from './portal/client';
import { parseJsonRpcPayload, JsonRpcResponse } from './jsonrpc';
import { handleJsonRpc } from './rpc/handlers';
import { coalesceGetBlockByNumber } from './rpc/batch';
import { UpstreamRpcClient } from './rpc/upstream';
import { ConcurrencyLimiter } from './util/concurrency';
import { normalizeError, unauthorizedError, overloadError, RpcError, invalidParams, invalidRequest, parseError } from './errors';
import { defaultDatasetMap } from './portal/mapping';

const gunzipAsync = promisify(gunzip);

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const server = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      redact: ['req.headers.authorization', 'req.headers.x-api-key', 'req.headers.X-API-Key']
    },
    bodyLimit: config.maxRequestBodyBytes
  });

  server.addContentTypeParser(
    /^application\/(json|.*\+json)$/i,
    { parseAs: 'buffer' },
    async (req: FastifyRequest, body: Buffer) => {
      const buffer = body as Buffer;
      const encoding = (req.headers['content-encoding'] || 'identity').toString();
      let payload: Buffer;
      try {
        payload = encoding.includes('gzip')
          ? await gunzipAsync(buffer, { maxOutputLength: config.maxRequestBodyBytes })
          : buffer;
      } catch (err) {
        const { message, reason } = classifyGunzipError(err);
        req.log.warn({ err: message, reason }, 'gzip decompression failed');
        throw invalidRequest('invalid request');
      }
      try {
        return JSON.parse(payload.toString('utf8'));
      } catch (err) {
        throw parseError('parse error');
      }
    }
  );

  server.setErrorHandler((err, req, reply) => {
    if (err instanceof RpcError) {
      const rpcError = err;
      metrics.errors_total.labels(rpcError.category).inc();
      reply.code(rpcError.httpStatus).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: rpcError.code, message: rpcError.message }
      });
      return;
    }
    if (hasRpcErrorCause(err)) {
      const rpcError = err.cause;
      metrics.errors_total.labels(rpcError.category).inc();
      reply.code(rpcError.httpStatus).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: rpcError.code, message: rpcError.message }
      });
      return;
    }
    const errCode = getErrorCode(err);
    if (errCode === 'FST_ERR_CTP_BODY_INVALID_JSON' || errCode === 'FST_ERR_CTP_INVALID_JSON' || err instanceof SyntaxError) {
      const rpcError = parseError('parse error');
      metrics.errors_total.labels(rpcError.category).inc();
      reply.code(rpcError.httpStatus).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: rpcError.code, message: rpcError.message }
      });
      return;
    }
    if (errCode?.startsWith('FST_ERR_CTP')) {
      const rpcError = invalidRequest('invalid request');
      metrics.errors_total.labels(rpcError.category).inc();
      reply.code(rpcError.httpStatus).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: rpcError.code, message: rpcError.message }
      });
      return;
    }
    req.log.error({ err }, 'unexpected error');
    const rpcError = normalizeError(err);
    metrics.errors_total.labels(rpcError.category).inc();
    reply.code(rpcError.httpStatus).send({
      jsonrpc: '2.0',
      id: null,
      error: { code: rpcError.code, message: rpcError.message }
    });
  });

  const portal = new PortalClient(config, { logger: server.log });
  const upstream = new UpstreamRpcClient(config, { logger: server.log });
  const limiter = new ConcurrencyLimiter(config.maxConcurrentRequests);

  await prefetchMetadata(server, portal, config);

  server.get('/healthz', async () => ({ status: 'ok' }));
  server.get('/readyz', async (req, reply) => {
    try {
      const requestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined;
      await checkPortalReady(config, portal, requestId);
      reply.send({ status: 'ready' });
    } catch (err) {
      req.log.warn({ error: String(err) }, 'portal readiness check failed');
      reply.code(503).send({ status: 'unready' });
    }
  });
  server.get('/metrics', async (_req, reply) => {
    const payload = await metricsPayload();
    reply.type('text/plain; version=0.0.4').send(payload);
  });
  server.get('/capabilities', async (req, reply) => {
    const payload = await buildCapabilities(config, portal, req.log);
    reply.send(payload);
  });

  server.post('/', async (req, reply) => {
    if (config.serviceMode === 'multi') {
      const headerChainId = extractChainId(req.headers['x-chain-id']);
      if (headerChainId === null) {
        return replyInvalidChainId(reply);
      }
      return handleRpcRequest(req, reply, config, portal, upstream, limiter, headerChainId);
    }
    const chainId = config.portalChainId ?? extractSingleChainIdFromMap(config);
    return handleRpcRequest(req, reply, config, portal, upstream, limiter, chainId);
  });

  server.post('/v1/evm/:chainId', async (req, reply) => {
    if (config.serviceMode !== 'multi') {
      return reply.code(404).send({});
    }
    const params = req.params as { chainId?: string };
    const chainId = extractChainId(params.chainId);
    if (chainId === null) {
      return replyInvalidChainId(reply);
    }
    return handleRpcRequest(req, reply, config, portal, upstream, limiter, chainId);
  });

  return server;
}

async function handleRpcRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  config: Config,
  portal: PortalClient,
  upstream: UpstreamRpcClient,
  limiter: ConcurrencyLimiter,
  chainId: number
) {
  const release = limiter.tryAcquire();
  if (!release) {
    const err = overloadError();
    metrics.errors_total.labels(err.category).inc();
    return reply.code(err.httpStatus).send({
      jsonrpc: '2.0',
      id: null,
      error: { code: err.code, message: err.message }
    });
  }

  try {
    const startedAt = Date.now();
    if (config.wrapperApiKey) {
      const header = config.wrapperApiKeyHeader.toLowerCase();
      const provided = normalizeHeaderValue(req.headers[header] || req.headers[header.toLowerCase()]);
      if (!provided || !timingSafeCompare(provided, config.wrapperApiKey)) {
        const err = unauthorizedError();
        metrics.errors_total.labels(err.category).inc();
        return reply.code(err.httpStatus).send({
          jsonrpc: '2.0',
          id: null,
          error: { code: err.code, message: err.message }
        });
      }
    }

    const traceparent = typeof req.headers.traceparent === 'string' ? req.headers.traceparent : undefined;
    const requestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : randomUUID();
    const payload = req.body;
    const parsed = parseJsonRpcPayload(payload);
    if (parsed.isBatch) {
      metrics.batch_requests_total.labels(batchSizeBucket(parsed.items.length)).inc();
    }
    const requestCache = new Map<string, Promise<unknown>>();
    const startBlockCache = new Map<string, Promise<number | undefined>>();
    const portalHeaders: PortalStreamHeaders = {};
    const recordPortalHeaders = (headers: PortalStreamHeaders) => {
      if (headers.finalizedHeadNumber && !portalHeaders.finalizedHeadNumber) {
        portalHeaders.finalizedHeadNumber = headers.finalizedHeadNumber;
      }
      if (headers.finalizedHeadHash && !portalHeaders.finalizedHeadHash) {
        portalHeaders.finalizedHeadHash = headers.finalizedHeadHash;
      }
    };

    const responses: JsonRpcResponse[] = [];
    let maxStatus = 200;
    const coalesced = parsed.isBatch
      ? await coalesceGetBlockByNumber(parsed.items, {
          config,
          portal,
          upstream,
          chainId,
          traceparent,
          requestId,
          recordPortalHeaders,
          logger: req.log
        })
      : new Map();

    for (const [index, item] of parsed.items.entries()) {
      if (item.error) {
        responses.push(item.error);
        maxStatus = Math.max(maxStatus, 400);
        metrics.errors_total.labels('invalid_request').inc();
        metrics.requests_total.labels('invalid_request', String(chainId), '400').inc();
        continue;
      }
      const request = item.request!;
      const hasId = 'id' in request;
      const methodLabel = request.method || 'unknown';
      const coalescedResponse = coalesced.get(index);
      let response: JsonRpcResponse;
      let httpStatus: number;
      let duration: number;
      if (coalescedResponse) {
        response = coalescedResponse.response;
        httpStatus = coalescedResponse.httpStatus;
        duration = coalescedResponse.durationMs;
      } else {
        const startedRequest = performance.now();
        ({ response, httpStatus } = await handleJsonRpc(request, {
          config,
          portal,
          chainId,
          traceparent,
          requestId,
          logger: req.log,
          recordPortalHeaders,
          upstream,
          requestCache,
          requestTimeoutMs: config.handlerTimeoutMs,
          startBlockCache
        }));
        duration = performance.now() - startedRequest;
      }
      metrics.rpc_duration_seconds.labels(methodLabel).observe(duration / 1000);
      if (hasId) {
        responses.push(response);
        maxStatus = Math.max(maxStatus, httpStatus);
      }

      metrics.requests_total.labels(methodLabel, String(chainId), String(httpStatus)).inc();
      if (hasId && response.error) {
        const errorCategory = toCategory(response.error.code);
        metrics.errors_total.labels(errorCategory).inc();
      }
      if (parsed.isBatch) {
        const status = response.error ? 'error' : 'ok';
        metrics.batch_items_total.labels(status).inc();
      }
    }

    if (parsed.isBatch) {
      for (const item of parsed.items) {
        if (item.error) {
          metrics.batch_items_total.labels('error').inc();
        }
      }
    }

    if (responses.length === 0) {
      reply.code(204).send();
      return;
    }

    const output = parsed.isBatch ? responses : responses[0];
    const body = JSON.stringify(output);
    const firstRequest = parsed.items.find((item) => item.request)?.request;
    const labelMethod = parsed.isBatch ? 'batch' : firstRequest?.method || 'unknown';
    const methods = parsed.items.flatMap((item) => (item.request ? [item.request.method] : []));
    metrics.response_bytes_total.labels(labelMethod, String(chainId)).inc(Buffer.byteLength(body));

    if (portalHeaders.finalizedHeadNumber) {
      reply.header('X-Sqd-Finalized-Head-Number', portalHeaders.finalizedHeadNumber);
    }
    if (portalHeaders.finalizedHeadHash) {
      reply.header('X-Sqd-Finalized-Head-Hash', portalHeaders.finalizedHeadHash);
    }
    reply.type('application/json').code(maxStatus).send(output);
    const durationMs = Date.now() - startedAt;
    req.log.info({ requestId, chainId, methods, status: maxStatus, durationMs }, 'rpc response');
  } catch (err) {
    const rpcError = err instanceof RpcError ? err : normalizeError(err);
    metrics.errors_total.labels(rpcError.category).inc();
    reply.code(rpcError.httpStatus).send({
      jsonrpc: '2.0',
      id: null,
      error: { code: rpcError.code, message: rpcError.message }
    });
  } finally {
    release();
  }
}

function extractChainId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string') {
    const parsed = value.startsWith('0x') ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  return null;
}

function classifyGunzipError(err: unknown): { message: string; reason: 'size_limit' | 'corrupt' } {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message.includes('maxOutputLength') || message.includes('output length') ? 'size_limit' : 'corrupt';
  return { message, reason };
}

function normalizeHeaderValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function replyInvalidChainId(reply: FastifyReply) {
  const err = invalidParams('invalid chainId');
  metrics.errors_total.labels(err.category).inc();
  return reply.code(err.httpStatus).send({
    jsonrpc: '2.0',
    id: null,
    error: { code: err.code, message: err.message }
  });
}

function extractSingleChainIdFromMap(config: Config): number {
  const entries = Object.keys(config.portalDatasetMap);
  if (entries.length === 1) {
    return Number(entries[0]);
  }
  if (!config.portalChainId) {
    throw new Error('PORTAL_CHAIN_ID required');
  }
  return config.portalChainId;
}

function hasRpcErrorCause(err: unknown): err is { cause: RpcError } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'cause' in err &&
    (err as { cause?: unknown }).cause instanceof RpcError
  );
}

function getErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function toCategory(code: number): string {
  switch (code) {
    case -32600:
      return 'invalid_request';
    case -32601:
      return 'unsupported_method';
    case -32016:
      return 'unauthorized';
    case -32005:
      return 'rate_limit';
    case -32014:
      return 'not_found';
    case -32012:
    case -32602:
      return 'invalid_params';
    default:
      return 'server_error';
  }
}

function batchSizeBucket(size: number): string {
  if (size <= 1) return '1';
  if (size <= 5) return '2-5';
  if (size <= 10) return '6-10';
  if (size <= 20) return '11-20';
  if (size <= 50) return '21-50';
  if (size <= 100) return '51-100';
  return '101+';
}

function timingSafeCompare(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  const len = Math.max(leftBuf.length, rightBuf.length);
  const leftPadded = Buffer.alloc(len);
  const rightPadded = Buffer.alloc(len);
  leftBuf.copy(leftPadded);
  rightBuf.copy(rightPadded);
  return timingSafeEqual(leftPadded, rightPadded) && leftBuf.length === rightBuf.length;
}

export const __test__ = {
  extractChainId,
  extractSingleChainIdFromMap,
  normalizeHeaderValue,
  classifyGunzipError,
  timingSafeCompare,
  batchSizeBucket
};

const JSON_RPC_BASE_METHODS = [
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getLogs',
  'trace_block'
];
const JSON_RPC_UPSTREAM_METHODS = [
  'eth_getBlockByHash',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'trace_transaction'
];

async function prefetchMetadata(server: FastifyInstance, portal: PortalClient, config: Config) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const chainDatasets = resolveChainDatasets(config);
  const entries = Object.entries(chainDatasets);
  await Promise.all(
    entries.map(async ([chainId, dataset]) => {
      try {
        const baseUrl = portal.buildDatasetBaseUrl(dataset);
        const metadata = await portal.getMetadata(baseUrl);
        const realTime = resolveRealtimeEnabled(metadata, config.portalRealtimeMode);
        metrics.portal_realtime_enabled.labels(chainId).set(Number(realTime));
        server.log.info({ chainId: Number(chainId), dataset, realTime }, 'portal metadata prefetched');
      } catch (err) {
        if (config.portalRealtimeMode === 'required') {
          throw err;
        }
        server.log.warn(
          { chainId: Number(chainId), dataset, err: err instanceof Error ? err.message : String(err) },
          'portal metadata prefetch failed'
        );
      }
    })
  );
}

async function checkPortalReady(config: Config, portal: PortalClient, requestId?: string) {
  const chainDatasets = resolveChainDatasets(config);
  const entries = Object.entries(chainDatasets);
  if (entries.length === 0) {
    throw new Error('no datasets configured');
  }
  await Promise.all(
    entries.map(async ([_chainId, dataset]) => {
      const baseUrl = portal.buildDatasetBaseUrl(dataset);
      const metadata = await portal.getMetadata(baseUrl, undefined, requestId);
      resolveRealtimeEnabled(metadata, config.portalRealtimeMode);
      await portal.fetchHead(baseUrl, false, undefined, requestId);
    })
  );
}

async function buildCapabilities(
  config: Config,
  portal: PortalClient,
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void }
) {
  const chainDatasets = resolveChainDatasets(config);
  const chains: Record<string, { dataset: string; aliases: string[]; startBlock?: number; realTime: boolean }> = {};
  await Promise.all(
    Object.entries(chainDatasets).map(async ([chainId, dataset]) => {
      let aliases: string[] = [];
      let startBlock: number | undefined;
      let realTime = false;
      try {
        const baseUrl = portal.buildDatasetBaseUrl(dataset);
        const metadata = await portal.getMetadata(baseUrl);
        aliases = Array.isArray(metadata.aliases) ? metadata.aliases : [];
        startBlock = typeof metadata.start_block === 'number' ? metadata.start_block : undefined;
        realTime = resolveRealtimeEnabled(metadata, config.portalRealtimeMode);
        metrics.portal_realtime_enabled.labels(chainId).set(Number(realTime));
      } catch (err) {
        if (config.portalRealtimeMode === 'required') {
          throw err;
        }
        logger.warn(
          { chainId: Number(chainId), dataset, error: String(err) },
          'portal metadata fetch failed'
        );
        realTime = resolveRealtimeEnabled(null, config.portalRealtimeMode);
        metrics.portal_realtime_enabled.labels(chainId).set(Number(realTime));
      }
      chains[chainId] = { dataset, aliases, startBlock, realTime };
    })
  );

  return {
    service: { name: 'sqd-portal-rpc-wrapper', version: process.env.npm_package_version || '0.1.0' },
    mode: config.serviceMode,
    methods: resolveAdvertisedMethods(config),
    chains,
    portalEndpoints: portalEndpointsTemplate(config)
  };
}

function resolveAdvertisedMethods(config: Config): string[] {
  if (!config.upstreamMethodsEnabled || !isUpstreamConfigured(config)) {
    return JSON_RPC_BASE_METHODS;
  }
  return [...JSON_RPC_BASE_METHODS, ...JSON_RPC_UPSTREAM_METHODS];
}

function isUpstreamConfigured(config: Config): boolean {
  if (config.upstreamRpcUrl) {
    return true;
  }
  return Object.values(config.upstreamRpcUrlMap).some((value) => value.trim() !== '');
}

function portalEndpointsTemplate(config: Config) {
  const base = normalizePortalBaseUrl(config.portalBaseUrl);
  const template = base.includes('{dataset}') ? base : `${base}/{dataset}`;
  return {
    head: `${template}/head`,
    finalizedHead: `${template}/finalized-head`,
    stream: `${template}/stream`,
    finalizedStream: `${template}/finalized-stream`,
    metadata: `${template}/metadata`
  };
}

function resolveChainDatasets(config: Config): Record<string, string> {
  if (config.serviceMode === 'single') {
    const chainId = config.portalChainId ?? extractSingleChainIdFromMap(config);
    const dataset = config.portalDataset ?? config.portalDatasetMap[String(chainId)];
    if (!dataset) {
      return {};
    }
    return { [String(chainId)]: dataset };
  }
  if (config.portalUseDefaultDatasets) {
    return { ...defaultDatasetMap(), ...config.portalDatasetMap };
  }
  return { ...config.portalDatasetMap };
}

function resolveRealtimeEnabled(metadata: { real_time?: boolean } | null, mode: Config['portalRealtimeMode']): boolean {
  if (mode === 'disabled') {
    return false;
  }
  if (mode === 'required' && !metadata?.real_time) {
    throw new Error('portal realtime required');
  }
  return Boolean(metadata?.real_time);
}
