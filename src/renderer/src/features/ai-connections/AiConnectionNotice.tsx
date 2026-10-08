import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useAiConnections } from './connectionState'
import { connectionHealthDescription, connectionReason } from './connection-copy'
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
  const directDiagnostic = connections.status?.direct?.issue
  // Request errors are shown with the message. Only evidence about the
  // connection belongs in this global account notice.
  const directIssue =
    directDiagnostic?.stage === 'inference-http' || directDiagnostic?.stage === 'inference-stream'
      ? null
      : directDiagnostic
  const cleanup = connections.status?.local?.cleanupCount ?? 0
  const health = connections.status?.connectionHealth
  const preparationAttention =
    health &&
    [
      'resume-required',
      'reconnect-required',
      'permission-required',
      'models-required',
      'model-required'
    ].includes(health.reason)
  const healthIssue =
    (health?.state === 'attention' || health?.state === 'error') &&
    (!preparationAttention || (connections.startupPrepared && !connections.busy))
  const unavailable = connections.statusUnavailable && (!!connections.status || !!connections.issue)
  const needsAttention =
    connections.issue || localIssue || directIssue || unavailable || healthIssue
  // Background preparation/renewal is silent. Explicit account work keeps its controls.
  const explicitProgress =
    !!connections.pending || connections.waiting || connections.status?.state === 'disconnecting'
  if (connections.dialogOpen) return null
  if (!explicitProgress && !needsAttention && !cleanup) return null
  return (
    <div className={styles['ai-connection-notice']}>
      <StatusBanner title="ChatGPT" tone={needsAttention ? 'warning' : 'info'}>
        <p>
          {connections.issue
            ? connectionReason[connections.issue]
            : localIssue
              ? connectionReason[localIssue]
              : directIssue
                ? connectionReason[directIssue.reason]
                : connections.statusUnavailable
                  ? connectionHealthDescription['status-unavailable']
                  : healthIssue
                    ? connectionHealthDescription[health.reason]
                    : explicitProgress
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
