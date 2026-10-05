import { useRef, useState } from 'react'
import type { AiContentWork } from '../../../../shared/ai'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { StatusBanner } from '../../components/ui/Feedback'
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
  stopping: 'Stop requested; outcome not yet confirmed',
  protecting: 'Protecting the actual outcome locally',
  'protection-required': 'Local protection needs attention',
  'retained-outcome': 'Outcome retained; acknowledgment needed to release capacity',
  'handoff-required': 'Completed outcome awaiting local handoff',
  'record-unavailable': 'Execution record unavailable; local binding remains reserved'
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
      <StatusBanner
        title="AI work"
        tone={
          issue ||
          capacity?.used === null ||
          capacity?.used === capacity?.limit ||
          work.some(
            (item) => item.state === 'protection-required' || item.state === 'record-unavailable'
          )
            ? 'warning'
            : 'info'
        }
      >
        <p>
          {work.length
            ? 'Running requests and unprotected output must settle before account changes. Stop keeps partial output and does not guarantee restored usage.'
            : 'Local AI work needs review. Open the recovery details below; saved history remains available.'}
        </p>
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
                  Open saved request
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
                      ? 'Finish local handoff'
                      : 'Retry local output protection'}
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
                    Retain outcome and release capacity…
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
      </StatusBanner>
      <AppDialog
        opened={acknowledge !== null}
        onClose={() => setAcknowledge(null)}
        title="Retain outcome and release capacity"
      >
        <div className={styles['ai-retention-confirmation']}>
          <p>
            The saved request keeps its actual text and outcome, including any partial output or
            uncertainty. Collie keeps the original encrypted record on this device and does not
            resend the request or mark it successful.
          </p>
          <p>
            Review the saved request before confirming. This action releases a slot only after local
            protection is complete and no request is running.
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
              Read saved request
            </AppButton>
            <AppButton variant="default" onClick={() => setAcknowledge(null)}>
              Keep slot reserved
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
              Acknowledge and retain outcome
            </AppButton>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
