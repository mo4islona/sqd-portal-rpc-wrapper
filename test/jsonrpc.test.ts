import { describe, expect, it } from 'vitest';
import { errorResponse, isJsonRpcRequest, parseJsonRpcPayload, responseId, successResponse } from '../src/jsonrpc';
import { RpcError } from '../src/errors';

describe('jsonrpc', () => {
  it('parses single payload', () => {
    const parsed = parseJsonRpcPayload({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.isBatch).toBe(false);
  });

  it('parses batch payload', () => {
    const parsed = parseJsonRpcPayload([
      { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
      { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 2 }
    ]);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.isBatch).toBe(true);
  });

  it('rejects invalid payload', () => {
    expect(() => parseJsonRpcPayload({} as any)).toThrow('invalid request');
  });

  it('rejects empty batch', () => {
    expect(() => parseJsonRpcPayload([])).toThrow('invalid request');
  });

  it('rejects invalid batch item', () => {
    const parsed = parseJsonRpcPayload([
      { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
      { not: 'rpc' } as any
    ]);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[1].error).toBeDefined();
  });

  it('detects jsonrpc request', () => {
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId' })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: '1.0', method: 'eth_chainId' })).toBe(false);
    expect(isJsonRpcRequest(null)).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId', id: {} })).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId', params: 'nope' })).toBe(false);
  });

  it('accepts valid id and params shapes', () => {
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId', id: null })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId', id: 'req-1' })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId', params: null })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId', params: { foo: 'bar' } })).toBe(true);
  });

  it('builds success response', () => {
    const res = successResponse(1, 'ok');
    expect(res.result).toBe('ok');
  });

  it('builds error response with data', () => {
    const err = new RpcError({
      message: 'bad',
      code: -32000,
      httpStatus: 500,
      category: 'server_error',
      data: { hint: 'nope' }
    });
    const res = errorResponse(1, err);
    expect(res.error?.data).toEqual({ hint: 'nope' });
  });

  it('handles missing id', () => {
    const res = responseId({ jsonrpc: '2.0', method: 'eth_chainId', params: [] });
    expect(res).toBeNull();
  });
});
