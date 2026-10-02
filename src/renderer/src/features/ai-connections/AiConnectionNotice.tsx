import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useAiConnections } from './AiConnectionsProvider'
import { connectionLabel, connectionReason } from './connection-copy'
import styles from './AiConnections.module.css'

/** Account progress remains visible when its original panel is hidden. */
export function AiConnectionNotice(): React.JSX.Element | null {
  const connections = useAiConnections()
  if (!connections.busy && !connections.issue) return null
  return <div className={styles['ai-connection-notice']}>
    <StatusBanner title="AI account connection" tone={connections.issue ? 'warning' : 'info'}>
      <p>{connections.issue ? connectionReason[connections.issue] : connectionLabel(connections.status, connections.checking, connections.pending?.kind)}</p>
      <div className={styles['ai-account-actions']}>
        <AppButton variant="subtle" onClick={connections.showOrigin}>Return to connection</AppButton>
        {connections.waiting ? <AppButton variant="default" pending={connections.pending?.kind === 'cancel'} onClick={() => void connections.cancel()}>Cancel sign-in</AppButton> : null}
        {connections.issue ? <AppButton variant="default" pending={connections.checking} onClick={() => void connections.checkStatus(true)}>Check status</AppButton> : null}
      </div>
    </StatusBanner>
  </div>
}
