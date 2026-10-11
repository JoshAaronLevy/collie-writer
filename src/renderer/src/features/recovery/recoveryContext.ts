import { createContext, useContext } from 'react'
import type { RecoveryIssue } from '../../../../shared/recovery'

export const RecoveryContext = createContext<{
  opened: boolean
  issues: RecoveryIssue[]
  open: (trigger?: HTMLElement) => void
} | null>(null)

export function useRecovery(): NonNullable<React.ContextType<typeof RecoveryContext>> {
  const value = useContext(RecoveryContext)
  if (!value) throw new Error('Recovery provider required')
  return value
}
