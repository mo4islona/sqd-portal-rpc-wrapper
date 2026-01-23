import { describe, expect, it } from 'vitest';
import { parseJsonRpcPayload } from '../src/jsonrpc';

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
    expect(() => parseJsonRpcPayload({} as any)).toThrow('invalid');
  });
});
