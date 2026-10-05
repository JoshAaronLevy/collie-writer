import type { ReactNode } from 'react'
import { Context, useConnectionController } from './connectionState'

export function AiConnectionsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const connections = useConnectionController()
  return <Context.Provider value={connections}>{children}</Context.Provider>
}
