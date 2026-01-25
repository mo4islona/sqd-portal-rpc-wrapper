# Error Handling

## Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "invalid params",
    "data": { "details": "..." }
  }
}
```

## Error Codes

| Code | HTTP | Category | Description |
|------|------|----------|-------------|
| -32700 | 400 | Parse Error | Invalid JSON |
| -32600 | 400 | Invalid Request | Non-JSON-RPC payload |
| -32601 | 404 | Method Not Found | Unsupported method |
| -32602 | 400 | Invalid Params | Validation errors |
| -32603 | 502/503 | Internal Error | Server/Portal errors |
| -32000 | 504 | Server Error | Handler timeout |
| -32005 | 429 | Rate Limit | Portal throttling |
| -32012 | 400 | Limit Exceeded | Range/address limits |
| -32014 | 404 | Not Found | Missing data |
| -32016 | 401 | Unauthorized | Invalid API key |

## Common Errors

### Parse Error (-32700)

Invalid JSON in request body:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}
```

### Invalid Request (-32600)

Missing required JSON-RPC fields:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"invalid request"}}
```

### Method Not Found (-32601)

Unsupported method or upstream-only method without upstream configured:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not supported"}}
```

::: tip
The message always contains `method not supported` for eRPC normalization.
:::

### Invalid Params (-32602)

Parameter validation failed:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"invalid block number"}}
```

Common causes:
- Invalid block tag
- Invalid hex format
- Missing required parameter
- Wrong parameter type

### Pending Block Error (-32602)

The `pending` block tag is not supported:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"pending block not found"}}
```

::: tip
The message always contains `pending block not found` for eRPC normalization.
:::

### Range Too Large (-32012)

Log query block range exceeds limit:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32012,"message":"range too large; max block range 1000000"}}
```

::: tip
The message always contains `range too large` and `max block range` for eRPC normalization.
:::

### Too Many Addresses (-32012)

Log query address filter exceeds limit:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32012,"message":"specify less number of address"}}
```

### Rate Limited (-32005)

Portal rate limiting:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"Too Many Requests"}}
```

::: tip
The message always contains `Too Many Requests` or `rate limit` for eRPC normalization.
:::

### Unauthorized (-32016)

Invalid or missing API key:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32016,"message":"unauthorized"}}
```

### Conflict (-32603)

Portal detected a chain reorganization. The response includes previous blocks for client recovery:

```json
{
  "jsonrpc":"2.0",
  "id":1,
  "error":{
    "code":-32603,
    "message":"conflict",
    "data":{
      "previousBlocks":[
        {"number":12345,"hash":"0x..."}
      ]
    }
  }
}
```

### Timeout (-32000)

Handler exceeded timeout limit:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"request timeout"}}
```

### Service Unavailable (-32603)

Portal or circuit breaker unavailable:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"unavailable"}}
```

HTTP status: 503

## HTTP Status Mapping

| Condition | HTTP Status |
|-----------|-------------|
| Parse/validation errors | 400 |
| Unauthorized | 401 |
| Method not found | 404 |
| Data not found | 404 |
| Conflict (reorg) | 409 |
| Rate limit | 429 |
| Portal errors | 502 |
| Unavailable | 503 |
| Timeout | 504 |
