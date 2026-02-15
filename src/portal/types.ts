export interface PortalRequest {
  type: 'evm'
  fromBlock: number
  toBlock?: number
  parentBlockHash?: string
  includeAllBlocks?: boolean
  fields?: FieldSelection
  logs?: LogFilter[]
  transactions?: TxFilter[]
  traces?: TraceFilter[]
  stateDiffs?: StateDiffFilter[]
}

export interface FieldSelection {
  block?: Record<string, boolean>
  transaction?: Record<string, boolean>
  log?: Record<string, boolean>
  trace?: Record<string, boolean>
  stateDiff?: Record<string, boolean>
}

export interface LogFilter {
  address?: string[]
  topic0?: string[]
  topic1?: string[]
  topic2?: string[]
  topic3?: string[]
  transaction?: boolean
  transactionLogs?: boolean
  transactionTraces?: boolean
}

export interface TxFilter {
  from?: string[]
  to?: string[]
  sighash?: string[]
  logs?: boolean
  traces?: boolean
  stateDiffs?: boolean
}

export interface TraceFilter {
  type?: string[]
  callTo?: string[]
  callFrom?: string[]
}

export interface StateDiffFilter {
  address?: string[]
}

export interface PortalHeadResponse {
  number: number
  hash: string
}

export interface PortalMetadataResponse {
  dataset: string
  aliases?: string[]
  real_time?: boolean
  start_block?: number
}

export interface PortalBlockResponse {
  header: PortalBlockHeader
  transactions?: PortalTransaction[]
  logs?: PortalLog[]
  traces?: PortalTrace[]
  stateDiffs?: PortalStateDiff[]
  withdrawals?: PortalWithdrawal[]
}

export interface PortalBlockHeader {
  number: number
  hash: string
  parentHash: string
  timestamp: number
  miner: string
  gasUsed: unknown
  gasLimit: unknown
  baseFeePerGas?: unknown
  nonce: unknown
  difficulty: unknown
  totalDifficulty: unknown
  size: unknown
  stateRoot: string
  transactionsRoot: string
  receiptsRoot: string
  logsBloom: string
  extraData: string
  mixHash: string
  sha3Uncles: string
  // withdrawalsRoot?: string;
  blobGasUsed?: unknown
  excessBlobGas?: unknown
  // parentBeaconBlockRoot?: string;
}

export interface PortalTransaction {
  transactionIndex: number
  hash: string
  from: string
  to?: string
  value: unknown
  input: string
  nonce: unknown
  gas: unknown
  gasPrice?: unknown
  maxFeePerGas?: unknown
  maxPriorityFeePerGas?: unknown
  type: unknown
  v?: string
  r?: string
  s?: string
  yParity?: unknown
  chainId?: unknown
  accessList?: unknown
  authorizationList?: unknown
  maxFeePerBlobGas?: unknown
  blobVersionedHashes?: unknown
}

export interface PortalLog {
  logIndex: number
  transactionIndex: number
  transactionHash: string
  address: string
  data: string
  topics: string[]
}

export interface PortalTrace {
  transactionIndex: number
  traceAddress: number[]
  type: string
  subtraces: number
  error?: string
  revertReason?: string
  action: TraceAction
  result?: TraceResult
  callFrom?: string
  callTo?: string
  callValue?: unknown
  callGas?: unknown
  callInput?: string
  callSighash?: string
  callType?: string
  callCallType?: string
  callResultGasUsed?: unknown
  callResultOutput?: string
  createFrom?: string
  createValue?: unknown
  createGas?: unknown
  createInit?: string
  createResultGasUsed?: unknown
  createResultCode?: string
  createResultAddress?: string
  suicideAddress?: string
  suicideRefundAddress?: string
  suicideBalance?: unknown
  rewardAuthor?: string
  rewardValue?: unknown
  rewardType?: string
}

export interface TraceAction {
  from?: string
  to?: string
  value?: unknown
  gas?: unknown
  input?: string
  callType?: string
  init?: string
  address?: string
  balance?: unknown
  refundAddress?: string
  author?: string
  rewardType?: string
}

export interface TraceResult {
  gasUsed?: unknown
  output?: string
  address?: string
  code?: string
}

export interface PortalStateDiff {
  transactionIndex: number
  address: string
  key: string
  kind: string
  prev?: string
  next?: string
}

export interface PortalWithdrawal {
  index: number
  validatorIndex: number
  address: string
  amount: unknown
}

const allBlockFields = {
  number: true,
  hash: true,
  parentHash: true,
  timestamp: true,
  miner: true,
  gasUsed: true,
  gasLimit: true,
  baseFeePerGas: true,
  nonce: true,
  difficulty: true,
  totalDifficulty: true,
  size: true,
  stateRoot: true,
  transactionsRoot: true,
  receiptsRoot: true,
  logsBloom: true,
  extraData: true,
  mixHash: true,
  sha3Uncles: true,
  // This is not available in Portal API
  // withdrawalsRoot: true,
  blobGasUsed: true,
  excessBlobGas: true,
  // This is not available in Portal API
  // parentBeaconBlockRoot: true
}

const txHashOnlyFields = {
  hash: true,
  transactionIndex: true,
}

const allTransactionFields = {
  transactionIndex: true,
  hash: true,
  from: true,
  to: true,
  value: true,
  input: true,
  nonce: true,
  gas: true,
  gasPrice: true,
  maxFeePerGas: true,
  maxPriorityFeePerGas: true,
  type: true,
  v: true,
  r: true,
  s: true,
  yParity: true,
  chainId: true,
  accessList: true,
  authorizationList: true,
  maxFeePerBlobGas: true,
  blobVersionedHashes: true,
}

const allLogFields = {
  logIndex: true,
  transactionIndex: true,
  address: true,
  data: true,
  topics: true,
  transactionHash: true,
}

const allTraceFields = {
  transactionIndex: true,
  traceAddress: true,
  type: true,
  subtraces: true,
  error: true,
  revertReason: true,
  action: true,
  result: true,
  createFrom: true,
  createValue: true,
  createGas: true,
  createInit: true,
  createResultGasUsed: true,
  createResultCode: true,
  createResultAddress: true,
  callFrom: true,
  callTo: true,
  callValue: true,
  callGas: true,
  callInput: true,
  callSighash: true,
  callType: true,
  callCallType: true,
  callResultGasUsed: true,
  callResultOutput: true,
  suicideAddress: true,
  suicideRefundAddress: true,
  suicideBalance: true,
  rewardAuthor: true,
  rewardValue: true,
  rewardType: true,
}

const EIP_FORKS: Record<number, { london?: number; cancun?: number }> = {
  1: { london: 12_965_000, cancun: 19_426_587 }, // Ethereum mainnet
  10: { london: 0, cancun: 0 }, // Optimism
  56: { london: 0, cancun: 0 }, // BSC
  100: { london: 0, cancun: 0 }, // Gnosis
  137: { london: 0, cancun: 0 }, // Polygon
  8453: { london: 0, cancun: 0 }, // Base
  42161: { london: 0, cancun: 5_187_023 }, // Arbitrum One
  43114: { london: 0, cancun: 0 }, // Avalanche
  11155111: { london: 0, cancun: 5_187_023 }, // Sepolia
}

function copyMap<T extends Record<string, boolean>>(input: T): T {
  return { ...input } as T
}

export function allBlockFieldsSelection(chainId: number, fromBlock: number) {
  const fields = copyMap(allBlockFields)
  const forks = EIP_FORKS[chainId]
  if (forks) {
    if (forks.london !== undefined && fromBlock < forks.london) {
      delete (fields as Record<string, boolean>).baseFeePerGas
    }
    if (forks.cancun !== undefined && fromBlock < forks.cancun) {
      console.log('Removing blobGasUsed and excessBlobGas from block fields selection due to pre-Cancun block')
      delete (fields as Record<string, boolean>).blobGasUsed
      delete (fields as Record<string, boolean>).excessBlobGas
    }
  }
  console.log(`Using block fields selection for chainId ${chainId} fromBlock ${fromBlock}:`, fields)
  console.log(forks, forks.cancun !== undefined, forks.london !== undefined)
  return fields
}

export function txHashOnlyFieldsSelection() {
  return copyMap(txHashOnlyFields)
}

export function allTransactionFieldsSelection() {
  return copyMap(allTransactionFields)
}

export function allLogFieldsSelection() {
  return copyMap(allLogFields)
}

export function allTraceFieldsSelection() {
  return copyMap(allTraceFields)
}
