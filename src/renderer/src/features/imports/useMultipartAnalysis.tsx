import type { ResearchTarget } from '../../app/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type {
  AnalysisRequest,
  AnalysisBundle,
  AnalysisValue
} from '../../../../shared/import-analysis'
import {
  MULTIPART_INSTRUCTIONS,
  type MultiPacket,
  type PlanPage,
  type PlanReview,
  type MultiValue,
  type MultiRequest
} from '../../../../shared/import-multipart'
import type { OpenInput } from '../../../../shared/projects'
import type { ImportRevision } from '../../../../shared/project-import'
import { sameScope } from '../../../../shared/project-files'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from '../ai-connections/connectionState'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton, ChoiceField, SelectField } from '../../components/ui/Controls'
import { ImportAnalysisText } from './ImportAnalysisText'
import styles from './ImportProvider.module.css'
import { useImportReview } from './useImportReview'
type Options = {
  scope: OpenInput | null
  revision: ImportRevision | null
  disabled: boolean
  intakeOpen: boolean
  closeIntake: () => void
  returnFocus: () => void
  completed: boolean
}
type State = {
  scope: OpenInput | null
  opened: boolean
  busy: boolean
  issue: string
  page: PlanPage | null
  offer: PlanReview | null
  consent: boolean
  limit: number
  part: MultiPacket | null
  attempt: AnalysisBundle | null
  proposal: Extract<MultiValue, { type: 'proposal-page' }> | null
  proposalOffset: number
  pending: Extract<MultiRequest, { action: 'plan-start' }> | null
}
const initial: State = {
  scope: null,
  opened: false,
  busy: false,
  issue: '',
  page: null,
  offer: null,
  consent: false,
  limit: 16,
  part: null,
  attempt: null,
  proposal: null,
  proposalOffset: 0,
  pending: null
}
export function useMultipartAnalysis(options: Options): {
  controls: ReactNode
  progress: ReactNode
  busy: boolean
  locked: boolean
  afterIntakeExit: () => boolean
} {
  const session = useWorkspaceSession(),
    connections = useAiConnections(),
    [state, render] = useState<State>(initial),
    owned = useRef(state),
    latest = useRef({ options, session, connections }),
    transfer = useRef(false),
    destination = useRef<{ scope: OpenInput; target: ResearchTarget } | null>(null),
    origin = useRef<{ element: HTMLElement | null; destination: string } | null>(null),
    reading = useRef(false),
    generation = useRef(0)
  useLayoutEffect(() => {
    latest.current = { options, session, connections }
  })
  function patch(update: Partial<State>): void {
    owned.current = { ...owned.current, ...update }
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
  async function run(work: () => Promise<void>): Promise<void> {
    if (owned.current.busy) return
    patch({ busy: true, issue: '' })
    try {
      await work()
    } catch (e) {
      patch({
        issue:
          e instanceof Error
            ? e.message
            : 'Progress could not be read. Check saved progress before continuing.'
      })
    } finally {
      patch({ busy: false })
    }
  }
  async function refresh(offset = owned.current.page?.offset ?? 0): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.page || !current(s.scope)) return
    const gen = generation.current,
      value = await request({ ...s.scope, action: 'plan-read', planId: s.page.plan.id, offset })
    if (gen !== generation.current || !current(s.scope) || value.type !== 'plan') return
    patch({
      page: value,
      ...(value.proposalId !== s.page.proposalId ? { proposal: null, proposalOffset: 0 } : {}),
      ...(s.pending && value.execution?.id === s.pending.operationId ? { pending: null } : {})
    })
    if (
      s.opened &&
      s.attempt &&
      ['not-sent', 'preparing', 'running', 'stopping'].includes(s.attempt.attempt.state)
    ) {
      const attempt = await request({
        ...s.scope,
        action: 'attempt',
        attemptId: s.attempt.attempt.id
      })
      if (
        gen === generation.current &&
        current(s.scope) &&
        owned.current.attempt?.attempt.id === s.attempt.attempt.id &&
        attempt.type === 'turn'
      )
        patch({ attempt: attempt.turn })
    }
  }
  const refreshRef = useRef(refresh)
  useLayoutEffect(() => {
    refreshRef.current = refresh
  })
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        reading.current ||
        owned.current.busy ||
        !owned.current.page ||
        !owned.current.scope ||
        !sameScope(owned.current.scope, latest.current.session.current.current)
      )
        return
      reading.current = true
      void refreshRef
        .current()
        .catch(() => {
          patch({
            issue:
              'Saved progress could not be read. Nothing is resent by reopening or checking progress.'
          })
        })
        .finally(() => {
          reading.current = false
        })
    }, 2000)
    return () => clearInterval(timer)
  }, [])
  const selection = `${options.scope?.projectId}:${options.scope?.workspaceId}:${options.revision?.id}`
  useEffect(() => {
    generation.current++
    patch({ offer: null, consent: false })
    if (
      owned.current.scope &&
      !sameScope(owned.current.scope, latest.current.session.current.current)
    )
      patch({ opened: false })
  }, [selection])
  const catalog = connections.status?.catalog
  const account = `${connections.status?.activeConnectionId}:${catalog?.state === 'loaded' ? catalog.revision : ''}:${catalog?.state === 'loaded' ? catalog.selectedModelId : ''}`
  useEffect(() => {
    patch({ offer: null, consent: false })
  }, [account])
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
        gen === generation.current &&
        owned.current.scope &&
        current(owned.current.scope) &&
        !live.closing &&
        !live.navigating &&
        !live.composition.current &&
        document.hasFocus() &&
        document.visibilityState === 'visible' &&
        !document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        patch({ opened: true })
    })
    return true
  }
  async function open(): Promise<void> {
    const { options: o, session: live } = latest.current
    if (
      !o.scope ||
      !o.revision?.graphId ||
      live.composition.current ||
      (owned.current.pending &&
        (!sameScope(o.scope, owned.current.scope) ||
          o.revision.graphId !== owned.current.page?.plan.graphId))
    )
      return
    origin.current = {
      element: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      destination: JSON.stringify(live.destination)
    }
    const scope = o.scope,
      revision = o.revision
    generation.current++
    patch({ scope, offer: null, consent: false, part: null, attempt: null, proposal: null })
    await run(async () => {
      const found = await window.collie.importAnalysis({
        ...scope,
        action: 'plan-find',
        batchId: revision.batchId,
        graphId: revision.graphId!
      })
      const value = found.ok
        ? found.value
        : found.error.code === 'NOT_FOUND' && !latest.current.options.disabled
          ? await request({
              ...scope,
              action: 'plan-prepare',
              batchId: revision.batchId,
              graphId: revision.graphId!,
              expectedRevision: revision.id
            })
          : (() => {
              throw new Error(found.error.message)
            })()
      if (!current(scope) || value.type !== 'plan') return
      patch({ page: value })
      if (value.execution?.phase !== 'running') {
        try {
          await request({ ...scope, action: 'reconcile' })
          await refresh(0)
        } catch {
          if (current(scope))
            patch({
              issue:
                'Saved analysis needs local reconciliation. Inspect its retained outcome or use the existing AI recovery controls; no request was resent.'
            })
        }
      }
      await latest.current.session.refreshConversationHead(scope)
      if (current(scope)) present()
    })
  }
  async function review(partId: string | null = null): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.page || !current(s.scope) || latest.current.options.disabled) return
    await run(async () => {
      const value = await request({
        ...s.scope!,
        action: 'plan-review',
        planId: s.page!.plan.id,
        proposalId: s.page!.proposalId,
        mode: partId ? 'reanalyze' : 'remaining',
        partId,
        limit: partId ? 1 : s.limit
      })
      if (value.type === 'plan-review' && current(s.scope!)) patch({ offer: value, consent: false })
    })
  }
  async function submitAuthorization(
    input: Extract<MultiRequest, { action: 'plan-start' }>
  ): Promise<void> {
    const reply = await window.collie.importAnalysis(input)
    if (!reply.ok) {
      if (
        ['STALE_REVISION', 'ACCESS_BUSY', 'DENIED', 'VALIDATION', 'LIMIT_EXCEEDED'].includes(
          reply.error.code
        )
      )
        patch({ pending: null, offer: null, consent: false })
      throw new Error(reply.error.message)
    }
  }
  async function start(): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.offer || !s.consent || !current(s.scope) || latest.current.options.disabled)
      return
    const input = s.pending ?? {
      ...s.scope,
      action: 'plan-start' as const,
      reviewId: s.offer.reviewId,
      operationId: crypto.randomUUID(),
      approve: true as const
    }
    patch({ pending: input })
    await run(async () => {
      await submitAuthorization(input)
      if (current(input)) {
        patch({ pending: null, offer: null, consent: false })
        await refresh()
      }
    })
  }
  async function inspect(partId: string, attemptId: string | null): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.page) return
    await run(async () => {
      const part = await request({
          ...s.scope!,
          action: 'part-read',
          planId: s.page!.plan.id,
          partId
        }),
        attempt = attemptId ? await request({ ...s.scope!, action: 'attempt', attemptId }) : null
      if (current(s.scope!) && part.type === 'part')
        patch({ part: part.packet, attempt: attempt?.type === 'turn' ? attempt.turn : null })
    })
  }
  async function local(action: 'protect' | 'acknowledge'): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.attempt) return
    await run(async () => {
      await request({ ...s.scope!, action, attemptId: s.attempt!.attempt.id })
      await refresh()
      const value = await request({
        ...s.scope!,
        action: 'attempt',
        attemptId: s.attempt!.attempt.id
      })
      if (current(s.scope!) && value.type === 'turn') patch({ attempt: value.turn })
      await latest.current.connections.checkStatus()
    })
  }
  async function proposal(offset: number): Promise<void> {
    const s = owned.current
    if (!s.scope || !s.page) return
    await run(async () => {
      const value = await request({
        ...s.scope!,
        action: 'proposal-read',
        planId: s.page!.plan.id,
        proposalId: s.page!.proposalId,
        offset
      })
      if (current(s.scope!) && value.type === 'proposal-page')
        patch({ proposal: value, proposalOffset: offset })
    })
  }
  useRetainedDraft('project-import-multipart', {
    read: () => ({
      scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
      kind: 'project-import-multipart',
      entityId: owned.current.page?.plan.id ?? null,
      label: 'Import analysis progress',
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
  const page = state.page,
    running = page?.execution?.phase === 'running',
    analysisBlocked = state.busy || !!state.pending || options.disabled || !!running,
    offer = state.offer
  const importReview = useImportReview({
    scope: state.scope,
    plan: page,
    disabled: analysisBlocked,
    onDestination: (target) => {
      if (owned.current.scope) {
        destination.current = { scope: owned.current.scope, target }
        patch({ opened: false })
      }
    },
    focus: () => {
      if (
        latest.current.options.intakeOpen ||
        !document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        present()
    }
  })
  const blocked = analysisBlocked || importReview.locked
  const controls = (
    <section className={styles.preview} aria-label="Multipart import analysis">
      <h2>{options.completed ? 'Completed import' : 'Analysis and review'}</h2>
      <p>
        {options.completed
          ? 'Read the saved report and open imported material. This does not send another request.'
          : 'Inspect progress, review proposed additions and confirm when ready. Analysis never adds material automatically.'}
      </p>
      <AppButton
        variant="default"
        disabled={state.busy || !options.revision?.graphId}
        onClick={() => void open()}
      >
        {options.completed ? 'View import report' : 'Review analysis plan / progress'}
      </AppButton>
      {state.issue && !state.opened ? <p role="alert">{state.issue}</p> : null}
    </section>
  )
  const progress = (
    <AppDialog
      title={
        importReview.completed
          ? 'Import report'
          : importReview.shown
            ? 'Review import'
            : 'Import analysis'
      }
      opened={state.opened}
      returnFocus={false}
      onClose={() => patch({ opened: false })}
      onExited={() => {
        const target = destination.current
        destination.current = null
        const source = origin.current
        // The exit callback precedes Mantine unmounting the old dialog.
        requestAnimationFrame(() => {
          const live = latest.current.session
          if (
            owned.current.opened ||
            !owned.current.scope ||
            !current(owned.current.scope) ||
            live.closing ||
            live.navigating ||
            live.composition.current ||
            !document.hasFocus() ||
            document.visibilityState !== 'visible' ||
            document.querySelector('[role="dialog"], [role="alertdialog"]') ||
            (document.activeElement !== document.body &&
              document.activeElement instanceof HTMLElement &&
              !document.activeElement.closest('[hidden], [inert]'))
          )
            return
          if (source?.destination !== JSON.stringify(live.destination)) return
          if (target) {
            if (sameScope(target.scope, live.current.current)) live.research(target.target)
            return
          }
          if (
            source.element?.isConnected &&
            !source.element.closest('[hidden], [inert]') &&
            !source.element.matches(':disabled, [aria-disabled="true"]') &&
            source.element.getClientRects().length
          ) {
            source.element.focus({ preventScroll: true })
          } else latest.current.options.returnFocus()
        })
      }}
    >
      <div className={styles.intake}>
        {state.issue ? <p role="alert">{state.issue}</p> : null}
        {page ? (
          <>
            {importReview.content}
            <details open={!importReview.shown && !importReview.completed}>
              <summary>Analysis progress and requests</summary>
              <p>
                <strong>
                  {page.completed} of {page.total} parts have valid protected results.
                </strong>{' '}
                {page.identified} fragments identified; {page.unresolved} covered fragments
                unresolved, unsupported or without selected content.{' '}
                {page.plan.fragments - page.identified - page.unresolved} fragments have no valid
                result.
              </p>
              <p>
                {page.remaining} never attempted · {page.failed} latest attempts need review ·{' '}
                {page.plan.excluded} records excluded by the saved selection. Fragment counts are
                not imported item counts.
              </p>
              {!page.current ? (
                <p role="alert">
                  This plan belongs to earlier choices. Reopen the current selection to prepare its
                  plan.
                </p>
              ) : null}
              {page.execution ? (
                <p role="status">
                  {running ? 'Analyzing' : 'Paused'} · {page.execution.used} of{' '}
                  {page.execution.ceiling} authorized requests reserved. {page.execution.reason}
                </p>
              ) : (
                <p>No active authorization. Reopening never sends remaining requests.</p>
              )}
              <div className={styles.actions}>
                <AppButton
                  variant="default"
                  disabled={state.busy}
                  onClick={() =>
                    void run(async () => {
                      await refresh()
                      if (state.scope)
                        await latest.current.session.refreshConversationHead(state.scope)
                    })
                  }
                >
                  Check saved progress
                </AppButton>
                {running ? (
                  <AppButton
                    variant="default"
                    disabled={state.busy}
                    onClick={() =>
                      void run(async () => {
                        if (state.scope) {
                          await request({
                            ...state.scope,
                            action: 'plan-stop',
                            planId: page.plan.id
                          })
                          await refresh()
                        }
                      })
                    }
                  >
                    Stop analysis
                  </AppButton>
                ) : null}
              </div>
              {state.pending ? (
                <>
                  <p role="alert">
                    The start reply is uncertain. Check saved progress or repeat this exact
                    authorization; repeating cannot create another run.
                  </p>
                  <AppButton
                    disabled={state.busy}
                    onClick={() =>
                      void run(async () => {
                        await submitAuthorization(state.pending!)
                        patch({ pending: null, offer: null, consent: false })
                        await refresh()
                      })
                    }
                  >
                    Check exact authorization
                  </AppButton>
                </>
              ) : null}
              <details>
                <summary>Files, instructions and sharing</summary>
                <p>
                  {page.plan.records} eligible records · {page.plan.fragments} fragments ·{' '}
                  {page.plan.inputUnits.toLocaleString()} input text units across {page.total}{' '}
                  requests. Original metadata and text ranges are retained; long messages continue
                  across parts.
                </p>
                <ul>
                  {page.plan.files.map((f) => (
                    <li key={f.id}>
                      {f.name}: {f.fragments} supplied fragments ·{' '}
                      {page.fileCoverage.find((c) => c.fileId === f.id)?.identified ?? 0} identified
                      · {page.fileCoverage.find((c) => c.fileId === f.id)?.unresolved ?? 0}{' '}
                      unresolved/unsupported ·{' '}
                      {f.fragments -
                        (page.fileCoverage.find((c) => c.fileId === f.id)?.identified ?? 0) -
                        (page.fileCoverage.find((c) => c.fileId === f.id)?.unresolved ?? 0)}{' '}
                      without a valid result
                    </li>
                  ))}
                </ul>
                <p>Instructions: {page.plan.instructions || 'None'}</p>
                <p>
                  Only selected-file names, metadata, eligible original text and relationships are
                  sent. No manuscript or other project context is sent. Your own selected ChatGPT
                  account processes these requests.
                </p>
                <ImportAnalysisText text={MULTIPART_INSTRUCTIONS} label="Analysis instructions" />
              </details>
              {!running && page.current ? (
                <>
                  <SelectField
                    label="Maximum requests for this continuation"
                    value={String(state.limit)}
                    disabled={blocked}
                    data={[1, 4, 16, 32, 64].map((n) => ({ value: String(n), label: String(n) }))}
                    onChange={(e) =>
                      patch({ limit: Number(e.currentTarget.value), offer: null, consent: false })
                    }
                  />
                  <AppButton
                    variant="default"
                    disabled={blocked || page.remaining === 0}
                    onClick={() => void review()}
                  >
                    Review remaining analysis
                  </AppButton>
                </>
              ) : null}
              {offer ? (
                <section aria-label="Confirm analysis sharing">
                  <p>
                    <strong>
                      {offer.mode === 'reanalyze'
                        ? 'Reanalyze one part'
                        : 'Resume never-attempted parts'}
                      : at most {offer.partIds.length} requests, one at a time.
                    </strong>{' '}
                    Model: {offer.model}. {offer.units.toLocaleString()} input text units (
                    {offer.bytes.toLocaleString()} UTF-8 bytes), plus fixed request instructions.
                    Each response is limited to 32,000 text units. No additional reconciliation
                    requests are authorized.
                  </p>
                  <p>
                    Stop, errors, account/model changes or restarting the app pause the run. Failed
                    or uncertain attempts are excluded from Resume remaining and require explicit
                    reanalysis. Earlier valid proposals stay retained.
                  </p>
                  <p>
                    Authorized part numbers:{' '}
                    {offer.partIds.map((id) => page.plan.parts.indexOf(id) + 1).join(', ')}. Inspect
                    their exact packets below before sending.
                  </p>
                  <ChoiceField
                    label="Send these disclosed parts to my selected ChatGPT account and model"
                    checked={state.consent}
                    disabled={blocked}
                    onChange={(e) => patch({ consent: e.currentTarget.checked })}
                  />
                  <AppButton disabled={blocked || !state.consent} onClick={() => void start()}>
                    Analyze authorized parts
                  </AppButton>
                </section>
              ) : null}
              <ol start={page.offset + 1} aria-label="Analysis parts">
                {page.rows.map((row) => (
                  <li key={row.id}>
                    Part {row.ordinal}: {row.fragments} fragments · {row.state} · {row.validation}
                    {row.selected ? ' · retained in current proposal' : ''}
                    <p>
                      {row.files
                        .map((id) => page.plan.files.find((f) => f.id === id)?.name ?? id)
                        .join(', ')}
                    </p>
                    <AppButton
                      variant="subtle"
                      disabled={state.busy}
                      onClick={() => void inspect(row.id, row.attemptId)}
                    >
                      Inspect part {row.ordinal}
                    </AppButton>
                    {row.attemptId && !running ? (
                      <AppButton
                        variant="subtle"
                        disabled={blocked || !page.current}
                        onClick={() => void review(row.id)}
                      >
                        Review reanalysis of part {row.ordinal}
                      </AppButton>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className={styles.actions}>
                <AppButton
                  variant="subtle"
                  disabled={state.busy || page.offset === 0}
                  onClick={() => void run(() => refresh(Math.max(0, page.offset - 50)))}
                >
                  Previous parts
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={state.busy || page.offset + page.rows.length >= page.total}
                  onClick={() => void run(() => refresh(page.offset + page.rows.length))}
                >
                  Next parts
                </AppButton>
              </div>
              {state.part ? (
                <details open>
                  <summary>Selected part payload and result</summary>
                  <ImportAnalysisText
                    key={state.part.partId}
                    text={JSON.stringify(state.part, null, 2)}
                    label="Exact part packet"
                  />
                  {state.attempt ? (
                    <>
                      <p>
                        Saved outcome: {state.attempt.attempt.state} ·{' '}
                        {state.attempt.attempt.validation}. {state.attempt.attempt.reason}
                      </p>
                      <ImportAnalysisText
                        key={state.attempt.attempt.id}
                        text={state.attempt.attempt.output}
                        label="Saved output, coverage and issues"
                      />
                      <div className={styles.actions}>
                        <AppButton
                          variant="subtle"
                          disabled={state.busy || !!running}
                          onClick={() => void local('protect')}
                        >
                          Retry local protection
                        </AppButton>
                        <AppButton
                          variant="subtle"
                          disabled={
                            state.busy ||
                            !!running ||
                            ['preparing', 'running', 'stopping'].includes(
                              state.attempt.attempt.state
                            )
                          }
                          onClick={() => void local('acknowledge')}
                        >
                          Dismiss retained outcome
                        </AppButton>
                      </div>
                    </>
                  ) : null}
                </details>
              ) : null}
              <details>
                <summary>Locally consolidated proposal</summary>
                <p>
                  Repeated fragments use the same record identity. Identity groups retain
                  conflicting originals and suggestions for later review. This summary shows up to
                  two title variants; full saved results retain every variant and issue.
                </p>
                <AppButton
                  variant="subtle"
                  disabled={state.busy || !page.proposalId}
                  onClick={() => void proposal(0)}
                >
                  Read current proposal
                </AppButton>
                {state.proposal ? (
                  <>
                    <p>
                      {state.proposal.total} identity groups. Proposal revision{' '}
                      {state.proposal.proposalId}.
                    </p>
                    <ul>
                      {state.proposal.items.map((g) => (
                        <li key={g.id}>
                          {g.kind}: {g.label} · {g.members} original records
                          {g.conflict ? ' · conflict needs review' : ''}
                          {g.variants.length ? <p>{g.variants.join(' / ')}</p> : null}
                        </li>
                      ))}
                    </ul>
                    <AppButton
                      variant="subtle"
                      disabled={state.busy || state.proposalOffset === 0}
                      onClick={() => void proposal(Math.max(0, state.proposalOffset - 50))}
                    >
                      Previous groups
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={
                        state.busy ||
                        state.proposalOffset + state.proposal.items.length >= state.proposal.total
                      }
                      onClick={() =>
                        void proposal(state.proposalOffset + state.proposal!.items.length)
                      }
                    >
                      Next groups
                    </AppButton>
                  </>
                ) : null}
              </details>
            </details>
          </>
        ) : null}
        <AppButton variant="default" onClick={() => patch({ opened: false })}>
          Dismiss progress
        </AppButton>
      </div>
    </AppDialog>
  )
  return {
    controls,
    progress,
    busy: state.busy || !!state.pending || importReview.busy,
    locked: state.busy || !!state.pending || !!running || importReview.locked,
    afterIntakeExit
  }
}
