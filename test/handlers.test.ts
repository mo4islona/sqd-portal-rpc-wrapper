import { describe, expect, it, vi } from 'vitest';
import { handleJsonRpc } from '../src/rpc/handlers';
import { loadConfig } from '../src/config';
import { conflictError, portalUnsupportedFieldError } from '../src/errors';
import { UpstreamRpcClient } from '../src/rpc/upstream';

const config = loadConfig({
  SERVICE_MODE: 'single',
  PORTAL_DATASET: 'ethereum-mainnet',
  PORTAL_CHAIN_ID: '1'
});

const portal = {
  fetchHead: async () => ({ head: { number: 42, hash: '0xabc' }, finalizedAvailable: false }),
  streamBlocks: async () => [],
  getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 0, real_time: true }),
  buildDatasetBaseUrl: (dataset: string) => `https://portal/${dataset}`
};

const sampleBlock = {
  header: {
    number: 5,
    hash: '0xblock',
    parentHash: '0xparent',
    timestamp: 1,
    miner: '0xminer',
    gasUsed: '0x1',
    gasLimit: '0x2',
    nonce: '0x3',
    difficulty: '0x4',
    totalDifficulty: '0x5',
    size: '0x6',
    stateRoot: '0xstate',
    transactionsRoot: '0xtx',
    receiptsRoot: '0xrec',
    logsBloom: '0xlog',
    extraData: '0xextra',
    mixHash: '0xmix',
    sha3Uncles: '0xuncle'
  },
  transactions: [
    { transactionIndex: 0, hash: '0xtx', from: '0xfrom', to: '0xto', value: '0x1', input: '0x', nonce: '0x1', gas: '0x2', type: '0x0' }
  ],
  logs: [{ logIndex: 0, transactionIndex: 0, transactionHash: '0xtx', address: '0xaddr', data: '0xdata', topics: ['0xtopic'] }],
  traces: [{ transactionIndex: 0, traceAddress: [], type: 'call', subtraces: 0, action: {}, callFrom: '0xfrom', callTo: '0xto', callValue: '0x1', callGas: '0x2' }]
};

const portalWithData = {
  fetchHead: async () => ({ head: { number: 5, hash: '0xabc' }, finalizedAvailable: false }),
  streamBlocks: async () => [sampleBlock],
  getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 0, real_time: true }),
  buildDatasetBaseUrl: (dataset: string) => `https://portal/${dataset}`
};

describe('handlers', () => {
  it('handles eth_chainId', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBe('0x1');
  });

  it('dedupes cached requests', async () => {
    const fetchHead = vi.fn().mockResolvedValue({ head: { number: 7, hash: '0xabc' }, finalizedAvailable: false });
    const portalSpy = {
      ...portal,
      fetchHead
    };
    const cache = new Map<string, Promise<unknown>>();
    await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
      { config, portal: portalSpy as any, chainId: 1, requestId: 'test', requestCache: cache }
    );
    await handleJsonRpc(
      { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
      { config, portal: portalSpy as any, chainId: 1, requestId: 'test', requestCache: cache }
    );
    expect(fetchHead).toHaveBeenCalledTimes(1);
  });

  it('skips cache when params are not serializable', async () => {
    const params: unknown[] = [];
    params.push(params);
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params },
      { config, portal: portal as any, chainId: 1, requestId: 'test', requestCache: new Map() }
    );
    expect(response.result).toBe('0x1');
  });

  it('builds cache key when params are undefined', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId' },
      { config, portal: portal as any, chainId: 1, requestId: 'test', requestCache: new Map() }
    );
    expect(response.result).toBe('0x1');
  });

  it('caches start_block per request', async () => {
    const getMetadata = vi.fn().mockResolvedValue({ dataset: 'ethereum-mainnet', start_block: 0, real_time: true });
    const portalSpy = {
      ...portalWithData,
      getMetadata
    };
    const startBlockCache = new Map<string, Promise<number | undefined>>();
    await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config, portal: portalSpy as any, chainId: 1, requestId: 'test', startBlockCache }
    );
    await handleJsonRpc(
      { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config, portal: portalSpy as any, chainId: 1, requestId: 'test', startBlockCache }
    );
    expect(getMetadata).toHaveBeenCalledTimes(1);
  });

  it('handles missing start_block in metadata cache', async () => {
    const getMetadata = vi.fn().mockResolvedValue({ dataset: 'ethereum-mainnet', real_time: true });
    const portalSpy = {
      ...portalWithData,
      getMetadata
    };
    const startBlockCache = new Map<string, Promise<number | undefined>>();
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config, portal: portalSpy as any, chainId: 1, requestId: 'test', startBlockCache }
    );
    expect(response.result).toBeTruthy();
    expect(getMetadata).toHaveBeenCalledTimes(1);
  });

  it('clears start_block cache on metadata error', async () => {
    const getMetadata = vi.fn().mockRejectedValue(new Error('boom'));
    const baseUrl = 'https://portal/ethereum-mainnet';
    const portalSpy = {
      ...portal,
      getMetadata,
      buildDatasetBaseUrl: () => baseUrl
    };
    const startBlockCache = new Map<string, Promise<number | undefined>>();
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config, portal: portalSpy as any, chainId: 1, requestId: 'test', startBlockCache }
    );
    expect(httpStatus).toBe(502);
    expect(response.error?.code).toBe(-32603);
    expect(startBlockCache.has(baseUrl)).toBe(false);
  });

  it('times out long-running handler', async () => {
    vi.useFakeTimers();
    const portalSlow = {
      ...portal,
      fetchHead: vi.fn().mockImplementation(() => new Promise(() => {}))
    };
    const resultPromise = handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
      { config, portal: portalSlow as any, chainId: 1, requestId: 'test', requestTimeoutMs: 5 }
    );
    await vi.advanceTimersByTimeAsync(5);
    const { response, httpStatus } = await resultPromise;
    expect(httpStatus).toBe(504);
    expect(response.error?.code).toBe(-32000);
    vi.useRealTimers();
  });

  it('skips timeout when disabled', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test', requestTimeoutMs: -1 }
    );
    expect(response.result).toBe('0x1');
  });

  it('handles eth_getBlockByNumber empty', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBeNull();
  });

  it('rejects missing params for eth_getBlockByNumber', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('handles eth_getBlockByNumber full tx', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', true] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    const result = response!.result as { transactions?: { hash: string }[] };
    expect(result.transactions?.[0].hash).toBe('0xtx');
  });

  it('includes upstream uncles when available', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { uncles: ['0xuncle1', 1] } }));
    });
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config: configWithUpstream, portal: portalWithData as any, chainId: 1, requestId: 'test', upstream }
    );
    const result = response!.result as { uncles?: string[] };
    expect(result.uncles).toEqual(['0xuncle1']);
  });

  it('skips uncles when upstream missing', async () => {
    const configEnabled = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config: configEnabled, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    const result = response!.result as { uncles?: string[] };
    expect(result.uncles).toEqual([]);
  });

  it('skips uncles when upstream returns non-object', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: 'nope' }));
    });
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      { config: configWithUpstream, portal: portalWithData as any, chainId: 1, requestId: 'test', upstream }
    );
    const result = response!.result as { uncles?: string[] };
    expect(result.uncles).toEqual([]);
  });

  it('ignores upstream uncles fetch errors', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const warn = vi.fn();
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] },
      {
        config: configWithUpstream,
        portal: portalWithData as any,
        chainId: 1,
        requestId: 'test',
        upstream,
        logger: { info: vi.fn(), warn }
      }
    );
    const result = response!.result as { uncles?: string[] };
    expect(result.uncles).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to upstream when portal lacks required block fields', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const portalMissing = {
      ...portal,
      streamBlocks: async () => {
        throw portalUnsupportedFieldError('withdrawalsRoot');
      }
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { number: '0x1' } }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config: configWithUpstream, portal: portalMissing as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual({ number: '0x1' });
  });

  it('keeps portal error when upstream enabled but no url', async () => {
    const configNoUrl = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const portalMissing = {
      ...portal,
      streamBlocks: async () => {
        throw portalUnsupportedFieldError('withdrawalsRoot');
      }
    };
    const upstream = new UpstreamRpcClient(configNoUrl);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config: configNoUrl, portal: portalMissing as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(httpStatus).toBe(502);
    expect(response!.error?.code).toBe(-32603);
  });

  it('keeps portal error when upstream disabled', async () => {
    const configDisabled = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_METHODS_ENABLED: 'false'
    });
    const portalMissing = {
      ...portal,
      streamBlocks: async () => {
        throw portalUnsupportedFieldError('withdrawalsRoot');
      }
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config: configDisabled, portal: portalMissing as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(502);
    expect(response!.error?.code).toBe(-32603);
  });

  it('proxies pending blocks to upstream', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { number: '0x1' } }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['pending', false] },
      { config: configWithUpstream, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual({ number: '0x1' });
  });

  it('rejects pending blocks when upstream has no url', async () => {
    const configNoUrl = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const upstream = new UpstreamRpcClient(configNoUrl);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['pending', false] },
      { config: configNoUrl, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('rejects pending blocks when upstream enabled but no url', async () => {
    const configEnabled = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const upstream = new UpstreamRpcClient(configEnabled);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['pending', false] },
      { config: configEnabled, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('returns null for block before start_block', async () => {
    const portalStart = {
      ...portal,
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 10, real_time: true })
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config, portal: portalStart as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(200);
    expect(response!.result).toBeNull();
  });

  it('rejects unsupported method', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(404);
    expect(response!.error?.code).toBe(-32601);
  });

  it('handles eth_getLogs', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x5', toBlock: '0x5' }] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(Array.isArray(response!.result)).toBe(true);
  });

  it('proxies blockHash log filters to upstream', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [{ logIndex: '0x0' }] }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [{ blockHash: '0x' + 'aa'.repeat(32) }]
      },
      { config: configWithUpstream, portal: portalWithData as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual([{ logIndex: '0x0' }]);
  });

  it('rejects blockHash log filters without upstream', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [{ blockHash: '0x' + 'aa'.repeat(32) }]
      },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('rejects log ranges beyond maxLogBlockRange', async () => {
    const limited = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_LOG_BLOCK_RANGE: '1'
    });
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x1', toBlock: '0x2' }] },
      { config: limited, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32012);
  });

  it('returns empty traces before start_block', async () => {
    const portalStart = {
      ...portalWithData,
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 10, real_time: true })
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x1'] },
      { config, portal: portalStart as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
  });

  it('returns empty logs when range before start_block', async () => {
    const portalStart = {
      ...portalWithData,
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 10, real_time: true })
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x1', toBlock: '0x2' }] },
      { config, portal: portalStart as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
  });

  it('keeps bounded toBlock even when open-ended stream enabled', async () => {
    const configOpen = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_OPEN_ENDED_STREAM: 'true',
      PORTAL_INCLUDE_ALL_BLOCKS: 'true'
    });
    let seen: Record<string, unknown> | null = null;
    const portalOpen = {
      fetchHead: async () => ({ head: { number: 5, hash: '0xabc' }, finalizedAvailable: false }),
      streamBlocks: async (_baseUrl: string, _finalized: boolean, request: Record<string, unknown>) => {
        seen = request;
        return [];
      },
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 0, real_time: true }),
      buildDatasetBaseUrl: (dataset: string) => `https://portal/${dataset}`
    };
    await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x1' }] },
      { config: configOpen, portal: portalOpen as any, chainId: 1, requestId: 'test' }
    );
    expect(seen).toBeTruthy();
    if (!seen) {
      throw new Error('expected portal request');
    }
    const seenRequest = seen as { toBlock?: number; includeAllBlocks?: boolean };
    expect(seenRequest.toBlock).toBe(5);
    expect(seenRequest.includeAllBlocks).toBe(true);
  });

  it('returns empty logs when block has no logs', async () => {
    const portalNoLogs = {
      ...portalWithData,
      streamBlocks: async () => [
        {
          header: sampleBlock.header,
          transactions: sampleBlock.transactions
        }
      ]
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x5', toBlock: '0x5' }] },
      { config, portal: portalNoLogs as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
  });

  it('handles eth_getTransactionByBlockNumberAndIndex', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBeTruthy();
  });

  it('falls back to linear search for transaction index', async () => {
    const portalUnsorted = {
      ...portal,
      streamBlocks: async () => [
        {
          header: sampleBlock.header,
          transactions: [
            { transactionIndex: 1, hash: '0xfirst', from: '0xfrom', to: '0xto', value: '0x1', input: '0x', nonce: '0x1', gas: '0x2', type: '0x0' },
            { transactionIndex: 0, hash: '0xsecond', from: '0xfrom', to: '0xto', value: '0x1', input: '0x', nonce: '0x1', gas: '0x2', type: '0x0' }
          ]
        }
      ],
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 0, real_time: true })
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portalUnsorted as any, chainId: 1, requestId: 'test' }
    );
    const result = response!.result as { hash?: string };
    expect(result.hash).toBe('0xsecond');
  });

  it('rejects missing params for eth_getTransactionByBlockNumberAndIndex', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('returns null when transaction block missing', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBeNull();
  });

  it('returns null when tx index not found', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x2'] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBeNull();
  });

  it('returns null when block has no transactions list', async () => {
    const portalNoTxList = {
      ...portalWithData,
      streamBlocks: async () => [
        {
          header: sampleBlock.header
        }
      ]
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portalNoTxList as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBeNull();
  });

  it('proxies pending tx lookup to upstream', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { hash: '0x1' } }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionByBlockNumberAndIndex',
        params: ['pending', '0x0']
      },
      { config: configWithUpstream, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect((response!.result as { hash?: string }).hash).toBe('0x1');
  });

  it('returns null when tx block is before start_block', async () => {
    const portalWithStart = {
      ...portalWithData,
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 10, real_time: true })
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portalWithStart as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toBeNull();
  });

  it('rejects missing params for eth_getLogs', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('warns on large log range', async () => {
    const warn = vi.fn();
    const logger = { info: vi.fn(), warn };
    const wideConfig = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_LOG_BLOCK_RANGE: '20000'
    });
    await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x1', toBlock: '0x2711' }] },
      { config: wideConfig, portal: portal as any, chainId: 1, requestId: 'test', logger }
    );
    expect(warn).toHaveBeenCalled();
  });

  it('clamps log range to start_block', async () => {
    let seenFrom: number | undefined;
    let seenTo: number | undefined;
    const portalWithStart = {
      ...portal,
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', start_block: 10, real_time: true }),
      streamBlocks: async (_baseUrl: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        seenFrom = req.fromBlock;
        seenTo = req.toBlock;
        return [];
      }
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x1', toBlock: '0x12' }] },
      { config, portal: portalWithStart as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
    expect(seenFrom).toBe(10);
    expect(seenTo).toBe(18);
  });

  it('uses log range when start_block missing', async () => {
    let seenFrom: number | undefined;
    let seenTo: number | undefined;
    const portalNoStart = {
      ...portal,
      getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true }),
      streamBlocks: async (_baseUrl: string, _finalized: boolean, req: { fromBlock: number; toBlock: number }) => {
        seenFrom = req.fromBlock;
        seenTo = req.toBlock;
        return [];
      }
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x1', toBlock: '0x1' }] },
      { config, portal: portalNoStart as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
    expect(seenFrom).toBe(1);
    expect(seenTo).toBe(1);
  });

  it('handles trace_block', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(Array.isArray(response!.result)).toBe(true);
  });

  it('falls back to upstream when portal lacks required tx fields', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const portalMissing = {
      ...portal,
      streamBlocks: async () => {
        throw portalUnsupportedFieldError('accessList');
      }
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { hash: '0xabc' } }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x1', '0x0'] },
      { config: configWithUpstream, portal: portalMissing as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual({ hash: '0xabc' });
  });

  it('falls back to upstream when portal lacks required trace fields', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const portalMissing = {
      ...portal,
      streamBlocks: async () => {
        throw portalUnsupportedFieldError('action');
      }
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [{ traceAddress: [] }] }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config: configWithUpstream, portal: portalMissing as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual([{ traceAddress: [] }]);
  });

  it('proxies trace_block pending to upstream', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: ['ok'] }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['pending'] },
      { config: configWithUpstream, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual(['ok']);
  });

  it('proxies trace_block blockHash to upstream', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }))
    );
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x' + '11'.repeat(32)] },
      { config: configWithUpstream, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(response!.result).toEqual([]);
  });

  it('proxies hash-based methods to upstream', async () => {
    const configWithUpstream = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { method: string; id: number };
      const resultMap: Record<string, unknown> = {
        eth_getBlockByHash: { hash: '0xabc' },
        eth_getTransactionByHash: { hash: '0xdef' },
        eth_getTransactionReceipt: { transactionHash: '0xdef' },
        trace_transaction: [{ traceAddress: [] }]
      };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: resultMap[body.method] }));
    });
    const upstream = new UpstreamRpcClient(configWithUpstream, { fetchImpl });
    const hash = '0x' + '11'.repeat(32);
    const methods: Array<{ name: string; params: unknown[] }> = [
      { name: 'eth_getBlockByHash', params: [hash, false] },
      { name: 'eth_getTransactionByHash', params: [hash] },
      { name: 'eth_getTransactionReceipt', params: [hash] },
      { name: 'trace_transaction', params: [hash] }
    ];
    for (const { name, params } of methods) {
      const { response } = await handleJsonRpc(
        { jsonrpc: '2.0', id: 1, method: name, params },
        { config: configWithUpstream, portal: portal as any, chainId: 1, requestId: 'test', upstream }
      );
      expect(response!.result).toBeDefined();
    }
  });

  it('rejects hash-based methods without upstream', async () => {
    const hash = '0x' + '11'.repeat(32);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByHash', params: [hash, false] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(404);
    expect(response!.error?.code).toBe(-32601);
  });

  it('rejects hash-based methods when upstream enabled but no url', async () => {
    const configEnabled = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_METHODS_ENABLED: 'true'
    });
    const upstream = new UpstreamRpcClient(configEnabled);
    const hash = '0x' + '11'.repeat(32);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByHash', params: [hash, false] },
      { config: configEnabled, portal: portal as any, chainId: 1, requestId: 'test', upstream }
    );
    expect(httpStatus).toBe(404);
    expect(response!.error?.code).toBe(-32601);
  });

  it('rejects hash-based methods when upstream disabled', async () => {
    const configDisabled = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc',
      UPSTREAM_METHODS_ENABLED: 'false'
    });
    const hash = '0x' + '11'.repeat(32);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByHash', params: [hash, false] },
      { config: configDisabled, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(404);
    expect(response!.error?.code).toBe(-32601);
  });

  it('rejects invalid params for eth_getBlockByHash', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByHash', params: ['0x1234'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response.error?.code).toBe(-32602);
  });

  it('returns server error when tx lookup stream fails', async () => {
    const portalFail = {
      ...portal,
      fetchHead: async () => ({ head: { number: 5, hash: '0xabc' }, finalizedAvailable: false }),
      streamBlocks: async () => {
        throw new Error('boom');
      }
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portalFail as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(502);
    expect(response.error?.code).toBe(-32603);
  });

  it('returns server error when trace_block stream fails', async () => {
    const portalFail = {
      ...portal,
      fetchHead: async () => ({ head: { number: 5, hash: '0xabc' }, finalizedAvailable: false }),
      streamBlocks: async () => {
        throw new Error('boom');
      }
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config, portal: portalFail as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(502);
    expect(response.error?.code).toBe(-32603);
  });

  it('returns timeout error when handler exceeds timeout', async () => {
    const slowPortal = {
      ...portal,
      fetchHead: async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ head: { number: 5, hash: '0xabc' }, finalizedAvailable: false }), 50);
        })
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
      { config, portal: slowPortal as any, chainId: 1, requestId: 'test', requestTimeoutMs: 1 }
    );
    expect(httpStatus).toBe(504);
    expect(response.error?.code).toBe(-32000);
  });

  it('rejects invalid fullTx flag for eth_getBlockByHash', async () => {
    const hash = '0x' + '11'.repeat(32);
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByHash', params: [hash, 'nope'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response.error?.code).toBe(-32602);
  });

  it('rejects invalid params for eth_getTransactionByHash', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: ['0x1234'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response.error?.code).toBe(-32602);
  });

  it('rejects invalid params for eth_getTransactionReceipt', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: ['0x1234'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response.error?.code).toBe(-32602);
  });

  it('rejects invalid params for trace_transaction', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_transaction', params: ['0x1234'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('rejects missing params for trace_block', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(400);
    expect(response!.error?.code).toBe(-32602);
  });

  it('returns empty traces when no blocks', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
  });

  it('handles trace_block without transactions', async () => {
    const portalNoTx = {
      ...portalWithData,
      streamBlocks: async () => [
        {
          header: sampleBlock.header,
          traces: sampleBlock.traces
        }
      ]
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config, portal: portalNoTx as any, chainId: 1, requestId: 'test' }
    );
    expect(Array.isArray(response!.result)).toBe(true);
  });

  it('returns empty traces when block has none', async () => {
    const portalNoTraces = {
      ...portalWithData,
      streamBlocks: async () => [
        {
          header: sampleBlock.header,
          transactions: sampleBlock.transactions
        }
      ]
    };
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config, portal: portalNoTraces as any, chainId: 1, requestId: 'test' }
    );
    expect(response!.result).toEqual([]);
  });

  it('logs portal conflicts', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const portalConflict = {
      ...portal,
      streamBlocks: async () => {
        throw conflictError([{ number: 1 }]);
      }
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config, portal: portalConflict as any, chainId: 1, requestId: 'test', logger }
    );
    expect(httpStatus).toBe(409);
    expect(response!.error?.code).toBe(-32603);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('normalizes non-rpc errors', async () => {
    const portalError = {
      ...portal,
      streamBlocks: async () => {
        throw new Error('boom');
      }
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config, portal: portalError as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(502);
    expect(response!.error?.code).toBe(-32603);
  });

  it('logs conflict without previous blocks array', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const portalConflict = {
      ...portal,
      streamBlocks: async () => {
        throw conflictError('oops' as any);
      }
    };
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config, portal: portalConflict as any, chainId: 1, requestId: 'test', logger }
    );
    expect(httpStatus).toBe(409);
    expect(response!.error?.code).toBe(-32603);
    expect(logger.warn).toHaveBeenCalled();
  });
});
