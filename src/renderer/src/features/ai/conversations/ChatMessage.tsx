import type { MediaTarget } from '../../../../../shared/chat-media'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu, VisuallyHidden } from '@mantine/core'
import { IconBooks } from '@tabler/icons-react'
import type { HistoricalTime } from '../../../../../shared/conversation-transcript'
import type { MenuAction } from '../../../components/ui/ActionMenu'
import { IconButton } from '../../../components/ui/IconButton'
import { useVisualPreferences } from '../../../theme/visualPreferencesContext'
import { ChatMarkdown } from './ChatMarkdown'
import { messageTime } from './message-time'
import styles from './Conversations.module.css'

/** Shared presentation only; conversation, source and draft owners stay outside the bubble. */
export function ChatMessage({
  role,
  text,
  time,
  now,
  children,
  actions = [],
  sources,
  linked = false,
  notice,
  mediaTarget
}: {
  role: string
  text: string
  time: string | HistoricalTime | null
  now: number
  children?: ReactNode
  actions?: MenuAction[]
  sources?: ReactNode
  linked?: boolean
  notice?: ReactNode
  mediaTarget?: MediaTarget
}): React.JSX.Element {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const bubble = useRef<HTMLDivElement>(null)
  const disclosure = useRef<HTMLElement>(null)
  const selectedAction = useRef<(() => void) | null>(null)
  const { reducedMotion } = useVisualPreferences()
  const timestamp = messageTime(time, now)
  const author = role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : role
  useEffect(() => {
    if (!menu && selectedAction.current) {
      const action = selectedAction.current
      selectedAction.current = null
      bubble.current?.focus({ preventScroll: true })
      action()
    }
  }, [menu])
  useEffect(() => {
    if (!sourcesOpen) return
    const frame = requestAnimationFrame(() => {
      const target = disclosure.current
      if (target && !target.closest('[hidden],[inert]')) {
        target.scrollIntoView({ block: 'nearest' })
        target.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [sourcesOpen])
  const choices: MenuAction[] = [
    {
      id: 'copy',
      label: 'Copy message',
      onSelect: () => {
        void window.collie
          .conversationPresentation('copy', text)
          .then((ok) =>
            setCopyNotice(ok ? 'Copied' : 'Could not copy. Select the text to copy it manually.')
          )
          .catch(() => setCopyNotice('Could not copy. Select the text to copy it manually.'))
      }
    },
    ...actions,
    ...(sources ? [{ id: 'sources', label: 'Sources', onSelect: () => setSourcesOpen(true) }] : [])
  ]
  return (
    <div
      ref={bubble}
      className={styles['conversation-message']}
      data-role={role}
      tabIndex={0}
      role="group"
      aria-label={`${author}'s message`}
      aria-haspopup="menu"
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        setMenu({ left: event.clientX - rect.left, top: event.clientY - rect.top })
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ left: 16, top: Math.max(16, -rect.top + 16) })
        }
      }}
    >
      <VisuallyHidden>Message options: Shift+F10 or the context-menu key.</VisuallyHidden>
      {children ?? <ChatMarkdown text={text} mediaTarget={mediaTarget} />}
      <div className={styles['message-footer']}>
        {timestamp ? (
          <time dateTime={timestamp.machine} title={timestamp.exact} aria-label={timestamp.exact}>
            {timestamp.label}
          </time>
        ) : null}
        {linked && sources ? (
          <IconButton
            label="Linked Research"
            variant="subtle"
            onClick={() => setSourcesOpen((open) => !open)}
          >
            <IconBooks size={16} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
      {sourcesOpen && sources ? (
        <section
          ref={disclosure}
          tabIndex={-1}
          className={styles['research-references']}
          aria-label="Message sources"
        >
          {sources}
          <button
            type="button"
            className={styles['chat-link']}
            onClick={() => {
              setSourcesOpen(false)
              bubble.current?.focus({ preventScroll: true })
            }}
          >
            Close sources
          </button>
        </section>
      ) : null}
      {notice}
      {copyNotice ? (
        <span className={styles['conversation-caption']} role="status">
          {copyNotice}
        </span>
      ) : null}
      <Menu
        opened={!!menu}
        onChange={(open) => {
          if (!open) {
            setMenu(null)
            bubble.current?.focus({ preventScroll: true })
          }
        }}
        returnFocus={false}
        withinPortal
        position="bottom-start"
        loop
        withInitialFocusPlaceholder={false}
        transitionProps={{ duration: reducedMotion ? 0 : 100 }}
      >
        <Menu.Target>
          <span className={styles['message-menu-anchor']} style={menu ?? { left: 0, top: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>
          {choices.map((action, index) => (
            <Menu.Item
              key={action.id}
              data-autofocus={index === 0 || undefined}
              disabled={action.disabled}
              onClick={() => {
                selectedAction.current = action.onSelect
                setMenu(null)
              }}
            >
              {action.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}
