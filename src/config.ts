import { normalizePortalBaseUrl } from './portal/client';

export type ServiceMode = 'single' | 'multi';
export type PortalRealtimeMode = 'auto' | 'required' | 'disabled';

export interface Config {
  serviceMode: ServiceMode;
  listenHost: string;
  listenPort: number;
  portalBaseUrl: string;
  portalUseDefaultDatasets: boolean;
  portalApiKey?: string;
  portalApiKeyHeader: string;
  portalDataset?: string;
  portalDatasetMap: Record<string, string>;
  portalChainId?: number;
  portalRealtimeMode: PortalRealtimeMode;
  portalMetadataTtlMs: number;
  maxLogBlockRange: number;
  maxLogAddresses: number;
  maxBlockNumber: bigint;
  httpTimeoutMs: number;
  wrapperApiKey?: string;
  wrapperApiKeyHeader: string;
  maxConcurrentRequests: number;
  maxNdjsonLineBytes: number;
  maxNdjsonBytes: number;
  maxRequestBodyBytes: number;
  upstreamRpcUrl?: string;
  upstreamRpcUrlMap: Record<string, string>;
  upstreamMethodsEnabled: boolean;
  handlerTimeoutMs: number;
  portalCircuitBreakerThreshold: number;
  portalCircuitBreakerResetMs: number;
  portalIncludeAllBlocks: boolean;
}

const DEFAULT_LISTEN = ':8080';
const DEFAULT_PORTAL_BASE = 'https://portal.sqd.dev/datasets';
const DEFAULT_HTTP_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_LOG_BLOCK_RANGE = 1_000_000;
const DEFAULT_MAX_LOG_ADDRESSES = 1000;
const DEFAULT_MAX_BLOCK_NUMBER = BigInt(Number.MAX_SAFE_INTEGER);
const DEFAULT_MAX_CONCURRENCY = 128;
const DEFAULT_MAX_NDJSON_LINE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_NDJSON_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_PORTAL_METADATA_TTL_MS = 300_000;
const DEFAULT_HANDLER_TIMEOUT_MS = DEFAULT_HTTP_TIMEOUT_MS;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 0;
const DEFAULT_CIRCUIT_BREAKER_RESET_MS = 30_000;
const DEFAULT_PORTAL_USE_DEFAULT_DATASETS = true;

export function loadConfig(env = process.env): Config {
  const serviceMode = (env.SERVICE_MODE || 'single').toLowerCase();
  if (serviceMode !== 'single' && serviceMode !== 'multi') {
    throw new Error('SERVICE_MODE must be single or multi');
  }

  const listenAddr = env.SERVICE_LISTEN_ADDR || DEFAULT_LISTEN;
  const { host, port } = parseListenAddr(listenAddr);

  const portalBaseUrl = normalizePortalBaseUrl(env.PORTAL_BASE_URL || DEFAULT_PORTAL_BASE);
  const portalUseDefaultDatasets = parseBoolean(env.PORTAL_USE_DEFAULT_DATASETS, DEFAULT_PORTAL_USE_DEFAULT_DATASETS);
  const portalApiKey = env.PORTAL_API_KEY;
  const portalApiKeyHeader = env.PORTAL_API_KEY_HEADER || 'X-API-Key';
  const portalDataset = env.PORTAL_DATASET;
  const portalDatasetMap = parseDatasetMap(env.PORTAL_DATASET_MAP);
  const portalChainId = parseOptionalInt(env.PORTAL_CHAIN_ID || env.CHAIN_ID);
  const portalRealtimeMode = (env.PORTAL_REALTIME_MODE || 'auto').toLowerCase();
  if (portalRealtimeMode !== 'auto' && portalRealtimeMode !== 'required' && portalRealtimeMode !== 'disabled') {
    throw new Error('PORTAL_REALTIME_MODE must be auto, required, or disabled');
  }
  const portalMetadataTtlMs = parseNumber(env.PORTAL_METADATA_TTL_MS, DEFAULT_PORTAL_METADATA_TTL_MS);

  const maxLogBlockRange = parseNumber(env.MAX_LOG_BLOCK_RANGE, DEFAULT_MAX_LOG_BLOCK_RANGE);
  const maxLogAddresses = parseNumber(env.MAX_LOG_ADDRESSES, DEFAULT_MAX_LOG_ADDRESSES);
  const maxBlockNumber = parseBigInt(env.MAX_BLOCK_NUMBER, DEFAULT_MAX_BLOCK_NUMBER);
  const httpTimeoutMs = parseNumber(env.HTTP_TIMEOUT, DEFAULT_HTTP_TIMEOUT_MS);
  const maxConcurrentRequests = parseNumber(env.MAX_CONCURRENT_REQUESTS, DEFAULT_MAX_CONCURRENCY);
  const maxNdjsonLineBytes = parseNumber(env.MAX_NDJSON_LINE_BYTES, DEFAULT_MAX_NDJSON_LINE_BYTES);
  const maxNdjsonBytes = parseNumber(env.MAX_NDJSON_BYTES, DEFAULT_MAX_NDJSON_BYTES);
  const maxRequestBodyBytes = parseNumber(env.MAX_REQUEST_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
  const handlerTimeoutMs = parseNumber(env.HANDLER_TIMEOUT_MS || env.REQUEST_TIMEOUT_MS, DEFAULT_HANDLER_TIMEOUT_MS);

  const wrapperApiKey = env.WRAPPER_API_KEY;
  const wrapperApiKeyHeader = env.WRAPPER_API_KEY_HEADER || 'X-API-Key';
  const upstreamRpcUrl = env.UPSTREAM_RPC_URL;
  if (upstreamRpcUrl) {
    validateUrl(upstreamRpcUrl, 'UPSTREAM_RPC_URL');
  }
  const upstreamRpcUrlMap = parseUrlMap(env.UPSTREAM_RPC_URL_MAP);
  const upstreamMethodsEnabled = parseBoolean(env.UPSTREAM_METHODS_ENABLED, false);
  const portalCircuitBreakerThreshold = parseNumber(
    env.PORTAL_CIRCUIT_BREAKER_THRESHOLD,
    DEFAULT_CIRCUIT_BREAKER_THRESHOLD
  );
  const portalCircuitBreakerResetMs = parseNumber(
    env.PORTAL_CIRCUIT_BREAKER_RESET_MS,
    DEFAULT_CIRCUIT_BREAKER_RESET_MS
  );
  const portalIncludeAllBlocks = parseBoolean(env.PORTAL_INCLUDE_ALL_BLOCKS, false);

  if (serviceMode === 'single') {
    if (!portalDataset && Object.keys(portalDatasetMap).length === 0) {
      throw new Error('PORTAL_DATASET or PORTAL_DATASET_MAP must be set in single mode');
    }
    if (!portalChainId && Object.keys(portalDatasetMap).length !== 1) {
      throw new Error('PORTAL_CHAIN_ID (or CHAIN_ID) required for single mode unless PORTAL_DATASET_MAP has a single entry');
    }
  }

  return {
    serviceMode,
    listenHost: host,
    listenPort: port,
    portalBaseUrl,
    portalUseDefaultDatasets,
    portalApiKey,
    portalApiKeyHeader,
    portalDataset,
    portalDatasetMap,
    portalChainId,
    portalRealtimeMode,
    portalMetadataTtlMs,
    maxLogBlockRange,
    maxLogAddresses,
    maxBlockNumber,
    httpTimeoutMs,
    wrapperApiKey,
    wrapperApiKeyHeader,
    maxConcurrentRequests,
    maxNdjsonLineBytes,
    maxNdjsonBytes,
    maxRequestBodyBytes,
    upstreamRpcUrl,
    upstreamRpcUrlMap,
    upstreamMethodsEnabled,
    handlerTimeoutMs,
    portalCircuitBreakerThreshold,
    portalCircuitBreakerResetMs,
    portalIncludeAllBlocks
  };
}

export function parseListenAddr(addr: string): { host: string; port: number } {
  const trimmed = addr.trim();
  if (trimmed.startsWith(':')) {
    return { host: '0.0.0.0', port: Number(trimmed.slice(1)) };
  }
  const [host, portStr] = trimmed.split(':');
  if (!host || !portStr) {
    throw new Error(`invalid listen address: ${addr}`);
  }
  return { host, port: Number(portStr) };
}

function parseDatasetMap(raw?: string): Record<string, string> {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('PORTAL_DATASET_MAP must be JSON object');
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.trim() === '') {
      continue;
    }
    result[String(key)] = value;
  }
  return result;
}

function parseUrlMap(raw?: string): Record<string, string> {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('UPSTREAM_RPC_URL_MAP must be JSON object');
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.trim() === '') {
      continue;
    }
    validateUrl(value, `UPSTREAM_RPC_URL_MAP[${key}]`);
    result[String(key)] = value;
  }
  return result;
}

function parseOptionalInt(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`invalid number: ${raw}`);
  }
  return value;
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`invalid number: ${raw}`);
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }
  throw new Error(`invalid boolean: ${raw}`);
}

function parseBigInt(raw: string | undefined, fallback: bigint): bigint {
  if (!raw) {
    return fallback;
  }
  return BigInt(raw);
}

function validateUrl(raw: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }
}
