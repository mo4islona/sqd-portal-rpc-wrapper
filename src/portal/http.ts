import { Readable } from 'node:stream';
import { HttpClient, HttpError, HttpResponse } from '@subsquid/http-client';
import type { HttpBody, RequestOptions } from '@subsquid/http-client';
import type { Headers as NodeFetchHeaders } from 'node-fetch';

export class FetchHttpClient extends HttpClient {
  constructor(private readonly fetchImpl: typeof fetch) {
    super({});
  }

  override async request<T = any>(
    method: string,
    url: string,
    options: RequestOptions & HttpBody = {}
  ): Promise<HttpResponse<T>> {
    const headers = new (globalThis as any).Headers(options.headers || {});
    let body: RequestInit['body'] | undefined;

    if ('json' in options && options.json !== undefined) {
      body = JSON.stringify(options.json);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    } else if ('content' in options && options.content !== undefined) {
      if (typeof options.content === 'string') {
        body = options.content;
      } else if (Buffer.isBuffer(options.content)) {
        body = options.content;
      } else {
        body = Buffer.from(options.content.buffer, options.content.byteOffset, options.content.byteLength);
      }
    }

    if (options.query) {
      const qs = new URLSearchParams(options.query as Record<string, string>).toString();
      url = url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
    }

    const resp = await this.fetchImpl(url, {
      method,
      headers,
      body,
      signal: options.abort
    });

    const responseHeaders = new (globalThis as any).Headers(resp.headers) as NodeFetchHeaders;
    if (options.stream && resp.ok) {
      const stream = resp.body ? Readable.fromWeb(resp.body as ReadableStream<Uint8Array>) : null;
      return new HttpResponse(0, resp.url, resp.status, responseHeaders, stream as T, true);
    }

    const contentType = (resp.headers.get('content-type') || '').split(';')[0];
    let responseBody: unknown = undefined;
    if (contentType === 'application/json') {
      responseBody = await resp.json();
    } else if (contentType.startsWith('text/')) {
      responseBody = await resp.text();
    } else {
      const buf = await resp.arrayBuffer();
      responseBody = buf.byteLength > 0 ? Buffer.from(buf) : undefined;
    }

    const response = new HttpResponse(0, resp.url, resp.status, responseHeaders, responseBody as T, false);
    if (!response.ok) {
      throw new HttpError(response);
    }
    return response;
  }
}

export function httpStatusFromError(err: unknown): number | undefined {
  if (err instanceof HttpError) {
    return err.response.status;
  }
  return undefined;
}

export function errorBodyText(err: unknown): string {
  if (!(err instanceof HttpError)) return '';
  const body = err.response.body;
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    return Buffer.from(body).toString('utf8');
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
