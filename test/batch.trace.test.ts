import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import type { ParsedJsonRpcItem } from '../src/jsonrpc';
import { baseHeader, makePortal, makeTraceBlock, splitAndExecute } from './batch.helpers';

describe('splitBatchRequests + executePortalSubBatch (trace)', () => {
  it('coalesces contiguous trace_block requests', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: req.fromBlock, toBlock: req.toBlock });
        return [makeTraceBlock(5), makeTraceBlock(6)];
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'trace_block', params: ['0x6'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(calls).toEqual([{ fromBlock: 5, toBlock: 6 }]);
    const traces1 = results.get(0)?.response.result as Array<{ type?: string; transactionHash?: string }>;
    const traces2 = results.get(1)?.response.result as Array<{ type?: string; transactionHash?: string }>;
    expect(traces1[0]?.type).toBe('call');
    expect(traces1[0]?.transactionHash).toBe('0xtx5');
    expect(traces2[0]?.type).toBe('call');
    expect(traces2[0]?.transactionHash).toBe('0xtx6');
  });

  it('coalesces trace_block finalized', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      fetchHead: async () => ({
        head: { number: 5, hash: '0x' + '11'.repeat(32) },
        finalizedAvailable: true
      }),
      streamBlocks: async (_base: string, finalized: boolean) => {
        expect(finalized).toBe(true);
        return [makeTraceBlock(5)];
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['finalized'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    const traces = results.get(0)?.response.result as Array<{ type?: string }>;
    expect(traces[0]?.type).toBe('call');
  });

  it('returns error for trace_block invalid block', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0xzz'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('returns error for trace_block non-array params', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: { bad: true } } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params for trace_block');
  });

  it('returns error for trace_block empty params', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: [] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params');
  });

  it('returns empty traces below start_block', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 10 })
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    const traces = results.get(0)?.response.result as unknown[];
    expect(traces).toEqual([]);
  });

  it('sends pending trace_block to individual handling', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['pending'] } }
    ];
    const { subBatches } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(subBatches).toHaveLength(1);
    expect(subBatches[0].kind).toBe('individual');
  });

  it('sends trace_block with blockHash to individual handling', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      {
        request: {
          jsonrpc: '2.0',
          id: 1,
          method: 'trace_block',
          params: ['0x' + '11'.repeat(32)]
        }
      }
    ];
    const { subBatches } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(subBatches).toHaveLength(1);
    expect(subBatches[0].kind).toBe('individual');
  });

  it('returns empty trace list when stream is missing block', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      streamBlocks: async () => []
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    const traces = results.get(0)?.response.result as unknown[];
    expect(traces).toEqual([]);
  });

  it('returns empty trace list when block has no traces', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      streamBlocks: async () => [{ header: baseHeader(5) }]
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    const traces = results.get(0)?.response.result as unknown[];
    expect(traces).toEqual([]);
  });

  it('returns error for all items when trace stream fails', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const portal = makePortal({
      streamBlocks: async () => {
        throw new Error('trace down');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(results.size).toBe(1);
    expect(results.get(0)?.response.error?.code).toBe(-32603);
    expect(warn).toHaveBeenCalled();
  });
});
