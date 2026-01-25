# Limits Configuration

Settings to protect the service from abuse and resource exhaustion.

## Request Limits

### MAX_REQUEST_BODY_BYTES

Maximum size of incoming request body.

**Default:** `8388608` (8 MB)

```bash
MAX_REQUEST_BODY_BYTES=16777216  # 16 MB
```

### MAX_CONCURRENT_REQUESTS

Maximum concurrent requests. Returns 503 when exceeded.

**Default:** `128`

```bash
MAX_CONCURRENT_REQUESTS=256
```

### HANDLER_TIMEOUT_MS

Per-request handler timeout in milliseconds.

**Default:** `60000` (60 seconds)

```bash
HANDLER_TIMEOUT_MS=30000  # 30 seconds
```

Alias: `REQUEST_TIMEOUT_MS`

## HTTP Settings

### HTTP_TIMEOUT

HTTP client timeout for Portal and upstream requests.

**Default:** `60000` (60 seconds)

```bash
HTTP_TIMEOUT=30000  # 30 seconds
```

## Log Query Limits

### MAX_LOG_BLOCK_RANGE

Maximum block range for `eth_getLogs` queries.

**Default:** `1000000`

```bash
MAX_LOG_BLOCK_RANGE=100000  # 100k blocks
```

### MAX_LOG_ADDRESSES

Maximum addresses in `eth_getLogs` filter.

**Default:** `1000`

```bash
MAX_LOG_ADDRESSES=100
```

## NDJSON Limits

### MAX_NDJSON_LINE_BYTES

Maximum size of a single NDJSON line from Portal.

**Default:** `8388608` (8 MB)

```bash
MAX_NDJSON_LINE_BYTES=16777216  # 16 MB
```

### MAX_NDJSON_BYTES

Maximum total size of NDJSON response from Portal.

**Default:** `67108864` (64 MB)

```bash
MAX_NDJSON_BYTES=134217728  # 128 MB
```

## Block Number Validation

### MAX_BLOCK_NUMBER

Maximum valid block number.

**Default:** `9007199254740991` (`Number.MAX_SAFE_INTEGER`)

```bash
MAX_BLOCK_NUMBER=50000000  # 50 million
```

## Recommended Production Settings

```bash
# Conservative limits for public endpoints
MAX_CONCURRENT_REQUESTS=64
MAX_LOG_BLOCK_RANGE=10000
MAX_LOG_ADDRESSES=50
HANDLER_TIMEOUT_MS=30000
HTTP_TIMEOUT=30000
MAX_REQUEST_BODY_BYTES=1048576  # 1 MB

# Higher limits for internal use
MAX_CONCURRENT_REQUESTS=512
MAX_LOG_BLOCK_RANGE=1000000
MAX_LOG_ADDRESSES=1000
HANDLER_TIMEOUT_MS=120000
HTTP_TIMEOUT=60000
MAX_REQUEST_BODY_BYTES=16777216  # 16 MB
```

## Error Responses

When limits are exceeded:

| Limit | HTTP | Code | Message |
|-------|------|------|---------|
| Request body too large | 400 | -32600 | Request body too large |
| Concurrent requests | 503 | -32603 | Service unavailable |
| Handler timeout | 504 | -32000 | Request timeout |
| Block range | 400 | -32012 | Range too large; max block range N |
| Address count | 400 | -32012 | Specify less number of address |
