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

export interface ParsedJsonRpcItem {
  request?: JsonRpcRequest;
  error?: JsonRpcResponse;
}

export interface ParsedJsonRpcPayload {
  items: ParsedJsonRpcItem[];
  isBatch: boolean;
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const req = value as JsonRpcRequest;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return false;
  }
  if ('id' in req && !isValidId(req.id)) {
    return false;
  }
  if ('params' in req && !isValidParams(req.params)) {
    return false;
  }
  return true;
}

export function parseJsonRpcPayload(payload: unknown): ParsedJsonRpcPayload {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      throw invalidRequest('invalid request');
    }
    const items = payload.map((item) =>
      isJsonRpcRequest(item) ? { request: item } : { error: errorResponse(null, invalidRequest('invalid request')) }
    );
    return { items, isBatch: true };
  }
  if (!isJsonRpcRequest(payload)) {
    throw invalidRequest('invalid request');
  }
  return { items: [{ request: payload }], isBatch: false };
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

function isValidId(id: unknown): id is JsonRpcId {
  if (id === null) return true;
  if (typeof id === 'string') return true;
  if (typeof id === 'number') return Number.isFinite(id);
  return false;
}

function isValidParams(params: unknown): params is JsonRpcParams {
  if (params === null) return true;
  if (Array.isArray(params)) return true;
  if (typeof params === 'object') return true;
  return false;
}
