import { performance } from 'node:perf_hooks';
import { Config } from '../config';
import { PortalClient, PortalStreamHeaders } from '../portal/client';
import { ParsedJsonRpcItem, JsonRpcResponse, JsonRpcRequest, responseId, successResponse, errorResponse } from '../jsonrpc';
import { resolveDataset } from '../portal/mapping';
import { parseBlockNumber } from './validation';
import { allBlockFieldsSelection, allTransactionFieldsSelection, txHashOnlyFieldsSelection } from '../portal/types';
import { convertBlockToRpc } from './conversion';
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
  logger?: { warn?: (obj: Record<string, unknown>, msg: string) => void };
}

export interface CoalescedResponse {
  response: JsonRpcResponse;
  httpStatus: number;
  durationMs: number;
}

interface BlockCandidate {
  index: number;
  request: JsonRpcRequest;
  blockNumber: number;
  useFinalized: boolean;
  fullTx: boolean;
}

export async function coalesceGetBlockByNumber(
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
  const groups = new Map<string, BlockCandidate[]>();

  for (const [index, item] of items.entries()) {
    const request = item.request;
    if (!request || request.method !== 'eth_getBlockByNumber') {
      continue;
    }
    if (!Array.isArray(request.params)) {
      const err = invalidParams('invalid params for eth_getBlockByNumber');
      results.set(index, { response: errorResponse(responseId(request), err), httpStatus: err.httpStatus, durationMs: 0 });
      continue;
    }
    if (request.params.length < 1) {
      const err = invalidParams('invalid params');
      results.set(index, { response: errorResponse(responseId(request), err), httpStatus: err.httpStatus, durationMs: 0 });
      continue;
    }
    if (request.params[0] === 'pending') {
      continue;
    }

    let fullTx = false;
    if (request.params.length > 1) {
      if (typeof request.params[1] !== 'boolean') {
        const err = invalidParams('invalid params');
        results.set(index, { response: errorResponse(responseId(request), err), httpStatus: err.httpStatus, durationMs: 0 });
        continue;
      }
      fullTx = request.params[1];
    }

    let blockTag: { number: number; useFinalized: boolean };
    const cacheKey = typeof request.params[0] === 'string' ? `s:${request.params[0]}` : `n:${request.params[0]}`;
    try {
      const cached = tagCache.get(cacheKey);
      if (cached) {
        blockTag = cached;
      } else {
        blockTag = await parseBlockNumber(ctx.portal, baseUrl, request.params[0], ctx.config, ctx.traceparent, ctx.requestId);
        tagCache.set(cacheKey, blockTag);
      }
    } catch (err) {
      const rpcError = err instanceof RpcError ? err : invalidParams('invalid block number');
      results.set(index, { response: errorResponse(responseId(request), rpcError), httpStatus: rpcError.httpStatus, durationMs: 0 });
      continue;
    }

    if (startBlock !== undefined && blockTag.number < startBlock) {
      results.set(index, { response: successResponse(responseId(request), null), httpStatus: 200, durationMs: 0 });
      continue;
    }

    const groupKey = `${blockTag.useFinalized ? 'finalized' : 'head'}:${fullTx ? 'full' : 'hash'}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ index, request, blockNumber: blockTag.number, useFinalized: blockTag.useFinalized, fullTx });
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const unique = new Set(group.map((entry) => entry.blockNumber));
    const numbers = [...unique];
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    if (max - min + 1 !== unique.size) {
      continue;
    }
    const { fullTx, useFinalized } = group[0];
    const portalReq = {
      type: 'evm' as const,
      fromBlock: min,
      toBlock: max,
      includeAllBlocks: ctx.config.portalIncludeAllBlocks || undefined,
      fields: {
        block: allBlockFieldsSelection(),
        transaction: fullTx ? allTransactionFieldsSelection() : txHashOnlyFieldsSelection()
      },
      transactions: [{}]
    };

    let blocks: Awaited<ReturnType<PortalClient['streamBlocks']>>;
    const started = performance.now();
    try {
      blocks = await ctx.portal.streamBlocks(
        baseUrl,
        useFinalized,
        portalReq,
        ctx.traceparent,
        ctx.recordPortalHeaders,
        ctx.requestId
      );
    } catch (err) {
      ctx.logger?.warn?.({ error: String(err) }, 'batch coalesce skipped (stream)');
      continue;
    }

    const byNumber = new Map<number, (typeof blocks)[number]>();
    for (const block of blocks) {
      byNumber.set(block.header.number, block);
    }

    const durationMs = performance.now() - started;
    for (const entry of group) {
      const block = byNumber.get(entry.blockNumber);
      if (!block) {
        results.set(entry.index, { response: successResponse(responseId(entry.request), null), httpStatus: 200, durationMs });
        continue;
      }
      const uncles = await fetchUncles(
        {
          config: ctx.config,
          upstream: ctx.upstream,
          chainId: ctx.chainId,
          traceparent: ctx.traceparent,
          requestId: ctx.requestId,
          logger: ctx.logger
        },
        entry.blockNumber
      );
      const result = convertBlockToRpc(block, entry.fullTx, uncles);
      results.set(entry.index, { response: successResponse(responseId(entry.request), result), httpStatus: 200, durationMs });
    }
  }

  return results;
}
