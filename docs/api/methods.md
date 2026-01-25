# Supported Methods

## Overview

| Method | Source | Notes |
|--------|--------|-------|
| `eth_chainId` | Local | — |
| `eth_blockNumber` | Portal | — |
| `eth_getBlockByNumber` | Portal | — |
| `eth_getBlockByHash` | Upstream | Requires upstream |
| `eth_getTransactionByBlockNumberAndIndex` | Portal | — |
| `eth_getTransactionByHash` | Upstream | Requires upstream |
| `eth_getTransactionReceipt` | Upstream | Requires upstream |
| `eth_getLogs` | Portal / Upstream | `blockHash` filter → upstream |
| `trace_block` | Portal | — |
| `trace_transaction` | Upstream | Requires upstream |

## eth_chainId

Returns the chain ID.

**Parameters:** None

**Returns:** `QUANTITY` - Chain ID as hex

```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

```json
{"jsonrpc":"2.0","id":1,"result":"0x1"}
```

---

## eth_blockNumber

Returns the current block number.

**Parameters:** None

**Returns:** `QUANTITY` - Block number as hex

```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

```json
{"jsonrpc":"2.0","id":1,"result":"0x134a5b2"}
```

---

## eth_getBlockByNumber

Returns block information by number.

**Parameters:**
1. `QUANTITY|TAG` - Block number or tag
2. `Boolean` - If `true`, returns full transaction objects; if `false`, transaction hashes only

**Returns:** Block object or `null`

```bash
# Get latest block with transaction hashes
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}'

# Get specific block with full transactions
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x134a5b2",true]}'
```

---

## eth_getBlockByHash

Returns block information by hash. **Requires upstream RPC.**

**Parameters:**
1. `DATA` - 32-byte block hash
2. `Boolean` - If `true`, returns full transaction objects

**Returns:** Block object or `null`

---

## eth_getTransactionByBlockNumberAndIndex

Returns transaction by block number and index.

**Parameters:**
1. `QUANTITY|TAG` - Block number or tag
2. `QUANTITY` - Transaction index

**Returns:** Transaction object or `null`

```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByBlockNumberAndIndex","params":["0x134a5b2","0x0"]}'
```

---

## eth_getTransactionByHash

Returns transaction by hash. **Requires upstream RPC.**

**Parameters:**
1. `DATA` - 32-byte transaction hash

**Returns:** Transaction object or `null`

---

## eth_getTransactionReceipt

Returns transaction receipt by hash. **Requires upstream RPC.**

**Parameters:**
1. `DATA` - 32-byte transaction hash

**Returns:** Receipt object or `null`

---

## eth_getLogs

Returns logs matching filter criteria.

**Parameters:** Single filter object with:
- `fromBlock`: `QUANTITY|TAG` (optional, default: `latest`)
- `toBlock`: `QUANTITY|TAG` (optional, default: `latest`)
- `address`: `DATA|Array` - Contract address(es) (optional)
- `topics`: `Array` - Topic filters (optional)
- `blockHash`: `DATA` - Block hash (mutually exclusive with from/toBlock, requires upstream)

**Returns:** Array of log objects

```bash
# Get logs from last 100 blocks
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"eth_getLogs",
    "params":[{
      "fromBlock":"0x134a4f2",
      "toBlock":"0x134a5b2",
      "address":"0xdac17f958d2ee523a2206206994597c13d831ec7",
      "topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
    }]
  }'
```

**Limits:**
- Max block range: `MAX_LOG_BLOCK_RANGE` (default: 1,000,000)
- Max addresses: `MAX_LOG_ADDRESSES` (default: 1,000)

---

## trace_block

Returns all traces from a block.

**Parameters:**
1. `QUANTITY|TAG` - Block number or tag

**Returns:** Array of trace objects

```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"trace_block","params":["0x134a5b2"]}'
```

---

## trace_transaction

Returns traces for a specific transaction. **Requires upstream RPC.**

**Parameters:**
1. `DATA` - 32-byte transaction hash

**Returns:** Array of trace objects
