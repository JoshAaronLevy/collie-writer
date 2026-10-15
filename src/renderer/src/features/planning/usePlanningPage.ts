import { useEffect, useState } from 'react'
import type { PlanningReadInput, PlanningView } from '../../../../shared/planning'

/** Reads only the requested page; hidden retained regions do not keep scanning the library. */
export function usePlanningPage(
  input: PlanningReadInput,
  active: boolean,
  revision: string
): { view: PlanningView | null; issue: string; loading: boolean } {
  const request = JSON.stringify(input)
  const key = `${request}:${active}:${revision}`
  const [loaded, setLoaded] = useState<{
    key: string
    request: string
    view: PlanningView | null
    issue: string
  } | null>(null)
  useEffect(() => {
    if (!active) return
    let live = true
    const captured = JSON.parse(request) as PlanningReadInput
    void window.collie
      .readPlanning(captured)
      .then((result) => {
        if (live)
          setLoaded(
            result.ok
              ? { key, request, view: result.value, issue: '' }
              : { key, request, view: null, issue: result.error.message }
          )
      })
      .catch(() => {
        if (live)
          setLoaded({
            key,
            request,
            view: null,
            issue: 'Material could not be loaded. Choose Refresh to try again.'
          })
      })
    return () => {
      live = false
    }
  }, [request, active, key])
  return {
    view: loaded?.request === request ? loaded.view : null,
    issue: loaded?.key === key ? loaded.issue : '',
    loading: active && loaded?.key !== key
  }
}
