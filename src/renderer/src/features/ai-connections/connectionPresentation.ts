import type { AiReason, AiStatus } from '../../../../shared/ai'
import { connectionHealth } from '../../../../shared/ai-connection-health'
import { connectionHealthDescription, connectionLabel, connectionReason } from './connection-copy'

export type ConnectionDialogAction =
  | 'connect'
  | 'retry'
  | 'resume'
  | 'protect'
  | 'check'
  | 'model'
  | 'account'
  | 'details'
  | 'done'
  | 'none'

/** Presentation only: service action availability still authorizes every action. */
export function connectionPresentation(
  status: AiStatus | null,
  unavailable: boolean,
  issue: AiReason | null,
  busy = false
): { title: string; description: string; action: ConnectionDialogAction } {
  const health = unavailable ? connectionHealth('status-unavailable') : status?.connectionHealth
  if (!status && !unavailable)
    return { title: 'Checking ChatGPT', description: 'Reading connection status…', action: 'none' }
  if (!status || unavailable)
    return {
      title: 'ChatGPT needs attention',
      description: 'Check the connection to read its current status.',
      action: 'check'
    }
  if (busy || health?.state === 'progress')
    return {
      title: 'Connecting ChatGPT',
      description:
        status.direct?.preparation !== 'idle' && status.direct
          ? connectionLabel(status)
          : status.state === 'signed-in'
            ? 'Updating your ChatGPT connection…'
            : connectionLabel(status),
      action: 'none'
    }
  const account = status.connections.find((a) => a.id === status.activeConnectionId)
  let action: ConnectionDialogAction = 'details'
  if (status.actions.protectConnection) action = 'protect'
  else if (health?.state === 'ready') action = issue ? 'check' : 'done'
  else if (health?.action === 'connect' || health?.action === 'reconnect')
    action = !account && status.connections.length > 1 ? 'account' : 'connect'
  else if (health?.action === 'resume') action = 'resume'
  else if (health?.action === 'choose-model')
    action = status.catalog?.state === 'loaded' ? 'model' : 'retry'
  else if (
    health?.action === 'refresh-models' ||
    ['offline', 'provider-unavailable'].includes(health?.reason ?? '')
  )
    action = 'retry'
  else if (health?.action === 'check-status') action = 'check'
  return {
    title:
      action === 'done'
        ? 'ChatGPT is connected'
        : health?.state === 'disconnected'
          ? 'Connect ChatGPT'
          : 'ChatGPT needs attention',
    description: issue
      ? connectionReason[issue]
      : connectionHealthDescription[health?.reason ?? 'checking'],
    action
  }
}
