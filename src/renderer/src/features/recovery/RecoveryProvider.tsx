import { useRef, useLayoutEffect, useState, type ReactNode } from 'react'
import { Textarea } from '@mantine/core'
import { sameScope, fileBusy } from '../../../../shared/project-files'
import { projectDiscoveryIssue, type RecoveryIssue } from '../../../../shared/recovery'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { RecoveryContext } from './recoveryContext'
import { recoveryExplanation, recoveryHeading } from './recovery-presentation'
import styles from './RecoveryProvider.module.css'

export function RecoveryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const session = useWorkspaceSession()
  const [opened, setOpened] = useState(false)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [diagnostic, setDiagnostic] = useState<RecoveryIssue | null>(null)
  const [copied, setCopied] = useState(false)
  const [initialDestination, setInitialDestination] = useState(session.destination)
  const [problem, setProblem] = useState('')
  const [actionErrorBefore, setActionErrorBefore] = useState<string | null>(null)
  const latest = useRef({ session, opened })
  useLayoutEffect(() => {
    latest.current = { session, opened }
  }, [session, opened])
  const triggerRef = useRef<HTMLElement | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const inspectionRef = useRef<HTMLHeadingElement>(null)
  const issues = (session.data?.recovery ?? []).filter(
    (i) =>
      i.outcome === 'unresolved' &&
      (!i.id.startsWith('project:') || session.list.issues.some((p) => p.projectId === i.projectId))
  )
  for (const p of session.list.issues) {
    if (!issues.some((i) => i.id === `project:${p.projectId}`))
      issues.push(projectDiscoveryIssue(p))
  }
  const fileProblem =
    sameScope(session.project, session.files.scope) &&
    session.project &&
    ['unavailable', 'external-change', 'interrupted'].includes(session.files.state)
  if (
    fileProblem &&
    !issues.some(
      (i) => sameScope(i.scope, session.project) && (i.kind === 'save' || i.kind === 'backup')
    )
  )
    issues.push({
      id: `file:${session.project!.projectId}:${session.project!.workspaceId}`,
      projectId: session.project!.projectId,
      scope: { projectId: session.project!.projectId, workspaceId: session.project!.workspaceId },
      title: session.project!.title,
      kind: 'save',
      operationId: session.files.job?.id ?? null,
      cause:
        session.files.state === 'external-change'
          ? 'EXTERNAL_CHANGE'
          : session.files.state === 'unavailable'
            ? sameScope(session.files.job?.scope ?? null, session.project)
              ? (session.files.job?.error ?? null)
              : null
            : 'JOB_INTERRUPTED',
      phase: session.files.job?.phase ?? null,
      outcome: 'unresolved',
      actions: ['save-copy', 'diagnostics']
    })
  const disabled =
    loading ||
    action ||
    session.acting ||
    session.closing ||
    session.navigating ||
    session.fileActive
  const job = action ? session.files.job : null
  const inspection = job?.state === 'awaiting-choice' ? job.inspection : null
  useLayoutEffect(() => {
    if (
      inspection &&
      document.activeElement === statusRef.current &&
      !session.composition.current &&
      document.hasFocus() &&
      !document.hidden &&
      document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length === 1
    )
      inspectionRef.current?.focus({ preventScroll: true })
  }, [inspection, session.composition])
  const diagnostics = diagnostic
    ? JSON.stringify(
        {
          issue: diagnostic.id,
          project: diagnostic.projectId,
          workspace: diagnostic.scope?.workspaceId ?? null,
          operation: diagnostic.operationId,
          kind: diagnostic.kind,
          cause: diagnostic.cause ?? 'unknown',
          phase: diagnostic.phase
        },
        null,
        2
      )
    : ''

  async function load(): Promise<void> {
    setLoading(true)
    setOutcome('')
    setProblem('')
    try {
      const result = await session.reviewRecovery()
      if (!result || !result.ok) {
        setProblem(
          result && !result.ok
            ? result.error.message
            : 'Recovery information is unavailable. Existing files were kept.'
        )
        return
      }
      const confirmed = result.value.recovery.filter((i) => i.outcome === 'confirmed')
      if (confirmed.length > 1)
        setOutcome(
          `${confirmed.length} earlier Saves or Backups were confirmed. Unresolved issues remain listed below.`
        )
      else if (confirmed.length)
        setOutcome(
          confirmed
            .map(
              (i) =>
                `${i.title ? `“${i.title}”: ` : ''}${i.kind === 'backup' ? 'Backup' : 'Save'} confirmed.`
            )
            .join(' ')
        )
    } catch {
      setProblem(
        'Collie could not finish reading recovery information. Try again when the current work has finished.'
      )
    } finally {
      setLoading(false)
    }
  }
  function open(trigger?: HTMLElement): void {
    if (session.actionTask.current || session.closing || session.navigating) return
    triggerRef.current = trigger ?? null
    setInitialDestination(session.destination)
    setDiagnostic(null)
    setCopied(false)
    setActionErrorBefore(null)
    setOpened(true)
    session.run(load)
  }
  function act(
    issue: RecoveryIssue,
    kind: 'open-project' | 'save-copy' | 'open-backup' | 'recover-copy',
    artifactId?: string
  ): void {
    session.run(async () => {
      setAction(true)
      setOutcome('')
      setActionErrorBefore(session.error)
      setProblem('')
      statusRef.current?.focus({ preventScroll: true })
      try {
        if (kind === 'open-project') {
          if (issue.scope) {
            await session.chooseProject(issue.scope)
            if (sameScope(session.current.current, issue.scope)) {
              await session.refresh()
              setOpened(false)
            }
          }
          return
        }
        if (kind === 'save-copy') {
          if (!issue.scope) return
          if (!sameScope(session.current.current, issue.scope))
            await session.chooseProject(issue.scope)
          if (!sameScope(session.current.current, issue.scope)) return
        }
        const completed = await session.lifecycleFile(
          kind === 'save-copy' ? 'backup' : kind === 'open-backup' ? 'restore' : 'recover',
          artifactId
        )
        if (completed && kind !== 'save-copy') setOpened(false)
        else if (completed)
          setOutcome(
            'A separate copy was saved. The existing file and Save location were kept. Any unresolved earlier save remains listed below.'
          )
      } finally {
        setAction(false)
      }
    })
  }
  function answer(choice: 'open-copy' | 'cancel'): void {
    if (!job) return
    void window.collie
      .answerFileJob({ id: job.id, choice })
      .then((result) => {
        if (!result.ok) session.setError(result.error.message)
      })
      .catch(() =>
        session.setError(
          'Collie could not confirm that choice. The file operation is still available here.'
        )
      )
  }

  return (
    <RecoveryContext.Provider value={{ opened, issues, open }}>
      {children}
      <AppDialog
        opened={opened}
        onClose={() => setOpened(false)}
        title="Project recovery"
        dismissible={!loading && !action}
        returnFocus={false}
        onExited={() => {
          const origin = initialDestination,
            trigger = triggerRef.current
          // Mantine calls this before removing its dialog content.
          requestAnimationFrame(() => {
            const live = latest.current.session
            if (
              latest.current.opened ||
              live.destination !== origin ||
              live.closing ||
              live.navigating ||
              live.composition.current ||
              document.hidden ||
              !document.hasFocus() ||
              document.querySelector('[role="dialog"], [role="alertdialog"]') ||
              (document.activeElement && document.activeElement !== document.body)
            )
              return
            const target =
              trigger?.isConnected &&
              !trigger.closest('[hidden], [inert]') &&
              !trigger.matches(':disabled, [aria-disabled="true"]')
                ? trigger
                : document.querySelector<HTMLElement>('[data-destination-region]:not([hidden])')
            target?.focus({ preventScroll: true })
          })
        }}
        classNames={{ content: styles['recovery-dialog'], body: styles['recovery-body'] }}
      >
        <div className={styles['recovery-content']}>
          <p ref={statusRef} tabIndex={-1} data-autofocus role="status" aria-live="polite">
            {loading
              ? 'Checking the saved recovery records…'
              : problem
                ? 'Recovery information could not be fully read.'
                : outcome ||
                  (issues.length
                    ? 'Choose how to preserve or recover the affected work.'
                    : 'No unresolved recovery issues were found.')}
          </p>
          {problem ? <p role="alert">{problem}</p> : null}
          {actionErrorBefore !== null && session.error ? <p role="alert">{session.error}</p> : null}
          {session.blocker ? <p role="alert">{session.blocker.message}</p> : null}
          {session.saveState === 'unconfirmed' ? (
            <p role="alert">
              A Save is still unconfirmed. Finish that Save before creating or opening another copy.
              Your visible writing remains available.
            </p>
          ) : null}
          {inspection && job ? (
            <section className={styles['recovery-issue']}>
              <h2 ref={inspectionRef} tabIndex={-1}>
                {inspection.title}
              </h2>
              <p>
                Saved {new Date(inspection.createdAt).toLocaleString()}. Recover this version as an
                independent project. The original project and files stay intact.
              </p>
              <div className={styles['recovery-actions']}>
                <AppButton onClick={() => answer('open-copy')}>Recover a copy</AppButton>
                <AppButton variant="default" onClick={() => answer('cancel')}>
                  Cancel
                </AppButton>
              </div>
            </section>
          ) : job && fileBusy(job) ? (
            <div role="status">
              <p>
                {job.kind === 'backup'
                  ? 'Saving a separate copy…'
                  : 'Reading the available version…'}
              </p>
              {job.cancellable ? (
                <AppButton
                  variant="default"
                  onClick={() => {
                    void window.collie
                      .cancelFileJob(job.id)
                      .then((r) => {
                        if (!r.ok) session.setError(r.error.message)
                      })
                      .catch(() =>
                        session.setError(
                          'Cancellation could not be confirmed. Keep this dialog open until the file operation finishes.'
                        )
                      )
                  }}
                >
                  Cancel
                </AppButton>
              ) : null}
            </div>
          ) : null}
          {!loading && !inspection
            ? issues.map((issue) => (
                <section key={issue.id} className={styles['recovery-issue']}>
                  <h2>{recoveryHeading(issue)}</h2>
                  <p>{recoveryExplanation(issue)}</p>
                  {issue.actions.includes('save-copy') ? (
                    <>
                      <p>
                        Open the local project and save a separate copy to a new filename; the
                        existing file and Save location stay unchanged.
                      </p>
                      <AppButton
                        disabled={disabled || session.saveState === 'unconfirmed'}
                        onClick={() => act(issue, 'save-copy')}
                      >
                        Save a copy…
                      </AppButton>
                    </>
                  ) : null}
                  {issue.actions.includes('recover-copy') ? (
                    <details>
                      <summary>Available versions</summary>
                      <p>Inspect a version before recovering it. It may contain older writing.</p>
                      <ul className={styles['recovery-versions']}>
                        {session.data?.items
                          .filter((i) => i.projectId === issue.projectId)
                          .map((item, index) => (
                            <li key={item.id}>
                              <span>
                                {item.kind === 'backup'
                                  ? 'Backup'
                                  : item.kind === 'candidate'
                                    ? 'Local snapshot'
                                    : 'Previous file'}{' '}
                                {index + 1}
                              </span>
                              <AppButton
                                variant="default"
                                disabled={disabled || session.saveState === 'unconfirmed'}
                                onClick={() => act(issue, 'recover-copy', item.id)}
                              >
                                Inspect version
                              </AppButton>
                            </li>
                          ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className={styles['recovery-actions']}>
                    {issue.actions.includes('open-project') ? (
                      <AppButton disabled={disabled} onClick={() => act(issue, 'open-project')}>
                        Open project
                      </AppButton>
                    ) : null}
                    {issue.actions.includes('open-backup') ? (
                      <AppButton
                        disabled={disabled || session.saveState === 'unconfirmed'}
                        onClick={() => act(issue, 'open-backup')}
                      >
                        Open backup…
                      </AppButton>
                    ) : null}
                    <AppButton
                      variant="subtle"
                      onClick={() => {
                        setDiagnostic(issue)
                        setCopied(false)
                      }}
                    >
                      Diagnostic details
                    </AppButton>
                  </div>
                </section>
              ))
            : null}
          {diagnostic ? (
            <section className={styles['recovery-issue']}>
              <Textarea
                label="Local diagnostic details"
                value={diagnostics}
                readOnly
                autosize
                minRows={4}
                maxRows={10}
              />
              <AppButton
                variant="default"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(diagnostics)
                    .then(() => setCopied(true))
                    .catch(() => setOutcome('Select and copy the diagnostic text above.'))
                }}
              >
                {copied ? 'Copied' : 'Copy diagnostic details'}
              </AppButton>
            </section>
          ) : null}
        </div>
        <div className={styles['recovery-footer']}>
          {!loading && (issues.length || problem) ? (
            <AppButton variant="subtle" disabled={disabled} onClick={() => session.run(load)}>
              Try again
            </AppButton>
          ) : null}
          <AppButton
            variant="default"
            disabled={loading || action}
            onClick={() => setOpened(false)}
          >
            {issues.length ? 'Later' : 'Done'}
          </AppButton>
        </div>
      </AppDialog>
    </RecoveryContext.Provider>
  )
}
