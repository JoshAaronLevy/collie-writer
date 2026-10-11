import { retryableImportTask } from '../../../../shared/import-recovery'
import type {
  SemanticValue,
  SemanticRequest,
  SemanticSelection
} from '../../../../shared/import-semantic'
import type { DiscoveryValue, DiscoveryRequest } from '../../../../shared/import-discovery'
import type { MappingSelection } from '../../../../shared/import-graph'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnalysisRequest, AnalysisValue } from '../../../../shared/import-analysis'
import { type ImportSubmitBinding, type PlanPage } from '../../../../shared/import-multipart'
import type {
  AutomaticReviewRequest,
  ImportSummary,
  ReviewCounts,
  ReviewValue
} from '../../../../shared/import-review'
import {
  confirmationCommand,
  type ImportCommitCommand,
  type CommitValue
} from '../../../../shared/import-commit'
import type { OpenInput } from '../../../../shared/projects'
import type { ImportRevision } from '../../../../shared/project-import'
import { sameScope } from '../../../../shared/project-files'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from '../ai-connections/connectionState'
import { useRetainedDraft } from '../workspace/DraftOwner'

type Phase =
  | 'idle'
  | 'preparing'
  | 'extracting'
  | 'analyzing'
  | 'saving'
  | 'stopping'
  | 'paused'
  | 'ready'
  | 'importing'
  | 'checking'
  | 'complete'
type State = {
  scope: OpenInput | null
  intent: string | null
  restoreRevision: ImportRevision | null
  phase: Phase
  issue: string
  discovery: DiscoveryValue | SemanticValue | null
  retainedAttempts: number | null
  pendingDiscovery: Extract<
    DiscoveryRequest | SemanticRequest,
    { action: 'discovery-start' | 'semantic-start' }
  > | null
  page: PlanPage | null
  summary: ImportSummary | null
  conversations: ImportSummary['conversations']
  legacyAttemptId: string | null
  legacyValid: boolean
  localReviewId: string | null
  pendingLocal: Extract<AnalysisRequest, { action: 'review-local' }> | null
  pendingCommit: ImportCommitCommand | null
  pendingAutomatic: AutomaticReviewRequest | null
}
type SubmitInput = {
  scope: OpenInput
  intent: string
  binding?: ImportSubmitBinding
  readinessMessage?: string | null
  viewAvailable?: boolean
  continueAnalysis?: boolean
  interpreted: (
    revision: ImportRevision,
    semantic: SemanticSelection,
    sourceGraphId: string
  ) => Promise<ImportRevision>
  mapped: (
    revision: ImportRevision,
    mappings: MappingSelection[],
    sourceGraphId: string
  ) => Promise<ImportRevision>
  prepare: (isCancelled: () => boolean) => Promise<ImportRevision>
}
type Controller = State & {
  busy: boolean
  locked: boolean
  submit: (input: SubmitInput) => Promise<void>
  cancel: () => Promise<void>
  check: () => Promise<void>
  protect: (settleOutcome?: boolean) => Promise<void>
  canEdit: () => boolean
  canDismiss: () => boolean
  accept: () => Promise<void>
  restore: (scope: OpenInput, revision: ImportRevision, intent: string) => Promise<void>
  viewResults: () => Promise<void>
  reset: () => void
}
const initial = (): State => ({
  scope: null,
  intent: null,
  restoreRevision: null,
  phase: 'idle',
  issue: '',
  discovery: null,
  retainedAttempts: null,
  pendingDiscovery: null,
  page: null,
  summary: null,
  conversations: [],
  legacyAttemptId: null,
  legacyValid: false,
  localReviewId: null,
  pendingLocal: null,
  pendingCommit: null,
  pendingAutomatic: null
})
const processing = (phase: Phase): boolean =>
  ['preparing', 'extracting', 'analyzing', 'saving', 'stopping', 'importing', 'checking'].includes(
    phase
  )
const refused = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  [
    'STALE_REVISION',
    'ACCESS_BUSY',
    'DENIED',
    'VALIDATION',
    'LIMIT_EXCEEDED',
    'IMPORT_ANALYSIS_TOO_LARGE',
    'OPERATION_CONFLICT'
  ].includes(String(error.code))

/** One retained Submit/summary/Accept owner; main alone dispatches provider requests. */
export function useImportFlow(options: {
  focus: () => void
  ready: (scope: OpenInput) => void
  committed: (scope: OpenInput, counts: ReviewCounts) => void
}): Controller {
  const session = useWorkspaceSession(),
    connections = useAiConnections(),
    [state, render] = useState<State>(initial),
    owned = useRef(state),
    latest = useRef({ session, connections, options }),
    reading = useRef(false),
    driving = useRef(false),
    cancelled = useRef(false),
    mappedPrepare = useRef<SubmitInput['mapped'] | null>(null),
    submitted = useRef<SubmitInput | null>(null)
  useLayoutEffect(() => {
    latest.current = { session, connections, options }
  })
  function patch(update: Partial<State>): void {
    owned.current = { ...owned.current, ...update }
    render(owned.current)
    latest.current.session.drafts.changed()
  }
  function current(scope: OpenInput): boolean {
    return (
      sameScope(scope, owned.current.scope) &&
      sameScope(scope, latest.current.session.current.current)
    )
  }
  async function request(input: AnalysisRequest): Promise<AnalysisValue> {
    const reply = await window.collie.importAnalysis(input)
    if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code })
    return reply.value
  }
  function hasWork(scope: OpenInput): boolean {
    return !!latest.current.connections.status?.work.some(
      (w) => w.feature === 'import' && sameScope(w.scope, scope)
    )
  }
  function needsAttention(scope: OpenInput): boolean {
    return !!latest.current.connections.status?.work.some(
      (w) =>
        w.feature === 'import' &&
        sameScope(w.scope, scope) &&
        [
          'protection-required',
          'handoff-required',
          'record-unavailable',
          'retained-outcome'
        ].includes(w.state)
    )
  }
  async function showSummary(scope: OpenInput, summary: ImportSummary): Promise<void> {
    const history = await request({
      ...scope,
      action: 'list',
      batchId: summary.manifest.batchId,
      offset: 0
    })
    if (history.type !== 'list') throw new Error('The saved request count could not be read.')
    if (!current(scope) || cancelled.current) return
    patch({ retainedAttempts: history.total })
    if (summary.offset !== 0 || summary.total !== summary.manifest.counts.chats)
      throw new Error('The complete import summary could not be read.')
    const conversations = [...summary.conversations],
      manifest = JSON.stringify(summary.manifest)
    let isCurrent = summary.current
    while (conversations.length < summary.total) {
      if (!current(scope) || cancelled.current) return
      const page = await request({
        ...scope,
        action: 'import-summary',
        reviewId: summary.manifest.reviewId,
        manifestId: summary.manifest.id,
        offset: conversations.length
      })
      if (
        page.type !== 'import-summary' ||
        page.offset !== conversations.length ||
        !page.conversations.length ||
        page.total !== summary.total ||
        page.outcome !== summary.outcome ||
        page.omitted !== summary.omitted ||
        JSON.stringify(page.manifest) !== manifest
      )
        throw new Error('The complete import summary could not be read.')
      conversations.push(...page.conversations)
      isCurrent = isCurrent && page.current
    }
    if (
      conversations.length !== summary.total ||
      new Set(conversations.map((c) => c.id)).size !== conversations.length ||
      conversations.reduce((n, c) => n + c.messages, 0) !== summary.manifest.counts.messages
    )
      throw new Error('The complete import summary could not be read.')
    if (!current(scope) || cancelled.current) return
    patch({
      summary: { ...summary, current: isCurrent },
      conversations,
      phase: 'ready',
      ...(!isCurrent
        ? { issue: 'Your project changed. Check status to refresh the summary.' }
        : summary.manifest.version < 3 && owned.current.page?.problem
          ? {
              issue: `${owned.current.page.problem} ${
                summary.outcome === 'ready'
                  ? 'This summary includes only usable findings. Accept adds those findings; Cancel returns to setup.'
                  : 'No new content can be accepted from this summary. Cancel returns to setup.'
              }`
            }
          : { issue: '' })
    })
    latest.current.options.ready(scope)
  }
  async function flushEdits(scope: OpenInput): Promise<boolean> {
    if (
      !(await latest.current.session.flush(false, 'save', [
        'project-import-intake',
        'project-import-multipart'
      ]))
    )
      throw new Error(
        'Finish saving your project edits, then Submit again. Your files and findings are kept.'
      )
    return current(scope) && !cancelled.current
  }
  async function automaticSummary(
    scope: OpenInput,
    review: Extract<ReviewValue, { type: 'review-state' }>
  ): Promise<void> {
    if (!current(scope) || cancelled.current) return
    patch({ phase: 'saving', issue: '' })
    if (review.manifestId && !owned.current.pendingAutomatic) {
      const saved = await request({
        ...scope,
        action: 'import-summary',
        reviewId: review.review.id,
        manifestId: review.manifestId,
        offset: 0
      })
      if (saved.type !== 'import-summary') throw new Error('Saved findings could not be read.')
      if (!current(scope) || cancelled.current) return
      if (saved.current) {
        await showSummary(scope, saved)
        return
      }
    }
    const command = owned.current.pendingAutomatic ?? {
      ...scope,
      action: 'review-automatic' as const,
      reviewId: review.review.id,
      operationId: crypto.randomUUID(),
      expectedRevision: review.revisionId
    }
    patch({ pendingAutomatic: command })
    try {
      const summary = await request(command)
      if (summary.type !== 'import-summary')
        throw new Error('The saved result could not be confirmed.')
      if (!current(scope)) return
      patch({ summary, pendingAutomatic: null })
      await latest.current.session.refreshConversationHead(scope)
      if (cancelled.current) patch({ phase: 'paused' })
      else await showSummary(scope, summary)
    } catch (error) {
      if (refused(error)) patch({ pendingAutomatic: null })
      throw error
    }
  }
  async function prepareLocalResults(scope: OpenInput, revision: ImportRevision): Promise<void> {
    if (!revision.graphId) throw new Error('The selected files could not be prepared.')
    if (revision.settings.instructions.trim() && revision.version !== 4)
      throw new Error(
        'Submit explicitly to apply your instructions before preparing findings. Your files and instructions are kept.'
      )
    patch({ restoreRevision: revision, phase: 'extracting', issue: '' })
    if (!(await flushEdits(scope))) return
    const command = {
      ...scope,
      action: 'review-local' as const,
      batchId: revision.batchId,
      graphId: revision.graphId,
      expectedRevision: revision.id
    }
    patch({ pendingLocal: command })
    let review: AnalysisValue
    try {
      review = await request(command)
      if (
        review.type !== 'review-state' ||
        ![3, 4, 5].includes(review.review.version) ||
        !review.current
      )
        throw new Error('The local findings could not be confirmed. Check status to continue.')
    } catch (error) {
      if (refused(error)) patch({ pendingLocal: null })
      if (error instanceof Error && 'code' in error && error.code === 'ACCESS_BUSY')
        throw new Error(
          'Another AI or import operation needs to finish or be recovered. If this selection has earlier ChatGPT analysis, finish its recovery or start a new import. Your saved files and findings are kept.'
        )
      throw error
    }
    if (!current(scope)) return
    patch({ pendingLocal: null, localReviewId: review.review.id, page: null })
    await latest.current.session.refreshConversationHead(scope)
    if (cancelled.current) return
    await automaticSummary(scope, review)
  }
  async function prepareSemantic(input: SubmitInput, revision: ImportRevision): Promise<void> {
    if (revision.version === 4) {
      await prepareLocalResults(input.scope, revision)
      return
    }
    const value = await request({
      ...input.scope,
      action: 'semantic-prepare',
      graphId: revision.graphId!
    })
    if (value.type !== 'semantic') throw new Error('Interpretation could not be prepared.')
    if (!current(input.scope) || cancelled.current) return
    patch({ discovery: value })
    await latest.current.session.refreshConversationHead(input.scope)
    if (!value.tasks.length && !value.reason) {
      await prepareLocalResults(input.scope, revision)
      return
    }
    if (!value.tasks.some((t) => retryableImportTask(t) || t.state === 'pending')) {
      await finishDiscovery(input.scope, value)
      return
    }
    if (value.tasks.some((t) => t.state === 'pending'))
      throw new Error(
        'A saved interpretation response needs recovery. Check status before continuing.'
      )
    if (!input.binding)
      throw new Error(
        `ChatGPT is needed to interpret this content. ${input.readinessMessage || 'Connect ChatGPT and choose a model, then Submit again.'} Your files and findings are kept.`
      )
    const command = {
      ...input.scope,
      action: 'semantic-start' as const,
      graphId: value.graphId,
      operationId: crypto.randomUUID(),
      submission: input.binding
    }
    patch({ pendingDiscovery: command, phase: 'analyzing', issue: '' })
    try {
      const started = await request(command)
      if (started.type !== 'semantic')
        throw new Error('Check saved interpretation status before continuing.')
      if (!current(input.scope)) return
      patch({ pendingDiscovery: null, discovery: started })
      if (cancelled.current)
        await request({ ...input.scope, action: 'semantic-stop', graphId: value.graphId })
    } catch (error) {
      if (refused(error)) patch({ pendingDiscovery: null })
      throw error
    }
  }
  async function finishDiscovery(
    scope: OpenInput,
    value: DiscoveryValue | SemanticValue,
    partial = false
  ): Promise<void> {
    if (!current(scope) || cancelled.current) return
    const revision = owned.current.restoreRevision
    if (!revision || !mappedPrepare.current)
      throw new Error('Submit explicitly to prepare your saved findings.')
    const input = submitted.current
    if (!input || !sameScope(input.scope, scope) || input.intent !== owned.current.intent)
      throw new Error('Submit explicitly to prepare your saved findings.')
    if (value.type === 'semantic') {
      patch({ phase: 'extracting', issue: '' })
      if (!(await flushEdits(scope)) || cancelled.current) return
      const updated = await input.interpreted(
        revision,
        {
          planId: value.planId,
          attempts: value.tasks
            .filter((t) => t.state === 'valid' && t.attemptId)
            .map((t) => t.attemptId!)
        },
        value.graphId
      )
      if (!current(scope) || cancelled.current) return
      patch({ restoreRevision: updated })
      await prepareLocalResults(scope, updated)
      const issue = value.tasks.find((t) => t.reason)?.reason || value.reason
      if (issue && current(scope)) patch({ issue })
      return
    }
    const mappings = value.tasks
      .filter((t) => t.normalizationId && t.attemptId)
      .map((t) => ({ normalizationId: t.normalizationId!, attemptId: t.attemptId! }))
    const issue = value.tasks.find((t) => t.reason)?.reason || value.reason
    patch({ phase: 'extracting', issue })
    if (!(await flushEdits(scope)) || cancelled.current) return
    const updated = mappings.length
      ? await mappedPrepare.current(revision, mappings, value.graphId)
      : revision
    if (!current(scope) || cancelled.current) return
    patch({ restoreRevision: updated })
    if (partial) await prepareLocalResults(scope, updated)
    else await prepareSemantic(input, updated)
    if (issue && current(scope)) patch({ issue })
  }
  async function prepareDiscovery(input: SubmitInput, revision: ImportRevision): Promise<void> {
    if (!revision.graphId) throw new Error('The selected files could not be read.')
    if (revision.settings.instructions.trim()) {
      await prepareSemantic(input, revision)
      return
    }
    if (revision.version === 3 || revision.version === 4) {
      await prepareSemantic(input, revision)
      return
    }
    const result = await request({
      ...input.scope,
      action: 'discovery-prepare',
      graphId: revision.graphId
    })
    if (result.type !== 'discovery') throw new Error('Structure discovery could not be prepared.')
    if (!current(input.scope) || cancelled.current) return
    patch({ discovery: result })
    await latest.current.session.refreshConversationHead(input.scope)
    let value = result
    for (const t of value.tasks.filter(
      (t) => t.state === 'valid' && !t.normalizationId && t.attemptId
    )) {
      const applied = await request({
        ...input.scope,
        action: 'discovery-apply',
        graphId: value.graphId,
        attemptId: t.attemptId!
      })
      if (applied.type !== 'discovery') throw new Error('The saved mapping could not be applied.')
      value = applied
      patch({ discovery: value })
      if (cancelled.current || !current(input.scope)) return
    }
    if (
      !value.tasks.length ||
      !value.tasks.some((t) => retryableImportTask(t) || t.state === 'pending')
    ) {
      await finishDiscovery(input.scope, value)
      return
    }
    if (value.tasks.some((t) => t.state === 'pending'))
      throw new Error(
        'A retained structure response needs recovery. Check status or finish local protection before continuing.'
      )
    if (!input.binding)
      throw new Error(
        `ChatGPT is needed to understand this JSON structure. ${input.readinessMessage || 'Connect ChatGPT and choose an available model, then Submit again.'} Your files and local findings are kept.`
      )
    const command = {
      ...input.scope,
      action: 'discovery-start' as const,
      graphId: value.graphId,
      operationId: crypto.randomUUID(),
      submission: input.binding
    }
    patch({ pendingDiscovery: command, phase: 'analyzing', issue: '' })
    try {
      const started = await request(command)
      if (started.type !== 'discovery')
        throw new Error('Check status before continuing structure discovery.')
      if (!current(input.scope)) return
      patch({ pendingDiscovery: null, discovery: started })
      if (cancelled.current)
        await request({ ...input.scope, action: 'discovery-stop', graphId: value.graphId })
    } catch (error) {
      if (refused(error)) patch({ pendingDiscovery: null })
      throw error
    }
  }
  /** Compatibility for already-retained AI results; new selections never create AI plans. */
  async function prepareResults(scope: OpenInput, page: PlanPage): Promise<void> {
    if (
      !current(scope) ||
      cancelled.current ||
      !page.current ||
      (page.completed === 0 && !owned.current.legacyValid)
    )
      return
    patch({ phase: 'saving', issue: '' })
    if (!(await flushEdits(scope))) return
    const review = await request({
      ...scope,
      ...(owned.current.legacyValid && owned.current.legacyAttemptId
        ? {
            action: 'review-legacy' as const,
            planId: page.plan.id,
            attemptId: owned.current.legacyAttemptId
          }
        : { action: 'review-open' as const, planId: page.plan.id, proposalId: page.proposalId })
    })
    if (review.type !== 'review-state') throw new Error('Saved findings could not be prepared.')
    await automaticSummary(scope, review)
  }
  function stoppedIssue(page: PlanPage): string {
    const reason = page.problem || 'Analysis is paused.',
      findings = page.completed
        ? 'View available results to review what is ready, then Accept to add it to your project.'
        : 'No usable findings are ready to import yet.',
      next = 'Check status to finish recovery, then use the new importer with your retained files.'
    return `${reason} ${findings} ${next}`
  }
  async function refresh(allowPreparation = false): Promise<void> {
    const s = owned.current
    if (!s.scope || !current(s.scope)) return
    if (!s.page) {
      if (s.legacyAttemptId) {
        const value = await request({ ...s.scope, action: 'attempt', attemptId: s.legacyAttemptId })
        if (current(s.scope) && value.type === 'turn')
          patch({ legacyValid: value.turn.attempt.validation === 'valid' })
      }
      if (!hasWork(s.scope) || needsAttention(s.scope)) patch({ phase: 'paused' })
      return
    }
    const value = await request({
      ...s.scope,
      action: 'plan-read',
      planId: s.page.plan.id,
      offset: 0
    })
    if (!current(s.scope) || value.type !== 'plan' || owned.current.page?.plan.id !== value.plan.id)
      return
    patch({ page: value })
    if (cancelled.current) {
      if (!hasWork(s.scope) || needsAttention(s.scope)) patch({ phase: 'paused', issue: '' })
      return
    }
    if (hasWork(s.scope)) {
      if (needsAttention(s.scope))
        patch({
          phase: 'paused',
          issue: `${value.problem || 'Saved analysis needs local recovery.'} Use Finish recovery or Try saving again below, then view available results or use the new importer.`
        })
      return
    }
    if (allowPreparation && value.completed > 0) {
      await prepareResults(s.scope, value)
    } else if (processing(owned.current.phase) || owned.current.phase === 'paused')
      patch({
        phase: 'paused',
        issue: stoppedIssue(value)
      })
  }
  async function poll(): Promise<void> {
    if (
      reading.current ||
      driving.current ||
      (!owned.current.page && !owned.current.legacyAttemptId && !owned.current.discovery) ||
      !processing(owned.current.phase) ||
      ['saving', 'importing', 'checking'].includes(owned.current.phase)
    )
      return
    reading.current = true
    try {
      const s = owned.current
      if (s.discovery && s.scope) {
        const value = await request({
          ...s.scope,
          action: s.discovery.type === 'semantic' ? 'semantic-read' : 'discovery-read',
          graphId: s.discovery.graphId
        })
        if (value.type !== 'discovery' && value.type !== 'semantic')
          throw new Error('The saved structure progress could not be read.')
        if (!current(s.scope)) return
        patch({ discovery: value })
        if (value.execution?.phase === 'running') return
        await latest.current.connections.checkStatus()
        if (needsAttention(s.scope)) {
          patch({
            phase: 'paused',
            issue:
              value.execution?.reason ||
              'The response needs local recovery. Check status or finish recovery before continuing.'
          })
          return
        }
        if (value.tasks.some((t) => retryableImportTask(t) || t.state === 'pending')) {
          patch({
            phase: 'paused',
            issue:
              value.execution?.reason ||
              (value.type === 'semantic'
                ? 'Content analysis paused. Continue explicitly to process unfinished content, up to 32 requests per run.'
                : 'Structure analysis paused. Continue explicitly to process unfinished structures, up to 8 requests per run.')
          })
          return
        }
        await finishDiscovery(s.scope, value)
      } else await refresh(true)
    } catch (error) {
      patch({
        phase: 'paused',
        issue:
          error instanceof Error ? error.message : 'Check the saved analysis before continuing.'
      })
    } finally {
      reading.current = false
    }
  }
  const pollRef = useRef(poll)
  useLayoutEffect(() => {
    pollRef.current = poll
  })
  useEffect(() => {
    const timer = setInterval(() => {
      void pollRef.current()
    }, 1500)
    const unsubscribe = window.collie.onImportAnalysisChanged(() => {
      void pollRef.current()
    })
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [])
  async function restore(
    scope: OpenInput,
    revision: ImportRevision,
    intent: string
  ): Promise<void> {
    if (driving.current || reading.current || processing(owned.current.phase)) return
    if (sameScope(scope, owned.current.scope) && owned.current.intent === intent) return
    if (
      owned.current.pendingCommit ||
      owned.current.pendingAutomatic ||
      owned.current.pendingDiscovery ||
      owned.current.pendingLocal
    )
      return
    reading.current = true
    cancelled.current = false
    patch({ ...initial(), scope, intent, restoreRevision: revision, phase: 'checking' })
    try {
      const accepted = await request({
        ...scope,
        action: 'import-report',
        batchId: revision.batchId,
        offset: 0
      })
      if (!current(scope)) return
      if (accepted.type !== 'import-committed')
        throw new Error('The saved import outcome could not be checked.')
      if (accepted.receipt) {
        await complete(scope, accepted, accepted.receipt.command)
        return
      }
      if (!revision.graphId) return
      const found = await request({
        ...scope,
        action: 'review-find',
        batchId: revision.batchId,
        graphId: revision.graphId
      })
      if (!current(scope) || found.type !== 'review-found') return
      if (found.local) patch({ localReviewId: found.reviewId })
      if (found.legacyAttemptId) {
        const attempt = await request({
          ...scope,
          action: 'attempt',
          attemptId: found.legacyAttemptId
        })
        if (attempt.type !== 'turn') throw new Error('Saved analysis could not be read.')
        patch({
          legacyAttemptId: found.legacyAttemptId,
          legacyValid: attempt.turn.attempt.validation === 'valid'
        })
      }
      const progress = await request({
        ...scope,
        action: 'hybrid-progress',
        graphId: revision.graphId
      })
      const discovered = progress.type === 'hybrid-progress' ? progress.progress : null
      if (
        (discovered?.type === 'discovery' || discovered?.type === 'semantic') &&
        (discovered.tasks.length || discovered.reason)
      ) {
        patch({ discovery: discovered })
        await request({ ...scope, action: 'reconcile' })
        await latest.current.connections.checkStatus()
      }
      if (!found.local && !owned.current.discovery) {
        const plan = await window.collie.importAnalysis({
          ...scope,
          action: 'plan-find',
          batchId: revision.batchId,
          graphId: revision.graphId
        })
        if (!current(scope)) return
        if (plan.ok && plan.value.type === 'plan')
          patch({
            page: plan.value,
            ...(plan.value.completed ? { legacyAttemptId: null, legacyValid: false } : {})
          })
        else if (!plan.ok && plan.error.code !== 'NOT_FOUND') throw new Error(plan.error.message)
        if (owned.current.page || owned.current.legacyAttemptId || hasWork(scope)) {
          await request({ ...scope, action: 'reconcile' })
          await latest.current.connections.checkStatus()
          if (!current(scope)) return
        }
      }
      if (found.reviewId && found.manifestId) {
        const summary = await request({
          ...scope,
          action: 'import-summary',
          reviewId: found.reviewId,
          manifestId: found.manifestId,
          offset: 0
        })
        if (!current(scope)) return
        if (summary.type !== 'import-summary') throw new Error('Saved findings could not be read.')
        patch({ summary, pendingCommit: confirmationCommand(summary.manifest) })
        const outcome = await request({
          ...scope,
          action: 'import-outcome',
          command: confirmationCommand(summary.manifest)
        })
        if (outcome.type !== 'import-committed')
          throw new Error('The saved import outcome could not be checked.')
        if (outcome.receipt) {
          await complete(scope, outcome, confirmationCommand(summary.manifest))
          return
        }
        patch({ pendingCommit: null })
        await showSummary(scope, summary)
      } else
        patch({
          phase:
            owned.current.discovery?.execution?.phase === 'running' ||
            (hasWork(scope) && !needsAttention(scope))
              ? 'analyzing'
              : found.local ||
                  owned.current.discovery ||
                  owned.current.page ||
                  owned.current.legacyAttemptId
                ? 'paused'
                : 'idle',
          issue: owned.current.discovery
            ? owned.current.discovery.execution?.reason ||
              owned.current.discovery.tasks.find((t) => t.reason)?.reason ||
              'Your saved findings are kept. Continue explicitly when ChatGPT is available.'
            : found.local
              ? 'Your local findings are kept. Submit to prepare the summary.'
              : owned.current.legacyAttemptId && !owned.current.legacyValid
                ? 'Earlier analysis is kept. Check status to finish recovery, then choose Use new importer.'
                : owned.current.page && !hasWork(scope)
                  ? stoppedIssue(owned.current.page)
                  : ''
        })
    } catch (error) {
      patch({
        phase: 'paused',
        issue: error instanceof Error ? error.message : 'Check status to recover your saved import.'
      })
    } finally {
      reading.current = false
      if (owned.current.phase === 'checking') patch({ phase: 'idle' })
      latest.current.session.drafts.changed()
    }
  }
  async function viewResults(): Promise<void> {
    const s = owned.current
    if (!s.scope || !current(s.scope) || !canEdit()) return
    driving.current = true
    cancelled.current = false
    patch({ phase: 'saving', issue: '' })
    try {
      if (s.summary) {
        const summary = await request({
          ...s.scope,
          action: 'import-summary',
          reviewId: s.summary.manifest.reviewId,
          manifestId: s.summary.manifest.id,
          offset: 0
        })
        if (summary.type !== 'import-summary') throw new Error('Saved findings could not be read.')
        if (summary.current) await showSummary(s.scope, summary)
        else await updateSummary(s.scope)
      } else if (s.discovery) {
        const saved = await window.collie.projectImport({
          ...s.scope,
          action: 'read',
          batchId: s.discovery.batchId,
          revisionId: null,
          offset: 0
        })
        if (!saved.ok || saved.value.type !== 'batch')
          throw new Error('The saved selection could not be read.')
        const input = submitted.current
        if (!input || !sameScope(input.scope, s.scope) || input.intent !== s.intent)
          throw new Error(
            'Submit once to reconnect this saved selection, then view available results. Nothing will be sent without your explicit Submit.'
          )
        patch({ restoreRevision: saved.value.revision })
        await finishDiscovery(s.scope, s.discovery, true)
      } else if (s.localReviewId && s.restoreRevision)
        await prepareLocalResults(s.scope, s.restoreRevision)
      else if (s.page) await prepareResults(s.scope, s.page)
      else if (s.legacyValid && s.legacyAttemptId) {
        if (
          !(await latest.current.session.flush(false, 'save', [
            'project-import-intake',
            'project-import-multipart'
          ]))
        )
          throw new Error('Finish saving your project edits, then view the saved findings.')
        const attempt = await request({
          ...s.scope,
          action: 'attempt',
          attemptId: s.legacyAttemptId
        })
        if (!current(s.scope) || cancelled.current || attempt.type !== 'turn') return
        const saved = await window.collie.projectImport({
          ...s.scope,
          action: 'read',
          batchId: attempt.turn.capture.packet.batchId,
          revisionId: null,
          offset: 0
        })
        if (!saved.ok) throw new Error(saved.error.message)
        if (saved.value.type !== 'batch' || !current(s.scope) || cancelled.current) return
        const plan = await request({
          ...s.scope,
          action: 'plan-prepare',
          batchId: saved.value.revision.batchId,
          graphId: attempt.turn.capture.packet.graphId,
          expectedRevision: saved.value.revision.id
        })
        if (plan.type !== 'plan') throw new Error('Saved findings could not be prepared.')
        patch({ page: plan })
        await prepareResults(s.scope, plan)
      }
    } catch (error) {
      patch({
        phase: 'paused',
        issue: error instanceof Error ? error.message : 'Saved findings could not be prepared.'
      })
    } finally {
      driving.current = false
      if (owned.current.phase === 'saving' || (cancelled.current && !hasWork(s.scope)))
        patch({ phase: 'paused' })
      latest.current.session.drafts.changed()
    }
  }
  function reset(): void {
    if (canEdit()) {
      cancelled.current = false
      patch(initial())
    }
  }
  async function submit(input: SubmitInput): Promise<void> {
    if (
      driving.current ||
      reading.current ||
      processing(owned.current.phase) ||
      owned.current.pendingDiscovery ||
      owned.current.pendingLocal ||
      owned.current.pendingAutomatic ||
      owned.current.pendingCommit
    )
      return
    submitted.current = input
    mappedPrepare.current = input.mapped
    driving.current = true
    cancelled.current = false
    const prior = owned.current,
      sameIntent = prior.intent === input.intent && sameScope(prior.scope, input.scope)
    patch({
      scope: input.scope,
      intent: input.intent,
      phase: 'preparing',
      issue: '',
      ...(!sameIntent
        ? {
            discovery: null,
            page: null,
            summary: null,
            conversations: [],
            legacyAttemptId: null,
            legacyValid: false,
            localReviewId: null
          }
        : {})
    })
    try {
      if (sameIntent && prior.discovery && input.viewAvailable && !prior.summary) {
        const active = await window.collie.projectImport({
          ...input.scope,
          action: 'read',
          batchId: prior.discovery.batchId,
          revisionId: null,
          offset: 0
        })
        if (!active.ok || active.value.type !== 'batch')
          throw new Error('Your retained selection could not be read.')
        patch({ restoreRevision: active.value.revision })
        await finishDiscovery(input.scope, prior.discovery, true)
        return
      }
      if (sameIntent && prior.summary && !input.continueAnalysis) {
        const saved = await request({
          ...input.scope,
          action: 'import-summary',
          reviewId: prior.summary.manifest.reviewId,
          manifestId: prior.summary.manifest.id,
          offset: 0
        })
        if (!current(input.scope) || cancelled.current) return
        if (saved.type === 'import-summary' && saved.current) {
          await showSummary(input.scope, saved)
          return
        }
        if (saved.type === 'import-summary') {
          await updateSummary(input.scope)
          return
        }
        throw new Error('The saved summary could not be confirmed. Check status to continue.')
      }
      if (sameIntent && (prior.page || prior.legacyAttemptId)) {
        if (prior.page?.completed || prior.legacyValid) {
          patch({ ...prior, phase: 'paused' })
          driving.current = false
          await viewResults()
          return
        }
        throw new Error(
          'Earlier analysis is kept. Check status to finish any recovery, then choose Use new importer to read the retained files locally.'
        )
      }
      if (sameIntent && prior.discovery && input.continueAnalysis) {
        const original = await window.collie.projectImport({
          ...input.scope,
          action: 'read',
          batchId: prior.discovery.batchId,
          revisionId: prior.discovery.revisionId,
          offset: 0
        })
        const active = await window.collie.projectImport({
          ...input.scope,
          action: 'read',
          batchId: prior.discovery.batchId,
          revisionId: null,
          offset: 0
        })
        if (
          !original.ok ||
          original.value.type !== 'batch' ||
          !active.ok ||
          active.value.type !== 'batch'
        )
          throw new Error('The retained import evidence could not be read.')
        patch({ restoreRevision: active.value.revision, summary: null })
        if (prior.discovery.type === 'semantic')
          await prepareSemantic(input, original.value.revision)
        else await prepareDiscovery(input, original.value.revision)
        return
      }
      const revision = await input.prepare(() => cancelled.current || !current(input.scope))
      if (!current(input.scope)) return
      patch({ restoreRevision: revision })
      if (cancelled.current) return
      await prepareDiscovery(input, revision)
      return
    } catch (error) {
      if (current(input.scope))
        patch({
          phase: 'paused',
          issue:
            error instanceof Error
              ? error.message
              : 'Import preparation could not finish. Your selection is kept.'
        })
    } finally {
      driving.current = false
      if (current(input.scope) && cancelled.current)
        patch({ phase: hasWork(input.scope) ? 'stopping' : 'paused' })
      latest.current.session.drafts.changed()
    }
  }
  async function cancel(): Promise<void> {
    if (
      ['importing', 'checking', 'complete'].includes(owned.current.phase) ||
      owned.current.pendingCommit
    )
      return
    cancelled.current = true // latch before any IPC/await: no subsequent start is permitted
    patch({ phase: 'stopping', issue: '' })
    const s = owned.current
    try {
      if (s.scope && s.discovery && current(s.scope)) {
        await request({
          ...s.scope,
          action: s.discovery.type === 'semantic' ? 'semantic-stop' : 'discovery-stop',
          graphId: s.discovery.graphId
        })
        await latest.current.connections.checkStatus()
      } else if (s.scope && s.page && current(s.scope)) {
        // Legacy grants do not survive an upgrade; only an exact retained operation can run.
        for (const work of latest.current.connections.status?.work.filter(
          (w) => w.feature === 'import' && sameScope(w.scope, s.scope) && w.state === 'running'
        ) ?? [])
          await request({ ...s.scope, action: 'cancel', attemptId: work.attemptId })
        await refresh(false)
      } else if (s.scope && s.legacyAttemptId && current(s.scope)) {
        for (const work of latest.current.connections.status?.work.filter(
          (w) => w.feature === 'import' && sameScope(w.scope, s.scope) && w.state === 'running'
        ) ?? [])
          await request({ ...s.scope, action: 'cancel', attemptId: work.attemptId })
        await latest.current.connections.checkStatus()
      }
      if (!driving.current && s.scope && !hasWork(s.scope)) patch({ phase: 'paused' })
    } catch (error) {
      patch({
        phase: 'paused',
        issue: error instanceof Error ? error.message : 'Check analysis status to finish stopping.'
      })
    }
  }
  async function check(): Promise<void> {
    if (driving.current || reading.current) return
    const s = owned.current
    if (!s.scope || !current(s.scope) || s.phase === 'complete') return
    if (s.discovery && !s.pendingCommit && !s.pendingLocal && !s.pendingAutomatic) {
      reading.current = true
      try {
        await request({ ...s.scope, action: 'reconcile' })
        const value = await request({
          ...s.scope,
          action: s.discovery.type === 'semantic' ? 'semantic-read' : 'discovery-read',
          graphId: s.discovery.graphId
        })
        if ((value.type === 'discovery' || value.type === 'semantic') && current(s.scope)) {
          patch({
            discovery: value,
            pendingDiscovery: null,
            phase: value.execution?.phase === 'running' ? 'analyzing' : 'paused',
            issue:
              value.execution?.reason ||
              value.tasks.find((t) => t.reason)?.reason ||
              'Saved findings are kept. Submit explicitly to continue.'
          })
          await latest.current.connections.checkStatus()
        }
      } catch (error) {
        patch({
          phase: 'paused',
          issue:
            error instanceof Error ? error.message : 'Check the saved response before continuing.'
        })
      } finally {
        reading.current = false
      }
      return
    }
    cancelled.current = false // explicit read/recovery, never a provider send or replay
    reading.current = true
    try {
      if (s.pendingCommit) {
        patch({ phase: 'checking', issue: '' })
        await checkCommit(s.scope, s.pendingCommit)
        return
      }
      if (s.pendingLocal) {
        patch({ phase: 'checking', issue: '' })
        const found = await request({
          ...s.scope,
          action: 'review-find',
          batchId: s.pendingLocal.batchId,
          graphId: s.pendingLocal.graphId
        })
        if (!current(s.scope) || found.type !== 'review-found')
          throw new Error('The saved local findings could not be checked.')
        patch({ pendingLocal: null, localReviewId: found.local ? found.reviewId : null })
        if (found.local && found.reviewId && found.manifestId) {
          const summary = await request({
            ...s.scope,
            action: 'import-summary',
            reviewId: found.reviewId,
            manifestId: found.manifestId,
            offset: 0
          })
          if (summary.type !== 'import-summary')
            throw new Error('Saved findings could not be read.')
          await showSummary(s.scope, summary)
        } else
          patch({
            phase: 'paused',
            issue: found.local
              ? 'Your local findings are kept. Submit to prepare the summary.'
              : 'Local findings were not saved. Submit to try again with your retained files.'
          })
        await latest.current.session.refreshConversationHead(s.scope)
        return
      }
      if (s.page || s.legacyAttemptId || hasWork(s.scope)) {
        await request({ ...s.scope, action: 'reconcile' })
        await latest.current.connections.checkStatus()
      }
      if (
        !s.page &&
        !s.summary &&
        !s.legacyAttemptId &&
        s.restoreRevision &&
        s.intent &&
        !s.pendingAutomatic
      ) {
        reading.current = false
        patch({ intent: null, phase: 'paused' })
        await restore(s.scope, s.restoreRevision, s.intent)
        return
      }
      if (s.pendingAutomatic) {
        const result = await request({
          ...s.scope,
          action: 'review-reconcile',
          command: s.pendingAutomatic
        })
        if (result.type === 'import-summary') {
          patch({ pendingAutomatic: null, issue: '' })
          await showSummary(s.scope, result)
        } else if (result.type === 'review-unapplied')
          patch({
            pendingAutomatic: null,
            phase: 'paused',
            issue: 'The summary was not saved. Submit again to prepare your saved findings.'
          })
      }
      if (s.summary && !s.pendingAutomatic && !cancelled.current) {
        const summary = await request({
          ...s.scope,
          action: 'import-summary',
          reviewId: s.summary.manifest.reviewId,
          manifestId: s.summary.manifest.id,
          offset: 0
        })
        if (summary.type === 'import-summary') {
          if (summary.current) await showSummary(s.scope, summary)
          else await updateSummary(s.scope)
        }
      }
      if (s.legacyAttemptId) {
        const attempt = await request({
          ...s.scope,
          action: 'attempt',
          attemptId: s.legacyAttemptId
        })
        if (attempt.type === 'turn')
          patch({ legacyValid: attempt.turn.attempt.validation === 'valid' })
      }
      if (s.page) {
        await refresh(false)
      }
      await latest.current.session.refreshConversationHead(s.scope)
    } catch (error) {
      patch({
        phase: owned.current.summary ? 'ready' : 'paused',
        issue: owned.current.pendingCommit
          ? 'The import outcome is still unknown. Check status before trying again.'
          : error instanceof Error
            ? error.message
            : 'Import status could not be checked.'
      })
    } finally {
      reading.current = false
      latest.current.session.drafts.changed()
    }
  }
  async function protect(settleOutcome = false): Promise<void> {
    if (driving.current || reading.current) return
    const s = owned.current
    if (!s.scope || !current(s.scope)) return
    const work = latest.current.connections.status?.work.find(
      (w) =>
        w.feature === 'import' &&
        sameScope(w.scope, s.scope) &&
        (settleOutcome
          ? w.state === 'retained-outcome'
          : ['protection-required', 'handoff-required', 'record-unavailable'].includes(w.state))
    )
    if (!work) return
    reading.current = true
    patch({ phase: 'saving', issue: '' })
    try {
      const targets = settleOutcome
        ? (latest.current.connections.status?.work.filter(
            (w) =>
              w.feature === 'import' &&
              sameScope(w.scope, s.scope) &&
              w.state === 'retained-outcome'
          ) ?? [])
        : [work]
      for (const target of targets) {
        if (!current(s.scope)) return
        await request({
          ...s.scope,
          action: settleOutcome ? 'acknowledge' : 'protect',
          attemptId: target.attemptId
        })
      }
      await latest.current.connections.checkStatus()
      await refresh(!cancelled.current)
    } catch (error) {
      patch({
        phase: 'paused',
        issue: error instanceof Error ? error.message : 'The response could not be saved locally.'
      })
    } finally {
      reading.current = false
      if (owned.current.phase === 'saving') patch({ phase: 'analyzing' })
      latest.current.session.drafts.changed()
    }
  }
  async function updateSummary(scope: OpenInput): Promise<void> {
    const summary = owned.current.summary
    if (!summary || !current(scope)) return
    patch({ summary: { ...summary, current: false }, phase: 'saving', issue: '' })
    if (summary.manifest.version >= 3) {
      const saved = await window.collie.projectImport({
        ...scope,
        action: 'read',
        batchId: summary.manifest.batchId,
        revisionId: null,
        offset: 0
      })
      if (!saved.ok) throw new Error(saved.error.message)
      if (saved.value.type !== 'batch' || saved.value.revision.graphId !== summary.manifest.graphId)
        throw new Error('Your import selection changed. Return to setup and Submit again.')
      await prepareLocalResults(scope, saved.value.revision)
    } else {
      if (!summary.manifest.planId) throw new Error('The saved analysis could not be read.')
      const page = await request({
        ...scope,
        action: 'plan-read',
        planId: summary.manifest.planId,
        offset: 0
      })
      if (
        page.type !== 'plan' ||
        !page.current ||
        (page.completed === 0 && !owned.current.legacyValid)
      )
        throw new Error(
          'These findings are no longer current. Return to setup to review your selection.'
        )
      patch({ page })
      await prepareResults(scope, page)
    }
    if (current(scope))
      patch({ issue: 'Your project changed. Review the updated summary and Accept again.' })
  }
  async function complete(
    scope: OpenInput,
    value: CommitValue,
    command: ImportCommitCommand
  ): Promise<void> {
    if (
      !value.receipt ||
      !value.counts ||
      value.receipt.id !== command.operationId ||
      value.receipt.command.manifestId !== command.manifestId ||
      value.receipt.command.operationId !== command.operationId ||
      value.receipt.command.expectedHead !== command.expectedHead ||
      value.receipt.command.entriesDigest !== command.entriesDigest ||
      value.receipt.command.version !== command.version ||
      (owned.current.summary &&
        JSON.stringify(value.counts) !== JSON.stringify(owned.current.summary.manifest.counts))
    )
      throw new Error(
        'The exact import receipt could not be confirmed. Check status before retrying.'
      )
    if (!current(scope)) return
    // Receipt confirmation settles acceptance even if refreshing the view subsequently fails.
    patch({ pendingCommit: null, page: null, intent: null, phase: 'complete', issue: '' })
    try {
      await latest.current.session.refreshConversationHead(scope)
    } catch {
      latest.current.session.setError(
        'The import is saved, but the view could not be refreshed. Reopen this project to see it.'
      )
    }
    if (current(scope)) latest.current.options.committed(scope, value.counts)
  }
  async function checkCommit(scope: OpenInput, command: ImportCommitCommand): Promise<void> {
    const result = await request({ ...scope, action: 'import-outcome', command })
    if (!current(scope)) return
    if (result.type !== 'import-committed')
      throw new Error('The import outcome could not be checked.')
    if (result.receipt) await complete(scope, result, command)
    else {
      patch({
        pendingCommit: null,
        phase: 'ready',
        issue: 'This import was not applied. Accept to try again.'
      })
      const summary = owned.current.summary
      if (summary && owned.current.conversations.length !== summary.total)
        await showSummary(scope, summary)
    }
  }
  async function accept(): Promise<void> {
    const s = owned.current,
      live = latest.current.session
    if (
      driving.current ||
      reading.current ||
      s.phase !== 'ready' ||
      s.pendingCommit ||
      s.pendingLocal ||
      s.pendingAutomatic ||
      !s.scope ||
      !current(s.scope) ||
      !s.summary ||
      s.summary.outcome !== 'ready' ||
      s.conversations.length !== s.summary.total ||
      !live.available ||
      live.accessReadOnly ||
      live.accessTransition ||
      live.closing ||
      live.navigating ||
      live.fileActive ||
      live.composition.current
    )
      return
    driving.current = true
    patch({ phase: 'importing', issue: '' })
    try {
      if (
        !(await latest.current.session.flush(false, 'save', [
          'project-import-intake',
          'project-import-multipart'
        ]))
      )
        throw new Error(
          'Finish saving your project edits before accepting. Your findings are kept.'
        )
      if (!current(s.scope)) return
      const saved = await request({
        ...s.scope,
        action: 'import-summary',
        reviewId: s.summary.manifest.reviewId,
        manifestId: s.summary.manifest.id,
        offset: 0
      })
      if (saved.type !== 'import-summary')
        throw new Error('The import summary could not be confirmed.')
      if (!current(s.scope)) return
      if (!saved.current) {
        await updateSummary(s.scope)
        return
      }
      if (JSON.stringify(saved.manifest) !== JSON.stringify(s.summary.manifest))
        throw new Error('The displayed summary changed. Check status to refresh it.')
      const command = confirmationCommand(s.summary.manifest)
      patch({ pendingCommit: command })
      const result = await request({ ...s.scope, action: 'import-commit', command })
      if (result.type !== 'import-committed')
        throw new Error('The import outcome could not be confirmed.')
      await complete(s.scope, result, command)
    } catch (error) {
      if (!current(s.scope)) return
      let failure = error
      if (owned.current.pendingCommit) {
        if (refused(error)) {
          patch({ pendingCommit: null })
          if (error instanceof Error && 'code' in error && error.code === 'STALE_REVISION') {
            try {
              await updateSummary(s.scope)
              return
            } catch (refreshError) {
              failure = refreshError
            }
          }
        } else {
          patch({ phase: 'checking', issue: '' })
          try {
            await checkCommit(s.scope, owned.current.pendingCommit)
            return
          } catch {
            patch({
              phase: 'ready',
              issue: 'The import outcome is unknown. Check status before trying again.'
            })
            return
          }
        }
      }
      patch({
        phase: 'ready',
        issue:
          failure instanceof Error
            ? failure.message
            : 'Import could not finish. Your findings are kept.'
      })
    } finally {
      driving.current = false
      if (current(s.scope) && ['importing', 'checking'].includes(owned.current.phase))
        patch({ phase: 'ready' })
      latest.current.session.drafts.changed()
    }
  }
  useRetainedDraft('project-import-multipart', {
    read: () => ({
      scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
      kind: 'project-import-multipart',
      entityId:
        owned.current.localReviewId ??
        owned.current.discovery?.graphId ??
        owned.current.page?.plan.id ??
        null,
      label: 'Project import',
      dirty: false,
      composing: false,
      busy: processing(owned.current.phase) || driving.current || reading.current,
      pendingOperation:
        owned.current.pendingDiscovery ??
        owned.current.pendingLocal ??
        owned.current.pendingAutomatic ??
        owned.current.pendingCommit,
      policy: 'operation',
      target: {
        kind: 'workspace',
        scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
        view: 'details'
      },
      issue: owned.current.issue
    }),
    focus: () => latest.current.options.focus()
  })
  function canEdit(): boolean {
    const s = owned.current
    return (
      !driving.current &&
      !reading.current &&
      !processing(s.phase) &&
      !s.pendingDiscovery &&
      !s.pendingLocal &&
      !s.pendingAutomatic &&
      !s.pendingCommit &&
      s.discovery?.execution?.phase !== 'running' &&
      (!s.scope || !hasWork(s.scope))
    )
  }
  function canDismiss(): boolean {
    return !driving.current && !reading.current && !processing(owned.current.phase)
  }
  const busy = processing(state.phase),
    locked =
      busy ||
      !!state.pendingDiscovery ||
      !!state.pendingLocal ||
      !!state.pendingAutomatic ||
      !!state.pendingCommit ||
      !!connections.status?.work.some(
        (w) => w.feature === 'import' && sameScope(w.scope, state.scope)
      )
  return {
    ...state,
    busy,
    locked,
    submit,
    cancel,
    check,
    protect,
    canEdit,
    canDismiss,
    accept,
    restore,
    viewResults,
    reset
  }
}
