import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildServer } from '../src/server';
import { loadConfig } from '../src/config';
import { invalidParams } from '../src/errors';

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

  it('handles readyz', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('handles metrics', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    await server.close();
  });

  it('returns rpc error when cause is RpcError', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    server.get('/boom', async () => {
      const err = new Error('boom');
      (err as { cause?: unknown }).cause = invalidParams('invalid params');
      throw err;
    });
    const res = await server.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32602);
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
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
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
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
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
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it('accepts valid wrapper api key', async () => {
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
      headers: { 'content-type': 'application/json', 'x-api-key': 'secret' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('skips response for notifications', async () => {
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
      payload: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(204);
    await server.close();
  });

  it('handles multi chain path', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/evm/1',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('uses dataset map chain id in single mode', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET_MAP: '{"10":"optimism-mainnet"}'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe('0xa');
    await server.close();
  });

  it('returns 404 for chain path in single mode', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/evm/1',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  it('rejects invalid chain id path', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/evm/not-a-number',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('rejects when overloaded', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_CONCURRENT_REQUESTS: '0'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error.code).toBe(-32603);
    await server.close();
  });

  it('parses hex chain id header', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json', 'x-chain-id': '0x1' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('accepts api key header array', async () => {
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
      headers: { 'content-type': 'application/json', 'x-api-key': ['secret'] as unknown as string },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('rejects invalid request payload', async () => {
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
      payload: JSON.stringify({})
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32600);
    await server.close();
  });

  it('rejects non-boolean fullTx param', async () => {
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
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', 'nope'] })
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32602);
    await server.close();
  });

  it('returns unsupported method error', async () => {
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
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [] })
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe(-32601);
    await server.close();
  });

  it('rejects unsupported chain id in multi mode', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi'
    });
    const server = await buildServer(config);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/evm/999999',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32602);
    await server.close();
  });

  it('rejects oversized gzip payload', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_REQUEST_BODY_BYTES: '20'
    });
    const server = await buildServer(config);
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
    const compressed = gzipSync(payload);
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      payload: compressed
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32600);
    await server.close();
  });

  it('returns parse error for invalid json', async () => {
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
      payload: '{ invalid json'
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32700);
    await server.close();
  });
});
