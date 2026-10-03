import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'

/** Transient connection explanations only. Never add these to portable AiReason. */
export type AiConnectionReason = 'local-login-not-implemented' | 'local-execution-not-implemented' |
  'conversation-adapter-not-ready' | 'proofreading-adapter-not-ready' | 'packaged-development-refused' |
  'unsupported-app-identity' | 'commercial-requirements-pending' | 'resume-required' |
  'reconnect-required' | 'secure-session-unavailable'
const connectionReasons: readonly AiConnectionReason[] = [
  'local-login-not-implemented', 'local-execution-not-implemented', 'conversation-adapter-not-ready',
  'proofreading-adapter-not-ready', 'packaged-development-refused', 'unsupported-app-identity',
  'commercial-requirements-pending', 'resume-required', 'reconnect-required', 'secure-session-unavailable'
]
export type AiRoute =
  | { kind: 'local-codex-chatgpt'; policyRevision: 1; scope: 'owner-unpackaged-development'; providerClassification: 'unresolved' }
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
  | { state: 'disconnecting'; connectionId: string }
export type AiFunding =
  | { kind: 'normal-subscription'; credits: 'account-settings'; apiKeyFallback: false; appBillingChanges: false }
  | { kind: 'included-only'; enforcement: 'unresolved'; apiKeyFallback: false; appBillingChanges: false }
  | { kind: 'unavailable'; apiKeyFallback: false; appBillingChanges: false }
/** No ready variant until CD03 defines the actual model/policy execution grant.
 * Login, presence of a binary and a catalog cannot manufacture feature readiness. */
export type AiActionAvailability = { state: 'unavailable'; reason: AiConnectionReason }
export type AiFeatureAvailability = { conversation: AiActionAvailability; proofread: AiActionAvailability }

export function isAiConnectionReason(value: unknown): value is AiConnectionReason {
  return typeof value === 'string' && connectionReasons.includes(value as AiConnectionReason)
}
export function isAiRoute(value: unknown): value is AiRoute {
  if (!record(value)) return false
  if (value.kind === 'local-codex-chatgpt') return exact(value, ['kind', 'policyRevision', 'scope', 'providerClassification']) &&
    value.policyRevision === 1 && value.scope === 'owner-unpackaged-development' && value.providerClassification === 'unresolved'
  if (value.kind === 'registered-openai') return exact(value, ['kind', 'policyRevision']) && value.policyRevision === 1
  return value.kind === 'unavailable' && exact(value, ['kind', 'reason']) &&
    (value.reason === 'packaged-development-refused' || value.reason === 'unsupported-app-identity')
}
export function isAiSession(value: unknown): value is AiSession {
  if (!record(value)) return false
  if (value.state === 'unavailable') return exact(value, ['state', 'reason']) && isAiConnectionReason(value.reason)
  if (value.state === 'signed-out') return exact(value, ['state'])
  if (value.state === 'signing-in') return exact(value, ['state', 'attemptId']) && isId(value.attemptId)
  return ['saved-needs-resume', 'signed-in', 'reconnect-required', 'refreshing', 'disconnecting'].includes(String(value.state)) &&
    exact(value, ['state', 'connectionId']) && isId(value.connectionId)
}
export function isAiFunding(value: unknown): value is AiFunding {
  if (!record(value) || value.apiKeyFallback !== false || value.appBillingChanges !== false) return false
  if (value.kind === 'normal-subscription') return exact(value, ['kind', 'credits', 'apiKeyFallback', 'appBillingChanges']) && value.credits === 'account-settings'
  if (value.kind === 'included-only') return exact(value, ['kind', 'enforcement', 'apiKeyFallback', 'appBillingChanges']) && value.enforcement === 'unresolved'
  return value.kind === 'unavailable' && exact(value, ['kind', 'apiKeyFallback', 'appBillingChanges'])
}
export function isAiFeatureAvailability(value: unknown): value is AiFeatureAvailability {
  return record(value) && exact(value, ['conversation', 'proofread']) && Object.values(value).every(action =>
    record(action) && exact(action, ['state', 'reason']) && action.state === 'unavailable' && isAiConnectionReason(action.reason))
}
