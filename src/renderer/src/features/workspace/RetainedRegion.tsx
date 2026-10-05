import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { destinationRegion } from '../../app/navigation'
import { useWorkspaceSession } from './workspaceContext'
import styles from './WorkspaceNavigation.module.css'

/** Visibility changes never unmount an editor, clear a draft registration or cancel a job. */
export function RetainedRegion({
  name,
  label,
  children
}: {
  name: string
  label: string
  children: ReactNode
}): React.JSX.Element {
  const {
    destination,
    focusRevision,
    focusRequest: focusRequestRef,
    navigating
  } = useWorkspaceSession()
  const visible = destinationRegion(destination) === name
  const root = useRef<HTMLElement>(null),
    lastFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!visible || !focusRevision || navigating) return
    // Defer the existing navigation focus request until the dialog exits. Do
    // not consume it behind a focus trap or leave a stale request for a later route.
    const restoreFocus = (): boolean => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
      const requested = focusRequestRef.current
      if (requested) {
        focusRequestRef.current = null
        requested()
      } else {
        const previous = lastFocus.current
        if (
          previous?.isConnected &&
          root.current?.contains(previous) &&
          !previous.matches(':disabled')
        )
          previous.focus({ preventScroll: true })
        else root.current?.focus({ preventScroll: true })
        root.current?.scrollIntoView({ block: 'start' })
      }
      return true
    }
    if (restoreFocus()) return
    const observer = new MutationObserver(() => {
      if (restoreFocus()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [visible, focusRevision, navigating, focusRequestRef])
  return (
    <section
      ref={root}
      data-destination-region={name}
      className={styles['destination-region']}
      hidden={!visible}
      inert={!visible}
      tabIndex={-1}
      aria-label={label}
      onFocusCapture={(event) => {
        lastFocus.current = event.target as HTMLElement
      }}
    >
      {children}
    </section>
  )
}
