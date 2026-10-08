import { useEffect, useRef, useState } from 'react'
import type { AiStatus } from '../../../../shared/ai'
import { useWorkspaceSession } from '../workspace/workspaceContext'

/** Prepare silently. Main owns the launch marker; no startup outcome opens a dialog. */
export function useChatGptStartup({
  status,
  apply,
  onFailure
}: {
  status: AiStatus | null
  apply: (status: AiStatus) => void
  onFailure: () => void
}): boolean {
  const session = useWorkspaceSession()
  const started = useRef(false)
  const retryAfterSequence = useRef<number | null>(null)
  const mounted = useRef(false)
  const [prepared, setPrepared] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (
      started.current ||
      !session.available ||
      session.startupPending ||
      session.closing ||
      (retryAfterSequence.current !== null &&
        (!status || status.sequence <= retryAfterSequence.current))
    )
      return
    started.current = true
    void (async () => {
      try {
        const result = await window.collie.aiStartup({ action: 'prepare' })
        if (!mounted.current) return
        if (!result.ok) {
          onFailure()
          return
        }
        if (!result.value.prepared) {
          // Main is settling close/suspend. A later status change may retry coordination.
          retryAfterSequence.current = result.value.status.sequence
          started.current = false
          apply(result.value.status)
          return
        }
        apply(result.value.status)
        setPrepared(true)
        if (!result.value.promptHandled) {
          const acknowledged = await window.collie.aiStartup({ action: 'acknowledge' })
          if (!mounted.current) return
          if (acknowledged.ok) apply(acknowledged.value.status)
          else onFailure()
        }
      } catch {
        if (mounted.current) onFailure()
      }
    })()
  }, [session.available, session.startupPending, session.closing, status, apply, onFailure])
  return prepared
}
