import { describe, expect, it } from 'vitest';
import { handleJsonRpc } from '../src/rpc/handlers';
import { loadConfig } from '../src/config';

const config = loadConfig({
  SERVICE_MODE: 'single',
  PORTAL_DATASET: 'ethereum-mainnet',
  PORTAL_CHAIN_ID: '1'
});

const portal = {
  fetchHead: async () => ({ head: { number: 42, hash: '0xabc' }, finalizedAvailable: false }),
  streamBlocks: async () => [],
  buildDatasetBaseUrl: (dataset: string) => `https://portal/${dataset}`
};

const portalWithData = {
  fetchHead: async () => ({ head: { number: 5, hash: '0xabc' }, finalizedAvailable: false }),
  streamBlocks: async () => [
    {
      header: { number: 5, hash: '0xblock', parentHash: '0xparent', timestamp: 1, miner: '0xminer', gasUsed: '0x1', gasLimit: '0x2', nonce: '0x3', difficulty: '0x4', totalDifficulty: '0x5', size: '0x6', stateRoot: '0xstate', transactionsRoot: '0xtx', receiptsRoot: '0xrec', logsBloom: '0xlog', extraData: '0xextra', mixHash: '0xmix', sha3Uncles: '0xuncle' },
      transactions: [{ transactionIndex: 0, hash: '0xtx', from: '0xfrom', to: '0xto', value: '0x1', input: '0x', nonce: '0x1', gas: '0x2', type: '0x0' }],
      logs: [{ logIndex: 0, transactionIndex: 0, transactionHash: '0xtx', address: '0xaddr', data: '0xdata', topics: ['0xtopic'] }],
      traces: [{ transactionIndex: 0, traceAddress: [], type: 'call', subtraces: 0, action: {}, callFrom: '0xfrom', callTo: '0xto', callValue: '0x1', callGas: '0x2' }]
    }
  ],
  buildDatasetBaseUrl: (dataset: string) => `https://portal/${dataset}`
};

describe('handlers', () => {
  it('handles eth_chainId', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(response.result).toBe('0x1');
  });

  it('handles eth_getBlockByNumber empty', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x1', false] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(response.result).toBeNull();
  });

  it('rejects unsupported method', async () => {
    const { response, httpStatus } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [] },
      { config, portal: portal as any, chainId: 1, requestId: 'test' }
    );
    expect(httpStatus).toBe(404);
    expect(response.error?.code).toBe(-32601);
  });

  it('handles eth_getLogs', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x5', toBlock: '0x5' }] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(Array.isArray(response.result)).toBe(true);
  });

  it('handles eth_getTransactionByBlockNumberAndIndex', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByBlockNumberAndIndex', params: ['0x5', '0x0'] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(response.result).toBeTruthy();
  });

  it('handles trace_block', async () => {
    const { response } = await handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'trace_block', params: ['0x5'] },
      { config, portal: portalWithData as any, chainId: 1, requestId: 'test' }
    );
    expect(Array.isArray(response.result)).toBe(true);
  });
});
