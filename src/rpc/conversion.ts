import { quantityHex, quantityHexIfSet } from '../util/quantity';
import { PortalBlockResponse, PortalBlockHeader, PortalTransaction, PortalLog, PortalTrace } from '../portal/types';

export function convertBlockToRpc(block: PortalBlockResponse, fullTx: boolean): Record<string, unknown> {
  const h = block.header;
  const result: Record<string, unknown> = {
    number: toHex(h.number),
    hash: h.hash,
    parentHash: h.parentHash,
    timestamp: toHex(h.timestamp),
    miner: h.miner,
    gasUsed: quantityHex(h.gasUsed),
    gasLimit: quantityHex(h.gasLimit),
    nonce: normalizeNonce(h.nonce),
    difficulty: quantityHex(h.difficulty),
    size: quantityHex(h.size),
    stateRoot: h.stateRoot,
    transactionsRoot: h.transactionsRoot,
    receiptsRoot: h.receiptsRoot,
    logsBloom: h.logsBloom,
    extraData: h.extraData,
    mixHash: h.mixHash,
    sha3Uncles: h.sha3Uncles,
    uncles: []
  };

  const baseFee = quantityHexIfSet(h.baseFeePerGas);
  if (baseFee !== undefined) {
    result.baseFeePerGas = baseFee;
  }
  const totalDifficulty = quantityHexIfSet(h.totalDifficulty);
  if (totalDifficulty !== undefined) {
    result.totalDifficulty = totalDifficulty;
  }

  if (fullTx) {
    const txs = (block.transactions || []).map((tx) => convertTxToRpc(tx, h));
    result.transactions = txs;
  } else {
    const txHashes = (block.transactions || []).map((tx) => tx.hash);
    result.transactions = txHashes;
  }

  return result;
}

export function convertTxToRpc(tx: PortalTransaction, header: PortalBlockHeader): Record<string, unknown> {
  const result: Record<string, unknown> = {
    blockHash: header.hash,
    blockNumber: toHex(header.number),
    transactionIndex: toHex(tx.transactionIndex),
    hash: tx.hash,
    from: tx.from,
    value: quantityHex(tx.value),
    input: tx.input,
    nonce: quantityHex(tx.nonce),
    gas: quantityHex(tx.gas),
    type: quantityHex(tx.type)
  };

  if (tx.to) {
    result.to = tx.to;
  } else {
    result.to = null;
  }

  const gasPrice = quantityHexIfSet(tx.gasPrice);
  if (gasPrice !== undefined) {
    result.gasPrice = gasPrice;
  }
  const maxFee = quantityHexIfSet(tx.maxFeePerGas);
  if (maxFee !== undefined) {
    result.maxFeePerGas = maxFee;
  }
  const maxPriority = quantityHexIfSet(tx.maxPriorityFeePerGas);
  if (maxPriority !== undefined) {
    result.maxPriorityFeePerGas = maxPriority;
  }
  const chainId = quantityHexIfSet(tx.chainId);
  if (chainId !== undefined) {
    result.chainId = chainId;
  }
  const yParity = quantityHexIfSet(tx.yParity);
  if (yParity !== undefined) {
    result.yParity = yParity;
  }
  if (tx.v) result.v = tx.v;
  if (tx.r) result.r = tx.r;
  if (tx.s) result.s = tx.s;

  return result;
}

export function convertLogToRpc(log: PortalLog, block: PortalBlockResponse): Record<string, unknown> {
  return {
    blockHash: block.header.hash,
    blockNumber: toHex(block.header.number),
    transactionIndex: toHex(log.transactionIndex),
    transactionHash: log.transactionHash,
    logIndex: toHex(log.logIndex),
    address: log.address,
    data: log.data,
    topics: log.topics,
    removed: false
  };
}

export function convertTraceToRpc(
  trace: PortalTrace,
  header: PortalBlockHeader,
  txHashByIndex: Record<number, string>
): Record<string, unknown> {
  const action: Record<string, unknown> = {};
  const setActionIfEmpty = (key: string, value: unknown) => {
    if (action[key] !== undefined) return;
    action[key] = value;
  };

  if (trace.action?.from) action.from = trace.action.from;
  if (trace.action?.to) action.to = trace.action.to;
  if (trace.action?.value !== undefined) action.value = quantityHex(trace.action.value);
  if (trace.action?.gas !== undefined) action.gas = quantityHex(trace.action.gas);
  if (trace.action?.input) action.input = trace.action.input;
  if (trace.action?.callType) action.callType = trace.action.callType;
  if (trace.action?.init) action.init = trace.action.init;
  if (trace.action?.address) action.address = trace.action.address;
  if (trace.action?.balance !== undefined) action.balance = quantityHex(trace.action.balance);
  if (trace.action?.refundAddress) action.refundAddress = trace.action.refundAddress;
  if (trace.action?.author) action.author = trace.action.author;
  if (trace.action?.rewardType) action.rewardType = trace.action.rewardType;

  const traceResult: Record<string, unknown> = {};
  let hasResult = false;

  switch (trace.type) {
    case 'call': {
      if (trace.callFrom) setActionIfEmpty('from', trace.callFrom);
      if (trace.callTo) setActionIfEmpty('to', trace.callTo);
      if (trace.callValue !== undefined) setActionIfEmpty('value', quantityHex(trace.callValue));
      if (trace.callGas !== undefined) setActionIfEmpty('gas', quantityHex(trace.callGas));
      if (trace.callInput) setActionIfEmpty('input', trace.callInput);
      const callType = trace.callCallType || trace.callType;
      if (callType) setActionIfEmpty('callType', callType);
      if (trace.callResultGasUsed !== undefined) {
        traceResult.gasUsed = quantityHex(trace.callResultGasUsed);
        hasResult = true;
      }
      if (trace.callResultOutput) {
        traceResult.output = trace.callResultOutput;
        hasResult = true;
      }
      break;
    }
    case 'create': {
      if (trace.createFrom) setActionIfEmpty('from', trace.createFrom);
      if (trace.createValue !== undefined) setActionIfEmpty('value', quantityHex(trace.createValue));
      if (trace.createGas !== undefined) setActionIfEmpty('gas', quantityHex(trace.createGas));
      if (trace.createInit) setActionIfEmpty('init', trace.createInit);
      if (trace.createResultGasUsed !== undefined) {
        traceResult.gasUsed = quantityHex(trace.createResultGasUsed);
        hasResult = true;
      }
      if (trace.createResultCode) {
        traceResult.code = trace.createResultCode;
        hasResult = true;
      }
      if (trace.createResultAddress) {
        traceResult.address = trace.createResultAddress;
        hasResult = true;
      }
      break;
    }
    case 'suicide': {
      if (trace.suicideAddress) setActionIfEmpty('address', trace.suicideAddress);
      if (trace.suicideRefundAddress) setActionIfEmpty('refundAddress', trace.suicideRefundAddress);
      if (trace.suicideBalance !== undefined) setActionIfEmpty('balance', quantityHex(trace.suicideBalance));
      break;
    }
    case 'reward': {
      if (trace.rewardAuthor) setActionIfEmpty('author', trace.rewardAuthor);
      if (trace.rewardType) setActionIfEmpty('rewardType', trace.rewardType);
      if (trace.rewardValue !== undefined) setActionIfEmpty('value', quantityHex(trace.rewardValue));
      break;
    }
    default:
      break;
  }

  const result: Record<string, unknown> = {
    action,
    blockHash: header.hash,
    blockNumber: toHex(header.number),
    subtraces: trace.subtraces,
    traceAddress: trace.traceAddress,
    type: trace.type
  };

  const txHash = txHashByIndex[trace.transactionIndex];
  if (txHash) {
    result.transactionHash = txHash;
    result.transactionPosition = trace.transactionIndex;
  }

  if (trace.error) {
    result.error = trace.error;
    hasResult = false;
  } else {
    if (trace.result?.gasUsed !== undefined) {
      traceResult.gasUsed = quantityHex(trace.result.gasUsed);
      hasResult = true;
    }
    if (trace.result?.output) {
      traceResult.output = trace.result.output;
      hasResult = true;
    }
    if (trace.result?.address) {
      traceResult.address = trace.result.address;
      hasResult = true;
    }
    if (trace.result?.code) {
      traceResult.code = trace.result.code;
      hasResult = true;
    }
    if (hasResult) {
      result.result = traceResult;
    }
  }

  if (trace.revertReason) {
    result.revertReason = trace.revertReason;
  }

  return result;
}

function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function normalizeNonce(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return quantityHex(value);
}
