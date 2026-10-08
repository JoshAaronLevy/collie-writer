import { exact, record } from './projects'
import { isAiReason, type AiReason } from './ai'
import { isId } from '../domain/editor/schema'
import { isCatalogModelId } from './ai-catalog'

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
  responseType: 'event-stream' | 'json' | 'html' | 'other' | 'missing' | null
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
  /** Last failed response for the selected account in this app session. Setup
   * actions may clear issue, but must not erase the response's diagnostic. */
  lastRequestFailure: {
    operationId: string
    model: string
    occurredAt: number
    issue: DirectIssue
  } | null
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
      'bodyKind',
      'responseType'
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
    [v.code, v.requestId].every(identifier) &&
    (v.parameter === null ||
      (typeof v.parameter === 'string' && /^[a-z][a-z0-9_.[\]]{0,127}$/.test(v.parameter))) &&
    (v.bodyKind === null ||
      ['oauth', 'structured', 'detail', 'other'].includes(String(v.bodyKind))) &&
    (v.responseType === null ||
      ['event-stream', 'json', 'html', 'other', 'missing'].includes(String(v.responseType)))
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
      'lastRequestFailure',
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
    (v.lastRequestFailure === null ||
      (record(v.lastRequestFailure) &&
        exact(v.lastRequestFailure, ['operationId', 'model', 'occurredAt', 'issue']) &&
        isId(v.lastRequestFailure.operationId) &&
        isCatalogModelId(v.lastRequestFailure.model) &&
        Number.isSafeInteger(v.lastRequestFailure.occurredAt) &&
        Number(v.lastRequestFailure.occurredAt) > 0 &&
        isDirectIssue(v.lastRequestFailure.issue))) &&
    ['idle', 'waiting', 'running'].includes(String(v.preparation)) &&
    ['ready', 'unreadable', 'pending'].includes(String(v.preferences)) &&
    typeof v.protectionPending === 'boolean'
  )
}
