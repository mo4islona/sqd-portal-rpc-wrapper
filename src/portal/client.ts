import { performance } from 'node:perf_hooks'

import { HttpClient } from '@subsquid/http-client'
import { PortalClient as OfficialPortalClient, isForkException } from '@subsquid/portal-client'

import { Config } from '../config'
import {
  conflictError,
  invalidParams,
  missingDataError,
  normalizeError,
  portalUnsupportedFieldError,
  rateLimitError,
  serverError,
  unauthorizedError,
  unavailableError,
} from '../errors'
import { metrics } from '../metrics'
import { npmVersion } from '../version'
import { applyUnsupportedFields, extractUnknownField, isNegotiableField } from './fields'
import { FetchHttpClient, errorBodyText, httpStatusFromError } from './http'
import { PortalStreamHeaders, collectStream } from './stream'
import { PortalBlockResponse, PortalHeadResponse, PortalMetadataResponse, PortalRequest } from './types'

export type { PortalStreamHeaders } from './stream'

export interface PortalClientOptions {
  fetchImpl?: typeof fetch
  httpClient?: HttpClient
  logger?: {
    info: (obj: Record<string, unknown>, msg: string) => void
    debug: (obj: Record<string, unknown>, msg: string) => void
    warn?: (obj: Record<string, unknown>, msg: string) => void
  }
}

export class PortalClient {
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly apiKeyHeader: string
  private readonly timeoutMs: number
  private readonly metadataTtlMs: number
  private readonly maxStreamBytes: number
  private readonly httpClient: HttpClient
  private readonly logger?: PortalClientOptions['logger']
  private readonly metadataCache = new Map<string, { data: PortalMetadataResponse; fetchedAt: number }>()
  private readonly metadataRefreshInFlight = new Map<string, Promise<void>>()
  private readonly unsupportedFieldsByBaseUrl = new Map<string, Set<string>>()
  private readonly clientsByBaseUrl = new Map<string, OfficialPortalClient>()
  private readonly breakerThreshold: number
  private readonly breakerResetMs: number
  private breakerFailures = 0
  private breakerOpenUntil = 0
  private breakerHalfOpen = false

  constructor(
    private readonly config: Config,
    options: PortalClientOptions = {},
  ) {
    this.baseUrl = config.portalBaseUrl
    this.apiKey = config.portalApiKey
    this.apiKeyHeader = config.portalApiKeyHeader
    this.timeoutMs = config.httpTimeoutMs
    this.metadataTtlMs = config.portalMetadataTtlMs
    this.maxStreamBytes = config.maxNdjsonBytes
    this.logger = options.logger
    this.breakerThreshold = config.portalCircuitBreakerThreshold
    this.breakerResetMs = config.portalCircuitBreakerResetMs
    if (options.httpClient) {
      this.httpClient = options.httpClient
    } else if (options.fetchImpl) {
      this.httpClient = new FetchHttpClient(options.fetchImpl)
    } else {
      this.httpClient = new HttpClient({ httpTimeout: this.timeoutMs })
    }
  }

  async fetchHead(
    baseUrl: string,
    finalized: boolean,
    traceparent?: string,
    requestId?: string,
  ): Promise<{ head: PortalHeadResponse; finalizedAvailable: boolean }> {
    if (this.isBreakerOpen()) {
      this.logger?.warn?.({ endpoint: finalized ? 'finalized-head' : 'head' }, 'portal circuit open')
      throw unavailableError('portal circuit open')
    }
    const client = this.getPortalClient(baseUrl)
    const headers = this.requestHeaders(traceparent, requestId)
    const endpoint = finalized ? 'finalized-head' : 'head'
    const started = performance.now()

    try {
      const head = finalized ? await client.getFinalizedHead({ headers }) : await client.getHead({ headers })
      recordPortalMetrics(endpoint, 200, started)
      this.recordBreaker(200)
      if (!head) {
        throw missingDataError('block not found')
      }
      this.logger?.debug?.({ endpoint, status: 200 }, 'portal response')
      return { head, finalizedAvailable: finalized }
    } catch (err) {
      const status = httpStatusFromError(err)
      if (status) {
        recordPortalMetrics(endpoint, status, started)
        this.recordBreaker(status)
      } else {
        this.recordBreaker(0)
      }
      if (finalized && status === 404) {
        metrics.finalized_fallback_total.inc()
        this.logger?.warn?.({ endpoint, status }, 'finalized head not found, fallback to non-finalized')
        return this.fetchHead(baseUrl, false, traceparent, requestId)
      }
      this.logger?.warn?.(
        {
          endpoint,
          error: err instanceof Error ? err.message : String(err),
        },
        'portal error',
      )
      throw mapPortalError(err)
    }
  }

  async streamBlocks(
    baseUrl: string,
    finalized: boolean,
    request: PortalRequest,
    traceparent?: string,
    onHeaders?: (headers: PortalStreamHeaders) => void,
    requestId?: string,
  ): Promise<PortalBlockResponse[]> {
    if (this.isBreakerOpen()) {
      this.logger?.warn?.({ endpoint: finalized ? 'finalized-stream' : 'stream' }, 'portal circuit open')
      throw unavailableError('portal circuit open')
    }
    const client = this.getPortalClient(baseUrl)
    const headers = this.requestHeaders(traceparent, requestId)
    const unsupportedFields = this.getUnsupportedFields(baseUrl)
    let effectiveRequest = applyUnsupportedFields(request, unsupportedFields)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const endpoint = finalized ? 'finalized-stream' : 'stream'
      const started = performance.now()
      try {
        const blocks = await collectStream(client, effectiveRequest, headers, finalized, onHeaders)
        const status = blocks.length === 0 ? 204 : 200

        recordPortalMetrics(endpoint, status, started)
        this.recordBreaker(status)
        this.logger?.debug?.({ endpoint, status }, 'portal response')

        return blocks
      } catch (err) {
        const status = httpStatusFromError(err)
        if (status) {
          recordPortalMetrics(endpoint, status, started)
          this.recordBreaker(status)
        } else {
          this.recordBreaker(0)
        }
        if (finalized && status === 404) {
          metrics.finalized_fallback_total.inc()
          this.logger?.warn?.({ endpoint, status }, 'finalized stream not found, fallback to non-finalized')
          return this.streamBlocks(baseUrl, false, effectiveRequest, traceparent, onHeaders, requestId)
        }
        if (isForkException(err)) {
          throw conflictError(err.previousBlocks)
        }
        if (status === 400) {
          const unknownField = extractUnknownField(errorBodyText(err))
          if (unknownField) {
            metrics.portal_unsupported_fields_total.labels(unknownField).inc()
            if (!isNegotiableField(unknownField)) {
              throw portalUnsupportedFieldError(unknownField)
            }
            if (!unsupportedFields.has(unknownField)) {
              unsupportedFields.add(unknownField)
              this.unsupportedFieldsByBaseUrl.set(baseUrl, unsupportedFields)
            }
            const nextRequest = applyUnsupportedFields(request, unsupportedFields)
            if (nextRequest !== effectiveRequest) {
              effectiveRequest = nextRequest
              continue
            }
          }
        }
        this.logger?.warn?.(
          {
            endpoint,
            error: err instanceof Error ? err.message : String(err),
          },
          'portal error',
        )
        throw mapPortalError(err)
      }
    }

    throw serverError('portal field negotiation failed')
  }

  async getMetadata(baseUrl: string, traceparent?: string, requestId?: string): Promise<PortalMetadataResponse> {
    if (this.isBreakerOpen()) {
      this.logger?.warn?.({ endpoint: 'metadata' }, 'portal circuit open')
      throw unavailableError('portal circuit open')
    }
    const now = Date.now()
    const cached = this.metadataCache.get(baseUrl)
    if (cached) {
      const age = now - cached.fetchedAt
      if (age < this.metadataTtlMs) {
        return cached.data
      }
      this.refreshMetadata(baseUrl, traceparent, requestId)
      return cached.data
    }

    const data = await this.fetchMetadata(baseUrl, traceparent, requestId)
    this.metadataCache.set(baseUrl, { data, fetchedAt: now })
    return data
  }

  buildDatasetBaseUrl(dataset: string): string {
    const base = normalizePortalBaseUrl(this.baseUrl)
    if (base.includes('{dataset}')) {
      return normalizePortalBaseUrl(base.replace('{dataset}', dataset))
    }
    if (base.toLowerCase().endsWith(`/${dataset.toLowerCase()}`)) {
      return normalizePortalBaseUrl(base)
    }
    return normalizePortalBaseUrl(`${base}/${dataset}`)
  }

  private getPortalClient(baseUrl: string): OfficialPortalClient {
    const existing = this.clientsByBaseUrl.get(baseUrl)
    if (existing) {
      return existing
    }
    const client = new OfficialPortalClient({
      url: baseUrl,
      http: this.httpClient,
      maxBytes: this.maxStreamBytes,
    })
    this.clientsByBaseUrl.set(baseUrl, client)
    return client
  }

  private requestHeaders(traceparent?: string, requestId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': `@subsquid/evm-rpc-portal:${npmVersion}`,
      'Accept-Encoding': 'gzip, zstd',
    }
    if (this.apiKey) {
      headers[this.apiKeyHeader] = this.apiKey
    }
    if (traceparent) {
      headers.traceparent = traceparent
    }
    if (requestId) {
      headers['X-Request-Id'] = requestId
    }
    return headers
  }

  private async fetchMetadata(
    baseUrl: string,
    traceparent?: string,
    requestId?: string,
  ): Promise<PortalMetadataResponse> {
    const url = `${baseUrl}/metadata`
    const headers = this.requestHeaders(traceparent, requestId)
    const started = performance.now()
    try {
      const response = await this.httpClient.request<PortalMetadataResponse>('GET', url, {
        headers,
        httpTimeout: this.timeoutMs,
      })
      metrics.portal_metadata_fetch_total.labels(String(response.status)).inc()
      recordPortalMetrics('metadata', response.status, started)
      this.recordBreaker(response.status)
      this.logger?.info(
        { endpoint: 'metadata', dataset: response.body.dataset, realTime: response.body.real_time },
        'portal metadata',
      )
      return response.body
    } catch (err) {
      const status = httpStatusFromError(err)
      if (status) {
        metrics.portal_metadata_fetch_total.labels(String(status)).inc()
        recordPortalMetrics('metadata', status, started)
        this.recordBreaker(status)
      } else {
        this.recordBreaker(0)
      }
      this.logger?.warn?.(
        { endpoint: 'metadata', error: err instanceof Error ? err.message : String(err) },
        'portal error',
      )
      throw mapPortalError(err)
    }
  }

  private refreshMetadata(baseUrl: string, traceparent?: string, requestId?: string) {
    if (this.metadataRefreshInFlight.has(baseUrl)) {
      return
    }
    const refresh = this.fetchMetadata(baseUrl, traceparent, requestId)
      .then((data) => {
        this.metadataCache.set(baseUrl, { data, fetchedAt: Date.now() })
      })
      .catch((err) => {
        this.logger?.warn?.(
          { endpoint: 'metadata', error: err instanceof Error ? err.message : String(err) },
          'metadata refresh failed',
        )
      })
      .finally(() => {
        this.metadataRefreshInFlight.delete(baseUrl)
      })
    this.metadataRefreshInFlight.set(baseUrl, refresh)
  }

  private getUnsupportedFields(baseUrl: string): Set<string> {
    const existing = this.unsupportedFieldsByBaseUrl.get(baseUrl)
    if (existing) {
      return existing
    }
    const set = new Set<string>()
    this.unsupportedFieldsByBaseUrl.set(baseUrl, set)
    return set
  }

  private isBreakerOpen(): boolean {
    if (this.breakerThreshold <= 0) {
      return false
    }
    const now = Date.now()
    if (this.breakerOpenUntil === 0) {
      return false
    }
    if (now < this.breakerOpenUntil) {
      return true
    }
    this.breakerOpenUntil = 0
    this.breakerHalfOpen = true
    return false
  }

  private recordBreaker(status: number) {
    if (this.breakerThreshold <= 0) {
      return
    }
    if (this.breakerHalfOpen) {
      if (status >= 500 || status === 0) {
        this.breakerOpenUntil = Date.now() + this.breakerResetMs
        this.breakerFailures = 0
        this.breakerHalfOpen = false
        return
      }
      this.breakerFailures = 0
      this.breakerHalfOpen = false
      return
    }
    if (status >= 500 || status === 0) {
      this.breakerFailures += 1
      if (this.breakerFailures >= this.breakerThreshold) {
        this.breakerOpenUntil = Date.now() + this.breakerResetMs
        this.breakerFailures = 0
      }
      return
    }
    this.breakerFailures = 0
    this.breakerOpenUntil = 0
  }
}

function recordPortalMetrics(endpoint: string, status: number, startedAt: number) {
  const elapsed = (performance.now() - startedAt) / 1000
  metrics.portal_requests_total.labels(endpoint, String(status)).inc()
  metrics.portal_latency_seconds.labels(endpoint).observe(elapsed)
}

function mapPortalError(err: any) {
  const status = httpStatusFromError(err)
  if (status) {
    const bodyText = errorBodyText(err)
    switch (status) {
      case 400:
        return invalidParams(`invalid portal response: ${bodyText}`)
      case 401:
      case 403:
        return unauthorizedError()
      case 404:
        return missingDataError('block not found')
      case 409:
        return conflictError(extractPreviousBlocks(err.response.body))
      case 429:
        metrics.rate_limit_total.labels('portal').inc()
        return rateLimitError('Too Many Requests')
      case 503:
        return unavailableError('unavailable')
      default:
        return serverError('server error')
    }
  }

  return normalizeError(err)
}

export function normalizePortalBaseUrl(raw: string): string {
  let base = raw.trim()
  if (base.endsWith('/')) {
    base = base.slice(0, -1)
  }
  const suffixes = ['/stream', '/finalized-stream', '/head', '/finalized-head', '/metadata']
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length)
      break
    }
  }
  return base
}

function extractPreviousBlocks(payload: unknown): unknown[] | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const previousBlocks = (payload as { previousBlocks?: unknown }).previousBlocks
  if (Array.isArray(previousBlocks)) {
    return previousBlocks
  }
  return undefined
}
