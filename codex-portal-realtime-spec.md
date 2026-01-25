# Portal Realtime Support Spec (EVM only)

**Date:** 2026-01-24
**Status:** Draft

## Scope
- EVM datasets only
- Ignore Solana entirely

## Background
- SQD Portal uses HTTP `POST /stream` with NDJSON block stream output.
- Portal request examples include `includeAllBlocks` and omit `toBlock`, implying open-ended range support.
- EVM realtime availability not guaranteed; gate by config/probe.

## Goals
- Expose realtime availability via capabilities + metrics.
- Keep API surface aligned with current wrapper behavior.

## Non-goals
- WebSockets, subscriptions, pubsub
- Mempool or pending txs
- Indexing/ETL/caching beyond request scope

## Realtime Definition (EVM)
- Realtime request = `POST /stream` with `fromBlock` set, `toBlock` omitted.
- Portal returns blocks up to current head, including unfinalized when supported.
- Wrapper must allow `includeAllBlocks` passthrough to include empty blocks.
- Single query for historical + realtime = same request (open-ended stream). It returns historical blocks from `fromBlock` through head; if realtime supported, tail includes unfinalized.

## Wrapper API

### Capabilities Endpoint
- `GET /capabilities`

Response (example):
```json
{
  "service": { "name": "sqd-portal-rpc-wrapper", "version": "0.1.0" },
  "mode": "single",
  "methods": ["eth_chainId","eth_blockNumber","eth_getBlockByNumber","eth_getTransactionByBlockNumberAndIndex","eth_getLogs","trace_block"],
  "chains": {
    "1": {
      "dataset": "ethereum-mainnet",
      "aliases": ["eth"],
      "startBlock": 0,
      "realTime": true
    }
  },
  "portalEndpoints": {
    "head": "https://portal.sqd.dev/datasets/{dataset}/head",
    "finalizedHead": "https://portal.sqd.dev/datasets/{dataset}/finalized-head",
    "stream": "https://portal.sqd.dev/datasets/{dataset}/stream",
    "finalizedStream": "https://portal.sqd.dev/datasets/{dataset}/finalized-stream",
    "metadata": "https://portal.sqd.dev/datasets/{dataset}/metadata"
  }
}
```

Notes:
- `chains[*].realTime` derived from portal metadata + `PORTAL_REALTIME_MODE`.

## Config
- `PORTAL_REALTIME_MODE` = `auto|required|disabled` (default `auto`)
  - `disabled`: always report `realTime=false`.
  - `auto`: report `realTime=true` only when portal metadata says `real_time=true`.
  - `required`: require realtime metadata; error if portal does not advertise realtime.

## JSON-RPC Behavior (No new methods)
- No change to existing method allowlist.
- Existing finalized fallback behavior unchanged.

## Errors
- Pass-through endpoints: preserve portal status/body.
- JSON-RPC: keep existing error mapping.

## Observability
- Metrics:
  - `portal_realtime_enabled{chainId}` gauge (from metadata + config).

## Testing
- Unit: capabilities payload; realtime config modes.

## Risks / Notes
- Portal EVM realtime availability not guaranteed; default to disabled + passthrough.
- Clients should handle empty responses / 404 / 409 from portal.
