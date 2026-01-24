import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { parseNdjsonStream } from '../src/portal/ndjson';

describe('ndjson parser', () => {
  it('parses lines', async () => {
    const data = '{"header":{"number":1}}\n{"header":{"number":2}}\n';
    const stream = Readable.from([data]);
    const result = await parseNdjsonStream(stream, { maxLineBytes: 1024, maxBytes: 2048 });
    expect(result).toHaveLength(2);
    expect(result[0].header.number).toBe(1);
  });

  it('rejects oversized line', async () => {
    const data = `${'a'.repeat(20)}\n`;
    const stream = Readable.from([data]);
    await expect(parseNdjsonStream(stream, { maxLineBytes: 5, maxBytes: 2048 })).rejects.toThrow('ndjson line');
  });

  it('rejects oversized payload', async () => {
    const data = `${'a'.repeat(20)}\n`;
    const stream = Readable.from([data]);
    await expect(parseNdjsonStream(stream, { maxLineBytes: 1024, maxBytes: 5 })).rejects.toThrow('ndjson payload');
  });

  it('rejects invalid json line', async () => {
    const stream = Readable.from(['{bad json}\n']);
    await expect(parseNdjsonStream(stream, { maxLineBytes: 1024, maxBytes: 2048 })).rejects.toThrow('ndjson parse');
  });

  it('parses trailing line without newline', async () => {
    const stream = Readable.from(['{"header":{"number":3}}']);
    const result = await parseNdjsonStream(stream, { maxLineBytes: 1024, maxBytes: 2048 });
    expect(result[0].header.number).toBe(3);
  });

  it('parses web ReadableStream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"header":{"number":4}}\n'));
        controller.close();
      }
    });
    const result = await parseNdjsonStream(stream, { maxLineBytes: 1024, maxBytes: 2048 });
    expect(result[0].header.number).toBe(4);
  });

  it('rejects oversized trailing line without newline', async () => {
    const stream = Readable.from(['a'.repeat(20)]);
    await expect(parseNdjsonStream(stream, { maxLineBytes: 5, maxBytes: 2048 })).rejects.toThrow('ndjson line');
  });

  it('rejects invalid trailing json without newline', async () => {
    const stream = Readable.from(['{bad json}']);
    await expect(parseNdjsonStream(stream, { maxLineBytes: 1024, maxBytes: 2048 })).rejects.toThrow('ndjson parse');
  });
});
