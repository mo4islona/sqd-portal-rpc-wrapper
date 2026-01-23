import { describe, expect, it } from 'vitest';
import { convertBlockToRpc, convertLogToRpc, convertTraceToRpc, convertTxToRpc } from '../src/rpc/conversion';
import { PortalBlockResponse, PortalTransaction, PortalTrace } from '../src/portal/types';

const header = {
  number: 10,
  hash: '0xblock',
  parentHash: '0xparent',
  timestamp: 1,
  miner: '0xminer',
  gasUsed: '0x1',
  gasLimit: '0x2',
  baseFeePerGas: '0x3',
  nonce: '0x4',
  difficulty: '0x5',
  totalDifficulty: '0x6',
  size: '0x7',
  stateRoot: '0xstate',
  transactionsRoot: '0xtx',
  receiptsRoot: '0xrec',
  logsBloom: '0xlog',
  extraData: '0xextra',
  mixHash: '0xmix',
  sha3Uncles: '0xuncle'
};

const tx: PortalTransaction = {
  transactionIndex: 0,
  hash: '0xtx',
  from: '0xfrom',
  to: '0xto',
  value: '0x1',
  input: '0x',
  nonce: '0x1',
  gas: '0x2',
  type: '0x0'
};

describe('conversion', () => {
  it('converts block with hashes', () => {
    const block: PortalBlockResponse = { header, transactions: [tx] };
    const result = convertBlockToRpc(block, false);
    expect(result.transactions).toEqual(['0xtx']);
  });

  it('converts tx with hex quantities', () => {
    const result = convertTxToRpc(tx, header);
    expect(result.blockNumber).toBe('0xa');
    expect(result.transactionIndex).toBe('0x0');
  });

  it('converts log', () => {
    const block: PortalBlockResponse = {
      header,
      logs: [
        {
          logIndex: 1,
          transactionIndex: 0,
          transactionHash: '0xtx',
          address: '0xaddr',
          data: '0xdata',
          topics: ['0xtopic']
        }
      ]
    };
    const result = convertLogToRpc(block.logs![0], block);
    expect(result.blockNumber).toBe('0xa');
  });

  it('converts call trace', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'call',
      subtraces: 0,
      action: {},
      callFrom: '0xfrom',
      callTo: '0xto',
      callValue: '0x1',
      callGas: '0x2',
      callInput: '0x',
      callType: 'call',
      callResultGasUsed: '0x3',
      callResultOutput: '0xout'
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect(result.type).toBe('call');
    expect(result.transactionHash).toBe('0xtx');
  });
});
