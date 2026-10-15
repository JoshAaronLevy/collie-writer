import { createContext, useContext } from 'react'
import type { ImportCategory } from '../../../../shared/project-import'
import type { OpenInput } from '../../../../shared/projects'
export const ImportContext = createContext<{
  open: (trigger: HTMLElement, category?: ImportCategory) => void
  dropFiles: (trigger: HTMLElement, files: File[]) => void
  showAnalysis: (attemptId: string) => void
  busy: boolean
  accepted: { id: string; scope: OpenInput } | null
} | null>(null)
export function useProjectImport(): NonNullable<React.ContextType<typeof ImportContext>> {
  const value = useContext(ImportContext)
  if (!value) throw new Error('Project import owner is missing')
  return value
}
