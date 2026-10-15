import { useContext, useLayoutEffect, useRef } from 'react'
import { ConversationHost } from './conversation-slot'
import styles from './Conversations.module.css'

/** Move one retained portal host; switching modes does not remount the transcript. */
export function ConversationSlot({ active }: { active: boolean }): React.JSX.Element {
  const host = useContext(ConversationHost),
    slot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (active && host && slot.current) slot.current.appendChild(host)
  }, [active, host])
  return (
    <div ref={slot} className={styles['conversation-slot']} data-conversation-visible={active} />
  )
}
