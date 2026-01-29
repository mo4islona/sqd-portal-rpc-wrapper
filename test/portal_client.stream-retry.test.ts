import { describe, expect, it, vi } from 'vitest';
import { PortalClient } from '../src/portal/client';
import { loadConfig } from '../src/config';

function streamResponse(body: string, status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    }
  });
  return new Response(stream, { status });
}

const DEFAULT_HASH = `0x${'11'.repeat(32)}`;
const DEFAULT_PARENT_HASH = `0x${'22'.repeat(32)}`;

function blockLine(number: number) {
  return `${JSON.stringify({
    header: { number, hash: DEFAULT_HASH, parentHash: DEFAULT_PARENT_HASH }
  })}\n`;
}

describe('PortalClient stream retry', () => {
  it('retries when stream ends before toBlock', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const fetchImpl = vi.fn().mockImplementation((input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        const body = JSON.parse(String(init?.body));
        calls.push({ fromBlock: body.fromBlock, toBlock: body.toBlock });
        if (calls.length === 1) {
          return streamResponse(blockLine(1), 200);
        }
        return streamResponse(blockLine(2), 200);
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl });
    const onHeaders = vi.fn();
    const blocks = await client.streamBlocks(
      'https://portal.sqd.dev/datasets/ethereum-mainnet',
      false,
      { type: 'evm', fromBlock: 1, toBlock: 2 },
      undefined,
      onHeaders
    );
    expect(calls).toEqual([
      { fromBlock: 1, toBlock: 2 },
      { fromBlock: 2, toBlock: 2 }
    ]);
    expect(blocks.map((block) => block.header.number)).toEqual([1, 2]);
    expect(onHeaders).toHaveBeenCalled();
  });

  it('throws when retry cannot advance to toBlock', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = vi.fn().mockImplementation((input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        const body = JSON.parse(String(init?.body));
        if (body.fromBlock === 1) {
          return streamResponse(blockLine(1), 200);
        }
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    const onHeaders = vi.fn();
    await expect(
      client.streamBlocks(
        'https://portal.sqd.dev/datasets/ethereum-mainnet',
        false,
        { type: 'evm', fromBlock: 1, toBlock: 2 },
        undefined,
        onHeaders
      )
    ).rejects.toThrow('portal stream interrupted');
    expect(onHeaders).toHaveBeenCalled();
  });

  it('propagates portal errors during retry', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation((input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        calls += 1;
        if (calls === 1) {
          return streamResponse(blockLine(1), 200);
        }
        return new Response('down', { status: 503 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
        type: 'evm',
        fromBlock: 1,
        toBlock: 2
      })
    ).rejects.toThrow('unavailable');
  });

  it('skips continuity enforcement for log streams without includeAllBlocks', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation((input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        calls += 1;
        return streamResponse(blockLine(1), 200);
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 2,
      logs: [{}]
    });
    expect(blocks).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('throws when retry receives 204', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation((input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        calls += 1;
        if (calls === 1) {
          return streamResponse(blockLine(1), 200);
        }
        const body = JSON.parse(String(init?.body));
        if (body.fromBlock === 2) {
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
        type: 'evm',
        fromBlock: 1,
        toBlock: 2
      })
    ).rejects.toThrow('portal stream interrupted');
  });

  it('invokes headers callback on retry 204', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation((input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        calls += 1;
        if (calls === 1) {
          return streamResponse(blockLine(1), 200);
        }
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const onHeaders = vi.fn();
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    await expect(
      client.streamBlocks(
        'https://portal.sqd.dev/datasets/ethereum-mainnet',
        false,
        { type: 'evm', fromBlock: 1, toBlock: 2 },
        undefined,
        onHeaders
      )
    ).rejects.toThrow('portal stream interrupted');
    expect(onHeaders).toHaveBeenCalled();
  });

  it('returns immediately when toBlock is undefined', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = vi.fn().mockImplementation((input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        return streamResponse(blockLine(1), 200);
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
      type: 'evm',
      fromBlock: 1
    });
    expect(blocks).toHaveLength(1);
  });
});
