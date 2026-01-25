import { describe, expect, it, vi } from 'vitest';
import { UpstreamRpcClient } from '../src/rpc/upstream';
import { loadConfig } from '../src/config';

describe('upstream rpc', () => {
  it('resolves chain-specific url', () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://default.rpc',
      UPSTREAM_RPC_URL_MAP: '{"1":"https://chain.rpc"}'
    });
    const client = new UpstreamRpcClient(config);
    expect(client.resolveUrl(1)).toBe('https://chain.rpc');
    expect(client.resolveUrl(2)).toBe('https://default.rpc');
  });

  it('returns result from upstream', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }), { status: 200 })
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    const result = await client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }, 1);
    expect(result).toBe('0x1');
  });

  it('handles array responses by taking first item', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ jsonrpc: '2.0', id: 1, result: '0x2' }]), { status: 200 })
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    const result = await client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1);
    expect(result).toBe('0x2');
  });

  it('sends null id when missing', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: null, result: '0x1' }), { status: 200 })
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await client.call({ jsonrpc: '2.0', method: 'eth_chainId' }, 1);
    const init = fetchImpl.mock.calls[0][1] as { body?: string };
    const body = JSON.parse(init.body as string) as { id?: unknown };
    expect(body.id).toBeNull();
  });

  it('adds traceparent header', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }), { status: 200 })
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }, 1, '00-trace');
    const init = fetchImpl.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(init.headers?.traceparent).toBe('00-trace');
  });

  it('maps upstream errors into rpc errors', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid params' } }))
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32602,
      httpStatus: 400
    });
  });

  it('preserves upstream error data objects', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid params', data: { hint: 'x' } } })
      )
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      data: { hint: 'x' }
    });
  });

  it('maps upstream error categories', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const cases = [
      { code: -32600, httpStatus: 400 },
      { code: -32601, httpStatus: 404 },
      { code: -32005, httpStatus: 429 },
      { code: -32016, httpStatus: 401 },
      { code: -32014, httpStatus: 404 },
      { code: -32000, httpStatus: 502 }
    ];
    for (const entry of cases) {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: entry.code, message: 'fail' } }))
      );
      const client = new UpstreamRpcClient(config, { fetchImpl });
      await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
        httpStatus: entry.httpStatus
      });
    }
  });

  it('maps parse errors to invalid_request', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32700, message: 'parse' } }))
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      httpStatus: 400
    });
  });

  it('defaults upstream error fields when malformed', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: 'bad', message: 123, data: 'nope' } }))
    );
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603,
      message: 'server error'
    });
  });

  it('handles invalid upstream responses', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603
    });
  });

  it('rejects upstream responses without jsonrpc', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, result: 'ok' }), { status: 200 }));
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603
    });
  });

  it('rejects upstream responses without result', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1 }), { status: 200 }));
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603
    });
  });

  it('rejects empty upstream body', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new UpstreamRpcClient(config, { fetchImpl });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603
    });
  });

  it('throws when upstream not configured', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const client = new UpstreamRpcClient(config);
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603
    });
  });

  it('logs and wraps fetch errors', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const client = new UpstreamRpcClient(config, { fetchImpl, logger: { info: vi.fn(), warn } });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603
    });
    expect(warn).toHaveBeenCalled();
  });

  it('wraps non-error throwables', async () => {
    const config = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      UPSTREAM_RPC_URL: 'https://upstream.rpc'
    });
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue('boom');
    const client = new UpstreamRpcClient(config, { fetchImpl, logger: { info: vi.fn(), warn } });
    await expect(client.call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, 1)).rejects.toMatchObject({
      code: -32603,
      message: 'upstream rpc failed'
    });
    expect(warn).toHaveBeenCalled();
  });
});
