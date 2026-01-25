# Capabilities Endpoint

The `/capabilities` endpoint provides service metadata for discovery and monitoring.

## Request

```bash
curl http://localhost:8080/capabilities
```

## Response

```json
{
  "service": {
    "name": "sqd-portal-rpc-wrapper",
    "version": "0.1.0"
  },
  "mode": "multi",
  "methods": [
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "eth_getTransactionByBlockNumberAndIndex",
    "eth_getLogs",
    "trace_block",
    "trace_transaction"
  ],
  "chains": {
    "1": {
      "dataset": "ethereum-mainnet",
      "aliases": ["eth", "ethereum"],
      "startBlock": 0,
      "realTime": true
    },
    "8453": {
      "dataset": "base-mainnet",
      "aliases": ["base"],
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

## Fields

### service

Service identification:
- `name`: Service name
- `version`: Service version from package.json

### mode

Deployment mode: `single` or `multi`

### methods

Array of supported JSON-RPC method names.

::: info
Methods requiring upstream RPC are included even if upstream is not configured. They will return "method not supported" at runtime without upstream.
:::

### chains

Map of chain ID to chain information:

| Field | Description |
|-------|-------------|
| `dataset` | Portal dataset name |
| `aliases` | Human-readable names |
| `startBlock` | First available block (from metadata) |
| `realTime` | Whether realtime data is available |

### portalEndpoints

Template URLs for Portal endpoints. Replace `{dataset}` with the chain's dataset name.

## Use Cases

### Health Dashboard

Query capabilities to build monitoring dashboards:

```javascript
const caps = await fetch('/capabilities').then(r => r.json());
for (const [chainId, info] of Object.entries(caps.chains)) {
  console.log(`Chain ${chainId}: realTime=${info.realTime}`);
}
```

### Client Configuration

Discover available methods before making requests:

```javascript
const caps = await fetch('/capabilities').then(r => r.json());
if (caps.methods.includes('trace_block')) {
  // Safe to call trace_block
}
```

### Multi-Chain Routing

Find available chains for multi-chain setups:

```javascript
const caps = await fetch('/capabilities').then(r => r.json());
const chainIds = Object.keys(caps.chains);
```
