import { describe, expect, it } from 'vitest';
import { parseQuantity, quantityHex, quantityHexIfSet } from '../src/util/quantity';

describe('quantity', () => {
  it('parses hex and decimal', () => {
    expect(parseQuantity('0x2a')).toBe(42n);
    expect(parseQuantity('10')).toBe(10n);
    expect(parseQuantity(7)).toBe(7n);
  });

  it('returns null for empty input', () => {
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });

  it('rejects invalid numeric', () => {
    expect(() => parseQuantity('1.2')).toThrow('invalid quantity');
    expect(() => parseQuantity(1.2)).toThrow('invalid quantity');
    expect(() => parseQuantity('1e3')).toThrow('invalid quantity');
  });

  it('rejects invalid types', () => {
    expect(() => parseQuantity({})).toThrow('invalid quantity');
  });

  it('formats hex quantities', () => {
    expect(quantityHex(null)).toBe('0x0');
    expect(quantityHexIfSet(null)).toBeUndefined();
  });
});
