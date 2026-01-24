import { describe, expect, it } from 'vitest';
import { errorResponse, isJsonRpcRequest, parseJsonRpcPayload, responseId, successResponse } from '../src/jsonrpc';
import { RpcError } from '../src/errors';

describe('jsonrpc', () => {
  it('parses single payload', () => {
    const req = parseJsonRpcPayload({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 });
    expect(req).toHaveLength(1);
  });

  it('parses batch payload', () => {
    const req = parseJsonRpcPayload([
      { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
      { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 2 }
    ]);
    expect(req).toHaveLength(2);
  });

  it('rejects invalid payload', () => {
    expect(() => parseJsonRpcPayload({} as any)).toThrow('invalid request');
  });

  it('rejects empty batch', () => {
    expect(() => parseJsonRpcPayload([])).toThrow('invalid request');
  });

  it('rejects invalid batch item', () => {
    expect(() =>
      parseJsonRpcPayload([
        { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
        { not: 'rpc' } as any
      ])
    ).toThrow('invalid request');
  });

  it('detects jsonrpc request', () => {
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'eth_chainId' })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: '1.0', method: 'eth_chainId' })).toBe(false);
    expect(isJsonRpcRequest(null)).toBe(false);
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
