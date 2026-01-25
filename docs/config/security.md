# Security Configuration

Settings for authentication and security hardening.

## Incoming Authentication

### WRAPPER_API_KEY

Require API key for incoming requests. When set, all requests must include the key.

```bash
WRAPPER_API_KEY=your-secret-key
```

### WRAPPER_API_KEY_HEADER

Header name for incoming API key.

**Default:** `X-API-Key`

```bash
WRAPPER_API_KEY_HEADER=Authorization
```

## Usage

When `WRAPPER_API_KEY` is set:

```bash
# Valid request
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: your-secret-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'

# Invalid/missing key returns 401
{"jsonrpc":"2.0","id":null,"error":{"code":-32016,"message":"unauthorized"}}
```

## Security Features

### Timing-Safe Comparison

API keys are compared using timing-safe algorithms to prevent timing attacks.

### Key Redaction

API keys are automatically redacted in logs:

```json
{"msg":"incoming request","headers":{"x-api-key":"[REDACTED]"}}
```

### Request Body Logging

Request bodies are never logged to prevent sensitive data exposure.

## Recommended Practices

### Use Strong Keys

Generate cryptographically secure keys:

```bash
# Generate a 32-byte hex key
openssl rand -hex 32
```

### Separate Keys

Use different keys for different purposes:

```bash
# Portal authentication
PORTAL_API_KEY=portal-specific-key

# Incoming wrapper authentication
WRAPPER_API_KEY=client-specific-key
```

### Rotate Keys

Implement key rotation by supporting multiple keys (deploy new version with new key, then deprecate old).

### Network Security

In addition to API keys:

1. **Use TLS** - Deploy behind a TLS-terminating proxy
2. **IP Allowlisting** - Restrict access at network level
3. **Rate Limiting** - Use external rate limiting (nginx, cloud provider)

## Docker Secrets

In Docker/Kubernetes, use secrets instead of environment variables:

```yaml
# docker-compose.yml
services:
  wrapper:
    environment:
      WRAPPER_API_KEY_FILE: /run/secrets/wrapper_key
    secrets:
      - wrapper_key

secrets:
  wrapper_key:
    file: ./secrets/wrapper_key.txt
```

```yaml
# Kubernetes
apiVersion: v1
kind: Secret
metadata:
  name: wrapper-secrets
type: Opaque
data:
  api-key: <base64-encoded-key>
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: wrapper
          env:
            - name: WRAPPER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: wrapper-secrets
                  key: api-key
```
