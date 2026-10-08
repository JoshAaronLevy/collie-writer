import type { AiStatus } from '../../shared/ai'
import type { DirectIssue } from '../../shared/ai-direct'
import {
  connectionHealth,
  type AiConnectionHealth,
  type AiConnectionHealthReason
} from '../../shared/ai-connection-health'

type Evidence = 'authorization' | 'catalog' | 'response'

/** Bounded by the eight saved accounts and the finite reason vocabulary.
 * Unlike the latest diagnostic, these selected-account facts survive opening
 * another account action or refreshing models. They are session-local only. */
export class DirectConnectionIssues {
  private accounts = new Map<string, Map<AiConnectionHealthReason, Evidence>>()
  private contractIssues = new Map<string, DirectIssue>()

  record(id: string, issue: DirectIssue): void {
    if (issue.reason === 'cancelled' || issue.kind === 'incomplete') return
    const inference = issue.stage === 'inference-http' || issue.stage === 'inference-stream'
    let reason: AiConnectionHealthReason
    let evidence: Evidence = inference ? 'response' : 'catalog'
    if (issue.code === 'invalid_client') {
      reason = 'registration-invalid'
      evidence = 'authorization'
    } else if (issue.code === 'subscription_sharing_route_not_supported') {
      reason = 'route-unavailable'
      evidence = 'response'
    } else if (issue.reason === 'session-expired' || issue.reason === 'consent-required') {
      reason = issue.reason === 'session-expired' ? 'reconnect-required' : 'permission-required'
      evidence = 'authorization'
    } else if (issue.reason === 'quota-exhausted') {
      reason = 'usage-limited'
      evidence = 'response'
    } else if (
      issue.code === 'subscription_sharing_user_not_eligible' ||
      issue.code === 'subscription_sharing_invalid_user' ||
      issue.code === 'chatpass_v2_scope_not_authorized' ||
      issue.code === 'chatpass_v2_invalid_authorization_context' ||
      issue.httpStatus === 401
    ) {
      reason = 'account-unavailable'
      evidence = 'response'
    } else if (
      issue.code === 'subscription_sharing_usage_unavailable' ||
      issue.code === 'subscription_sharing_user_unavailable'
    ) {
      reason = 'provider-unavailable'
      evidence = 'response'
    } else if (
      issue.code === 'subscription_sharing_unsupported_capability' &&
      issue.reason !== 'model-unavailable'
    ) {
      reason = 'setup-required'
      evidence = 'response'
    } else if (issue.reason === 'offline') {
      // An interrupted response stream says nothing about current account health.
      if (issue.stage === 'inference-stream') return
      reason = 'offline'
    } else if (issue.reason === 'model-unavailable') {
      reason = 'model-unavailable'
    } else if (issue.stage === 'model-discovery') reason = 'catalog-failed'
    else if (issue.stage === 'renewal') {
      reason = 'provider-unavailable'
      evidence = 'authorization'
    } else if (inference && issue.httpStatus === 403) {
      reason = 'account-unavailable'
      evidence = 'response'
    } else return // Request validation, output, cancellation and browser errors stay with their action.
    if (reason === 'route-unavailable' || reason === 'setup-required')
      this.contractIssues.set(id, { ...issue })
    const issues = this.accounts.get(id) ?? new Map<AiConnectionHealthReason, Evidence>()
    // A metadata failure cannot weaken evidence needed to clear an admission refusal.
    if (issues.get(reason) !== 'response') issues.set(reason, evidence)
    this.accounts.set(id, issues)
  }

  confirm(id: string, evidence: Evidence): void {
    if (evidence === 'response') this.contractIssues.delete(id)
    const issues = this.accounts.get(id)
    if (!issues) return
    for (const [reason, required] of issues) {
      if (
        required === evidence ||
        (evidence === 'response' && required === 'catalog') ||
        ((evidence === 'catalog' || evidence === 'response') &&
          (reason === 'reconnect-required' || reason === 'permission-required'))
      )
        issues.delete(reason)
    }
    if (!issues.size) this.accounts.delete(id)
  }

  replaceModel(id: string): void {
    // An explicit different model resolves only the model-specific refusal.
    // Account admission, authorization and usage evidence must remain intact.
    this.accounts.get(id)?.delete('model-unavailable')
  }

  blocksRequestContract(id: string): boolean {
    return this.contractIssues.has(id)
  }

  requestContractIssue(id: string | null): DirectIssue | null {
    return id ? (this.contractIssues.get(id) ?? null) : null
  }

  reason(id: string | null): AiConnectionHealthReason | null {
    const issues = id ? this.accounts.get(id) : undefined
    if (!issues) return null
    const priority: AiConnectionHealthReason[] = [
      'registration-invalid',
      'route-unavailable',
      'setup-required',
      'reconnect-required',
      'permission-required',
      'account-unavailable',
      'usage-limited',
      'provider-unavailable',
      'offline',
      'model-unavailable',
      'catalog-failed'
    ]
    return priority.find((reason) => issues.has(reason)) ?? null
  }
}

/** Deliberately excludes features, work, capacity and project access. */
export function deriveConnectionHealth(
  status: Omit<AiStatus, 'connectionHealth' | 'capabilities'>,
  storage: 'starting' | 'ready' | 'failed',
  secure: boolean,
  directIssue: AiConnectionHealthReason | null
): AiConnectionHealth {
  const health = connectionHealth
  if (!secure || storage === 'failed') return health('credential-storage-unavailable')
  if (status.direct?.protectionPending || status.local?.protectionPending)
    return health('credential-protection-required')
  if (!status.channelPermitted || !status.configured || status.route.kind === 'unavailable')
    return health('route-unavailable')
  if (storage === 'starting') return health('checking')
  if (status.route.kind !== 'local-chatgpt-plan' && status.runtime !== 'development-installed')
    return health('runtime-unavailable')
  if (status.state === 'signing-in') return health('signing-in')
  if (status.state === 'disconnecting') return health('disconnecting')
  // Every direct Send checks renewal, even with a still-valid token. A no-op
  // check does not change connection health. A pending rotation is not verified.
  if (
    (status.state === 'refreshing' && status.direct?.authentication !== 'verified') ||
    status.session.state === 'resuming'
  )
    return health('renewing')

  const account = status.connections.find((item) => item.id === status.activeConnectionId)
  if (directIssue === 'registration-invalid' || directIssue === 'route-unavailable')
    return health(directIssue)
  if (status.session.state === 'saved-needs-resume') return health('resume-required')
  if (!account || (account.state === 'signed-out' && status.session.state !== 'reconnect-required'))
    return health('signed-out')
  if (status.direct?.preferences === 'pending') return health('model-preference-pending')
  if (status.direct?.preferences === 'unreadable') return health('model-preference-unreadable')
  if (account.state === 'expired' || status.session.state === 'reconnect-required')
    return health('reconnect-required')
  if (status.route.kind === 'local-chatgpt-plan') {
    if (status.direct?.authentication !== 'verified') return health('reconnect-required')
    if (!status.direct.planAuthorized) return health('permission-required')
    if (directIssue) return health(directIssue)
  } else {
    // Historical routes retain their funding, runtime and isolation restrictions.
    if (status.route.kind === 'registered-openai' || status.execution?.state !== 'available')
      return health('setup-required')
    if (status.local?.issue === 'local-config-conflict') return health('setup-required')
  }
  if (status.direct?.preparation !== undefined && status.direct.preparation !== 'idle')
    return health('preparing')
  if (!status.catalog || status.catalog.state === 'not-loaded') return health('models-required')
  if (status.catalog.state === 'loading') return health('checking')
  if (status.catalog.state === 'failed') return health('catalog-failed')
  if (!status.catalog.models.length) return health('no-models')
  const selectedModelId = status.catalog.selectedModelId
  if (!status.catalog.models.some((model) => model.id === selectedModelId))
    return health('model-required')
  return health('ready')
}
