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
): Promise<PortalBlockResponse[]> {
  const stream = finalized
    ? client.getFinalizedStream(request as unknown as evm.Query, { request: { headers } })
    : client.getStream(request as unknown as evm.Query, { request: { headers } });

  const blocks: PortalBlockResponse[] = [];
  for await (const chunk of stream) {
    recordStreamHeaders(chunk as PortalStreamData<unknown>, onHeaders);
    if (chunk.blocks.length > 0) {
      blocks.push(...(chunk.blocks as PortalBlockResponse[]));

    }
  }
  return blocks;
}

function recordStreamHeaders(chunk: PortalStreamData<unknown>, onHeaders?: (headers: PortalStreamHeaders) => void) {
  if (!onHeaders) return;
  onHeaders({
    finalizedHeadHash: chunk.meta.finalizedHeadHash,
    finalizedHeadNumber: chunk.meta.finalizedHeadNumber !== undefined ? String(chunk.meta.finalizedHeadNumber) : undefined
  });
}
