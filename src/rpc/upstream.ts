import { performance } from 'node:perf_hooks'

import { Config } from '../config'
import { ErrorCategory, RpcError, serverError } from '../errors'
import { JsonRpcRequest } from '../jsonrpc'
import { metrics } from '../metrics'

export interface UpstreamRpcClientOptions {
  fetchImpl?: typeof fetch
  logger?: {
    info: (obj: Record<string, unknown>, msg: string) => void
    warn?: (obj: Record<string, unknown>, msg: string) => void
  }
}

export class UpstreamRpcClient {
  private readonly url?: string
  private readonly urlMap: Record<string, string>
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly logger?: UpstreamRpcClientOptions['logger']

  constructor(config: Config, options: UpstreamRpcClientOptions = {}) {
    this.url = config.upstreamRpcUrl
    this.urlMap = config.upstreamRpcUrlMap
    this.timeoutMs = config.httpTimeoutMs
    this.fetchImpl = options.fetchImpl || fetch
    this.logger = options.logger
  }

  resolveUrl(chainId: number): string | undefined {
    return this.urlMap[String(chainId)] || this.url
  }

  async call(request: JsonRpcRequest, chainId: number): Promise<unknown> {
    const url = this.resolveUrl(chainId)
    if (!url) {
      throw serverError('upstream rpc not configured')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const start = performance.now()
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }

    const payload: Record<string, unknown> = {
      jsonrpc: '2.0',
      method: request.method,
      id: request.id ?? null,
    }
    if (request.params !== undefined) {
      payload.params = request.params
    }

    try {
      const resp = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const elapsed = (performance.now() - start) / 1000
      metrics.upstream_requests_total.labels(String(resp.status)).inc()
      metrics.upstream_latency_seconds.labels('upstream').observe(elapsed)
      const text = await resp.text()
      const parsed = text ? JSON.parse(text) : null
      const response = Array.isArray(parsed) ? parsed[0] : parsed
      if (!response || response.jsonrpc !== '2.0') {
        throw serverError('upstream rpc invalid response')
      }
      if (response.error) {
        const error = response.error as { code?: unknown; message?: unknown; data?: unknown }
        const code = typeof error.code === 'number' ? error.code : -32603
        const message = typeof error.message === 'string' ? error.message : 'server error'
        const data = error.data && typeof error.data === 'object' ? (error.data as Record<string, unknown>) : undefined
        this.logger?.warn?.({ endpoint: url, code, message }, 'upstream rpc error response')
        throw rpcErrorFromUpstream(code, message, data)
      }
      if (!('result' in response)) {
        throw serverError('upstream rpc invalid response')
      }
      const result = response.result
      clearTimeout(timeout)
      return result
    } catch (err) {
      clearTimeout(timeout)
      metrics.upstream_requests_total.labels('0').inc()
      if (err instanceof RpcError) {
        throw err
      }
      const message = err instanceof Error ? err.message : 'upstream rpc failed'
      this.logger?.warn?.({ endpoint: url, error: message }, 'upstream rpc error')
      throw serverError(message)
    }
  }
}

function rpcErrorFromUpstream(code: number, message: string, data?: Record<string, unknown>): RpcError {
  const category = categoryForCode(code)
  const httpStatus = httpStatusForCategory(category)
  if (category === 'rate_limit') {
    metrics.rate_limit_total.labels('upstream').inc()
  }
  return new RpcError({ message, code, httpStatus, category, data })
}

function categoryForCode(code: number): ErrorCategory {
  switch (code) {
    case -32700:
    case -32600:
      return 'invalid_request'
    case -32601:
      return 'unsupported_method'
    case -32602:
      return 'invalid_params'
    case -32016:
      return 'unauthorized'
    case -32005:
      return 'rate_limit'
    case -32014:
      return 'not_found'
    default:
      return 'server_error'
  }
}

function httpStatusForCategory(category: ErrorCategory): number {
  switch (category) {
    case 'invalid_request':
    case 'invalid_params':
      return 400
    case 'unsupported_method':
    case 'not_found':
      return 404
    case 'unauthorized':
      return 401
    case 'rate_limit':
      return 429
    default:
      return 502
  }
}
