import { AppButton } from '../../components/ui/Controls'
import styles from '../settings/CollieAccess.module.css'
import { useEffect, useState } from 'react'
import type { DirectAction, DirectView } from '../../../../shared/direct-access'
import type { ProjectResult } from '../../../../shared/projects'

export default function DirectAccessPanel(): React.JSX.Element {
  const [view, setView] = useState<DirectView | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    void window.collie.readDirectAccess().then(result => {
      if (!mounted) return
      if (result.ok) setView(result.value); else setError(result.error.message)
    })
    return () => { mounted = false }
  }, [])
  async function perform(work: () => Promise<ProjectResult<DirectView>>): Promise<void> {
    if (busy) return
    setBusy(true); setError('')
    try { const result = await work(); if (result.ok) setView(result.value); else setError(result.error.message) }
    catch { setError('The purchase action could not finish. Existing writing and cached signed access remain available.') }
    finally { setBusy(false) }
  }
  const begin = (kind: DirectAction): void => { void perform(() => window.collie.beginDirectAccess(kind)) }
  const available = !!view?.configured && view.secureStorage && !busy
  const activeSession = !!view?.pending && (view.expiresAt ?? 0) > Date.now()
  return <details className={styles['purchase-connection']}>
    <summary>Direct purchase, restore and subscription management</summary>
    <p>Purchase and restore open your system browser. Connection credentials stay in OS-protected storage; your projects, paths, research and writing are never sent to the purchase service.</p>
    {view ? <>
      <p role="status" aria-live="polite">{view.message}</p>
      {!view.checkoutEnabled ? <p>Checkout is not enabled in this build. The commercial-value decision, merchant configuration and checkout review remain prerequisites.</p> : null}
      {!view.secureStorage ? <p>Secure purchase credential storage is unavailable. Free writing and cached signed licenses remain available.</p> : null}
      <div className={styles['access-actions']}>
        <AppButton variant="default" type="button" disabled={!available || !view.checkoutEnabled || activeSession} onClick={() => begin('monthly')}>Monthly nonfiction · $9.99 USD</AppButton>
        <AppButton variant="default" type="button" disabled={!available || !view.checkoutEnabled || activeSession} onClick={() => begin('lifetime')}>Lifetime nonfiction · $199 USD</AppButton>
        <AppButton variant="default" type="button" disabled={!available || activeSession} onClick={() => begin('restore')}>Restore with purchase recovery code…</AppButton>
      </div>
      {view.pending ? <div>
        <p>Browser session: {view.pending === 'restore' ? 'restore' : `${view.pending} purchase`}. Expires {new Date(view.expiresAt!).toLocaleTimeString()}. Keep the recovery code shown after payment before returning here.</p>
        <div className={styles['access-actions']}>
          <AppButton variant="default" type="button" disabled={!available} onClick={() => { void perform(window.collie.resumeDirectAccess) }}>Reopen browser session</AppButton>
          <AppButton variant="default" type="button" disabled={!available} onClick={() => { void perform(window.collie.claimDirectAccess) }}>Check completion</AppButton>
        </div>
      </div> : null}
      {view.connected ? <div className={styles['access-actions']}>
        <AppButton variant="default" type="button" disabled={!available} onClick={() => { void perform(window.collie.refreshDirectAccess) }}>Refresh signed purchase access</AppButton>
        <AppButton variant="default" type="button" disabled={!available} onClick={() => { void perform(window.collie.manageDirectAccess) }}>Manage subscription and receipts…</AppButton>
      </div> : null}
      {view.hasSubscription ? <p>A recurring subscription exists on this connection. Buying lifetime access does not cancel it automatically. Use subscription management to review billing.</p> : null}
      {view.connected || view.pending || !view.secureStorage ? <>
        <p>Disconnect clears this computer's purchase connection and pending session. It keeps cached signed licenses and projects, and does not cancel a subscription. You can restore with your recovery code later.</p>
        <AppButton variant="default" type="button" disabled={busy} onClick={() => { void perform(window.collie.disconnectDirectAccess) }}>Disconnect purchase account</AppButton>
      </> : null}
      <p>Refresh when online to receive renewal, cancellation or refund decisions. If the service cannot be reached, the last authenticated document governs offline access; reading, export, backup and recovery stay available.</p>
    </> : <p role="status">Reading this computer's purchase connection…</p>}
    {error ? <p role="alert">{error}</p> : null}
  </details>
}
