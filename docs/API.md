# JSON-RPC API

Supported methods:
- `eth_chainId`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getTransactionByBlockNumberAndIndex`
- `eth_getLogs`
- `trace_block`

Unsupported methods return HTTP 404 with JSON-RPC error `-32601` and message containing `method not supported`.

## Finality
- `latest`/empty: `/head` + `/stream`
- `finalized`/`safe`: `/finalized-head` + `/finalized-stream` with fallback to non-finalized if 404
- `pending`: invalid params (message contains `pending block not found`)
- `earliest`: block 0
