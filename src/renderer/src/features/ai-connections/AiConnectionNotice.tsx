import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useAiConnections } from './connectionState'
import { connectionReason } from './connection-copy'
import { connectionPresentation } from './connectionPresentation'
import styles from './AiConnections.module.css'

/** Account progress remains visible when its original panel is hidden. */
export function AiConnectionNotice(): React.JSX.Element | null {
  const connections = useAiConnections()
  const view = connectionPresentation(
    connections.status,
    connections.statusUnavailable,
    connections.issue,
    connections.busy
  )
  const localIssue = connections.status?.local?.issue
  const directIssue = connections.status?.direct?.issue
  const cleanup = connections.status?.local?.cleanupCount ?? 0
  if (connections.dialogOpen) return null
  if (!connections.busy && !connections.issue && !localIssue && !directIssue && !cleanup)
    return null
  return (
    <div className={styles['ai-connection-notice']}>
      <StatusBanner
        title="ChatGPT"
        tone={connections.issue || localIssue || directIssue ? 'warning' : 'info'}
      >
        <p>
          {connections.issue
            ? connectionReason[connections.issue]
            : localIssue
              ? connectionReason[localIssue]
              : directIssue
                ? connectionReason[directIssue.reason]
                : connections.busy
                  ? view.description
                  : 'Inactive Codex sessions are waiting for local sign-out.'}
        </p>
        <div className={styles['ai-account-actions']}>
          <AppButton
            variant="subtle"
            onClick={(event) => connections.openDialog(event.currentTarget)}
          >
            Manage ChatGPT
          </AppButton>
          {connections.waiting ? (
            <AppButton
              variant="default"
              disabled={!connections.canCancel}
              pending={connections.pending?.kind === 'cancel'}
              onClick={() => void connections.cancel()}
            >
              Cancel sign-in
            </AppButton>
          ) : null}
          {connections.issue ? (
            <AppButton
              variant="default"
              pending={connections.checking}
              onClick={() => void connections.checkStatus(true)}
            >
              Check status
            </AppButton>
          ) : null}
        </div>
      </StatusBanner>
    </div>
  )
}
