import { createContext, useContext, type ReactNode } from 'react'
import type { StorageStatus } from '../../../../shared/storage'
import { useWorkspaceController } from './useWorkspaceController'
import { ResearchDataProvider } from '../research/ResearchData'
import { DraftContext } from './DraftOwner'

type WorkspaceSession = ReturnType<typeof useWorkspaceController>
const Context = createContext<WorkspaceSession | null>(null)

export function WorkspaceSessionProvider({ storage, children }: { storage: StorageStatus; children: ReactNode }): React.JSX.Element {
  const session = useWorkspaceController(storage)
  return <Context.Provider value={session}><DraftContext.Provider value={session.drafts}><ResearchDataProvider project={session.project}>{children}</ResearchDataProvider></DraftContext.Provider></Context.Provider>
}

export function useWorkspaceSession(): WorkspaceSession {
  const session = useContext(Context)
  if (!session) throw new Error('Workspace session is missing')
  return session
}
