import { record } from '../../shared/projects'
import type { AiReason } from '../../shared/ai'
import type { DirectIssue, DirectStage } from '../../shared/ai-direct'
import { AiError, aiReason } from './errors'

const terminal = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused'
])
export class DirectError extends AiError {
  constructor(
    readonly issue: DirectIssue,
    readonly importRefusal: import('../../shared/import-recovery').ImportRefusal | null = null
  ) {
    super(issue.reason)
  }
}
export function directIssue(
  stage: DirectStage,
  reason: AiReason,
  kind: DirectIssue['kind'] = 'refused'
): DirectIssue {
  return {
    stage,
    reason,
    kind,
    httpStatus: null,
    code: null,
    parameter: null,
    requestId: null,
    bodyKind: null,
    responseType: null
  }
}
export function directFailure(stage: DirectStage, error: unknown): DirectIssue {
  return error instanceof DirectError
    ? error.issue
    : directIssue(
        stage,
        aiReason(error),
        aiReason(error) === 'cancelled' ? 'cancelled' : 'interrupted'
      )
}
export function httpFailure(
  stage: DirectStage,
  status: number,
  value: unknown,
  requestId?: string,
  retryAfter?: string | null
): DirectError {
  const error = record(value) && record(value.error) ? value.error : null
  const supplied =
    error?.code ?? (record(value) && typeof value.error === 'string' ? value.error : null)
  // Codes/field names are bounded machine identifiers. Never return raw message
  // or detail strings (which may echo submitted text or credential material).
  const code =
    typeof supplied === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(supplied)
      ? supplied
      : null
  const parameter =
    typeof error?.param === 'string' && /^[a-z][a-z0-9_.[\]]{0,127}$/.test(error.param)
      ? error.param
      : null
  const reason: AiReason = unusableCredential(code)
    ? 'session-expired'
    : code === 'access_denied'
      ? 'consent-required'
      : code === 'invalid_client'
        ? 'configuration-required'
        : code === 'subscription_sharing_unsupported_capability'
          ? parameter === 'model'
            ? 'model-unavailable'
            : 'invalid-request'
          : code === 'subscription_sharing_usage_limit_exceeded'
            ? 'quota-exhausted'
            : status >= 500
              ? 'offline'
              : 'provider-failed'
  let retryNotBefore: number | null = null
  if (retryAfter && retryAfter.length <= 128) {
    const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : NaN
    const deadline = Number.isFinite(seconds)
      ? Date.now() + Math.ceil(seconds * 1000)
      : Date.parse(retryAfter)
    if (Number.isSafeInteger(deadline) && deadline > Date.now() && deadline <= 8640000000000000)
      retryNotBefore = deadline
  }
  const refusal: import('../../shared/import-recovery').ImportRefusal | null =
    ['inference-http', 'inference-stream'].includes(stage) &&
    [200, 429].includes(status) &&
    ['quota-exhausted', 'provider-failed'].includes(reason)
      ? code === 'subscription_sharing_usage_limit_exceeded'
        ? { version: 1, kind: 'usage-limit', code, httpStatus: status, retryNotBefore: null }
        : status === 429 || code === 'rate_limit_exceeded' || code === 'slow_down'
          ? { version: 1, kind: 'temporary-rate-limit', code, httpStatus: status, retryNotBefore }
          : null
      : null
  return new DirectError(
    {
      ...directIssue(stage, reason),
      httpStatus: status,
      code,
      parameter,
      requestId: requestId && /^[A-Za-z0-9_.:-]{1,128}$/.test(requestId) ? requestId : null,
      bodyKind: error
        ? 'structured'
        : record(value) && typeof value.error === 'string'
          ? 'oauth'
          : record(value) && typeof value.detail === 'string'
            ? 'detail'
            : 'other'
    },
    refusal
  )
}
export function terminalRefresh(error: unknown): boolean {
  return error instanceof DirectError && terminal.has(error.issue.code ?? '')
}
export function unusableCredential(code: string | null): boolean {
  return code === 'invalid_token' || terminal.has(code ?? '')
}
