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
  type: '0x0',
  gasPrice: '0x5',
  maxFeePerGas: '0x6',
  maxPriorityFeePerGas: '0x7',
  chainId: '0x1',
  yParity: '0x1',
  v: '0x25',
  r: '0x01',
  s: '0x02'
};

describe('conversion', () => {
  it('converts block with hashes', () => {
    const block: PortalBlockResponse = { header, transactions: [tx] };
    const result = convertBlockToRpc(block, false);
    expect(result.transactions).toEqual(['0xtx']);
  });

  it('handles block without transactions (hashes)', () => {
    const block: PortalBlockResponse = { header };
    const result = convertBlockToRpc(block, false);
    expect(result.transactions).toEqual([]);
  });

  it('converts block with full transactions', () => {
    const block: PortalBlockResponse = { header, transactions: [tx] };
    const result = convertBlockToRpc(block, true);
    expect(Array.isArray(result.transactions)).toBe(true);
    expect((result.transactions as Record<string, unknown>[])[0].hash).toBe('0xtx');
  });

  it('handles block without transactions (full tx)', () => {
    const block: PortalBlockResponse = { header };
    const result = convertBlockToRpc(block, true);
    expect(result.transactions).toEqual([]);
  });

  it('preserves nonce formatting and omits null totalDifficulty', () => {
    const block: PortalBlockResponse = {
      header: { ...header, nonce: '0x0000000000000000', totalDifficulty: null },
      transactions: []
    };
    const result = convertBlockToRpc(block, false);
    expect(result.nonce).toBe('0x0000000000000000');
    expect('totalDifficulty' in result).toBe(false);
  });

  it('passes through non-hex nonce values', () => {
    const block: PortalBlockResponse = {
      header: { ...header, nonce: 'not-hex' },
      transactions: []
    };
    const result = convertBlockToRpc(block, false);
    expect(result.nonce).toBe('not-hex');
  });

  it('normalizes numeric nonce', () => {
    const block: PortalBlockResponse = {
      header: { ...header, nonce: 10 },
      transactions: []
    };
    const result = convertBlockToRpc(block, false);
    expect(result.nonce).toBe('0x000000000000000a');
  });

  it('converts tx with hex quantities', () => {
    const result = convertTxToRpc(tx, header);
    expect(result.blockNumber).toBe('0xa');
    expect(result.transactionIndex).toBe('0x0');
    expect(result.gasPrice).toBe('0x5');
    expect(result.maxFeePerGas).toBe('0x6');
    expect(result.maxPriorityFeePerGas).toBe('0x7');
    expect(result.chainId).toBe('0x1');
    expect(result.yParity).toBe('0x1');
  });

  it('converts withdrawals when present', () => {
    const block: PortalBlockResponse = {
      header: { ...header, withdrawalsRoot: '0x' + '11'.repeat(32) },
      withdrawals: [{ index: 1, validatorIndex: 2, address: '0x' + '11'.repeat(20), amount: '0x3' }],
      transactions: []
    };
    const result = convertBlockToRpc(block, false) as { withdrawals?: Record<string, unknown>[]; withdrawalsRoot?: string };
    expect(result.withdrawalsRoot).toBe('0x' + '11'.repeat(32));
    expect(result.withdrawals?.[0].amount).toBe('0x3');
  });

  it('includes blob and beacon header fields when present', () => {
    const block: PortalBlockResponse = {
      header: {
        ...header,
        blobGasUsed: '0x10',
        excessBlobGas: '0x11',
        parentBeaconBlockRoot: '0x' + '22'.repeat(32)
      },
      transactions: []
    };
    const result = convertBlockToRpc(block, false) as {
      blobGasUsed?: string;
      excessBlobGas?: string;
      parentBeaconBlockRoot?: string;
    };
    expect(result.blobGasUsed).toBe('0x10');
    expect(result.excessBlobGas).toBe('0x11');
    expect(result.parentBeaconBlockRoot).toBe('0x' + '22'.repeat(32));
  });

  it('omits optional tx fields when missing', () => {
    const minimal: PortalTransaction = {
      transactionIndex: 1,
      hash: '0xtx2',
      from: '0xfrom',
      value: '0x0',
      input: '0x',
      nonce: '0x0',
      gas: '0x1',
      type: '0x0'
    };
    const result = convertTxToRpc(minimal, header);
    expect(result.to).toBeNull();
    expect(result.gasPrice).toBeUndefined();
    expect(result.maxFeePerGas).toBeUndefined();
    expect(result.maxPriorityFeePerGas).toBeUndefined();
    expect(result.chainId).toBeUndefined();
    expect(result.yParity).toBeUndefined();
  });

  it('sets to null for contract creation', () => {
    const creationTx: PortalTransaction = { ...tx, to: undefined };
    const result = convertTxToRpc(creationTx, header);
    expect(result.to).toBeNull();
  });

  it('preserves zero-value signature fields', () => {
    const zeroSig: PortalTransaction = { ...tx, v: '0x0', r: '0x0', s: '0x0' };
    const result = convertTxToRpc(zeroSig, header);
    expect(result.v).toBe('0x0');
    expect(result.r).toBe('0x0');
    expect(result.s).toBe('0x0');
  });

  it('adds blob and access list fields when present', () => {
    const withBlob: PortalTransaction = {
      ...tx,
      accessList: [],
      maxFeePerBlobGas: '0x9',
      blobVersionedHashes: ['0x' + 'ab'.repeat(32)]
    };
    const result = convertTxToRpc(withBlob, header);
    expect(result.accessList).toEqual([]);
    expect(result.maxFeePerBlobGas).toBe('0x9');
    expect(result.blobVersionedHashes).toEqual(['0x' + 'ab'.repeat(32)]);
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

  it('converts create trace', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'create',
      subtraces: 0,
      action: {},
      createFrom: '0xfrom',
      createValue: '0x1',
      createGas: '0x2',
      createInit: '0xinit',
      createResultGasUsed: '0x3',
      createResultAddress: '0xaddr',
      createResultCode: '0xcode'
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect(result.type).toBe('create');
    expect((result.result as Record<string, unknown>).address).toBe('0xaddr');
    expect((result.result as Record<string, unknown>).code).toBe('0xcode');
  });

  it('converts suicide trace', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'suicide',
      subtraces: 0,
      action: {},
      suicideAddress: '0xaddr',
      suicideRefundAddress: '0xref',
      suicideBalance: '0x1'
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect(result.type).toBe('suicide');
    expect((result.action as Record<string, unknown>).refundAddress).toBe('0xref');
  });

  it('converts reward trace', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'reward',
      subtraces: 0,
      action: {},
      rewardAuthor: '0xminer',
      rewardType: 'block',
      rewardValue: '0x2'
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect(result.type).toBe('reward');
    expect((result.action as Record<string, unknown>).rewardType).toBe('block');
  });

  it('uses action fields when provided', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'call',
      subtraces: 0,
      callFrom: '0xignored',
      callTo: '0xignoredto',
      action: {
        from: '0xfrom',
        to: '0xto',
        value: '0x1',
        gas: '0x2',
        input: '0x',
        callType: 'call',
        init: '0xinit',
        address: '0xaddr',
        balance: '0x3',
        refundAddress: '0xref',
        author: '0xauth',
        rewardType: 'block'
      }
    };
    const result = convertTraceToRpc(trace, header, {});
    const action = result.action as Record<string, unknown>;
    expect(action.from).toBe('0xfrom');
    expect(action.to).toBe('0xto');
    expect(action.refundAddress).toBe('0xref');
    expect(action.rewardType).toBe('block');
  });

  it('sets trace error and omit result', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'call',
      subtraces: 0,
      action: {},
      error: 'reverted'
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect(result.error).toBe('reverted');
    expect(result.result).toBeUndefined();
  });

  it('uses trace.result fields', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'call',
      subtraces: 0,
      action: {},
      result: { gasUsed: '0x2', output: '0xout' },
      revertReason: 'oops'
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect((result.result as Record<string, unknown>).gasUsed).toBe('0x2');
    expect(result.revertReason).toBe('oops');
  });

  it('uses trace.result address and code', () => {
    const trace: PortalTrace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'call',
      subtraces: 0,
      action: {},
      result: { address: '0xaddr', code: '0xcode' }
    };
    const result = convertTraceToRpc(trace, header, { 0: '0xtx' });
    expect((result.result as Record<string, unknown>).address).toBe('0xaddr');
    expect((result.result as Record<string, unknown>).code).toBe('0xcode');
  });

  it('handles unknown trace type', () => {
    const trace = {
      transactionIndex: 0,
      traceAddress: [],
      type: 'unknown',
      subtraces: 0,
      action: {}
    } as PortalTrace;
    const result = convertTraceToRpc(trace, header, {});
    expect(result.type).toBe('unknown');
  });
});
