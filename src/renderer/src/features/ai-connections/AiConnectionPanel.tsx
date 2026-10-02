import { useId, useRef, useState } from 'react'
import { UserRound, ExternalLink } from 'lucide-react'
import { AppButton } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useAiConnections } from './AiConnectionsProvider'
import { connectionLabel, connectionProblemReasons, connectionReason, signInUnavailable } from './connection-copy'
import styles from './AiConnections.module.css'

export function AiConnectionPanel({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const connections = useAiConnections()
  const session = useWorkspaceSession()
  const titleId = useId()
  const [changing, setChanging] = useState(false)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)
  const disconnectOrigin = useRef<{ trigger: HTMLButtonElement; destination: string } | null>(null)
  const { status, pending, busy, checking, waiting, issue } = connections
  const account = status?.connections.find(item => item.id === status.activeConnectionId)
  const disconnectAccount = status?.connections.find(item => item.id === disconnectId)
  const unavailable = status ? signInUnavailable(status) : null
  const problem = issue ?? status?.reasons.find(reason => connectionProblemReasons.includes(reason)) ?? null
  const blocked = busy || session.closing || session.navigating || issue === 'outcome-unknown'
  const canConnect = !!status?.actions.connect && !blocked && session.available
  const otherAccounts = status?.connections.filter(item => item.id !== account?.id) ?? []

  function confirmDisconnect(id: string, trigger: HTMLButtonElement): void {
    disconnectOrigin.current = { trigger, destination: JSON.stringify(session.destination) }
    setDisconnectId(id)
  }
  function returnDisconnectFocus(): void {
    const origin = disconnectOrigin.current
    disconnectOrigin.current = null
    if (!origin || origin.destination !== JSON.stringify(session.destination) || session.composition.current || panel.current?.closest('[hidden], [inert]')) return
    const target = origin.trigger.isConnected && !origin.trigger.disabled ? origin.trigger : panel.current?.querySelector<HTMLElement>('h2')
    if (target?.isConnected && !target.closest('[hidden], [inert]')) target.focus({ preventScroll: true })
  }

  return <section ref={panel} className={styles['ai-connection-panel']} data-ai-connection-surface data-compact={compact} aria-labelledby={titleId}>
    <header className={styles['ai-provider-heading']}>
      <span className={styles['ai-provider-symbol']}><UserRound size={22} aria-hidden="true" /></span>
      <div><h2 id={titleId} tabIndex={-1}>ChatGPT account</h2><p className={styles['ai-provider-description']}>OpenAI · Codex runtime</p></div>
    </header>
    <p className={styles['ai-connection-state']} role="status" aria-live="polite">{connectionLabel(status, checking, pending?.kind)}</p>
    {!session.available ? <StatusBanner title="Local storage is needed">Set up a safe local working folder before connecting an account. Your project setup remains available.
      <AppButton variant="subtle" onClick={() => void session.navigate({ kind: 'settings', page: 'data' })}>Open Data & recovery</AppButton>
    </StatusBanner> : null}
    {unavailable ? <p>{connectionReason[unavailable]}</p> : null}
    {problem ? <StatusBanner tone={problem === 'cancelled' ? 'info' : 'warning'} title={problem === 'cancelled' ? 'Sign-in cancelled' : 'Connection needs attention'}>{connectionReason[problem]}</StatusBanner> : null}
    {!status && session.available && !checking ? <p>Connection status could not be loaded. Check status to retry; you can continue writing locally.</p> : null}
    {waiting ? <div className={styles['ai-sign-in-progress']}>
      <p>Finish signing in in your default browser, then return here. The app confirms the connection; a browser success page alone does not enable AI.</p>
      <AppButton variant="default" pending={pending?.kind === 'cancel'} onClick={() => void connections.cancel()}>Cancel sign-in</AppButton>
    </div> : null}
    {account ? <div className={styles['ai-current-account']}>
      <h3>Selected account</h3><p className={styles['ai-account-label']}>{account.label}</p>
      <p>{account.state === 'signed-in' ? 'Signed in for future requests. AI usage eligibility is still unresolved.' : account.state === 'expired' ? 'This session has expired. Reconnect to authorize this account again.' : 'This saved account is signed out.'}</p>
      <div className={styles['ai-account-actions']}>
        <AppButton variant="default" disabled={!canConnect} leftSection={<ExternalLink size={16} aria-hidden="true" />} onClick={event => void connections.connect(account.id, event.currentTarget)}>Reconnect account</AppButton>
        <AppButton variant="subtle" disabled={!status?.actions.refresh || blocked || account.state === 'signed-out'} pending={pending?.kind === 'refresh' && pending.connectionId === account.id} onClick={event => void connections.accountAction('refresh', account.id, event.currentTarget)}>Renew session</AppButton>
        <AppButton variant="subtle" disabled={blocked} aria-expanded={changing} onClick={() => setChanging(open => !open)}>Change account</AppButton>
        <AppButton variant="subtle" disabled={!status?.actions.disconnect || blocked} onClick={event => confirmDisconnect(account.id, event.currentTarget)}>Disconnect</AppButton>
      </div>
    </div> : null}
    {(!account || changing) && !waiting ? <div className={styles['ai-account-choice']}>
      <AppButton disabled={!canConnect || (status?.connections.length ?? 0) >= 8} leftSection={<ExternalLink size={16} aria-hidden="true" />} onClick={event => void connections.connect(null, event.currentTarget)}>
        {account ? 'Connect another ChatGPT account' : 'Sign in with ChatGPT'}
      </AppButton>
      {(status?.connections.length ?? 0) >= 8 ? <p>The saved-account limit has been reached. Reconnect or select a saved account.</p> : null}
      {otherAccounts.length ? <div className={styles['ai-saved-accounts']}>
        <h3>Saved accounts on this device</h3>
        {otherAccounts.map(saved => <div className={styles['ai-saved-account']} key={saved.id}>
          <div><p className={styles['ai-account-label']}>{saved.label}</p><p>{saved.state === 'signed-in' ? 'Signed in · eligibility unresolved' : saved.state === 'expired' ? 'Session expired' : 'Signed out'}</p></div>
          <div className={styles['ai-account-actions']}>
            {saved.state === 'signed-in' ? <AppButton variant="default" disabled={!status?.actions.select || blocked} onClick={event => {
              void connections.accountAction('select', saved.id, event.currentTarget).then(confirmed => { if (confirmed) setChanging(false) })
            }}>Use this account</AppButton> : <AppButton variant="default" disabled={!canConnect} onClick={event => void connections.connect(saved.id, event.currentTarget)}>Reconnect</AppButton>}
            {saved.state !== 'signed-out' ? <AppButton variant="subtle" disabled={!status?.actions.disconnect || blocked} onClick={event => confirmDisconnect(saved.id, event.currentTarget)}>Disconnect</AppButton> : null}
          </div>
        </div>)}
      </div> : null}
    </div> : null}
    <p className={styles['ai-sharing-note']}>Sign-in sends no manuscript, project title or description. Later AI requests will share only the context you approve with the selected provider under your account’s policies.</p>
    {status?.funding === 'unknown' ? <p className={styles['ai-funding-note']}>{connectionReason['funding-unknown']}</p> : null}
    <details className={styles['ai-connection-details']}>
      <summary>Connection details</summary>
      <dl>
        <div><dt>Sign-in access</dt><dd>{status ? unavailable ? connectionReason[unavailable] : status.channelPermitted && status.configured ? 'Configured for this build. Account sign-in is separate from AI eligibility.' : 'Unavailable in this build.' : 'Status has not been loaded.'}</dd></div>
        <div><dt>Commercial activation</dt><dd>{status?.commercialApproved ? 'An approval reference is recorded by the app. Other AI requirements still apply.' : 'Approval is not recorded for this build. Local writing remains available.'}</dd></div>
        <div><dt>Included subscription usage</dt><dd>{status ? connectionReason['funding-unknown'] : 'Not established.'}</dd></div>
        <div><dt>Runtime</dt><dd>{status?.runtime === 'development-installed' ? 'The development runtime is present; safe execution is not enabled.' : status?.runtime === 'not-packaged' ? 'The runtime is not included in this packaged build.' : 'The runtime is unavailable.'}</dd></div>
        <div><dt>Models & workspace</dt><dd>No model or provider workspace is authorized for requests yet. Sign-in does not establish model eligibility.</dd></div>
      </dl>
      {status?.reasons.includes('isolation-unresolved') ? <p>{connectionReason['isolation-unresolved']}</p> : null}
      <p>Collie access and the provider account are separate. Connecting cannot change your free editable project or unlock paid Collie features.</p>
    </details>
    {status?.remoteRevocation === 'unconfirmed' ? <StatusBanner tone="warning" title="Signed out locally">Remote revocation could not be confirmed. You can review this app’s authorization in your provider account. Saved local writing and history are retained.</StatusBanner> : status?.remoteRevocation === 'confirmed' ? <p role="status">The account was disconnected locally and its provider authorization was revoked.</p> : null}
    <div className={styles['ai-status-actions']}>
      <AppButton variant="subtle" disabled={checking || !session.available || session.closing} pending={checking} onClick={() => void connections.checkStatus(true)}>Check connection status</AppButton>
    </div>
    <AppDialog opened={!!disconnectAccount} title="Disconnect AI account" dismissible={!busy} returnFocus={false} onExited={returnDisconnectFocus} onClose={() => setDisconnectId(null)}>
      {disconnectAccount ? <><p>Disconnect “{disconnectAccount.label}” from Collie Writer on this device? Your project, writing and saved local AI history remain available.</p>
        <p>New requests cannot use this account after local sign-out. Remote revocation is reported separately.</p>
        <div className={styles['ai-account-actions']}><AppButton variant="default" disabled={busy} onClick={() => setDisconnectId(null)}>Keep connected</AppButton><AppButton pending={pending?.kind === 'disconnect'} disabled={busy || !status?.actions.disconnect} onClick={event => {
          void connections.accountAction('disconnect', disconnectAccount.id, event.currentTarget).then(confirmed => { if (confirmed) setDisconnectId(null) })
        }}>Disconnect account</AppButton></div>
        {issue ? <p role="alert">{connectionReason[issue]}</p> : null}
      </> : null}
    </AppDialog>
  </section>
}
