import { describe, expect, it } from 'vitest';
import { loadConfig, parseListenAddr } from '../src/config';
import { normalizePortalBaseUrl } from '../src/portal/client';

describe('config', () => {
  it('parses listen addr', () => {
    expect(parseListenAddr(':8080')).toEqual({ host: '0.0.0.0', port: 8080 });
    expect(parseListenAddr('127.0.0.1:9000')).toEqual({ host: '127.0.0.1', port: 9000 });
  });

  it('normalizes portal base url', () => {
    expect(normalizePortalBaseUrl('https://portal.sqd.dev/datasets/ethereum-mainnet/stream')).toBe(
      'https://portal.sqd.dev/datasets/ethereum-mainnet'
    );
  });

  it('loads single-chain config', () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    expect(cfg.serviceMode).toBe('single');
    expect(cfg.portalDataset).toBe('ethereum-mainnet');
  });
});
