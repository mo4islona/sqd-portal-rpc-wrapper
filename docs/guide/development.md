# Local Development

## Prerequisites

- Node.js 20.10+
- npm

## Setup

```bash
git clone https://github.com/0x666c6f/sqd-portal-rpc-wrapper.git
cd sqd-portal-rpc-wrapper
npm install
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm test` | Run tests with coverage |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |

## Development Server

```bash
npm run dev
```

The server starts at `http://localhost:8080` by default.

## Testing Requests

### Single-Chain Mode

```bash
# Set environment
export SERVICE_MODE=single
export PORTAL_DATASET=ethereum-mainnet
export PORTAL_CHAIN_ID=1

# Start server
npm run dev

# Test
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

### Multi-Chain Mode

```bash
# Set environment
export SERVICE_MODE=multi
export PORTAL_DATASET_MAP='{"1":"ethereum-mainnet","8453":"base-mainnet"}'

# Start server
npm run dev

# Test with path parameter
curl -s -X POST http://localhost:8080/v1/evm/1 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'

# Test with header
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -H 'X-Chain-Id: 8453' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

## Running Tests

```bash
# All tests with coverage
npm test

# Watch mode
npm run test:watch

# Specific test file
npx vitest run test/handlers.test.ts
```

## Project Structure

```
src/
├── index.ts           # Entry point
├── server.ts          # Fastify server setup
├── config.ts          # Configuration parsing
├── errors.ts          # Error types and factories
├── jsonrpc.ts         # JSON-RPC parsing/validation
├── metrics.ts         # Prometheus metrics
├── portal/
│   ├── client.ts      # Portal HTTP client
│   ├── mapping.ts     # Chain ID to dataset mapping
│   ├── ndjson.ts      # NDJSON stream parser
│   └── types.ts       # Portal request/response types
├── rpc/
│   ├── handlers.ts    # Method dispatch and handling
│   ├── validation.ts  # Parameter validation
│   ├── conversion.ts  # Portal → JSON-RPC conversion
│   └── upstream.ts    # Upstream RPC client
└── util/
    ├── concurrency.ts # Concurrency limiter
    ├── hex.ts         # Hex utilities
    └── quantity.ts    # Quantity parsing
```

## Code Style

The project uses:
- TypeScript with strict mode
- ESLint for linting
- Prettier-compatible formatting

```bash
# Check types
npm run typecheck

# Lint
npm run lint
```
