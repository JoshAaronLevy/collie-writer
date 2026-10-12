import { createContext, useContext } from 'react'
import type { ImportCategory } from '../../../../shared/project-import'
export const ImportContext = createContext<{
  open: (trigger: HTMLElement, category?: ImportCategory) => void
  showAnalysis: (attemptId: string) => void
  busy: boolean
} | null>(null)
export function useProjectImport(): NonNullable<React.ContextType<typeof ImportContext>> {
  const value = useContext(ImportContext)
  if (!value) throw new Error('Project import owner is missing')
  return value
}
