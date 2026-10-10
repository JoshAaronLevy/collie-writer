import { createContext, useContext } from 'react'
export const ImportContext = createContext<{
  open: (trigger: HTMLElement) => void
  showAnalysis: (attemptId: string) => void
  busy: boolean
} | null>(null)
export function useProjectImport(): NonNullable<React.ContextType<typeof ImportContext>> {
  const value = useContext(ImportContext)
  if (!value) throw new Error('Project import owner is missing')
  return value
}
