import { AppButton } from '../../components/ui/Controls'
import styles from '../settings/CollieAccess.module.css'
import { useEffect, useState } from 'react'
import type { DirectAction, DirectView } from '../../../../shared/direct-access'
import type { ProjectResult } from '../../../../shared/projects'

export default function DirectAccessPanel(): React.JSX.Element {
  const [view, setView] = useState<DirectView | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!view?.pending || !view.expiresAt) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, view.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [view?.pending, view?.expiresAt])
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    void window.collie
      .readDirectAccess()
      .then((result) => {
        if (!mounted) return
        if (result.ok) {
          setView(result.value)
          setNow(Date.now())
        } else setError(result.error.message)
      })
      .catch(() => {
        if (mounted) setError('Purchase access could not be read. Your projects are kept.')
      })
    return () => {
      mounted = false
    }
  }, [])
  async function perform(work: () => Promise<ProjectResult<DirectView>>): Promise<void> {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await work()
      if (result.ok) {
        setView(result.value)
        setNow(Date.now())
      } else setError(result.error.message)
    } catch {
      setError('The purchase action could not finish. Your projects and saved access are kept.')
    } finally {
      setBusy(false)
    }
  }
  const begin = (kind: DirectAction): void => {
    void perform(() => window.collie.beginDirectAccess(kind))
  }
  const available = !!view?.configured && view.secureStorage && !busy
  const activeSession = !!view?.pending && (view.expiresAt ?? 0) > now
  if (!view)
    return (
      <>
        <p role={error ? 'alert' : 'status'}>{error || 'Reading purchase access…'}</p>
        {error ? (
          <AppButton
            variant="default"
            disabled={busy}
            onClick={() => void perform(window.collie.readDirectAccess)}
          >
            Retry purchase access
          </AppButton>
        ) : null}
      </>
    )
  return (
    <section className={styles['purchase-connection']} aria-labelledby="purchase-title">
      <h3 id="purchase-title">Purchase and restore</h3>
      {view.configured ? (
        <>
          <p role="status" aria-live="polite">
            {view.message}
          </p>
          {!view.checkoutEnabled ? (
            <p>
              New purchases are unavailable in this build; purchase restore is available when secure
              storage is working.
            </p>
          ) : null}
          {!view.secureStorage ? (
            <p>
              Purchase access cannot be stored securely. Free writing and saved access remain
              available.
            </p>
          ) : null}
          <div className={styles['access-actions']}>
            {view.checkoutEnabled ? (
              <>
                <AppButton
                  variant="default"
                  type="button"
                  disabled={!available || activeSession}
                  onClick={() => begin('monthly')}
                >
                  Monthly · $9.99 USD
                </AppButton>
                <AppButton
                  variant="default"
                  type="button"
                  disabled={!available || activeSession}
                  onClick={() => begin('lifetime')}
                >
                  Lifetime · $199 USD
                </AppButton>
              </>
            ) : null}
            <AppButton
              variant="default"
              type="button"
              disabled={!available || activeSession}
              onClick={() => begin('restore')}
            >
              Restore purchase…
            </AppButton>
          </div>
          <p>Purchase and restore open your browser. Your writing is not shared.</p>
          {view.pending ? (
            <div>
              <p>
                {view.pending === 'restore' ? 'Restore' : 'Purchase'}{' '}
                {activeSession ? 'is waiting in your browser' : 'session expired'}.
                {activeSession && view.expiresAt
                  ? ` Expires ${new Date(view.expiresAt).toLocaleTimeString()}.`
                  : ''}{' '}
                Keep the recovery code from your browser for future restores.
              </p>
              <div className={styles['access-actions']}>
                <AppButton
                  variant="default"
                  type="button"
                  disabled={!available || !activeSession}
                  onClick={() => void perform(window.collie.resumeDirectAccess)}
                >
                  Continue in browser
                </AppButton>
                <AppButton
                  variant="default"
                  type="button"
                  disabled={!available || !activeSession}
                  onClick={() => void perform(window.collie.claimDirectAccess)}
                >
                  Check completion
                </AppButton>
              </div>
            </div>
          ) : null}
          {view.connected ? (
            <div className={styles['access-actions']}>
              <AppButton
                variant="default"
                type="button"
                disabled={!available}
                onClick={() => void perform(window.collie.refreshDirectAccess)}
              >
                Refresh purchase access
              </AppButton>
              <AppButton
                variant="default"
                type="button"
                disabled={!available}
                onClick={() => void perform(window.collie.manageDirectAccess)}
              >
                Manage subscription…
              </AppButton>
            </div>
          ) : null}
          {view.hasSubscription ? (
            <p>
              Buying lifetime access does not cancel your subscription. Manage it above to review
              billing.
            </p>
          ) : null}
        </>
      ) : (
        <p role="status">{view.message}</p>
      )}
      {view.connected || view.pending || !view.secureStorage ? (
        <details>
          <summary>Disconnect purchase account</summary>
          <p>
            Clears this computer’s purchase connection. Keeps projects and saved access; does not
            cancel billing.
          </p>
          <AppButton
            variant="default"
            disabled={busy}
            onClick={() => void perform(window.collie.disconnectDirectAccess)}
          >
            Disconnect
          </AppButton>
        </details>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
