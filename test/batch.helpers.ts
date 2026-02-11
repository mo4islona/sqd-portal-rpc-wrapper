import type { PortalClient } from '../src/portal/client';
import type { ParsedJsonRpcItem } from '../src/jsonrpc';
import {
  splitBatchRequests,
  executePortalSubBatch,
  type SplitContext,
  type ExecuteContext,
  type CoalescedResponse,
  type SubBatch
} from '../src/rpc/batch';

export const baseHeader = (number: number) => ({
  number,
  hash: `0x${String(number).padStart(64, '0')}`,
  parentHash: '0x' + '22'.repeat(32),
  timestamp: 1000,
  miner: '0x' + '33'.repeat(20),
  gasUsed: 21000,
  gasLimit: 30_000_000,
  nonce: 1,
  difficulty: 1,
  totalDifficulty: 1,
  size: 500,
  stateRoot: '0x' + '44'.repeat(32),
  transactionsRoot: '0x' + '55'.repeat(32),
  receiptsRoot: '0x' + '66'.repeat(32),
  logsBloom: '0x' + '00'.repeat(256),
  extraData: '0x',
  mixHash: '0x' + '77'.repeat(32),
  sha3Uncles: '0x' + '88'.repeat(32)
});

export const makeBlock = (number: number, fullTx = false) => ({
  header: baseHeader(number),
  transactions: fullTx
    ? [
        {
          transactionIndex: 0,
          hash: `0xtx${number}`,
          from: '0x' + '99'.repeat(20),
          to: '0x' + 'aa'.repeat(20),
          value: 1,
          input: '0x',
          nonce: 1,
          gas: 21_000,
          type: 0
        }
      ]
    : [{ hash: `0xtx${number}`, transactionIndex: 0 }]
});

export const makeTraceBlock = (number: number) => ({
  header: baseHeader(number),
  transactions: [{ hash: `0xtx${number}`, transactionIndex: 0 }],
  traces: [
    {
      transactionIndex: 0,
      traceAddress: [],
      type: 'call',
      subtraces: 0,
      action: { from: '0x' + '11'.repeat(20), to: '0x' + '22'.repeat(20), value: 1, gas: 21_000, input: '0x' }
    }
  ]
});

export function makePortal(overrides: Record<string, unknown> = {}): PortalClient {
  return {
    buildDatasetBaseUrl: () => 'http://portal',
    getMetadata: async () => ({ dataset: 'ethereum-mainnet', real_time: true, start_block: 0 }),
    streamBlocks: async () => [],
    fetchHead: async () => ({ head: { number: 5, hash: '0x' + '11'.repeat(32) }, finalizedAvailable: true }),
    ...overrides
  } as unknown as PortalClient;
}

/**
 * Convenience wrapper: splits batch items into sub-batches and executes all portal sub-batches.
 * Returns a flat Map<index, CoalescedResponse> for portal + resolved results.
 * Individual sub-batches are NOT executed (they would need handleJsonRpc).
 */
export async function splitAndExecute(
  items: ParsedJsonRpcItem[],
  ctx: ExecuteContext & SplitContext
): Promise<{ results: Map<number, CoalescedResponse>; subBatches: SubBatch[] }> {
  const subBatches = await splitBatchRequests(items, ctx);
  const results = new Map<number, CoalescedResponse>();

  for (const batch of subBatches) {
    switch (batch.kind) {
      case 'resolved':
        results.set(batch.index, batch.response);
        break;
      case 'blocks':
      case 'tx_by_index':
      case 'traces':
      case 'logs': {
        const portalResults = await executePortalSubBatch(batch, ctx);
        for (const [idx, r] of portalResults) {
          results.set(idx, r);
        }
        break;
      }
      case 'individual':
        // Not executed — tests can check subBatches for these
        break;
    }
  }

  return { results, subBatches };
}
