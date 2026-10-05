import { useEffect, useRef, useState, type RefObject } from 'react'
import type { AiStatus } from '../../../../shared/ai'
import { useWorkspaceSession } from '../workspace/workspaceContext'

/** Presentation scheduling never owns navigation, editor state or account work. */
export function useChatGptStartup({
  status,
  suppressAutomatic,
  dismissed,
  busy,
  apply,
  openAutomatically,
  onFailure
}: {
  status: AiStatus | null
  suppressAutomatic: boolean
  dismissed: RefObject<boolean>
  busy: boolean
  apply: (status: AiStatus) => void
  openAutomatically: (trigger: HTMLElement | null) => boolean
  onFailure: () => void
}): void {
  const session = useWorkspaceSession()
  const started = useRef(false)
  const claiming = useRef(false)
  const [phase, setPhase] = useState<'waiting' | 'settling' | 'granted' | 'done'>('waiting')

  useEffect(() => {
    if (started.current || !session.available || session.startupPending || session.closing) return
    started.current = true
    void window.collie.aiStartup({ action: 'prepare' }).then((result) => {
      if (!result.ok) {
        onFailure()
        setPhase('done')
        return
      }
      apply(result.value.status)
      if (!result.value.prepared) {
        // Main is settling a close/suspend. A later ordinary status change may retry
        // this local coordination, but only main may consume the preparation marker.
        started.current = false
        return
      }
      setPhase(result.value.promptHandled ? 'done' : 'settling')
    })
  }, [session.available, session.startupPending, session.closing, status, apply, onFailure])

  useEffect(() => {
    if (phase === 'waiting' || phase === 'done') return
    let disposed = false
    let frame = 0
    const settle = (): void => {
      if (disposed || claiming.current) return
      if (dismissed.current || suppressAutomatic || status?.connectionHealth.state === 'ready') {
        dismissed.current = true
        setPhase('done')
        void window.collie.aiStartup({ action: 'acknowledge' })
        return
      }
      if (
        !status ||
        status.connectionHealth.state === 'progress' ||
        busy ||
        !session.available ||
        session.startupPending ||
        session.closing ||
        session.navigating ||
        session.busy ||
        session.working ||
        session.acting ||
        session.blocker ||
        session.error ||
        session.conflict ||
        session.composition.current ||
        (session.destination.kind === 'settings' && session.destination.page === 'data') ||
        session.list.issues.length > 0 ||
        document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return
      if (phase === 'granted') {
        if (openAutomatically(null)) {
          dismissed.current = true
          setPhase('done')
        }
        return
      }
      claiming.current = true
      void window.collie.aiStartup({ action: 'claim-prompt' }).then((result) => {
        claiming.current = false
        if (!result.ok) {
          onFailure()
          setPhase('done')
          return
        }
        apply(result.value.status)
        setPhase(
          result.value.promptGranted ? 'granted' : result.value.promptHandled ? 'done' : 'settling'
        )
      })
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(settle)
    }
    // A deferred grant is rechecked after modal exit, composition end, and focus return.
    // These events never perform model discovery or inference.
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('compositionend', schedule)
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('focus', schedule)
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('compositionend', schedule)
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('focus', schedule)
    }
  }, [
    phase,
    session,
    status,
    suppressAutomatic,
    dismissed,
    busy,
    apply,
    openAutomatically,
    onFailure
  ])
}
