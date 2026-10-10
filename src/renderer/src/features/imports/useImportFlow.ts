import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnalysisRequest, AnalysisValue } from '../../../../shared/import-analysis'
import type {
  ImportSubmitBinding,
  MultiRequest,
  PlanPage
} from '../../../../shared/import-multipart'
import type {
  AutomaticReviewRequest,
  ImportSummary,
  ReviewCounts
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
  page: PlanPage | null
  summary: ImportSummary | null
  conversations: ImportSummary['conversations']
  legacyAttemptId: string | null
  legacyValid: boolean
  pendingCommit: ImportCommitCommand | null
  pendingStart: Extract<MultiRequest, { action: 'plan-start' }> | null
  pendingAutomatic: AutomaticReviewRequest | null
}
type SubmitInput = {
  scope: OpenInput
  intent: string
  binding: ImportSubmitBinding
  continueAnalysis?: boolean
  prepare: (fresh: boolean) => Promise<ImportRevision>
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
  page: null,
  summary: null,
  conversations: [],
  legacyAttemptId: null,
  legacyValid: false,
  pendingCommit: null,
  pendingStart: null,
  pendingAutomatic: null
})
const processing = (phase: Phase): boolean =>
  ['preparing', 'analyzing', 'saving', 'stopping', 'importing', 'checking'].includes(phase)
const refused = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  [
    'STALE_REVISION',
    'ACCESS_BUSY',
    'DENIED',
    'VALIDATION',
    'LIMIT_EXCEEDED',
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
    cancelled = useRef(false)
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
      ...(!isCurrent ? { issue: 'Your project changed. Check status to refresh the summary.' } : {})
    })
    latest.current.options.ready(scope)
  }
  async function prepareResults(scope: OpenInput, page: PlanPage): Promise<void> {
    if (
      !current(scope) ||
      cancelled.current ||
      !page.current ||
      (page.completed === 0 && !owned.current.legacyValid)
    )
      return
    patch({ phase: 'saving', issue: '' })
    if (
      !(await latest.current.session.flush(false, 'save', [
        'project-import-intake',
        'project-import-multipart'
      ]))
    )
      throw new Error(
        'Finish saving your project edits, then Submit again. Your findings are kept.'
      )
    if (!current(scope) || cancelled.current) return
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
    if (!current(scope) || cancelled.current) return
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
  async function stop(scope: OpenInput, page: PlanPage): Promise<void> {
    try {
      await request({ ...scope, action: 'plan-stop', planId: page.plan.id })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'NOT_FOUND')) throw error
    }
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
    if (s.pendingStart && value.execution?.id === s.pendingStart.operationId)
      patch({ pendingStart: null })
    if (cancelled.current && value.execution?.phase === 'running') {
      await stop(s.scope, value)
      return
    }
    if (owned.current.pendingStart) return
    if (cancelled.current) {
      if ((!hasWork(s.scope) || needsAttention(s.scope)) && value.execution?.phase !== 'running')
        patch({ phase: 'paused', issue: '' })
      return
    }
    if (value.execution?.phase === 'running') {
      patch({ phase: 'analyzing', issue: '' })
      return
    }
    if (hasWork(s.scope)) {
      if (needsAttention(s.scope))
        patch({ phase: 'paused', issue: 'Saved analysis needs attention before continuing.' })
      return
    }
    if (allowPreparation && value.completed > 0) await prepareResults(s.scope, value)
    else if (processing(owned.current.phase))
      patch({
        phase: 'paused',
        issue: 'Analysis stopped before everything could be read. Your saved findings are kept.'
      })
  }
  async function poll(): Promise<void> {
    if (
      reading.current ||
      driving.current ||
      !processing(owned.current.phase) ||
      ['saving', 'importing', 'checking'].includes(owned.current.phase)
    )
      return
    reading.current = true
    try {
      await refresh(true)
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
    if (owned.current.pendingCommit || owned.current.pendingAutomatic || owned.current.pendingStart)
      return
    reading.current = true
    cancelled.current = false
    patch({ ...initial(), scope, intent, restoreRevision: revision, phase: 'checking' })
    try {
      await request({ ...scope, action: 'reconcile' })
      await latest.current.connections.checkStatus()
      if (!current(scope)) return
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
            owned.current.page?.execution?.phase === 'running' ||
            (hasWork(scope) && !needsAttention(scope))
              ? 'analyzing'
              : 'paused',
          issue:
            owned.current.legacyAttemptId && !owned.current.legacyValid
              ? 'Earlier analysis has no usable findings. Check status, or start a new import.'
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
      } else if (s.page) await prepareResults(s.scope, s.page)
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
        if (!current(s.scope) || attempt.type !== 'turn') return
        const saved = await window.collie.projectImport({
          ...s.scope,
          action: 'read',
          batchId: attempt.turn.capture.packet.batchId,
          revisionId: null,
          offset: 0
        })
        if (!saved.ok) throw new Error(saved.error.message)
        if (saved.value.type !== 'batch' || !current(s.scope)) return
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
      if (owned.current.phase === 'saving') patch({ phase: 'paused' })
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
      owned.current.pendingStart ||
      owned.current.pendingAutomatic ||
      owned.current.pendingCommit ||
      owned.current.page?.execution?.phase === 'running'
    )
      return
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
            page: null,
            summary: null,
            conversations: [],
            legacyAttemptId: null,
            legacyValid: false
          }
        : {})
    })
    try {
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
      if (sameIntent && prior.legacyAttemptId) {
        if (prior.legacyValid) {
          patch({ ...prior, phase: 'paused' })
          driving.current = false
          await viewResults()
          return
        }
        throw new Error(
          'Earlier analysis has no usable findings. Check status, or start a new import.'
        )
      }
      const revision = await input.prepare(prior.intent !== null && !sameIntent)
      if (!current(input.scope) || cancelled.current) return
      if (!revision.graphId) throw new Error('The selected files could not be prepared.')
      const found = await window.collie.importAnalysis({
        ...input.scope,
        action: 'plan-find',
        batchId: revision.batchId,
        graphId: revision.graphId
      })
      const page = found.ok
        ? found.value
        : found.error.code === 'NOT_FOUND'
          ? await request({
              ...input.scope,
              action: 'plan-prepare',
              batchId: revision.batchId,
              graphId: revision.graphId,
              expectedRevision: revision.id
            })
          : (() => {
              throw new Error(found.error.message)
            })()
      if (page.type !== 'plan') throw new Error('The selected files could not be prepared.')
      if (!current(input.scope) || cancelled.current) return
      patch({ page })
      await latest.current.session.refreshConversationHead(input.scope)
      if (page.execution?.phase === 'running') {
        patch({ phase: 'analyzing' })
        return
      }
      if (sameIntent && !input.continueAnalysis && page.completed && page.remaining) {
        await prepareResults(input.scope, page)
        return
      }
      if (!page.remaining) {
        if (hasWork(input.scope)) {
          patch({ phase: 'analyzing' })
          return
        }
        if (page.completed) {
          await prepareResults(input.scope, page)
          return
        }
        throw new Error(
          'Analysis could not finish. No usable findings are saved; choose your files and Submit again.'
        )
      }
      if (page.total > 64)
        throw new Error(
          'This selection is too large to analyze. Choose fewer files and Submit again.'
        )
      if (!current(input.scope) || cancelled.current) return
      const offer = await request({
        ...input.scope,
        action: 'plan-review',
        planId: page.plan.id,
        proposalId: page.proposalId,
        mode: 'remaining',
        partId: null,
        limit: 64,
        submission: input.binding
      })
      if (offer.type !== 'plan-review') throw new Error('Analysis could not be prepared.')
      if (!current(input.scope) || cancelled.current) return
      const command = {
        ...input.scope,
        action: 'plan-start' as const,
        reviewId: offer.reviewId,
        operationId: crypto.randomUUID(),
        approve: true as const
      }
      patch({ pendingStart: command, phase: 'analyzing' })
      try {
        const started = await request(command)
        if (started.type !== 'batch-execution')
          throw new Error('Check analysis status before continuing.')
        if (!current(input.scope)) return
        patch({ pendingStart: null })
        if (cancelled.current) await stop(input.scope, page)
      } catch (error) {
        if (refused(error)) patch({ pendingStart: null })
        throw error
      }
    } catch (error) {
      if (current(input.scope))
        patch({
          phase: 'paused',
          issue:
            error instanceof Error
              ? error.message
              : 'Analysis could not finish. Your selection is kept.'
        })
    } finally {
      driving.current = false
      if (current(input.scope) && cancelled.current && !owned.current.pendingStart)
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
      if (s.scope && s.page && current(s.scope)) {
        await stop(s.scope, s.page)
        await refresh(false)
      } else if (s.scope && current(s.scope)) {
        for (const work of latest.current.connections.status?.work.filter(
          (w) => w.feature === 'import' && sameScope(w.scope, s.scope) && w.state === 'running'
        ) ?? [])
          await request({ ...s.scope, action: 'cancel', attemptId: work.attemptId })
        await latest.current.connections.checkStatus()
      }
      if (!driving.current && !s.pendingStart && s.scope && !hasWork(s.scope))
        patch({ phase: 'paused' })
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
    reading.current = true
    try {
      if (s.pendingCommit) {
        patch({ phase: 'checking', issue: '' })
        await checkCommit(s.scope, s.pendingCommit)
        return
      }
      await request({ ...s.scope, action: 'reconcile' })
      await latest.current.connections.checkStatus()
      if (
        !s.page &&
        !s.summary &&
        !s.legacyAttemptId &&
        s.restoreRevision &&
        s.intent &&
        !s.pendingAutomatic &&
        !s.pendingStart
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
            issue: 'Findings were not saved. Submit again to prepare the saved analysis.'
          })
      }
      if (s.summary && !s.pendingAutomatic && !s.pendingStart && !cancelled.current) {
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
        // An absent in-memory grant is not permission to retry its start automatically.
        if (owned.current.pendingStart && !owned.current.page?.execution)
          patch({
            pendingStart: null,
            phase: 'paused',
            issue: 'Analysis is paused. Submit explicitly to continue unsent work.'
          })
      }
      await latest.current.session.refreshConversationHead(s.scope)
    } catch (error) {
      patch({
        phase: 'ready',
        issue: owned.current.pendingCommit
          ? 'The import outcome is still unknown. Check status before trying again.'
          : error instanceof Error
            ? error.message
            : 'Analysis status could not be checked.'
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
      s.pendingStart ||
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
      entityId: owned.current.page?.plan.id ?? null,
      label: 'Project import',
      dirty: false,
      composing: false,
      busy: processing(owned.current.phase) || driving.current || reading.current,
      pendingOperation:
        owned.current.pendingStart ?? owned.current.pendingAutomatic ?? owned.current.pendingCommit,
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
      !s.pendingStart &&
      !s.pendingAutomatic &&
      !s.pendingCommit &&
      s.page?.execution?.phase !== 'running' &&
      (!s.scope || !hasWork(s.scope))
    )
  }
  function canDismiss(): boolean {
    return !driving.current && !reading.current && !processing(owned.current.phase)
  }
  const busy = processing(state.phase),
    locked =
      busy ||
      !!state.pendingStart ||
      !!state.pendingAutomatic ||
      !!state.pendingCommit ||
      state.page?.execution?.phase === 'running' ||
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
