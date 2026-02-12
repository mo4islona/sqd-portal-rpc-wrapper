import { performance } from 'node:perf_hooks';
import { Config } from '../config';
import { PortalClient, PortalStreamHeaders } from '../portal/client';
import {
  ParsedJsonRpcItem,
  JsonRpcResponse,
  JsonRpcRequest,
  responseId,
  successResponse,
  errorResponse
} from '../jsonrpc';
import { resolveDataset } from '../portal/mapping';
import { parseBlockNumber, parseLogFilter, parseTransactionIndex, assertArray, assertObject } from './validation';
import {
  allBlockFieldsSelection,
  allLogFieldsSelection,
  allTraceFieldsSelection,
  allTransactionFieldsSelection,
  txHashOnlyFieldsSelection
} from '../portal/types';
import { convertBlockToRpc, convertLogToRpc, convertTraceToRpc, convertTxToRpc } from './conversion';
import { RpcError, invalidParams, rangeTooLargeError, serverError } from '../errors';
import { UpstreamRpcClient } from './upstream';
import { fetchUncles } from './uncles';

// ---- Contexts ----

export interface SplitContext {
  config: Config;
  portal: PortalClient;
  chainId: number;
  traceparent?: string;
  requestId: string;
  logger?: {
    debug?: (obj: Record<string, unknown>, msg: string) => void;
    warn?: (obj: Record<string, unknown>, msg: string) => void;
  };
}

export interface ExecuteContext extends SplitContext {
  upstream?: UpstreamRpcClient;
  recordPortalHeaders?: (headers: PortalStreamHeaders) => void;
}

// ---- Sub-batch types ----

export interface CoalescedResponse {
  response: JsonRpcResponse;
  httpStatus: number;
  durationMs: number;
}

export interface ResolvedSubBatch {
  kind: 'resolved';
  index: number;
  response: CoalescedResponse;
}

export interface IndividualSubBatch {
  kind: 'individual';
  index: number;
  item: ParsedJsonRpcItem;
}

export interface BlockSubBatch {
  kind: 'blocks';
  items: Array<{ index: number; request: JsonRpcRequest; blockNumber: number; fullTx: boolean }>;
  useFinalized: boolean;
  fromBlock: number;
  toBlock: number;
  fullTx: boolean;
}

export interface TxByIndexSubBatch {
  kind: 'tx_by_index';
  items: Array<{ index: number; request: JsonRpcRequest; blockNumber: number; txIndex: number }>;
  useFinalized: boolean;
  fromBlock: number;
  toBlock: number;
}

export interface TraceSubBatch {
  kind: 'traces';
  items: Array<{ index: number; request: JsonRpcRequest; blockNumber: number }>;
  useFinalized: boolean;
  fromBlock: number;
  toBlock: number;
}

export interface LogsSubBatch {
  kind: 'logs';
  index: number;
  request: JsonRpcRequest;
  useFinalized: boolean;
  fromBlock: number;
  toBlock: number;
  logFilter: {
    address?: string[];
    topic0?: string[];
    topic1?: string[];
    topic2?: string[];
    topic3?: string[];
  };
}

export type PortalSubBatch = BlockSubBatch | TxByIndexSubBatch | TraceSubBatch | LogsSubBatch;
export type SubBatch = ResolvedSubBatch | IndividualSubBatch | PortalSubBatch;

// ---- splitBatchRequests ----

export async function splitBatchRequests(
  items: ParsedJsonRpcItem[],
  ctx: SplitContext
): Promise<SubBatch[]> {
  const dataset = resolveDataset(ctx.chainId, ctx.config);
  if (!dataset) {
    return items.map((item, index) => ({ kind: 'individual' as const, index, item }));
  }
  const baseUrl = ctx.portal.buildDatasetBaseUrl(dataset);

  let startBlock: number | undefined;
  try {
    const metadata = await ctx.portal.getMetadata(baseUrl, ctx.traceparent, ctx.requestId);
    startBlock = typeof metadata.start_block === 'number' ? metadata.start_block : undefined;
  } catch (err) {
    ctx.logger?.warn?.({ chainId: ctx.chainId, error: String(err) }, 'batch split skipped (metadata)');
    return items.map((item, index) => ({ kind: 'individual' as const, index, item }));
  }

  const tagCache = new Map<string, { number: number; useFinalized: boolean }>();
  const subBatches: SubBatch[] = [];
  let currentPortal: PortalSubBatch | null = null;

  function flush() {
    if (currentPortal) {
      subBatches.push(currentPortal);
      currentPortal = null;
    }
  }

  function pushResolved(index: number, response: CoalescedResponse) {
    flush();
    subBatches.push({ kind: 'resolved', index, response });
  }

  function pushIndividual(index: number, item: ParsedJsonRpcItem) {
    flush();
    subBatches.push({ kind: 'individual', index, item });
  }

  function pushError(index: number, request: JsonRpcRequest, err: RpcError) {
    pushResolved(index, {
      response: errorResponse(responseId(request), err),
      httpStatus: err.httpStatus,
      durationMs: 0
    });
  }

  for (const [index, item] of items.entries()) {
    if (item.error) {
      pushResolved(index, { response: item.error, httpStatus: 400, durationMs: 0 });
      continue;
    }

    const request = item.request!;

    switch (request.method) {
      case 'eth_getBlockByNumber': {
        if (!Array.isArray(request.params)) {
          pushError(index, request, invalidParams('invalid params for eth_getBlockByNumber'));
          continue;
        }
        if (request.params.length < 1) {
          pushError(index, request, invalidParams('invalid params'));
          continue;
        }
        if (request.params[0] === 'pending') {
          pushIndividual(index, item);
          continue;
        }
        let fullTx = false;
        if (request.params.length > 1) {
          if (typeof request.params[1] !== 'boolean') {
            pushError(index, request, invalidParams('invalid params'));
            continue;
          }
          fullTx = request.params[1];
        }
        let blockTag: { number: number; useFinalized: boolean };
        try {
          blockTag = await readBlockTag(request.params[0], ctx, baseUrl, tagCache);
        } catch (err) {
          const rpcError = err instanceof RpcError ? err : invalidParams('invalid block number');
          pushError(index, request, rpcError);
          continue;
        }

        if (
          currentPortal &&
          currentPortal.kind === 'blocks' &&
          currentPortal.fullTx === fullTx &&
          currentPortal.useFinalized === blockTag.useFinalized &&
          blockTag.number === currentPortal.toBlock + 1
        ) {
          currentPortal.items.push({ index, request, blockNumber: blockTag.number, fullTx });
          currentPortal.toBlock = blockTag.number;
        } else {
          flush();
          currentPortal = {
            kind: 'blocks',
            items: [{ index, request, blockNumber: blockTag.number, fullTx }],
            useFinalized: blockTag.useFinalized,
            fromBlock: blockTag.number,
            toBlock: blockTag.number,
            fullTx
          };
        }
        continue;
      }

      case 'eth_getTransactionByBlockNumberAndIndex': {
        if (!Array.isArray(request.params)) {
          pushError(index, request, invalidParams('invalid params for eth_getTransactionByBlockNumberAndIndex'));
          continue;
        }
        if (request.params.length < 2) {
          pushError(index, request, invalidParams('invalid params'));
          continue;
        }
        if (request.params[0] === 'pending') {
          pushIndividual(index, item);
          continue;
        }
        let blockTag: { number: number; useFinalized: boolean };
        try {
          blockTag = await readBlockTag(request.params[0], ctx, baseUrl, tagCache);
        } catch (err) {
          const rpcError = err instanceof RpcError ? err : invalidParams('invalid block number');
          pushError(index, request, rpcError);
          continue;
        }
        if (startBlock !== undefined && blockTag.number < startBlock) {
          pushResolved(index, { response: successResponse(responseId(request), null), httpStatus: 200, durationMs: 0 });
          continue;
        }
        let txIndex: number;
        try {
          txIndex = parseTransactionIndex(request.params[1]);
        } catch {
          pushError(index, request, invalidParams('invalid transaction index'));
          continue;
        }
        if (
          currentPortal &&
          currentPortal.kind === 'tx_by_index' &&
          currentPortal.useFinalized === blockTag.useFinalized &&
          blockTag.number === currentPortal.toBlock + 1
        ) {
          currentPortal.items.push({ index, request, blockNumber: blockTag.number, txIndex });
          currentPortal.toBlock = blockTag.number;
        } else {
          flush();
          currentPortal = {
            kind: 'tx_by_index',
            items: [{ index, request, blockNumber: blockTag.number, txIndex }],
            useFinalized: blockTag.useFinalized,
            fromBlock: blockTag.number,
            toBlock: blockTag.number
          };
        }
        continue;
      }

      case 'trace_block': {
        if (!Array.isArray(request.params)) {
          pushError(index, request, invalidParams('invalid params for trace_block'));
          continue;
        }
        if (request.params.length < 1) {
          pushError(index, request, invalidParams('invalid params'));
          continue;
        }
        if (request.params[0] === 'pending') {
          pushIndividual(index, item);
          continue;
        }
        if (isHashParam(request.params[0])) {
          pushIndividual(index, item);
          continue;
        }
        let blockTag: { number: number; useFinalized: boolean };
        try {
          blockTag = await readBlockTag(request.params[0], ctx, baseUrl, tagCache);
        } catch (err) {
          const rpcError = err instanceof RpcError ? err : invalidParams('invalid block number');
          pushError(index, request, rpcError);
          continue;
        }
        if (startBlock !== undefined && blockTag.number < startBlock) {
          pushResolved(index, { response: successResponse(responseId(request), []), httpStatus: 200, durationMs: 0 });
          continue;
        }
        if (
          currentPortal &&
          currentPortal.kind === 'traces' &&
          currentPortal.useFinalized === blockTag.useFinalized &&
          blockTag.number === currentPortal.toBlock + 1
        ) {
          currentPortal.items.push({ index, request, blockNumber: blockTag.number });
          currentPortal.toBlock = blockTag.number;
        } else {
          flush();
          currentPortal = {
            kind: 'traces',
            items: [{ index, request, blockNumber: blockTag.number }],
            useFinalized: blockTag.useFinalized,
            fromBlock: blockTag.number,
            toBlock: blockTag.number
          };
        }
        continue;
      }

      case 'eth_getLogs': {
        try {
          assertArray(request.params, 'invalid params for eth_getLogs');
          if (request.params.length < 1) {
            throw invalidParams('invalid params');
          }
          assertObject(request.params[0], 'invalid filter object');
        } catch (err) {
          const rpcError = err instanceof RpcError ? err : invalidParams('invalid params');
          pushError(index, request, rpcError);
          continue;
        }

        let parsed: Awaited<ReturnType<typeof parseLogFilter>>;
        try {
          parsed = await parseLogFilter(ctx.portal, baseUrl, request.params[0] as Record<string, unknown>, ctx.config, ctx.traceparent, ctx.requestId);
        } catch (err) {
          const rpcError = err instanceof RpcError ? err : invalidParams('invalid params');
          pushError(index, request, rpcError);
          continue;
        }

        if ('blockHash' in parsed) {
          pushIndividual(index, item);
          continue;
        }

        let { fromBlock } = parsed;
        const { toBlock, useFinalized, logFilter } = parsed;
        if (startBlock !== undefined) {
          if (toBlock < startBlock) {
            pushResolved(index, { response: successResponse(responseId(request), []), httpStatus: 200, durationMs: 0 });
            continue;
          }
          if (fromBlock < startBlock) {
            fromBlock = startBlock;
          }
        }

        const range = toBlock - fromBlock + 1;
        if (range > ctx.config.maxLogBlockRange) {
          pushError(index, request, rangeTooLargeError(ctx.config.maxLogBlockRange));
          continue;
        }

        flush();
        subBatches.push({
          kind: 'logs',
          index,
          request,
          useFinalized,
          fromBlock,
          toBlock,
          logFilter
        });
        continue;
      }

      default: {
        pushIndividual(index, item);
        continue;
      }
    }
  }

  flush();
  return subBatches;
}

// ---- executePortalSubBatch ----

export async function executePortalSubBatch(
  batch: PortalSubBatch,
  ctx: ExecuteContext
): Promise<Map<number, CoalescedResponse>> {
  const results = new Map<number, CoalescedResponse>();
  const dataset = resolveDataset(ctx.chainId, ctx.config);
  if (!dataset) {
    return setStreamError(batch, results, 'dataset not found');
  }
  const baseUrl = ctx.portal.buildDatasetBaseUrl(dataset);

  switch (batch.kind) {
    case 'blocks':
      await executeBlockSubBatch(batch, ctx, baseUrl, results);
      break;
    case 'tx_by_index':
      await executeTxByIndexSubBatch(batch, ctx, baseUrl, results);
      break;
    case 'traces':
      await executeTraceSubBatch(batch, ctx, baseUrl, results);
      break;
    case 'logs':
      await executeLogsSubBatch(batch, ctx, baseUrl, results);
      break;
  }

  return results;
}

// ---- Block execution ----

async function executeBlockSubBatch(
  batch: BlockSubBatch,
  ctx: ExecuteContext,
  baseUrl: string,
  results: Map<number, CoalescedResponse>
): Promise<void> {
  const portalReq = {
    type: 'evm' as const,
    fromBlock: batch.fromBlock,
    toBlock: batch.toBlock,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: allBlockFieldsSelection(),
      transaction: batch.fullTx ? allTransactionFieldsSelection() : txHashOnlyFieldsSelection()
    },
    transactions: [{}]
  };

  let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
  const started = performance.now();

  ctx.logger?.debug?.({ fromBlock: batch.fromBlock, toBlock: batch.toBlock }, 'streaming blocks for batch');

  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl, batch.useFinalized, portalReq,
      ctx.traceparent, ctx.recordPortalHeaders, ctx.requestId
    );
  } catch (err) {
    setStreamError(batch, results, String(err));
    return;
  }

  const durationMs = performance.now() - started;
  const byNumber = new Map<number, (typeof blocks)[number]>();
  for (const block of blocks) {
    byNumber.set(block.header.number, block);
  }

  for (const item of batch.items) {
    const block = byNumber.get(item.blockNumber);
    if (!block) {
      results.set(item.index, {
        response: successResponse(responseId(item.request), null),
        httpStatus: 200,
        durationMs
      });
      continue;
    }

    // const uncles = await fetchUncles(
    //   { config: ctx.config, upstream: ctx.upstream, chainId: ctx.chainId, traceparent: ctx.traceparent, requestId: ctx.requestId, logger: ctx.logger },
    //   item.blockNumber
    // );
    const result = convertBlockToRpc(block, item.fullTx, []);
    results.set(item.index, {
      response: successResponse(responseId(item.request), result),
      httpStatus: 200,
      durationMs
    });
  }
}

// ---- TxByIndex execution ----

async function executeTxByIndexSubBatch(
  batch: TxByIndexSubBatch,
  ctx: ExecuteContext,
  baseUrl: string,
  results: Map<number, CoalescedResponse>
): Promise<void> {
  const portalReq = {
    type: 'evm' as const,
    fromBlock: batch.fromBlock,
    toBlock: batch.toBlock,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: { number: true, hash: true, parentHash: true, timestamp: true },
      transaction: allTransactionFieldsSelection()
    },
    transactions: [{}]
  };

  let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
  const started = performance.now();

  ctx.logger?.debug?.({ fromBlock: batch.fromBlock, toBlock: batch.toBlock }, 'streaming blocks for tx-by-index batch');

  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl, batch.useFinalized, portalReq,
      ctx.traceparent, ctx.recordPortalHeaders, ctx.requestId
    );
  } catch (err) {
    setStreamError(batch, results, String(err));
    return;
  }

  const durationMs = performance.now() - started;
  const byNumber = new Map<number, (typeof blocks)[number]>();
  for (const block of blocks) {
    byNumber.set(block.header.number, block);
  }

  for (const item of batch.items) {
    const block = byNumber.get(item.blockNumber);
    if (!block) {
      results.set(item.index, {
        response: successResponse(responseId(item.request), null),
        httpStatus: 200,
        durationMs
      });
      continue;
    }
    const txResult = findTransactionByIndex(block, item.txIndex);
    results.set(item.index, {
      response: successResponse(responseId(item.request), txResult),
      httpStatus: 200,
      durationMs
    });
  }
}

// ---- Trace execution ----

async function executeTraceSubBatch(
  batch: TraceSubBatch,
  ctx: ExecuteContext,
  baseUrl: string,
  results: Map<number, CoalescedResponse>
): Promise<void> {
  const portalReq = {
    type: 'evm' as const,
    fromBlock: batch.fromBlock,
    toBlock: batch.toBlock,
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
  const started = performance.now();

  ctx.logger?.debug?.({ fromBlock: batch.fromBlock, toBlock: batch.toBlock }, 'streaming blocks for trace batch');

  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl, batch.useFinalized, portalReq,
      ctx.traceparent, ctx.recordPortalHeaders, ctx.requestId
    );
  } catch (err) {
    setStreamError(batch, results, String(err));
    return;
  }

  const durationMs = performance.now() - started;
  const byNumber = new Map<number, (typeof blocks)[number]>();
  for (const block of blocks) {
    byNumber.set(block.header.number, block);
  }

  for (const item of batch.items) {
    const block = byNumber.get(item.blockNumber);
    if (!block) {
      results.set(item.index, {
        response: successResponse(responseId(item.request), []),
        httpStatus: 200,
        durationMs
      });
      continue;
    }
    const txHashByIndex: Record<number, string> = {};
    for (const tx of block.transactions || []) {
      txHashByIndex[tx.transactionIndex] = tx.hash;
    }
    const traces = (block.traces || []).map((trace) => convertTraceToRpc(trace, block.header, txHashByIndex));
    results.set(item.index, {
      response: successResponse(responseId(item.request), traces),
      httpStatus: 200,
      durationMs
    });
  }
}

// ---- Logs execution ----

async function executeLogsSubBatch(
  batch: LogsSubBatch,
  ctx: ExecuteContext,
  baseUrl: string,
  results: Map<number, CoalescedResponse>
): Promise<void> {
  const portalReq = {
    type: 'evm' as const,
    fromBlock: batch.fromBlock,
    toBlock: batch.toBlock,
    includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
    fields: {
      block: { number: true, hash: true },
      log: allLogFieldsSelection()
    },
    logs: [batch.logFilter]
  };

  let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
  const started = performance.now();

  ctx.logger?.debug?.({ fromBlock: batch.fromBlock, toBlock: batch.toBlock }, 'streaming blocks for logs batch');

  try {
    blocks = await ctx.portal.streamBlocks(
      baseUrl, batch.useFinalized, portalReq,
      ctx.traceparent, ctx.recordPortalHeaders, ctx.requestId
    );
  } catch (err) {
    const rpcError = err instanceof RpcError ? err : serverError('internal error');
    results.set(batch.index, {
      response: errorResponse(responseId(batch.request), rpcError),
      httpStatus: rpcError.httpStatus,
      durationMs: 0
    });
    return;
  }

  const durationMs = performance.now() - started;
  const logs: Record<string, unknown>[] = [];
  for (const block of blocks) {
    for (const log of block.logs || []) {
      logs.push(convertLogToRpc(log, block));
    }
  }
  results.set(batch.index, {
    response: successResponse(responseId(batch.request), logs),
    httpStatus: 200,
    durationMs
  });
}

// ---- Helpers ----

function setStreamError(
  batch: PortalSubBatch,
  results: Map<number, CoalescedResponse>,
  _errorMsg: string
): Map<number, CoalescedResponse> {
  const rpcError = serverError('internal error');
  if (batch.kind === 'logs') {
    results.set(batch.index, {
      response: errorResponse(responseId(batch.request), rpcError),
      httpStatus: rpcError.httpStatus,
      durationMs: 0
    });
  } else {
    for (const item of batch.items) {
      results.set(item.index, {
        response: errorResponse(responseId(item.request), rpcError),
        httpStatus: rpcError.httpStatus,
        durationMs: 0
      });
    }
  }
  return results;
}

async function readBlockTag(
  value: unknown,
  ctx: SplitContext,
  baseUrl: string,
  cache: Map<string, { number: number; useFinalized: boolean }>
): Promise<{ number: number; useFinalized: boolean }> {
  const cacheKey = typeof value === 'string' ? `s:${value}` : `n:${value}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const blockTag = await parseBlockNumber(ctx.portal, baseUrl, value, ctx.config, ctx.traceparent, ctx.requestId);
  cache.set(cacheKey, blockTag);
  return blockTag;
}

function findTransactionByIndex(
  block: Awaited<ReturnType<PortalClient['streamBlocks']>>[number],
  txIndex: number
): Record<string, unknown> | null {
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

function isHashParam(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}
