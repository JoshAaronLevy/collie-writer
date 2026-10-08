import {
  IconArrowLeft,
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconPlayerStop,
  IconCopy,
  IconDots
} from '@tabler/icons-react'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { IconButton } from '../../../components/ui/IconButton'
import { useProofreading } from '../proofreading/proofreadingState'
import PresentationBoundary from '../../../components/PresentationBoundary'
import { useLayoutEffect, useRef, useState } from 'react'
import { NativeSelect, Popover, TextInput, Textarea } from '@mantine/core'
import { AppButton, SelectField } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useAiConnections } from '../../ai-connections/connectionState'
import { connectionReason } from '../../ai-connections/connection-copy'
import type { AiReason } from '../../../../../shared/ai'
import type { AiCapture, Conversation, ConversationTurn } from '../../../../../shared/conversations'
import {
  readContextHistory,
  type ConversationContextPolicy
} from '../../../../../shared/conversation-context'
import { useConversations } from './conversationState'
import { ChatMarkdown } from './ChatMarkdown'
import styles from './Conversations.module.css'

const activeStates = ['preparing', 'running', 'stopping']
function requestReason(reason: AiReason, hasResponse = false): string {
  if (['auth-failed', 'session-expired', 'signed-out'].includes(reason))
    return 'Connect ChatGPT again, then send a new message. This attempt will not resend.'
  if (reason === 'model-unavailable')
    return 'Choose another available model, then send a new message.'
  if (reason === 'invalid-request')
    return 'ChatGPT could not accept this request. View error details before trying again.'
  if (reason === 'provider-failed')
    return hasResponse
      ? 'The received text is kept, but Collie could not confirm a complete response. View error details for more information.'
      : 'ChatGPT could not answer this message. View error details for more information.'
  if (reason === 'outcome-unknown')
    return 'The outcome is uncertain. Any retained response is shown. Sending again starts a new request.'
  if (reason === 'context-changed')
    return 'The account or context changed before sending. Copy this prompt into a fresh draft to try again.'
  return connectionReason[reason]
}
function SentContext({ capture }: { capture: AiCapture }): React.JSX.Element {
  const history = capture.version === 2 ? readContextHistory(capture.context) : null
  return (
    <div className={styles['conversation-capture']}>
      <p className={styles['conversation-caption']}>
        Sent {new Date(capture.createdAt).toLocaleString()}. This snapshot stays unchanged.
      </p>
      {!capture.context.length ? <p>No writing or earlier messages included.</p> : null}
      {capture.context
        .filter((item) => !history || item.kind !== 'history')
        .map((item, i) => (
          <details key={i}>
            <summary>{item.label || 'Writing'}</summary>
            <div className={styles['conversation-message-text']}>{item.text}</div>
          </details>
        ))}
      {history?.length ? (
        <details>
          <summary>{history.length / 2} completed exchanges</summary>
          {history.map((m) => (
            <div key={m.id}>
              <strong>{m.role === 'user' ? 'You' : 'Assistant'}</strong>
              <div className={styles['conversation-message-text']}>{m.text}</div>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  )
}
function MessageTurn({ turn }: { turn: ConversationTurn }): React.JSX.Element {
  const c = useConversations(),
    connections = useAiConnections(),
    [contextOpen, setContextOpen] = useState(false),
    [copyNotice, setCopyNotice] = useState('')
  const a = turn.attempt,
    active = activeStates.includes(a.state)
  return (
    <article
      className={styles['conversation-turn']}
      aria-label={`Message from ${new Date(turn.user.createdAt).toLocaleString()}`}
    >
      <div className={styles['conversation-message']} data-role="user">
        <span className={styles['conversation-message-heading']}>You</span>
        <div className={styles['conversation-message-text']}>{turn.user.text}</div>
      </div>
      {turn.assistant ? (
        <div className={styles['conversation-message']} data-role="assistant">
          <span className={styles['conversation-message-heading']}>Assistant</span>
          <ChatMarkdown text={turn.assistant.text} />
        </div>
      ) : null}
      {active ? (
        <span className={styles['conversation-caption']} role="status">
          {a.state === 'stopping' ? 'Stopping…' : turn.assistant ? 'Responding…' : 'Thinking…'}
        </span>
      ) : null}
      {a.state === 'not-sent' ? (
        <p className={styles['conversation-caption']}>Saved locally · Not sent</p>
      ) : null}
      {!active && a.state !== 'completed' && a.state !== 'not-sent' ? (
        <p className={styles['conversation-caption']}>
          {a.state === 'unknown'
            ? 'Interrupted · outcome unknown'
            : a.state === 'cancelled'
              ? 'Response stopped'
              : turn.assistant?.text
                ? 'Response could not be finalized'
                : 'Response failed'}
        </p>
      ) : null}
      {a.reason ? (
        <p className={styles['conversation-caption']}>
          {requestReason(a.reason, !!turn.assistant?.text)}
        </p>
      ) : null}
      {a.reason &&
      ['provider-failed', 'invalid-request', 'offline', 'quota-exhausted'].includes(a.reason) ? (
        <AppButton
          variant="subtle"
          size="compact-sm"
          onClick={(event) => connections.openDialog(event.currentTarget)}
        >
          View error details
        </AppButton>
      ) : null}
      <div className={styles['message-tools']}>
        {turn.assistant ? (
          <IconButton
            label="Copy response"
            variant="subtle"
            onClick={() => {
              void window.collie
                .conversationPresentation('copy', turn.assistant!.text)
                .then((ok) =>
                  setCopyNotice(
                    ok ? 'Copied' : 'Could not copy. Select the text to copy it manually.'
                  )
                )
            }}
          >
            <IconCopy aria-hidden="true" />
          </IconButton>
        ) : null}
        <ActionMenu
          label="Message"
          accessibleLabel="Message options"
          icon={<IconDots aria-hidden="true" />}
          disabled={c.busy || !!c.pending}
          actions={[
            {
              id: 'context',
              label: contextOpen ? 'Hide sent context' : 'View sent context',
              onSelect: () => setContextOpen(!contextOpen)
            },
            {
              id: 'reuse',
              label: 'Copy prompt to composer',
              disabled:
                active || c.readOnly || !!c.draft.text || c.page?.conversation.state !== 'active',
              onSelect: () => c.retryAsNew(turn)
            }
          ]}
        />
        {copyNotice ? (
          <span className={styles['conversation-caption']} role="status">
            {copyNotice}
          </span>
        ) : null}
      </div>
      {(c.run?.issue && c.run.attemptId === a.id) || a.reason === 'storage-unavailable' ? (
        <AppButton
          variant="subtle"
          disabled={c.busy || !!c.pending}
          onClick={() => c.protect(a.id)}
        >
          Retry local protection
        </AppButton>
      ) : null}
      {contextOpen ? <SentContext capture={turn.capture} /> : null}
    </article>
  )
}
function ConversationGroup({
  label,
  items,
  total,
  offset,
  setOffset,
  blocked
}: {
  label: string
  items: Conversation[]
  total: number
  offset: number
  setOffset: React.Dispatch<React.SetStateAction<number>>
  blocked: boolean
}): React.JSX.Element {
  const c = useConversations()
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      <ul className={styles['conversation-list']}>
        {items.map((item) => (
          <li key={item.id}>
            <AppButton
              variant={c.selected === item.id ? 'default' : 'subtle'}
              className={styles['conversation-list-item']}
              disabled={blocked}
              aria-current={c.selected === item.id ? 'true' : undefined}
              onClick={() => c.choose(item.id)}
            >
              {item.title}
            </AppButton>
            <span>
              {new Date(item.updatedAt).toLocaleDateString()}
              {c.drafts[item.id]?.text ? ' · Unsent draft' : ''}
            </span>
          </li>
        ))}
      </ul>
      {!items.length ? (
        <p>
          No {c.view} conversations{c.query ? ' match this title' : ''}.
        </p>
      ) : null}
      {total > 20 || offset > 0 ? (
        <div className={styles['conversation-actions']}>
          <AppButton
            variant="subtle"
            disabled={blocked || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous {label.toLowerCase()}
          </AppButton>
          <span>
            {offset + (items.length ? 1 : 0)}–{offset + items.length} of {total}
          </span>
          <AppButton
            variant="subtle"
            disabled={blocked || offset + 20 >= total}
            onClick={() => setOffset(offset + 20)}
          >
            More {label.toLowerCase()}
          </AppButton>
        </div>
      ) : null}
    </section>
  )
}

function ContextChoice({ blocked }: { blocked: boolean }): React.JSX.Element {
  const c = useConversations(),
    { project } = useWorkspaceSession()
  const labels = { project: 'Project context', chat: 'This chat only', message: 'Message only' }
  return (
    <Popover width={300} position="top-start" withinPortal shadow="sm">
      <Popover.Target>
        <AppButton variant="subtle" size="compact-sm">
          {labels[c.draft.contextPolicy]}
        </AppButton>
      </Popover.Target>
      <Popover.Dropdown className={styles['context-popover']}>
        <SelectField
          label="Include with your next message"
          value={c.draft.contextPolicy}
          disabled={blocked}
          onChange={(e) =>
            c.update({ contextPolicy: e.currentTarget.value as ConversationContextPolicy })
          }
        >
          <option value="project">Project context</option>
          <option value="chat">This chat only</option>
          <option value="message">Message only</option>
        </SelectField>
        <p>
          {c.draft.contextPolicy === 'project'
            ? `Completed exchanges in this chat, current writing (${project?.documents.find((d) => d.id === project.documentId)?.title || 'none'}), and a bounded project outline with existing synopses.`
            : c.draft.contextPolicy === 'chat'
              ? 'Completed exchanges in this chat. Project writing is excluded.'
              : 'Only your next message. Earlier messages and project writing are excluded.'}
        </p>
        <p>
          Research, other chapters’ text and other chats are not included yet. Failed, stopped and
          local-only attempts are excluded from automatic history.
        </p>
        <p>View the exact snapshot from each message’s menu.</p>
      </Popover.Dropdown>
    </Popover>
  )
}
export function ConversationPanel(): React.JSX.Element {
  const c = useConversations(),
    session = useWorkspaceSession(),
    connections = useAiConnections(),
    proofreading = useProofreading()
  const { composerRef, composingRef } = c
  const transcript = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    shownKey = useRef('')
  const [away, setAway] = useState(false),
    [renaming, setRenaming] = useState(false)
  const [disclosed, setDisclosed] = useState(() => {
    try {
      return localStorage.getItem('collie.chat-sharing.v1') === 'acknowledged'
    } catch {
      return false
    }
  })
  const key = `${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}:${c.before ?? 'latest'}`
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setRenaming(false)
    setAway(false)
  }
  useLayoutEffect(() => {
    const target = transcript.current
    if (!target || c.listOpen || target.closest('[hidden],[inert]')) return
    if (shownKey.current !== key) {
      shownKey.current = key
      const saved = c.scroll.current.get(key)
      target.scrollTop = saved ?? (c.before === null ? target.scrollHeight : 0)
      follow.current = target.scrollHeight - target.clientHeight - target.scrollTop < 48
    } else if (follow.current) target.scrollTop = target.scrollHeight
  }, [key, c.page, c.listOpen, c.scroll, c.before])
  const blocked = c.busy || !!c.pending || session.closing || session.navigating,
    archived = c.page?.conversation.state === 'archived',
    catalog = connections.status?.catalog,
    activeTurn = c.page?.turns.find((t) => activeStates.includes(t.attempt.state)),
    unavailable = c.capability?.state !== 'available' && !c.active && !c.busy
  const send = (): void => {
    if (!c.canSend || !c.draft.text.trim() || composingRef.current) return
    if (!disclosed) {
      try {
        localStorage.setItem('collie.chat-sharing.v1', 'acknowledged')
        setDisclosed(true)
      } catch {
        /* Keep the explanation visible if preferences cannot be saved. */
      }
    }
    follow.current = true
    setAway(false)
    void c.send()
  }
  const jump = (): void => {
    follow.current = true
    setAway(false)
    if (c.before !== null) c.setBefore(null)
    else if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }
  return (
    <PresentationBoundary
      label="Conversations"
      render={() => (
        <section
          className={styles['conversation-panel']}
          data-chat={!c.listOpen}
          aria-label="Project conversations"
          onCompositionStartCapture={() => {
            composingRef.current = true
            c.draftEvents.onCompositionStartCapture()
          }}
          onCompositionEndCapture={() => {
            composingRef.current = false
            c.draftEvents.onCompositionEndCapture()
          }}
        >
          <header className={styles['conversation-heading']}>
            {!c.listOpen ? (
              <IconButton
                label="Back to conversations"
                variant="subtle"
                disabled={blocked}
                onClick={c.backToList}
              >
                <IconArrowLeft aria-hidden="true" />
              </IconButton>
            ) : null}
            {c.listOpen ? (
              <AppButton disabled={c.readOnly || blocked} onClick={() => c.change('create')}>
                New chat
              </AppButton>
            ) : (
              <IconButton
                label="New chat"
                variant="subtle"
                disabled={c.readOnly || blocked}
                onClick={() => c.change('create')}
              >
                <IconPlus aria-hidden="true" />
              </IconButton>
            )}
            {!c.listOpen ? (
              <h3 title={c.page?.conversation.title}>
                {c.page?.conversation.title ?? 'Chat'}
                {archived ? ' · Archived' : ''}
              </h3>
            ) : (
              <span className={styles['header-spacer']} />
            )}
            <ActionMenu
              label="Chat"
              accessibleLabel="Chat options"
              icon={<IconDots aria-hidden="true" />}
              disabled={blocked}
              actions={[
                ...(!c.listOpen && c.page
                  ? [
                      {
                        id: 'rename',
                        label: 'Rename',
                        disabled: c.readOnly,
                        onSelect: () => {
                          setRenaming(true)
                          c.setRename(c.page!.conversation.title)
                        }
                      },
                      {
                        id: 'archive',
                        label: archived ? 'Restore' : 'Archive',
                        disabled: c.readOnly || c.active || !!c.rename,
                        onSelect: () => c.change(archived ? 'restore' : 'archive')
                      },
                      {
                        id: 'export',
                        label: 'Export transcript…',
                        disabled: c.active,
                        onSelect: () => c.exportTranscript(false)
                      },
                      {
                        id: 'export-context',
                        label: 'Export with sent context…',
                        disabled: c.active,
                        onSelect: () => c.exportTranscript(true)
                      }
                    ]
                  : []),
                {
                  id: 'account',
                  label: 'Manage ChatGPT',
                  onSelect: () => connections.openDialog()
                },
                ...(proofreading.total ||
                proofreading.issue ||
                proofreading.bundle ||
                proofreading.pending ||
                proofreading.reviewed ||
                proofreading.event?.pending ||
                proofreading.event?.issue ||
                proofreading.proofreadingLocked
                  ? [
                      {
                        id: 'proofreading',
                        label: 'Saved proofreading reviews',
                        onSelect: () => proofreading.show()
                      }
                    ]
                  : []),
                { id: 'recovery', label: 'Retry local recovery', onSelect: c.recover }
              ]}
            />
          </header>
          {c.issue ? (
            <p className={styles['conversation-error']} role="alert">
              {c.issue}
            </p>
          ) : null}
          {c.notice ? (
            <p className={styles['conversation-caption']} role="status">
              {c.notice}
            </p>
          ) : null}
          {c.pending ? (
            <AppButton disabled={c.busy} onClick={c.retry}>
              Retry the same local action
            </AppButton>
          ) : null}
          {c.readOnly ? (
            <p className={styles['conversation-caption']}>
              This project is read-only. Saved chats and export remain available.
            </p>
          ) : null}
          {c.listOpen ? (
            <div className={styles['conversation-library-scroll']}>
              <details className={styles['conversation-library']}>
                <summary>Search and history</summary>
                <TextInput
                  label="Find by title"
                  value={c.query}
                  maxLength={160}
                  onChange={(e) => c.setQuery(e.currentTarget.value)}
                />
                <SelectField
                  label="Conversation history"
                  value={c.view}
                  onChange={(e) => c.setView(e.currentTarget.value as 'active' | 'archived')}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </SelectField>
              </details>
              {c.listLoading ? (
                <p role="status">Loading conversations…</p>
              ) : (
                <>
                  {c.currentLabel ? (
                    <ConversationGroup
                      label={c.currentLabel}
                      items={c.currentItems}
                      total={c.currentTotal}
                      offset={c.currentOffset}
                      setOffset={c.setCurrentOffset}
                      blocked={blocked}
                    />
                  ) : null}
                  <ConversationGroup
                    label={c.currentLabel ? 'Other conversations' : 'Conversations'}
                    items={c.items}
                    total={c.total}
                    offset={c.offset}
                    setOffset={c.setOffset}
                    blocked={blocked}
                  />
                </>
              )}
            </div>
          ) : (
            <>
              {renaming || c.rename ? (
                <form
                  className={styles['conversation-form']}
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!composingRef.current) {
                      setRenaming(false)
                      c.change('rename')
                    }
                  }}
                >
                  <TextInput
                    label="Conversation title"
                    value={c.rename}
                    maxLength={160}
                    readOnly={blocked || c.readOnly}
                    onChange={(e) => c.setRename(e.currentTarget.value)}
                  />
                  <div className={styles['conversation-actions']}>
                    <AppButton type="submit" disabled={blocked || c.readOnly || !c.rename.trim()}>
                      Save title
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={blocked}
                      onClick={() => {
                        setRenaming(false)
                        c.setRename('')
                      }}
                    >
                      Cancel
                    </AppButton>
                  </div>
                </form>
              ) : null}
              <div
                className={styles['conversation-transcript']}
                ref={transcript}
                role="region"
                tabIndex={0}
                aria-label="Conversation transcript"
                onScroll={(e) => {
                  const target = e.currentTarget
                  follow.current = target.scrollHeight - target.clientHeight - target.scrollTop < 48
                  setAway(!follow.current)
                  c.scroll.current.set(key, target.scrollTop)
                }}
              >
                {c.loading ? (
                  <p className={styles['conversation-caption']} role="status">
                    Loading…
                  </p>
                ) : null}
                {c.page?.olderThan !== null && c.page ? (
                  <AppButton
                    variant="subtle"
                    size="compact-sm"
                    disabled={blocked || c.loading}
                    onClick={() => {
                      follow.current = false
                      c.setBefore(c.page!.olderThan)
                    }}
                  >
                    Load earlier messages
                  </AppButton>
                ) : null}
                {c.page?.turns.map((turn) => (
                  <MessageTurn key={turn.attempt.id} turn={turn} />
                ))}
                {c.page && !c.page.turns.length ? (
                  <p className={styles['conversation-empty']}>What would you like to work on?</p>
                ) : null}
              </div>
              {away || c.before !== null ? (
                <AppButton variant="subtle" size="compact-sm" onClick={jump}>
                  <IconArrowDown size={16} aria-hidden="true" /> Jump to latest
                </AppButton>
              ) : null}
              {!archived || c.draft.text ? (
                <form
                  className={styles['chat-composer']}
                  onSubmit={(e) => {
                    e.preventDefault()
                    send()
                  }}
                >
                  <ContextChoice blocked={blocked || c.readOnly || !!archived} />
                  <Textarea
                    ref={composerRef}
                    aria-label="Message"
                    placeholder="Ask about your project…"
                    autosize
                    minRows={2}
                    maxRows={7}
                    value={c.draft.text}
                    maxLength={16000}
                    readOnly={blocked || c.readOnly || archived}
                    onChange={(e) => c.update({ text: e.currentTarget.value })}
                    onKeyDown={(e) => {
                      if (
                        e.key !== 'Enter' ||
                        e.nativeEvent.isComposing ||
                        composingRef.current ||
                        e.keyCode === 229
                      )
                        return
                      if (!e.shiftKey || e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                  />
                  {c.draft.text.length >= 15000 ? (
                    <p className={styles['conversation-caption']}>
                      {16000 - c.draft.text.length} characters remaining
                    </p>
                  ) : null}
                  <div className={styles['composer-controls']}>
                    {catalog?.state === 'loaded' && catalog.models.length ? (
                      <NativeSelect
                        aria-label="Chat model"
                        className={styles['model-picker']}
                        value={catalog.selectedModelId ?? ''}
                        disabled={
                          blocked ||
                          connections.busy ||
                          !connections.status?.actions.selectModel ||
                          connections.issue === 'outcome-unknown'
                        }
                        data={[
                          { value: '', label: 'Choose model', disabled: true },
                          ...catalog.models.map((m) => ({ value: m.id, label: m.label }))
                        ]}
                        onChange={(e) => {
                          const connectionId = connections.status?.activeConnectionId
                          if (connectionId)
                            void connections.selectModel(
                              {
                                connectionId,
                                catalogRevision: catalog.revision,
                                modelId: e.currentTarget.value
                              },
                              e.currentTarget
                            )
                        }}
                      />
                    ) : (
                      <AppButton
                        variant="subtle"
                        size="compact-sm"
                        onClick={(event) => connections.openDialog(event.currentTarget)}
                      >
                        {connections.statusUnavailable
                          ? 'Check ChatGPT status'
                          : connections.status?.connectionHealth.state === 'progress'
                            ? 'Setting up ChatGPT…'
                            : connections.status?.connectionHealth.action === 'connect'
                              ? 'Connect ChatGPT'
                              : connections.status?.connectionHealth.action === 'reconnect'
                                ? 'Reconnect ChatGPT'
                                : 'Manage ChatGPT'}
                      </AppButton>
                    )}
                    {activeTurn ? (
                      <IconButton
                        label="Stop response"
                        disabled={blocked || activeTurn.attempt.state === 'stopping'}
                        onClick={() => c.cancel(activeTurn.attempt.id)}
                      >
                        <IconPlayerStop aria-hidden="true" />
                      </IconButton>
                    ) : (
                      <IconButton
                        type="submit"
                        label={c.busy ? 'Preparing message' : 'Send message'}
                        description="Send message · Enter. Shift+Enter adds a line."
                        pending={c.busy}
                        disabled={!c.canSend || !c.draft.text.trim()}
                      >
                        <IconArrowUp aria-hidden="true" />
                      </IconButton>
                    )}
                  </div>
                  {unavailable && catalog?.state === 'loaded' ? (
                    <AppButton
                      variant="subtle"
                      size="compact-sm"
                      onClick={() => connections.openDialog()}
                    >
                      ChatGPT needs attention
                    </AppButton>
                  ) : null}
                  {connections.issue ? (
                    <p className={styles['conversation-caption']} role="status">
                      {requestReason(connections.issue)}
                    </p>
                  ) : null}
                  {!disclosed ? (
                    <p className={styles['conversation-caption']}>
                      Send shares your message and the selected context with your connected ChatGPT
                      account. Change what’s included in Context.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </>
          )}
        </section>
      )}
    />
  )
}
export function ConversationNotice(): React.JSX.Element | null {
  const c = useConversations()
  const drafts = Object.values(c.drafts).filter((d) => !!d.text).length
  if (!c.scope || (!c.run?.pending && !c.run?.issue && !c.pending && !drafts && !c.rename))
    return null
  return (
    <aside className={styles['conversation-notice']} aria-label="Conversation work">
      <span>
        {c.run?.issue ??
          (c.pending
            ? 'A conversation action needs acknowledgment.'
            : c.run?.pending
              ? 'Protecting conversation work…'
              : drafts
                ? `${drafts} unsent conversation draft${drafts === 1 ? '' : 's'}.`
                : 'A conversation title is unsaved.')}
      </span>
      <AppButton variant="subtle" onClick={() => c.show()}>
        Return to conversations
      </AppButton>
    </aside>
  )
}
