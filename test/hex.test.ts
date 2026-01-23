import { describe, expect, it } from 'vitest';
import { hexToBytes, validateHexBytesLength } from '../src/util/hex';

describe('hex utils', () => {
  it('parses hex to bytes', () => {
    const bytes = hexToBytes('0x0a0b');
    expect(bytes.length).toBe(2);
  });

  it('validates length', () => {
    expect(() => validateHexBytesLength('address', '0x' + '11'.repeat(20), 20)).not.toThrow();
    expect(() => validateHexBytesLength('address', '0x11', 20)).toThrow();
  });

  it('rejects invalid hex', () => {
    expect(() => hexToBytes('0xz')).toThrow('invalid hex string');
    expect(() => hexToBytes('0x1')).toThrow('invalid hex string length');
  });

  it('rejects empty hex', () => {
    expect(() => validateHexBytesLength('address', '', 20)).toThrow('invalid address: empty');
  });
});
