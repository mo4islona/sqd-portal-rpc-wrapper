<p align="center">
  <img src="docs/public/logo-256.png" alt="SQD Portal RPC Wrapper" width="128" height="128">
</p>

# SQD Portal RPC Wrapper

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.10-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Coverage](https://img.shields.io/badge/Coverage-99%25-brightgreen?logo=vitest&logoColor=white)](./README.md)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-black?logo=fastify&logoColor=white)](https://fastify.dev/)
[![JSON-RPC](https://img.shields.io/badge/JSON--RPC-2.0-orange)](https://www.jsonrpc.org/specification)

Standalone HTTP JSON-RPC 2.0 wrapper for [SQD Portal](https://beta.docs.sqd.dev/en/home) EVM datasets. Translates standard Ethereum RPC calls into optimized Portal NDJSON streaming queries with strict validation, finalized block support, and comprehensive observability.

## Features

- **JSON-RPC 2.0 Compliant** — Full batch request support, proper error codes
- **Supported Methods:**
  - `eth_chainId`, `eth_blockNumber`
  - `eth_getBlockByNumber`
  - `eth_getTransactionByBlockNumberAndIndex`
  - `eth_getLogs`
  - `trace_block`
  - Optional upstream-only methods when enabled:
    `eth_getBlockByHash`, `eth_getTransactionByHash`,
    `eth_getTransactionReceipt`, `trace_transaction`
- **Flexible Deployment** — Single-chain and multi-chain modes
- **Finalized Block Support** — Automatic fallback when finalized endpoints unavailable
- **Observability** — Prometheus metrics, structured JSON logging, request tracing
- **Production Ready** — Circuit breaker, concurrency limits, request timeouts
- **Docker Support** — Dockerfile and docker-compose included

Enable upstream methods with `UPSTREAM_METHODS_ENABLED=true` and set
`UPSTREAM_RPC_URL`/`UPSTREAM_RPC_URL_MAP`.

## Quickstart

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Single-Chain Mode

```bash
SERVICE_MODE=single \
PORTAL_DATASET=ethereum-mainnet \
PORTAL_CHAIN_ID=1 \
npm run dev
```

### Multi-Chain Mode

```bash
SERVICE_MODE=multi \
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet"}' \
npm run dev
```

### Example Request

```bash
curl -s -X POST http://localhost:8080/v1/evm/1 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

### Running Tests

```bash
npm test              # Run tests with coverage
npm run test:watch    # Watch mode
npm run typecheck     # Type checking only
npm run lint          # ESLint
```

## Endpoints
- `POST /` (single-chain, or multi-chain with `X-Chain-Id`)
- `POST /v1/evm/{chainId}` (multi-chain)
- `GET /capabilities`
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
| `PORTAL_USE_DEFAULT_DATASETS` | `true` | Include built-in dataset mappings in multi-chain mode |
| `PORTAL_CHAIN_ID` | | Required for single-chain if map not single-entry |
| `PORTAL_API_KEY` | | Optional portal key |
| `PORTAL_API_KEY_HEADER` | `X-API-Key` | |
| `PORTAL_REALTIME_MODE` | `auto` | `auto|required|disabled` |
| `PORTAL_METADATA_TTL_MS` | `300000` | Metadata cache TTL |
| `PORTAL_CIRCUIT_BREAKER_THRESHOLD` | `0` | Disable with 0; open circuit after N failures |
| `PORTAL_CIRCUIT_BREAKER_RESET_MS` | `30000` | Circuit reset window |
| `PORTAL_INCLUDE_ALL_BLOCKS` | `false` | Include empty blocks in portal stream |
| `WRAPPER_API_KEY` | | Optional incoming auth |
| `WRAPPER_API_KEY_HEADER` | `X-API-Key` | |
| `UPSTREAM_RPC_URL` | | Optional JSON-RPC fallback URL |
| `UPSTREAM_RPC_URL_MAP` | | JSON object chainId->URL (overrides `UPSTREAM_RPC_URL`) |
| `UPSTREAM_METHODS_ENABLED` | `false` | Advertise + allow upstream-only methods |
| `MAX_LOG_BLOCK_RANGE` | `1000000` | |
| `MAX_LOG_ADDRESSES` | `1000` | |
| `MAX_BLOCK_NUMBER` | `2^53-1` | Uses safe integer for validation |
| `HTTP_TIMEOUT` | `60000` | ms |
| `MAX_CONCURRENT_REQUESTS` | `128` | 503 on overload |
| `MAX_NDJSON_LINE_BYTES` | `8388608` | |
| `MAX_NDJSON_BYTES` | `67108864` | |
| `MAX_REQUEST_BODY_BYTES` | `8388608` | |
| `HANDLER_TIMEOUT_MS` | `60000` | Per-request handler timeout (ms) |

## Docker

```bash
# Build image
docker build -t sqd-portal-wrapper .

# Run with docker compose
docker compose up --build
```

## Architecture

```
┌─────────────┐     JSON-RPC      ┌──────────────────┐     NDJSON      ┌─────────────┐
│   Client    │ ◄───────────────► │  Portal Wrapper  │ ◄─────────────► │ SQD Portal  │
│             │                   │    (Fastify)     │                 │  (datasets) │
└─────────────┘                   └────────┬─────────┘                 └─────────────┘
                                           │
                                           │ Optional fallback
                                           ▼
                                  ┌──────────────────┐
                                  │   Upstream RPC   │
                                  │ (hash lookups)   │
                                  └──────────────────┘
```

## Metrics

All metrics are exposed at `GET /metrics` in Prometheus format.

| Metric | Labels | Description |
|--------|--------|-------------|
| `requests_total` | `method`, `chainId`, `status` | Total JSON-RPC requests |
| `rpc_duration_seconds` | `method` | JSON-RPC handler duration |
| `rpc_timeouts_total` | `method` | JSON-RPC handler timeouts |
| `batch_requests_total` | `count` | Batch requests by size bucket |
| `batch_items_total` | `status` | Batch items processed |
| `portal_requests_total` | `endpoint`, `status` | Portal HTTP requests |
| `portal_latency_seconds` | `endpoint` | Portal request latency histogram |
| `portal_metadata_fetch_total` | `status` | Metadata endpoint fetches |
| `portal_conflict_total` | `chainId` | Portal 409 conflict responses |
| `portal_realtime_enabled` | `chainId` | Realtime availability gauge |
| `ndjson_lines_total` | — | NDJSON lines parsed |
| `ndjson_bytes_total` | — | NDJSON bytes parsed |
| `response_bytes_total` | `method`, `chainId` | Response payload bytes |
| `portal_unsupported_fields_total` | `field` | Portal unsupported fields |
| `upstream_requests_total` | `status` | Upstream JSON-RPC requests |
| `upstream_latency_seconds` | `endpoint` | Upstream request latency histogram |
| `rate_limit_total` | `source` | Rate limit errors by source |
| `errors_total` | `category` | Errors by category |
| `finalized_fallback_total` | — | Finalized→non-finalized fallbacks |

## Supported Networks

Built-in chain ID to dataset mappings:

| Chain | Chain ID | Dataset |
|-------|----------|---------|
| Ethereum | 1 | `ethereum-mainnet` |
| Optimism | 10 | `optimism-mainnet` |
| BSC | 56 | `binance-mainnet` |
| Gnosis | 100 | `gnosis-mainnet` |
| Polygon | 137 | `polygon-mainnet` |
| Fantom | 250 | `fantom-mainnet` |
| zkSync Era | 324 | `zksync-mainnet` |
| Base | 8453 | `base-mainnet` |
| Arbitrum One | 42161 | `arbitrum-one` |
| Arbitrum Nova | 42170 | `arbitrum-nova` |
| Avalanche | 43114 | `avalanche-mainnet` |
| Linea | 59144 | `linea-mainnet` |
| Scroll | 534352 | `scroll-mainnet` |
| Blast | 81457 | `blast-mainnet` |
| Zora | 7777777 | `zora-mainnet` |
| Sepolia | 11155111 | `ethereum-sepolia` |
| Base Sepolia | 84532 | `base-sepolia` |
| Arbitrum Sepolia | 421614 | `arbitrum-sepolia` |
| Optimism Sepolia | 11155420 | `optimism-sepolia` |

Override or extend with `PORTAL_DATASET_MAP`. Set `PORTAL_USE_DEFAULT_DATASETS=false` to use only explicit mappings.

## Security

- API keys are redacted in logs
- Request bodies are not logged
- Timing-safe API key comparison
- Configurable request size limits
- Concurrency limiting with 503 on overload

## Benchmarking

Latest charts and raw benchmark data live in the docs:
- https://0x666c6f.github.io/sqd-portal-rpc-wrapper/benchmarks/

Run locally:

```bash
RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key> \
WRAPPER_URL=http://localhost:8080/v1/evm/8453 \
CHAIN_ID=8453 \
BENCH_ITERATIONS=10 \
BENCH_BATCH_SIZES=1,5,10,25,1000,10000 \
BENCH_BATCH_METHODS=eth_blockNumber,eth_getBlockByNumber,eth_getLogs \
npm run bench -- --json > docs/benchmarks/bench-results.json
```

## Documentation

Full documentation available at **[0x666c6f.github.io/sqd-portal-rpc-wrapper](https://0x666c6f.github.io/sqd-portal-rpc-wrapper/)**

- [Getting Started](https://0x666c6f.github.io/sqd-portal-rpc-wrapper/guide/getting-started)
- [API Reference](https://0x666c6f.github.io/sqd-portal-rpc-wrapper/api/)
- [Configuration](https://0x666c6f.github.io/sqd-portal-rpc-wrapper/config/)
- [Architecture](https://0x666c6f.github.io/sqd-portal-rpc-wrapper/guide/architecture)

## License

[MIT](./LICENSE)
