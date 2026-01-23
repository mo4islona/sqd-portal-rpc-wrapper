import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';
import { loadConfig } from '../src/config';

describe('server', () => {
  it('handles healthz', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('handles eth_chainId', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      payload: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe('0x1');
    await server.close();
  });

  it('rejects missing chainId in multi mode', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_DATASET_MAP: '{"1":"ethereum-mainnet"}'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      payload: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('requires wrapper api key', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      WRAPPER_API_KEY: 'secret'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      payload: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
    });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});
