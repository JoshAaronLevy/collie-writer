import type { AiReason, AiStatus } from '../../../../shared/ai'

export const connectionReason: Record<AiReason, string> = {
  'configuration-required': 'Sign-in has not been configured for this build.',
  'development-access-unavailable': 'Supported development sign-in is not available in this build yet.',
  'commercial-activation-pending': 'Provider approval and configuration for this release are still pending.',
  'secure-storage-unavailable': 'Protected account storage is unavailable on this device. Writing remains available.',
  'storage-unavailable': 'Local account storage needs attention. Keep this window open and review Data & recovery.',
  'signed-out': 'Sign in with your own account when the connection becomes available.',
  'session-expired': 'This account needs to be reconnected before new AI work can start.',
  'consent-required': 'Account permission is missing. Reconnect and review the permissions in your browser.',
  'funding-unknown': 'Subscription-only usage cannot yet be guaranteed, so AI requests are disabled. There is no paid-credit or API-key fallback.',
  'runtime-unavailable': 'The AI runtime is unavailable in this build. Local writing and research still work.',
  'isolation-unresolved': 'The runtime’s access to tools and local files must be constrained before AI requests can be enabled.',
  'model-unavailable': 'The selected model is unavailable. No other model or account will be used automatically.',
  'read-only-project': 'Choose an editable project under Collie access before starting new AI work.',
  'busy': 'An account action or AI request is still finishing. Wait or cancel the active sign-in.',
  'invalid-request': 'This account action could not be accepted. Check connection status before trying again.',
  'cancelled': 'Sign-in was cancelled. Your project and any previously connected account remain available.',
  'auth-failed': 'Sign-in could not be completed. Check status, then try again when Connect is available.',
  'offline': 'The provider could not be reached. Continue writing locally and try again when you are online.',
  'quota-exhausted': 'The provider reported a usage limit. AI is paused; no credits, top-ups or alternate billing will be used.',
  'provider-failed': 'The provider could not complete this action. Check status before trying again.',
  'outcome-unknown': 'The action’s result could not be confirmed. Check status before starting another sign-in or account change.',
  'output-limit': 'The request exceeded the supported content limit. Narrow its scope before a new request.',
  'context-changed': 'The approved request no longer matches this action. Review the intended context again.'
}

export function connectionLabel(status: AiStatus | null, checking = false, action?: 'connect' | 'cancel' | 'refresh' | 'disconnect' | 'select'): string {
  if (action === 'cancel') return 'Cancelling sign-in…'
  if (action === 'select') return 'Selecting account…'
  if (action === 'connect' && status?.state !== 'signing-in') return 'Starting browser sign-in…'
  if (action === 'refresh') return 'Renewing account session…'
  if (action === 'disconnect') return 'Disconnecting account…'
  if (!status) return checking ? 'Checking connection…' : 'Connection status unavailable'
  if (status.state === 'signing-in') return 'Waiting for browser sign-in'
  if (status.state === 'refreshing') return 'Renewing account session…'
  if (status.state === 'disconnecting') return 'Disconnecting account…'
  const account = status.connections.find(item => item.id === status.activeConnectionId)
  if (account?.state === 'expired') return 'Account session expired'
  if (account?.state === 'signed-in') return 'Signed in · AI unavailable'
  return status.channelPermitted && status.configured ? 'Not connected' : 'Connection unavailable'
}

export function signInUnavailable(status: AiStatus): AiReason | null {
  return status.reasons.find(reason => [
    'development-access-unavailable', 'commercial-activation-pending', 'configuration-required',
    'secure-storage-unavailable', 'storage-unavailable'
  ].includes(reason)) ?? null
}

export const connectionProblemReasons: AiReason[] = ['auth-failed', 'offline', 'cancelled', 'consent-required', 'session-expired', 'quota-exhausted', 'outcome-unknown', 'provider-failed']
