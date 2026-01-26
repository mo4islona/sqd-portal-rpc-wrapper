import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';

describe('capabilities endpoint', () => {
  it('returns chain capabilities with metadata', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', aliases: ['eth'], start_block: 1, real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chains['1'].dataset).toBe('ethereum-mainnet');
    expect(body.chains['1'].realTime).toBe(true);
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('advertises upstream methods only when enabled', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', start_block: 0, real_time: true };
        }
      }
      return { PortalClient, normalizePortalBaseUrl: (value: string) => value };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const baseConfig = {
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    };

    const serverDisabled = await buildServer(loadConfig(baseConfig));
    const resDisabled = await serverDisabled.inject({ method: 'GET', url: '/capabilities' });
    const methodsDisabled = resDisabled.json().methods as string[];
    expect(methodsDisabled).toEqual([
      'eth_chainId',
      'eth_blockNumber',
      'eth_getBlockByNumber',
      'eth_getTransactionByBlockNumberAndIndex',
      'eth_getLogs',
      'trace_block'
    ]);
    await serverDisabled.close();

    const serverEnabled = await buildServer(loadConfig({ ...baseConfig, UPSTREAM_METHODS_ENABLED: 'true' }));
    const resEnabled = await serverEnabled.inject({ method: 'GET', url: '/capabilities' });
    const methodsEnabled = resEnabled.json().methods as string[];
    expect(methodsEnabled).toEqual([
      'eth_chainId',
      'eth_blockNumber',
      'eth_getBlockByNumber',
      'eth_getTransactionByBlockNumberAndIndex',
      'eth_getLogs',
      'trace_block',
      'eth_getBlockByHash',
      'eth_getTransactionByHash',
      'eth_getTransactionReceipt',
      'trace_transaction'
    ]);
    await serverEnabled.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('advertises upstream methods when url map provided', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', start_block: 0, real_time: true };
        }
      }
      return { PortalClient, normalizePortalBaseUrl: (value: string) => value };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_METHODS_ENABLED: 'true',
      UPSTREAM_RPC_URL_MAP: JSON.stringify({ '1': 'https://upstream.rpc' })
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    const methods = res.json().methods as string[];
    expect(methods).toContain('eth_getBlockByHash');
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('passes finalized head headers from stream', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async fetchHead() {
          return { head: { number: 5, hash: '0xabc' }, finalizedAvailable: false };
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', start_block: 0, real_time: true };
        }
        async streamBlocks(
          _baseUrl: string,
          _finalized: boolean,
          _request: unknown,
          _traceparent?: string,
          onHeaders?: (headers: { finalizedHeadNumber?: string; finalizedHeadHash?: string }) => void
        ) {
          onHeaders?.({ finalizedHeadNumber: '10', finalizedHeadHash: '0xdef' });
          return [
            {
              header: {
                number: 5,
                hash: '0xblock',
                parentHash: '0xparent',
                timestamp: 1,
                miner: '0xminer',
                gasUsed: '0x1',
                gasLimit: '0x2',
                nonce: '0x0',
                difficulty: '0x3',
                totalDifficulty: '0x4',
                size: '0x5',
                stateRoot: '0xstate',
                transactionsRoot: '0xtx',
                receiptsRoot: '0xrec',
                logsBloom: '0xlog',
                extraData: '0xextra',
                mixHash: '0xmix',
                sha3Uncles: '0xuncle'
              },
              transactions: []
            }
          ];
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({}) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x5', false] })
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-sqd-finalized-head-number']).toBe('10');
    expect(res.headers['x-sqd-finalized-head-hash']).toBe('0xdef');
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('returns capabilities when metadata fetch fails', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          throw new Error('boom');
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chains['1'].realTime).toBe(false);
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('disables realtime when mode disabled', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_REALTIME_MODE: 'disabled'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chains['1'].realTime).toBe(false);
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('fails when realtime required and metadata false', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', real_time: false };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_REALTIME_MODE: 'required'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(502);
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('returns empty chains when dataset missing for single mode', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'unused', real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({}) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_CHAIN_ID: '1',
      PORTAL_DATASET_MAP: JSON.stringify({ '2': 'other' })
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body.chains)).toHaveLength(0);
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('merges dataset map in multi mode', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'unused', real_time: false };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_DATASET_MAP: JSON.stringify({ '10': 'optimism' })
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chains['1'].dataset).toBe('ethereum-mainnet');
    expect(body.chains['10'].dataset).toBe('optimism');
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('skips default dataset map when disabled', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'unused', real_time: false };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_USE_DEFAULT_DATASETS: 'false',
      PORTAL_DATASET_MAP: JSON.stringify({ '10': 'optimism' })
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chains['1']).toBeUndefined();
    expect(body.chains['10'].dataset).toBe('optimism');
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('uses dataset placeholder endpoints and npm package version', async () => {
    vi.resetModules();
    const prevVersion = process.env.npm_package_version;
    process.env.npm_package_version = '9.9.9';
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'base-mainnet', real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({}) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET_MAP: JSON.stringify({ '8453': 'base-mainnet' }),
      PORTAL_BASE_URL: 'https://portal.sqd.dev/{dataset}'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.service.version).toBe('9.9.9');
    expect(body.portalEndpoints.head).toBe('https://portal.sqd.dev/{dataset}/head');
    expect(body.chains['8453'].dataset).toBe('base-mainnet');
    await server.close();
    process.env.npm_package_version = prevVersion;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('falls back to default service version when npm version missing', async () => {
    vi.resetModules();
    const prevVersion = process.env.npm_package_version;
    process.env.npm_package_version = '';
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'base-mainnet', real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({}) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET_MAP: JSON.stringify({ '8453': 'base-mainnet' })
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.service.version).toBe('0.1.0');
    await server.close();
    process.env.npm_package_version = prevVersion;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('prefetches metadata outside test env', async () => {
    vi.resetModules();
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let calls = 0;
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          calls += 1;
          return { dataset: 'ethereum-mainnet', real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    expect(calls).toBe(1);
    await server.close();
    process.env.NODE_ENV = prevEnv;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('prefetches metadata when realtime false', async () => {
    vi.resetModules();
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let calls = 0;
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          calls += 1;
          return { dataset: 'ethereum-mainnet', real_time: false };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    expect(calls).toBe(1);
    await server.close();
    process.env.NODE_ENV = prevEnv;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('handles prefetch metadata errors outside test env', async () => {
    vi.resetModules();
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let calls = 0;
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          calls += 1;
          throw new Error('boom');
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    expect(calls).toBe(1);
    await server.close();
    process.env.NODE_ENV = prevEnv;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('throws when prefetch metadata fails and realtime required', async () => {
    vi.resetModules();
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          throw new Error('boom');
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_REALTIME_MODE: 'required'
    });
    await expect(buildServer(config)).rejects.toThrow('boom');
    process.env.NODE_ENV = prevEnv;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('handles prefetch metadata non-error throws', async () => {
    vi.resetModules();
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          throw 'boom';
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    await server.close();
    process.env.NODE_ENV = prevEnv;

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });

  it('omits startBlock when metadata value not numeric', async () => {
    vi.resetModules();
    vi.doMock('../src/portal/client', () => {
      class PortalClient {
        constructor(_config: unknown) {}
        buildDatasetBaseUrl(dataset: string) {
          return `https://portal/${dataset}`;
        }
        async getMetadata() {
          return { dataset: 'ethereum-mainnet', start_block: '1', real_time: true };
        }
      }
      return {
        PortalClient,
        normalizePortalBaseUrl: (value: string) => value
      };
    });
    vi.doMock('../src/portal/mapping', async () => {
      const actual = await vi.importActual<typeof import('../src/portal/mapping')>('../src/portal/mapping');
      return { ...actual, defaultDatasetMap: () => ({ '1': 'ethereum-mainnet' }) };
    });

    const { buildServer } = await import('../src/server');
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chains['1'].startBlock).toBeUndefined();
    await server.close();

    vi.resetModules();
    vi.unmock('../src/portal/client');
    vi.unmock('../src/portal/mapping');
  });
});
