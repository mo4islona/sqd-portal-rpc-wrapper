# Docker Deployment

## Building the Image

```bash
docker build -t sqd-portal-wrapper .
```

## Running with Docker

### Single-Chain Mode

```bash
docker run -p 8080:8080 \
  -e SERVICE_MODE=single \
  -e PORTAL_DATASET=ethereum-mainnet \
  -e PORTAL_CHAIN_ID=1 \
  sqd-portal-wrapper
```

### Multi-Chain Mode

```bash
docker run -p 8080:8080 \
  -e SERVICE_MODE=multi \
  -e 'PORTAL_DATASET_MAP={"1":"ethereum-mainnet","8453":"base-mainnet"}' \
  sqd-portal-wrapper
```

### With Authentication

```bash
docker run -p 8080:8080 \
  -e SERVICE_MODE=single \
  -e PORTAL_DATASET=ethereum-mainnet \
  -e PORTAL_CHAIN_ID=1 \
  -e PORTAL_API_KEY=your-portal-key \
  -e WRAPPER_API_KEY=your-wrapper-key \
  sqd-portal-wrapper
```

## Docker Compose

The repository includes a `docker-compose.yml` for quick setup:

```bash
docker compose up --build
```

### Example docker-compose.yml

```yaml
version: '3.8'

services:
  wrapper:
    build: .
    ports:
      - "8080:8080"
    environment:
      SERVICE_MODE: multi
      PORTAL_DATASET_MAP: '{"1":"ethereum-mainnet","8453":"base-mainnet","42161":"arbitrum-one"}'
      PORTAL_API_KEY: ${PORTAL_API_KEY:-}
      WRAPPER_API_KEY: ${WRAPPER_API_KEY:-}
      MAX_CONCURRENT_REQUESTS: 128
      HTTP_TIMEOUT: 60000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped
```

## Kubernetes

### Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sqd-portal-wrapper
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sqd-portal-wrapper
  template:
    metadata:
      labels:
        app: sqd-portal-wrapper
    spec:
      containers:
        - name: wrapper
          image: sqd-portal-wrapper:latest
          ports:
            - containerPort: 8080
          env:
            - name: SERVICE_MODE
              value: "multi"
            - name: PORTAL_API_KEY
              valueFrom:
                secretKeyRef:
                  name: portal-secrets
                  key: api-key
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: sqd-portal-wrapper
spec:
  selector:
    app: sqd-portal-wrapper
  ports:
    - port: 8080
      targetPort: 8080
```

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | Liveness - always returns 200 if process is running |
| `GET /readyz` | Readiness - checks Portal connectivity for configured datasets |

## Prometheus Scraping

Add to your Prometheus config:

```yaml
scrape_configs:
  - job_name: 'sqd-portal-wrapper'
    static_configs:
      - targets: ['sqd-portal-wrapper:8080']
    metrics_path: /metrics
```
