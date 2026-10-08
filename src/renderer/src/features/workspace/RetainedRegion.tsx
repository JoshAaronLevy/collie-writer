import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { destinationRegion, type DestinationPresentation } from '../../app/navigation'
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
    navigating,
    closing,
    composition
  } = useWorkspaceSession()
  const visible = destinationRegion(destination) === name
  const root = useRef<HTMLElement>(null)
  const handled = useRef<DestinationPresentation | null>(null)
  useLayoutEffect(() => {
    const requested = focusRequestRef.current
    if (
      !visible ||
      !focusRevision ||
      navigating ||
      closing ||
      !requested ||
      handled.current === requested
    )
      return
    let frame = 0
    let disposed = false
    const present = (): void => {
      frame = 0
      if (disposed || focusRequestRef.current !== requested || handled.current === requested) return
      const region = root.current
      if (
        !region ||
        region.closest('[hidden], [inert]') ||
        composition.current ||
        document.hidden ||
        !document.hasFocus() ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return
      handled.current = requested
      stop()
      if (requested.mode === 'top') {
        const heading = Array.from(region.querySelectorAll<HTMLElement>('h1, h2, h3')).find(
          (item) => !item.closest('[hidden], [inert]') && item.getClientRects().length > 0
        )
        const target = heading ?? region
        target.tabIndex = -1
        target.focus({ preventScroll: true })
        // Scroll the page, not the lower destination section beneath its navigation.
        const page = document.scrollingElement ?? document.documentElement
        page.scrollTop = 0
        page.scrollLeft = 0
      } else {
        // Resume never focuses the writing surface. Exact-target actions own their focus.
        requested.focus?.()
      }
    }
    const schedule = (): void => {
      if (frame || disposed || handled.current === requested) return
      frame = requestAnimationFrame(present)
    }
    const interrupt = (event: Event): void => {
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="alertdialog"]')
      )
        return
      handled.current = requested
      if (focusRequestRef.current === requested) focusRequestRef.current = null
      stop()
    }
    const observer = new MutationObserver(schedule)
    function stop(): void {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('compositionend', schedule)
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('focus', schedule)
      document.removeEventListener('pointerdown', interrupt, true)
      document.removeEventListener('keydown', interrupt, true)
      document.removeEventListener('wheel', interrupt, true)
    }
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'inert']
    })
    document.addEventListener('compositionend', schedule)
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('focus', schedule)
    document.addEventListener('pointerdown', interrupt, true)
    document.addEventListener('keydown', interrupt, true)
    document.addEventListener('wheel', interrupt, true)
    if (requested.mode === 'target') present()
    else schedule()
    return stop
  }, [visible, focusRevision, navigating, closing, focusRequestRef, composition])
  return (
    <section
      ref={root}
      data-destination-region={name}
      className={styles['destination-region']}
      hidden={!visible}
      inert={!visible}
      tabIndex={-1}
      aria-label={label}
    >
      {children}
    </section>
  )
}
