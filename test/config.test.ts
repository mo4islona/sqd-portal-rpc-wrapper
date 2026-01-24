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

  it('rejects invalid service mode', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'invalid',
        PORTAL_DATASET: 'ethereum-mainnet',
        PORTAL_CHAIN_ID: '1'
      })
    ).toThrow('SERVICE_MODE');
  });

  it('defaults service mode to single', () => {
    const cfg = loadConfig({
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1'
    });
    expect(cfg.serviceMode).toBe('single');
  });

  it('rejects invalid dataset map', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET_MAP: '[]',
        PORTAL_CHAIN_ID: '1'
      })
    ).toThrow('PORTAL_DATASET_MAP');
  });

  it('rejects null dataset map', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET_MAP: 'null',
        PORTAL_CHAIN_ID: '1'
      })
    ).toThrow('PORTAL_DATASET_MAP');
  });

  it('filters empty dataset map entries', () => {
    const cfg = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET_MAP: '{"1":"","2":"ethereum-mainnet"}',
      PORTAL_CHAIN_ID: '2'
    });
    expect(cfg.portalDatasetMap).toEqual({ '2': 'ethereum-mainnet' });
  });

  it('requires chain id when dataset map has multiple entries', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET_MAP: '{"1":"ethereum-mainnet","10":"optimism-mainnet"}'
      })
    ).toThrow('PORTAL_CHAIN_ID');
  });

  it('rejects invalid listen addr', () => {
    expect(() => parseListenAddr('bad')).toThrow('invalid listen address');
  });

  it('rejects invalid numeric env', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET: 'ethereum-mainnet',
        PORTAL_CHAIN_ID: '1',
        MAX_LOG_BLOCK_RANGE: 'nope'
      })
    ).toThrow('invalid number');
  });

  it('rejects invalid chain id env', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET: 'ethereum-mainnet',
        PORTAL_CHAIN_ID: 'nope'
      })
    ).toThrow('invalid number');
  });

  it('rejects invalid dataset map json', () => {
    expect(() =>
      loadConfig({
        SERVICE_MODE: 'single',
        PORTAL_DATASET_MAP: '{invalid}',
        PORTAL_CHAIN_ID: '1'
      })
    ).toThrow();
  });
});
