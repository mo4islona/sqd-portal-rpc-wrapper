import { invalidParams, RpcError } from './errors';

export interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: unknown;
  id?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: Record<string, unknown> };
}

export type JsonRpcPayload = JsonRpcRequest | JsonRpcRequest[];

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const req = value as JsonRpcRequest;
  return req.jsonrpc === '2.0' && typeof req.method === 'string';
}

export function parseJsonRpcPayload(payload: unknown): JsonRpcRequest[] {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      throw invalidParams('invalid request');
    }
    return payload.map((item) => {
      if (!isJsonRpcRequest(item)) {
        throw invalidParams('invalid request');
      }
      return item;
    });
  }
  if (!isJsonRpcRequest(payload)) {
    throw invalidParams('invalid request');
  }
  return [payload];
}

export function successResponse(id: unknown, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function errorResponse(id: unknown, error: RpcError): JsonRpcResponse {
  const payload: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    error: {
      code: error.code,
      message: error.message
    }
  };
  if (error.data) {
    payload.error = {
      code: error.code,
      message: error.message,
      data: error.data
    };
  }
  return payload;
}

export function responseId(req: JsonRpcRequest): unknown {
  if (typeof req.id === 'undefined') {
    return null;
  }
  return req.id;
}
