import { Counter, Histogram, collectDefaultMetrics, Registry } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const metrics = {
  requests_total: new Counter({
    name: 'requests_total',
    help: 'Total JSON-RPC requests',
    labelNames: ['method', 'chainId', 'status'] as const,
    registers: [registry]
  }),
  portal_requests_total: new Counter({
    name: 'portal_requests_total',
    help: 'Total portal requests',
    labelNames: ['endpoint', 'status'] as const,
    registers: [registry]
  }),
  portal_latency_seconds: new Histogram({
    name: 'portal_latency_seconds',
    help: 'Portal request latency in seconds',
    labelNames: ['endpoint'] as const,
    registers: [registry],
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
  }),
  ndjson_lines_total: new Counter({
    name: 'ndjson_lines_total',
    help: 'Total NDJSON lines parsed',
    registers: [registry]
  }),
  response_bytes_total: new Counter({
    name: 'response_bytes_total',
    help: 'Total bytes in JSON-RPC responses',
    labelNames: ['method', 'chainId'] as const,
    registers: [registry]
  }),
  errors_total: new Counter({
    name: 'errors_total',
    help: 'Total errors by category',
    labelNames: ['category'] as const,
    registers: [registry]
  }),
  finalized_fallback_total: new Counter({
    name: 'finalized_fallback_total',
    help: 'Total finalized endpoint fallbacks',
    registers: [registry]
  })
};

export async function metricsPayload(): Promise<string> {
  return registry.metrics();
}
