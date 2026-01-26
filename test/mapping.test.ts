import { describe, expect, it } from 'vitest';
import { defaultDatasetMap, resolveDataset, supportedChainIds } from '../src/portal/mapping';
import { loadConfig } from '../src/config';

describe('mapping', () => {
  it('resolves dataset from map', () => {
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_DATASET_MAP: '{"1":"ethereum-mainnet"}'
    });
    expect(resolveDataset(1, config)).toBe('ethereum-mainnet');
  });

  it('uses default dataset when map missing', () => {
    const config = loadConfig({ SERVICE_MODE: 'multi' });
    expect(resolveDataset(1, config)).toBe('ethereum-mainnet');
  });

  it('skips default datasets when disabled', () => {
    const config = loadConfig({ SERVICE_MODE: 'multi', PORTAL_USE_DEFAULT_DATASETS: 'false' });
    expect(resolveDataset(1, config)).toBeNull();
  });

  it('returns null for unsupported chain', () => {
    const config = loadConfig({ SERVICE_MODE: 'multi' });
    expect(resolveDataset(999999, config)).toBeNull();
  });

  it('lists supported chain ids', () => {
    expect(supportedChainIds()).toContain(1);
  });

  it('returns default dataset map copy', () => {
    const map = defaultDatasetMap();
    expect(map['1']).toBe('ethereum-mainnet');
  });
});
