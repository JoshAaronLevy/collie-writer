import { IconDots } from '@tabler/icons-react'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { useProofreading } from '../proofreading/proofreadingState'
import PresentationBoundary from '../../../components/PresentationBoundary'
import { useLayoutEffect, useRef, useState } from 'react'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton, ChoiceField, SelectField } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useAiConnections } from '../../ai-connections/connectionState'
import { AiRequestConnection } from '../../ai-connections/AiRequestConnection'
import { connectionReason, featureDescription } from '../../ai-connections/connection-copy'
import type { AiReason } from '../../../../../shared/ai'
import type { Conversation, ConversationTurn } from '../../../../../shared/conversations'
import { useConversations } from './conversationState'
import styles from './Conversations.module.css'

const outcomes = {
  'not-sent': 'Not sent',
  preparing: 'Preparing',
  running: 'Responding',
  stopping: 'Stop requested',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  unknown: 'Interrupted · outcome unknown'
}
function requestReason(reason: AiReason): string {
  if (reason === 'auth-failed' || reason === 'session-expired' || reason === 'signed-out')
    return 'The provider could not authorize this request. Open Manage ChatGPT and renew or reconnect your account. A further request needs a new review; this one will not resend.'
  if (reason === 'model-unavailable')
    return 'The provider refused the selected model. Choose an available model in Manage ChatGPT before reviewing a new request. No model was substituted.'
  if (reason === 'invalid-request')
    return 'The provider could not accept this request. Narrow the prompt or context and review a new request. This attempt is retained and will not resend.'
  if (reason === 'storage-unavailable')
    return 'The request or output needs local protection. Keep Collie open and use Retry local protection. This action saves the same retained work without sending again.'
  if (reason === 'outcome-unknown')
    return 'The outcome is uncertain. Any retained text is shown. A missing local execution record or an independent project copy cannot resume the original request. Reopening never resends it; a new reviewed request may consume additional usage.'
  if (reason === 'cancelled')
    return 'The provider reported cancellation. Any actual partial response remains here; cancellation does not confirm restored usage.'
  return connectionReason[reason]
}
function MessageTurn({ turn }: { turn: ConversationTurn }): React.JSX.Element {
  const c = useConversations()
  const a = turn.attempt,
    active = ['preparing', 'running', 'stopping'].includes(a.state),
    messages = turn.assistant ? [turn.user, turn.assistant] : [turn.user]
  return (
    <article
      className={styles['conversation-turn']}
      aria-label={`Request from ${new Date(turn.user.createdAt).toLocaleString()}`}
    >
      {messages.map((m) => (
        <div className={styles['conversation-message']} data-role={m.role} key={m.id}>
          <p className={styles['conversation-message-heading']}>
            {m.role === 'user' ? 'You' : 'Assistant'}{' '}
            <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time>
          </p>
          <div className={styles['conversation-message-text']}>{m.text}</div>
          {c.page?.conversation.state === 'active' ? (
            <ChoiceField
              label={`Include this ${m.role === 'user' ? 'user' : 'assistant'} message in the next request`}
              checked={c.draft.historyIds.includes(m.id)}
              disabled={c.readOnly || c.busy || !!c.pending || active || a.state === 'unknown'}
              onChange={(e) => c.history(m.id, e.currentTarget.checked)}
            />
          ) : null}
        </div>
      ))}
      <p className={styles['conversation-outcome']} role={active ? 'status' : undefined}>
        {outcomes[a.state]}
        {a.model
          ? ` · ${a.provider === 'openai-codex' ? 'Codex · ' : a.provider === 'openai-chatgpt-plan' ? 'ChatGPT plan · ' : ''}${a.model}`
          : ''}
      </p>
      {a.reason ? (
        <p className={styles['conversation-caption']}>
          {a.reason === 'busy'
            ? `The provider is busy or its ${c.capacity}-operation retained journal is full. Nothing will be retried automatically.`
            : requestReason(a.reason)}
        </p>
      ) : null}
      {a.state === 'not-sent' ? (
        <p className={styles['conversation-caption']}>
          Saved locally. Nothing was queued for later sending.
        </p>
      ) : null}
      {a.state === 'stopping' ? (
        <p className={styles['conversation-caption']}>
          Waiting for the provider’s outcome. A stop request does not confirm cancellation or
          restored usage.
        </p>
      ) : null}
      <div className={styles['conversation-actions']}>
        {active ? (
          <AppButton
            variant="default"
            disabled={c.busy || !!c.pending || a.state === 'stopping'}
            onClick={() => c.cancel(a.id)}
          >
            Stop response
          </AppButton>
        ) : (
          <AppButton
            variant="subtle"
            disabled={
              c.busy ||
              !!c.pending ||
              c.readOnly ||
              !!c.draft.text ||
              c.page?.conversation.state !== 'active'
            }
            onClick={() => c.retryAsNew(turn)}
          >
            Use prompt in a new request
          </AppButton>
        )}
        {a.provider || (c.run?.issue && c.run.attemptId === a.id) ? (
          <AppButton
            variant="subtle"
            disabled={c.busy || !!c.pending}
            onClick={() => c.protect(a.id)}
          >
            Retry local protection
          </AppButton>
        ) : null}
      </div>
      <details className={styles['conversation-capture']}>
        <summary>Reviewed request context</summary>
        <p className={styles['conversation-caption']}>
          {turn.capture.template} · {new Date(turn.capture.createdAt).toLocaleString()}
        </p>
        {turn.capture.context.length ? (
          turn.capture.context.map((item, i) => (
            <div key={i}>
              <h4>
                {item.label || 'Untitled section'} · {item.kind}
              </h4>
              <div className={styles['conversation-message-text']}>{item.text}</div>
            </div>
          ))
        ) : (
          <p>No attached writing or prior messages.</p>
        )}
        <p className={styles['conversation-digest']}>Capture digest: {turn.capture.digest}</p>
      </details>
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
export function ConversationPanel(): React.JSX.Element {
  const c = useConversations()
  const { composerRef, composingRef } = c,
    session = useWorkspaceSession(),
    connections = useAiConnections(),
    transcript = useRef<HTMLDivElement>(null)
  const proofreading = useProofreading()
  const [renaming, setRenaming] = useState(false)
  const [expandedReview, setExpandedReview] = useState(true)
  const renameKey = `${c.scope?.projectId}:${c.scope?.workspaceId}:${c.selected}`
  const [lastRenameKey, setLastRenameKey] = useState(renameKey)
  if (lastRenameKey !== renameKey) {
    setLastRenameKey(renameKey)
    setRenaming(false)
  }
  const key = `${c.selected ?? 'none'}:${c.before ?? 'latest'}`
  useLayoutEffect(() => {
    if (transcript.current) transcript.current.scrollTop = c.scroll.current.get(key) ?? 0
  }, [key, c.page?.conversation.id, c.scroll])
  const blocked = c.busy || !!c.pending || session.closing || session.navigating,
    archived = c.page?.conversation.state === 'archived',
    review = c.draft.review
  return (
    <PresentationBoundary
      label="Conversations"
      render={() => (
        <section
          className={styles['conversation-panel']}
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
          <div className={styles['conversation-actions']}>
            <AppButton disabled={c.readOnly || blocked} onClick={() => c.change('create')}>
              New chat
            </AppButton>
            <ActionMenu
              label="Conversations"
              accessibleLabel="Conversation options"
              icon={<IconDots aria-hidden="true" />}
              disabled={blocked}
              actions={[
                {
                  id: 'account',
                  label: 'Manage ChatGPT',
                  onSelect: () => connections.openDialog()
                },
                { id: 'list', label: 'Find conversations', onSelect: c.backToList },
                { id: 'recovery', label: 'Retry local recovery', onSelect: c.recover }
              ]}
            />
          </div>
          {proofreading.total ||
          proofreading.issue ||
          proofreading.bundle ||
          proofreading.reviewed ||
          proofreading.pending ||
          proofreading.event?.pending ||
          proofreading.event?.issue ||
          proofreading.proofreadingLocked ? (
            <AppButton variant="subtle" onClick={() => proofreading.show()}>
              Saved proofreading reviews
            </AppButton>
          ) : null}
          {c.listOpen ? (
            <>
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
            </>
          ) : (
            <AppButton variant="subtle" onClick={c.backToList}>
              Back to conversations
            </AppButton>
          )}
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
            <p>
              History and export remain available. Protect or copy any unsent input before changing
              access. New conversations and requests require an editable project.
            </p>
          ) : null}
          {!c.listOpen && c.loading ? <p role="status">Loading conversation…</p> : null}
          {!c.listOpen && c.page ? (
            <>
              <header className={styles['conversation-heading']}>
                <h3>
                  {c.page.conversation.title}
                  {archived ? ' · Archived' : ''}
                </h3>
                <ActionMenu
                  key={c.page.conversation.id}
                  label="Chat actions"
                  accessibleLabel={`Actions for ${c.page.conversation.title}`}
                  icon={<IconDots aria-hidden="true" />}
                  disabled={blocked}
                  actions={[
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
                      label: 'Export with reviewed context…',
                      disabled: c.active,
                      onSelect: () => c.exportTranscript(true)
                    }
                  ]}
                />
              </header>
              {renaming || c.rename ? (
                <form
                  className={styles['conversation-form']}
                  onSubmit={(e) => {
                    e.preventDefault()
                    setRenaming(false)
                    c.change('rename')
                  }}
                >
                  <TextInput
                    label="Rename conversation"
                    value={c.rename}
                    maxLength={160}
                    readOnly={c.readOnly || blocked}
                    onChange={(e) => c.setRename(e.currentTarget.value)}
                  />
                  <div className={styles['conversation-actions']}>
                    <AppButton type="submit" disabled={c.readOnly || blocked || !c.rename.trim()}>
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
                      Done renaming
                    </AppButton>
                  </div>
                </form>
              ) : null}
              <div className={styles['conversation-actions']}>
                <AppButton
                  variant="subtle"
                  disabled={blocked || c.page.olderThan === null}
                  onClick={() => c.setBefore(c.page!.olderThan)}
                >
                  Earlier requests
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={blocked || c.before === null}
                  onClick={() => c.setBefore(null)}
                >
                  Latest requests
                </AppButton>
              </div>
              <div
                className={styles['conversation-transcript']}
                ref={transcript}
                onScroll={(e) => c.scroll.current.set(key, e.currentTarget.scrollTop)}
                tabIndex={0}
                role="region"
                aria-label="Conversation transcript"
              >
                {c.page.turns.length ? (
                  c.page.turns.map((turn) => <MessageTurn key={turn.attempt.id} turn={turn} />)
                ) : (
                  <p className={styles['conversation-empty']}>
                    Start with a question or an idea. Writing is shared only when you choose it.
                  </p>
                )}
              </div>
              {c.page.totalMessages ? (
                <p className={styles['conversation-caption']}>
                  {c.page.totalMessages} saved messages · Five requests per page
                </p>
              ) : null}
              <details className={styles['conversation-capture']}>
                <summary>ChatGPT availability</summary>
                <AiRequestConnection action="conversation" disabled={blocked} />
              </details>
              {!archived || c.draft.text ? (
                <form
                  className={styles['conversation-form']}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void c.review()
                  }}
                >
                  <Textarea
                    label="Your next message"
                    ref={composerRef}
                    value={c.draft.text}
                    maxLength={16000}
                    rows={5}
                    readOnly={c.readOnly || blocked || archived}
                    onChange={(e) => c.update({ text: e.currentTarget.value })}
                  />
                  <p className={styles['conversation-caption']}>
                    {c.draft.text.length.toLocaleString()} / 16,000 characters. Enter adds a new
                    line; Review request opens the sharing review.
                  </p>
                  <div
                    className={styles['conversation-actions']}
                    role="group"
                    aria-label="Optional writing context"
                  >
                    <AppButton
                      variant="default"
                      disabled={blocked || c.readOnly || archived}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void c.attach('passage')}
                    >
                      Use selected passage
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={blocked || c.readOnly || archived}
                      onClick={() => void c.attach('section')}
                    >
                      Use current item
                    </AppButton>
                    {c.draft.source.kind !== 'none' ? (
                      <AppButton
                        variant="subtle"
                        disabled={blocked}
                        onClick={() => void c.attach('none')}
                      >
                        Remove writing context
                      </AppButton>
                    ) : null}
                  </div>
                  <p className={styles['conversation-caption']}>
                    {c.draft.source.kind === 'none'
                      ? 'No writing attached.'
                      : c.draft.source.kind === 'passage'
                        ? 'The selected passage is attached at its saved revision.'
                        : 'The selected section is attached at its saved revision, including footnote bodies.'}{' '}
                    Text only: citation and footnote references are labelled; images and formatting
                    are omitted. The exact text appears in review.
                  </p>
                  <p className={styles['conversation-caption']}>
                    {c.draft.historyIds.length} previous messages selected, at most 12. All attached
                    writing and history share a 64,000-character limit. Review also checks the
                    combined structured request and instructions against an 80,000-character limit.
                  </p>
                  {c.draft.historyIds.length ? (
                    <AppButton
                      variant="subtle"
                      disabled={blocked}
                      onClick={() => c.update({ historyIds: [] })}
                    >
                      Clear previous-message selection
                    </AppButton>
                  ) : null}
                  <div className={styles['conversation-actions']}>
                    <AppButton
                      type="submit"
                      disabled={
                        blocked || c.readOnly || archived || !c.draft.text.trim() || c.active
                      }
                    >
                      Review request
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={blocked || !c.draft.text}
                      onClick={c.clear}
                    >
                      Clear unsent draft
                    </AppButton>
                  </div>
                </form>
              ) : null}
              {review ? (
                <section
                  className={styles['conversation-review']}
                  aria-label="Review outgoing request"
                >
                  <h4>Review what will be shared</h4>
                  <p>
                    {review.excluded} saved messages excluded. No other writing or research will be
                    added.
                  </p>
                  <AppButton
                    variant="subtle"
                    aria-expanded={expandedReview}
                    onClick={() => setExpandedReview(!expandedReview)}
                  >
                    {expandedReview ? 'Collapse exact request' : 'Show exact request'}
                  </AppButton>
                  <div hidden={!expandedReview} inert={!expandedReview}>
                    <h4>Your message</h4>
                    <div className={styles['conversation-message-text']}>
                      {review.capture.prompt}
                    </div>
                    {review.capture.context.map((item, i) => (
                      <div key={i}>
                        <h4>
                          {item.label || 'Untitled section'} · {item.kind}
                        </h4>
                        <div className={styles['conversation-message-text']}>{item.text}</div>
                      </div>
                    ))}
                    <p className={styles['conversation-caption']}>
                      The provider receives these text fields in a structured request with their
                      labels, source IDs and saved revision IDs. Template: {review.capture.template}
                      .
                    </p>
                    <p className={styles['conversation-digest']}>
                      Capture digest: {review.capture.digest}
                    </p>
                  </div>
                  <p className={styles['conversation-caption']}>
                    Provider: {connections.status?.direct ? 'ChatGPT plan (direct text)' : 'Codex'}.
                    Account:{' '}
                    {connections.status?.connections.find((a) => a.id === review.connectionId)
                      ?.label ?? 'None'}
                    . Model: {review.model ?? 'Not selected'}. Saving locally does not send or queue
                    this request.
                  </p>
                  {c.capability?.state === 'unavailable' ? (
                    <p className={styles['conversation-caption']}>
                      {featureDescription(c.capability)}
                    </p>
                  ) : null}
                  <div className={styles['conversation-actions']}>
                    <AppButton
                      disabled={blocked || c.readOnly || archived}
                      onClick={() => c.submit(false)}
                    >
                      Save request locally
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={blocked || !c.canSend || archived || c.active}
                      onClick={() => c.submit(true)}
                    >
                      Send reviewed request
                    </AppButton>
                    <AppButton variant="subtle" disabled={blocked} onClick={() => c.update({})}>
                      Edit request
                    </AppButton>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
          {c.issue && !c.pending ? (
            <AppButton variant="subtle" disabled={blocked} onClick={c.recover}>
              Retry local recovery
            </AppButton>
          ) : null}
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
