import { Config } from '../config';
import { JsonRpcRequest, JsonRpcResponse, responseId, successResponse, errorResponse } from '../jsonrpc';
import { PortalClient } from '../portal/client';
import { PortalRequest, allBlockFieldsSelection, allLogFieldsSelection, allTraceFieldsSelection, allTransactionFieldsSelection, txHashOnlyFieldsSelection } from '../portal/types';
import { resolveDataset } from '../portal/mapping';
import { RpcError, invalidParams, isPortalUnsupportedFieldError, methodNotSupported, normalizeError, rangeTooLargeError, timeoutError } from '../errors';
import { convertBlockToRpc, convertLogToRpc, convertTraceToRpc, convertTxToRpc } from './conversion';
import { assertArray, assertObject, parseBlockNumber, parseLogFilter, parseTransactionIndex } from './validation';
import { metrics } from '../metrics';
import { UpstreamRpcClient } from './upstream';
import { fetchUncles } from './uncles';

export interface HandlerContext {
  config: Config;
  portal: PortalClient;
  chainId: number;
  traceparent?: string;
  requestId: string;
  logger?: { info: (obj: Record<string, unknown>, msg: string) => void; warn?: (obj: Record<string, unknown>, msg: string) => void };
  recordPortalHeaders?: (headers: { finalizedHeadNumber?: string; finalizedHeadHash?: string }) => void;
  upstream?: UpstreamRpcClient;
  requestCache?: Map<string, Promise<unknown>>;
  requestTimeoutMs?: number;
  startBlockCache?: Map<string, Promise<number | undefined>>;
}

export async function handleJsonRpc(
  request: JsonRpcRequest,
  ctx: HandlerContext
): Promise<{ response: JsonRpcResponse; httpStatus: number }> {
  const id = responseId(request);
  try {
    ctx.logger?.info({ requestId: ctx.requestId, method: request.method, chainId: ctx.chainId }, 'rpc request');
    const result = await dispatchWithCache(request, ctx);
    return { response: successResponse(id, result), httpStatus: 200 };
  } catch (err) {
    const rpcError = err instanceof RpcError ? err : normalizeError(err);
    if (rpcError.message === 'request timeout') {
      metrics.rpc_timeouts_total.labels(request.method || 'unknown').inc();
    }
    if (rpcError.category === 'conflict') {
      metrics.portal_conflict_total.labels(String(ctx.chainId)).inc();
      const previousBlocks = rpcError.data?.previousBlocks;
      const previousBlocksCount = Array.isArray(previousBlocks) ? previousBlocks.length : 0;
      ctx.logger?.warn?.(
        { requestId: ctx.requestId, method: request.method, chainId: ctx.chainId, previousBlocksCount },
        'portal conflict'
      );
    }
    return { response: errorResponse(id, rpcError), httpStatus: rpcError.httpStatus };
  }
}

async function dispatchMethod(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  switch (request.method) {
    case 'eth_chainId':
      return handleChainId(ctx);
    case 'eth_blockNumber':
      return handleBlockNumber(ctx);
    case 'eth_getBlockByNumber':
      return handleGetBlockByNumber(request, ctx);
    case 'eth_getBlockByHash':
      return handleGetBlockByHash(request, ctx);
    case 'eth_getTransactionByHash':
      return handleGetTransactionByHash(request, ctx);
    case 'eth_getTransactionReceipt':
      return handleGetTransactionReceipt(request, ctx);
    case 'eth_getTransactionByBlockNumberAndIndex':
      return handleGetTransactionByBlockNumberAndIndex(request, ctx);
    case 'eth_getLogs':
      return handleGetLogs(request, ctx);
    case 'trace_block':
      return handleTraceBlock(request, ctx);
    case 'trace_transaction':
      return handleTraceTransaction(request, ctx);
    default:
      throw methodNotSupported('method not supported');
  }
}

async function dispatchWithCache(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  const cacheKey = ctx.requestCache ? requestCacheKey(request) : undefined;
  let cached = cacheKey ? ctx.requestCache!.get(cacheKey) : undefined;
  if (!cached) {
    const basePromise = Promise.resolve().then(() => dispatchMethod(request, ctx));
    cached = ctx.requestTimeoutMs ? withTimeout(basePromise, ctx.requestTimeoutMs) : basePromise;
    if (cacheKey) {
      ctx.requestCache!.set(cacheKey, cached);
    }
  }
  return cached;
}

function requestCacheKey(request: JsonRpcRequest): string | undefined {
  try {
    const params = request.params === undefined ? null : request.params;
    return `${request.method}:${JSON.stringify(params)}`;
  } catch {
    return undefined;
  }
}

function resolveBaseUrl(ctx: HandlerContext): string {
  const dataset = resolveDataset(ctx.chainId, ctx.config);
  if (!dataset) {
    throw invalidParams('invalid chainId');
  }
  return ctx.portal.buildDatasetBaseUrl(dataset);
}

function handleChainId(ctx: HandlerContext): string {
  return `0x${ctx.chainId.toString(16)}`;
}

async function handleBlockNumber(ctx: HandlerContext): Promise<string> {
  const baseUrl = resolveBaseUrl(ctx);
  const { head } = await ctx.portal.fetchHead(baseUrl, false, ctx.traceparent, ctx.requestId);
  return `0x${head.number.toString(16)}`;
}

async function handleGetBlockByNumber(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getBlockByNumber');
  if (request.params.length < 1) {
    throw invalidParams('invalid params');
  }
  if (request.params[0] === 'pending') {
    return proxyUpstream(request, ctx, 'pending block not found');
  }
  const baseUrl = resolveBaseUrl(ctx);
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent, ctx.requestId);
  const startBlock = await getStartBlock(ctx, baseUrl);
  if (startBlock !== undefined && blockTag.number < startBlock) {
    return null;
  }

  let fullTx = false;
  if (request.params.length > 1) {
    if (typeof request.params[1] !== 'boolean') {
      throw invalidParams('invalid params');
    }
    fullTx = request.params[1];
  }

  const portalReq = {
    type: 'evm' as const,
    fromBlock: blockTag.number,
    toBlock: blockTag.number,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: allBlockFieldsSelection(),
      transaction: fullTx ? allTransactionFieldsSelection() : txHashOnlyFieldsSelection()
    },
    transactions: [{}]
  };

  let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl,
      blockTag.useFinalized,
      portalReq,
      ctx.traceparent,
      ctx.recordPortalHeaders,
      ctx.requestId
    );
  } catch (err) {
    if (isPortalUnsupportedFieldError(err)) {
      const fallback = tryProxyUpstream(request, ctx);
      if (fallback) {
        return fallback;
      }
    }
    throw err;
  }
  if (blocks.length === 0) {
    return null;
  }
  const uncles = await fetchUncles(ctx, blockTag.number);
  return convertBlockToRpc(blocks[0], fullTx, uncles);
}

async function handleGetBlockByHash(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getBlockByHash');
  if (request.params.length < 1 || !isHashParam(request.params[0])) {
    throw invalidParams('invalid params');
  }
  if (request.params.length > 1 && typeof request.params[1] !== 'boolean') {
    throw invalidParams('invalid params');
  }
  return proxyUpstreamOrUnsupported(request, ctx);
}

async function handleGetTransactionByHash(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getTransactionByHash');
  if (request.params.length < 1 || !isHashParam(request.params[0])) {
    throw invalidParams('invalid params');
  }
  return proxyUpstreamOrUnsupported(request, ctx);
}

async function handleGetTransactionReceipt(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getTransactionReceipt');
  if (request.params.length < 1 || !isHashParam(request.params[0])) {
    throw invalidParams('invalid params');
  }
  return proxyUpstreamOrUnsupported(request, ctx);
}

async function handleGetTransactionByBlockNumberAndIndex(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getTransactionByBlockNumberAndIndex');
  if (request.params.length < 2) {
    throw invalidParams('invalid params');
  }
  if (request.params[0] === 'pending') {
    return proxyUpstream(request, ctx, 'pending block not found');
  }
  const baseUrl = resolveBaseUrl(ctx);
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent, ctx.requestId);
  const startBlock = await getStartBlock(ctx, baseUrl);
  if (startBlock !== undefined && blockTag.number < startBlock) {
    return null;
  }
  const txIndex = parseTransactionIndex(request.params[1]);

  const portalReq = {
    type: 'evm' as const,
    fromBlock: blockTag.number,
    toBlock: blockTag.number,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: { number: true, hash: true, parentHash: true, timestamp: true },
      transaction: allTransactionFieldsSelection()
    },
    transactions: [{}]
  };

  let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl,
      blockTag.useFinalized,
      portalReq,
      ctx.traceparent,
      ctx.recordPortalHeaders,
      ctx.requestId
    );
  } catch (err) {
    if (isPortalUnsupportedFieldError(err)) {
      const fallback = tryProxyUpstream(request, ctx);
      if (fallback) {
        return fallback;
      }
    }
    throw err;
  }
  if (blocks.length === 0) {
    return null;
  }
  const block = blocks[0];
  const transactions = block.transactions || [];
  if (txIndex >= 0 && txIndex < transactions.length) {
    const candidate = transactions[txIndex];
    if (candidate && candidate.transactionIndex === txIndex) {
      return convertTxToRpc(candidate, block.header);
    }
  }
  for (const tx of transactions) {
    if (tx.transactionIndex === txIndex) {
      return convertTxToRpc(tx, block.header);
    }
  }
  return null;
}

async function handleGetLogs(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getLogs');
  if (request.params.length < 1) {
    throw invalidParams('invalid params');
  }
  assertObject(request.params[0], 'invalid filter object');

  const baseUrl = resolveBaseUrl(ctx);
  const parsed = await parseLogFilter(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent, ctx.requestId);
  if ('blockHash' in parsed) {
    return proxyUpstream(request, ctx, 'blockHash filter not supported');
  }
  const startBlock = await getStartBlock(ctx, baseUrl);
  const { useFinalized, logFilter, toBlock } = parsed;
  let { fromBlock } = parsed;
  if (startBlock !== undefined) {
    if (toBlock < startBlock) {
      return [];
    }
    if (fromBlock < startBlock) {
      fromBlock = startBlock;
    }
  }
  const range = toBlock - fromBlock + 1;
  if (range > ctx.config.maxLogBlockRange) {
    throw rangeTooLargeError(ctx.config.maxLogBlockRange);
  }
  ctx.logger?.info(
    { requestId: ctx.requestId, method: 'eth_getLogs', chainId: ctx.chainId, fromBlock, toBlock },
    'rpc log range'
  );
  if (range > 10000) {
    ctx.logger?.warn?.(
      { requestId: ctx.requestId, method: 'eth_getLogs', chainId: ctx.chainId, range },
      'large log range'
    );
  }

  const portalReq: PortalRequest = {
    type: 'evm',
    fromBlock,
    toBlock,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: { number: true, hash: true },
      log: allLogFieldsSelection()
    },
    logs: [logFilter]
  };

  const blocks = await ctx.portal.streamBlocks(
    baseUrl,
    useFinalized,
    portalReq,
    ctx.traceparent,
    ctx.recordPortalHeaders,
    ctx.requestId
  );
  const logs: Record<string, unknown>[] = [];
  for (const block of blocks) {
    for (const log of block.logs || []) {
      logs.push(convertLogToRpc(log, block));
    }
  }
  return logs;
}

async function handleTraceBlock(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for trace_block');
  if (request.params.length < 1) {
    throw invalidParams('invalid params');
  }
  if (request.params[0] === 'pending') {
    return proxyUpstream(request, ctx, 'pending block not found');
  }
  if (isBlockHashParam(request.params[0])) {
    return proxyUpstream(request, ctx, 'blockHash not supported');
  }
  const baseUrl = resolveBaseUrl(ctx);
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent, ctx.requestId);
  const startBlock = await getStartBlock(ctx, baseUrl);
  if (startBlock !== undefined && blockTag.number < startBlock) {
    return [];
  }

  const portalReq = {
    type: 'evm' as const,
    fromBlock: blockTag.number,
    toBlock: blockTag.number,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: { number: true, hash: true },
      transaction: txHashOnlyFieldsSelection(),
      trace: allTraceFieldsSelection()
    },
    traces: [{}],
    transactions: [{}]
  };

  let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl,
      blockTag.useFinalized,
      portalReq,
      ctx.traceparent,
      ctx.recordPortalHeaders,
      ctx.requestId
    );
  } catch (err) {
    if (isPortalUnsupportedFieldError(err)) {
      const fallback = tryProxyUpstream(request, ctx);
      if (fallback) {
        return fallback;
      }
    }
    throw err;
  }
  if (blocks.length === 0) {
    return [];
  }

  const block = blocks[0];
  const txHashByIndex: Record<number, string> = {};
  for (const tx of block.transactions || []) {
    txHashByIndex[tx.transactionIndex] = tx.hash;
  }
  const traces: Record<string, unknown>[] = [];
  for (const trace of block.traces || []) {
    traces.push(convertTraceToRpc(trace, block.header, txHashByIndex));
  }
  return traces;
}

async function handleTraceTransaction(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for trace_transaction');
  if (request.params.length < 1 || !isHashParam(request.params[0])) {
    throw invalidParams('invalid params');
  }
  return proxyUpstreamOrUnsupported(request, ctx);
}

async function getStartBlock(ctx: HandlerContext, baseUrl: string): Promise<number | undefined> {
  if (!ctx.startBlockCache) {
    const metadata = await ctx.portal.getMetadata(baseUrl, ctx.traceparent, ctx.requestId);
    return typeof metadata.start_block === 'number' ? metadata.start_block : undefined;
  }
  let cached = ctx.startBlockCache.get(baseUrl);
  if (!cached) {
    cached = ctx.portal
      .getMetadata(baseUrl, ctx.traceparent, ctx.requestId)
      .then((metadata) => (typeof metadata.start_block === 'number' ? metadata.start_block : undefined))
      .catch((err) => {
        ctx.startBlockCache?.delete(baseUrl);
        throw err;
      });
    ctx.startBlockCache.set(baseUrl, cached);
  }
  return cached;
}

function isBlockHashParam(value: unknown): value is string {
  return isHashParam(value);
}

function isHashParam(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function proxyUpstream(request: JsonRpcRequest, ctx: HandlerContext, message: string): Promise<unknown> {
  if (!ctx.config.upstreamMethodsEnabled) {
    throw invalidParams(message);
  }
  if (!ctx.upstream || !ctx.upstream.resolveUrl(ctx.chainId)) {
    throw invalidParams(message);
  }
  return ctx.upstream.call(request, ctx.chainId, ctx.traceparent);
}

function tryProxyUpstream(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> | undefined {
  if (!ctx.config.upstreamMethodsEnabled) {
    return undefined;
  }
  if (!ctx.upstream || !ctx.upstream.resolveUrl(ctx.chainId)) {
    return undefined;
  }
  return ctx.upstream.call(request, ctx.chainId, ctx.traceparent);
}

function proxyUpstreamOrUnsupported(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  if (!ctx.config.upstreamMethodsEnabled) {
    throw methodNotSupported('method not supported');
  }
  if (!ctx.upstream || !ctx.upstream.resolveUrl(ctx.chainId)) {
    throw methodNotSupported('method not supported');
  }
  return ctx.upstream.call(request, ctx.chainId, ctx.traceparent);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
