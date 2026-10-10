import { ImportAnalysisText } from './ImportAnalysisText'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  IMPORT_ANALYSIS_INSTRUCTIONS,
  type AnalysisBundle,
  type AnalysisCapture,
  type AnalysisRequest,
  type AnalysisReview,
  type AnalysisSubmit,
  type AnalysisValue
} from '../../../../shared/import-analysis'
import type { ImportRevision } from '../../../../shared/project-import'
import type { OpenInput } from '../../../../shared/projects'
import { sameScope } from '../../../../shared/project-files'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useAiConnections } from '../ai-connections/connectionState'
import { connectionReason, featureDescription } from '../ai-connections/connection-copy'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton, ChoiceField } from '../../components/ui/Controls'
import styles from './ImportProvider.module.css'

type Review = {
  input: AnalysisReview
  capture: AnalysisCapture
  connectionId: string
  model: string
  stamp: string
  expiresAt: number
}
type State = {
  scope: OpenInput | null
  attemptId: string | null
  opened: boolean
  busy: boolean
  issue: string
  review: Review | null
  consent: boolean
  pending: AnalysisSubmit | null
  bundle: AnalysisBundle | null
  history: Extract<AnalysisValue, { type: 'list' }> | null
  offset: number
}
const initial = (): State => ({
  scope: null,
  attemptId: null,
  opened: false,
  busy: false,
  issue: '',
  review: null,
  consent: false,
  pending: null,
  bundle: null,
  history: null,
  offset: 0
})
const active = (b: AnalysisBundle | null): boolean =>
  !!b && ['preparing', 'running', 'stopping'].includes(b.attempt.state)

/** Retained with the project owner, independently of either dialog's presentation. */
export function useImportAnalysis(options: {
  scope: OpenInput | null
  revision: ImportRevision | null
  disabled: boolean
  intakeOpen: boolean
  closeIntake: () => void
  returnFocus: () => void
}): {
  controls: ReactNode
  progress: ReactNode
  afterIntakeExit: () => boolean
  show: (id: string) => void
  busy: boolean
} {
  const session = useWorkspaceSession(),
    connections = useAiConnections()
  const [state, render] = useState<State>(initial)
  const owned = useRef(state),
    latest = useRef({ session, connections, options })
  const transfer = useRef(false),
    generation = useRef(0),
    readSequence = useRef(0)
  const origin = useRef<{ trigger: HTMLElement | null; destination: string } | null>(null)
  useLayoutEffect(() => {
    latest.current = { session, connections, options }
  })
  function patch(value: Partial<State>): void {
    owned.current = { ...owned.current, ...value }
    render(owned.current)
    latest.current.session.drafts.changed()
  }
  function current(scope: OpenInput): boolean {
    return (
      sameScope(scope, latest.current.session.current.current) &&
      sameScope(scope, owned.current.scope)
    )
  }
  async function request(input: AnalysisRequest): Promise<AnalysisValue> {
    const result = await window.collie.importAnalysis(input)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  async function readAttempt(scope: OpenInput, id: string): Promise<void> {
    const order = ++readSequence.current,
      gen = generation.current
    const value = await request({ ...scope, action: 'attempt', attemptId: id })
    if (value.type !== 'turn') throw new Error('The saved analysis could not be read.')
    if (
      !current(scope) ||
      gen !== generation.current ||
      order !== readSequence.current ||
      owned.current.attemptId !== id
    )
      return
    patch({ bundle: value.turn })
    await latest.current.session.refreshConversationHead(scope)
  }
  const refresh = useRef(readAttempt)
  useLayoutEffect(() => {
    refresh.current = readAttempt
  })
  useEffect(
    () =>
      window.collie.onImportAnalysisChanged((event) => {
        const s = owned.current
        if (
          !s.scope ||
          !s.attemptId ||
          !sameScope(s.scope, event) ||
          !sameScope(s.scope, latest.current.session.current.current)
        )
          return
        if (event.issue) patch({ issue: event.issue })
        void refresh.current(s.scope, s.attemptId).catch(() => {
          if (sameScope(s.scope, owned.current.scope))
            patch({
              issue:
                'Saved progress could not be read. Check the saved outcome; no request will be resent.'
            })
        })
      }),
    []
  )
  // A new selection invalidates sharing consent, never a retained execution or its exact retry.
  const selection = `${options.scope?.workspaceId}:${options.scope?.projectId}:${options.revision?.id}:${options.disabled}`
  useEffect(() => {
    patch({ review: null, consent: false, history: null, offset: 0 })
  }, [selection])
  async function run(work: () => Promise<void>): Promise<void> {
    if (owned.current.busy) return
    patch({ busy: true, issue: '' })
    try {
      await work()
    } catch (error) {
      patch({
        issue:
          error instanceof Error
            ? error.message
            : 'The local outcome is uncertain. Keep this request and check its saved outcome.'
      })
    } finally {
      patch({ busy: false })
    }
  }
  function rememberOrigin(): void {
    origin.current = {
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      destination: JSON.stringify(latest.current.session.destination)
    }
  }
  function present(): void {
    if (latest.current.options.intakeOpen) {
      transfer.current = true
      latest.current.options.closeIntake()
    } else patch({ opened: true })
  }
  function afterIntakeExit(): boolean {
    if (!transfer.current) return false
    transfer.current = false
    const gen = generation.current
    requestAnimationFrame(() => {
      const live = latest.current.session
      if (
        gen !== generation.current ||
        !owned.current.scope ||
        !current(owned.current.scope) ||
        live.closing ||
        live.navigating ||
        live.composition.current ||
        !document.hasFocus() ||
        document.visibilityState !== 'visible' ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return
      patch({ opened: true })
    })
    return true
  }
  function show(id: string): void {
    const live = latest.current.session
    if (
      !live.project ||
      owned.current.busy ||
      live.closing ||
      live.navigating ||
      live.composition.current ||
      document.querySelector('[role="dialog"], [role="alertdialog"]')
    )
      return
    if (owned.current.pending && owned.current.pending.attemptId !== id) return
    rememberOrigin()
    generation.current++
    const scope = { projectId: live.project.projectId, workspaceId: live.project.workspaceId }
    patch({ scope, attemptId: id, bundle: null, opened: true })
    void run(async () => {
      await request({ ...scope, action: 'reconcile' })
      await readAttempt(scope, id)
      await latest.current.connections.checkStatus()
    })
  }
  async function review(): Promise<void> {
    if (options.disabled || !options.scope || !options.revision?.graphId || owned.current.pending)
      return
    const scope = options.scope,
      revision = options.revision,
      status = connections.status
    if (
      !status?.activeConnectionId ||
      status.catalog?.state !== 'loaded' ||
      !status.catalog.selectedModelId
    )
      return
    const model = status.catalog.selectedModelId
    generation.current++
    patch({
      scope,
      review: null,
      consent: false,
      ...(!sameScope(scope, owned.current.scope) ? { attemptId: null, bundle: null } : {})
    })
    await run(async () => {
      const input: AnalysisReview = {
        ...scope,
        action: 'review',
        captureId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        batchId: revision.batchId,
        graphId: revision.graphId!,
        expectedRevision: revision.id
      }
      const value = await window.collie.importAnalysis(input)
      if (!value.ok) {
        if (value.error.code === 'LIMIT_EXCEEDED')
          throw new Error(
            'This selection cannot fit one complete analysis request, has no eligible content, or has reached its retained-analysis limit. Nothing was sent. Inspect the local coverage or use a smaller selection; multi-part analysis is not available yet.'
          )
        throw new Error(value.error.message)
      }
      if (value.value.type !== 'review')
        throw new Error('The sharing preview could not be prepared.')
      if (
        !current(scope) ||
        latest.current.options.revision?.id !== revision.id ||
        latest.current.options.disabled
      )
        return
      patch({
        review: {
          input,
          capture: value.value.capture,
          connectionId: status.activeConnectionId!,
          model,
          stamp: status.reviewRevision,
          expiresAt: Date.now() + 4 * 60000
        }
      })
    })
  }
  async function submit(input: AnalysisSubmit): Promise<void> {
    patch({
      pending: input,
      scope: { projectId: input.projectId, workspaceId: input.workspaceId },
      attemptId: input.attemptId,
      review: null,
      consent: false
    })
    const result = await window.collie.importAnalysis(input)
    if (!result.ok) {
      // Known refusals grant no new dispatch. Uncertain replies keep this exact submission.
      if (
        !['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED', 'ACCESS_BUSY'].includes(result.error.code)
      )
        patch({ pending: null })
      throw new Error(result.error.message)
    }
    if (result.value.type !== 'turn')
      throw new Error('The saved submission could not be confirmed.')
    patch({ pending: null, bundle: result.value.turn })
    await readAttempt(
      { projectId: input.projectId, workspaceId: input.workspaceId },
      input.attemptId
    )
    await latest.current.connections.checkStatus()
  }
  const status = connections.status,
    reviewed = state.review
  const ready =
    !!status &&
    status.route.kind === 'local-chatgpt-plan' &&
    status.features.conversation.state !== 'unavailable'
  const reviewCurrent =
    !!reviewed &&
    reviewed.stamp === status?.reviewRevision &&
    reviewed.connectionId === status.activeConnectionId &&
    status.catalog?.state === 'loaded' &&
    reviewed.model === status.catalog.selectedModelId &&
    reviewed.input.expectedRevision === options.revision?.id
  useEffect(() => {
    const review = state.review
    if (!review) return
    const timer = setTimeout(
      () => {
        if (owned.current.review === review)
          patch({
            review: null,
            consent: false,
            issue: 'The sharing review expired. Review sharing again before sending.'
          })
      },
      Math.max(0, review.expiresAt - Date.now())
    )
    return () => clearTimeout(timer)
  }, [state.review])
  async function analyze(): Promise<void> {
    if (
      !reviewed ||
      !reviewCurrent ||
      !state.consent ||
      !ready ||
      options.disabled ||
      state.busy ||
      state.pending
    )
      return
    rememberOrigin()
    patch({ bundle: null })
    present()
    await run(() =>
      submit({
        action: 'submit',
        projectId: reviewed.input.projectId,
        workspaceId: reviewed.input.workspaceId,
        attemptId: crypto.randomUUID(),
        review: reviewed.input,
        digest: reviewed.capture.digest,
        send: true,
        connectionId: reviewed.connectionId,
        model: reviewed.model
      })
    )
  }
  async function history(offset: number): Promise<void> {
    if (!options.scope || !options.revision || owned.current.pending) return
    const scope = options.scope,
      batchId = options.revision.batchId
    await run(async () => {
      const value = await request({ ...scope, action: 'list', batchId, offset })
      if (value.type !== 'list') throw new Error('Saved analyses could not be read.')
      if (
        !sameScope(scope, latest.current.options.scope) ||
        latest.current.options.revision?.batchId !== batchId
      )
        return
      patch({ history: value, offset })
    })
  }
  async function local(action: 'cancel' | 'protect' | 'reconcile'): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.attemptId || !current(s.scope)) return
    await run(async () => {
      await request(
        action === 'reconcile'
          ? { ...s.scope!, action }
          : { ...s.scope!, action, attemptId: s.attemptId! }
      )
      await readAttempt(s.scope!, s.attemptId!)
      if (owned.current.bundle?.attempt.id === s.pending?.attemptId) patch({ pending: null })
      await latest.current.connections.checkStatus()
    })
  }
  useRetainedDraft('project-import-analysis', {
    read: () => ({
      scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
      kind: 'project-import-analysis',
      entityId: owned.current.attemptId,
      label: 'Import analysis request',
      dirty: false,
      composing: false,
      busy: owned.current.busy,
      pendingOperation: owned.current.pending,
      policy: 'operation',
      target: {
        kind: 'workspace',
        scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
        view: 'details'
      },
      issue: owned.current.issue
    }),
    focus: () => {
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) patch({ opened: true })
    }
  })
  const b = state.bundle,
    work = status?.work.find(
      (w) =>
        w.feature === 'import' && w.attemptId === state.attemptId && sameScope(w.scope, state.scope)
    )
  const usable =
    !!status && b?.attempt.validation === 'valid' && !work && !state.pending && !state.busy
  const controls = (
    <section className={styles.preview} aria-label="ChatGPT import analysis">
      <h2>Analyze with ChatGPT</h2>
      <p>
        Review what will be shared, then send one request using your selected account and model.
        Analysis proposes material for later review; nothing is added to Chats, Research or Notes.
      </p>
      {!ready ? (
        <p role="status">
          {status?.route.kind !== 'local-chatgpt-plan'
            ? 'Import analysis requires the direct ChatGPT account connection available in this development build.'
            : featureDescription(status.features.conversation)}
        </p>
      ) : null}
      {state.issue && !state.opened ? <p role="alert">{state.issue}</p> : null}
      <AppButton
        variant="default"
        disabled={
          options.disabled || state.busy || !!state.pending || !ready || !options.revision?.graphId
        }
        onClick={() => void review()}
      >
        Review analysis sharing
      </AppButton>
      {reviewed ? (
        <>
          <p>
            {reviewed.capture.packet.files.length} files ·{' '}
            {reviewed.capture.packet.fragments.length} eligible records ·{' '}
            {reviewed.capture.packet.excluded} excluded records · 1 request
          </p>
          <p>
            Categories: {reviewed.capture.packet.settings.categories.join(', ')}. Model:{' '}
            {reviewed.model}. No manuscript, existing research, other chats or hidden project
            context will be sent. Names, metadata, instructions and eligible original text shown
            below will be shared.
          </p>
          <p>
            Account:{' '}
            {status?.connections.find((c) => c.id === reviewed.connectionId)?.label ??
              reviewed.connectionId}
          </p>
          <details>
            <summary>Exact shared content and analysis instructions</summary>
            <ImportAnalysisText text={reviewed.capture.context[0].text} label="Shared content" />
            <pre className={styles.original}>{IMPORT_ANALYSIS_INSTRUCTIONS}</pre>
          </details>
          {!reviewCurrent ? (
            <p role="status">
              The sharing review has expired or changed. Review sharing again before sending.
            </p>
          ) : null}
          <ChoiceField
            label="I approve sharing this content for one analysis request."
            checked={state.consent}
            disabled={!reviewCurrent || options.disabled || state.busy}
            onChange={(e) => patch({ consent: e.currentTarget.checked })}
          />
          <AppButton
            disabled={
              !reviewCurrent ||
              !state.consent ||
              !ready ||
              options.disabled ||
              state.busy ||
              !!state.pending
            }
            onClick={() => void analyze()}
          >
            Analyze with ChatGPT
          </AppButton>
        </>
      ) : null}
      {state.attemptId &&
      sameScope(state.scope, options.scope) &&
      (state.pending?.review.batchId === options.revision?.batchId ||
        b?.capture.packet.batchId === options.revision?.batchId) ? (
        <AppButton
          variant="default"
          disabled={state.busy}
          onClick={() => {
            rememberOrigin()
            present()
            void local('reconcile')
          }}
        >
          Open analysis progress
        </AppButton>
      ) : null}
      {options.revision ? (
        <AppButton
          variant="subtle"
          disabled={state.busy || !!state.pending}
          onClick={() => void history(0)}
        >
          Saved analyses
        </AppButton>
      ) : null}
      {state.history ? (
        <>
          <ul className={styles.files} aria-label="Saved import analyses">
            {state.history.items.map((item) => (
              <li key={item.id}>
                <AppButton
                  variant="subtle"
                  disabled={state.busy || !!state.pending}
                  onClick={() => {
                    if (!options.scope) return
                    const scope = options.scope
                    generation.current++
                    rememberOrigin()
                    patch({ scope, attemptId: item.id, bundle: null })
                    present()
                    void local('reconcile')
                  }}
                >
                  {new Date(item.createdAt).toLocaleString()} · {item.state} · {item.validation}
                </AppButton>
              </li>
            ))}
          </ul>
          {!state.history.total ? <p>No saved analyses for this selection.</p> : null}
          <div className={styles.actions}>
            <AppButton
              variant="subtle"
              disabled={state.busy || state.offset === 0}
              onClick={() => void history(Math.max(0, state.offset - 20))}
            >
              Previous analyses
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={state.busy || state.offset + 20 >= state.history.total}
              onClick={() => void history(state.offset + 20)}
            >
              More analyses
            </AppButton>
          </div>
        </>
      ) : null}
    </section>
  )
  const progress = (
    <AppDialog
      title="Import analysis"
      opened={state.opened}
      onClose={() => patch({ opened: false })}
      returnFocus={false}
      onExited={() => {
        const captured = origin.current
        requestAnimationFrame(() => {
          const live = latest.current.session,
            target = captured?.trigger
          if (
            owned.current.opened ||
            live.closing ||
            live.navigating ||
            live.composition.current ||
            captured?.destination !== JSON.stringify(live.destination) ||
            !document.hasFocus() ||
            document.visibilityState !== 'visible' ||
            document.querySelector('[role="dialog"], [role="alertdialog"]') ||
            (document.activeElement !== document.body &&
              document.activeElement instanceof HTMLElement &&
              !document.activeElement.closest('[hidden], [inert]'))
          )
            return
          if (
            target?.isConnected &&
            !target.closest('[hidden], [inert]') &&
            !target.matches(':disabled, [aria-disabled="true"]') &&
            target.getClientRects().length
          )
            target.focus({ preventScroll: true })
          else latest.current.options.returnFocus()
        })
      }}
    >
      <div className={styles.intake}>
        {b ? (
          <details>
            <summary>Analyzed selection</summary>
            <p>{b.capture.packet.files.map((f) => f.name).join(', ')}</p>
            <p>
              Model: {b.attempt.model ?? 'Not dispatched'} ·{' '}
              {new Date(b.attempt.createdAt).toLocaleString()}
            </p>
          </details>
        ) : null}
        <p role="status">
          {state.busy
            ? 'Checking or protecting this request…'
            : work?.state === 'protection-required'
              ? 'The response needs local protection.'
              : work?.state === 'handoff-required' || work?.state === 'protecting'
                ? 'Saving the response to this project…'
                : b
                  ? b.attempt.state === 'completed'
                    ? b.attempt.validation === 'invalid'
                      ? 'The response completed but is not a valid import proposal.'
                      : usable
                        ? 'Analysis saved. Proposal available for later review.'
                        : 'Analysis completed; confirming local protection…'
                    : b.attempt.state === 'running'
                      ? 'ChatGPT is analyzing the selected content…'
                      : b.attempt.state === 'cancelled'
                        ? 'Analysis stopped. Any received text is retained.'
                        : b.attempt.state === 'unknown'
                          ? 'The request outcome is uncertain. Retained text is not a completed proposal.'
                          : b.attempt.state === 'failed'
                            ? 'Analysis failed. Any received text is retained.'
                            : b.attempt.state === 'not-sent'
                              ? 'This request was not sent.'
                              : 'Preparing or stopping the request…'
                  : 'Waiting for the saved request…'}
        </p>
        {state.issue ? <p role="alert">{state.issue}</p> : null}
        {b?.attempt.reason ? (
          <p>
            {b.attempt.reason === 'cancelled'
              ? 'Stopping does not confirm remote cancellation or returned usage.'
              : connectionReason[b.attempt.reason]}
          </p>
        ) : null}
        {b?.validity === 'stale' ? (
          <p role="status">
            The selection has changed. This result belongs to its original selection and cannot be
            used for the current one.
          </p>
        ) : null}
        {usable && b?.attempt.proposal ? (
          <>
            <p>
              {b.attempt.proposal.entities.length} proposed items ·{' '}
              {b.attempt.proposal.links.length} evidenced relationships ·{' '}
              {b.attempt.proposal.issues.length} issues
            </p>
            <p>
              {b.attempt.proposal.coverage.filter((c) => c.outcome === 'identified').length} of{' '}
              {b.attempt.proposal.coverage.length} records identified. Unresolved or unsupported
              records still require review.
            </p>
            <ul>
              {b.attempt.proposal.issues.map((item, i) => (
                <li key={i}>
                  {item.blocking ? 'Needs resolution: ' : ''}
                  {item.explanation || item.code}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {b?.attempt.output ? (
          <details>
            <summary>
              Retained response text ({b.attempt.output.length.toLocaleString()} text units)
            </summary>
            <ImportAnalysisText text={b.attempt.output} label="Retained response" />
          </details>
        ) : null}
        <div className={styles.actions}>
          {active(b) || work?.state === 'running' ? (
            <AppButton
              variant="default"
              disabled={state.busy || b?.attempt.state === 'stopping'}
              onClick={() => void local('cancel')}
            >
              Stop analysis
            </AppButton>
          ) : null}
          <AppButton
            variant="default"
            disabled={state.busy || !state.attemptId}
            onClick={() => void local('reconcile')}
          >
            Check saved outcome
          </AppButton>
          {work &&
          ['protection-required', 'handoff-required', 'record-unavailable'].includes(work.state) ? (
            <AppButton
              variant="default"
              disabled={state.busy}
              onClick={() => void local('protect')}
            >
              Retry local protection
            </AppButton>
          ) : null}
          {state.pending ? (
            <AppButton
              variant="default"
              disabled={state.busy}
              onClick={() => void run(() => submit(owned.current.pending!))}
            >
              Retry exact submission
            </AppButton>
          ) : null}
          <AppButton variant="subtle" onClick={() => patch({ opened: false })}>
            Keep for later
          </AppButton>
        </div>
        {state.pending ? (
          <p>
            The submission reply is uncertain. Check its saved outcome first. Retry uses the same
            request and can send it only if it was never saved and its original sharing approval is
            still valid.
          </p>
        ) : null}
        <p>
          Closing this dialog keeps the analysis available. It does not stop or resend the request.
          Manage ChatGPT and request diagnostics remain available from the shared account controls
          after dismissing this dialog.
        </p>
        <AppButton disabled>Confirm import</AppButton>
        <p>
          Review and final import are not available yet. No chats, sources or notes have been added.
        </p>
      </div>
    </AppDialog>
  )
  return { controls, progress, afterIntakeExit, show, busy: state.busy || !!state.pending }
}
