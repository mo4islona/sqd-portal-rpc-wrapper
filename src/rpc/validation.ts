import { Config } from '../config';
import { PortalClient } from '../portal/client';
import { invalidParams, pendingBlockError, tooManyAddressesError } from '../errors';
import { validateHexBytesLength } from '../util/hex';

const ADDRESS_BYTES = 20;
const TOPIC_BYTES = 32;

export interface ParsedBlockTag {
  number: number;
  useFinalized: boolean;
}

export async function parseBlockNumber(
  portal: PortalClient,
  baseUrl: string,
  value: unknown,
  config: Config,
  traceparent?: string
): Promise<ParsedBlockTag> {
  if (typeof value === 'string') {
    switch (value) {
      case '':
      case 'latest': {
        const { head } = await portal.fetchHead(baseUrl, false, '', traceparent);
        return { number: head.number, useFinalized: false };
      }
      case 'finalized':
      case 'safe': {
        const { head, finalizedAvailable } = await portal.fetchHead(baseUrl, true, value, traceparent);
        return { number: head.number, useFinalized: finalizedAvailable };
      }
      case 'pending':
        throw pendingBlockError();
      case 'earliest':
        return { number: 0, useFinalized: false };
      default:
        return { number: parseBlockNumberValue(value, config), useFinalized: false };
    }
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw invalidParams('invalid block number');
    }
    return { number: parseBlockNumberValue(value, config), useFinalized: false };
  }
  throw invalidParams('invalid block number');
}

function parseBlockNumberValue(value: string | number, config: Config): number {
  const raw = typeof value === 'string' ? value : String(value);
  let parsed: bigint;
  try {
    parsed = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw);
  } catch {
    throw invalidParams('invalid block number');
  }
  if (parsed < 0n || parsed > config.maxBlockNumber) {
    throw invalidParams('invalid block number');
  }
  const numberValue = Number(parsed);
  if (!Number.isSafeInteger(numberValue)) {
    throw invalidParams('invalid block number');
  }
  return numberValue;
}

export function parseTransactionIndex(value: unknown): number {
  if (typeof value === 'string') {
    const numberValue = value.startsWith('0x') ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value, 10);
    if (!Number.isFinite(numberValue)) {
      throw invalidParams('invalid transaction index');
    }
    if (numberValue < 0) {
      throw invalidParams('invalid transaction index');
    }
    return numberValue;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw invalidParams('invalid transaction index');
    }
    return value;
  }
  throw invalidParams('invalid transaction index');
}

export type ParsedLogFilter =
  | {
      blockHash: string;
      logFilter: {
        address?: string[];
        topic0?: string[];
        topic1?: string[];
        topic2?: string[];
        topic3?: string[];
      };
    }
  | {
      fromBlock: number;
      toBlock: number;
      useFinalized: boolean;
      range: number;
      logFilter: {
        address?: string[];
        topic0?: string[];
        topic1?: string[];
        topic2?: string[];
        topic3?: string[];
      };
    };

export async function parseLogFilter(
  portal: PortalClient,
  baseUrl: string,
  filter: Record<string, unknown>,
  config: Config,
  traceparent?: string
): Promise<ParsedLogFilter> {
  let fromBlock: ParsedBlockTag | null = null;
  let toBlock: ParsedBlockTag | null = null;
  let blockHash: string | undefined;

  if (filter.blockHash !== undefined) {
    if (filter.fromBlock !== undefined || filter.toBlock !== undefined) {
      throw invalidParams('invalid block range');
    }
    if (typeof filter.blockHash !== 'string') {
      throw invalidParams('invalid blockHash filter');
    }
    try {
      validateHexBytesLength('blockHash', filter.blockHash, 32);
    } catch {
      throw invalidParams('invalid blockHash filter');
    }
    blockHash = filter.blockHash.toLowerCase();
  }

  if (!blockHash) {
    if (filter.fromBlock !== undefined) {
      fromBlock = await parseBlockNumber(portal, baseUrl, filter.fromBlock, config, traceparent);
    }
    if (filter.toBlock !== undefined) {
      toBlock = await parseBlockNumber(portal, baseUrl, filter.toBlock, config, traceparent);
    }
    if (!toBlock) {
      if (fromBlock?.useFinalized) {
        const { head, finalizedAvailable } = await portal.fetchHead(baseUrl, true, 'finalized', traceparent);
        toBlock = { number: head.number, useFinalized: finalizedAvailable };
      } else {
        const { head } = await portal.fetchHead(baseUrl, false, '', traceparent);
        toBlock = { number: head.number, useFinalized: false };
      }
    }
    if (!fromBlock) {
      fromBlock = { number: toBlock.number, useFinalized: false };
    }

    const useFinalized = toBlock.useFinalized;

    if (toBlock.number < fromBlock.number) {
      throw invalidParams('invalid block range');
    }
    const blockRange = toBlock.number - fromBlock.number + 1;
    const logFilter = buildLogFilter(filter, config);
    return {
      fromBlock: fromBlock.number,
      toBlock: toBlock.number,
      useFinalized,
      range: blockRange,
      logFilter
    };
  }

  const logFilter = buildLogFilter(filter, config);
  return {
    blockHash,
    logFilter
  };
}

export function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidParams(message);
  }
}

export function assertArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw invalidParams(message);
  }
}

function buildLogFilter(filter: Record<string, unknown>, config: Config): ParsedLogFilter['logFilter'] {
  const logFilter: ParsedLogFilter['logFilter'] = {};
  if (filter.address !== undefined) {
    const addr = filter.address;
    if (typeof addr === 'string') {
      try {
        validateHexBytesLength('address', addr, ADDRESS_BYTES);
      } catch {
        throw invalidParams('invalid address filter');
      }
      logFilter.address = [addr.toLowerCase()];
    } else if (Array.isArray(addr)) {
      if (addr.length > config.maxLogAddresses) {
        throw tooManyAddressesError();
      }
      const addrs: string[] = [];
      for (const value of addr) {
        if (typeof value !== 'string') {
          throw invalidParams('invalid address filter');
        }
        try {
          validateHexBytesLength('address', value, ADDRESS_BYTES);
        } catch {
          throw invalidParams('invalid address filter');
        }
        addrs.push(value.toLowerCase());
      }
      logFilter.address = addrs;
    } else {
      throw invalidParams('invalid address filter');
    }
  }

  if (filter.topics !== undefined && filter.topics !== null) {
    if (!Array.isArray(filter.topics)) {
      throw invalidParams('invalid topics filter');
    }
    if (filter.topics.length > 4) {
      throw invalidParams('invalid topics filter');
    }
    filter.topics.forEach((topic, index) => {
      if (topic === null) {
        return;
      }
      const values: string[] = [];
      if (typeof topic === 'string') {
        try {
          validateHexBytesLength('topic', topic, TOPIC_BYTES);
        } catch {
          throw invalidParams('invalid topic filter');
        }
        values.push(topic.toLowerCase());
      } else if (Array.isArray(topic)) {
        for (const entry of topic) {
          if (typeof entry !== 'string') {
            throw invalidParams('invalid topic filter');
          }
          try {
            validateHexBytesLength('topic', entry, TOPIC_BYTES);
          } catch {
            throw invalidParams('invalid topic filter');
          }
          values.push(entry.toLowerCase());
        }
      } else {
        throw invalidParams('invalid topic filter');
      }
      if (index === 0) logFilter.topic0 = values;
      if (index === 1) logFilter.topic1 = values;
      if (index === 2) logFilter.topic2 = values;
      if (index === 3) logFilter.topic3 = values;
    });
  }

  return logFilter;
}
