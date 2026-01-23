# sqd-portal-rpc-wrapper

Use when implementing or debugging SQD Portal wrapper service.

## Quick Commands
- Install: `npm install`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Dev server: `npm run dev`
- Build: `npm run build`

## Debugging
- Local run: `SERVICE_MODE=single PORTAL_DATASET=ethereum-mainnet PORTAL_CHAIN_ID=1 npm run dev`
- Multi-chain: `SERVICE_MODE=multi npm run dev` then `POST /v1/evm/1` or `POST /` with `X-Chain-Id`.

## Release
- Build image: `docker build -t sqd-portal-wrapper .`
- Compose: `docker compose up --build`
