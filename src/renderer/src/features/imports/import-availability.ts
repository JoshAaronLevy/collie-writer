import type { AiReason, AiStatus } from '../../../../shared/ai'
import { connectionHealthDescription, connectionReason } from '../ai-connections/connection-copy'

type Availability = {
  ready: boolean
  message: string | null
  action: 'manage' | 'check' | null
}

/** Presentation only. Main rechecks the account/model and work admission at dispatch.
 * Direct ChatGPT deliberately has no legacy local-runtime execution status. */
export function importAvailability({
  status,
  statusUnavailable,
  issue,
  busy
}: {
  status: AiStatus | null
  statusUnavailable: boolean
  issue: AiReason | null
  busy: boolean
}): Availability {
  const blocked = (message: string, action: Availability['action'] = 'manage'): Availability => ({
    ready: false,
    message,
    action
  })
  if (statusUnavailable || issue === 'outcome-unknown')
    return blocked('ChatGPT status could not be confirmed. Check status to try again.', 'check')
  if (!status) return blocked('Checking ChatGPT…', null)
  const health = status.connectionHealth,
    feature = status.features.conversation,
    catalog = status.catalog
  if (busy || health.state === 'progress')
    return blocked(
      health.state === 'progress'
        ? connectionHealthDescription[health.reason]
        : 'Updating your ChatGPT connection…',
      null
    )
  if (feature.state === 'unavailable') {
    if (health.state !== 'ready') {
      if (
        (health.reason === 'model-required' || health.reason === 'model-unavailable') &&
        catalog?.state === 'loaded'
      )
        return blocked('Choose an available model above to continue.', null)
      return blocked(connectionHealthDescription[health.reason])
    }
    switch (feature.reason) {
      case 'ai-work-pending':
        return blocked(
          'Another AI request is still finishing. Wait, or close Import and stop it in the AI work notice.',
          null
        )
      case 'account-work-pending':
        return blocked(
          'An account or model update is still finishing. Wait for it to finish.',
          null
        )
      case 'output-protection-required':
        return blocked(
          'An AI result needs to be saved. Close Import and finish recovery in the AI work notice.',
          null
        )
      case 'operation-capacity-full':
        return blocked(
          'Saved AI work needs attention. Close Import and open Local AI capacity and recovery in the AI work notice.',
          null
        )
      default:
        return blocked(connectionReason[feature.reason])
    }
  }
  if (status.route.kind !== 'local-chatgpt-plan')
    return blocked(
      'Import is unavailable with this connection. Open Manage ChatGPT to review the connection details.'
    )
  if (
    catalog?.state !== 'loaded' ||
    feature.connectionId !== status.activeConnectionId ||
    feature.model !== catalog.selectedModelId ||
    !catalog.models.some((model) => model.id === feature.model)
  )
    return blocked('Your account or model changed. Check status before submitting.', 'check')
  // A previous usage/service refusal can remain visible while main allows an
  // explicit new request. It is not a reason to invent another local blocker.
  const warning = health.state === 'attention' || health.state === 'error'
  return {
    ready: true,
    message: warning ? connectionHealthDescription[health.reason] : null,
    action: warning ? 'manage' : null
  }
}
