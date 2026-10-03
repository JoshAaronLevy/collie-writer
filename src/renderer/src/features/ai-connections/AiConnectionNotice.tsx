import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useAiConnections } from './AiConnectionsProvider'
import { connectionLabel, connectionReason } from './connection-copy'
import styles from './AiConnections.module.css'

/** Account progress remains visible when its original panel is hidden. */
export function AiConnectionNotice(): React.JSX.Element | null {
  const connections = useAiConnections()
  const localIssue = connections.status?.local?.issue
  const cleanup = connections.status?.local?.cleanupCount ?? 0
  if (!connections.busy && !connections.issue && !localIssue && !cleanup) return null
  return <div className={styles['ai-connection-notice']}>
    <StatusBanner title="AI account connection" tone={connections.issue || localIssue ? 'warning' : 'info'}>
      <p>{connections.issue ? connectionReason[connections.issue] : localIssue ? connectionReason[localIssue] : connections.busy ? connectionLabel(connections.status, connections.checking, connections.pending?.kind) : 'Inactive Codex sessions are waiting for local sign-out.'}</p>
      <div className={styles['ai-account-actions']}>
        <AppButton variant="subtle" onClick={connections.showOrigin}>Return to connection</AppButton>
        {connections.waiting ? <AppButton variant="default" disabled={!connections.canCancel} pending={connections.pending?.kind === 'cancel'} onClick={() => void connections.cancel()}>Cancel sign-in</AppButton> : null}
        {connections.issue ? <AppButton variant="default" pending={connections.checking} onClick={() => void connections.checkStatus(true)}>Check status</AppButton> : null}
      </div>
    </StatusBanner>
  </div>
}
