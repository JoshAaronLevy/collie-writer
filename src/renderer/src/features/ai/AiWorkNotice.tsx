import { useRef, useState } from 'react'
import type { AiContentWork } from '../../../../shared/ai'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { AiCapacity } from '../ai-connections/AiCapacity'
import { useAiConnections } from '../ai-connections/connectionState'
import { useConversations } from './conversations/conversationState'
import { useProofreading } from './proofreading/proofreadingState'
import styles from './AiWorkNotice.module.css'

type Pending = { work: AiContentWork; action: 'cancel' | 'protect' | 'acknowledge' }
const key = (work: AiContentWork): string =>
  `${work.feature}:${work.scope.projectId}:${work.scope.workspaceId}:${work.attemptId}`
const labels: Record<AiContentWork['state'], string> = {
  running: 'Request in progress',
  stopping: 'Stopping response…',
  protecting: 'Saving response…',
  'protection-required': 'Response could not be saved',
  'retained-outcome': 'Saved result needs review',
  'handoff-required': 'Response is waiting to be saved to the project',
  'record-unavailable': 'Saved request needs recovery'
}

/** Always mounted. An exact acknowledgment survives removal of its work item. */
export function AiWorkNotice(): React.JSX.Element | null {
  const session = useWorkspaceSession(),
    connections = useAiConnections(),
    conversations = useConversations(),
    proofreading = useProofreading()
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState('')
  const [acknowledge, setAcknowledge] = useState<AiContentWork | null>(null)
  const held = useRef<Pending | null>(null),
    locked = useRef(false),
    region = useRef<HTMLDivElement>(null)
  const work = connections.status?.work ?? []
  const capacity = connections.status?.capacity
  const capacityNeedsAttention =
    !!capacity && (capacity.used === null || capacity.used > 0 || capacity.projects.length > 0)
  const needsAttention =
    !!issue ||
    capacity?.used === null ||
    (!!capacity && capacity.used === capacity.limit) ||
    work.some(
      (item) =>
        item.state === 'protection-required' ||
        item.state === 'record-unavailable' ||
        item.state === 'handoff-required'
    )
  const running = work.some((item) => item.state === 'running' || item.state === 'stopping')
  const savedResults = work.filter((item) => item.state === 'retained-outcome').length
  useRetainedDraft('ai-work-action', {
    read: () => ({
      scope: pending?.work.scope ?? { projectId: '', workspaceId: '' },
      kind: 'ai-work',
      entityId: pending?.work.attemptId ?? null,
      label: 'AI stop, protection or retention acknowledgment',
      dirty: false,
      composing: false,
      busy,
      pendingOperation: pending,
      policy: 'operation',
      target: { kind: 'settings', page: 'ai' }
    }),
    focus: () => {
      if (!session.composition.current) region.current?.focus()
    }
  })
  async function act(input: Pending): Promise<void> {
    if (locked.current || (held.current && held.current !== input)) return
    locked.current = true
    held.current = input
    setPending(input)
    setBusy(true)
    setIssue('')
    const request = { ...input.work.scope, action: input.action, attemptId: input.work.attemptId }
    try {
      const result =
        input.work.feature === 'conversation'
          ? await window.collie.conversation(request)
          : await window.collie.proofreading(request)
      if (!result.ok) {
        if (!['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(result.error.code)) {
          held.current = null
          setPending(null)
        }
        setIssue(
          result.error.code === 'NOT_FOUND'
            ? 'The original local execution record or binding is missing. Saved history remains readable; this request was not resent.'
            : result.error.message
        )
      } else {
        held.current = null
        setPending(null)
      }
      await connections.checkStatus()
    } catch {
      setIssue(
        'This local acknowledgment is uncertain. Keep Collie open and retry the same action; it cannot send a new request.'
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  if (!work.length && !pending && !issue && !acknowledge && !capacityNeedsAttention) return null
  return (
    <div ref={region} tabIndex={-1} className={styles['ai-work-notice']}>
      <details
        className={styles['ai-work-summary']}
        open={needsAttention || !!pending || undefined}
      >
        <summary>
          {needsAttention
            ? 'AI work needs attention'
            : running
              ? 'AI response in progress'
              : savedResults
                ? `${savedResults} saved AI result${savedResults === 1 ? '' : 's'} to review`
                : work.length
                  ? 'Saving AI response…'
                  : 'AI recovery details'}
        </summary>
        {running ? <p>Wait for the response to finish saving before changing accounts.</p> : null}
        {issue ? <p role="alert">{issue}</p> : null}
        {pending ? (
          <AppButton disabled={busy} pending={busy} onClick={() => void act(pending)}>
            Retry the same local action
          </AppButton>
        ) : null}
        <ul className={styles['ai-work-list']}>
          {work.map((item) => (
            <li key={key(item)}>
              <p>
                <strong>{item.feature === 'conversation' ? 'Conversation' : 'Proofreading'}</strong>{' '}
                ·{' '}
                {session.list.projects.find((project) => sameScope(project, item.scope))?.title ??
                  'Another local project'}{' '}
                · {labels[item.state]}
              </p>
              <div className={styles['ai-work-actions']}>
                <AppButton
                  variant="subtle"
                  disabled={!sameScope(session.project, item.scope) || busy || session.closing}
                  onClick={() =>
                    item.feature === 'conversation'
                      ? conversations.show(item.attemptId)
                      : proofreading.show(item.attemptId)
                  }
                >
                  View request
                </AppButton>
                {item.state === 'running' ? (
                  <AppButton
                    variant="default"
                    disabled={!!pending || busy || session.closing}
                    onClick={() => void act({ work: item, action: 'cancel' })}
                  >
                    Stop request
                  </AppButton>
                ) : null}
                {item.state === 'protection-required' || item.state === 'handoff-required' ? (
                  <AppButton
                    variant="default"
                    disabled={
                      !!pending ||
                      busy ||
                      session.closing ||
                      !sameScope(session.project, item.scope)
                    }
                    onClick={() => void act({ work: item, action: 'protect' })}
                  >
                    {item.state === 'handoff-required'
                      ? 'Finish saving response'
                      : 'Retry saving response'}
                  </AppButton>
                ) : null}
                {item.state === 'retained-outcome' ? (
                  <AppButton
                    variant="default"
                    disabled={
                      !!pending ||
                      busy ||
                      session.closing ||
                      !sameScope(session.project, item.scope)
                    }
                    onClick={() => setAcknowledge(item)}
                  >
                    Review saved result…
                  </AppButton>
                ) : null}
                {item.state === 'record-unavailable' ? (
                  <AppButton
                    variant="default"
                    disabled={
                      !!pending ||
                      busy ||
                      session.closing ||
                      !sameScope(session.project, item.scope)
                    }
                    onClick={() => void act({ work: item, action: 'protect' })}
                  >
                    Retry local recovery
                  </AppButton>
                ) : null}
              </div>
              {!sameScope(session.project, item.scope) ? (
                <p>
                  Open the original project from Local AI capacity and recovery in this notice to
                  recover its saved request.
                </p>
              ) : null}
              {item.state === 'record-unavailable' ? (
                <p>
                  The protected execution record is not loaded. Retry local recovery in the original
                  project. If it remains unavailable, keep the existing files and report the issue;
                  Collie cannot release this binding without its original proof.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {capacityNeedsAttention || work.length ? (
          <details className={styles['ai-work-details']}>
            <summary>Local AI capacity and recovery</summary>
            <AiCapacity />
          </details>
        ) : null}
        <AppButton
          variant="subtle"
          disabled={connections.checking}
          onClick={() => void connections.checkStatus(true)}
        >
          Check work status
        </AppButton>
        {!work.length && !pending && issue ? (
          <AppButton variant="subtle" onClick={() => setIssue('')}>
            Dismiss notice
          </AppButton>
        ) : null}
      </details>
      <AppDialog
        opened={acknowledge !== null}
        onClose={() => setAcknowledge(null)}
        title="Dismiss saved result?"
      >
        <div className={styles['ai-retention-confirmation']}>
          <p>
            Your request and any partial response stay saved. Dismissing this notice lets Collie
            accept more AI work. It does not send your message again.
          </p>
          <p>
            You can reopen the saved request at any time. A failed or interrupted response keeps
            that status.
          </p>
          <div className={styles['ai-work-actions']}>
            <AppButton
              variant="default"
              onClick={() => {
                const item = acknowledge
                setAcknowledge(null)
                if (item && sameScope(session.project, item.scope)) {
                  if (item.feature === 'conversation') conversations.show(item.attemptId)
                  else proofreading.show(item.attemptId)
                }
              }}
            >
              View request
            </AppButton>
            <AppButton variant="default" onClick={() => setAcknowledge(null)}>
              Cancel
            </AppButton>
            <AppButton
              disabled={
                !acknowledge ||
                !!pending ||
                busy ||
                session.closing ||
                !sameScope(session.project, acknowledge.scope)
              }
              onClick={() => {
                const item = acknowledge
                if (item) {
                  setAcknowledge(null)
                  void act({ work: item, action: 'acknowledge' })
                }
              }}
            >
              Dismiss
            </AppButton>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
