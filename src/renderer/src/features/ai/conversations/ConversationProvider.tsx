import { ReferenceReview } from './ReferenceReview'
import { useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ConversationPanel } from './ConversationPanel'
import { ConversationHost } from './conversation-slot'
import styles from './Conversations.module.css'
import { Context, useConversationController } from './conversationState'

export function ConversationProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const controller = useConversationController()
  const [host] = useState(() => {
    const node = document.createElement('div')
    node.className = styles['conversation-host']
    return node
  })
  return (
    <Context.Provider value={controller}>
      <ConversationHost.Provider value={host}>{children}</ConversationHost.Provider>
      <ReferenceReview />
    </Context.Provider>
  )
}

export function ConversationPresentation(): React.JSX.Element | null {
  const host = useContext(ConversationHost)
  return host ? createPortal(<ConversationPanel />, host) : null
}
