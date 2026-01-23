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
});
