# SQD Portal RPC Wrapper

Standalone HTTP JSON-RPC 2.0 wrapper for SQD Portal EVM datasets. Supports a minimal, historical-only method set with strict validation and NDJSON streaming.

## Features
- Methods: `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getTransactionByBlockNumberAndIndex`, `eth_getLogs`, `trace_block`
- Single-chain and multi-chain modes
- Portal finalized fallback
- Prometheus metrics at `/metrics`
- Docker + docker compose

## Quickstart

```bash
npm install
npm run dev
```

Single-chain:

```bash
SERVICE_MODE=single \
PORTAL_DATASET=ethereum-mainnet \
PORTAL_CHAIN_ID=1 \
npm run dev
```

Multi-chain:

```bash
SERVICE_MODE=multi \
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet"}' \
npm run dev
```

Example request:

```bash
curl -s -X POST http://localhost:8080/v1/evm/1 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

## Endpoints
- `POST /` (single-chain, or multi-chain with `X-Chain-Id`)
- `POST /v1/evm/{chainId}` (multi-chain)
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `SERVICE_LISTEN_ADDR` | `:8080` | `host:port` or `:port` |
| `SERVICE_MODE` | `single` | `single` or `multi` |
| `PORTAL_BASE_URL` | `https://portal.sqd.dev/datasets` | Dataset root |
| `PORTAL_DATASET` | | Single-chain dataset override |
| `PORTAL_DATASET_MAP` | | JSON object chainId->dataset |
| `PORTAL_CHAIN_ID` | | Required for single-chain if map not single-entry |
| `PORTAL_API_KEY` | | Optional portal key |
| `PORTAL_API_KEY_HEADER` | `X-API-Key` | |
| `WRAPPER_API_KEY` | | Optional incoming auth |
| `WRAPPER_API_KEY_HEADER` | `X-API-Key` | |
| `MAX_LOG_BLOCK_RANGE` | `1000000` | |
| `MAX_LOG_ADDRESSES` | `1000` | |
| `MAX_BLOCK_NUMBER` | `2^62` | Uses BigInt for validation |
| `HTTP_TIMEOUT` | `60000` | ms |
| `MAX_CONCURRENT_REQUESTS` | `128` | 503 on overload |
| `MAX_NDJSON_LINE_BYTES` | `8388608` | |
| `MAX_NDJSON_BYTES` | `67108864` | |
| `MAX_REQUEST_BODY_BYTES` | `8388608` | |

## Docker

```bash
docker build -t sqd-portal-wrapper .

docker compose up --build
```

## Metrics
- `requests_total{method,chainId,status}`
- `portal_requests_total{endpoint,status}`
- `portal_latency_seconds{endpoint}`
- `ndjson_lines_total`
- `response_bytes_total{method,chainId}`
- `errors_total{category}`
- `finalized_fallback_total`

## Notes
- Request bodies are not logged.
- API keys are redacted in logs.
