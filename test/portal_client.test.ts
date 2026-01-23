import { describe, expect, it } from 'vitest';
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

  it('falls back from finalized head', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.endsWith('/finalized-head')) {
        return new Response('', { status: 404 });
      }
      return new Response(JSON.stringify({ number: 7, hash: '0xabc' }), { status: 200 });
    };
    const client = new PortalClient(cfg, { fetchImpl });
    const result = await client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', true, 'finalized');
    expect(result.head.number).toBe(7);
    expect(result.finalizedAvailable).toBe(false);
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

  it('returns empty on 204', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response(null, { status: 204 });
    const client = new PortalClient(cfg, { fetchImpl });
    const blocks = await client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, {
      type: 'evm',
      fromBlock: 1,
      toBlock: 1
    });
    expect(blocks).toHaveLength(0);
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
    const fetchImpl = async () => new Response('conflict', { status: 409 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(
      client.streamBlocks('https://portal.sqd.dev/datasets/ethereum-mainnet', false, { type: 'evm', fromBlock: 1, toBlock: 1 })
    ).rejects.toThrow('conflict');
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

  it('fetchHead maps missing data', async () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    const fetchImpl = async () => new Response('missing', { status: 404 });
    const client = new PortalClient(cfg, { fetchImpl });
    await expect(client.fetchHead('https://portal.sqd.dev/datasets/ethereum-mainnet', false, '', undefined)).rejects.toThrow(
      'block not found'
    );
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
});
