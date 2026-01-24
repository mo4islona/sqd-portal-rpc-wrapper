import { describe, expect, it, vi } from 'vitest';

describe('server error category metrics', () => {
  it('maps error codes to categories', async () => {
    vi.resetModules();
    vi.doMock('../src/rpc/handlers', () => {
      return {
        handleJsonRpc: vi.fn(async (request: { method: string; id?: number }) => {
          const codeByMethod: Record<string, number> = {
            invalid_request: -32600,
            unsupported_method: -32601,
            unauthorized: -32016,
            rate_limit: -32005,
            not_found: -32014,
            invalid_params: -32602,
            invalid_params_alt: -32012,
            server_error: -32603
          };
          const code = codeByMethod[request.method] ?? -32603;
          return {
            response: {
              jsonrpc: '2.0',
              id: request.id ?? 1,
              error: { code, message: 'err' }
            },
            httpStatus: code === -32601 ? 404 : 400
          };
        })
      };
    });

    const { buildServer } = await import('../src/server');
    const { loadConfig } = await import('../src/config');
    const { registry } = await import('../src/metrics');

    registry.resetMetrics();

    const server = await buildServer(
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET: 'ethereum-mainnet',
        PORTAL_CHAIN_ID: '1'
      })
    );

    const payload = [
      { jsonrpc: '2.0', id: 1, method: 'invalid_request', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'unsupported_method', params: [] },
      { jsonrpc: '2.0', id: 3, method: 'unauthorized', params: [] },
      { jsonrpc: '2.0', id: 4, method: 'rate_limit', params: [] },
      { jsonrpc: '2.0', id: 5, method: 'not_found', params: [] },
      { jsonrpc: '2.0', id: 6, method: 'invalid_params', params: [] },
      { jsonrpc: '2.0', id: 7, method: 'invalid_params_alt', params: [] },
      { jsonrpc: '2.0', id: 8, method: 'server_error', params: [] }
    ];

    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(payload)
    });

    expect(res.statusCode).toBe(404);

    const metrics = await registry.metrics();
    const valueFor = (category: string) => {
      const line = metrics
        .split('\n')
        .find((entry) => entry.startsWith(`errors_total{category=\"${category}\"}`));
      if (!line) return 0;
      return Number(line.split(' ').pop());
    };

    expect(valueFor('invalid_request')).toBe(1);
    expect(valueFor('unsupported_method')).toBe(1);
    expect(valueFor('unauthorized')).toBe(1);
    expect(valueFor('rate_limit')).toBe(1);
    expect(valueFor('not_found')).toBe(1);
    expect(valueFor('invalid_params')).toBe(2);
    expect(valueFor('server_error')).toBe(1);

    await server.close();
    vi.resetModules();
  });
});
