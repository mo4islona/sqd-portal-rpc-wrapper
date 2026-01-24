import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { gunzip } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { Config } from './config';
import { metrics, metricsPayload } from './metrics';
import { PortalClient } from './portal/client';
import { parseJsonRpcPayload, JsonRpcResponse } from './jsonrpc';
import { handleJsonRpc } from './rpc/handlers';
import { ConcurrencyLimiter } from './util/concurrency';
import { normalizeError, unauthorizedError, overloadError, RpcError, invalidParams, invalidRequest, parseError } from './errors';

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
        req.log.warn({ err }, 'gzip decompression failed');
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
  const limiter = new ConcurrencyLimiter(config.maxConcurrentRequests);

  server.get('/healthz', async () => ({ status: 'ok' }));
  server.get('/readyz', async () => ({ status: 'ready' }));
  server.get('/metrics', async (_req, reply) => {
    const payload = await metricsPayload();
    reply.type('text/plain; version=0.0.4').send(payload);
  });

  server.post('/', async (req, reply) => {
    if (config.serviceMode === 'multi') {
      const headerChainId = extractChainId(req.headers['x-chain-id']);
      if (headerChainId === null) {
        return replyInvalidChainId(reply);
      }
      return handleRpcRequest(req, reply, config, portal, limiter, headerChainId);
    }
    const chainId = config.portalChainId ?? extractSingleChainIdFromMap(config);
    return handleRpcRequest(req, reply, config, portal, limiter, chainId);
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
    return handleRpcRequest(req, reply, config, portal, limiter, chainId);
  });

  return server;
}

async function handleRpcRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  config: Config,
  portal: PortalClient,
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
      if (!provided || provided !== config.wrapperApiKey) {
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
    const requests = parseJsonRpcPayload(payload);

    const responses: JsonRpcResponse[] = [];
    let maxStatus = 200;

    for (const request of requests) {
      const hasId = 'id' in request;
      const { response, httpStatus } = await handleJsonRpc(request, {
        config,
        portal,
        chainId,
        traceparent,
        requestId,
        logger: req.log
      });
      if (hasId) {
        responses.push(response);
        maxStatus = Math.max(maxStatus, httpStatus);
      }

      const methodLabel = request.method || 'unknown';
      metrics.requests_total.labels(methodLabel, String(chainId), String(httpStatus)).inc();
      if (hasId && response.error) {
        const errorCategory = toCategory(response.error.code);
        metrics.errors_total.labels(errorCategory).inc();
      }
    }

    if (responses.length === 0) {
      reply.code(204).send();
      return;
    }

    const output = Array.isArray(payload) ? responses : responses[0];
    const body = JSON.stringify(output);
    const labelMethod = Array.isArray(payload) ? 'batch' : requests[0]?.method || 'unknown';
    metrics.response_bytes_total.labels(labelMethod, String(chainId)).inc(Buffer.byteLength(body));

    reply.type('application/json').code(maxStatus).send(output);
    const durationMs = Date.now() - startedAt;
    req.log.info(
      { requestId, chainId, methods: requests.map((r) => r.method), status: maxStatus, durationMs },
      'rpc response'
    );
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
