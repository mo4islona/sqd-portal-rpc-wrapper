import { describe, expect, it } from 'vitest';
import {
  rangeTooLargeError,
  tooManyAddressesError,
  pendingBlockError,
  invalidRequest,
  parseError,
  normalizeError,
  RpcError,
  conflictError
} from '../src/errors';

describe('errors', () => {
  it('range too large message contains required substrings', () => {
    const err = rangeTooLargeError(1000);
    expect(err.message).toContain('range too large');
    expect(err.message).toContain('max block range');
  });

  it('too many addresses message matches', () => {
    const err = tooManyAddressesError();
    expect(err.message).toContain('specify less number of address');
  });

  it('pending block message matches', () => {
    const err = pendingBlockError();
    expect(err.message).toContain('pending block not found');
  });

  it('builds invalid request error', () => {
    const err = invalidRequest();
    expect(err.code).toBe(-32600);
  });

  it('builds parse error', () => {
    const err = parseError();
    expect(err.code).toBe(-32700);
  });

  it('preserves rpc error in normalizeError', () => {
    const err = new RpcError({ message: 'oops', code: -32000, httpStatus: 500, category: 'server_error' });
    expect(normalizeError(err)).toBe(err);
  });

  it('normalizes non-error input', () => {
    const err = normalizeError('nope');
    expect(err.code).toBe(-32603);
  });

  it('includes previous blocks in conflict', () => {
    const err = conflictError([{ number: 1 }]);
    expect(err.data?.retryable).toBe(true);
    expect(Array.isArray(err.data?.previousBlocks)).toBe(true);
  });
});
