const INVALID_NUMBER_RE = /[.eE]/;

export function parseQuantity(input: unknown): bigint | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') {
      return null;
    }
    const isHex = trimmed.startsWith('0x') || trimmed.startsWith('0X');
    if (!isHex && INVALID_NUMBER_RE.test(trimmed)) {
      throw new Error(`invalid quantity: ${input}`);
    }
    return BigInt(trimmed);
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      throw new Error(`invalid quantity: ${input}`);
    }
    return BigInt(input);
  }
  throw new Error(`invalid quantity: ${String(input)}`);
}

export function quantityHex(input: unknown): string {
  const value = parseQuantity(input);
  if (value === null) {
    return '0x0';
  }
  return `0x${value.toString(16)}`;
}

export function quantityHexIfSet(input: unknown): string | undefined {
  const value = parseQuantity(input);
  if (value === null) {
    return undefined;
  }
  return `0x${value.toString(16)}`;
}
