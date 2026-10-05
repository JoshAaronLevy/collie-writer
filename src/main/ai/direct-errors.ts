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
  constructor(readonly issue: DirectIssue) {
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
    bodyKind: null
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
  requestId?: string
): DirectError {
  const error = record(value) && record(value.error) ? value.error : null
  const supplied =
    error?.code ?? (record(value) && typeof value.error === 'string' ? value.error : null)
  // Codes/field names are bounded machine identifiers. Never return raw message
  // or detail strings (which may echo submitted text or credential material).
  const code =
    typeof supplied === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(supplied) ? supplied : null
  const reason: AiReason =
    terminal.has(code ?? '') || status === 401
      ? 'session-expired'
      : code === 'access_denied' || code === 'chatpass_v2_scope_not_authorized'
        ? 'consent-required'
        : code === 'invalid_client'
          ? 'configuration-required'
          : status === 429 || code === 'subscription_sharing_usage_limit_exceeded'
            ? 'quota-exhausted'
            : status >= 500
              ? 'offline'
              : 'provider-failed'
  return new DirectError({
    ...directIssue(stage, reason),
    httpStatus: status,
    code,
    parameter:
      typeof error?.param === 'string' && /^[a-z][a-z0-9_.]{0,127}$/.test(error.param)
        ? error.param
        : null,
    requestId: requestId && /^[A-Za-z0-9_.:-]{1,128}$/.test(requestId) ? requestId : null,
    bodyKind: error
      ? 'structured'
      : record(value) && typeof value.error === 'string'
        ? 'oauth'
        : record(value) && typeof value.detail === 'string'
          ? 'detail'
          : 'other'
  })
}
export function terminalRefresh(error: unknown): boolean {
  return error instanceof DirectError && terminal.has(error.issue.code ?? '')
}
export function unusableCredential(code: string | null): boolean {
  return code === 'invalid_token' || terminal.has(code ?? '')
}
