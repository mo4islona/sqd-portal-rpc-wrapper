import { describe, expect, it, vi } from 'vitest';
import { PortalClient, normalizePortalBaseUrl } from '../src/portal/client';
import { loadConfig } from '../src/config';

function streamResponse(body: string, status = 200, headers?: Record<string, string>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    }
  });
  return new Response(stream, { status, headers });
}

describe('PortalClient', () => {
  it('builds dataset base url', () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_BASE_URL: 'https://portal.sqd.dev/datasets'
    });
    const client = new PortalClient(cfg);
    expect(client.buildDatasetBaseUrl('ethereum-mainnet')).toBe('https://portal.sqd.dev/datasets/ethereum-mainnet');
  });

  it('builds dataset base url with placeholder', () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_BASE_URL: 'https://portal.sqd.dev/{dataset}'
    });
    const client = new PortalClient(cfg);
    expect(client.buildDatasetBaseUrl('ethereum-mainnet')).toBe('https://portal.sqd.dev/ethereum-mainnet');
  });

  it('builds dataset base url when already suffixed', () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_BASE_URL: 'https://portal.sqd.dev/datasets/ethereum-mainnet'
    });
    const client = new PortalClient(cfg);
    expect(client.buildDatasetBaseUrl('ethereum-mainnet')).toBe('https://portal.sqd.dev/datasets/ethereum-mainnet');
  });

  it('normalizes base url trimming suffixes and slashes', () => {
    expect(normalizePortalBaseUrl('https://portal.sqd.dev/datasets/')).toBe('https://portal.sqd.dev/datasets');
    expect(normalizePortalBaseUrl('https://portal.sqd.dev/datasets/ethereum-mainnet/stream')).toBe(
      'https://portal.sqd.dev/datasets/ethereum-mainnet'
    );
  });

  it('falls back from finalized head', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/finalized-head')) {
        return new Response('', { status: 404 });
      }
      return new Response(JSON.stringify({ number: 7, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn } });
    const result = await client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', true);
    expect(result.head.number).toBe(7);
    expect(result.finalizedAvailable).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('streams ndjson blocks', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/stream')) {
        const ndjson = '{"header":{"number":1}}\n{"header":{"number":2}}\n';
        return streamResponse(ndjson, 200);
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1
    });
    expect(blocks).toHaveLength(2);
  });

  it('streams finalized ndjson blocks', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/finalized-stream')) {
        const ndjson = '{"header":{"number":3}}\n';
        return streamResponse(ndjson, 200);
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', true, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1
    });
    expect(blocks).toHaveLength(1);
  });

  it('falls back from finalized stream', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = vi.fn().mockImplementation((input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/finalized-stream')) {
        return new Response('missing', { status: 404 });
      }
      if (url.endsWith('/stream')) {
        const ndjson = '{"header":{"number":4}}\n';
        return streamResponse(ndjson, 200);
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    });
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', true, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1
    });
    expect(blocks).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns empty on 204', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response(null, { status: 204 });
    const client = new PortalClient(cfg, { fetchImpl });
    let seen = false;
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1
    }, undefined, () => {
      seen = true;
    });
    expect(blocks).toHaveLength(0);
    expect(seen).toBe(true);
  });

  it('returns empty on 200 without body', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response(null, { status: 200 });
    const client = new PortalClient(cfg, { fetchImpl });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1
    });
    expect(blocks).toHaveLength(0);
  });

  it('keeps request fields when unsupported field does not match', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let seenFields: unknown;
    const fetchImpl = vi.fn().mockImplementation((_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      seenFields = body.fields;
      const ndjson = '{"header":{"number":1}}\n';
      return streamResponse(ndjson, 200);
    });
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    (client as any).unsupportedFieldsByBaseUrl.set(baseUrl, new Set(['not-a-field']));
    await client.streamBlocks(baseUrl, false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1,
      fields: { block: { number: true } }
    });
    expect(seenFields).toEqual({ block: { number: true } });
  });

  it('throws on metadata fetch non-200', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('boom', { status: 500 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(client.getMetadata('https://portal.sqd.dev/datasets/ethereum-mainnet')).rejects.toThrow('server error');
  });

  it('skips refresh when metadata refresh already in flight', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_METADATA_TTL_MS: '0'
    });
    const fetchImpl = async () => new Response(JSON.stringify({ dataset: 'ethereum-mainnet', real_time: true }), { status: 200 });
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    (client as any).metadataCache.set(baseUrl, { data: { dataset: 'ethereum-mainnet', real_time: true }, fetchedAt: 0 });
    (client as any).metadataRefreshInFlight.set(baseUrl, Promise.resolve());
    const data = await client.getMetadata(baseUrl);
    expect(data.dataset).toBe('ethereum-mainnet');
  });

  it('refreshes metadata cache when stale', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_METADATA_TTL_MS: '0'
    });
    const fetchImpl = async () =>
      new Response(JSON.stringify({ dataset: 'ethereum-mainnet', aliases: ['eth'], real_time: true }), { status: 200 });
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    (client as any).metadataCache.set(baseUrl, { data: { dataset: 'ethereum-mainnet', real_time: false }, fetchedAt: 0 });
    await client.getMetadata(baseUrl);
    const refresh = (client as any).metadataRefreshInFlight.get(baseUrl) as Promise<void>;
    await refresh;
    const cached = (client as any).metadataCache.get(baseUrl);
    expect(cached.data.real_time).toBe(true);
  });

  it('resets circuit breaker after success when enabled', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_CIRCUIT_BREAKER_THRESHOLD: '1'
    });
    const fetchImpl = async () => new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    const client = new PortalClient(cfg, { fetchImpl });
    await client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false);
    expect((client as any).breakerFailures).toBe(0);
    expect((client as any).breakerOpenUntil).toBe(0);
  });

  it('fails after repeated negotiable field errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = vi.fn().mockImplementation(
      () => new Response('unknown field `authorizationList`', { status: 400 })
    );
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
        type: 'evm',
        fromBlock: 1,
        toBlock: 1,
        fields: { transaction: { authorizationList: true } }
      })
    ).rejects.toThrow('portal field negotiation failed');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('keeps log/trace/stateDiff fields when unsupported field does not match', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let seenFields: unknown;
    const fetchImpl = vi.fn().mockImplementation((_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      seenFields = body.fields;
      const ndjson = '{"header":{"number":1}}\n';
      return streamResponse(ndjson, 200);
    });
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    (client as any).unsupportedFieldsByBaseUrl.set(baseUrl, new Set(['not-a-field']));
    await client.streamBlocks(baseUrl, false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1,
      fields: {
        log: { address: true },
        trace: { action: true },
        stateDiff: { key: true }
      }
    });
    expect(seenFields).toEqual({
      log: { address: true },
      trace: { action: true },
      stateDiff: { key: true }
    });
  });

  it('maps rate limit errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('rate limit', { status: 429 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('Too Many Requests');
  });

  it('maps invalid params errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('bad request', { status: 400 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('invalid portal response');
  });

  it('fails when portal rejects required fields', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let call = 0;
    const fetchImpl = async (_input: unknown, _init?: RequestInit) => {
      call += 1;
      return new Response('Bad request: unknown field `withdrawalsRoot`', { status: 400 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    const request = {
      type: 'evm' as const,
      fromBlock: 1,
      toBlock: 1,
      fields: { block: { number: true, withdrawalsRoot: true } }
    };
    await expect(client.streamBlocks(baseUrl, false, request)).rejects.toThrow(
      'portal does not support required field withdrawalsRoot'
    );
    expect(call).toBe(1);
  });

  it('retries portal stream when negotiable fields are rejected', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    const fetchImpl = async (_input: unknown, init?: RequestInit) => {
      if (init?.body) {
        bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      }
      call += 1;
      if (call === 1) {
        return new Response('Bad request: unknown field `authorizationList`', { status: 400 });
      }
      return streamResponse('{"header":{"number":1},"transactions":[{"hash":"0x1","transactionIndex":0}]}\n', 200);
    };
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    const request = {
      type: 'evm' as const,
      fromBlock: 1,
      toBlock: 1,
      fields: { transaction: { hash: true, transactionIndex: true, authorizationList: true } },
      transactions: [{}]
    };
    const blocks = await client.streamBlocks(baseUrl, false, request);
    expect(blocks).toHaveLength(1);

    const first = bodies[0] as { fields?: { transaction?: Record<string, unknown> } };
    const second = bodies[1] as { fields?: { transaction?: Record<string, unknown> } };
    expect(first.fields?.transaction?.authorizationList).toBe(true);
    expect(second.fields?.transaction?.authorizationList).toBeUndefined();
  });

  it('maps unauthorized errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('unauthorized', { status: 401 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('unauthorized');
  });

  it('maps conflict errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () =>
      new Response(JSON.stringify({ previousBlocks: [{ number: 1 }] }), {
        status: 409,
        headers: { 'content-type': 'application/json' }
      });
    const client = new PortalClient(cfg, { fetchImpl });
    expect.assertions(1);
    try {
      await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 });
    } catch (err) {
      expect((err as { data?: { previousBlocks?: unknown[] } }).data?.previousBlocks).toHaveLength(1);
    }
  });

  it('ignores non-array previousBlocks on conflict', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () =>
      new Response(JSON.stringify({ previousBlocks: 'nope' }), {
        status: 409,
        headers: { 'content-type': 'application/json' }
      });
    const client = new PortalClient(cfg, { fetchImpl });
    expect.assertions(1);
    try {
      await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 });
    } catch (err) {
      expect((err as { data?: { previousBlocks?: unknown[] } }).data?.previousBlocks).toBeUndefined();
    }
  });

  it('handles conflict with non-object json body', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () =>
      new Response(JSON.stringify('oops'), {
        status: 409,
        headers: { 'content-type': 'application/json' }
      });
    const client = new PortalClient(cfg, { fetchImpl });
    expect.assertions(1);
    try {
      await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 });
    } catch (err) {
      expect((err as { data?: { previousBlocks?: unknown[] } }).data?.previousBlocks).toBeUndefined();
    }
  });

  it('captures stream headers', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () =>
      streamResponse('{"header":{"number":1}}\n', 200, {
        'X-Sqd-Finalized-Head-Number': '10',
        'X-Sqd-Finalized-Head-Hash': '0xabc'
      });
    const client = new PortalClient(cfg, { fetchImpl });
    let seen: Record<string, string> = {};
    await client.streamBlocks(
      'https://portal.sqd.dev/datasets/ethereum-mainnet',
      false,
      { type: 'evm', fromBlock: 1, toBlock: 1 },
      undefined,
      (headers) => {
        seen = {
          number: headers.finalizedHeadNumber || '',
          hash: headers.finalizedHeadHash || ''
        };
      }
    );
    expect(seen.number).toBe('10');
    expect(seen.hash).toBe('0xabc');
  });

  it('handles missing stream headers', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => streamResponse('{"header":{"number":1}}\n', 200);
    const client = new PortalClient(cfg, { fetchImpl });
    let seen: Record<string, string | undefined> = {};
    await client.streamBlocks(
      'https://portal.sqd.dev/datasets/ethereum-mainnet',
      false,
      { type: 'evm', fromBlock: 1, toBlock: 1 },
      undefined,
      (headers) => {
        seen = {
          number: headers.finalizedHeadNumber,
          hash: headers.finalizedHeadHash
        };
      }
    );
    expect(seen.number).toBeUndefined();
    expect(seen.hash).toBeUndefined();
  });

  it('adds api key and traceparent headers', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_API_KEY: 'secret',
      PORTAL_API_KEY_HEADER: 'X-Api-Key'
    });
    const fetchImpl = async (_input: unknown, init?: RequestInit) => {
      const headers = (init?.headers || {}) as Record<string, string>;
      expect(headers.Accept).toBe('application/json');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Api-Key']).toBe('secret');
      expect(headers.traceparent).toBe('trace');
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    await (client as any).request('https://portal.sqd.dev/datasets/ethereum-mainnet/head', 'POST', 'application/json', '{}', 'trace');
  });

  it('labels unknown endpoints', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async (_input: unknown, init?: RequestInit) => {
      const headers = (init?.headers || {}) as Record<string, string>;
      expect(headers.Accept).toBe('application/json');
      expect(headers['Content-Type']).toBeUndefined();
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    await (client as any).request('https://portal.sqd.dev/datasets/ethereum-mainnet/other', 'GET', 'application/json');
  });

  it('maps unavailable errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('unavailable', { status: 503 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('unavailable');
  });

  it('maps unknown status to server error', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('boom', { status: 500 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('server error');
  });

  it('includes readBody failure context', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () =>
      ({
        status: 400,
        text: async () => {
          throw new Error('text failed');
        },
        clone: () => new Response('not json', { status: 400 })
      } as unknown as Response);
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('response body unavailable');
  });

  it('includes json parse error context', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('not json', { status: 400 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('json parse error');
  });

  it('uses fallback text when response body empty', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('', { status: 400 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('response body unavailable');
  });

  it('includes readBody failure context for non-error throw', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () =>
      ({
        status: 400,
        text: async () => {
          throw 'boom';
        },
        clone: () => new Response('not json', { status: 400 })
      } as unknown as Response);
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('response body unavailable');
  });

  it('fetchHead maps missing data', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('missing', { status: 404 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('block not found');
  });

  it('propagates fetch errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => {
      throw new Error('boom');
    };
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('boom');
  });

  it('logs fetch errors', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const fetchImpl = async () => {
      throw 'boom';
    };
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn } });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('server error');
    expect(warn).toHaveBeenCalled();
  });

  it('logs request errors with Error objects', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const warn = vi.fn();
    const fetchImpl = async () => {
      throw new Error('boom');
    };
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn } });
    await expect((client as any).request('https://portal.sqd.dev/datasets/ethereum-mainnet/stream', 'GET', 'application/json')).rejects.toThrow(
      'boom'
    );
    expect(warn).toHaveBeenCalled();
  });

  it('handles request errors when warn logger missing', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => {
      throw new Error('boom');
    };
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn() } });
    await expect((client as any).request('https://portal.sqd.dev/datasets/ethereum-mainnet/stream', 'GET', 'application/json')).rejects.toThrow(
      'boom'
    );
  });

  it('logs request success', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const info = vi.fn();
    const fetchImpl = async () => new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    const client = new PortalClient(cfg, { fetchImpl, logger: { info } });
    await client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false);
    expect(info).toHaveBeenCalled();
  });

  it('propagates request id header', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    let seenRequestId: string | undefined;
    const fetchImpl = async (_input: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      seenRequestId = headers?.['X-Request-Id'];
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    await client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false, undefined, 'req-123');
    expect(seenRequestId).toBe('req-123');
  });

  it('normalizes fetch errors to rpc error', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => {
      throw new Error('boom');
    };
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('boom');
  });

  it('caches metadata within ttl', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_METADATA_TTL_MS: '60000'
    });
    let calls = 0;
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/metadata')) {
        calls += 1;
        return new Response(JSON.stringify({ dataset: 'ethereum-mainnet', real_time: true, start_block: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    await client.getMetadata(baseUrl);
    await client.getMetadata(baseUrl);
    expect(calls).toBe(1);
  });

  it('logs metadata info on fetch', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const info = vi.fn();
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/metadata')) {
        return new Response(JSON.stringify({ dataset: 'ethereum-mainnet', real_time: true, start_block: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl, logger: { info } });
    await client.getMetadata('https://portal.sqd.dev/datasets/ethereum-mainnet');
    expect(info).toHaveBeenCalled();
  });

  it('returns cached metadata on refresh error', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_METADATA_TTL_MS: '0'
    });
    let calls = 0;
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (!url.endsWith('/metadata')) {
        return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
      }
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ dataset: 'ethereum-mainnet', start_block: 5 }), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    };
    const warn = vi.fn();
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn } });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    const first = await client.getMetadata(baseUrl);
    const second = await client.getMetadata(baseUrl);
    await new Promise((resolve) => setImmediate(resolve));
    expect(first.start_block).toBe(5);
    expect(second.start_block).toBe(5);
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalled();
  });

  it('uses cached metadata when refresh throws non-error', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_METADATA_TTL_MS: '0'
    });
    const warn = vi.fn();
    const client = new PortalClient(cfg, { fetchImpl: async () => new Response(null, { status: 200 }), logger: { info: vi.fn(), warn } });
    const baseUrl = 'https://portal.sqd.dev/datasets/ethereum-mainnet';
    (client as any).metadataCache.set(baseUrl, {
      data: { dataset: 'ethereum-mainnet', start_block: 9, real_time: true },
      fetchedAt: Date.now()
    });
    (client as any).fetchMetadata = async () => {
      throw 'boom';
    };
    const result = await client.getMetadata(baseUrl);
    await new Promise((resolve) => setImmediate(resolve));
    expect(result.start_block).toBe(9);
    expect(warn).toHaveBeenCalled();
  });

  it('throws when metadata fetch fails without cache', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/metadata')) {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(client.getMetadata('https://portal.sqd.dev/datasets/ethereum-mainnet')).rejects.toThrow('server error');
  });

  it('opens circuit after threshold and short-circuits requests', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_CIRCUIT_BREAKER_THRESHOLD: '2',
      PORTAL_CIRCUIT_BREAKER_RESET_MS: '10000'
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('server error');
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('server error');
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow(
      'portal circuit open'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('closes circuit after reset window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_CIRCUIT_BREAKER_THRESHOLD: '1',
      PORTAL_CIRCUIT_BREAKER_RESET_MS: '1'
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ number: 1, hash: '0xabc' }), { status: 200 }));
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('server error');
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow(
      'portal circuit open'
    );
    await vi.advanceTimersByTimeAsync(2);
    const result = await client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false);
    expect(result.head.number).toBe(1);
    vi.useRealTimers();
  });

  it('reopens circuit when half-open request fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      PORTAL_CIRCUIT_BREAKER_THRESHOLD: '1',
      PORTAL_CIRCUIT_BREAKER_RESET_MS: '1'
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new PortalClient(cfg, { fetchImpl, logger: { info: vi.fn(), warn: vi.fn() } });
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('server error');
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow(
      'portal circuit open'
    );
    await vi.advanceTimersByTimeAsync(2);
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow('server error');
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false)).rejects.toThrow(
      'portal circuit open'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
