import { Context } from './workspaceContext'
import { type ReactNode } from 'react'
import type { StorageStatus } from '../../../../shared/storage'
import { useWorkspaceController } from './useWorkspaceController'
import { ResearchDataProvider } from '../research/ResearchData'
import { DraftContext } from './DraftOwner'
import StorageNoticesProvider from '../settings/StorageNoticesProvider'

export function WorkspaceSessionProvider({
  storage,
  children
}: {
  storage: StorageStatus
  children: ReactNode
}): React.JSX.Element {
  const session = useWorkspaceController(storage)
  return (
    <Context.Provider value={session}>
      <DraftContext.Provider value={session.drafts}>
        <StorageNoticesProvider>
          <ResearchDataProvider project={session.project}>{children}</ResearchDataProvider>
        </StorageNoticesProvider>
      </DraftContext.Provider>
    </Context.Provider>
  )
}
