import { ReferenceReview } from './ReferenceReview'
import type { ReactNode } from 'react'
import { Context, useConversationController } from './conversationState'

export function ConversationProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const controller = useConversationController()
  return (
    <Context.Provider value={controller}>
      {children}
      <ReferenceReview />
    </Context.Provider>
  )
}
