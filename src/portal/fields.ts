import { PortalRequest } from './types';

const NEGOTIABLE_FIELDS = new Set(['authorizationList']);

export function extractUnknownField(text: string): string | undefined {
  const match = /unknown field `([^`]+)`/i.exec(text);
  return match?.[1];
}

export function isNegotiableField(field: string): boolean {
  return NEGOTIABLE_FIELDS.has(field);
}

export function applyUnsupportedFields(request: PortalRequest, unsupported: Set<string>): PortalRequest {
  if (!request.fields || unsupported.size === 0) {
    return request;
  }
  const { fields } = request;
  const block = filterFieldMap(fields.block, unsupported);
  const transaction = filterFieldMap(fields.transaction, unsupported);
  const log = filterFieldMap(fields.log, unsupported);
  const trace = filterFieldMap(fields.trace, unsupported);
  const stateDiff = filterFieldMap(fields.stateDiff, unsupported);

  const nextFields = compactFields({ block, transaction, log, trace, stateDiff });
  if (
    nextFields.block === fields.block &&
    nextFields.transaction === fields.transaction &&
    nextFields.log === fields.log &&
    nextFields.trace === fields.trace &&
    nextFields.stateDiff === fields.stateDiff
  ) {
    return request;
  }
  return { ...request, fields: Object.keys(nextFields).length > 0 ? nextFields : undefined };
}

function filterFieldMap(
  map: Record<string, boolean> | undefined,
  unsupported: Set<string>
): Record<string, boolean> | undefined {
  if (!map) {
    return undefined;
  }
  let changed = false;
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(map)) {
    if (unsupported.has(key)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  if (!changed) {
    return map;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function compactFields(fields: {
  block?: Record<string, boolean>;
  transaction?: Record<string, boolean>;
  log?: Record<string, boolean>;
  trace?: Record<string, boolean>;
  stateDiff?: Record<string, boolean>;
}) {
  const compacted: typeof fields = {};
  if (fields.block && Object.keys(fields.block).length > 0) compacted.block = fields.block;
  if (fields.transaction && Object.keys(fields.transaction).length > 0) compacted.transaction = fields.transaction;
  if (fields.log && Object.keys(fields.log).length > 0) compacted.log = fields.log;
  if (fields.trace && Object.keys(fields.trace).length > 0) compacted.trace = fields.trace;
  if (fields.stateDiff && Object.keys(fields.stateDiff).length > 0) compacted.stateDiff = fields.stateDiff;
  return compacted;
}
