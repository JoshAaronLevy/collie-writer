import { useProjectImport } from '../imports/importContext'
import { useRef, useState } from 'react'
import type { AiContentWork } from '../../../../shared/ai'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
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
  'retained-outcome': 'Interrupted or unsuccessful response kept',
  'handoff-required': 'Response is waiting to be saved to the project',
  'record-unavailable': 'Saved request needs recovery'
}

/** Exact local actions survive removal of their work item; viewing never acknowledges a result. */
export function AiWorkNotice(): React.JSX.Element | null {
  const session = useWorkspaceSession(),
    connections = useAiConnections(),
    conversations = useConversations(),
    proofreading = useProofreading(),
    imports = useProjectImport()
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(''),
    [acknowledge, setAcknowledge] = useState<AiContentWork | null>(null)
  const held = useRef<Pending | null>(null),
    locked = useRef(false),
    region = useRef<HTMLDivElement>(null)
  const work = connections.status?.work ?? []
  const capacity = connections.status?.capacity
  const otherProjects = (capacity?.projects ?? []).filter(
    (scope) =>
      !sameScope(session.project, scope) && !work.some((item) => sameScope(item.scope, scope))
  )
  const unreadable = capacity?.used === null
  const full = !!capacity && capacity.used === capacity.limit
  const needsAttention =
    !!issue ||
    unreadable ||
    full ||
    otherProjects.length > 0 ||
    work.some((item) => !['running', 'stopping', 'protecting'].includes(item.state))
  const blocked = !!pending || busy || session.closing || session.navigating || session.acting
  useRetainedDraft('ai-work-action', {
    read: () => ({
      scope: pending?.work.scope ?? { projectId: '', workspaceId: '' },
      kind: 'ai-work',
      entityId: pending?.work.attemptId ?? null,
      label: 'saving or stopping an AI response',
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
    if (locked.current || (held.current && held.current !== input) || session.composition.current)
      return
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
          : input.work.feature === 'import'
            ? await window.collie.importAnalysis(request)
            : await window.collie.proofreading(request)
      if (!result.ok) {
        if (!['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(result.error.code)) {
          held.current = null
          setPending(null)
        }
        setIssue(
          result.error.code === 'NOT_FOUND'
            ? 'The local response could not be found. Saved project history is kept. Recovery sends no request; sending again would be a new request.'
            : result.error.message
        )
      } else {
        held.current = null
        setPending(null)
      }
      await connections.checkStatus()
    } catch {
      setIssue(
        'This local action could not be confirmed. Retry it here; it cannot send a new request.'
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const openProject = (scope: AiContentWork['scope']): React.JSX.Element => {
    const project = session.list.projects.find((item) => sameScope(item, scope))
    return project ? (
      <AppButton
        variant="default"
        disabled={blocked || session.busy}
        onClick={() => {
          if (!session.composition.current) session.run(() => session.chooseProject(scope))
        }}
      >
        Open {project.title}
        {project.archived ? ' (archived)' : ''}
      </AppButton>
    ) : (
      <p>The original project is unavailable here. Its saved response has been kept.</p>
    )
  }
  if (
    !work.length &&
    !pending &&
    !issue &&
    !acknowledge &&
    !otherProjects.length &&
    !unreadable &&
    !full
  )
    return null
  return (
    <div ref={region} tabIndex={-1} className={styles['ai-work-notice']}>
      <details
        className={styles['ai-work-summary']}
        open={needsAttention || !!pending || undefined}
      >
        <summary>{needsAttention ? 'AI work needs attention' : 'AI response in progress'}</summary>
        {issue ? <p role="alert">{issue}</p> : null}
        {unreadable ? (
          <p role="alert">Saved AI work could not be read. Check work status to try again.</p>
        ) : null}
        {full ? (
          <p>
            Finish saving responses or dismiss retained notices before sending more. This is local
            recovery, separate from ChatGPT usage limits.
          </p>
        ) : null}
        {pending ? (
          <AppButton
            disabled={busy || session.closing}
            pending={busy}
            onClick={() => void act(pending)}
          >
            Retry local action
          </AppButton>
        ) : null}
        <ul className={styles['ai-work-list']} tabIndex={0} aria-label="Retained AI work">
          {work.map((item) => (
            <li key={key(item)}>
              <p>
                <strong>
                  {item.feature === 'conversation'
                    ? 'Conversation'
                    : item.feature === 'import'
                      ? 'Import analysis'
                      : 'Proofreading'}
                </strong>
                {' · '}
                {session.list.projects.find((project) => sameScope(project, item.scope))?.title ??
                  'Another local project'}
                {' · '}
                {labels[item.state]}
              </p>
              <div className={styles['ai-work-actions']}>
                {sameScope(session.project, item.scope) ? (
                  <>
                    <AppButton
                      variant="default"
                      disabled={blocked}
                      onClick={() => {
                        if (session.composition.current) return
                        if (item.feature === 'conversation') conversations.show(item.attemptId)
                        else if (item.feature === 'import') imports.showAnalysis(item.attemptId)
                        else proofreading.show(item.attemptId)
                      }}
                    >
                      {item.feature === 'import' ? 'Open import' : 'View response'}
                    </AppButton>
                    {['protection-required', 'handoff-required', 'record-unavailable'].includes(
                      item.state
                    ) ? (
                      <AppButton
                        variant="default"
                        disabled={blocked}
                        onClick={() => void act({ work: item, action: 'protect' })}
                      >
                        {item.state === 'record-unavailable'
                          ? 'Retry local recovery'
                          : 'Finish saving response'}
                      </AppButton>
                    ) : null}
                    {item.state === 'retained-outcome' ? (
                      <AppButton
                        variant="subtle"
                        disabled={blocked}
                        onClick={() => {
                          if (!session.composition.current) setAcknowledge(item)
                        }}
                      >
                        Dismiss notice…
                      </AppButton>
                    ) : null}
                  </>
                ) : (
                  openProject(item.scope)
                )}
                {item.state === 'running' ? (
                  <AppButton
                    variant="default"
                    disabled={blocked}
                    onClick={() => void act({ work: item, action: 'cancel' })}
                  >
                    Stop response
                  </AppButton>
                ) : null}
              </div>
              {['protection-required', 'handoff-required', 'record-unavailable'].includes(
                item.state
              ) ? (
                <p>
                  {item.state === 'record-unavailable'
                    ? 'The local response is unavailable. Recovery checks retained files only; sending again would be a new request.'
                    : 'Finish saving uses the retained response and sends no new request.'}
                </p>
              ) : null}
            </li>
          ))}
          {otherProjects.map((scope) => (
            <li key={`${scope.projectId}:${scope.workspaceId}`}>
              <p>A response in this project still needs attention.</p>
              {openProject(scope)}
            </li>
          ))}
        </ul>
        {needsAttention ? (
          <AppButton
            variant="subtle"
            disabled={connections.checking || busy}
            onClick={() => void connections.checkStatus(true)}
          >
            Check work status
          </AppButton>
        ) : null}
        {!work.length && !pending && issue ? (
          <AppButton variant="subtle" onClick={() => setIssue('')}>
            Dismiss notice
          </AppButton>
        ) : null}
      </details>
      <AppDialog
        opened={acknowledge !== null}
        onClose={() => setAcknowledge(null)}
        title="Dismiss this response notice?"
      >
        <div className={styles['ai-retention-confirmation']}>
          <p>
            The request, any partial response and its failure or interruption status stay in the
            project. This dismisses the notice without sending another request
            {acknowledge?.feature === 'import' ? ' or accepting imported content' : ''}.
          </p>
          <div className={styles['ai-work-actions']}>
            <AppButton variant="default" onClick={() => setAcknowledge(null)}>
              Cancel
            </AppButton>
            <AppButton
              disabled={!acknowledge || blocked || !sameScope(session.project, acknowledge.scope)}
              onClick={() => {
                if (acknowledge && !session.composition.current) {
                  void act({ work: acknowledge, action: 'acknowledge' })
                  setAcknowledge(null)
                }
              }}
            >
              Dismiss notice
            </AppButton>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
