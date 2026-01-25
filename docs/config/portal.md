# Portal Settings

Configuration for SQD Portal connectivity.

## Base URL

### PORTAL_BASE_URL

Portal API base URL. Supports `{dataset}` placeholder.

**Default:** `https://portal.sqd.dev/datasets`

```bash
# Standard
PORTAL_BASE_URL=https://portal.sqd.dev/datasets

# With placeholder
PORTAL_BASE_URL=https://portal.sqd.dev/datasets/{dataset}

# Custom portal
PORTAL_BASE_URL=https://my-portal.example.com/v1
```

## Dataset Configuration

### PORTAL_DATASET

Dataset name for single-chain mode.

```bash
PORTAL_DATASET=ethereum-mainnet
```

### PORTAL_DATASET_MAP

JSON object mapping chain IDs to dataset names.

```bash
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet","42161":"arbitrum-one"}'
```

### PORTAL_CHAIN_ID

Chain ID for single-chain mode. Required if `PORTAL_DATASET_MAP` has multiple entries.

```bash
PORTAL_CHAIN_ID=1
```

## Authentication

### PORTAL_API_KEY

API key for Portal authentication.

```bash
PORTAL_API_KEY=your-portal-api-key
```

### PORTAL_API_KEY_HEADER

Header name for Portal API key.

**Default:** `X-API-Key`

```bash
PORTAL_API_KEY_HEADER=Authorization
```

## Realtime Mode

### PORTAL_REALTIME_MODE

Controls realtime data availability reporting.

| Value | Behavior |
|-------|----------|
| `auto` | Use realtime if available (default) |
| `required` | Fail startup if realtime unavailable |
| `disabled` | Always report realtime as false |

```bash
PORTAL_REALTIME_MODE=auto
```

## Caching

### PORTAL_METADATA_TTL_MS

Time-to-live for cached Portal metadata.

**Default:** `300000` (5 minutes)

```bash
PORTAL_METADATA_TTL_MS=60000  # 1 minute
```

## Circuit Breaker

### PORTAL_CIRCUIT_BREAKER_THRESHOLD

Number of consecutive failures before opening circuit. Set to `0` to disable.

**Default:** `0` (disabled)

```bash
PORTAL_CIRCUIT_BREAKER_THRESHOLD=5
```

### PORTAL_CIRCUIT_BREAKER_RESET_MS

Time to wait before attempting to close circuit.

**Default:** `30000` (30 seconds)

```bash
PORTAL_CIRCUIT_BREAKER_RESET_MS=60000  # 1 minute
```

## Advanced Options

### PORTAL_INCLUDE_ALL_BLOCKS

Include empty blocks in Portal stream responses.

**Default:** `false`

```bash
PORTAL_INCLUDE_ALL_BLOCKS=true
```

### PORTAL_OPEN_ENDED_STREAM

Omit `toBlock` in Portal requests when client omits it, allowing open-ended streaming.

**Default:** `false`

```bash
PORTAL_OPEN_ENDED_STREAM=true
```

## Upstream RPC Fallback

### UPSTREAM_RPC_URL

URL for upstream JSON-RPC fallback. Enables hash-based methods.

```bash
UPSTREAM_RPC_URL=https://eth.llamarpc.com
```

### UPSTREAM_RPC_URL_MAP

JSON object mapping chain IDs to upstream URLs. Overrides `UPSTREAM_RPC_URL` for specific chains.

```bash
UPSTREAM_RPC_URL_MAP='{"1":"https://eth.llamarpc.com","8453":"https://base.llamarpc.com"}'
```
