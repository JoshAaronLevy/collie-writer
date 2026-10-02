import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { EvidenceView } from '../../../../shared/evidence'

type ResearchData = { view: EvidenceView | null; loading: boolean; error: string; fresh: boolean; refresh: () => Promise<void>; accept: (view: EvidenceView) => void }
const Context = createContext<ResearchData | null>(null)

/** One read model for usage and evidence; editing buffers stay with their retained owners. */
export function ResearchDataProvider({ project, children }: { project: OpenProject | null; children: ReactNode }): React.JSX.Element {
  const scope = project ? `${project.projectId}:${project.workspaceId}` : ''
  const latest = useRef(project); latest.current = project
  const sequence = useRef(0)
  const [snapshot, setSnapshot] = useState<{ scope: string; view: EvidenceView } | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const refresh = useCallback(async (): Promise<void> => {
    const p = latest.current, request = ++sequence.current
    if (!p) { setSnapshot(null); setLoading(false); setError(''); return }
    setLoading(true); setError('')
    try {
      const result = await window.collie.readEvidence({ projectId: p.projectId, workspaceId: p.workspaceId })
      if (request !== sequence.current) return
      if (result.ok) setSnapshot({ scope: `${p.projectId}:${p.workspaceId}`, view: result.value })
      else setError(result.error.message)
    } catch { if (request === sequence.current) setError('Research connections could not be loaded. Retry to see saved usage.') }
    finally { if (request === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => { void refresh(); return () => { sequence.current++ } }, [scope, project?.headCommitId, refresh])
  const accept = (view: EvidenceView): void => {
    sequence.current++; setSnapshot({ scope, view }); setLoading(false); setError('')
  }
  const view = snapshot?.scope === scope ? snapshot.view : null
  return <Context.Provider value={{ view, loading, error, fresh: !!view && view.headCommitId === project?.headCommitId, refresh, accept }}>{children}</Context.Provider>
}
export function useResearchData(): ResearchData {
  const value = useContext(Context)
  if (!value) throw new Error('Research data owner is missing')
  return value
}
