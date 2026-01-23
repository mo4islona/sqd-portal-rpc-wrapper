export function normalizeHex(value: string): string {
  return value.toLowerCase();
}

export function isHexString(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

export function hexToBytes(value: string): Uint8Array {
  if (!isHexString(value)) {
    throw new Error(`invalid hex string`);
  }
  const trimmed = value.slice(2);
  if (trimmed.length % 2 !== 0) {
    throw new Error('invalid hex string length');
  }
  return Uint8Array.from(Buffer.from(trimmed, 'hex'));
}

export function validateHexBytesLength(label: string, value: string, expectedBytes: number): void {
  if (value.trim() === '') {
    throw new Error(`invalid ${label}: empty`);
  }
  const bytes = hexToBytes(value);
  if (bytes.length !== expectedBytes) {
    throw new Error(`invalid ${label} length: got ${bytes.length} bytes expected ${expectedBytes} bytes`);
  }
}
