import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { splitBatchRequests } from '../src/rpc/batch';
import type { ParsedJsonRpcItem } from '../src/jsonrpc';
import type { PortalClient } from '../src/portal/client';
import { makeBlock, makePortal, splitAndExecute } from './batch.helpers';

describe('splitBatchRequests + executePortalSubBatch (block)', () => {
  it('returns all items as individual when dataset is unresolved', async () => {
    const config = loadConfig({ SERVICE_MODE: 'multi', PORTAL_USE_DEFAULT_DATASETS: 'false' });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] } }
    ];
    const subBatches = await splitBatchRequests(items, {
      config,
      portal: {} as PortalClient,
      chainId: 1,
      requestId: 'req'
    });
    expect(subBatches).toHaveLength(1);
    expect(subBatches[0].kind).toBe('individual');
  });

  it('returns all items as individual on metadata error', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const portal = makePortal({
      getMetadata: async () => {
        throw new Error('boom');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] } }
    ];
    const subBatches = await splitBatchRequests(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(subBatches).toHaveLength(1);
    expect(subBatches[0].kind).toBe('individual');
    expect(warn).toHaveBeenCalled();
  });

  it('records invalid params and skips pending', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: { bad: true } } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['pending'] } },
      { request: { jsonrpc: '2.0', id: 4, method: 'eth_getBlockByNumber', params: ['0x1', 'nope'] } }
    ];
    const { results, subBatches } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params for eth_getBlockByNumber');
    expect(results.get(1)?.response.error?.message).toBe('invalid params');
    // pending → individual sub-batch (not in results)
    const pendingBatch = subBatches.find((b) => b.kind === 'individual' && b.index === 2);
    expect(pendingBatch).toBeTruthy();
    expect(results.get(3)?.response.error?.message).toBe('invalid params');
  });

  it('returns invalid block error when block tag is malformed', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0xzz', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('returns invalid block error when fetchHead throws non-rpc error', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      fetchHead: async () => {
        throw new Error('boom');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('returns null below start_block and error on stream failure', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const portal = makePortal({
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 10 }),
      streamBlocks: async () => {
        throw new Error('stream down');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0xa', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    // Block 0x5 (5) is below start_block 10 → null
    expect(results.get(0)?.response.result).toBeNull();
    // Block 0xa (10) stream failed → error response
    expect(results.get(1)?.httpStatus).toBe(500);
    expect(results.get(1)?.response.error?.code).toBe(-32603);
    expect(warn).toHaveBeenCalled();
  });

  it('ignores non-numeric start_block metadata', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 'nope' })
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('coalesces contiguous blocks with same params', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: req.fromBlock, toBlock: req.toBlock });
        const blocks = [];
        for (let n = req.fromBlock; n <= req.toBlock; n += 1) {
          blocks.push(makeBlock(n));
        }
        return blocks;
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x6', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(calls).toEqual([{ fromBlock: 5, toBlock: 6 }]);
    expect(results.get(0)?.response.result).toBeTruthy();
    expect(results.get(1)?.response.result).toBeTruthy();
  });

  it('splits non-contiguous blocks into separate sub-batches', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: req.fromBlock, toBlock: req.toBlock });
        const blocks = [];
        for (let n = req.fromBlock; n <= req.toBlock; n += 1) {
          blocks.push(makeBlock(n));
        }
        return blocks;
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x6', false] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['0x8', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(calls).toEqual([
      { fromBlock: 5, toBlock: 6 },
      { fromBlock: 8, toBlock: 8 }
    ]);
    expect(results.get(0)?.response.result).toBeTruthy();
    expect(results.get(1)?.response.result).toBeTruthy();
    expect(results.get(2)?.response.result).toBeTruthy();
  });

  it('splits different fullTx values into separate sub-batches', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fullTx: boolean }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fields: { transaction: Record<string, boolean> } }) => {
        calls.push({ fullTx: Boolean(req.fields.transaction.input) });
        return [makeBlock(5, true)];
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', true] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x5', false] } }
    ];
    const { results, subBatches } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    // Different fullTx → 2 separate sub-batches → 2 stream calls
    const portalBatches = subBatches.filter((b) => b.kind === 'blocks');
    expect(portalBatches).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(results.get(0)?.response.result).toBeTruthy();
    expect(results.get(1)?.response.result).toBeTruthy();
  });

  it('returns error for all items when stream fails', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const portal = makePortal({
      streamBlocks: async () => {
        throw new Error('stream down');
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x6', false] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['0x7', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(results.size).toBe(3);
    for (const [, value] of results) {
      expect(value.response.error?.code).toBe(-32603);
      expect(value.httpStatus).toBe(500);
    }
    expect(warn).toHaveBeenCalled();
  });

  it('caches block tag resolution for latest', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchHead = vi.fn(async () => ({
      head: { number: 5, hash: '0x' + '11'.repeat(32) },
      finalizedAvailable: true
    }));
    const portal = makePortal({
      fetchHead,
      streamBlocks: async () => [makeBlock(5)]
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['latest', false] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    // Both resolve to same block → single sub-batch with one item (same block number)
    expect(fetchHead).toHaveBeenCalledTimes(1);
    expect(results.get(0)?.response.result).toBeTruthy();
    expect(results.get(1)?.response.result).toBeTruthy();
  });
});
