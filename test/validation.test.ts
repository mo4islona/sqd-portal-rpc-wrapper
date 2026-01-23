import { describe, expect, it } from 'vitest';
import { parseBlockNumber, parseLogFilter } from '../src/rpc/validation';
import { loadConfig } from '../src/config';

const config = loadConfig({
  SERVICE_MODE: 'single',
  PORTAL_DATASET: 'ethereum-mainnet',
  PORTAL_CHAIN_ID: '1'
});

const portal = {
  fetchHead: async () => ({ head: { number: 123, hash: '0xabc' }, finalizedAvailable: false })
};

describe('validation', () => {
  it('parses latest block tag', async () => {
    const result = await parseBlockNumber(portal as any, 'https://portal', 'latest', config);
    expect(result.number).toBe(123);
  });

  it('rejects pending', async () => {
    await expect(parseBlockNumber(portal as any, 'https://portal', 'pending', config)).rejects.toThrow(
      'pending block not found'
    );
  });

  it('rejects blockHash filter', async () => {
    await expect(
      parseLogFilter(portal as any, 'https://portal', { blockHash: '0xabc' }, config)
    ).rejects.toThrow('blockHash filter not supported');
  });

  it('rejects too many addresses', async () => {
    const addresses = Array.from({ length: 1001 }, () => '0x' + '11'.repeat(20));
    await expect(
      parseLogFilter(portal as any, 'https://portal', { address: addresses }, config)
    ).rejects.toThrow('specify less number of address');
  });

  it('parses topic filters', async () => {
    const result = await parseLogFilter(
      portal as any,
      'https://portal',
      { fromBlock: '0x1', toBlock: '0x1', topics: ['0x' + 'aa'.repeat(32)] },
      config
    );
    expect(result.logFilter.topic0).toHaveLength(1);
  });

  it('parses hex block number', async () => {
    const result = await parseBlockNumber(portal as any, 'https://portal', '0x2a', config);
    expect(result.number).toBe(42);
  });
});
