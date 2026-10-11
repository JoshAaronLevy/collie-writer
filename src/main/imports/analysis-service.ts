import { retryableImportTask } from '../../shared/import-recovery'
import {
  isSemanticRequest,
  SEMANTIC_GRANT_LIMIT,
  type SemanticRequest,
  type SemanticValue
} from '../../shared/import-semantic'
import { isDiscoveryRequest, type DiscoveryValue } from '../../shared/import-discovery'
import { importAnalysisProblem, importFailureReason } from '../../shared/import-analysis-problem'
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
import { isMultiRequest, type BatchExecution } from '../../shared/import-multipart'
import { projectMessages, type OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import { requestDigest } from '../../worker/storage/digest'
/** Durable parts are data. Only this main-memory grant permits serial dispatch. */
export class ImportAnalysisService extends AiContentService {
  private discovery: {
    kind: 'mapping' | 'semantic'
    scope: OpenInput
    graphId: string
    batchId: string
    revisionId: string
    stamp: string
    submission: import('../../shared/import-multipart').ImportSubmitBinding
    intent: string
    execution: BatchExecution
    taskIds: string[]
    next: number
  } | null = null
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private advancing = false
  private planWrites = 0
  constructor(
    storage: StorageWorker,
    private readonly provider: AiService
  ) {
    super(storage, provider, 'import')
    provider.subscribe(() => {
      if (
        this.discovery?.execution.phase === 'running' &&
        !provider.contentReviewCurrent(this.discovery.stamp)
      )
        this.pause(
          'The ChatGPT account or model changed. Check the connection, then explicitly continue.'
        )
      this.schedule()
    })
  }
  override hasPendingWork(): boolean {
    return (
      this.discovery?.execution.phase === 'running' ||
      this.planWrites > 0 ||
      this.advancing ||
      super.hasPendingWork()
    )
  }
  private changed(): void {
    if (this.discovery) this.publish(this.discovery.scope, this.discovery.execution.activeAttemptId)
    this.provider.contentWorkChanged()
  }
  pause(reason = 'Analysis paused. Completed parts are retained.'): void {
    if (this.discovery?.execution.phase === 'running') {
      this.discovery.execution.phase = 'paused'
      this.discovery.execution.reason = reason
    }
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
  private schedule(): void {
    if (!this.batchTimer && !this.advancing && this.discovery?.execution.phase === 'running')
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null
        void this.advanceDiscovery()
      }, 300)
  }
  private discoveryGuard(d: NonNullable<ImportAnalysisService['discovery']>): void {
    if (
      this.discovery !== d ||
      d.execution.phase !== 'running' ||
      !this.provider.contentReviewCurrent(d.stamp) ||
      !this.provider.isContentScopeOpen(d.scope)
    )
      throw new AiError('cancelled')
  }
  private async advanceDiscovery(): Promise<void> {
    const d = this.discovery
    if (!d || this.advancing || d.execution.phase !== 'running') return
    this.advancing = true
    try {
      this.discoveryGuard(d)
      const attemptId = d.execution.activeAttemptId
      if (attemptId) {
        const value = await this.worker({ ...d.scope, action: 'get', attemptId })
        this.discoveryGuard(d)
        if (value.type !== 'turn' || value.turn.attempt.version !== (d.kind === 'semantic' ? 4 : 3))
          throw new ProjectError('UNAVAILABLE')
        if (value.turn.attempt.validation === 'pending') {
          if (
            this.workItems().some(
              (w) =>
                w.attemptId === attemptId &&
                ['protection-required', 'record-unavailable'].includes(w.state)
            )
          )
            this.pause(
              'The response needs local protection. Check status or try saving again; no next request was sent.'
            )
          return
        }
        const binding = await this.worker({ ...d.scope, action: 'binding', attemptId })
        this.discoveryGuard(d)
        if (binding.type !== 'binding' || !binding.retired) {
          if (value.turn.attempt.validation !== 'valid')
            this.pause(importAnalysisProblem(value.turn.attempt))
          return
        }
        if (value.turn.attempt.validation !== 'valid') {
          this.pause(
            value.turn.attempt.validation === 'invalid'
              ? d.kind === 'semantic'
                ? 'ChatGPT returned invalid original span references. The response and independent local findings are kept.'
                : 'ChatGPT returned an invalid structural mapping. The response and independent local findings are kept.'
              : importAnalysisProblem(value.turn.attempt)
          )
          return
        }
        if (d.kind === 'mapping') {
          const applied = await this.worker({
            ...d.scope,
            action: 'discovery-apply',
            graphId: d.graphId,
            attemptId
          })
          this.discoveryGuard(d)
          if (
            applied.type !== 'discovery' ||
            !applied.tasks.some((t) => t.attemptId === attemptId && t.normalizationId)
          ) {
            this.pause(
              applied.type === 'discovery'
                ? applied.tasks.find((t) => t.attemptId === attemptId)?.reason ||
                    'The mapping could not be safely applied. Local findings are kept.'
                : 'Local extraction needs attention.'
            )
            return
          }
        }
        d.execution.activeAttemptId = null
      }
      if (d.next >= d.taskIds.length) {
        this.pause(
          d.kind === 'semantic'
            ? 'This interpretation portion finished. Continue explicitly if unread passages remain; each continuation allows at most 32 requests.'
            : 'Structure discovery is complete. Preparing the summary.'
        )
        return
      }
      if (super.hasPendingWork() || this.provider.hasPendingWork() || this.otherPending()) {
        this.pause(
          'Other AI or local protection work needs attention. Completed findings are kept.'
        )
        return
      }
      const value = await this.worker({
        ...d.scope,
        action: d.kind === 'semantic' ? 'semantic-read' : 'discovery-read',
        graphId: d.graphId
      })
      this.discoveryGuard(d)
      const task =
        value.type === 'discovery' || value.type === 'semantic'
          ? value.tasks.find((t) => t.id === d.taskIds[d.next])
          : null
      if (!task || !retryableImportTask(task)) throw new ProjectError('STALE_REVISION')
      const review = {
        ...d.scope,
        action: 'review' as const,
        version: d.kind === 'semantic' ? (4 as const) : (3 as const),
        captureId: randomUUID(),
        createdAt: new Date().toISOString(),
        batchId: d.batchId,
        graphId: d.graphId,
        expectedRevision: d.revisionId,
        partId: task.id
      }
      let prepared: AnalysisValue
      try {
        const result = await super.command(review)
        if (!isAnalysisValue(result)) throw new ProjectError('UNAVAILABLE')
        prepared = result
      } catch (error) {
        if (error instanceof ProjectError && error.code === 'ACCESS_BUSY' && task.reason) {
          this.pause(task.reason)
          return
        }
        throw error
      }
      this.discoveryGuard(d)
      if (
        prepared.type !== 'review' ||
        prepared.capture.version !== (d.kind === 'semantic' ? 4 : 3)
      )
        throw new ProjectError('UNAVAILABLE')
      const id = randomUUID()
      d.next++
      d.execution.used++
      d.execution.activeAttemptId = id
      this.changed()
      await super.submit(
        {
          ...d.scope,
          action: 'submit',
          attemptId: id,
          review,
          digest: prepared.capture.digest,
          send: true,
          connectionId: d.submission.connectionId,
          model: d.submission.model
        },
        () => this.discoveryGuard(d)
      )
    } catch (error) {
      this.pause(
        error instanceof AiError
          ? importFailureReason(error.reason)
          : error instanceof ProjectError
            ? projectMessages[error.code]
            : 'Structure discovery stopped. Check saved status before continuing.'
      )
    } finally {
      this.advancing = false
      this.changed()
      this.schedule()
    }
  }
  private async discoveryCommand(
    input: import('../../shared/import-discovery').DiscoveryRequest | SemanticRequest
  ): Promise<AnalysisValue> {
    const scope = { projectId: input.projectId, workspaceId: input.workspaceId },
      d = this.discovery,
      semantic = input.action.startsWith('semantic-')
    if (input.action === 'discovery-stop' || input.action === 'semantic-stop') {
      if (
        d &&
        d.kind === (semantic ? 'semantic' : 'mapping') &&
        sameScope(scope, d.scope) &&
        d.graphId === input.graphId
      ) {
        this.pause('Stopped by you. Completed mappings and local findings are kept.')
        if (d.execution.activeAttemptId)
          await super.command({
            ...scope,
            action: 'cancel',
            attemptId: d.execution.activeAttemptId
          })
      }
      return this.discoveryCommand({
        ...scope,
        action: semantic ? 'semantic-read' : 'discovery-read',
        graphId: input.graphId
      })
    }
    if (input.action === 'discovery-start' || input.action === 'semantic-start') {
      const intent = requestDigest(input)
      if (d?.execution.id === input.operationId) {
        if (d.intent !== intent) throw new ProjectError('OPERATION_CONFLICT')
        return this.discoveryCommand({
          ...scope,
          action: semantic ? 'semantic-read' : 'discovery-read',
          graphId: input.graphId
        })
      }
      if (
        this.hasPendingWork() ||
        this.provider.hasPendingWork() ||
        this.otherPending() ||
        this.provider.isSettling()
      )
        throw new ProjectError('ACCESS_BUSY')
      const stamp = await this.provider.reviewStamp('import'),
        status = await this.provider.readStatus(),
        s = input.submission
      if (
        status.activeConnectionId !== s.connectionId ||
        status.catalog?.state !== 'loaded' ||
        status.catalog.selectedModelId !== s.model ||
        status.catalog.revision !== s.catalogRevision ||
        status.reviewRevision !== s.reviewRevision
      )
        throw new ProjectError('STALE_REVISION')
      const value = await this.worker({
        ...scope,
        action: semantic ? 'semantic-read' : 'discovery-read',
        graphId: input.graphId
      })
      if (
        (value.type !== 'discovery' && value.type !== 'semantic') ||
        !this.provider.contentReviewCurrent(stamp)
      )
        throw new ProjectError('STALE_REVISION')
      const tasks = value.tasks
        .filter(retryableImportTask)
        .slice(0, semantic ? SEMANTIC_GRANT_LIMIT : 8)
      if (!tasks.length) return value
      this.discovery = {
        kind: semantic ? 'semantic' : 'mapping',
        scope,
        graphId: input.graphId,
        batchId: value.batchId,
        revisionId: value.revisionId,
        stamp,
        submission: s,
        intent,
        next: 0,
        taskIds: tasks.map((t) => t.id),
        execution: {
          id: input.operationId,
          phase: 'running',
          used: 0,
          ceiling: tasks.length,
          activeAttemptId: null,
          reason: '',
          progress: null
        }
      }
      this.changed()
      this.schedule()
      return this.discoveryCommand({
        ...scope,
        action: semantic ? 'semantic-read' : 'discovery-read',
        graphId: input.graphId
      })
    }
    const mutation =
      input.action === 'discovery-prepare' ||
      input.action === 'discovery-apply' ||
      input.action === 'semantic-prepare'
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
      const value = await this.worker(input)
      if (value.type !== 'discovery' && value.type !== 'semantic')
        throw new ProjectError('UNAVAILABLE')
      if (
        d &&
        d.kind === (semantic ? 'semantic' : 'mapping') &&
        sameScope(scope, d.scope) &&
        d.graphId === input.graphId
      ) {
        const op = d.execution.activeAttemptId
          ? this.attemptOperation(scope, d.execution.activeAttemptId)
          : null
        return {
          ...value,
          execution: {
            ...d.execution,
            ...(d.execution.phase !== 'running' &&
            value.tasks.some((t) =>
              ['quota-paused', 'rate-limited', 'retry-exhausted'].includes(t.state)
            )
              ? {
                  reason: value.tasks.find((t) =>
                    ['quota-paused', 'rate-limited', 'retry-exhausted'].includes(t.state)
                  )!.reason
                }
              : {}),
            progress: op
              ? {
                  state: op.state,
                  elapsedMs: Math.max(0, (op.finishedAt ?? Date.now()) - op.startedAt),
                  responseCharacters: op.text.length
                }
              : null
          }
        } satisfies DiscoveryValue | SemanticValue
      }
      return value
    } finally {
      if (mutation) {
        this.planWrites--
        this.provider.contentWorkChanged()
      }
    }
  }
  override async worker(input: AnalysisWorkerInput): Promise<AnalysisValue> {
    const value = await super.worker(input)
    if (!isAnalysisValue(value)) throw new ProjectError('UNAVAILABLE')
    return value
  }
  override async command(input: AnalysisRequest): Promise<AnalysisValue> {
    if (isSemanticRequest(input)) return this.discoveryCommand(input)
    if (isDiscoveryRequest(input)) return this.discoveryCommand(input)
    if (isCommitRequest(input) || isReviewRequest(input)) {
      const mutation = [
        'review-open',
        'review-local',
        'review-automatic',
        'review-legacy',
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
      // All new inference belongs to the finite coordinator. Older attempts retain only recovery.
      if (input.action === 'review' || input.action === 'submit') throw new ProjectError('DENIED')
      const value = await super.command(input)
      if (!isAnalysisValue(value)) throw new ProjectError('UNAVAILABLE')
      return value
    }
    // Old finite grants lived only in main memory. Saved plans/outcomes are read-only.
    if (input.action === 'plan-prepare' && (this.hasPendingWork() || this.provider.isSettling()))
      throw new ProjectError('ACCESS_BUSY')
    if (input.action === 'plan-prepare') {
      this.planWrites++
      this.provider.contentWorkChanged()
    }
    try {
      const value = await this.worker(input)
      return value
    } finally {
      if (input.action === 'plan-prepare') {
        this.planWrites--
        this.provider.contentWorkChanged()
      }
    }
  }
}
