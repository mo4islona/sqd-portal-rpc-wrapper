# Configuration

All configuration is done via environment variables.

## Quick Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_LISTEN_ADDR` | `:8080` | Listen address |
| `SERVICE_MODE` | `single` | `single` or `multi` |
| `PORTAL_BASE_URL` | `https://portal.sqd.dev/datasets` | Portal base URL |
| `PORTAL_DATASET` | — | Single-chain dataset |
| `PORTAL_DATASET_MAP` | — | Multi-chain dataset map |
| `PORTAL_CHAIN_ID` | — | Single-chain chain ID |
| `PORTAL_API_KEY` | — | Portal authentication |
| `UPSTREAM_RPC_URL` | — | Upstream RPC fallback |

## Service Configuration

### SERVICE_LISTEN_ADDR

Server listen address in `host:port` or `:port` format.

```bash
SERVICE_LISTEN_ADDR=:8080           # All interfaces, port 8080
SERVICE_LISTEN_ADDR=127.0.0.1:3000  # Localhost only, port 3000
```

### SERVICE_MODE

Deployment mode:

| Mode | Description |
|------|-------------|
| `single` | Single chain, root endpoint |
| `multi` | Multiple chains, path-based routing |

**Single-chain mode:**
```bash
SERVICE_MODE=single
PORTAL_DATASET=ethereum-mainnet
PORTAL_CHAIN_ID=1
```

**Multi-chain mode:**
```bash
SERVICE_MODE=multi
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet"}'
```

## Minimal Configurations

### Single Chain (Ethereum)

```bash
SERVICE_MODE=single
PORTAL_DATASET=ethereum-mainnet
PORTAL_CHAIN_ID=1
```

### Multi Chain

```bash
SERVICE_MODE=multi
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet","42161":"arbitrum-one"}'
```

### With Upstream Fallback

```bash
SERVICE_MODE=single
PORTAL_DATASET=ethereum-mainnet
PORTAL_CHAIN_ID=1
UPSTREAM_RPC_URL=https://eth.llamarpc.com
```

### Production

```bash
SERVICE_MODE=multi
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet"}'
PORTAL_API_KEY=your-portal-key
WRAPPER_API_KEY=your-wrapper-key
MAX_CONCURRENT_REQUESTS=256
PORTAL_CIRCUIT_BREAKER_THRESHOLD=5
```
