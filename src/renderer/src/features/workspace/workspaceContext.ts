import { createContext, useContext } from 'react'
import type { useWorkspaceController } from './useWorkspaceController'
type WorkspaceSession = ReturnType<typeof useWorkspaceController>
export const Context = createContext<WorkspaceSession | null>(null)
export function useWorkspaceSession(): WorkspaceSession {
  const session = useContext(Context)
  if (!session) throw new Error('Workspace session is missing')
  return session
}
