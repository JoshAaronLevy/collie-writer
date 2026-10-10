import { isCommitRequest } from '../../shared/import-commit'
import { randomUUID } from 'node:crypto'
import { isReviewRequest } from '../../shared/import-review'
import type { StorageWorker } from '../storage-worker'
import type { AiService } from '../ai/service'
import { AiContentService } from '../ai/content-service'
import { ProjectError } from '../../domain/projects/errors'
import { AiError } from '../ai/errors'
import {
  isAnalysisValue,
  type AnalysisRequest,
  type AnalysisWorkerInput,
  type AnalysisValue
} from '../../shared/import-analysis'
import {
  isMultiRequest,
  type PlanReview,
  type AnalysisPlan,
  type BatchExecution
} from '../../shared/import-multipart'
import type { OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import { requestDigest } from '../../worker/storage/digest'
type Review = {
  scope: OpenInput
  plan: AnalysisPlan
  value: PlanReview
  stamp: string
  expires: number
}
type Grant = Review & { execution: BatchExecution; intent: string; next: number }
/** Durable parts are data. Only this main-memory grant permits serial dispatch. */
export class ImportAnalysisService extends AiContentService {
  private offers = new Map<string, Review>()
  private grant: Grant | null = null
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private advancing = false
  private planWrites = 0
  constructor(
    storage: StorageWorker,
    private readonly provider: AiService
  ) {
    super(storage, provider, 'import')
    provider.subscribe(() => {
      const g = this.grant
      if (g?.execution.phase === 'running' && !provider.contentReviewCurrent(g.stamp))
        this.pause('Account, model or session changed. Review remaining work to continue.')
      this.schedule()
    })
  }
  override hasPendingWork(): boolean {
    return (
      this.planWrites > 0 ||
      this.advancing ||
      this.grant?.execution.phase === 'running' ||
      super.hasPendingWork()
    )
  }
  private changed(): void {
    const g = this.grant
    if (g) this.publish(g.scope, g.execution.activeAttemptId)
    this.provider.contentWorkChanged()
  }
  pause(reason = 'Analysis paused. Completed parts are retained.'): void {
    if (this.grant?.execution.phase !== 'running') return
    this.grant.execution.phase = 'paused'
    this.grant.execution.reason = reason
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    this.changed()
  }
  override async settleForClose(): Promise<boolean> {
    this.pause('Analysis paused for closing. Review remaining work after reopening.')
    return super.settleForClose()
  }
  private guard(g: Grant): void {
    if (
      this.grant !== g ||
      g.execution.phase !== 'running' ||
      !this.provider.contentReviewCurrent(g.stamp) ||
      !this.provider.isContentScopeOpen(g.scope)
    )
      throw new AiError('cancelled')
  }
  private schedule(): void {
    if (!this.batchTimer && !this.advancing && this.grant?.execution.phase === 'running')
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null
        void this.advance()
      }, 300)
  }
  private async advance(): Promise<void> {
    const g = this.grant
    if (!g || this.advancing || g.execution.phase !== 'running') return
    this.advancing = true
    try {
      this.guard(g)
      const id = g.execution.activeAttemptId
      if (id) {
        const value = await this.worker({ ...g.scope, action: 'get', attemptId: id })
        this.guard(g)
        if (value.type !== 'turn') throw new ProjectError('UNAVAILABLE')
        if (value.turn.attempt.validation === 'pending') {
          if (
            this.workItems().some(
              (w) =>
                w.attemptId === id &&
                ['protection-required', 'record-unavailable'].includes(w.state)
            )
          )
            this.pause('Local output protection needs attention. Nothing else will be sent.')
          return
        }
        if (value.turn.attempt.validation !== 'valid') {
          this.pause(
            'A part did not produce a complete valid result. Review it before choosing reanalysis.'
          )
          return
        }
        if (this.workItems().some((w) => w.attemptId === id)) {
          if (this.workItems().some((w) => w.attemptId === id && w.state === 'protection-required'))
            this.pause('Finish local output protection before continuing.')
          return
        }
        const binding = await this.worker({ ...g.scope, action: 'binding', attemptId: id })
        this.guard(g)
        if (binding.type !== 'binding' || !binding.retired) {
          this.pause('The completed part still needs its local handoff.')
          return
        }
        g.execution.activeAttemptId = null
      }
      if (g.next >= g.value.partIds.length) {
        this.pause(
          'This authorization is finished. Review coverage before authorizing more requests.'
        )
        return
      }
      if (super.hasPendingWork() || this.provider.hasPendingWork() || this.otherPending()) {
        this.pause('Other AI or local protection work needs attention. No remaining part was sent.')
        return
      }
      const partId = g.value.partIds[g.next],
        page = await this.worker({ ...g.scope, action: 'plan-read', planId: g.plan.id, offset: 0 })
      this.guard(g)
      if (page.type !== 'plan' || !page.current || page.plan.digest !== g.value.planDigest)
        throw new ProjectError('STALE_REVISION')
      // Recheck this exact part. A restored attempt is never fresh dispatch authority.
      const selected = await this.worker({
        ...g.scope,
        action: 'plan-select',
        planId: g.plan.id,
        proposalId: page.proposalId,
        mode: g.value.mode,
        partId: g.value.mode === 'reanalyze' ? partId : null,
        limit: 64
      })
      this.guard(g)
      if (selected.type !== 'plan-selection' || !selected.partIds.includes(partId))
        throw new ProjectError('STALE_REVISION')
      const review = {
        ...g.scope,
        action: 'review' as const,
        version: 2 as const,
        planId: g.plan.id,
        partId,
        batchId: g.plan.batchId,
        graphId: g.plan.graphId,
        expectedRevision: g.plan.revisionId,
        captureId: randomUUID(),
        createdAt: new Date().toISOString()
      }
      const prepared = await super.command(review)
      this.guard(g)
      if (prepared.type !== 'review') throw new ProjectError('UNAVAILABLE')
      const attemptId = randomUUID()
      // Reserve the finite slot before append/prepare/bind or any possible HTTP send.
      g.next++
      g.execution.used++
      g.execution.activeAttemptId = attemptId
      this.changed()
      await super.submit(
        {
          ...g.scope,
          action: 'submit',
          attemptId,
          review,
          digest: prepared.capture.digest,
          send: true,
          connectionId: g.value.connectionId,
          model: g.value.model
        },
        () => this.guard(g)
      )
    } catch (error) {
      if (error instanceof ProjectError && error.code === 'LIMIT_EXCEEDED') {
        this.pause(
          'The batch or retained-operation capacity limit was reached. Completed work is retained; nothing else was sent.'
        )
        return
      }
      this.pause(
        'Analysis paused after an interruption or capacity refusal. Check saved progress; no request will be retried automatically.'
      )
    } finally {
      this.advancing = false
      this.changed()
      this.schedule()
    }
  }
  override async worker(input: AnalysisWorkerInput): Promise<AnalysisValue> {
    const value = await super.worker(input)
    if (!isAnalysisValue(value)) throw new ProjectError('UNAVAILABLE')
    return value
  }
  override async command(input: AnalysisRequest): Promise<AnalysisValue> {
    if (isCommitRequest(input) || isReviewRequest(input)) {
      const mutation = [
        'review-open',
        'review-save',
        'review-chat',
        'review-partial',
        'confirmation-prepare',
        'import-commit'
      ].includes(input.action)
      if (
        mutation &&
        (this.hasPendingWork() ||
          this.provider.hasPendingWork() ||
          this.otherPending() ||
          this.provider.isSettling())
      )
        throw new ProjectError('ACCESS_BUSY')
      if (mutation) {
        this.planWrites++
        this.provider.contentWorkChanged()
      }
      try {
        return await this.worker(input)
      } finally {
        if (mutation) {
          this.planWrites--
          this.provider.contentWorkChanged()
        }
      }
    }
    if (input.action === 'cancel')
      this.pause('Stopped by you. Completed parts are retained; unfinished attempts need review.')
    if (!isMultiRequest(input)) {
      // Multipart sends are reserved for the finite coordinator, never a renderer-created single request.
      if (
        (input.action === 'review' && 'version' in input) ||
        (input.action === 'submit' && 'version' in input.review)
      )
        throw new ProjectError('DENIED')
      const value = await super.command(input)
      if (!isAnalysisValue(value)) throw new ProjectError('UNAVAILABLE')
      return value
    }
    const scope = { projectId: input.projectId, workspaceId: input.workspaceId }
    if (input.action === 'plan-stop') {
      const g = this.grant
      if (!g || !sameScope(scope, g.scope) || g.plan.id !== input.planId)
        throw new ProjectError('NOT_FOUND')
      this.pause('Stopped by you. Completed parts are retained; unfinished attempts need review.')
      if (g.execution.activeAttemptId)
        try {
          await super.command({
            ...scope,
            action: 'cancel',
            attemptId: g.execution.activeAttemptId
          })
        } catch (error) {
          if (!(error instanceof ProjectError) || error.code !== 'NOT_FOUND') throw error
        }
      return { type: 'batch-execution', execution: { ...g.execution } }
    }
    if (input.action === 'plan-start') {
      const digest = requestDigest(input),
        prior = this.grant
      if (prior?.execution.id === input.operationId) {
        if (prior.intent !== digest) throw new ProjectError('OPERATION_CONFLICT')
        return { type: 'batch-execution', execution: { ...prior.execution } }
      }
      if (
        this.hasPendingWork() ||
        this.provider.hasPendingWork() ||
        this.otherPending() ||
        this.provider.isSettling()
      )
        throw new ProjectError('ACCESS_BUSY')
      const offer = this.offers.get(input.reviewId)
      if (
        !offer ||
        !sameScope(scope, offer.scope) ||
        offer.expires < Date.now() ||
        !this.provider.contentReviewCurrent(offer.stamp)
      )
        throw new ProjectError('STALE_REVISION')
      const selection = await this.worker({
        ...scope,
        action: 'plan-select',
        planId: offer.plan.id,
        proposalId: offer.value.proposalId,
        mode: offer.value.mode,
        partId: offer.value.mode === 'reanalyze' ? offer.value.partIds[0] : null,
        limit: offer.value.partIds.length
      })
      if (
        this.hasPendingWork() ||
        this.provider.hasPendingWork() ||
        this.otherPending() ||
        !this.provider.contentReviewCurrent(offer.stamp) ||
        selection.type !== 'plan-selection' ||
        requestDigest(selection.partIds) !== requestDigest(offer.value.partIds)
      )
        throw new ProjectError('STALE_REVISION')
      this.offers.delete(input.reviewId)
      this.grant = {
        ...offer,
        intent: digest,
        next: 0,
        execution: {
          id: input.operationId,
          phase: 'running',
          used: 0,
          ceiling: offer.value.partIds.length,
          activeAttemptId: null,
          reason: ''
        }
      }
      this.changed()
      this.schedule()
      return { type: 'batch-execution', execution: { ...this.grant.execution } }
    }
    if (input.action === 'plan-review') {
      if (this.hasPendingWork() || this.provider.isSettling()) throw new ProjectError('ACCESS_BUSY')
      const stamp = await this.provider.reviewStamp('import'),
        status = await this.provider.readStatus()
      if (
        !status.activeConnectionId ||
        status.catalog?.state !== 'loaded' ||
        !status.catalog.selectedModelId
      )
        throw new ProjectError('UNAVAILABLE')
      const selection = await this.worker({ ...input, action: 'plan-select' })
      if (selection.type !== 'plan-selection' || !this.provider.contentReviewCurrent(stamp))
        throw new ProjectError('STALE_REVISION')
      const value: PlanReview = {
        type: 'plan-review',
        reviewId: randomUUID(),
        planId: selection.plan.id,
        planDigest: selection.plan.digest,
        proposalId: selection.proposalId,
        partIds: selection.partIds,
        connectionId: status.activeConnectionId,
        model: status.catalog.selectedModelId,
        units: selection.units,
        bytes: selection.bytes,
        mode: input.mode
      }
      if (this.offers.size >= 8) this.offers.delete(this.offers.keys().next().value!)
      this.offers.set(value.reviewId, {
        scope,
        plan: selection.plan,
        value,
        stamp,
        expires: Date.now() + 300000
      })
      return value
    }
    if (input.action === 'plan-prepare' && (this.hasPendingWork() || this.provider.isSettling()))
      throw new ProjectError('ACCESS_BUSY')
    if (input.action === 'plan-prepare') {
      this.planWrites++
      this.provider.contentWorkChanged()
    }
    try {
      const value = await this.worker(input)
      if (
        value.type === 'plan' &&
        this.grant?.plan.id === value.plan.id &&
        sameScope(scope, this.grant.scope)
      )
        return { ...value, execution: { ...this.grant.execution } }
      return value
    } finally {
      if (input.action === 'plan-prepare') {
        this.planWrites--
        this.provider.contentWorkChanged()
      }
    }
  }
}
