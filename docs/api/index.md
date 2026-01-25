# JSON-RPC API

The SQD Portal RPC Wrapper implements a subset of the Ethereum JSON-RPC specification, focused on historical data queries.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | JSON-RPC (single-chain or with `X-Chain-Id` header) |
| `/v1/evm/{chainId}` | POST | JSON-RPC for specific chain |
| `/capabilities` | GET | Service capabilities |
| `/healthz` | GET | Liveness probe |
| `/readyz` | GET | Readiness probe |
| `/metrics` | GET | Prometheus metrics |

## Request Format

Standard JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_blockNumber",
  "params": []
}
```

## Batch Requests

Send an array of requests:

```json
[
  {"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []},
  {"jsonrpc": "2.0", "id": 2, "method": "eth_blockNumber", "params": []}
]
```

## Response Format

Success:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x1234"
}
```

Error:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "invalid params"
  }
}
```

## Block Tags

All block parameters accept:

| Tag | Description |
|-----|-------------|
| `latest` | Most recent block |
| `finalized` | Most recent finalized block |
| `safe` | Same as `finalized` |
| `earliest` | Genesis block (0) |
| `pending` | Not supported (returns error) |
| `0x...` | Hex block number |

## Finality Handling

- `latest` → Portal `/head` + `/stream`
- `finalized`/`safe` → Portal `/finalized-head` + `/finalized-stream`
- Automatic fallback to non-finalized if finalized endpoints return 404

## Content Types

Request: `application/json`

Response: `application/json`

## Compression

The server accepts gzip-compressed request bodies and can return gzip-compressed responses based on `Accept-Encoding`.

## Authentication

If `WRAPPER_API_KEY` is configured, requests must include the key:

```bash
curl -H 'X-API-Key: your-key' ...
```

The header name is configurable via `WRAPPER_API_KEY_HEADER`.
