import { exact, record } from './projects'
import { isAiReason, type AiReason } from './ai'

/** Sanitized local status. Never tokens, provider messages, prompts or URLs. */
export const DIRECT_STAGES = [
  'registration',
  'browser-sign-in',
  'code-exchange',
  'identity-validation',
  'plan-authorization',
  'renewal',
  'model-discovery',
  'model-preference',
  'inference-http',
  'inference-stream',
  'credential-storage'
] as const
export type DirectStage = (typeof DIRECT_STAGES)[number]
export type DirectIssue = {
  stage: DirectStage
  reason: AiReason
  kind: 'refused' | 'invalid-response' | 'interrupted' | 'cancelled' | 'incomplete'
  httpStatus: number | null
  code: string | null
  parameter: string | null
  requestId: string | null
  bodyKind: 'oauth' | 'structured' | 'detail' | 'other' | null
}
export type AiDirectStatus = {
  stage: DirectStage | null
  authentication: 'signed-out' | 'verified' | 'reconnect-required'
  planAuthorized: boolean
  inference:
    | 'not-run'
    | 'sending'
    | 'streaming'
    | 'completed'
    | 'failed'
    | 'incomplete'
    | 'unknown'
    | 'cancelled'
  issue: DirectIssue | null
  preparation: 'idle' | 'waiting' | 'running'
  preferences: 'ready' | 'unreadable' | 'pending'
  protectionPending: boolean
}
const identifier = (v: unknown): boolean =>
  v === null || (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v))
export function isDirectIssue(v: unknown): v is DirectIssue {
  return (
    record(v) &&
    exact(v, [
      'stage',
      'reason',
      'kind',
      'httpStatus',
      'code',
      'parameter',
      'requestId',
      'bodyKind'
    ]) &&
    DIRECT_STAGES.includes(v.stage as DirectStage) &&
    isAiReason(v.reason) &&
    ['refused', 'invalid-response', 'interrupted', 'cancelled', 'incomplete'].includes(
      String(v.kind)
    ) &&
    (v.httpStatus === null ||
      (Number.isInteger(v.httpStatus) &&
        Number(v.httpStatus) >= 100 &&
        Number(v.httpStatus) <= 599)) &&
    [v.code, v.parameter, v.requestId].every(identifier) &&
    (v.bodyKind === null || ['oauth', 'structured', 'detail', 'other'].includes(String(v.bodyKind)))
  )
}
export function isAiDirectStatus(v: unknown): v is AiDirectStatus {
  return (
    record(v) &&
    exact(v, [
      'stage',
      'authentication',
      'planAuthorized',
      'inference',
      'issue',
      'preparation',
      'preferences',
      'protectionPending'
    ]) &&
    (v.stage === null || DIRECT_STAGES.includes(v.stage as DirectStage)) &&
    ['signed-out', 'verified', 'reconnect-required'].includes(String(v.authentication)) &&
    typeof v.planAuthorized === 'boolean' &&
    [
      'not-run',
      'sending',
      'streaming',
      'completed',
      'failed',
      'incomplete',
      'unknown',
      'cancelled'
    ].includes(String(v.inference)) &&
    (v.issue === null || isDirectIssue(v.issue)) &&
    ['idle', 'waiting', 'running'].includes(String(v.preparation)) &&
    ['ready', 'unreadable', 'pending'].includes(String(v.preferences)) &&
    typeof v.protectionPending === 'boolean'
  )
}
