import { Readable } from 'node:stream';
import { metrics } from '../metrics';
import { serverError } from '../errors';

interface NdjsonLimits {
  maxLineBytes: number;
  maxBytes: number;
}

export async function parseNdjsonStream(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  limits: NdjsonLimits
): Promise<any[]> {
  const stream = isWebStream(body) ? Readable.fromWeb(body) : body;
  const decoder = new TextDecoder();
  let buffer = '';
  let totalBytes = 0;
  const blocks: any[] = [];

  for await (const chunk of stream) {
    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    totalBytes += chunkBuf.length;
    if (totalBytes > limits.maxBytes) {
      throw serverError(`ndjson payload exceeds max bytes (${limits.maxBytes})`);
    }

    buffer += decoder.decode(chunkBuf, { stream: true });
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.length > 0) {
        if (line.length > limits.maxLineBytes) {
          throw serverError(`ndjson line exceeds max bytes (${limits.maxLineBytes})`);
        }
        try {
          blocks.push(JSON.parse(line));
        } catch (err) {
          throw serverError(`ndjson parse error: ${err instanceof Error ? err.message : String(err)}`);
        }
        metrics.ndjson_lines_total.inc();
      }
      idx = buffer.indexOf('\n');
    }
  }

  const remaining = buffer.trim();
  if (remaining.length > 0) {
    if (remaining.length > limits.maxLineBytes) {
      throw serverError(`ndjson line exceeds max bytes (${limits.maxLineBytes})`);
    }
    try {
      blocks.push(JSON.parse(remaining));
    } catch (err) {
      throw serverError(`ndjson parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
    metrics.ndjson_lines_total.inc();
  }

  return blocks;
}

function isWebStream(body: ReadableStream<Uint8Array> | NodeJS.ReadableStream): body is ReadableStream<Uint8Array> {
  return typeof (body as ReadableStream<Uint8Array>).getReader === 'function';
}
