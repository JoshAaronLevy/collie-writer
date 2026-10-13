import { useRef, useState } from 'react'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import PresentationBoundary from '../../components/PresentationBoundary'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from './connectionState'
import { connectionPresentation } from './connectionPresentation'
import { AiModelSelection } from './AiModelSelection'
import { ChatGptAccountControls } from './ChatGptAccountControls'
import { ChatGptConnectionIssue } from './ChatGptConnectionIssue'
import styles from './AiConnections.module.css'

/** One presentation host beneath the surviving app-wide connection controller. */
export function ChatGptConnectionDialog(): React.JSX.Element {
  const connections = useAiConnections()
  const view = connectionPresentation(
    connections.status,
    connections.statusUnavailable,
    connections.issue,
    connections.busy
  )
  return (
    <AppDialog
      opened={connections.dialogOpen}
      onClose={connections.closeDialog}
      title={view.title}
      returnFocus={false}
      onExited={connections.returnDialogFocus}
    >
      <PresentationBoundary label="ChatGPT connection" render={() => <DialogContents />} />
    </AppDialog>
  )
}

function DialogContents(): React.JSX.Element {
  const connections = useAiConnections()
  const session = useWorkspaceSession()
  const { status, issue, busy, waiting, checking, statusUnavailable } = connections
  const view = connectionPresentation(status, statusUnavailable, issue, busy)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)
  const disconnectTrigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const disconnectAccount = status?.connections.find((a) => a.id === disconnectId)
  const blocked =
    busy || session.closing || session.navigating || !session.available || statusUnavailable
  const keepConnected = (): void => {
    setDisconnectId(null)
    requestAnimationFrame(() => {
      const target = disconnectTrigger.current
      if (
        !session.composition.current &&
        target?.isConnected &&
        !target.disabled &&
        !target.closest('[hidden], [inert]')
      )
        target.focus({ preventScroll: true })
    })
  }
  const primary = (): React.JSX.Element | null => {
    switch (view.action) {
      case 'check':
        return (
          <AppButton
            disabled={checking || !session.available || session.closing}
            pending={checking}
            onClick={() => void connections.checkStatus(true)}
          >
            Check status
          </AppButton>
        )
      case 'protect':
        return (
          <AppButton
            disabled={blocked || !status?.actions.protectConnection}
            onClick={(event) =>
              void connections.localAction('protectConnection', event.currentTarget)
            }
          >
            {status?.direct?.preferences === 'unreadable'
              ? 'Retry reading model choices'
              : 'Retry saving connection'}
          </AppButton>
        )
      case 'none':
        return null
    }
  }
  return (
    <section
      className={styles['chatgpt-dialog']}
      data-ai-connection-surface
      hidden={!connections.dialogOpen}
    >
      <h2 ref={heading} tabIndex={-1} className={styles['chatgpt-dialog-heading']}>
        {disconnectAccount ? 'Disconnect this account?' : 'Your ChatGPT connection'}
      </h2>
      {disconnectAccount ? (
        <div
          className={styles['chatgpt-disconnect-confirmation']}
          role="group"
          aria-label="Confirm disconnection"
        >
          <p>
            Disconnect {disconnectAccount.label} from Collie? Your writing and saved AI history stay
            on this device.
          </p>
          <div className={styles['ai-account-actions']}>
            <AppButton variant="default" onClick={keepConnected}>
              Keep connected
            </AppButton>
            <AppButton
              disabled={blocked || !status?.actions.disconnect}
              onClick={(event) => {
                void connections.accountAction(
                  'disconnect',
                  disconnectAccount.id,
                  event.currentTarget
                )
                setDisconnectId(null)
                requestAnimationFrame(() => {
                  if (
                    heading.current?.isConnected &&
                    !heading.current.closest('[hidden], [inert]') &&
                    !session.composition.current
                  )
                    heading.current.focus({ preventScroll: true })
                })
              }}
            >
              Disconnect account
            </AppButton>
          </div>
        </div>
      ) : (
        <>
          <p role="status" aria-live="polite">
            {view.description}
          </p>
          {!session.available ? (
            <p>
              {session.storage.state === 'unavailable'
                ? 'Local storage is unavailable, so connection controls are paused. Copy any unprotected writing before restarting Collie.'
                : session.location?.state === 'required'
                  ? 'Choose a local working folder in Settings → Storage before connecting.'
                  : 'Waiting for local storage. Connection controls will be available when storage is ready.'}
            </p>
          ) : null}
          {waiting ? (
            <p>
              Finish signing in in your browser. You can close this dialog while sign-in continues.
            </p>
          ) : null}
          <div className={styles['ai-account-actions']}>
            {primary()}
            {waiting ? (
              <AppButton
                variant="default"
                disabled={!connections.canCancel}
                onClick={() => void connections.cancel()}
              >
                Cancel sign-in
              </AppButton>
            ) : null}
          </div>
        </>
      )}
      <div hidden={!!disconnectAccount}>
        <ChatGptAccountControls
          blocked={blocked}
          onDisconnect={(id, trigger) => {
            disconnectTrigger.current = trigger
            setDisconnectId(id)
            requestAnimationFrame(() => {
              if (
                heading.current?.isConnected &&
                !heading.current.closest('[hidden], [inert]') &&
                !session.composition.current
              )
                heading.current.focus({ preventScroll: true })
            })
          }}
        />
        <AiModelSelection disabled={blocked} />
        <ChatGptConnectionIssue status={status} />
      </div>
      {status?.remoteRevocation === 'unconfirmed' ? (
        <p role="status">
          Signed out locally. Remote revocation could not be confirmed; review access in your
          ChatGPT account.
        </p>
      ) : null}
      {status?.remoteRevocation === 'confirmed' ? (
        <p role="status">Disconnected locally and authorization revoked.</p>
      ) : null}
      <div className={styles['chatgpt-dialog-footer']}>
        <AppButton variant="default" onClick={connections.closeDialog}>
          Done
        </AppButton>
      </div>
    </section>
  )
}
