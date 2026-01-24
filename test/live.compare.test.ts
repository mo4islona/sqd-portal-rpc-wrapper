import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';
import { loadConfig } from '../src/config';

const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1';
const describeLive = RUN_LIVE ? describe : describe.skip;

const BASE_RPC_URL = process.env.LIVE_BASE_RPC_URL || 'https://base.llamarpc.com';
const PORTAL_BASE_URL = process.env.LIVE_PORTAL_BASE_URL || 'https://portal.sqd.dev/datasets';
const CHAIN_ID = Number.parseInt(process.env.LIVE_CHAIN_ID || '8453', 10);
const BLOCK_OFFSET = Number.parseInt(process.env.LIVE_BLOCK_OFFSET || '100000', 10);
const SEARCH_DEPTH = Number.parseInt(process.env.LIVE_BLOCK_SEARCH_DEPTH || '2', 10);
const RPC_TIMEOUT_MS = Number.parseInt(process.env.LIVE_RPC_TIMEOUT_MS || '8000', 10);
const HOOK_TIMEOUT_MS = Number.parseInt(process.env.LIVE_HOOK_TIMEOUT_MS || '60000', 10);
const TEST_TIMEOUT_MS = Number.parseInt(process.env.LIVE_TEST_TIMEOUT_MS || '60000', 10);
const BLOCK_NUMBER_TOLERANCE = Number.parseInt(process.env.LIVE_BLOCK_NUMBER_TOLERANCE || '30000', 10);
const TX_SCAN_LIMIT = Number.parseInt(process.env.LIVE_TX_SCAN_LIMIT || '50', 10);
const FALLBACK_BLOCK_NUMBER = Number.parseInt(process.env.LIVE_FALLBACK_BLOCK_NUMBER || '30000000', 10);

let wrapperUrl = '';
let server: Awaited<ReturnType<typeof buildServer>> | null = null;
let targetBlock = 0;
let txIndex = 0;
let matchedBlocks: { base: Record<string, unknown>; wrapper: Record<string, unknown> } | null = null;

describeLive('live rpc parity', () => {
  beforeAll(async () => {
    process.env.LOG_LEVEL = 'error';
    const config = loadConfig({
      SERVICE_MODE: 'multi',
      PORTAL_BASE_URL: PORTAL_BASE_URL
    });
    server = await buildServer(config);
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    const baseUrl =
      typeof address === 'string' ? address : `http://127.0.0.1:${(address as { port: number }).port}`;
    wrapperUrl = `${baseUrl}/v1/evm/${CHAIN_ID}`;

    const baseChainId = parseHexQuantity(await rpcResult(BASE_RPC_URL, 'eth_chainId', []));
    if (baseChainId !== CHAIN_ID) {
      throw new Error(`base rpc chainId mismatch: got ${baseChainId}`);
    }

    const envBlock = process.env.LIVE_BLOCK_NUMBER;
    const envTxIndex = process.env.LIVE_TX_INDEX;
    if (envBlock && envTxIndex) {
      targetBlock = parseHexQuantity(envBlock);
      txIndex = parseHexQuantity(envTxIndex);
      return;
    }

    if (!envBlock) {
      const baseHead = parseHexQuantity(await rpcResult(BASE_RPC_URL, 'eth_blockNumber', []));
      const wrapperHead = parseHexQuantity(await rpcResult(wrapperUrl, 'eth_blockNumber', []));
      const minHead = Math.min(baseHead, wrapperHead);
      const startBlock = Math.max(0, minHead - BLOCK_OFFSET);
      let match: { blockNumber: number; baseBlock: Record<string, unknown>; wrapperBlock: Record<string, unknown>; txIndex: number } | null =
        null;
      try {
        match = await findMatchingBlockWithTx(BASE_RPC_URL, wrapperUrl, startBlock, SEARCH_DEPTH);
      } catch {
        match = null;
      }
      if (match) {
        targetBlock = match.blockNumber;
        txIndex = match.txIndex;
        matchedBlocks = { base: match.baseBlock, wrapper: match.wrapperBlock };
        return;
      }

      targetBlock = FALLBACK_BLOCK_NUMBER;
      const fallbackMatch = await findMatchingTxIndexForBlock(BASE_RPC_URL, wrapperUrl, targetBlock);
      txIndex = fallbackMatch.txIndex;
      matchedBlocks = { base: fallbackMatch.baseBlock, wrapper: fallbackMatch.wrapperBlock };
      return;
    }

    targetBlock = parseHexQuantity(envBlock);
    const match = await findMatchingTxIndexForBlock(BASE_RPC_URL, wrapperUrl, targetBlock);
    txIndex = match.txIndex;
    matchedBlocks = { base: match.baseBlock, wrapper: match.wrapperBlock };
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('eth_chainId', async () => {
    const base = await rpcResult(BASE_RPC_URL, 'eth_chainId', []);
    const wrapper = await rpcResult(wrapperUrl, 'eth_chainId', []);
    expect(wrapper).toEqual(base);
  }, TEST_TIMEOUT_MS);

  it('eth_blockNumber', async () => {
    const base = parseHexQuantity(await rpcResult(BASE_RPC_URL, 'eth_blockNumber', []));
    const wrapper = parseHexQuantity(await rpcResult(wrapperUrl, 'eth_blockNumber', []));
    expect(Math.abs(base - wrapper)).toBeLessThanOrEqual(BLOCK_NUMBER_TOLERANCE);
  }, TEST_TIMEOUT_MS);

  it('eth_getBlockByNumber', async () => {
    const blockHex = toHex(targetBlock);
    const base = matchedBlocks?.base ?? (await rpcResult(BASE_RPC_URL, 'eth_getBlockByNumber', [blockHex, false]));
    const wrapper = matchedBlocks?.wrapper ?? (await rpcResult(wrapperUrl, 'eth_getBlockByNumber', [blockHex, false]));
    expect(normalizeBlock(wrapper)).toEqual(normalizeBlock(base));
  }, TEST_TIMEOUT_MS);

  it('eth_getTransactionByBlockNumberAndIndex', async () => {
    const blockHex = toHex(targetBlock);
    const txHex = toHex(txIndex);
    const base = await rpcResult(BASE_RPC_URL, 'eth_getTransactionByBlockNumberAndIndex', [blockHex, txHex]);
    const wrapper = await rpcResult(wrapperUrl, 'eth_getTransactionByBlockNumberAndIndex', [blockHex, txHex]);
    expect(normalizeTx(wrapper)).toEqual(normalizeTx(base));
  }, TEST_TIMEOUT_MS);

  it('eth_getLogs', async () => {
    const blockHex = toHex(targetBlock);
    const baseLogs = await rpcResult(BASE_RPC_URL, 'eth_getLogs', [{ fromBlock: blockHex, toBlock: blockHex }]);
    let filter: Record<string, unknown> = { fromBlock: blockHex, toBlock: blockHex };
    if (Array.isArray(baseLogs) && baseLogs.length > 0) {
      const addr = baseLogs[0]?.address as string | undefined;
      if (addr) {
        filter = { ...filter, address: addr };
      }
    }
    const base = await rpcResult(BASE_RPC_URL, 'eth_getLogs', [filter]);
    const wrapper = await rpcResult(wrapperUrl, 'eth_getLogs', [filter]);
    const normalizedBase = normalizeLogs(base);
    const normalizedWrapper = normalizeLogs(wrapper);
    expect(normalizedWrapper).toEqual(normalizedBase);
  }, TEST_TIMEOUT_MS);
});

async function jsonRpcCall(
  url: string,
  method: string,
  params: unknown[]
): Promise<{ status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return { status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function rpcResult(url: string, method: string, params: unknown[]) {
  const { status, body } = await jsonRpcCall(url, method, params);
  if (status >= 400) {
    throw new Error(`rpc http ${status} for ${method}`);
  }
  if (body.error) {
    const err = body.error as { code?: number; message?: string };
    throw new Error(`rpc error ${err.code ?? 'unknown'} for ${method}: ${err.message ?? 'unknown'}`);
  }
  return body.result;
}

function parseHexQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('0x')) {
      return Number.parseInt(trimmed.slice(2) || '0', 16);
    }
    return Number.parseInt(trimmed, 10);
  }
  throw new Error(`invalid quantity: ${String(value)}`);
}

function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

async function findMatchingBlockWithTx(
  baseUrl: string,
  wrapper: string,
  startBlock: number,
  depth: number
): Promise<{ blockNumber: number; baseBlock: Record<string, unknown>; wrapperBlock: Record<string, unknown>; txIndex: number }> {
  for (let offset = 0; offset <= depth; offset += 1) {
    const blockNumber = startBlock - offset;
    if (blockNumber < 0) break;
    const blockHex = toHex(blockNumber);
    const [base, wrapperBlock] = await Promise.all([
      safeRpcResult(baseUrl, 'eth_getBlockByNumber', [blockHex, true]),
      safeRpcResult(wrapper, 'eth_getBlockByNumber', [blockHex, true])
    ]);
    if (!base || !wrapperBlock) {
      continue;
    }
    const baseHash = (base as Record<string, unknown>).hash;
    const wrapperHash = (wrapperBlock as Record<string, unknown>).hash;
    if (typeof baseHash === 'string' && baseHash === wrapperHash) {
      const match = findMatchingTxIndexFromBlocks(
        base as Record<string, unknown>,
        wrapperBlock as Record<string, unknown>
      );
      if (match !== null) {
        return {
          blockNumber,
          baseBlock: base as Record<string, unknown>,
          wrapperBlock: wrapperBlock as Record<string, unknown>,
          txIndex: match
        };
      }
    }
  }
  throw new Error('no matching block found; set LIVE_BLOCK_NUMBER and LIVE_TX_INDEX');
}

async function findMatchingTxIndexForBlock(
  baseUrl: string,
  wrapper: string,
  blockNumber: number
): Promise<{ txIndex: number; baseBlock: Record<string, unknown>; wrapperBlock: Record<string, unknown> }> {
  const blockHex = toHex(blockNumber);
  const [baseBlock, wrapperBlock] = await Promise.all([
    safeRpcResult(baseUrl, 'eth_getBlockByNumber', [blockHex, true]),
    safeRpcResult(wrapper, 'eth_getBlockByNumber', [blockHex, true])
  ]);
  if (!baseBlock || !wrapperBlock) {
    throw new Error('block fetch failed; set LIVE_BLOCK_NUMBER and LIVE_TX_INDEX');
  }
  const match = findMatchingTxIndexFromBlocks(
    baseBlock as Record<string, unknown>,
    wrapperBlock as Record<string, unknown>
  );
  if (match === null) {
    throw new Error('no matching tx found; set LIVE_BLOCK_NUMBER and LIVE_TX_INDEX');
  }
  return { txIndex: match, baseBlock: baseBlock as Record<string, unknown>, wrapperBlock: wrapperBlock as Record<string, unknown> };
}

function extractTxIndex(tx: unknown, fallback: number): number {
  if (!tx || typeof tx !== 'object') return fallback;
  const raw = (tx as { transactionIndex?: unknown }).transactionIndex;
  try {
    if (raw !== undefined) {
      return parseHexQuantity(raw);
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function findMatchingTxIndexFromBlocks(baseBlock: Record<string, unknown>, wrapperBlock: Record<string, unknown>): number | null {
  const baseTxs = (baseBlock as { transactions?: unknown[] }).transactions;
  const wrapperTxs = (wrapperBlock as { transactions?: unknown[] }).transactions;
  if (!Array.isArray(baseTxs) || !Array.isArray(wrapperTxs)) {
    return null;
  }
  const baseByIndex = new Map<number, Record<string, unknown>>();
  baseTxs.forEach((tx, idx) => {
    if (!tx || typeof tx !== 'object') return;
    const index = extractTxIndex(tx, idx);
    baseByIndex.set(index, tx as Record<string, unknown>);
  });
  const limit = Math.min(wrapperTxs.length, TX_SCAN_LIMIT);
  for (let idx = 0; idx < limit; idx += 1) {
    const tx = wrapperTxs[idx];
    if (!tx || typeof tx !== 'object') continue;
    const txIndex = extractTxIndex(tx, idx);
    const baseTx = baseByIndex.get(txIndex);
    if (!baseTx) continue;
    if (jsonEqual(normalizeTx(baseTx), normalizeTx(tx))) {
      return txIndex;
    }
  }
  return null;
}

function normalizeBlock(block: unknown): Record<string, unknown> | null {
  if (!block || typeof block !== 'object') {
    return null;
  }
  const b = block as Record<string, unknown>;
  const txs = Array.isArray(b.transactions) ? b.transactions : [];
  const txHashes = txs.map((tx) => (typeof tx === 'string' ? tx : (tx as { hash?: string }).hash)).filter(Boolean);
  return {
    number: b.number,
    hash: b.hash,
    parentHash: b.parentHash,
    timestamp: b.timestamp,
    miner: b.miner,
    gasUsed: b.gasUsed,
    gasLimit: b.gasLimit,
    nonce: b.nonce,
    difficulty: b.difficulty,
    totalDifficulty: b.totalDifficulty,
    size: b.size,
    stateRoot: b.stateRoot,
    transactionsRoot: b.transactionsRoot,
    receiptsRoot: b.receiptsRoot,
    logsBloom: b.logsBloom,
    extraData: b.extraData,
    mixHash: b.mixHash,
    sha3Uncles: b.sha3Uncles,
    baseFeePerGas: b.baseFeePerGas,
    transactions: txHashes,
    uncles: Array.isArray(b.uncles) ? b.uncles : []
  };
}

function normalizeTx(tx: unknown): Record<string, unknown> | null {
  if (!tx || typeof tx !== 'object') {
    return null;
  }
  const t = tx as Record<string, unknown>;
  return {
    blockHash: t.blockHash,
    blockNumber: t.blockNumber,
    transactionIndex: t.transactionIndex,
    hash: t.hash,
    from: t.from,
    to: t.to ?? null,
    value: t.value,
    input: t.input,
    nonce: t.nonce,
    gas: t.gas,
    gasPrice: t.gasPrice,
    maxFeePerGas: t.maxFeePerGas,
    maxPriorityFeePerGas: t.maxPriorityFeePerGas,
    chainId: t.chainId,
    yParity: t.yParity,
    v: t.v,
    r: t.r,
    s: t.s,
    type: t.type
  };
}

function normalizeLogs(logs: unknown): Record<string, unknown>[] {
  if (!Array.isArray(logs)) {
    return [];
  }
  const normalized = logs.map((log) => normalizeLog(log));
  return normalized.sort((a, b) => {
    const aBlock = parseHexQuantity(a.blockNumber ?? 0);
    const bBlock = parseHexQuantity(b.blockNumber ?? 0);
    if (aBlock !== bBlock) return aBlock - bBlock;
    const aTx = parseHexQuantity(a.transactionIndex ?? 0);
    const bTx = parseHexQuantity(b.transactionIndex ?? 0);
    if (aTx !== bTx) return aTx - bTx;
    const aLog = parseHexQuantity(a.logIndex ?? 0);
    const bLog = parseHexQuantity(b.logIndex ?? 0);
    return aLog - bLog;
  });
}

function normalizeLog(log: unknown): Record<string, unknown> {
  if (!log || typeof log !== 'object') {
    return {};
  }
  const l = log as Record<string, unknown>;
  return {
    blockHash: l.blockHash,
    blockNumber: l.blockNumber,
    transactionIndex: l.transactionIndex,
    transactionHash: l.transactionHash,
    logIndex: l.logIndex,
    address: l.address,
    data: l.data,
    topics: l.topics,
    removed: l.removed ?? false
  };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function safeRpcResult(url: string, method: string, params: unknown[], retries = 0): Promise<unknown | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await rpcResult(url, method, params);
    } catch (err) {
      lastError = err;
      await sleep(200);
    }
  }
  if (lastError) {
    return null;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
