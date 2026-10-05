import { exact, record } from './projects'

/** Presentation only. Never an inference, account-action, or editing grant. */
const healthStates = {
  ready: { state: 'ready', action: 'none' },
  preparing: { state: 'progress', action: 'none' },
  'model-preference-pending': { state: 'attention', action: 'protect-connection' },
  'model-preference-unreadable': { state: 'attention', action: 'protect-connection' },
  checking: { state: 'progress', action: 'none' },
  'status-unavailable': { state: 'attention', action: 'check-status' },
  'signed-out': { state: 'disconnected', action: 'connect' },
  'signing-in': { state: 'progress', action: 'none' },
  renewing: { state: 'progress', action: 'none' },
  disconnecting: { state: 'progress', action: 'none' },
  'reconnect-required': { state: 'attention', action: 'reconnect' },
  'permission-required': { state: 'attention', action: 'reconnect' },
  'resume-required': { state: 'attention', action: 'resume' },
  'models-required': { state: 'attention', action: 'refresh-models' },
  'model-required': { state: 'attention', action: 'choose-model' },
  'model-unavailable': { state: 'attention', action: 'choose-model' },
  'no-models': { state: 'attention', action: 'refresh-models' },
  'catalog-failed': { state: 'attention', action: 'refresh-models' },
  offline: { state: 'attention', action: 'review-details' },
  'usage-limited': { state: 'attention', action: 'review-details' },
  'provider-unavailable': { state: 'attention', action: 'review-details' },
  'account-unavailable': { state: 'attention', action: 'review-details' },
  'setup-required': { state: 'attention', action: 'review-details' },
  'registration-invalid': { state: 'error', action: 'review-details' },
  'credential-storage-unavailable': { state: 'error', action: 'review-details' },
  'credential-protection-required': { state: 'error', action: 'protect-connection' },
  'route-unavailable': { state: 'error', action: 'review-details' },
  'runtime-unavailable': { state: 'error', action: 'review-details' }
} as const

export type AiConnectionHealthReason = keyof typeof healthStates
export type AiConnectionHealth = {
  [Reason in AiConnectionHealthReason]: { reason: Reason } & (typeof healthStates)[Reason]
}[AiConnectionHealthReason]

export function connectionHealth(reason: AiConnectionHealthReason): AiConnectionHealth {
  return { reason, ...healthStates[reason] } as AiConnectionHealth
}

export function isAiConnectionHealth(value: unknown): value is AiConnectionHealth {
  if (
    !record(value) ||
    !exact(value, ['state', 'reason', 'action']) ||
    typeof value.reason !== 'string' ||
    !Object.hasOwn(healthStates, value.reason)
  )
    return false
  const expected = healthStates[value.reason as AiConnectionHealthReason]
  return value.state === expected.state && value.action === expected.action
}
