import { createContext, useContext } from 'react'
import type { EvidenceView } from '../../../../shared/evidence'
type ResearchData = {
  view: EvidenceView | null
  loading: boolean
  error: string
  fresh: boolean
  refresh: () => Promise<void>
  accept: (view: EvidenceView) => void
}
export const Context = createContext<ResearchData | null>(null)
export function useResearchData(): ResearchData {
  const value = useContext(Context)
  if (!value) throw new Error('Research data owner is missing')
  return value
}
