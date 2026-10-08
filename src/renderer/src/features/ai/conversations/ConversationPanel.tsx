import { sameScope } from '../../../../../shared/project-files'
import { ResearchAnswer } from './ResearchAnswer'
import { ConversationKnowledge, ConversationReferences } from './ConversationKnowledge'
import { ConversationMemory } from './ConversationMemory'
import {
  IconArrowLeft,
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconPlayerStop,
  IconCopy,
  IconDots,
  IconWorld
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
import type {
  AiCapture,
  ConversationSummary,
  ConversationTurn
} from '../../../../../shared/conversations'
import {
  readContextHistory,
  type ConversationContextPolicy
} from '../../../../../shared/conversation-context'
import { useConversations } from './conversationState'
import { ConversationFind } from './ConversationFind'
import { ConversationDraftRecovery } from './ConversationDraftRecovery'
import styles from './Conversations.module.css'

const activeStates = ['preparing', 'running', 'stopping']
function readingPosition(target: HTMLDivElement): { id: string; offset: number } | null {
  const top = target.getBoundingClientRect().top
  const item = [...target.querySelectorAll<HTMLElement>('[data-attempt]')].find(
    (node) => node.getBoundingClientRect().bottom > top
  )
  return item?.dataset.attempt
    ? { id: item.dataset.attempt, offset: item.getBoundingClientRect().top - top }
    : null
}
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
  const history = capture.version >= 2 ? readContextHistory(capture.context) : null
  return (
    <div className={styles['conversation-capture']}>
      <p className={styles['conversation-caption']}>
        Captured {new Date(capture.createdAt).toLocaleString()}. This snapshot stays unchanged.
      </p>
      {capture.version === 5 ? (
        <p>Web search was requested. Shared context could inform search queries.</p>
      ) : null}
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
  if ((turn.capture.version !== 3 && turn.capture.version !== 4) || turn.capture.purpose === 'chat')
    return <MessageTurnContent turn={turn} />
  return (
    <details
      data-attempt={turn.attempt.id}
      className={styles['conversation-capture']}
      open={['failed', 'unknown', 'cancelled', 'not-sent'].includes(turn.attempt.state)}
    >
      <summary>Context preparation · {turn.attempt.state}</summary>
      <MessageTurnContent turn={turn} />
    </details>
  )
}
function MessageTurnContent({ turn }: { turn: ConversationTurn }): React.JSX.Element {
  const c = useConversations(),
    connections = useAiConnections(),
    [contextOpen, setContextOpen] = useState(false),
    [copyNotice, setCopyNotice] = useState('')
  const a = turn.attempt,
    active = activeStates.includes(a.state)
  return (
    <article
      data-attempt={turn.attempt.id}
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
          <ResearchAnswer key={turn.assistant.revisionId} turn={turn} />
        </div>
      ) : null}
      {a.state === 'completed' && turn.assistant ? (
        <ConversationReferences key={turn.assistant.revisionId} turn={turn} />
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
      {turn.capture.version === 5 && !active && a.state !== 'completed' ? (
        <AppButton
          variant="subtle"
          size="compact-sm"
          disabled={
            c.busy ||
            !!c.pending ||
            c.readOnly ||
            !!c.draft.text ||
            c.page?.conversation.state !== 'active'
          }
          onClick={() => c.retryAsNew(turn, true)}
        >
          Try without web search
        </AppButton>
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
                .catch(() => setCopyNotice('Could not copy. Select the text to copy it manually.'))
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
              label: contextOpen ? 'Hide message context' : 'View message context',
              onSelect: () => setContextOpen(!contextOpen)
            },
            {
              id: 'reuse',
              label: 'Copy prompt to composer',
              disabled:
                active ||
                c.readOnly ||
                !!c.draft.text ||
                ((turn.capture.version === 3 || turn.capture.version === 4) &&
                  turn.capture.purpose !== 'chat') ||
                c.page?.conversation.state !== 'active',
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
  items: ConversationSummary[]
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
              data-conversation-id={item.id}
              onClick={() => c.choose(item.id)}
            >
              {item.title}
            </AppButton>
            <span>
              {new Date(item.updatedAt).toLocaleDateString()}
              {c.drafts[item.id]?.text ? ' · Unsent draft' : ''}
            </span>
            {item.preview ? (
              <p className={styles['recent-preview']}>
                {item.previewRole === 'assistant' ? 'Assistant' : 'You'}: {item.preview}
              </p>
            ) : null}
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
            ? `Completed exchanges in this chat, current writing (${project?.documents.find((d) => d.id === project.documentId)?.title || 'none'}), and a relevant selection of manuscript, research and prior active chats.`
            : c.draft.contextPolicy === 'chat'
              ? 'Completed exchanges in this chat. Project writing is excluded.'
              : 'Only your next message. Earlier messages and project writing are excluded.'}
        </p>
        <p>
          Selection is bounded; it does not imply every page was read. Archived chats, unsent
          drafts, failed and stopped attempts are excluded from automatic recall.
        </p>
        <p>View the exact snapshot from each message’s menu.</p>
        <ConversationKnowledge
          key={`knowledge:${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}`}
        />
        <ConversationMemory key={`${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}`} />
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
    library = useRef<HTMLDivElement>(null),
    returnFocus = useRef(false),
    follow = useRef(true),
    shownKey = useRef(''),
    revealed = useRef('')
  const anchor = useRef<{ id: string; offset: number } | null>(null),
    matchTarget = useRef<{ key: string; id: string } | null>(null)
  const [away, setAway] = useState(false),
    [renaming, setRenaming] = useState(false),
    [findOpen, setFindOpen] = useState(false),
    [draftsOpen, setDraftsOpen] = useState(false)
  const [disclosed, setDisclosed] = useState(() => {
    try {
      return localStorage.getItem('collie.chat-project-sharing.v1') === 'acknowledged'
    } catch {
      return false
    }
  })
  const key = `${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}`
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setRenaming(false)
    setAway(false)
    setFindOpen(false)
    setDraftsOpen(false)
  }
  useLayoutEffect(() => {
    if (!c.listOpen || !returnFocus.current) return
    returnFocus.current = false
    const target = library.current
    if (
      !target ||
      target.closest('[hidden],[inert]') ||
      composingRef.current ||
      session.closing ||
      session.navigating ||
      !document.hasFocus() ||
      document.visibilityState !== 'visible' ||
      document.querySelector('[role="dialog"], [role="alertdialog"]') ||
      document.activeElement !== document.body
    )
      return
    const selected = [...target.querySelectorAll<HTMLButtonElement>('[data-conversation-id]')].find(
      (button) => button.dataset.conversationId === c.selected
    )
    ;(selected ?? target).focus({ preventScroll: true })
  }, [c.listOpen, c.selected, composingRef, session.closing, session.navigating])
  useLayoutEffect(() => {
    const target = transcript.current
    if (!target || c.listOpen || target.closest('[hidden],[inert]')) return
    if (
      c.reveal &&
      c.reveal.conversationId === c.selected &&
      c.reveal.requestId !== revealed.current
    ) {
      matchTarget.current = { key, id: c.reveal.attemptId }
      revealed.current = c.reveal.requestId
      follow.current = false
    }
    if (matchTarget.current?.key !== key) matchTarget.current = null
    if (matchTarget.current) {
      const hit = [...target.querySelectorAll<HTMLElement>('[data-attempt]')].find(
        (node) => node.dataset.attempt === matchTarget.current?.id
      )
      if (hit) {
        target.scrollTop += hit.getBoundingClientRect().top - target.getBoundingClientRect().top
        matchTarget.current = null
        follow.current = false
        anchor.current = readingPosition(target)
        if (
          document.hasFocus() &&
          document.visibilityState === 'visible' &&
          !document.querySelector('[role="dialog"], [role="alertdialog"]') &&
          (document.activeElement === document.body || document.activeElement === target)
        )
          target.focus({ preventScroll: true })
        shownKey.current = key
        return
      }
    }
    if (shownKey.current !== key) {
      shownKey.current = key
      const saved = c.scroll.current.get(key)
      target.scrollTop = saved ?? (c.before === null ? target.scrollHeight : 0)
      follow.current = target.scrollHeight - target.clientHeight - target.scrollTop < 48
      anchor.current = readingPosition(target)
    } else if (follow.current && c.before === null) target.scrollTop = target.scrollHeight
    else if (anchor.current) {
      const item = [...target.querySelectorAll<HTMLElement>('[data-attempt]')].find(
        (node) => node.dataset.attempt === anchor.current?.id
      )
      if (item)
        target.scrollTop +=
          item.getBoundingClientRect().top -
          target.getBoundingClientRect().top -
          anchor.current.offset
    }
  }, [key, c.page, c.listOpen, c.scroll, c.before, c.loading, c.reveal, c.selected])
  const blocked = c.busy || !!c.pending || session.closing || session.navigating,
    archived = c.page?.conversation.state === 'archived',
    catalog = connections.status?.catalog,
    activeTurn = c.page?.turns.find((t) => activeStates.includes(t.attempt.state)),
    runningWork = connections.status?.work.find(
      (w) =>
        w.feature === 'conversation' &&
        sameScope(w.scope, c.scope) &&
        ['running', 'stopping'].includes(w.state)
    ),
    needsRecovery =
      !!c.issue ||
      !!c.run?.issue ||
      !!connections.status?.work.some(
        (w) =>
          w.feature === 'conversation' &&
          sameScope(w.scope, c.scope) &&
          !['running', 'stopping'].includes(w.state)
      ),
    stopId = activeTurn?.attempt.id ?? runningWork?.attemptId,
    stopping = activeTurn?.attempt.state === 'stopping' || runningWork?.state === 'stopping',
    unavailable =
      c.capability?.state !== 'available' && !c.active && !c.busy && !c.run?.pending && !runningWork
  const send = (): void => {
    if (!c.canSend || !c.draft.text.trim() || composingRef.current) return
    if (!disclosed) {
      try {
        localStorage.setItem('collie.chat-project-sharing.v1', 'acknowledged')
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
    matchTarget.current = null
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
                onClick={() => {
                  if (!c.rename && !composingRef.current) returnFocus.current = true
                  c.backToList()
                }}
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
                ...(c.references.draft
                  ? [
                      {
                        id: 'reference-review',
                        label: c.references.pending
                          ? 'Review pending source save'
                          : 'Resume reference review',
                        onSelect: c.references.resume
                      }
                    ]
                  : []),
                ...(!c.listOpen && c.page
                  ? [
                      {
                        id: 'find',
                        label: 'Find in this chat',
                        onSelect: () => {
                          setDraftsOpen(false)
                          setFindOpen((open) => !open)
                        }
                      },
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
                  id: 'drafts',
                  label: 'Saved drafts on this device',
                  onSelect: () => {
                    setFindOpen(false)
                    setDraftsOpen((open) => !open)
                  }
                },
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
                ...(needsRecovery
                  ? [{ id: 'recovery', label: 'Retry local recovery', onSelect: c.recover }]
                  : [])
              ]}
            />
          </header>
          {c.preparingMemory ? (
            <div className={styles['conversation-actions']} role="status">
              <span>Preparing context…</span>
              <AppButton size="compact-sm" variant="subtle" onClick={c.stopPreparation}>
                Stop
              </AppButton>
            </div>
          ) : null}
          {c.issue ? (
            <p className={styles['conversation-error']} role="alert">
              {c.issue}
            </p>
          ) : null}
          {!c.draftProtection.ready && !c.draftProtection.issue ? (
            <p role="status" className={styles['conversation-caption']}>
              Restoring chat drafts…
            </p>
          ) : null}
          {c.draftProtection.issue ? (
            <div role="alert" className={styles['conversation-error']}>
              <p>{c.draftProtection.issue}</p>
              <AppButton variant="subtle" size="compact-sm" onClick={c.draftProtection.retry}>
                Retry draft protection
              </AppButton>
              <AppButton
                variant="subtle"
                size="compact-sm"
                onClick={() => {
                  setFindOpen(false)
                  setDraftsOpen(true)
                }}
              >
                Review drafts
              </AppButton>
            </div>
          ) : null}
          {draftsOpen ? (
            <details
              open
              className={styles['chat-tools']}
              onToggle={(e) => {
                if (!e.currentTarget.open) setDraftsOpen(false)
              }}
            >
              <summary>Saved drafts on this device</summary>
              <ConversationDraftRecovery />
            </details>
          ) : null}
          {findOpen && c.scope && c.selected && !c.listOpen ? (
            <ConversationFind
              key={key}
              scope={c.scope}
              conversationId={c.selected}
              onClose={() => {
                setFindOpen(false)
                transcript.current?.focus({ preventScroll: true })
              }}
              onSelect={(hit) => {
                if (composingRef.current || blocked) return
                matchTarget.current = { key, id: hit.attemptId }
                follow.current = false
                setAway(true)
                setFindOpen(false)
                c.openMatch(hit)
              }}
            />
          ) : null}
          {c.notice ? (
            <p className={styles['conversation-caption']} role="status">
              {c.notice}
            </p>
          ) : null}
          {c.pending && !c.busy ? (
            <AppButton disabled={c.busy} onClick={c.retry}>
              Retry saved action
            </AppButton>
          ) : null}
          {c.readOnly ? (
            <p className={styles['conversation-caption']}>
              This project is read-only. Saved chats and export remain available.
            </p>
          ) : null}
          {c.listOpen ? (
            <div
              ref={library}
              tabIndex={-1}
              role="region"
              aria-label="Conversation list"
              className={styles['conversation-library-scroll']}
            >
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
                  {Object.keys(c.drafts).length ? (
                    <details className={styles['conversation-library']}>
                      <summary>Saved drafts ({Object.keys(c.drafts).length})</summary>
                      <ConversationDraftRecovery />
                    </details>
                  ) : null}
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
                  if (c.scroll.current.size > 128) {
                    const oldest = c.scroll.current.keys().next().value
                    if (oldest) c.scroll.current.delete(oldest)
                  }
                  anchor.current = readingPosition(target)
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
                      if (transcript.current) anchor.current = readingPosition(transcript.current)
                      void c.loadOlder()
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
              {runningWork && !activeTurn ? (
                <div className={styles['conversation-actions']} role="status">
                  <span>
                    {stopping ? 'Stopping response…' : 'A response is running in this project.'}
                  </span>
                  <AppButton
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => c.show(runningWork.attemptId)}
                  >
                    Open response
                  </AppButton>
                  <AppButton
                    variant="subtle"
                    size="compact-sm"
                    disabled={blocked || stopping}
                    onClick={() => c.cancel(runningWork.attemptId)}
                  >
                    Stop
                  </AppButton>
                </div>
              ) : null}
              {!archived || c.draft.text ? (
                <form
                  className={styles['chat-composer']}
                  onSubmit={(e) => {
                    e.preventDefault()
                    send()
                  }}
                >
                  <div className={styles['context-controls']}>
                    <ContextChoice
                      blocked={blocked || c.readOnly || !!archived || !c.draftProtection.ready}
                    />
                    {connections.status?.capabilities.binding.route === 'local-chatgpt-plan' ? (
                      <AppButton
                        className={styles['research-choice']}
                        variant="subtle"
                        size="compact-sm"
                        aria-pressed={c.searchWeb}
                        disabled={
                          blocked ||
                          c.readOnly ||
                          !!archived ||
                          !!stopId ||
                          (!c.searchWeb &&
                            connections.status.capabilities.webResearch.state !== 'available')
                        }
                        onClick={() => c.setSearchWeb(!c.searchWeb)}
                      >
                        <IconWorld size={16} aria-hidden="true" /> Search the web
                      </AppButton>
                    ) : null}
                  </div>
                  {c.searchWeb ? (
                    <p className={styles['conversation-caption']}>
                      Shared context may inform ChatGPT’s search queries.
                    </p>
                  ) : null}
                  <Textarea
                    ref={composerRef}
                    aria-label="Message"
                    placeholder="Ask about your project…"
                    autosize
                    minRows={2}
                    maxRows={7}
                    value={c.draft.text}
                    maxLength={16000}
                    readOnly={blocked || c.readOnly || archived || !c.draftProtection.ready}
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
                      Send shares your message and relevant writing, research and active chats from
                      this project with your ChatGPT account. Long context may need up to two extra
                      AI requests to prepare memory. Inspect or edit it in Context.
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
  if (
    !c.scope ||
    (!c.run?.pending &&
      !c.run?.issue &&
      !c.pending &&
      !c.draftProtection.issue &&
      !c.memoryEdit &&
      !c.rename)
  )
    return null
  return (
    <aside className={styles['conversation-notice']} aria-label="Conversation work">
      <span>
        {c.run?.issue ??
          (c.draftProtection.issue || null) ??
          (c.pending
            ? 'A conversation action needs acknowledgment.'
            : c.run?.pending
              ? 'Protecting conversation work…'
              : c.memoryEdit
                ? 'A memory edit is unsaved. Open Context → Memory to save or cancel it.'
                : 'A conversation title is unsaved.')}
      </span>
      <AppButton variant="subtle" onClick={() => c.show()}>
        Return to conversations
      </AppButton>
    </aside>
  )
}
