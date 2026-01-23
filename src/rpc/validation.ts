import { Config } from '../config';
import { PortalClient } from '../portal/client';
import { blockHashFilterError, invalidParams, pendingBlockError, rangeTooLargeError, tooManyAddressesError } from '../errors';
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
  const parsed = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw);
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

export interface ParsedLogFilter {
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
}

export async function parseLogFilter(
  portal: PortalClient,
  baseUrl: string,
  filter: Record<string, unknown>,
  config: Config,
  traceparent?: string
): Promise<ParsedLogFilter> {
  if ('blockHash' in filter) {
    throw blockHashFilterError();
  }

  let fromBlock: ParsedBlockTag | null = null;
  let toBlock: ParsedBlockTag | null = null;

  if (filter.fromBlock !== undefined) {
    fromBlock = await parseBlockNumber(portal, baseUrl, filter.fromBlock, config, traceparent);
  }
  if (filter.toBlock !== undefined) {
    toBlock = await parseBlockNumber(portal, baseUrl, filter.toBlock, config, traceparent);
  }
  if (!toBlock) {
    const { head } = await portal.fetchHead(baseUrl, false, '', traceparent);
    toBlock = { number: head.number, useFinalized: false };
  }
  if (!fromBlock) {
    fromBlock = { number: toBlock.number, useFinalized: false };
  }

  const useFinalized = !filter.toBlock && fromBlock.useFinalized ? false : toBlock.useFinalized;

  const blockRange = toBlock.number - fromBlock.number;
  if (blockRange < 0) {
    throw invalidParams('invalid block range');
  }
  if (blockRange > config.maxLogBlockRange) {
    throw rangeTooLargeError(config.maxLogBlockRange);
  }

  const logFilter: ParsedLogFilter['logFilter'] = {};
  if (filter.address !== undefined) {
    const addr = filter.address;
    if (typeof addr === 'string') {
      validateHexBytesLength('address', addr, ADDRESS_BYTES);
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
        validateHexBytesLength('address', value, ADDRESS_BYTES);
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
        validateHexBytesLength('topic', topic, TOPIC_BYTES);
        values.push(topic.toLowerCase());
      } else if (Array.isArray(topic)) {
        for (const entry of topic) {
          if (typeof entry !== 'string') {
            throw invalidParams('invalid topic filter');
          }
          validateHexBytesLength('topic', entry, TOPIC_BYTES);
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

  return {
    fromBlock: fromBlock.number,
    toBlock: toBlock.number,
    useFinalized,
    range: blockRange,
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
