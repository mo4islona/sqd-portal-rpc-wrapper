import { PortalClient as OfficialPortalClient, evm } from '@subsquid/portal-client';
import type { PortalStreamData } from '@subsquid/portal-client';
import { PortalBlockResponse, PortalRequest } from './types';

export interface PortalStreamHeaders {
  finalizedHeadNumber?: string;
  finalizedHeadHash?: string;
}

export async function collectStream(
  client: OfficialPortalClient,
  request: PortalRequest,
  headers: Record<string, string>,
  finalized: boolean,
  onHeaders?: (headers: PortalStreamHeaders) => void,
  stopOnNoData = false
): Promise<PortalBlockResponse[]> {
  const stream = finalized
    ? client.getFinalizedStream(request as unknown as evm.Query, { request: { headers } })
    : client.getStream(request as unknown as evm.Query, { request: { headers } });
  const blocks: PortalBlockResponse[] = [];
  let seenBlocks = false;
  for await (const chunk of stream) {
    recordStreamHeaders(chunk as PortalStreamData<unknown>, onHeaders);
    if (chunk.blocks.length > 0) {
      seenBlocks = true;
      blocks.push(...(chunk.blocks as PortalBlockResponse[]));
      continue;
    }
    if (stopOnNoData && !seenBlocks) {
      break;
    }
  }
  return blocks;
}

export async function ensureStreamSegment(
  client: OfficialPortalClient,
  request: PortalRequest,
  headers: Record<string, string>,
  finalized: boolean,
  onHeaders?: (headers: PortalStreamHeaders) => void
): Promise<PortalBlockResponse[]> {
  return collectStream(client, request, headers, finalized, onHeaders, typeof request.toBlock === 'number');
}

export function filterBlocksInRange(blocks: PortalBlockResponse[], fromBlock: number, toBlock: number): PortalBlockResponse[] {
  return blocks.filter((block) => block.header.number >= fromBlock && block.header.number <= toBlock);
}

export function lastBlockNumber(blocks: PortalBlockResponse[]): number | undefined {
  if (blocks.length === 0) {
    return undefined;
  }
  return blocks[blocks.length - 1]?.header.number;
}

function recordStreamHeaders(chunk: PortalStreamData<unknown>, onHeaders?: (headers: PortalStreamHeaders) => void) {
  if (!onHeaders) return;
  onHeaders({
    finalizedHeadHash: chunk.meta.finalizedHeadHash,
    finalizedHeadNumber: chunk.meta.finalizedHeadNumber !== undefined ? String(chunk.meta.finalizedHeadNumber) : undefined
  });
}
