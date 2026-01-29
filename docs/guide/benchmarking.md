# Benchmarking

The wrapper includes a benchmarking tool to compare performance against reference RPC endpoints.

## Running Benchmarks

```bash
RPC_URL=https://base.llamarpc.com \
WRAPPER_URL=http://localhost:8080/v1/evm/8453 \
CHAIN_ID=8453 \
npm run bench
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | required | Reference RPC endpoint URL |
| `WRAPPER_URL` | required | Wrapper endpoint URL |
| `CHAIN_ID` | required | Chain ID to test |
| `BENCH_ITERATIONS` | `25` | Number of iterations per method |
| `BENCH_CONCURRENCY` | `1` | Concurrent requests |
| `BENCH_TIMEOUT_MS` | `8000` | Request timeout |
| `BENCH_DELAY_MS` | `0` | Delay between requests |
| `BENCH_BATCH_SIZES` | `1,5,10,25` | Batch sizes for batch tests |
| `BENCH_BATCH_SIZES_HEAVY` | — | Optional batch sizes for heavy methods (logs/trace/block-by-number) |
| `BENCH_BATCH_METHODS` | `eth_blockNumber` | Comma-separated methods to batch |
| `BENCH_BATCH_HEAVY_METHODS` | `eth_getLogs,eth_getBlockByNumber,eth_getTransactionByBlockNumberAndIndex,trace_block,trace_transaction` | Comma-separated methods treated as heavy for batch sizing |
| `BENCH_METHODS` | — | Comma-separated allowlist of methods to run |
| `BENCH_BATCH_CHUNK_SIZE` | `1000` | Split oversized batches if upstream rejects large payloads |
| `BENCH_RETRIES` | `0` | Retry count for transient failures |

## Optional Parameters

| Variable | Description |
|----------|-------------|
| `WRAPPER_HEADERS` | JSON headers for wrapper (e.g., `'{"X-Chain-Id":"8453"}'`) |
| `BENCH_BLOCK_NUMBER` | Specific block number to test |
| `BENCH_BLOCK_HASH` | Specific block hash to test |
| `BENCH_TX_INDEX` | Transaction index to test |
| `BENCH_TX_HASH` | Transaction hash to test |
| `BENCH_BLOCK_OFFSET` | Offset from head for block selection |
| `BENCH_BLOCK_SEARCH_DEPTH` | Depth to search for test data |

## JSON Output

For CI/CD integration:

```bash
npm run bench -- --json > results.json
```

## Batch Example

```bash
BENCH_BATCH_SIZES=1,5,10,25 \
BENCH_BATCH_METHODS=eth_blockNumber \
npm run bench -- --json
```

## Batch Coalescing Notes

For batch methods that hit Portal streams (`eth_getBlockByNumber`, `eth_getTransactionByBlockNumberAndIndex`,
`trace_block`), the wrapper coalesces contiguous block numbers into fewer Portal requests. Benchmark batch
results therefore reflect the coalescing behavior, not a 1:1 upstream request count.

## Latest Report

The latest benchmark report is published in the docs:
- `/benchmarks/` (charts + comparison tables)

## Example Output

```
Benchmarking sqd-portal-wrapper vs reference RPC
Chain ID: 8453 (base-mainnet)
Iterations: 25, Concurrency: 1

eth_blockNumber
  RPC:     avg 45ms, p50 42ms, p99 89ms
  Wrapper: avg 38ms, p50 35ms, p99 72ms
  ✓ Wrapper 15% faster

eth_getBlockByNumber (latest, full=false)
  RPC:     avg 52ms, p50 48ms, p99 95ms
  Wrapper: avg 125ms, p50 118ms, p99 210ms
  ✗ RPC 58% faster

eth_getLogs (100 blocks)
  RPC:     avg 380ms, p50 350ms, p99 620ms
  Wrapper: avg 210ms, p50 195ms, p99 380ms
  ✓ Wrapper 45% faster
```

## Interpreting Results

The wrapper typically excels at:
- **Log queries** - NDJSON streaming is efficient for large ranges
- **Trace queries** - Portal's trace format is optimized

The wrapper may be slower for:
- **Simple block queries** - Extra hop through Portal
- **Hash-based lookups** - Requires upstream proxy

## Performance Tips

1. **Enable Portal API key** - Avoid rate limits
2. **Use multi-chain mode** - Single instance for multiple chains
3. **Configure circuit breaker** - Fast-fail on Portal issues
4. **Monitor metrics** - Watch `portal_latency_seconds`
