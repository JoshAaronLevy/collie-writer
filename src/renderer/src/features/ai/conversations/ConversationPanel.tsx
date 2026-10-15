import {
  PlanningChatControls,
  PlanningProgress,
  PlanningOrigins
} from '../../planning/PlanningChatControls'
import { planningCoverageLabel } from '../../../../../shared/planning-conversation'
import { ImportedMessageLinks } from '../../imports/ImportedMessageLinks'
import { useImportedLinks } from '../../imports/useImportedLinks'
import { ChatMessage } from './ChatMessage'
import { isResearchCapture } from '../../../../../shared/conversations'
import { sameScope } from '../../../../../shared/project-files'
import { ResearchAnswer } from './ResearchAnswer'
import { ConversationKnowledge } from './ConversationKnowledge'
import { ConversationMemory } from './ConversationMemory'
import {
  IconArrowLeft,
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconPlayerStop,
  IconDots
} from '@tabler/icons-react'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { IconButton } from '../../../components/ui/IconButton'
import { useProofreading } from '../proofreading/proofreadingState'
import PresentationBoundary from '../../../components/PresentationBoundary'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Checkbox, NativeSelect, Popover, TextInput, Textarea } from '@mantine/core'
import { AppButton, SelectField } from '../../../components/ui/Controls'
import { StatusBanner } from '../../../components/ui/Feedback'
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
import { ConversationDraftRecovery } from './ConversationDraftRecovery'
import styles from './Conversations.module.css'
import type { NotePassage } from '../../../../../shared/note-passage'

const activeStates = ['preparing', 'running', 'stopping']
function readingPosition(target: HTMLDivElement): {
  id: string
  offset: number
  node: HTMLElement | null
  nodeOffset: number
} | null {
  const top = target.getBoundingClientRect().top
  const item = [...target.querySelectorAll<HTMLElement>('[data-chat-message]')].find(
    (node) => node.getBoundingClientRect().bottom > top
  )
  if (!item?.dataset.chatMessage) return null
  const node =
    [...item.querySelectorAll<HTMLElement>('[data-chat-start], [data-chat-media]')].find(
      (element) => {
        const rect = element.getBoundingClientRect()
        return rect.bottom > top && rect.top < target.getBoundingClientRect().bottom
      }
    ) ?? null
  return {
    id: item.dataset.chatMessage,
    offset: item.getBoundingClientRect().top - top,
    node,
    nodeOffset: node ? node.getBoundingClientRect().top - top : 0
  }
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
      {isResearchCapture(capture) ? (
        <p>Web search was requested. Shared context could inform search queries.</p>
      ) : null}
      {capture.version === 7 ? (
        <>
          <p>
            {capture.planning.label} ·{' '}
            {planningCoverageLabel(capture.planning.coverage, capture.planning.mode)}
          </p>
          <PlanningOrigins runId={capture.planning.runId} origins={capture.planning.origins} />
        </>
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
function MessageTurn({ turn, now }: { turn: ConversationTurn; now: number }): React.JSX.Element {
  if (
    (turn.capture.version !== 3 &&
      turn.capture.version !== 4 &&
      turn.capture.version !== 6 &&
      turn.capture.version !== 7) ||
    turn.capture.purpose === 'chat'
  )
    return <MessageTurnContent turn={turn} now={now} />
  return (
    <details
      data-chat-message={turn.attempt.id}
      className={styles['conversation-capture']}
      open={['failed', 'unknown', 'cancelled', 'not-sent'].includes(turn.attempt.state)}
    >
      <summary>Context preparation · {turn.attempt.state}</summary>
      <MessageTurnContent turn={turn} now={now} />
    </details>
  )
}
function MessageTurnContent({
  turn,
  now
}: {
  turn: ConversationTurn
  now: number
}): React.JSX.Element {
  const c = useConversations(),
    connections = useAiConnections(),
    [contextOpen, setContextOpen] = useState(false)
  const a = turn.attempt,
    active = activeStates.includes(a.state)
  const actions = [
    {
      id: 'context',
      label: contextOpen ? 'Hide sent context' : 'View sent context',
      onSelect: () => setContextOpen(!contextOpen)
    },
    {
      id: 'reuse',
      label: 'Copy prompt to composer',
      disabled:
        active ||
        c.busy ||
        !!c.pending ||
        c.readOnly ||
        !!c.draft.text ||
        ((turn.capture.version === 3 ||
          turn.capture.version === 4 ||
          turn.capture.version === 6 ||
          turn.capture.version === 7) &&
          turn.capture.purpose !== 'chat') ||
        c.page?.conversation.state !== 'active',
      onSelect: () => c.retryAsNew(turn)
    }
  ]
  return (
    <article
      data-chat-message={
        (turn.capture.version === 3 ||
          turn.capture.version === 4 ||
          turn.capture.version === 6 ||
          turn.capture.version === 7) &&
        turn.capture.purpose !== 'chat'
          ? undefined
          : turn.attempt.id
      }
      className={styles['conversation-turn']}
      aria-label="Conversation exchange"
    >
      <ChatMessage
        role="user"
        text={turn.user.text}
        passageTarget={
          c.page &&
          !(
            (turn.capture.version === 3 ||
              turn.capture.version === 4 ||
              turn.capture.version === 6 ||
              turn.capture.version === 7) &&
            turn.capture.purpose !== 'chat'
          )
            ? {
                conversationId: turn.attempt.conversationId,
                conversationRevisionId: c.page.conversation.revisionId,
                key: {
                  segment: 'native',
                  sequence: turn.user.ordinal,
                  messageId: turn.user.id,
                  messageRevision: turn.user.revisionId
                }
              }
            : undefined
        }
        mediaTarget={
          c.scope
            ? { ...c.scope, messageId: turn.user.id, messageRevision: turn.user.revisionId }
            : undefined
        }
        time={turn.user.createdAt}
        now={now}
        actions={actions}
      />
      {turn.assistant ? <ResearchAnswer turn={turn} now={now} actions={actions} /> : null}
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
      {isResearchCapture(turn.capture) && !active && a.state !== 'completed' ? (
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
      {!items.length ? <p>No {c.view} conversations.</p> : null}
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
          key={`knowledge:${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}:${c.opening}`}
        />
        <ConversationMemory
          key={`${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}:${c.opening}`}
        />
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
  const importedLinks = useImportedLinks(
    c.scope,
    c.imported.page?.entries,
    session.project?.headCommitId
  )
  const [now, setNow] = useState(() => Date.now())
  const transcript = useRef<HTMLDivElement>(null),
    library = useRef<HTMLDivElement>(null),
    messages = useRef<HTMLDivElement>(null),
    returnFocus = useRef(false),
    follow = useRef(true),
    shownKey = useRef(''),
    startedKey = useRef(''),
    revealed = useRef('')
  const anchor = useRef<ReturnType<typeof readingPosition>>(null),
    matchTarget = useRef<{
      key: string
      id: string
      response?: boolean
      passage?: NotePassage
    } | null>(null)
  useEffect(() => {
    if (c.listOpen) return
    const tick = (): void => {
      if (
        document.visibilityState === 'visible' &&
        transcript.current &&
        !transcript.current.closest('[hidden],[inert]')
      )
        setNow(Date.now())
    }
    const first = setTimeout(tick, 0),
      timer = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [c.listOpen, c.opening, session.destination])
  const [away, setAway] = useState(false),
    [renaming, setRenaming] = useState(false),
    [draftsOpen, setDraftsOpen] = useState(false)
  const [disclosed, setDisclosed] = useState(() => {
    try {
      return localStorage.getItem('collie.chat-project-sharing.v1') === 'acknowledged'
    } catch {
      return false
    }
  })
  const key = `${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}:${c.opening}`
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setRenaming(false)
    setAway(false)
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
    if (!target || c.listOpen || target.closest('[hidden],[inert]') || !c.page) return
    if (startedKey.current !== key) {
      startedKey.current = key
      follow.current = true
      anchor.current = null
    }
    const align = (): void => {
      if (
        c.reveal &&
        c.reveal.conversationId === c.selected &&
        c.reveal.requestId !== revealed.current
      ) {
        matchTarget.current = {
          key,
          id:
            c.reveal.target.kind === 'native'
              ? c.reveal.target.attemptId
              : c.reveal.target.key.messageId,
          response: c.reveal.target.kind === 'native',
          passage: c.reveal.passage
        }
        revealed.current = c.reveal.requestId
        follow.current = false
      }
      if (matchTarget.current?.key !== key) matchTarget.current = null
      if (matchTarget.current) {
        const hit = [...target.querySelectorAll<HTMLElement>('[data-chat-message]')].find(
          (node) => node.dataset.chatMessage === matchTarget.current?.id
        )
        if (hit && !c.imported.loading) {
          if (hit instanceof HTMLDetailsElement) hit.open = true
          const response = matchTarget.current.response
            ? hit.querySelector<HTMLElement>('[data-role="assistant"]')
            : null
          const passage = matchTarget.current.passage
          const importedEntry =
            passage?.key.segment === 'imported'
              ? c.imported.page?.entries.find(
                  (entry) => entry.key.messageId === passage.key.messageId
                )
              : null
          if (
            passage &&
            importedEntry &&
            importedEntry.text.length < passage.end &&
            !c.imported.issue
          )
            return
          const original = passage
            ? [...hit.querySelectorAll<HTMLElement>('[data-message-id]')].find(
                (node) => node.dataset.messageId === passage.key.messageId
              )
            : null
          const span =
            passage && original
              ? [
                  ...original.querySelectorAll<HTMLElement>('[data-chat-start][data-chat-end]')
                ].find(
                  (node) =>
                    Number(node.dataset.chatEnd) > passage.start &&
                    Number(node.dataset.chatStart) < passage.end
                )
              : null
          let top = (span ?? original ?? response ?? hit).getBoundingClientRect().top
          if (
            span &&
            passage &&
            span.firstChild?.nodeType === Node.TEXT_NODE &&
            span.textContent?.length ===
              Number(span.dataset.chatEnd) - Number(span.dataset.chatStart)
          ) {
            const range = document.createRange()
            const offset = Math.max(0, passage.start - Number(span.dataset.chatStart))
            range.setStart(span.firstChild, offset)
            range.setEnd(span.firstChild, Math.min(offset + 1, span.textContent.length))
            top = range.getBoundingClientRect().top
          }
          target.scrollTop += top - target.getBoundingClientRect().top
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
        if (c.loading || c.imported.loading || matchTarget.current) return
        shownKey.current = key
      }
      if (follow.current && c.before === null && !c.imported.page?.after)
        target.scrollTop = target.scrollHeight
      else if (anchor.current) {
        const item = [...target.querySelectorAll<HTMLElement>('[data-chat-message]')].find(
          (node) => node.dataset.chatMessage === anchor.current?.id
        )
        if (item) {
          const saved = anchor.current
          const node = saved.node?.isConnected && item.contains(saved.node) ? saved.node : null
          target.scrollTop +=
            (node ?? item).getBoundingClientRect().top -
            target.getBoundingClientRect().top -
            (node ? saved.nodeOffset : saved.offset)
        }
      }
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(target)
    if (messages.current) observer.observe(messages.current)
    return () => observer.disconnect()
  }, [
    key,
    c.page,
    c.imported.page,
    c.imported.loading,
    c.imported.issue,
    c.listOpen,
    c.before,
    c.loading,
    c.reveal,
    c.selected
  ])
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
    c.latest()
  }
  return (
    <PresentationBoundary
      label="Conversations"
      render={() => (
        <section
          className={styles['conversation-panel']}
          data-conversation-panel
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
            {session.destination.kind === 'workspace' && session.destination.view === 'write' ? (
              <ActionMenu
                label="Help me write"
                accessibleLabel="Writing help"
                disabled={blocked || c.readOnly || c.active || !c.draftProtection.ready}
                actions={[
                  {
                    id: 'start-writing',
                    label: 'Help me start',
                    onSelect: () => {
                      void c.beginWriting(
                        'Help me start this chapter with a short opening passage.'
                      )
                    }
                  },
                  {
                    id: 'continue-writing',
                    label: 'Continue here',
                    onSelect: () => {
                      void c.beginWriting(
                        'Continue the writing at this position with a short passage.'
                      )
                    }
                  },
                  {
                    id: 'connect-writing',
                    label: 'Connect these points',
                    onSelect: () => {
                      void c.beginWriting(
                        'Write a connecting paragraph between the points in the nearby writing. If text is selected, draft a replacement for that selection.'
                      )
                    }
                  }
                ]}
              />
            ) : null}

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
                ...(c.listOpen
                  ? [
                      {
                        id: 'history',
                        label:
                          c.view === 'active' ? 'Archived conversations' : 'Active conversations',
                        onSelect: () => c.setView(c.view === 'active' ? 'archived' : 'active')
                      }
                    ]
                  : []),
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
          <PlanningProgress />
          {c.preparingMemory ? (
            <div className={styles['conversation-actions']} role="status">
              <span>{c.planning ? 'Analyzing material…' : 'Preparing context…'}</span>
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
          {c.notice ? (
            <p className={styles['conversation-caption']} role="status">
              {c.notice}
            </p>
          ) : null}
          {c.passages.issue ? (
            <p role="alert" className={styles['conversation-error']}>
              {c.passages.issue}
            </p>
          ) : null}
          {c.passages.pending ? (
            <AppButton
              disabled={c.passages.busy || c.passages.unavailable}
              onClick={() => void c.passages.keep()}
            >
              {c.passages.busy ? 'Keeping passage…' : 'Retry passage save'}
            </AppButton>
          ) : null}
          {c.passages.saved ? (
            <div role="status" className={styles['conversation-caption']}>
              Passage kept in Plan.{' '}
              <AppButton
                variant="subtle"
                size="compact-sm"
                onClick={() =>
                  session.research({ kind: 'notes', noteId: c.passages.saved!.noteId })
                }
              >
                Open note
              </AppButton>
              <AppButton
                variant="subtle"
                size="compact-sm"
                onClick={() => {
                  if (c.scope)
                    void session.navigate({
                      kind: 'workspace',
                      scope: c.scope,
                      view: 'plan',
                      material: { kind: 'note', id: c.passages.saved!.noteId }
                    })
                }}
              >
                Open in Plan
              </AppButton>
            </div>
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
                  follow.current =
                    c.before === null &&
                    !c.imported.page?.after &&
                    target.scrollHeight - target.clientHeight - target.scrollTop < 48
                  setAway(!follow.current)
                  anchor.current = readingPosition(target)
                }}
              >
                <div ref={messages} className={styles['conversation-messages']}>
                  {c.loading ? (
                    <p className={styles['conversation-caption']} role="status">
                      Loading…
                    </p>
                  ) : null}
                  {c.page && (c.page.olderThan !== null || c.imported.page?.before) ? (
                    <AppButton
                      variant="subtle"
                      size="compact-sm"
                      disabled={blocked || c.loading || c.imported.loading}
                      onClick={() => {
                        follow.current = false
                        if (transcript.current) anchor.current = readingPosition(transcript.current)
                        if (c.page?.olderThan !== null) void c.loadOlder()
                        else c.imported.older()
                      }}
                    >
                      Load earlier messages
                    </AppButton>
                  ) : null}
                  {c.scope
                    ? c.imported.page?.entries.map((entry) => (
                        <article
                          key={entry.key.messageId}
                          data-chat-message={entry.key.messageId}
                          className={styles['conversation-turn']}
                          aria-label={`Imported message from ${entry.role}`}
                        >
                          <ImportedMessageLinks
                            entry={entry}
                            conversation={c.page?.conversation}
                            scope={c.scope!}
                            value={importedLinks.values[entry.key.messageId]}
                            now={now}
                            retry={importedLinks.retry}
                            textIssue={!!c.imported.issue}
                          />
                        </article>
                      ))
                    : null}
                  {c.imported.loading && !c.imported.page ? (
                    <p role="status">Loading messages…</p>
                  ) : null}
                  {c.imported.issue ? (
                    <div role="status">
                      <p>{c.imported.issue}</p>
                      <AppButton
                        variant="subtle"
                        onClick={c.imported.retry}
                        disabled={c.imported.loading}
                      >
                        Retry loading messages
                      </AppButton>
                    </div>
                  ) : null}
                  {c.imported.page?.after ? (
                    <AppButton
                      variant="subtle"
                      size="compact-sm"
                      disabled={c.imported.loading}
                      onClick={() => {
                        follow.current = false
                        if (transcript.current) anchor.current = readingPosition(transcript.current)
                        c.imported.newer()
                      }}
                    >
                      Load later messages
                    </AppButton>
                  ) : (
                    c.page?.turns.map((turn) => (
                      <MessageTurn key={turn.attempt.id} turn={turn} now={now} />
                    ))
                  )}
                  {c.page && !c.page.external && !c.page.turns.length ? (
                    <p className={styles['conversation-empty']}>What would you like to work on?</p>
                  ) : null}
                </div>
              </div>
              {away || c.before !== null || c.imported.page?.after ? (
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
                    {c.planning ? (
                      <PlanningChatControls
                        blocked={blocked || c.readOnly || !!archived || !c.draftProtection.ready}
                      />
                    ) : (
                      <ContextChoice
                        blocked={blocked || c.readOnly || !!archived || !c.draftProtection.ready}
                      />
                    )}
                    {session.destination.kind === 'workspace' &&
                    session.destination.view === 'write' ? (
                      <Checkbox
                        label="Preview for insertion"
                        checked={c.planning?.version === 3}
                        disabled={blocked || c.readOnly || !!archived || !c.draftProtection.ready}
                        onChange={(e) => c.setWriting(e.currentTarget.checked)}
                      />
                    ) : null}
                    <Checkbox
                      label="Search the web"
                      checked={c.searchWeb}
                      disabled={blocked || c.readOnly || !!archived || !!stopId}
                      onChange={(event) => c.setSearchWeb(event.currentTarget.checked)}
                      description={
                        c.searchWeb &&
                        connections.status?.capabilities.webResearch.state !== 'available'
                          ? connections.status?.capabilities.webResearch.reason ===
                            'route-not-established'
                            ? 'Web search is unavailable for this connection. Uncheck to send a text-only message.'
                            : c.capability?.state === 'unavailable'
                              ? connectionReason[c.capability.reason]
                              : 'Checking web-search availability. You can uncheck to use text chat when available.'
                          : undefined
                      }
                    />
                  </div>
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
                  {/* {!disclosed ? (
                    <p className={styles['conversation-caption']}>
                      Send shares your message and relevant writing, research and active chats from
                      this project with your ChatGPT account. Long context may need up to two extra
                      AI requests to prepare memory. Inspect or edit it in Context.
                    </p>
                  ) : null} */}
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
  const connections = useAiConnections()
  const workShown = connections.status?.work.some(
    (item) =>
      item.feature === 'conversation' &&
      sameScope(item.scope, c.scope) &&
      item.attemptId === c.run?.attemptId
  )
  if (
    !c.scope ||
    (!c.issue &&
      (workShown || (!c.run?.pending && !c.run?.issue)) &&
      !c.pending &&
      !c.draftProtection.issue &&
      !c.memoryEdit &&
      !c.rename)
  )
    return null
  return (
    <aside
      className={styles['conversation-notice']}
      aria-label="Conversation work"
      data-conversation-notice-covered={
        !c.pending &&
        !c.memoryEdit &&
        !c.rename &&
        (workShown || (!c.run?.pending && !c.run?.issue))
      }
    >
      <StatusBanner
        title="Conversation"
        tone={c.issue || c.draftProtection.issue || (!workShown && c.run?.issue) ? 'error' : 'info'}
      >
        <p>
          {(c.issue || null) ??
            (!workShown ? c.run?.issue : null) ??
            (c.draftProtection.issue || null) ??
            (c.pending
              ? 'A conversation action needs acknowledgment.'
              : c.run?.pending && !workShown
                ? 'Protecting conversation work…'
                : c.memoryEdit
                  ? 'A memory edit is unsaved. Open Context → Memory to save or cancel it.'
                  : 'A conversation title is unsaved.')}
        </p>
        <AppButton variant="subtle" onClick={() => c.show()}>
          Return to conversations
        </AppButton>
      </StatusBanner>
    </aside>
  )
}
