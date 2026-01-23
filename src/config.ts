import { normalizePortalBaseUrl } from './portal/client';

export type ServiceMode = 'single' | 'multi';

export interface Config {
  serviceMode: ServiceMode;
  listenHost: string;
  listenPort: number;
  portalBaseUrl: string;
  portalApiKey?: string;
  portalApiKeyHeader: string;
  portalDataset?: string;
  portalDatasetMap: Record<string, string>;
  portalChainId?: number;
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
}

const DEFAULT_LISTEN = ':8080';
const DEFAULT_PORTAL_BASE = 'https://portal.sqd.dev/datasets';
const DEFAULT_HTTP_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_LOG_BLOCK_RANGE = 1_000_000;
const DEFAULT_MAX_LOG_ADDRESSES = 1000;
const DEFAULT_MAX_BLOCK_NUMBER = BigInt(1) << BigInt(62);
const DEFAULT_MAX_CONCURRENCY = 128;
const DEFAULT_MAX_NDJSON_LINE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_NDJSON_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

export function loadConfig(env = process.env): Config {
  const serviceMode = (env.SERVICE_MODE || 'single').toLowerCase();
  if (serviceMode !== 'single' && serviceMode !== 'multi') {
    throw new Error('SERVICE_MODE must be single or multi');
  }

  const listenAddr = env.SERVICE_LISTEN_ADDR || DEFAULT_LISTEN;
  const { host, port } = parseListenAddr(listenAddr);

  const portalBaseUrl = normalizePortalBaseUrl(env.PORTAL_BASE_URL || DEFAULT_PORTAL_BASE);
  const portalApiKey = env.PORTAL_API_KEY;
  const portalApiKeyHeader = env.PORTAL_API_KEY_HEADER || 'X-API-Key';
  const portalDataset = env.PORTAL_DATASET;
  const portalDatasetMap = parseDatasetMap(env.PORTAL_DATASET_MAP);
  const portalChainId = parseOptionalInt(env.PORTAL_CHAIN_ID || env.CHAIN_ID);

  const maxLogBlockRange = parseNumber(env.MAX_LOG_BLOCK_RANGE, DEFAULT_MAX_LOG_BLOCK_RANGE);
  const maxLogAddresses = parseNumber(env.MAX_LOG_ADDRESSES, DEFAULT_MAX_LOG_ADDRESSES);
  const maxBlockNumber = parseBigInt(env.MAX_BLOCK_NUMBER, DEFAULT_MAX_BLOCK_NUMBER);
  const httpTimeoutMs = parseNumber(env.HTTP_TIMEOUT, DEFAULT_HTTP_TIMEOUT_MS);
  const maxConcurrentRequests = parseNumber(env.MAX_CONCURRENT_REQUESTS, DEFAULT_MAX_CONCURRENCY);
  const maxNdjsonLineBytes = parseNumber(env.MAX_NDJSON_LINE_BYTES, DEFAULT_MAX_NDJSON_LINE_BYTES);
  const maxNdjsonBytes = parseNumber(env.MAX_NDJSON_BYTES, DEFAULT_MAX_NDJSON_BYTES);
  const maxRequestBodyBytes = parseNumber(env.MAX_REQUEST_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);

  const wrapperApiKey = env.WRAPPER_API_KEY;
  const wrapperApiKeyHeader = env.WRAPPER_API_KEY_HEADER || 'X-API-Key';

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
    portalApiKey,
    portalApiKeyHeader,
    portalDataset,
    portalDatasetMap,
    portalChainId,
    maxLogBlockRange,
    maxLogAddresses,
    maxBlockNumber,
    httpTimeoutMs,
    wrapperApiKey,
    wrapperApiKeyHeader,
    maxConcurrentRequests,
    maxNdjsonLineBytes,
    maxNdjsonBytes,
    maxRequestBodyBytes
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

function parseOptionalInt(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
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

function parseBigInt(raw: string | undefined, fallback: bigint): bigint {
  if (!raw) {
    return fallback;
  }
  return BigInt(raw);
}
