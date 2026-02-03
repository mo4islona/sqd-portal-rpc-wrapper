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
import { parseBlockNumber, parseTransactionIndex } from './validation';
import {
  allBlockFieldsSelection,
  allTraceFieldsSelection,
  allTransactionFieldsSelection,
  txHashOnlyFieldsSelection
} from '../portal/types';
import { convertBlockToRpc, convertTraceToRpc, convertTxToRpc } from './conversion';
import { RpcError, invalidParams } from '../errors';
import { UpstreamRpcClient } from './upstream';
import { fetchUncles } from './uncles';

export interface CoalesceContext {
  config: Config;
  portal: PortalClient;
  upstream?: UpstreamRpcClient;
  chainId: number;
  traceparent?: string;
  requestId: string;
  recordPortalHeaders?: (headers: PortalStreamHeaders) => void;
  logger?: {
    debug?: (obj: Record<string, unknown>, msg: string) => void;
    warn?: (obj: Record<string, unknown>, msg: string) => void
  };
}

export interface CoalescedResponse {
  response: JsonRpcResponse;
  httpStatus: number;
  durationMs: number;
}

interface BlockRequest {
  index: number;
  request: JsonRpcRequest;
  blockNumber: number;
  useFinalized: boolean;
  fullTx: boolean;
}

interface TxRequest {
  index: number;
  request: JsonRpcRequest;
  blockNumber: number;
  useFinalized: boolean;
  txIndex: number;
}

interface TraceRequest {
  index: number;
  request: JsonRpcRequest;
  blockNumber: number;
  useFinalized: boolean;
}

interface BlockGroup {
  useFinalized: boolean;
  blockNumbers: Set<number>;
  blockRequests: Map<number, BlockRequest[]>;
  txRequests: Map<number, TxRequest[]>;
  hasBlockRequests: boolean;
  needsFullTx: boolean;
}

interface TraceGroup {
  useFinalized: boolean;
  blockNumbers: Set<number>;
  traceRequests: Map<number, TraceRequest[]>;
}

export async function coalesceBatchRequests(
  items: ParsedJsonRpcItem[],
  ctx: CoalesceContext
): Promise<Map<number, CoalescedResponse>> {
  const results = new Map<number, CoalescedResponse>();
  const dataset = resolveDataset(ctx.chainId, ctx.config);
  if (!dataset) {
    return results;
  }
  const baseUrl = ctx.portal.buildDatasetBaseUrl(dataset);
  let startBlock: number | undefined;
  try {
    const metadata = await ctx.portal.getMetadata(baseUrl, ctx.traceparent, ctx.requestId);
    startBlock = typeof metadata.start_block === 'number' ? metadata.start_block : undefined;
  } catch (err) {
    ctx.logger?.warn?.({ chainId: ctx.chainId, error: String(err) }, 'batch coalesce skipped (metadata)');
    return results;
  }

  const tagCache = new Map<string, { number: number; useFinalized: boolean }>();
  const blockGroups = new Map<string, BlockGroup>();
  const traceGroups = new Map<string, TraceGroup>();

  for (const [index, item] of items.entries()) {
    const request = item.request;
    if (!request) {
      continue;
    }
    switch (request.method) {
      case 'eth_getBlockByNumber': {
        if (!Array.isArray(request.params)) {
          const err = invalidParams('invalid params for eth_getBlockByNumber');
          results.set(index, {
            response: errorResponse(responseId(request), err),
            httpStatus: err.httpStatus,
            durationMs: 0
          });
          continue;
        }
        if (request.params.length < 1) {
          const err = invalidParams('invalid params');
          results.set(index, {
            response: errorResponse(responseId(request), err),
            httpStatus: err.httpStatus,
            durationMs: 0
          });
          continue;
        }
        if (request.params[0] === 'pending') {
          continue;
        }
        let fullTx = false;
        if (request.params.length > 1) {
          if (typeof request.params[1] !== 'boolean') {
            const err = invalidParams('invalid params');
            results.set(index, {
              response: errorResponse(responseId(request), err),
              httpStatus: err.httpStatus,
              durationMs: 0
            });
            continue;
          }
          fullTx = request.params[1];
        }
        const blockTag = await readBlockTag(request.params[0], ctx, baseUrl, tagCache, results, index, request);
        if (!blockTag) {
          continue;
        }
        if (startBlock !== undefined && blockTag.number < startBlock) {
          results.set(index, { response: successResponse(responseId(request), null), httpStatus: 200, durationMs: 0 });
          continue;
        }
        const group = ensureBlockGroup(blockGroups, blockTag.useFinalized);
        group.hasBlockRequests = true;
        group.needsFullTx = group.needsFullTx || fullTx;
        group.blockNumbers.add(blockTag.number);
        const list = group.blockRequests.get(blockTag.number) ?? [];
        list.push({ index, request, blockNumber: blockTag.number, useFinalized: blockTag.useFinalized, fullTx });
        group.blockRequests.set(blockTag.number, list);
        continue;
      }
      case 'eth_getTransactionByBlockNumberAndIndex': {
        if (!Array.isArray(request.params)) {
          const err = invalidParams('invalid params for eth_getTransactionByBlockNumberAndIndex');
          results.set(index, {
            response: errorResponse(responseId(request), err),
            httpStatus: err.httpStatus,
            durationMs: 0
          });
          continue;
        }
        if (request.params.length < 2) {
          const err = invalidParams('invalid params');
          results.set(index, {
            response: errorResponse(responseId(request), err),
            httpStatus: err.httpStatus,
            durationMs: 0
          });
          continue;
        }
        if (request.params[0] === 'pending') {
          continue;
        }
        const blockTag = await readBlockTag(request.params[0], ctx, baseUrl, tagCache, results, index, request);
        if (!blockTag) {
          continue;
        }
        if (startBlock !== undefined && blockTag.number < startBlock) {
          results.set(index, { response: successResponse(responseId(request), null), httpStatus: 200, durationMs: 0 });
          continue;
        }
        let txIndex: number;
        try {
          txIndex = parseTransactionIndex(request.params[1]);
        } catch {
          const rpcError = invalidParams('invalid transaction index');
          results.set(index, {
            response: errorResponse(responseId(request), rpcError),
            httpStatus: rpcError.httpStatus,
            durationMs: 0
          });
          continue;
        }
        const group = ensureBlockGroup(blockGroups, blockTag.useFinalized);
        group.needsFullTx = true;
        group.blockNumbers.add(blockTag.number);
        const list = group.txRequests.get(blockTag.number) ?? [];
        list.push({ index, request, blockNumber: blockTag.number, useFinalized: blockTag.useFinalized, txIndex });
        group.txRequests.set(blockTag.number, list);
        continue;
      }
      case 'trace_block': {
        if (!Array.isArray(request.params)) {
          const err = invalidParams('invalid params for trace_block');
          results.set(index, {
            response: errorResponse(responseId(request), err),
            httpStatus: err.httpStatus,
            durationMs: 0
          });
          continue;
        }
        if (request.params.length < 1) {
          const err = invalidParams('invalid params');
          results.set(index, {
            response: errorResponse(responseId(request), err),
            httpStatus: err.httpStatus,
            durationMs: 0
          });
          continue;
        }
        if (request.params[0] === 'pending') {
          continue;
        }
        if (isHashParam(request.params[0])) {
          continue;
        }
        const blockTag = await readBlockTag(request.params[0], ctx, baseUrl, tagCache, results, index, request);
        if (!blockTag) {
          continue;
        }
        if (startBlock !== undefined && blockTag.number < startBlock) {
          results.set(index, { response: successResponse(responseId(request), []), httpStatus: 200, durationMs: 0 });
          continue;
        }
        const group = ensureTraceGroup(traceGroups, blockTag.useFinalized);
        group.blockNumbers.add(blockTag.number);
        const list = group.traceRequests.get(blockTag.number) ?? [];
        list.push({ index, request, blockNumber: blockTag.number, useFinalized: blockTag.useFinalized });
        group.traceRequests.set(blockTag.number, list);
        continue;
      }
      default:
        break;
    }
  }

  await coalesceBlockGroups(blockGroups, ctx, baseUrl, results);
  await coalesceTraceGroups(traceGroups, ctx, baseUrl, results);

  return results;
}

async function readBlockTag(
  value: unknown,
  ctx: CoalesceContext,
  baseUrl: string,
  cache: Map<string, { number: number; useFinalized: boolean }>,
  results: Map<number, CoalescedResponse>,
  index: number,
  request: JsonRpcRequest
): Promise<{ number: number; useFinalized: boolean } | undefined> {
  const cacheKey = typeof value === 'string' ? `s:${value}` : `n:${value}`;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const blockTag = await parseBlockNumber(ctx.portal, baseUrl, value, ctx.config, ctx.traceparent, ctx.requestId);
    cache.set(cacheKey, blockTag);
    return blockTag;
  } catch (err) {
    const rpcError = err instanceof RpcError ? err : invalidParams('invalid block number');
    results.set(index, {
      response: errorResponse(responseId(request), rpcError),
      httpStatus: rpcError.httpStatus,
      durationMs: 0
    });
    return undefined;
  }
}

function ensureBlockGroup(groups: Map<string, BlockGroup>, useFinalized: boolean): BlockGroup {
  const key = useFinalized ? 'finalized' : 'head';
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }
  const group: BlockGroup = {
    useFinalized,
    blockNumbers: new Set<number>(),
    blockRequests: new Map<number, BlockRequest[]>(),
    txRequests: new Map<number, TxRequest[]>(),
    hasBlockRequests: false,
    needsFullTx: false
  };
  groups.set(key, group);
  return group;
}

function ensureTraceGroup(groups: Map<string, TraceGroup>, useFinalized: boolean): TraceGroup {
  const key = useFinalized ? 'finalized' : 'head';
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }
  const group: TraceGroup = {
    useFinalized,
    blockNumbers: new Set<number>(),
    traceRequests: new Map<number, TraceRequest[]>()
  };
  groups.set(key, group);
  return group;
}

async function coalesceBlockGroups(
  groups: Map<string, BlockGroup>,
  ctx: CoalesceContext,
  baseUrl: string,
  results: Map<number, CoalescedResponse>
): Promise<void> {
  for (const group of groups.values()) {
    const segments = buildSegments([...group.blockNumbers]);
    for (const segment of segments) {
      const fromBlock = segment[0];
      const toBlock = segment[segment.length - 1];
      const portalReq = {
        type: 'evm' as const,
        fromBlock,
        toBlock,
        includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
        fields: {
          block: group.hasBlockRequests
            ? allBlockFieldsSelection()
            : { number: true, hash: true, parentHash: true, timestamp: true },
          transaction: group.needsFullTx ? allTransactionFieldsSelection() : txHashOnlyFieldsSelection()
        },
        transactions: [{}]
      };

      let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
      const started = performance.now();

      ctx.logger?.debug?.({ fromBlock, toBlock, request: portalReq }, 'streaming blocks from portal for batch coalescing');

      try {
        blocks = await ctx.portal.streamBlocks(
          baseUrl,
          group.useFinalized,
          portalReq,
          ctx.traceparent,
          ctx.recordPortalHeaders,
          ctx.requestId
        );
      } catch (err) {
        ctx.logger?.warn?.({ error: String(err) }, 'batch coalesce skipped (stream)');
        continue;
      }
      const durationMs = performance.now() - started;
      const byNumber = new Map<number, (typeof blocks)[number]>();
      for (const block of blocks) {
        byNumber.set(block.header.number, block);
      }

      for (const blockNumber of segment) {
        const block = byNumber.get(blockNumber);
        const blockRequests = group.blockRequests.get(blockNumber) ?? [];
        const txRequests = group.txRequests.get(blockNumber) ?? [];
        if (!block) {
          for (const req of blockRequests) {
            results.set(req.index, {
              response: successResponse(responseId(req.request), null),
              httpStatus: 200,
              durationMs
            });
          }
          for (const req of txRequests) {
            results.set(req.index, {
              response: successResponse(responseId(req.request), null),
              httpStatus: 200,
              durationMs
            });
          }
          continue;
        }

        let uncles: string[] | undefined;
        if (blockRequests.length > 0) {
          uncles = await fetchUncles(
            {
              config: ctx.config,
              upstream: ctx.upstream,
              chainId: ctx.chainId,
              traceparent: ctx.traceparent,
              requestId: ctx.requestId,
              logger: ctx.logger
            },
            blockNumber
          );
        }

        for (const req of blockRequests) {
          const result = convertBlockToRpc(block, req.fullTx, uncles);
          results.set(req.index, {
            response: successResponse(responseId(req.request), result),
            httpStatus: 200,
            durationMs
          });
        }

        for (const req of txRequests) {
          const txResult = findTransactionByIndex(block, req.txIndex);
          results.set(req.index, {
            response: successResponse(responseId(req.request), txResult),
            httpStatus: 200,
            durationMs
          });
        }
      }
    }
  }
}

async function coalesceTraceGroups(
  groups: Map<string, TraceGroup>,
  ctx: CoalesceContext,
  baseUrl: string,
  results: Map<number, CoalescedResponse>
): Promise<void> {
  for (const group of groups.values()) {
    const segments = buildSegments([...group.blockNumbers]);
    for (const segment of segments) {
      const fromBlock = segment[0];
      const toBlock = segment[segment.length - 1];
      const portalReq = {
        type: 'evm' as const,
        fromBlock,
        toBlock,
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
      try {
        blocks = await ctx.portal.streamBlocks(
          baseUrl,
          group.useFinalized,
          portalReq,
          ctx.traceparent,
          ctx.recordPortalHeaders,
          ctx.requestId
        );
      } catch (err) {
        ctx.logger?.warn?.({ error: String(err) }, 'batch coalesce skipped (trace stream)');
        continue;
      }
      const durationMs = performance.now() - started;
      const byNumber = new Map<number, (typeof blocks)[number]>();
      for (const block of blocks) {
        byNumber.set(block.header.number, block);
      }

      for (const blockNumber of segment) {
        const block = byNumber.get(blockNumber);
        const traceRequests = group.traceRequests.get(blockNumber)!;
        if (!block) {
          for (const req of traceRequests) {
            results.set(req.index, {
              response: successResponse(responseId(req.request), []),
              httpStatus: 200,
              durationMs
            });
          }
          continue;
        }
        const txHashByIndex: Record<number, string> = {};
        for (const tx of block.transactions || []) {
          txHashByIndex[tx.transactionIndex] = tx.hash;
        }
        const traces = (block.traces || []).map((trace) => convertTraceToRpc(trace, block.header, txHashByIndex));
        for (const req of traceRequests) {
          results.set(req.index, {
            response: successResponse(responseId(req.request), traces),
            httpStatus: 200,
            durationMs
          });
        }
      }
    }
  }
}

function buildSegments(numbers: number[]): number[][] {
  const sorted = numbers.slice().sort((a, b) => a - b);
  const segments: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const value = sorted[i];
    const prev = current[current.length - 1];
    if (value === prev + 1) {
      current.push(value);
    } else {
      segments.push(current);
      current = [value];
    }
  }
  segments.push(current);
  return segments;
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
