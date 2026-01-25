---
layout: home

hero:
  name: SQD Portal RPC Wrapper
  text: JSON-RPC 2.0 for SQD Portal
  tagline: Translate Ethereum RPC calls into optimized Portal NDJSON streaming queries
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/0x666c6f/sqd-portal-rpc-wrapper

features:
  - icon: 🔌
    title: JSON-RPC 2.0 Compliant
    details: Full batch request support, proper error codes, standard Ethereum method signatures
  - icon: ⚡
    title: Optimized Streaming
    details: Translates RPC calls into efficient NDJSON Portal queries with minimal field selection
  - icon: 🔗
    title: Multi-Chain Support
    details: Built-in mappings for 19 EVM networks with configurable dataset overrides
  - icon: 📊
    title: Production Ready
    details: Circuit breaker, concurrency limits, Prometheus metrics, structured logging
  - icon: 🔒
    title: Secure by Default
    details: Timing-safe auth, request size limits, API key redaction in logs
  - icon: 🐳
    title: Docker Ready
    details: Dockerfile and docker-compose included for easy deployment
---

## Quick Example

```bash
# Start in single-chain mode
SERVICE_MODE=single \
PORTAL_DATASET=ethereum-mainnet \
PORTAL_CHAIN_ID=1 \
npm run dev

# Query block number
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

## Supported Methods

| Method | Portal | Upstream |
|--------|:------:|:--------:|
| `eth_chainId` | ✅ | — |
| `eth_blockNumber` | ✅ | — |
| `eth_getBlockByNumber` | ✅ | — |
| `eth_getBlockByHash` | — | ✅ |
| `eth_getTransactionByBlockNumberAndIndex` | ✅ | — |
| `eth_getTransactionByHash` | — | ✅ |
| `eth_getTransactionReceipt` | — | ✅ |
| `eth_getLogs` | ✅ | ✅* |
| `trace_block` | ✅ | — |
| `trace_transaction` | — | ✅ |

<small>* `blockHash` filter proxied to upstream</small>

## Benchmarks

See the latest performance report and charts:
- [Benchmarks](/benchmarks/)
