import { invalidRequest, RpcError } from './errors';

export type JsonRpcId = string | number | null;
export type JsonRpcParams = unknown[] | Record<string, unknown> | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: JsonRpcParams;
  id?: JsonRpcId;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown; error?: never }
  | { jsonrpc: '2.0'; id: JsonRpcId; error: { code: number; message: string; data?: Record<string, unknown> }; result?: never };

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
      throw invalidRequest('invalid request');
    }
    return payload.map((item) => {
      if (!isJsonRpcRequest(item)) {
        throw invalidRequest('invalid request');
      }
      return item;
    });
  }
  if (!isJsonRpcRequest(payload)) {
    throw invalidRequest('invalid request');
  }
  return [payload];
}

export function successResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function errorResponse(id: JsonRpcId, error: RpcError): JsonRpcResponse {
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

export function responseId(req: JsonRpcRequest): JsonRpcId {
  if (typeof req.id === 'undefined') {
    return null;
  }
  return req.id;
}
