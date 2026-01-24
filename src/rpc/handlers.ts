import { Config } from '../config';
import { JsonRpcRequest, JsonRpcResponse, responseId, successResponse, errorResponse } from '../jsonrpc';
import { PortalClient } from '../portal/client';
import { allBlockFieldsSelection, allLogFieldsSelection, allTraceFieldsSelection, allTransactionFieldsSelection, txHashOnlyFieldsSelection } from '../portal/types';
import { resolveDataset } from '../portal/mapping';
import { RpcError, invalidParams, methodNotSupported, normalizeError } from '../errors';
import { convertBlockToRpc, convertLogToRpc, convertTraceToRpc, convertTxToRpc } from './conversion';
import { assertArray, assertObject, parseBlockNumber, parseLogFilter, parseTransactionIndex } from './validation';

export interface HandlerContext {
  config: Config;
  portal: PortalClient;
  chainId: number;
  traceparent?: string;
  requestId: string;
  logger?: { info: (obj: Record<string, unknown>, msg: string) => void; warn?: (obj: Record<string, unknown>, msg: string) => void };
}

export async function handleJsonRpc(
  request: JsonRpcRequest,
  ctx: HandlerContext
): Promise<{ response: JsonRpcResponse; httpStatus: number }> {
  const id = responseId(request);
  try {
    ctx.logger?.info({ requestId: ctx.requestId, method: request.method, chainId: ctx.chainId }, 'rpc request');
    const result = await dispatchMethod(request, ctx);
    return { response: successResponse(id, result), httpStatus: 200 };
  } catch (err) {
    const rpcError = err instanceof RpcError ? err : normalizeError(err);
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
    case 'eth_getTransactionByBlockNumberAndIndex':
      return handleGetTransactionByBlockNumberAndIndex(request, ctx);
    case 'eth_getLogs':
      return handleGetLogs(request, ctx);
    case 'trace_block':
      return handleTraceBlock(request, ctx);
    default:
      throw methodNotSupported('method not supported');
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
  const { head } = await ctx.portal.fetchHead(baseUrl, false, '', ctx.traceparent);
  return `0x${head.number.toString(16)}`;
}

async function handleGetBlockByNumber(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getBlockByNumber');
  if (request.params.length < 1) {
    throw invalidParams('invalid params');
  }
  const baseUrl = resolveBaseUrl(ctx);
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent);

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
    fields: {
      block: allBlockFieldsSelection(),
      transaction: fullTx ? allTransactionFieldsSelection() : txHashOnlyFieldsSelection()
    },
    transactions: [{}]
  };

  const blocks = await ctx.portal.streamBlocks(baseUrl, blockTag.useFinalized, portalReq, ctx.traceparent);
  if (blocks.length === 0) {
    return null;
  }
  return convertBlockToRpc(blocks[0], fullTx);
}

async function handleGetTransactionByBlockNumberAndIndex(request: JsonRpcRequest, ctx: HandlerContext): Promise<unknown> {
  assertArray(request.params, 'invalid params for eth_getTransactionByBlockNumberAndIndex');
  if (request.params.length < 2) {
    throw invalidParams('invalid params');
  }
  const baseUrl = resolveBaseUrl(ctx);
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent);
  const txIndex = parseTransactionIndex(request.params[1]);

  const portalReq = {
    type: 'evm' as const,
    fromBlock: blockTag.number,
    toBlock: blockTag.number,
    fields: {
      block: { number: true, hash: true, parentHash: true, timestamp: true },
      transaction: allTransactionFieldsSelection()
    },
    transactions: [{}]
  };

  const blocks = await ctx.portal.streamBlocks(baseUrl, blockTag.useFinalized, portalReq, ctx.traceparent);
  if (blocks.length === 0) {
    return null;
  }
  const block = blocks[0];
  for (const tx of block.transactions || []) {
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
  const parsed = await parseLogFilter(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent);
  ctx.logger?.info(
    { requestId: ctx.requestId, method: 'eth_getLogs', chainId: ctx.chainId, fromBlock: parsed.fromBlock, toBlock: parsed.toBlock },
    'rpc log range'
  );
  if (parsed.range > 10000) {
    ctx.logger?.warn?.(
      { requestId: ctx.requestId, method: 'eth_getLogs', chainId: ctx.chainId, range: parsed.range },
      'large log range'
    );
  }

  const portalReq = {
    type: 'evm' as const,
    fromBlock: parsed.fromBlock,
    toBlock: parsed.toBlock,
    fields: {
      block: { number: true, hash: true },
      log: allLogFieldsSelection()
    },
    logs: [parsed.logFilter]
  };

  const blocks = await ctx.portal.streamBlocks(baseUrl, parsed.useFinalized, portalReq, ctx.traceparent);
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
  const baseUrl = resolveBaseUrl(ctx);
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent);

  const portalReq = {
    type: 'evm' as const,
    fromBlock: blockTag.number,
    toBlock: blockTag.number,
    fields: {
      block: { number: true, hash: true },
      transaction: txHashOnlyFieldsSelection(),
      trace: allTraceFieldsSelection()
    },
    traces: [{}],
    transactions: [{}]
  };

  const blocks = await ctx.portal.streamBlocks(baseUrl, blockTag.useFinalized, portalReq, ctx.traceparent);
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
