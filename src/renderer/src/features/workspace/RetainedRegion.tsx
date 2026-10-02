import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { destinationRegion } from '../../app/navigation'
import { useWorkspaceSession } from './WorkspaceSession'
import styles from './WorkspaceNavigation.module.css'

/** Visibility changes never unmount an editor, clear a draft registration or cancel a job. */
export function RetainedRegion({ name, label, children }: { name: string; label: string; children: ReactNode }): React.JSX.Element {
  const { destination, focusRevision, focusRequest, navigating } = useWorkspaceSession()
  const visible = destinationRegion(destination) === name
  const root = useRef<HTMLElement>(null), lastFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!visible || !focusRevision || navigating) return
    const requested = focusRequest.current
    if (requested) { focusRequest.current = null; requested(); return }
    const previous = lastFocus.current
    if (previous?.isConnected && root.current?.contains(previous) && !previous.matches(':disabled')) previous.focus({ preventScroll: true })
    else root.current?.focus({ preventScroll: true })
    root.current?.scrollIntoView({ block: 'start' })
  }, [visible, focusRevision, navigating])
  return <section ref={root} className={styles['destination-region']} hidden={!visible} inert={!visible}
    tabIndex={-1} aria-label={label} onFocusCapture={event => { lastFocus.current = event.target as HTMLElement }}>
    {children}
  </section>
}
