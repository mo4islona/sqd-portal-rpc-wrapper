import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import type { ParsedJsonRpcItem } from '../src/jsonrpc';
import { baseHeader, makeBlock, makePortal, splitAndExecute } from './batch.helpers';

describe('splitBatchRequests + executePortalSubBatch (tx)', () => {
  it('coalesces contiguous tx-by-index requests', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: req.fromBlock, toBlock: req.toBlock });
        return [makeBlock(5, true)];
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(calls).toHaveLength(1);
    const txResult = results.get(0)?.response.result as { hash?: string };
    expect(txResult.hash).toBe('0xtx5');
  });

  it('splits block + tx-by-index into separate sub-batches', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const portal = makePortal({
      streamBlocks: async (_base: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        calls.push({ fromBlock: req.fromBlock, toBlock: req.toBlock });
        return [makeBlock(5, true)];
      }
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
    ];
    const { results, subBatches } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    // Different methods → separate sub-batches → separate stream calls
    const portalBatches = subBatches.filter((b) => b.kind === 'blocks' || b.kind === 'tx_by_index');
    expect(portalBatches).toHaveLength(2);
    expect(calls).toHaveLength(2);
    const blockResult = results.get(0)?.response.result as { transactions?: string[] };
    expect(blockResult.transactions).toEqual(['0xtx5']);
    const txResult = results.get(1)?.response.result as { hash?: string };
    expect(txResult.hash).toBe('0xtx5');
  });

  it('returns null below start_block for tx-by-index', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 10 })
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('returns error for tx-by-index non-array params', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: { bad: true } } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params for eth_getTransactionByBlockNumberAndIndex');
  });

  it('returns error for tx-by-index missing params', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: [] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params');
  });

  it('returns error for invalid transaction index', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', 'nope'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid transaction index');
  });

  it('sends pending tx-by-index to individual handling', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['pending', '0x0'] } }
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

  it('returns error for tx-by-index invalid block tag', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal();
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0xzz', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('falls back to scanning transactions by index', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      streamBlocks: async () => [
        {
          header: baseHeader(5),
          transactions: [
            {
              transactionIndex: 2,
              hash: '0xskip',
              from: '0x' + '11'.repeat(20),
              to: '0x' + '22'.repeat(20),
              value: 1,
              input: '0x',
              nonce: 1,
              gas: 21_000,
              type: 0
            },
            {
              transactionIndex: 0,
              hash: '0xhit',
              from: '0x' + '11'.repeat(20),
              to: '0x' + '22'.repeat(20),
              value: 1,
              input: '0x',
              nonce: 1,
              gas: 21_000,
              type: 0
            }
          ]
        }
      ]
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    const txResult = results.get(0)?.response.result as { hash?: string };
    expect(txResult.hash).toBe('0xhit');
  });

  it('returns null when transaction index is missing', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      streamBlocks: async () => [
        {
          header: baseHeader(5),
          transactions: [
            {
              transactionIndex: 1,
              hash: '0xonly',
              from: '0x' + '11'.repeat(20),
              to: '0x' + '22'.repeat(20),
              value: 1,
              input: '0x',
              nonce: 1,
              gas: 21_000,
              type: 0
            }
          ]
        }
      ]
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('returns null when tx request block is missing', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      streamBlocks: async () => [makeBlock(5, true)]
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x6', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('returns null when tx block has no transactions', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const portal = makePortal({
      streamBlocks: async () => [{ header: baseHeader(5) }]
    });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
    ];
    const { results } = await splitAndExecute(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('returns error for all items when tx-by-index stream fails', async () => {
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
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] } }
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
