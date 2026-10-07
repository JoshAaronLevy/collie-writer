import type { AiActionAvailability } from '../../../../shared/ai-route'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from './connectionState'
import styles from './AiConnections.module.css'

function availability(feature: AiActionAvailability | undefined): string {
  if (!feature) return 'Checking availability. Saved requests remain on this device.'
  if (feature.state === 'available') return 'Ready for a new reviewed request.'
  switch (feature.reason) {
    case 'operation-capacity-full':
      return 'AI work needs attention before another request. Open Local AI capacity and recovery in the AI work notice.'
    case 'output-protection-required':
      return 'An AI outcome needs local protection. Use the AI work notice to finish recovery.'
    case 'ai-work-pending':
    case 'account-work-pending':
      return 'AI work is still finishing. You can keep this request saved locally.'
    case 'model-selection-required':
      return 'Choose an available model in Manage ChatGPT, then review your request again.'
    case 'model-refresh-required':
    case 'model-catalog-unavailable':
    case 'model-catalog-timeout':
      return 'Model setup needs attention. Open Manage ChatGPT to continue.'
    case 'connect-required':
    case 'reconnect-required':
    case 'resume-required':
      return 'Open Manage ChatGPT to connect or restore your account. Saved requests remain available.'
    case 'proofreading-adapter-not-ready':
      return 'Proofreading is unavailable with this connection. You can save a review locally.'
    default:
      return 'This feature is unavailable with the current connection. Open Manage ChatGPT for details; saved work remains available.'
  }
}

/** Feature availability stays contextual; account actions have one shared dialog. */
export function AiRequestConnection({
  action,
  disabled = false,
  onManage
}: {
  action: 'conversation' | 'proofread'
  disabled?: boolean
  onManage?: () => void
}): React.JSX.Element {
  const connections = useAiConnections(),
    session = useWorkspaceSession()
  return (
    <section
      className={styles['ai-request-connection']}
      aria-label={`${action === 'conversation' ? 'Conversation' : 'Proofreading'} availability`}
    >
      <h2>
        {action === 'conversation' ? 'Conversation availability' : 'Proofreading availability'}
      </h2>
      <p role="status">
        {connections.statusUnavailable
          ? 'Availability could not be confirmed. Open Manage ChatGPT to check status; your saved work is kept.'
          : availability(connections.status?.features[action])}
      </p>
      <AppButton
        variant="default"
        disabled={disabled || session.closing || session.navigating}
        aria-haspopup="dialog"
        onClick={(event) => (onManage ? onManage() : connections.openDialog(event.currentTarget))}
      >
        Manage ChatGPT
      </AppButton>
    </section>
  )
}
