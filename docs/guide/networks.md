# Supported Networks

The wrapper includes built-in chain ID to dataset mappings for popular EVM networks. Set `PORTAL_USE_DEFAULT_DATASETS=false` to disable built-ins and use only `PORTAL_DATASET_MAP`.

## Built-in Networks

| Chain | Chain ID | Dataset | Type |
|-------|----------|---------|------|
| Ethereum | 1 | `ethereum-mainnet` | Mainnet |
| Optimism | 10 | `optimism-mainnet` | L2 |
| BNB Smart Chain | 56 | `binance-mainnet` | Mainnet |
| Gnosis | 100 | `gnosis-mainnet` | Mainnet |
| Polygon | 137 | `polygon-mainnet` | L2 |
| Fantom | 250 | `fantom-mainnet` | Mainnet |
| zkSync Era | 324 | `zksync-mainnet` | L2 |
| Base | 8453 | `base-mainnet` | L2 |
| Arbitrum One | 42161 | `arbitrum-one` | L2 |
| Arbitrum Nova | 42170 | `arbitrum-nova` | L2 |
| Avalanche C-Chain | 43114 | `avalanche-mainnet` | Mainnet |
| Linea | 59144 | `linea-mainnet` | L2 |
| Scroll | 534352 | `scroll-mainnet` | L2 |
| Blast | 81457 | `blast-mainnet` | L2 |
| Zora | 7777777 | `zora-mainnet` | L2 |

## Testnets

| Chain | Chain ID | Dataset |
|-------|----------|---------|
| Sepolia | 11155111 | `ethereum-sepolia` |
| Base Sepolia | 84532 | `base-sepolia` |
| Arbitrum Sepolia | 421614 | `arbitrum-sepolia` |
| Optimism Sepolia | 11155420 | `optimism-sepolia` |

## Custom Networks

Override or extend the built-in mappings using `PORTAL_DATASET_MAP`:

```bash
# Add a custom network
PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","12345":"my-custom-dataset"}'

# Override a built-in mapping
PORTAL_DATASET_MAP='{"1":"my-ethereum-archive"}'
```

## Single-Chain Mode

For single-chain deployments, use `PORTAL_DATASET` for explicit control:

```bash
SERVICE_MODE=single
PORTAL_DATASET=ethereum-mainnet
PORTAL_CHAIN_ID=1
```

## Checking Network Support

Query the capabilities endpoint to see configured networks:

```bash
curl -s http://localhost:8080/capabilities | jq '.chains'
```

Response:
```json
{
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
}
```

## Network-Specific Considerations

### Start Block

Some datasets don't have data from genesis. The wrapper automatically returns `null` for block queries and `[]` for log queries below the dataset's `start_block`.

### Realtime Support

The `realTime` flag indicates whether the dataset supports streaming up to the current head. When disabled, queries default to finalized blocks only.

Configure behavior with `PORTAL_REALTIME_MODE`:

| Mode | Behavior |
|------|----------|
| `auto` | Use realtime if available (default) |
| `required` | Fail startup if realtime unavailable |
| `disabled` | Always report realtime as false |
