# Configuration

## Service
- `SERVICE_LISTEN_ADDR`: `:8080` or `0.0.0.0:8080`
- `SERVICE_MODE`: `single` or `multi`

## Portal
- `PORTAL_BASE_URL`: dataset root, default `https://portal.sqd.dev/datasets`
- `PORTAL_DATASET`: single-chain dataset override
- `PORTAL_DATASET_MAP`: JSON object mapping chainId to dataset
- `PORTAL_CHAIN_ID`: required in single-chain mode unless map has one entry
- `PORTAL_API_KEY`: optional portal auth
- `PORTAL_API_KEY_HEADER`: header name, default `X-API-Key`

## Limits
- `MAX_LOG_BLOCK_RANGE`: default `1000000`
- `MAX_LOG_ADDRESSES`: default `1000`
- `MAX_BLOCK_NUMBER`: default `2^62`
- `HTTP_TIMEOUT`: ms, default `60000`
- `MAX_CONCURRENT_REQUESTS`: default `128`
- `MAX_NDJSON_LINE_BYTES`: default `8388608`
- `MAX_NDJSON_BYTES`: default `67108864`
- `MAX_REQUEST_BODY_BYTES`: default `8388608`

## Incoming Auth
- `WRAPPER_API_KEY`: require incoming header
- `WRAPPER_API_KEY_HEADER`: header name, default `X-API-Key`
