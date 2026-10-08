import { useEffect, useRef, useState } from 'react'
import { TextInput } from '@mantine/core'
import { AppButton } from '../../../components/ui/Controls'
import type { ConversationMatch, ConversationValue } from '../../../../../shared/conversations'
import type { OpenInput } from '../../../../../shared/projects'
import styles from './Conversations.module.css'

export function ConversationFind({
  scope,
  conversationId,
  onSelect,
  onClose
}: {
  scope: OpenInput
  conversationId: string
  onSelect: (match: ConversationMatch) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Extract<ConversationValue, { type: 'matches' }> | null>(null),
    [issue, setIssue] = useState('')
  const sequence = useRef(0),
    composing = useRef(false)
  useEffect(
    () => () => {
      sequence.current++
    },
    []
  )
  async function find(after: number | null): Promise<void> {
    if (!query.trim() || composing.current) return
    const seq = ++sequence.current
    setBusy(true)
    setIssue('')
    try {
      const reply = await window.collie.conversation({
        ...scope,
        action: 'find',
        conversationId,
        query,
        after
      })
      if (seq !== sequence.current) return
      if (reply.ok && reply.value.type === 'matches') setResult(reply.value)
      else setIssue(reply.ok ? 'Search is unavailable. Try again.' : reply.error.message)
    } catch {
      if (seq === sequence.current) setIssue('Search is unavailable. Try again.')
    } finally {
      if (seq === sequence.current) setBusy(false)
    }
  }
  return (
    <div className={styles['chat-find']} aria-label="Find in this chat">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void find(null)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
      >
        <TextInput
          label="Find in this chat"
          value={query}
          maxLength={160}
          onChange={(e) => {
            sequence.current++
            setBusy(false)
            setQuery(e.currentTarget.value)
            setResult(null)
            setIssue('')
          }}
        />
        <div className={styles['conversation-actions']}>
          <AppButton size="compact-sm" type="submit" disabled={busy || !query.trim()}>
            Find
          </AppButton>
          <AppButton size="compact-sm" variant="subtle" onClick={onClose}>
            Close find
          </AppButton>
        </div>
      </form>
      {busy ? <p role="status">Searching messages…</p> : null}
      {issue ? <p role="alert">{issue}</p> : null}
      {result ? (
        <>
          <p role="status">
            {result.items.length
              ? `${result.items.length} matching messages in this batch.`
              : result.nextAfter === null
                ? 'No more matching messages.'
                : 'No match in this batch. Continue through history.'}
          </p>
          <ul className={styles['conversation-list']}>
            {result.items.map((hit) => (
              <li key={hit.messageId}>
                <AppButton
                  variant="subtle"
                  className={styles['conversation-list-item']}
                  onClick={() => onSelect(hit)}
                >
                  {hit.role === 'user' ? 'You' : 'Assistant'}: {hit.preview}
                </AppButton>
              </li>
            ))}
          </ul>
          {result.nextAfter !== null ? (
            <AppButton
              variant="subtle"
              disabled={busy}
              onClick={() => {
                void find(result.nextAfter)
              }}
            >
              Continue search
            </AppButton>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
