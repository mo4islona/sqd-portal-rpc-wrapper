export type ErrorCategory =
  | 'invalid_params'
  | 'unsupported_method'
  | 'unauthorized'
  | 'rate_limit'
  | 'conflict'
  | 'unavailable'
  | 'not_found'
  | 'overload'
  | 'server_error';

export class RpcError extends Error {
  readonly code: number;
  readonly httpStatus: number;
  readonly data?: Record<string, unknown>;
  readonly category: ErrorCategory;

  constructor(opts: {
    message: string;
    code: number;
    httpStatus: number;
    category: ErrorCategory;
    data?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.category = opts.category;
    this.data = opts.data;
  }
}

export function invalidParams(message: string): RpcError {
  return new RpcError({
    message,
    code: -32602,
    httpStatus: 400,
    category: 'invalid_params'
  });
}

export function methodNotSupported(message = 'method not supported'): RpcError {
  return new RpcError({
    message,
    code: -32601,
    httpStatus: 404,
    category: 'unsupported_method'
  });
}

export function pendingBlockError(): RpcError {
  return invalidParams('pending block not found');
}

export function blockHashFilterError(): RpcError {
  return invalidParams('blockHash filter not supported');
}

export function rangeTooLargeError(maxRange: number): RpcError {
  return new RpcError({
    message: `range too large; max block range ${maxRange}`,
    code: -32012,
    httpStatus: 400,
    category: 'invalid_params'
  });
}

export function tooManyAddressesError(): RpcError {
  return new RpcError({
    message: 'specify less number of address',
    code: -32012,
    httpStatus: 400,
    category: 'invalid_params'
  });
}

export function missingDataError(message = 'block not found'): RpcError {
  return new RpcError({
    message,
    code: -32014,
    httpStatus: 404,
    category: 'not_found'
  });
}

export function rateLimitError(message = 'Too Many Requests'): RpcError {
  return new RpcError({
    message,
    code: -32005,
    httpStatus: 429,
    category: 'rate_limit'
  });
}

export function unauthorizedError(): RpcError {
  return new RpcError({
    message: 'unauthorized',
    code: -32016,
    httpStatus: 401,
    category: 'unauthorized'
  });
}

export function conflictError(): RpcError {
  return new RpcError({
    message: 'conflict',
    code: -32603,
    httpStatus: 409,
    category: 'conflict',
    data: { retryable: true }
  });
}

export function unavailableError(message = 'unavailable'): RpcError {
  return new RpcError({
    message,
    code: -32603,
    httpStatus: 503,
    category: 'unavailable'
  });
}

export function overloadError(): RpcError {
  return unavailableError('unavailable');
}

export function serverError(message = 'server error'): RpcError {
  return new RpcError({
    message,
    code: -32603,
    httpStatus: 502,
    category: 'server_error'
  });
}

export function normalizeError(err: unknown): RpcError {
  if (err instanceof RpcError) {
    return err;
  }
  const message = err instanceof Error ? err.message : 'server error';
  return serverError(message);
}
