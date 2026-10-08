import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { isCatalogModelId } from './ai-catalog'

/** Transient connection explanations only. Never add these to portable AiReason. */
export type AiConnectionReason =
  | 'local-login-not-implemented'
  | 'local-execution-not-implemented'
  | 'conversation-adapter-not-ready'
  | 'proofreading-adapter-not-ready'
  | 'packaged-development-refused'
  | 'unsupported-app-identity'
  | 'commercial-requirements-pending'
  | 'resume-required'
  | 'reconnect-required'
  | 'secure-session-unavailable'
  | 'login-timeout'
  | 'callback-port-in-use'
  | 'browser-unavailable'
  | 'login-denied'
  | 'local-config-conflict'
  | 'local-runtime-exited'
  | 'local-cleanup-required'
  | 'local-protection-required'
  | 'local-account-changed'
  | 'login-offline'
  | 'login-completed-before-cancel'
  | 'local-stop-pending'
  | 'model-catalog-unavailable'
  | 'model-catalog-timeout'
  | 'local-tool-isolation-unavailable'
  | 'local-content-logging-unavailable'
  | 'connect-required'
  | 'account-work-pending'
  | 'model-refresh-required'
  | 'model-selection-required'
  | 'no-text-models'
  | 'ai-work-pending'
  | 'output-protection-required'
  | 'operation-capacity-full'
  | 'local-workspace-identity-unavailable'
  | 'plan-authorization-required'
  | 'request-contract-unavailable'
const connectionReasons: readonly AiConnectionReason[] = [
  'local-login-not-implemented',
  'local-execution-not-implemented',
  'conversation-adapter-not-ready',
  'proofreading-adapter-not-ready',
  'packaged-development-refused',
  'unsupported-app-identity',
  'commercial-requirements-pending',
  'resume-required',
  'reconnect-required',
  'secure-session-unavailable',
  'login-timeout',
  'callback-port-in-use',
  'browser-unavailable',
  'login-denied',
  'local-config-conflict',
  'local-runtime-exited',
  'local-cleanup-required',
  'local-protection-required',
  'local-account-changed',
  'login-offline',
  'login-completed-before-cancel',
  'local-stop-pending',
  'model-catalog-unavailable',
  'model-catalog-timeout',
  'local-tool-isolation-unavailable',
  'local-content-logging-unavailable',
  'connect-required',
  'account-work-pending',
  'model-refresh-required',
  'model-selection-required',
  'no-text-models',
  'ai-work-pending',
  'output-protection-required',
  'operation-capacity-full',
  'local-workspace-identity-unavailable',
  'plan-authorization-required',
  'request-contract-unavailable'
]
export type AiRoute =
  | {
      kind: 'local-chatgpt-plan'
      policyRevision: 1
      scope: 'owner-unpackaged-development'
      providerClassification: 'unresolved'
    }
  | {
      kind: 'local-codex-chatgpt'
      policyRevision: 1
      scope: 'owner-unpackaged-development'
      providerClassification: 'unresolved'
    }
  | { kind: 'registered-openai'; policyRevision: 1 }
  | { kind: 'unavailable'; reason: 'packaged-development-refused' | 'unsupported-app-identity' }
export type AiSession =
  | { state: 'unavailable'; reason: AiConnectionReason }
  | { state: 'signed-out' }
  | { state: 'saved-needs-resume'; connectionId: string }
  | { state: 'signing-in'; attemptId: string }
  | { state: 'signed-in'; connectionId: string }
  | { state: 'reconnect-required'; connectionId: string }
  | { state: 'refreshing'; connectionId: string }
  | { state: 'resuming'; connectionId: string }
  | { state: 'disconnecting'; connectionId: string }
export type AiFunding =
  | {
      kind: 'normal-subscription'
      credits: 'account-settings'
      apiKeyFallback: false
      appBillingChanges: false
    }
  | {
      kind: 'included-only'
      enforcement: 'unresolved'
      apiKeyFallback: false
      appBillingChanges: false
    }
  | { kind: 'unavailable'; apiKeyFallback: false; appBillingChanges: false }
/** Main's current decision, not an execution grant or proof of provider access. */
export type AiActionAvailability =
  | { state: 'unavailable'; reason: AiConnectionReason }
  | { state: 'available'; connectionId: string; model: string }
export type AiFeatureAvailability = {
  conversation: AiActionAvailability
  proofread: AiActionAvailability
}

export function isAiConnectionReason(value: unknown): value is AiConnectionReason {
  return typeof value === 'string' && connectionReasons.includes(value as AiConnectionReason)
}
export function isAiRoute(value: unknown): value is AiRoute {
  if (!record(value)) return false
  if (value.kind === 'local-codex-chatgpt' || value.kind === 'local-chatgpt-plan')
    return (
      exact(value, ['kind', 'policyRevision', 'scope', 'providerClassification']) &&
      value.policyRevision === 1 &&
      value.scope === 'owner-unpackaged-development' &&
      value.providerClassification === 'unresolved'
    )
  if (value.kind === 'registered-openai')
    return exact(value, ['kind', 'policyRevision']) && value.policyRevision === 1
  return (
    value.kind === 'unavailable' &&
    exact(value, ['kind', 'reason']) &&
    (value.reason === 'packaged-development-refused' || value.reason === 'unsupported-app-identity')
  )
}
export function isAiSession(value: unknown): value is AiSession {
  if (!record(value)) return false
  if (value.state === 'unavailable')
    return exact(value, ['state', 'reason']) && isAiConnectionReason(value.reason)
  if (value.state === 'signed-out') return exact(value, ['state'])
  if (value.state === 'signing-in')
    return exact(value, ['state', 'attemptId']) && isId(value.attemptId)
  return (
    [
      'saved-needs-resume',
      'signed-in',
      'reconnect-required',
      'refreshing',
      'resuming',
      'disconnecting'
    ].includes(String(value.state)) &&
    exact(value, ['state', 'connectionId']) &&
    isId(value.connectionId)
  )
}
export function isAiFunding(value: unknown): value is AiFunding {
  if (!record(value) || value.apiKeyFallback !== false || value.appBillingChanges !== false)
    return false
  if (value.kind === 'normal-subscription')
    return (
      exact(value, ['kind', 'credits', 'apiKeyFallback', 'appBillingChanges']) &&
      value.credits === 'account-settings'
    )
  if (value.kind === 'included-only')
    return (
      exact(value, ['kind', 'enforcement', 'apiKeyFallback', 'appBillingChanges']) &&
      value.enforcement === 'unresolved'
    )
  return (
    value.kind === 'unavailable' && exact(value, ['kind', 'apiKeyFallback', 'appBillingChanges'])
  )
}
export function isAiFeatureAvailability(value: unknown): value is AiFeatureAvailability {
  return (
    record(value) &&
    exact(value, ['conversation', 'proofread']) &&
    Object.values(value).every(isAiActionAvailability)
  )
}
export function isAiActionAvailability(action: unknown): action is AiActionAvailability {
  return (
    record(action) &&
    ((exact(action, ['state', 'reason']) &&
      action.state === 'unavailable' &&
      isAiConnectionReason(action.reason)) ||
      (exact(action, ['state', 'connectionId', 'model']) &&
        action.state === 'available' &&
        isId(action.connectionId) &&
        isCatalogModelId(action.model)))
  )
}
