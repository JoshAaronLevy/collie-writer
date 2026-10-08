import { useCallback, useEffect, useRef, useState } from 'react'
import { AppButton } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useConversations } from './conversationState'
import { MEMORY_LIMITS, type MemoryCheckpoint } from '../../../../../shared/conversation-memory'
import type { ConversationTurn, ConversationValue } from '../../../../../shared/conversations'
import styles from './Conversations.module.css'

function originalText(text: string): string {
  try {
    const value: unknown = JSON.parse(text)
    if (
      Array.isArray(value) &&
      value.every(
        (m) =>
          m &&
          typeof m === 'object' &&
          typeof m.text === 'string' &&
          ['user', 'assistant'].includes(m.role)
      )
    )
      return value
        .map((m) => `${m.role === 'user' ? 'You' : 'Assistant'} [${m.id}]\n${m.text}`)
        .join('\n\n')
    return JSON.stringify(value, null, 2)
  } catch {
    return text
  }
}
export function ConversationMemory(): React.JSX.Element {
  const c = useConversations(),
    session = useWorkspaceSession(),
    scope = c.scope,
    chat = c.selected
  const [open, setOpen] = useState(!!c.memoryEdit),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState('')
  const [page, setPage] = useState<Extract<ConversationValue, { type: 'memories' }> | null>(null)
  const [originals, setOriginals] = useState<ConversationTurn | null>(null)
  const sequence = useRef(0)
  const read = useCallback(
    async (before: number | null): Promise<void> => {
      if (!scope || !chat) return
      const seq = ++sequence.current
      setBusy(true)
      setIssue('')
      try {
        const result = await window.collie.conversation({
          ...scope,
          action: 'memory-list',
          conversationId: chat,
          before
        })
        if (seq !== sequence.current) return
        if (result.ok && result.value.type === 'memories') setPage(result.value)
        else setIssue(result.ok ? 'Memory could not be read.' : result.error.message)
      } catch {
        if (seq === sequence.current) setIssue('Memory could not be read. Try again.')
      } finally {
        if (seq === sequence.current) setBusy(false)
      }
    },
    [scope, chat]
  )
  useEffect(
    () => () => {
      sequence.current++
    },
    []
  )
  async function inspect(m: MemoryCheckpoint): Promise<void> {
    if (!scope) return
    const seq = ++sequence.current
    setBusy(true)
    try {
      const result = await window.collie.conversation({
        ...scope,
        action: 'attempt',
        attemptId: m.producingAttemptId
      })
      if (seq !== sequence.current) return
      if (result.ok && result.value.type === 'turn') setOriginals(result.value.turn)
      else setIssue('The original preparation could not be read.')
    } catch {
      if (seq === sequence.current) setIssue('The original preparation could not be read.')
    } finally {
      if (seq === sequence.current) setBusy(false)
    }
  }
  const blocked =
    busy ||
    c.busy ||
    !!c.pending ||
    c.readOnly ||
    !!c.run?.pending ||
    session.closing ||
    session.navigating
  return (
    <details
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        if (e.currentTarget.open) void read(null)
        else sequence.current++
      }}
    >
      <summary>Memory</summary>
      {open ? (
        <>
          <p>
            Memory summarizes earlier discussion or selected project structure, synopses and
            passages. It is not a quotation or verified research. Originals and older versions are
            kept.
          </p>
          <div className={styles['conversation-actions']}>
            <AppButton
              size="compact-sm"
              variant="subtle"
              disabled={busy}
              onClick={() => void read(null)}
            >
              Refresh memory
            </AppButton>
            {page?.nextBefore !== null && page ? (
              <AppButton
                size="compact-sm"
                variant="subtle"
                disabled={busy}
                onClick={() => void read(page.nextBefore)}
              >
                Older versions
              </AppButton>
            ) : null}
          </div>
          {busy ? <p role="status">Reading memory…</p> : null}
          {issue ? <p role="alert">{issue}</p> : null}
          {page && !page.items.length ? (
            <p>No memory checkpoints yet. Send prepares them only when needed.</p>
          ) : null}
          {page?.items.map(({ checkpoint: m, current, stale }) => (
            <details key={m.id}>
              <summary>
                {m.coverage.kind === 'chat' ? 'Earlier chat' : 'Project overview'} ·{' '}
                {current ? 'Current' : 'Older version'}
                {stale ? ' · Stale, excluded' : ''}
                {m.state === 'edited' ? ' · Edited' : ''}
              </summary>
              <p className={styles['conversation-message-text']}>{m.text}</p>
              <p>
                {new Date(m.createdAt).toLocaleString()}.{' '}
                {m.coverage.kind === 'chat'
                  ? `${m.coverage.messages.length / 2} exchanges added${m.coverage.previousId ? ' to prior memory' : ''}.`
                  : `${m.coverage.documents.length} outline items covered; View originals shows the exact material summarized.`}
              </p>
              <div className={styles['conversation-actions']}>
                <AppButton
                  size="compact-sm"
                  variant="subtle"
                  disabled={busy}
                  onClick={() => void inspect(m)}
                >
                  View originals
                </AppButton>
                {current ? (
                  <AppButton
                    size="compact-sm"
                    variant="subtle"
                    disabled={blocked || !!c.memoryEdit || stale}
                    onClick={() => c.setMemoryEdit({ id: m.id, text: m.text, original: m.text })}
                  >
                    Edit memory
                  </AppButton>
                ) : null}
              </div>
            </details>
          ))}
          {c.memoryEdit ? (
            <div>
              <label>
                Memory text
                <textarea
                  aria-label="Memory text"
                  value={c.memoryEdit.text}
                  maxLength={MEMORY_LIMITS.text}
                  readOnly={blocked}
                  onChange={(e) => {
                    const text = e.currentTarget.value
                    c.setMemoryEdit((previous) => (previous ? { ...previous, text } : null))
                  }}
                />
              </label>
              <p>
                Save keeps a new revision. Earlier memory and original messages remain available.
              </p>
              <AppButton
                size="compact-sm"
                disabled={blocked || !c.memoryEdit.text.trim()}
                onClick={() => {
                  const seq = sequence.current
                  void c.saveMemory().then(() => {
                    if (seq === sequence.current) void read(null)
                  })
                }}
              >
                Save memory
              </AppButton>
              <AppButton
                size="compact-sm"
                variant="subtle"
                disabled={c.busy || !!c.pending || c.composingRef.current}
                onClick={() => {
                  if (!c.composingRef.current) c.setMemoryEdit(null)
                }}
              >
                Cancel edit
              </AppButton>
            </div>
          ) : null}
          {originals ? (
            <details open>
              <summary>Original preparation · {originals.attempt.state}</summary>
              {originals.capture.context.map((item, i) => (
                <details key={i}>
                  <summary>{item.label}</summary>
                  <pre className={styles['memory-originals']}>{originalText(item.text)}</pre>
                </details>
              ))}
              {originals.assistant ? (
                <>
                  <strong>Original generated memory</strong>
                  <p className={styles['conversation-message-text']}>{originals.assistant.text}</p>
                </>
              ) : null}
            </details>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
