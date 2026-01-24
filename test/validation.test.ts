import { describe, expect, it } from 'vitest';
import { assertArray, assertObject, parseBlockNumber, parseLogFilter, parseTransactionIndex } from '../src/rpc/validation';
import { loadConfig } from '../src/config';

const config = loadConfig({
  SERVICE_MODE: 'single',
  PORTAL_DATASET: 'ethereum-mainnet',
  PORTAL_CHAIN_ID: '1'
});

const portal = {
  fetchHead: async () => ({ head: { number: 123, hash: '0xabc' }, finalizedAvailable: false })
};
const portalFinalized = {
  fetchHead: async (_baseUrl: string, finalized: boolean) => ({
    head: { number: finalized ? 10 : 9, hash: '0xabc' },
    finalizedAvailable: finalized
  })
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

  it('parses earliest block tag', async () => {
    const result = await parseBlockNumber(portal as any, 'https://portal', 'earliest', config);
    expect(result.number).toBe(0);
  });

  it('parses finalized block tag', async () => {
    const result = await parseBlockNumber(portalFinalized as any, 'https://portal', 'finalized', config);
    expect(result.number).toBe(10);
    expect(result.useFinalized).toBe(true);
  });

  it('parses numeric block number', async () => {
    const result = await parseBlockNumber(portal as any, 'https://portal', 2, config);
    expect(result.number).toBe(2);
  });

  it('rejects non-integer block number', async () => {
    await expect(parseBlockNumber(portal as any, 'https://portal', 1.5, config)).rejects.toThrow('invalid block number');
  });

  it('rejects invalid block number type', async () => {
    await expect(parseBlockNumber(portal as any, 'https://portal', { bad: true } as any, config)).rejects.toThrow(
      'invalid block number'
    );
  });

  it('rejects block number above max', async () => {
    const limited = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_BLOCK_NUMBER: '10'
    });
    await expect(parseBlockNumber(portal as any, 'https://portal', '0x20', limited)).rejects.toThrow('invalid block number');
  });

  it('rejects block number above safe integer', async () => {
    const limited = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_BLOCK_NUMBER: '9007199254740993'
    });
    await expect(parseBlockNumber(portal as any, 'https://portal', '9007199254740993', limited)).rejects.toThrow(
      'invalid block number'
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

  it('parses address filter', async () => {
    const result = await parseLogFilter(
      portal as any,
      'https://portal',
      { address: '0x' + '11'.repeat(20) },
      config
    );
    expect(result.logFilter.address).toHaveLength(1);
  });

  it('parses address array filter', async () => {
    const result = await parseLogFilter(
      portal as any,
      'https://portal',
      { address: ['0x' + '11'.repeat(20), '0x' + '22'.repeat(20)] },
      config
    );
    expect(result.logFilter.address).toHaveLength(2);
  });

  it('parses topic arrays and nulls', async () => {
    const result = await parseLogFilter(
      portal as any,
      'https://portal',
      {
        fromBlock: '0x1',
        toBlock: '0x1',
        topics: [null, ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)]]
      },
      config
    );
    expect(result.logFilter.topic1).toHaveLength(2);
  });

  it('rejects invalid topics filter', async () => {
    await expect(parseLogFilter(portal as any, 'https://portal', { topics: 'bad' } as any, config)).rejects.toThrow(
      'invalid topics filter'
    );
  });

  it('rejects invalid topic entries', async () => {
    await expect(
      parseLogFilter(
        portal as any,
        'https://portal',
        { topics: [['0x' + 'aa'.repeat(32), 1]] } as any,
        config
      )
    ).rejects.toThrow('invalid topic filter');
  });

  it('rejects invalid topic type', async () => {
    await expect(
      parseLogFilter(
        portal as any,
        'https://portal',
        { topics: [{}] } as any,
        config
      )
    ).rejects.toThrow('invalid topic filter');
  });

  it('rejects too many topics', async () => {
    await expect(
      parseLogFilter(
        portal as any,
        'https://portal',
        { topics: ['0x' + '11'.repeat(32), '0x' + '11'.repeat(32), '0x' + '11'.repeat(32), '0x' + '11'.repeat(32), '0x' + '11'.repeat(32)] },
        config
      )
    ).rejects.toThrow('invalid topics filter');
  });

  it('rejects range too large', async () => {
    const limited = loadConfig({
      SERVICE_MODE: 'single',
      PORTAL_DATASET: 'ethereum-mainnet',
      PORTAL_CHAIN_ID: '1',
      MAX_LOG_BLOCK_RANGE: '1'
    });
    await expect(
      parseLogFilter(portal as any, 'https://portal', { fromBlock: '0x1', toBlock: '0x2' }, limited)
    ).rejects.toThrow('range too large');
  });

  it('rejects invalid address filter types', async () => {
    await expect(parseLogFilter(portal as any, 'https://portal', { address: 1 } as any, config)).rejects.toThrow(
      'invalid address filter'
    );
    await expect(
      parseLogFilter(portal as any, 'https://portal', { address: ['0x' + '11'.repeat(20), 1] } as any, config)
    ).rejects.toThrow('invalid address filter');
  });

  it('forces non-finalized when only fromBlock is finalized', async () => {
    const portalRange = {
      fetchHead: async (_baseUrl: string, finalized: boolean) => ({
        head: { number: 10, hash: '0xabc' },
        finalizedAvailable: finalized
      })
    };
    const result = await parseLogFilter(
      portalRange as any,
      'https://portal',
      { fromBlock: 'finalized' },
      config
    );
    expect(result.useFinalized).toBe(false);
  });

  it('rejects fromBlock greater than toBlock', async () => {
    await expect(
      parseLogFilter(portal as any, 'https://portal', { fromBlock: '0x2', toBlock: '0x1' }, config)
    ).rejects.toThrow('invalid block range');
  });

  it('parses hex block number', async () => {
    const result = await parseBlockNumber(portal as any, 'https://portal', '0x2a', config);
    expect(result.number).toBe(42);
  });

  it('rejects invalid hex block number', async () => {
    await expect(parseBlockNumber(portal as any, 'https://portal', '0xzz', config)).rejects.toThrow(
      'invalid block number'
    );
  });

  it('parses transaction index', () => {
    expect(parseTransactionIndex('0x2')).toBe(2);
    expect(parseTransactionIndex(3)).toBe(3);
  });

  it('rejects invalid transaction index', () => {
    expect(() => parseTransactionIndex(-1)).toThrow('invalid transaction index');
    expect(() => parseTransactionIndex('0xzz')).toThrow('invalid transaction index');
    expect(() => parseTransactionIndex('-1')).toThrow('invalid transaction index');
    expect(() => parseTransactionIndex(null)).toThrow('invalid transaction index');
  });

  it('assert helpers throw', () => {
    expect(() => assertArray({}, 'bad')).toThrow('bad');
    expect(() => assertObject([], 'bad')).toThrow('bad');
  });
});
