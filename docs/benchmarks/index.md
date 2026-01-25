# Benchmarks

Generated: 2026-01-25 23:26:57 UTC

## Summary

Methods with successful measurements on both wrapper and reference RPC:

| method | wrapper mean ms | rpc mean ms | speedup (rpc/wrapper) |
| --- | --- | --- | --- |
| eth_blockNumber | 37.24 | 50.59 | 1.36x |
| eth_getBlockByHash | 46.51 | 43.79 | 0.94x |
| eth_getBlockByNumber(fullTx=false) | 95.58 | 44.08 | 0.46x |
| eth_getBlockByNumber(fullTx=true) | 97.73 | 59.2 | 0.61x |
| eth_getLogs | 51.79 | 40.25 | 0.78x |
| eth_getTransactionByBlockNumberAndIndex | 92.67 | 42.74 | 0.46x |
| eth_getTransactionByHash | 42.39 | 40.84 | 0.96x |
| eth_getTransactionReceipt | 45.06 | 42.3 | 0.94x |
| trace_block | 239.98 | 196.4 | 0.82x |
| trace_transaction | 43.03 | 39.3 | 0.91x |

Batch sizing impact:

### eth_blockNumber

| target | batch size | mean ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- |
| wrapper | 1 | 41.64 | 41.64 | 65 | 1 |
| rpc | 1 | 41.44 | 41.44 | 65 | 1 |
| wrapper | 5 | 38.32 | 7.66 | 321 | 1 |
| rpc | 5 | 45.51 | 9.1 | 321 | 1 |
| wrapper | 10 | 37.66 | 3.77 | 642 | 1 |
| rpc | 10 | 48.6 | 4.86 | 642 | 1 |
| wrapper | 25 | 36.75 | 1.47 | 1617 | 1 |
| rpc | 25 | 53.51 | 2.14 | 1617 | 1 |
| wrapper | 1000 | 39.69 | 0.04 | 65894 | 1 |
| rpc | 1000 | 229.68 | 0.23 | 65894 | 1 |
| wrapper | 10000 | 56.28 | 0.01 | 668895 | 1 |
| rpc | 10000 | 2324.54 | 0.23 | 668895 | 10 |

### eth_getBlockByNumber

| target | batch size | mean ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- |
| wrapper | 1 | 91.64 | 91.64 | 87 | 1 |
| rpc | 1 | 43.35 | 43.35 | 87 | 1 |
| wrapper | 5 | 83.82 | 16.76 | 431 | 1 |
| rpc | 5 | 47.94 | 9.59 | 431 | 1 |
| wrapper | 10 | 80.51 | 8.05 | 862 | 1 |
| rpc | 10 | 54.4 | 5.44 | 862 | 1 |
| wrapper | 25 | 90.55 | 3.62 | 2167 | 1 |
| rpc | 25 | 65.85 | 2.63 | 2167 | 1 |
| wrapper | 1000 | 139.79 | 0.14 | 87894 | 1 |
| rpc | 1000 | 276.57 | 0.28 | 87894 | 1 |
| wrapper | 10000 | 438.53 | 0.04 | 888895 | 1 |
| rpc | 10000 | 3402.79 | 0.34 | 888895 | 10 |

### eth_getLogs

| target | batch size | mean ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- |
| wrapper | 1 | 55.87 | 55.87 | 243 | 1 |
| rpc | 1 | 41.15 | 41.15 | 243 | 1 |
| wrapper | 5 | 48.79 | 9.76 | 1211 | 1 |
| rpc | 5 | 44.27 | 8.85 | 1211 | 1 |
| wrapper | 10 | 46.98 | 4.7 | 2422 | 1 |
| rpc | 10 | 55.51 | 5.55 | 2422 | 1 |
| wrapper | 25 | 49.94 | 2 | 6067 | 1 |
| rpc | 25 | 73.27 | 2.93 | 6067 | 1 |
| wrapper | 100 | 57.66 | 0.58 | 24293 | 1 |
| rpc | 100 | 79.2 | 0.79 | 24293 | 1 |
| wrapper | 100000 | 4083.11 | 0.04 | 24588896 | 100 |
| rpc | 100000 | 24428.35 | 0.24 | 24588896 | 100 |


Note: some large batches were split into chunks due to upstream limits. The "chunks" column indicates how many requests were used.

## Charts

### Mean Latency by Method

<LatencyChart
  title="Mean Latency by Method"
  :labels='["eth_blockNumber", "eth_getBlockByHash", "eth_getBlockByNumber (no tx)", "eth_getBlockByNumber (full tx)", "eth_getLogs", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionReceipt", "trace_block", "trace_transaction"]'
  :wrapper-data="[37.24, 46.51, 95.58, 97.73, 51.79, 92.67, 42.39, 45.06, 239.98, 43.03]"
  :rpc-data="[50.59, 43.79, 44.08, 59.2, 40.25, 42.74, 40.84, 42.3, 196.4, 39.3]"
  y-axis-label="Mean Latency (ms)"
/>

### P95 Latency by Method

<LatencyChart
  title="P95 Latency by Method"
  :labels='["eth_blockNumber", "eth_getBlockByHash", "eth_getBlockByNumber (no tx)", "eth_getBlockByNumber (full tx)", "eth_getLogs", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionReceipt", "trace_block", "trace_transaction"]'
  :wrapper-data="[39.3, 62.81, 216.27, 146.16, 55.9, 147.85, 44.69, 49.22, 322.43, 52.55]"
  :rpc-data="[64.21, 57.25, 48.48, 115.44, 44.15, 50.66, 54.94, 51.78, 245.01, 46.75]"
  y-axis-label="P95 Latency (ms)"
/>

### Relative Performance (Speedup)

<SpeedupChart
  :labels='["eth_blockNumber", "eth_getBlockByHash", "eth_getBlockByNumber (no tx)", "eth_getBlockByNumber (full tx)", "eth_getLogs", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionReceipt", "trace_block", "trace_transaction"]'
  :speedups="[1.36, 0.94, 0.46, 0.61, 0.78, 0.46, 0.96, 0.94, 0.82, 0.91]"
/>

### Batch Size Scaling

The wrapper excels at large batch requests due to Portal's efficient data retrieval.

<BatchChart
  title="eth_blockNumber: Batch Size vs Latency"
  :batch-sizes="[1, 5, 10, 25, 1000, 10000]"
  :wrapper-data="[41.64, 38.32, 37.66, 36.75, 39.69, 56.28]"
  :rpc-data="[41.44, 45.51, 48.6, 53.51, 229.68, 2324.54]"
/>

<BatchChart
  title="eth_getBlockByNumber: Batch Size vs Latency"
  :batch-sizes="[1, 5, 10, 25, 1000, 10000]"
  :wrapper-data="[91.64, 83.82, 80.51, 90.55, 139.79, 438.53]"
  :rpc-data="[43.35, 47.94, 54.4, 65.85, 276.57, 3402.79]"
/>

<BatchChart
  title="eth_getLogs: Batch Size vs Latency"
  :batch-sizes="[1, 5, 10, 25, 100, 100000]"
  :wrapper-data="[55.87, 48.79, 46.98, 49.94, 57.66, 4083.11]"
  :rpc-data="[41.15, 44.27, 55.51, 73.27, 79.2, 24428.35]"
/>


## Run Parameters

- rpc_url: `https://base-mainnet.g.alchemy.com/v2/hLOW08JLy4YPql5tUXsp6XtM2qezg0RP`
- wrapper_url: `http://localhost:8080/v1/evm/8453`
- chain_id: 8453
- iterations: 10
- concurrency: 1
- delay_ms: 50
- timeout_ms: 60000
- batch_sizes: 1,5,10,25,1000,10000
- batch_sizes_heavy: 1,5,10,25,100,100000
- batch_methods: eth_blockNumber,eth_getBlockByNumber,eth_getLogs
- bench_methods: eth_blockNumber,eth_getBlockByNumber,eth_getBlockByHash,eth_getTransactionByHash,eth_getTransactionReceipt,eth_getTransactionByBlockNumberAndIndex,eth_getLogs,trace_block,trace_transaction
- batch_chunk_size: 1000
- retries: 2

## Single Request Results

| target | method | ok | errors | mean ms | p95 ms | request bytes |
| --- | --- | --- | --- | --- | --- | --- |
| wrapper | eth_blockNumber | 10 | 0 | 37.24 | 39.3 | 63 |
| rpc | eth_blockNumber | 10 | 0 | 50.59 | 64.21 | 63 |
| wrapper | eth_getBlockByHash | 10 | 0 | 46.51 | 62.81 | 140 |
| rpc | eth_getBlockByHash | 10 | 0 | 43.79 | 57.25 | 140 |
| wrapper | eth_getBlockByNumber(fullTx=false) | 10 | 0 | 95.58 | 216.27 | 85 |
| rpc | eth_getBlockByNumber(fullTx=false) | 10 | 0 | 44.08 | 48.48 | 85 |
| wrapper | eth_getBlockByNumber(fullTx=true) | 10 | 0 | 97.73 | 146.16 | 84 |
| rpc | eth_getBlockByNumber(fullTx=true) | 10 | 0 | 59.2 | 115.44 | 84 |
| wrapper | eth_getLogs | 10 | 0 | 51.79 | 55.9 | 241 |
| rpc | eth_getLogs | 10 | 0 | 40.25 | 44.15 | 241 |
| wrapper | eth_getTransactionByBlockNumberAndIndex | 10 | 0 | 92.67 | 147.85 | 104 |
| rpc | eth_getTransactionByBlockNumberAndIndex | 10 | 0 | 42.74 | 50.66 | 104 |
| wrapper | eth_getTransactionByHash | 10 | 0 | 42.39 | 44.69 | 140 |
| rpc | eth_getTransactionByHash | 10 | 0 | 40.84 | 54.94 | 140 |
| wrapper | eth_getTransactionReceipt | 10 | 0 | 45.06 | 49.22 | 141 |
| rpc | eth_getTransactionReceipt | 10 | 0 | 42.3 | 51.78 | 141 |
| wrapper | trace_block | 10 | 0 | 239.98 | 322.43 | 70 |
| rpc | trace_block | 10 | 0 | 196.4 | 245.01 | 70 |
| wrapper | trace_transaction | 10 | 0 | 43.03 | 52.55 | 133 |
| rpc | trace_transaction | 10 | 0 | 39.3 | 46.75 | 133 |

## Batch Results

| target | method | batch size | ok | errors | mean ms | p95 ms | mean ms / req | request bytes | chunks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wrapper | eth_blockNumber (batch=1) | 1 | 10 | 0 | 41.64 | 91.56 | 41.64 | 65 | 1 |
| rpc | eth_blockNumber (batch=1) | 1 | 10 | 0 | 41.44 | 49.21 | 41.44 | 65 | 1 |
| wrapper | eth_blockNumber (batch=5) | 5 | 50 | 0 | 38.32 | 40.76 | 7.66 | 321 | 1 |
| rpc | eth_blockNumber (batch=5) | 5 | 50 | 0 | 45.51 | 56.24 | 9.1 | 321 | 1 |
| wrapper | eth_blockNumber (batch=10) | 10 | 100 | 0 | 37.66 | 40.18 | 3.77 | 642 | 1 |
| rpc | eth_blockNumber (batch=10) | 10 | 100 | 0 | 48.6 | 59.3 | 4.86 | 642 | 1 |
| wrapper | eth_blockNumber (batch=25) | 25 | 250 | 0 | 36.75 | 38.94 | 1.47 | 1617 | 1 |
| rpc | eth_blockNumber (batch=25) | 25 | 250 | 0 | 53.51 | 63.68 | 2.14 | 1617 | 1 |
| wrapper | eth_blockNumber (batch=1000) | 1000 | 10000 | 0 | 39.69 | 41.47 | 0.04 | 65894 | 1 |
| rpc | eth_blockNumber (batch=1000) | 1000 | 10000 | 0 | 229.68 | 360.44 | 0.23 | 65894 | 1 |
| wrapper | eth_blockNumber (batch=10000) | 10000 | 100000 | 0 | 56.28 | 68.88 | 0.01 | 668895 | 1 |
| rpc | eth_blockNumber (batch=10000) | 10000 | 100000 | 0 | 2324.54 | 3231.37 | 0.23 | 668895 | 10 |
| wrapper | eth_getBlockByNumber (batch=1) | 1 | 10 | 0 | 91.64 | 197.06 | 91.64 | 87 | 1 |
| rpc | eth_getBlockByNumber (batch=1) | 1 | 10 | 0 | 43.35 | 48.58 | 43.35 | 87 | 1 |
| wrapper | eth_getBlockByNumber (batch=5) | 5 | 50 | 0 | 83.82 | 125.44 | 16.76 | 431 | 1 |
| rpc | eth_getBlockByNumber (batch=5) | 5 | 50 | 0 | 47.94 | 58.08 | 9.59 | 431 | 1 |
| wrapper | eth_getBlockByNumber (batch=10) | 10 | 100 | 0 | 80.51 | 88.69 | 8.05 | 862 | 1 |
| rpc | eth_getBlockByNumber (batch=10) | 10 | 100 | 0 | 54.4 | 74.06 | 5.44 | 862 | 1 |
| wrapper | eth_getBlockByNumber (batch=25) | 25 | 250 | 0 | 90.55 | 106.45 | 3.62 | 2167 | 1 |
| rpc | eth_getBlockByNumber (batch=25) | 25 | 250 | 0 | 65.85 | 108.84 | 2.63 | 2167 | 1 |
| wrapper | eth_getBlockByNumber (batch=1000) | 1000 | 10000 | 0 | 139.79 | 154.37 | 0.14 | 87894 | 1 |
| rpc | eth_getBlockByNumber (batch=1000) | 1000 | 10000 | 0 | 276.57 | 322.21 | 0.28 | 87894 | 1 |
| wrapper | eth_getBlockByNumber (batch=10000) | 10000 | 100000 | 0 | 438.53 | 499.13 | 0.04 | 888895 | 1 |
| rpc | eth_getBlockByNumber (batch=10000) | 10000 | 100000 | 0 | 3402.79 | 4035.42 | 0.34 | 888895 | 10 |
| wrapper | eth_getLogs (batch=1) | 1 | 10 | 0 | 55.87 | 126.22 | 55.87 | 243 | 1 |
| rpc | eth_getLogs (batch=1) | 1 | 10 | 0 | 41.15 | 45.89 | 41.15 | 243 | 1 |
| wrapper | eth_getLogs (batch=5) | 5 | 50 | 0 | 48.79 | 57.42 | 9.76 | 1211 | 1 |
| rpc | eth_getLogs (batch=5) | 5 | 50 | 0 | 44.27 | 51.3 | 8.85 | 1211 | 1 |
| wrapper | eth_getLogs (batch=10) | 10 | 100 | 0 | 46.98 | 50.12 | 4.7 | 2422 | 1 |
| rpc | eth_getLogs (batch=10) | 10 | 100 | 0 | 55.51 | 75.44 | 5.55 | 2422 | 1 |
| wrapper | eth_getLogs (batch=25) | 25 | 250 | 0 | 49.94 | 54.79 | 2 | 6067 | 1 |
| rpc | eth_getLogs (batch=25) | 25 | 250 | 0 | 73.27 | 154.49 | 2.93 | 6067 | 1 |
| wrapper | eth_getLogs (batch=100) | 100 | 1000 | 0 | 57.66 | 76.1 | 0.58 | 24293 | 1 |
| rpc | eth_getLogs (batch=100) | 100 | 1000 | 0 | 79.2 | 141.44 | 0.79 | 24293 | 1 |
| wrapper | eth_getLogs (batch=100000) | 100000 | 309000 | 691000 | 4083.11 | 5986.02 | 0.04 | 24588896 | 100 |
| rpc | eth_getLogs (batch=100000) | 100000 | 212552 | 787448 | 24428.35 | 27425.25 | 0.24 | 24588896 | 100 |

## Graphs (mean ms)

```
eth_blockNumber
  wrapper    37.24 |########################        |
  rpc        50.59 |################################|
eth_getBlockByHash
  wrapper    46.51 |################################|
  rpc        43.79 |##############################  |
eth_getBlockByNumber(fullTx=false)
  wrapper    95.58 |################################|
  rpc        44.08 |###############                 |
eth_getBlockByNumber(fullTx=true)
  wrapper    97.73 |################################|
  rpc        59.20 |###################             |
eth_getLogs
  wrapper    51.79 |################################|
  rpc        40.25 |#########################       |
eth_getTransactionByBlockNumberAndIndex
  wrapper    92.67 |################################|
  rpc        42.74 |###############                 |
eth_getTransactionByHash
  wrapper    42.39 |################################|
  rpc        40.84 |############################### |
eth_getTransactionReceipt
  wrapper    45.06 |################################|
  rpc        42.30 |##############################  |
trace_block
  wrapper    239.98 |################################|
  rpc        196.40 |##########################      |
trace_transaction
  wrapper    43.03 |################################|
  rpc        39.30 |#############################   |

Batch: eth_blockNumber
  size=1
    wrapper    41.64 |################################|
    rpc        41.44 |################################|
  size=5
    wrapper    38.32 |###########################     |
    rpc        45.51 |################################|
  size=10
    wrapper    37.66 |#########################       |
    rpc        48.60 |################################|
  size=25
    wrapper    36.75 |######################          |
    rpc        53.51 |################################|
  size=1000
    wrapper    39.69 |######                          |
    rpc        229.68 |################################|
  size=10000
    wrapper    56.28 |#                               |
    rpc        2324.54 |################################|

Batch: eth_getBlockByNumber
  size=1
    wrapper    91.64 |################################|
    rpc        43.35 |###############                 |
  size=5
    wrapper    83.82 |################################|
    rpc        47.94 |##################              |
  size=10
    wrapper    80.51 |################################|
    rpc        54.40 |######################          |
  size=25
    wrapper    90.55 |################################|
    rpc        65.85 |#######################         |
  size=1000
    wrapper    139.79 |################                |
    rpc        276.57 |################################|
  size=10000
    wrapper    438.53 |####                            |
    rpc        3402.79 |################################|

Batch: eth_getLogs
  size=1
    wrapper    55.87 |################################|
    rpc        41.15 |########################        |
  size=5
    wrapper    48.79 |################################|
    rpc        44.27 |#############################   |
  size=10
    wrapper    46.98 |###########################     |
    rpc        55.51 |################################|
  size=25
    wrapper    49.94 |######################          |
    rpc        73.27 |################################|
  size=100
    wrapper    57.66 |#######################         |
    rpc        79.20 |################################|
  size=100000
    wrapper    4083.11 |#####                           |
    rpc        24428.35 |################################|

```

## Graphs (p95 ms)

```
eth_blockNumber
  wrapper    39.30 |####################            |
  rpc        64.21 |################################|
eth_getBlockByHash
  wrapper    62.81 |################################|
  rpc        57.25 |#############################   |
eth_getBlockByNumber(fullTx=false)
  wrapper    216.27 |################################|
  rpc        48.48 |#######                         |
eth_getBlockByNumber(fullTx=true)
  wrapper    146.16 |################################|
  rpc        115.44 |#########################       |
eth_getLogs
  wrapper    55.90 |################################|
  rpc        44.15 |#########################       |
eth_getTransactionByBlockNumberAndIndex
  wrapper    147.85 |################################|
  rpc        50.66 |###########                     |
eth_getTransactionByHash
  wrapper    44.69 |##########################      |
  rpc        54.94 |################################|
eth_getTransactionReceipt
  wrapper    49.22 |##############################  |
  rpc        51.78 |################################|
trace_block
  wrapper    322.43 |################################|
  rpc        245.01 |########################        |
trace_transaction
  wrapper    52.55 |################################|
  rpc        46.75 |############################    |
```