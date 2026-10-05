import type { ReactNode } from 'react'
import { Context, useProofreadingController } from './proofreadingState'

export function ProofreadingProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const value = useProofreadingController()
  return <Context.Provider value={value}>{children}</Context.Provider>
}
