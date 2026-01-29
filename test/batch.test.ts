import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { coalesceGetBlockByNumber } from '../src/rpc/batch';
import type { ParsedJsonRpcItem } from '../src/jsonrpc';
import type { PortalClient } from '../src/portal/client';

const baseHeader = (number: number) => ({
  number,
  hash: `0x${String(number).padStart(64, '0')}`,
  parentHash: '0x' + '22'.repeat(32),
  timestamp: 1000,
  miner: '0x' + '33'.repeat(20),
  gasUsed: 21000,
  gasLimit: 30_000_000,
  nonce: 1,
  difficulty: 1,
  totalDifficulty: 1,
  size: 500,
  stateRoot: '0x' + '44'.repeat(32),
  transactionsRoot: '0x' + '55'.repeat(32),
  receiptsRoot: '0x' + '66'.repeat(32),
  logsBloom: '0x' + '00'.repeat(256),
  extraData: '0x',
  mixHash: '0x' + '77'.repeat(32),
  sha3Uncles: '0x' + '88'.repeat(32)
});

const makeBlock = (number: number, fullTx = false) => ({
  header: baseHeader(number),
  transactions: fullTx
    ? [
        {
          transactionIndex: 0,
          hash: `0xtx${number}`,
          from: '0x' + '99'.repeat(20),
          to: '0x' + 'aa'.repeat(20),
          value: 1,
          input: '0x',
          nonce: 1,
          gas: 21_000,
          type: 0
        }
      ]
    : [{ hash: `0xtx${number}`, transactionIndex: 0 }]
});

function makePortal(overrides: Record<string, unknown> = {}): PortalClient {
  return {
    buildDatasetBaseUrl: () => 'http://portal',
    getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 0 }),
    streamBlocks: async () => [],
    fetchHead: async () => ({ head: { number: 5, hash: '0x' + '11'.repeat(32) }, finalizedAvailable: true }),
    ...overrides
  } as unknown as PortalClient;
}

describe('coalesceGetBlockByNumber', () => {
  it('returns empty when dataset is unresolved', async () => {
    const config = loadConfig({ SERVICE_MODE: 'multi', PORTAL_USE_DEFAULT_DATASETS: 'false' });
    const results = await coalesceGetBlockByNumber([], {
      config,
      portal: {} as PortalClient,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.size).toBe(0);
  });

  it('skips coalescing on metadata error', async () => {
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
    const results = await coalesceGetBlockByNumber(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(results.size).toBe(0);
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
    const results = await coalesceGetBlockByNumber(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid params for eth_getBlockByNumber');
    expect(results.get(1)?.response.error?.message).toBe('invalid params');
    expect(results.has(2)).toBe(false);
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
    const results = await coalesceGetBlockByNumber(items, {
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
    const results = await coalesceGetBlockByNumber(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.error?.message).toBe('invalid block number');
  });

  it('returns null below start_block and handles stream errors', async () => {
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
    const results = await coalesceGetBlockByNumber(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req',
      logger: { warn }
    });
    expect(results.get(0)?.response.result).toBeNull();
    expect(results.has(1)).toBe(false);
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
    const results = await coalesceGetBlockByNumber(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(results.get(0)?.response.result).toBeNull();
  });

  it('coalesces contiguous blocks, caches tags, and fills missing block with null', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchHead = vi.fn(async () => ({
      head: { number: 5, hash: '0x' + '11'.repeat(32) },
      finalizedAvailable: true
    }));
    const streamBlocks = vi.fn(async (_base: string, useFinalized: boolean, req: { fromBlock: number; toBlock: number }) => {
      if (useFinalized) {
        return [makeBlock(req.fromBlock, true)];
      }
      return [makeBlock(5)];
    });
    const portal = makePortal({ fetchHead, streamBlocks });
    const items: ParsedJsonRpcItem[] = [
      { request: { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] } },
      { request: { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['latest', false] } },
      { request: { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: [6, false] } },
      { request: { jsonrpc: '2.0', id: 4, method: 'eth_getBlockByNumber', params: ['finalized', true] } }
    ];
    const results = await coalesceGetBlockByNumber(items, {
      config,
      portal,
      chainId: 1,
      requestId: 'req'
    });
    expect(fetchHead).toHaveBeenCalledTimes(2);
    expect(results.get(2)?.response.result).toBeNull();
    expect(results.get(3)?.response.result).toBeTruthy();
  });
});
