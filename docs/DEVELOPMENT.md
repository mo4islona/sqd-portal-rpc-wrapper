# Development

## Commands
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm test`

## Local requests
Single-chain:

```bash
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Multi-chain:

```bash
curl -s -X POST http://localhost:8080/v1/evm/1 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```
