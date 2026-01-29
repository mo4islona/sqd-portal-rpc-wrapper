import { UpstreamRpcClient } from './upstream';
import { Config } from '../config';

export interface UnclesContext {
  config: Config;
  upstream?: UpstreamRpcClient;
  chainId: number;
  traceparent?: string;
  requestId: string;
  logger?: { warn?: (obj: Record<string, unknown>, msg: string) => void };
}

export async function fetchUncles(ctx: UnclesContext, blockNumber: number): Promise<string[] | undefined> {
  if (!ctx.config.upstreamMethodsEnabled) {
    return undefined;
  }
  if (!ctx.upstream || !ctx.upstream.resolveUrl(ctx.chainId)) {
    return undefined;
  }
  const hex = `0x${blockNumber.toString(16)}`;
  try {
    const result = await ctx.upstream.call(
      { jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: [hex, false], id: null },
      ctx.chainId,
      ctx.traceparent
    );
    if (!result || typeof result !== 'object') {
      return undefined;
    }
    const uncles = (result as { uncles?: unknown }).uncles;
    if (Array.isArray(uncles)) {
      return uncles.filter((uncle) => typeof uncle === 'string');
    }
  } catch (err) {
    ctx.logger?.warn?.(
      { requestId: ctx.requestId, method: 'eth_getBlockByNumber', chainId: ctx.chainId, error: String(err) },
      'upstream uncles fetch failed'
    );
  }
  return undefined;
}
