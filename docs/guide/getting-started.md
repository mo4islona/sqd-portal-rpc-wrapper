# Getting Started

## Prerequisites

- Node.js 20.10 or higher
- npm or yarn

## Installation

```bash
git clone https://github.com/0x666c6f/sqd-portal-rpc-wrapper.git
cd sqd-portal-rpc-wrapper
npm install
```

## Quick Start

### Single-Chain Mode

For serving a single EVM network:

```bash
SERVICE_MODE=single \
PORTAL_DATASET=ethereum-mainnet \
PORTAL_CHAIN_ID=1 \
npm run dev
```

Test with:

```bash
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

### Multi-Chain Mode

For serving multiple networks from a single instance:

```bash
SERVICE_MODE=multi \
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet"}' \
npm run dev
```

Test with chain-specific endpoint:

```bash
curl -s -X POST http://localhost:8080/v1/evm/8453 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Or using the header:

```bash
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -H 'X-Chain-Id: 8453' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /` | JSON-RPC (single-chain or with `X-Chain-Id` header) |
| `POST /v1/evm/{chainId}` | JSON-RPC for specific chain (multi-chain mode) |
| `GET /capabilities` | Service capabilities and chain info |
| `GET /healthz` | Liveness probe |
| `GET /readyz` | Readiness probe (checks Portal connectivity) |
| `GET /metrics` | Prometheus metrics |

## With Upstream RPC Fallback

Some methods require hash-based lookups that Portal doesn't support natively. Configure an upstream RPC for these:

```bash
SERVICE_MODE=single \
PORTAL_DATASET=ethereum-mainnet \
PORTAL_CHAIN_ID=1 \
UPSTREAM_RPC_URL=https://eth.llamarpc.com \
npm run dev
```

This enables:
- `eth_getBlockByHash`
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `eth_getLogs` with `blockHash` filter
- `trace_transaction`

## Next Steps

- [Architecture Overview](/guide/architecture) - Understand how the wrapper works
- [Configuration](/config/) - All configuration options
- [API Reference](/api/) - Supported methods and error codes
