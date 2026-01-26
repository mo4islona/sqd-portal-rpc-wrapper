# Observability

The SQD Portal RPC Wrapper provides comprehensive observability through Prometheus metrics and structured JSON logging.

## Metrics Endpoint

Prometheus metrics are exposed at `GET /metrics` in the standard text format.

```bash
curl http://localhost:8080/metrics
```

## Metrics Catalog

### Request Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `requests_total` | Counter | `method`, `chainId`, `status` | Total JSON-RPC requests |
| `rpc_duration_seconds` | Histogram | `method` | JSON-RPC handler duration |
| `rpc_timeouts_total` | Counter | `method` | JSON-RPC handler timeouts |
| `response_bytes_total` | Counter | `method`, `chainId` | Response payload bytes |

### Batch Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `batch_requests_total` | Counter | `count` | Batch requests by size bucket |
| `batch_items_total` | Counter | `status` | Batch items processed |

### Portal Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `portal_requests_total` | Counter | `endpoint`, `status` | Portal HTTP requests |
| `portal_latency_seconds` | Histogram | `endpoint` | Portal request latency |
| `portal_metadata_fetch_total` | Counter | `status` | Metadata endpoint fetches |
| `portal_conflict_total` | Counter | `chainId` | Portal 409 conflict responses |
| `portal_realtime_enabled` | Gauge | `chainId` | Realtime availability |
| `portal_unsupported_fields_total` | Counter | `field` | Unsupported field requests |

### NDJSON Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ndjson_lines_total` | Counter | — | NDJSON lines parsed |
| `ndjson_bytes_total` | Counter | — | NDJSON bytes parsed |

### Upstream Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `upstream_requests_total` | Counter | `status` | Upstream JSON-RPC requests |
| `upstream_latency_seconds` | Histogram | `endpoint` | Upstream request latency |

### Error Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `errors_total` | Counter | `category` | Errors by category |
| `rate_limit_total` | Counter | `source` | Rate limit errors by source |
| `finalized_fallback_total` | Counter | — | Finalized→non-finalized fallbacks |

## Grafana Dashboard

A pre-built Grafana dashboard is included for visualizing all metrics.

### Import Dashboard

1. Download the dashboard JSON: [`/grafana/sqd-portal-wrapper.json`](/grafana/sqd-portal-wrapper.json)
2. In Grafana, go to **Dashboards → Import**
3. Upload the JSON file or paste its contents
4. Select your Prometheus datasource
5. Click **Import**

### Dashboard Panels

The dashboard includes 10 panels organized in a grid:

| Panel | Description |
|-------|-------------|
| **RPC Requests/sec by method** | Request rate broken down by JSON-RPC method |
| **Errors/sec by category** | Error rate grouped by error category |
| **RPC p95 latency** | 95th percentile latency per method |
| **Portal p95 latency** | 95th percentile latency for Portal requests |
| **Upstream p95 latency** | 95th percentile latency for upstream RPC calls |
| **Batch requests/sec by size** | Batch request rate grouped by batch size |
| **NDJSON throughput** | Bytes/sec and lines/sec from Portal streams |
| **Rate limits/sec by source** | Rate limiting events by source |
| **RPC timeouts/sec** | Timeout events per method |
| **Portal unsupported fields/sec** | Requests for fields not supported by Portal |

### PromQL Examples

Query RPC request rate by method:
```promql
sum(rate(requests_total[5m])) by (method)
```

Query p95 latency for all methods:
```promql
histogram_quantile(0.95, sum(rate(rpc_duration_seconds_bucket[5m])) by (le, method))
```

Query error rate by category:
```promql
sum(rate(errors_total[5m])) by (category)
```

Query NDJSON throughput:
```promql
rate(ndjson_bytes_total[5m])
```

## Logging

The wrapper uses structured JSON logging via Pino. Log output includes:

- Request ID for tracing
- Method and chain ID
- Latency measurements
- Error details (with API keys redacted)

### Log Levels

Configure log level via the `LOG_LEVEL` environment variable:

| Level | Description |
|-------|-------------|
| `trace` | Most verbose, includes internal details |
| `debug` | Debug information for development |
| `info` | Standard operational logs (default) |
| `warn` | Warnings and potential issues |
| `error` | Errors only |
| `silent` | No logs |

### Example Log Output

```json
{
  "level": 30,
  "time": 1706000000000,
  "pid": 1,
  "hostname": "wrapper",
  "reqId": "abc123",
  "method": "eth_getBlockByNumber",
  "chainId": "1",
  "latency": 45.2,
  "msg": "request completed"
}
```

## Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Liveness probe - returns 200 if server is running |
| `GET /readyz` | Readiness probe - returns 200 if ready to serve traffic |

These endpoints are suitable for Kubernetes probes:

```yaml
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
  periodSeconds: 5
```

## Alerting Recommendations

Consider setting up alerts for:

- **High error rate**: `sum(rate(errors_total[5m])) > 0.1`
- **High latency**: `histogram_quantile(0.95, sum(rate(rpc_duration_seconds_bucket[5m])) by (le)) > 5`
- **Rate limiting**: `sum(rate(rate_limit_total[5m])) > 0`
- **Timeouts**: `sum(rate(rpc_timeouts_total[5m])) > 0`
- **Circuit breaker open**: Monitor `portal_requests_total{status="circuit_open"}`
