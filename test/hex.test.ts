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
});
