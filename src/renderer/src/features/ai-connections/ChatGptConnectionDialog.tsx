import { useLayoutEffect, useRef, useState } from 'react'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import PresentationBoundary from '../../components/PresentationBoundary'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from './connectionState'
import { connectionPresentation } from './connectionPresentation'
import { connectionReason } from './connection-copy'
import { AiModelSelection } from './AiModelSelection'
import { ChatGptAccountControls } from './ChatGptAccountControls'
import { ChatGptConnectionDetails } from './ChatGptConnectionDetails'
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
  const model = useRef<HTMLDetailsElement>(null)
  const accounts = useRef<HTMLDetailsElement>(null)
  const details = useRef<HTMLDetailsElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const account = status?.connections.find((a) => a.id === status.activeConnectionId)
  const reconnectAccount =
    account ?? (status?.connections.length === 1 ? status.connections[0] : undefined)
  const disconnectAccount = status?.connections.find((a) => a.id === disconnectId)
  const blocked =
    busy || session.closing || session.navigating || !session.available || statusUnavailable
  useLayoutEffect(() => {
    const target =
      view.action === 'model'
        ? model
        : view.action === 'account'
          ? accounts
          : view.action === 'details'
            ? details
            : null
    if (target?.current) target.current.open = true
  }, [view.action])
  const expose = (name: 'model' | 'account' | 'details'): void => {
    const target = name === 'model' ? model : name === 'account' ? accounts : details
    if (target.current) target.current.open = true
    requestAnimationFrame(() => {
      if (
        !target.current?.isConnected ||
        target.current.closest('[hidden], [inert]') ||
        session.composition.current
      )
        return
      target.current.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
      target.current.scrollIntoView({ block: 'nearest' })
    })
  }
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
      case 'done':
        return <AppButton onClick={connections.closeDialog}>Done</AppButton>
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
      case 'connect':
        return (
          <AppButton
            disabled={blocked || !status?.actions.connect}
            onClick={(event) =>
              void connections.connect(reconnectAccount?.id ?? null, event.currentTarget)
            }
          >
            {reconnectAccount ? 'Reconnect ChatGPT' : 'Connect ChatGPT'}
          </AppButton>
        )
      case 'retry':
        return (
          <AppButton
            disabled={blocked || !account || !status?.actions.refreshModels}
            onClick={(event) => {
              if (account)
                void connections.accountAction(
                  status?.direct ? 'prepareConnection' : 'refreshModels',
                  account.id,
                  event.currentTarget
                )
            }}
          >
            Try again
          </AppButton>
        )
      case 'resume':
        return (
          <AppButton
            disabled={blocked || !account || !status?.actions.resume}
            onClick={(event) => {
              if (account) void connections.accountAction('resume', account.id, event.currentTarget)
            }}
          >
            Resume connection
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
      case 'model':
        return <AppButton onClick={() => expose('model')}>Choose model</AppButton>
      case 'account':
        return <AppButton onClick={() => expose('account')}>Choose account</AppButton>
      case 'details':
        return <AppButton onClick={() => expose('details')}>View connection details</AppButton>
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
          {account || (view.action === 'connect' && reconnectAccount) ? (
            <p className={styles['ai-account-label']}>{(account ?? reconnectAccount)?.label}</p>
          ) : null}
          {!session.available ? (
            <p>
              Set up local storage in Settings → Data & recovery before connecting. You can close
              this dialog to continue.
            </p>
          ) : null}
          {view.action === 'connect' ? (
            <p className={styles['ai-sharing-note']}>
              Sign-in sends no writing. Later requests share only the context you review, under your
              account’s usage and spending settings.
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
        {status?.catalog ? (
          <details ref={model} className={styles['chatgpt-disclosure']}>
            <summary>Model</summary>
            <AiModelSelection disabled={blocked} />
          </details>
        ) : null}
        <details ref={accounts} className={styles['chatgpt-disclosure']}>
          <summary>Manage account</summary>
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
        </details>
        <details
          ref={details}
          className={`${styles['chatgpt-disclosure']} ${styles['ai-connection-details']}`}
        >
          <summary>Connection details</summary>
          <ChatGptConnectionDetails />
          {status?.local?.issue ? <p role="alert">{connectionReason[status.local.issue]}</p> : null}
          <AppButton
            variant="default"
            disabled={checking || !session.available || session.closing}
            onClick={() => void connections.checkStatus(true)}
          >
            Check status
          </AppButton>
        </details>
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
      {view.action !== 'done' || disconnectAccount ? (
        <div className={styles['chatgpt-dialog-footer']}>
          <AppButton variant="default" onClick={connections.closeDialog}>
            Not now
          </AppButton>
        </div>
      ) : null}
    </section>
  )
}
