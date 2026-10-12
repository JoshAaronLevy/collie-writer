import { operationDigestV12 } from './direct-import-recovery'
import { semanticFits } from './direct-import-semantic'
import { mappingFits } from './direct-import-mapping'
import { importedConversationFits, operationDigestV9 } from './direct-imported-conversation'
import { operationDigestV6, researchFits } from './direct-research'
import { conversationFits, operationDigestV5 } from './direct-conversation'
import type { WorkspaceAiEvidence } from '../../shared/working-copy'
import type { AiHandoffReceipt } from '../../shared/ai-handoff'
import { handoffMatches } from './handoff'
import { randomUUID } from 'node:crypto'
import {
  AI_LIMITS,
  AI_PROVIDER,
  DIRECT_AI_PROVIDER,
  type AiConnectInput,
  type AiEvent,
  type AiOperation,
  type AiOperationInput,
  type AiContentWork,
  type AiPrepareInput,
  type AiPrepared,
  type AiReason,
  type AiStartInput,
  type AiStartup,
  type AiStartupInput,
  type AiStatus
} from '../../shared/ai'
import { sameProject } from '../../shared/access'
import type { AiSelectModelInput } from '../../shared/ai-catalog'
import type { OpenInput } from '../../shared/projects'
import type { AccessService } from '../entitlements/service'
import { RELEASE } from '../release'
import type { AiDispatchSession, AiTextUpdate, CurrentAiExecution } from './dispatch-session'
import { routeFunding, selectAiRoute, requireDirectRoute } from './deployment'
import {
  contentOperation,
  contentState,
  identityHash,
  localRequestFits,
  mechanicsSchemaDigestV1,
  templateFor,
  type ContentTemplate
} from './local-operation'
import { DirectPlanSession } from './direct-session'
import { deriveConnectionHealth } from './connection-health'
import { conversationCapabilities } from './capabilities'
import { directFits, operationDigestV4 } from './direct-operation'
import { AiError, aiReason } from './errors'
import { AiStorage, secureAiStorage, type RetainedOperation } from './storage'

// Historical versions remain readable through RetainedOperation, never live dispatch.
type CurrentOperation = Extract<RetainedOperation, { version: 4 | 5 | 6 | 9 | 12 }>

type Prepared = {
  receipt: AiPrepared
  input: AiPrepareInput
  execution: CurrentAiExecution
  session: AiDispatchSession
}
export type ContentAuthorization = {
  reviewStamp: string
  template: ContentTemplate
  captureDigest: string
}
function active(view: AiOperation): boolean {
  return ['starting', 'running', 'cancelling'].includes(view.state)
}
/** Bound the native wait; unfinished owners and storage writes keep running. */
function providerSettled(work: Promise<unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 25000)
    void work.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(false)
      }
    )
  })
}

/** Main owns sessions and jobs independently of any mounted renderer panel. */
export class AiService {
  private startupPrepared = false
  private startupPromptHandled = false
  private initialization: Promise<void> | null = null
  private storageFailure = false
  private accountStorageState: 'starting' | 'ready' | 'failed' = 'starting'
  private journalFailure = false
  private unprotectedOperationId: string | null = null
  private busy = false
  private closing = false
  private closeRequested = false
  private suspended = false
  private handoffWork: Promise<void> | null = null
  private statusSequence = 0
  private prepared = new Map<string, Prepared>()
  private reviewGeneration = randomUUID()
  private retained = new Map<string, RetainedOperation>()
  private workspaceRemovals = new Map<string, string>()
  private workspaceKey(scope: OpenInput): string {
    return `${scope.projectId}:${scope.workspaceId}`
  }
  reserveWorkspaceRemoval(scope: OpenInput, id: string): void {
    const key = this.workspaceKey(scope),
      previous = this.workspaceRemovals.get(key)
    if (previous && previous !== id) throw new AiError('busy')
    if (!previous && this.workspaceRemovals.size >= 16) throw new AiError('busy')
    this.workspaceRemovals.set(key, id)
  }
  settleWorkspaceRemoval(scope: OpenInput, id: string): void {
    const key = this.workspaceKey(scope)
    if (this.workspaceRemovals.get(key) === id) this.workspaceRemovals.delete(key)
  }
  private requireWorkspaceAvailable(scope: OpenInput): void {
    if (
      this.workspaceRemovals.has(this.workspaceKey(scope)) ||
      this.storage.workspaceRetired(scope)
    )
      throw new AiError('context-changed')
  }
  workspaceRemovalEvidence(scope: OpenInput): WorkspaceAiEvidence {
    if (
      [...this.prepared.values()].some(
        (item) => sameProject(item.input.scope, scope) && item.receipt.expiresAt >= Date.now()
      ) ||
      [
        ...this.retained.values(),
        ...this.protectedRecords.values(),
        ...(this.pendingRetention ? [this.pendingRetention] : [])
      ].some((item) => sameProject(item.view.scope, scope)) ||
      this.contentWork().some((item) => sameProject(item.scope, scope))
    )
      return 'linked'
    if (
      this.running ||
      this.busy ||
      this.handoffWork ||
      this.retentionWriting ||
      this.journalFailure ||
      this.unprotectedOperationId
    )
      return 'unknown'
    return this.storage.workspaceEvidence(scope)
  }
  inventoryOwners(): import('../../shared/storage-inventory').InventoryAiOwner[] {
    return Array.from(this.retained.values())
      .slice(0, 512)
      .map((item) => ({
        operationId: item.view.operationId,
        scope: { ...item.view.scope }
      }))
  }
  private retentionLoaded = false
  private protectedRecords = new Map<string, RetainedOperation>()
  private dispatch: AiDispatchSession | null = null
  private running: Promise<void> | null = null
  private activeOperationId: string | null = null
  private pendingRetention: RetainedOperation | null = null
  private retention = Promise.resolve()
  private retentionWriting = false
  private cancelledAttempts = new Set<string>()
  private preparationScheduled = false
  private publishTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<(event: AiEvent) => void>()
  private contentPending: () => boolean = () => false
  private contentWork: () => AiContentWork[] = () => []
  private settleContent: () => Promise<boolean> = async () => true
  setContentPending(read: () => boolean): void {
    this.contentPending = read
  }
  setContentLifecycle(work: () => AiContentWork[], settle: () => Promise<boolean>): void {
    this.contentWork = work
    this.settleContent = settle
  }
  isSettling(): boolean {
    return this.closing || this.closeRequested || this.suspended
  }
  contentWorkChanged(): void {
    this.publish()
  }
  isContentScopeOpen(scope: OpenInput): boolean {
    return this.access.isActiveAiScope(scope)
  }
  private capacity(): AiStatus['capacity'] {
    const projects = new Map<string, OpenInput>()
    for (const item of this.retained.values())
      projects.set(`${item.view.scope.projectId}:${item.view.scope.workspaceId}`, {
        ...item.view.scope
      })
    const readable = this.retentionLoaded && !this.storageFailure
    return {
      limit: AI_LIMITS.jobs,
      used: readable ? this.retained.size : null,
      projects: readable ? [...projects.values()] : []
    }
  }
  handoffReady(operationId: string): boolean {
    const item = this.retained.get(operationId)
    return (
      !this.running &&
      !this.busy &&
      !this.direct.hasPendingWork() &&
      !this.pendingRetention &&
      !this.retentionWriting &&
      !this.journalFailure &&
      (!item || !active(item.view))
    )
  }
  async retire(receipt: AiHandoffReceipt): Promise<void> {
    while (this.handoffWork)
      try {
        await this.handoffWork
      } catch {
        /* Each original transfer retains its own retry. */
      }
    const task = this.retireOnce(receipt)
    this.handoffWork = task
    try {
      await task
    } finally {
      if (this.handoffWork === task) this.handoffWork = null
      this.publish()
    }
  }
  async settleOperation(operationId: string): Promise<void> {
    if (this.activeOperationId === operationId) await this.running
    await this.retention
  }
  private async retireOnce(receipt: AiHandoffReceipt): Promise<void> {
    await this.ensure()
    this.access.authorizeAi(receipt.scope, false)
    if (!this.handoffReady(receipt.operationId)) throw new AiError('busy')
    const item =
      this.protectedRecords.get(receipt.operationId) ??
      (await this.storage.operation(receipt.operationId))
    if (!item || !handoffMatches(item, receipt)) throw new AiError('invalid-request')
    this.busy = true
    try {
      await this.storage.retire(receipt)
      this.retained.delete(receipt.operationId)
      this.protectedRecords.delete(receipt.operationId)
      for (const [id, prepared] of this.prepared)
        if (prepared.input.operationId === receipt.operationId) this.prepared.delete(id)
    } finally {
      this.busy = false
      this.publish()
    }
  }
  readonly storage: AiStorage
  private readonly direct: DirectPlanSession
  constructor(
    workingRoot: () => string | undefined,
    private readonly access: AccessService
  ) {
    this.storage = new AiStorage(workingRoot)
    this.direct = new DirectPlanSession(this.storage, (invalidate) => {
      if (invalidate) this.invalidateReviews()
      this.publish()
    })
  }
  private invalidateReviews(): void {
    this.prepared.clear()
    this.reviewGeneration = randomUUID()
  }
  private currentReviewStamp(action: AiPrepareInput['action']): string {
    return identityHash({
      generation: this.reviewGeneration,
      route: selectAiRoute(),
      action,
      template: templateFor(action),
      ...(action === 'proofread' ? { schemaDigest: mechanicsSchemaDigestV1() } : {})
    })
  }
  /** Main-memory stamp only: changing a route/account/model invalidates an
   * unsubmitted review. No account/model refresh occurs while reading it. */
  async reviewStamp(action: AiPrepareInput['action']): Promise<string> {
    try {
      await this.ensure()
    } catch {
      /* Unavailable secure AI storage must not prevent an offline review/save. */
    }
    return this.currentReviewStamp(action)
  }
  contentReviewCurrent(stamp: string): boolean {
    return !this.isSettling() && stamp === this.currentReviewStamp('import')
  }
  requestFits(
    input: Pick<AiPrepareInput, 'prompt' | 'context'>,
    action: AiPrepareInput['action'],
    template?: ContentTemplate
  ): boolean {
    if (action === 'import')
      return (
        selectAiRoute().kind === 'local-chatgpt-plan' &&
        ((template === 'project-import-mapping-v1' && mappingFits(input)) ||
          (template === 'project-import-semantic-v1' && semanticFits(input)))
      )
    return selectAiRoute().kind === 'local-chatgpt-plan' && action === 'conversation'
      ? template === 'conversation-imported-v1' || template === 'conversation-imported-research-v1'
        ? importedConversationFits(input, template === 'conversation-imported-research-v1')
        : template === 'conversation-research-v1'
          ? researchFits(input)
          : template === 'conversation-v2'
            ? conversationFits(input)
            : directFits(input)
      : template === 'conversation-v2' ||
          template === 'conversation-research-v1' ||
          template === 'conversation-imported-v1' ||
          template === 'conversation-imported-research-v1'
        ? false
        : localRequestFits(input, action)
  }
  subscribe(listener: (event: AiEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  hasPendingWork(): boolean {
    return !!(
      this.busy ||
      this.running ||
      this.handoffWork ||
      this.pendingRetention ||
      this.retentionWriting ||
      this.journalFailure ||
      this.direct.hasPendingWork()
    )
  }
  private emit(event: AiEvent): void {
    for (const listener of this.listeners)
      try {
        listener(structuredClone(event))
      } catch {
        /* A lost renderer cannot erase the retained operation. */
      }
  }
  private publish(): void {
    const status = this.status()
    // A healthy startup consumes prompting even if no renderer survives to
    // acknowledge the event. Later failures remain manually actionable.
    if (this.startupPrepared && status.connectionHealth.state === 'ready')
      this.startupPromptHandled = true
    this.emit({ kind: 'connection', status })
    // Settlement-driven drain of one explicit intent. Status reads/polls never
    // schedule preparation, and waiting does not reserve the owner it awaits.
    if (this.preparationScheduled) return
    this.preparationScheduled = true
    queueMicrotask(() => {
      this.preparationScheduled = false
      if (selectAiRoute().kind !== 'local-chatgpt-plan') return
      if (this.isSettling()) {
        this.direct.cancelPreparation()
        return
      }
      if (
        this.accountStorageState !== 'ready' ||
        !this.retentionLoaded ||
        this.storageFailure ||
        this.hasPendingWork() ||
        this.contentPending()
      )
        return
      this.direct.startPreparation()
    })
  }
  private async ensure(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (async () => {
        this.retentionLoaded = false
        this.retained.clear()
        this.protectedRecords.clear()
        try {
          if (selectAiRoute().kind === 'local-chatgpt-plan') await this.direct.initialize()
          this.accountStorageState = 'ready'
        } catch (error) {
          this.accountStorageState = 'failed'
          throw error
        }
        const operations = await this.storage.operations()
        for (const item of operations) {
          // Storage validates the record using its own version and frozen digest.
          if (active(item.view)) {
            item.view = {
              ...item.view,
              state: 'unknown',
              reason: 'outcome-unknown',
              finishedAt: Date.now(),
              sequence: item.view.sequence + 1
            }
            await this.storage.retain(item)
          }
          this.retained.set(item.view.operationId, item)
          this.protectedRecords.set(item.view.operationId, structuredClone(item))
        }
        this.retentionLoaded = true
        this.storageFailure = false
      })().catch((error) => {
        this.storageFailure = true
        this.initialization = null
        throw error
      })
    }
    await this.initialization
    if (this.storageFailure || this.journalFailure) throw new AiError('storage-unavailable')
  }
  async readStatus(): Promise<AiStatus> {
    try {
      await this.ensure()
    } catch {
      /* A local connection problem never blocks writing or app startup. */
    }
    return this.status()
  }
  async startup(input: AiStartupInput): Promise<AiStartup> {
    // These markers survive renderer replacement, but reset with the main process.
    if (input.action === 'acknowledge') this.startupPromptHandled = true
    const before = input.action === 'acknowledge' ? this.status() : await this.readStatus()
    if (input.action === 'prepare' && !this.startupPrepared && !this.isSettling()) {
      this.startupPrepared = true
      if (
        before.route.kind === 'local-chatgpt-plan' &&
        before.activeConnectionId &&
        before.connectionHealth.state !== 'ready' &&
        before.connectionHealth.state !== 'progress' &&
        this.accountStorageState === 'ready' &&
        !this.storageFailure &&
        !this.journalFailure
      ) {
        try {
          this.direct.requestPreparation(before.activeConnectionId)
        } catch {
          // Missing credentials/permission remain actionable in the authoritative status.
          // Startup never initiates sign-in or loops on a failed preparation.
        }
      }
    }
    const status = this.status()
    if (this.startupPrepared && status.connectionHealth.state === 'ready')
      this.startupPromptHandled = true
    let promptGranted = false
    if (
      input.action === 'claim-prompt' &&
      this.startupPrepared &&
      !this.startupPromptHandled &&
      !this.isSettling() &&
      status.connectionHealth.state !== 'progress' &&
      (!status.direct || status.direct.preparation === 'idle') &&
      !['signing-in', 'refreshing', 'disconnecting'].includes(status.state)
    ) {
      // Reserve before replying: a lost reply/replaced renderer cannot prompt twice.
      this.startupPromptHandled = true
      promptGranted = status.connectionHealth.state !== 'ready'
    }
    return {
      prepared: this.startupPrepared,
      promptHandled: this.startupPromptHandled,
      promptGranted,
      status
    }
  }
  status(): AiStatus {
    const snapshot = this.statusSnapshot()
    return {
      ...snapshot,
      capabilities: conversationCapabilities(snapshot, this.direct.researchEvidence()),
      connectionHealth: deriveConnectionHealth(
        snapshot,
        this.accountStorageState,
        secureAiStorage(),
        snapshot.route.kind === 'local-chatgpt-plan' ? this.direct.connectionIssue() : null
      )
    }
  }
  private statusSnapshot(): Omit<AiStatus, 'connectionHealth' | 'capabilities'> {
    const route = selectAiRoute()
    if (route.kind === 'local-chatgpt-plan') {
      const available = secureAiStorage() && !this.storageFailure && !this.journalFailure
      const idle = !this.isSettling() && !this.busy && !this.running && !this.contentPending()
      const blocked =
        this.journalFailure || this.contentPending()
          ? 'output-protection-required'
          : this.retained.size >= AI_LIMITS.jobs
            ? 'operation-capacity-full'
            : !idle
              ? 'ai-work-pending'
              : null
      const snapshot = this.direct.snapshot(
        available,
        idle,
        blocked,
        !this.isSettling() && !this.busy && !this.running
      )
      const reasons: AiReason[] = []
      if (!secureAiStorage()) reasons.push('secure-storage-unavailable')
      if (this.storageFailure || this.journalFailure) reasons.push('storage-unavailable')
      if (snapshot.direct?.issue && !reasons.includes(snapshot.direct.issue.reason))
        reasons.push(snapshot.direct.issue.reason)
      return {
        sequence: ++this.statusSequence,
        reviewRevision: this.currentReviewStamp('conversation'),
        proofreadReviewRevision: this.currentReviewStamp('proofread'),
        work: this.contentWork(),
        capacity: this.capacity(),
        provider: DIRECT_AI_PROVIDER,
        channel: RELEASE.channel,
        implementation: 'partial',
        route,
        funding: routeFunding(route),
        configured: true,
        channelPermitted: true,
        commercialApproved: false,
        runtime: 'unavailable',
        execution: null,
        local: null,
        reasons,
        ...snapshot
      }
    }
    // Commercial identity is recognized, but no registered funding/isolation
    // contract exists. It cannot activate another account or execution owner.
    const reason =
      route.kind === 'registered-openai' ? 'commercial-requirements-pending' : route.reason
    const reasons: AiReason[] =
      route.kind === 'registered-openai'
        ? [
            'commercial-activation-pending',
            'configuration-required',
            'funding-unknown',
            'isolation-unresolved'
          ]
        : ['development-access-unavailable']
    if (!secureAiStorage()) reasons.push('secure-storage-unavailable')
    if (this.storageFailure || this.journalFailure) reasons.push('storage-unavailable')
    return {
      sequence: ++this.statusSequence,
      reviewRevision: this.currentReviewStamp('conversation'),
      proofreadReviewRevision: this.currentReviewStamp('proofread'),
      work: this.contentWork(),
      capacity: this.capacity(),
      provider: AI_PROVIDER,
      channel: RELEASE.channel,
      implementation: 'partial',
      route,
      session: { state: 'unavailable', reason },
      funding: routeFunding(route),
      features: {
        conversation: { state: 'unavailable', reason },
        proofread: { state: 'unavailable', reason }
      },
      configured: false,
      channelPermitted: false,
      commercialApproved: false,
      runtime: 'unavailable',
      state: 'unavailable',
      reasons,
      attemptId: null,
      activeConnectionId: null,
      connections: [],
      remoteRevocation: 'none',
      catalog: null,
      execution: null,
      direct: null,
      local: null,
      actions: {
        connect: false,
        refresh: false,
        disconnect: false,
        select: false,
        resume: false,
        cleanup: false,
        protectConnection: false,
        refreshModels: false,
        selectModel: false
      }
    }
  }
  private requireIdle(): void {
    if (this.isSettling() || this.hasPendingWork()) throw new AiError('busy')
  }
  private requireAccountIdle(): void {
    this.requireIdle()
    if (this.contentPending()) throw new AiError('busy')
  }
  async connect(input: AiConnectInput): Promise<AiStatus> {
    await this.ensure()
    requireDirectRoute()
    if (this.cancelledAttempts.has(input.attemptId)) return this.status()
    if (
      this.isSettling() ||
      this.busy ||
      this.running ||
      this.pendingRetention ||
      this.retentionWriting ||
      this.contentPending()
    )
      throw new AiError('busy')
    this.direct.connect(input)
    return this.status()
  }
  async cancelConnect(attemptId: string): Promise<AiStatus> {
    // Latch cancellation even while the matching connect is loading storage.
    if (this.cancelledAttempts.size >= 64)
      this.cancelledAttempts.delete(this.cancelledAttempts.values().next().value!)
    this.cancelledAttempts.add(attemptId)
    await this.direct.cancel(attemptId)
    return this.status()
  }
  async refresh(id: string): Promise<AiStatus> {
    await this.ensure()
    this.requireAccountIdle()
    await this.direct.renew(id)
    if (!this.isSettling()) this.direct.requestPreparation(id)
    return this.status()
  }
  async disconnect(id: string): Promise<AiStatus> {
    await this.ensure()
    this.requireAccountIdle()
    await this.direct.disconnect(id)
    return this.status()
  }
  async protectConnection(): Promise<AiStatus> {
    await this.ensure()
    requireDirectRoute()
    if (this.isSettling() || this.busy || this.running) throw new AiError('busy')
    await this.direct.protect()
    return this.status()
  }
  /** Selecting a protected account prepares metadata, never sends project context. */
  async select(id: string): Promise<AiStatus> {
    await this.ensure()
    this.requireAccountIdle()
    await this.direct.select(id)
    return this.status()
  }
  async prepareConnection(id: string): Promise<AiStatus> {
    await this.ensure()
    requireDirectRoute()
    if (this.isSettling()) throw new AiError('busy')
    this.direct.requestPreparation(id)
    return this.status()
  }
  async selectModel(input: AiSelectModelInput): Promise<AiStatus> {
    await this.ensure()
    this.requireAccountIdle()
    await this.direct.selectModel(input)
    return this.status()
  }
  private authorize(
    input: AiPrepareInput,
    session: AiDispatchSession,
    execution: CurrentAiExecution
  ): void {
    this.requireWorkspaceAvailable(input.scope)
    try {
      this.access.authorizeAi(input.scope, true)
    } catch {
      throw new AiError('read-only-project')
    }
    const route = selectAiRoute()
    if (this.closing || this.suspended || route.kind !== session.route)
      throw new AiError('context-changed')
    if (
      route.kind !== 'local-chatgpt-plan' ||
      route.policyRevision !== execution.policyRevision ||
      !['conversation', 'import'].includes(input.action)
    )
      throw new AiError('context-changed')
    if (!secureAiStorage()) throw new AiError('secure-storage-unavailable')
    if (this.storageFailure || this.journalFailure) throw new AiError('storage-unavailable')
    session.authorize(input, execution)
  }
  /** New work requires a capture committed by the main content adapter and live review. */
  async prepare(input: AiPrepareInput, content: ContentAuthorization): Promise<AiPrepared> {
    this.requireWorkspaceAvailable(input.scope)
    await this.ensure()
    this.requireIdle()
    try {
      this.access.authorizeAi(input.scope, true)
    } catch {
      throw new AiError('read-only-project')
    }
    if (
      content &&
      ((content.template !== templateFor(input.action) &&
        !(
          input.action === 'import' &&
          (content.template === 'project-import-mapping-v1' ||
            content.template === 'project-import-semantic-v1')
        ) &&
        !(
          input.action === 'conversation' &&
          (content.template === 'conversation-v2' ||
            content.template === 'conversation-research-v1' ||
            content.template === 'conversation-imported-v1' ||
            content.template === 'conversation-imported-research-v1')
        )) ||
        content.reviewStamp !== this.currentReviewStamp(input.action))
    )
      throw new AiError('context-changed')
    // Frozen recognition executions can be recovered, but cannot be prepared again.
    if (
      content?.template === 'project-import-analysis-v1' ||
      content?.template === 'project-import-analysis-v2'
    )
      throw new AiError('invalid-request')
    requireDirectRoute()
    if (content.template === 'mechanics-v1' || !['conversation', 'import'].includes(input.action))
      throw new AiError('invalid-request')
    await this.direct.renew(input.connectionId)
    const execution = this.direct.execution(input, content.captureDigest, content.template)
    const session = this.direct.dispatchSession()
    this.requireIdle()
    if (content && content.reviewStamp !== this.currentReviewStamp(input.action))
      throw new AiError('context-changed')
    this.authorize(input, session, execution)
    for (const [key, value] of this.prepared)
      if (value.receipt.expiresAt < Date.now()) this.prepared.delete(key)
    if (this.retained.has(input.operationId) || (await this.storage.operation(input.operationId)))
      throw new AiError('context-changed')
    if (this.prepared.size >= 8 || this.retained.size >= AI_LIMITS.jobs) throw new AiError('busy')
    const receipt: AiPrepared = {
      authorizationId: randomUUID(),
      operationId: input.operationId,
      digest:
        execution.template === 'project-import-semantic-v1' ||
        execution.template === 'project-import-mapping-v1'
          ? operationDigestV12(input, execution)
          : execution.framingVersion === 6
            ? operationDigestV9(input, execution)
            : execution.template === 'conversation-research-v1'
              ? operationDigestV6(input, execution)
              : execution.template === 'conversation-v2'
                ? operationDigestV5(input, execution)
                : operationDigestV4(input, execution),
      expiresAt: Date.now() + 5 * 60000
    }
    this.requireWorkspaceAvailable(input.scope)
    this.prepared.set(receipt.authorizationId, {
      receipt,
      input: structuredClone(input),
      execution,
      session
    })
    return { ...receipt }
  }
  preparedVersion(authorizationId: string): CurrentOperation['version'] {
    const prepared = this.prepared.get(authorizationId)
    if (!prepared) throw new AiError('context-changed')
    const execution = prepared.execution
    return execution.template === 'project-import-semantic-v1' ||
      execution.template === 'project-import-mapping-v1'
      ? 12
      : execution.framingVersion === 6
        ? 9
        : execution.template === 'conversation-research-v1'
          ? 6
          : execution.template === 'conversation-v2'
            ? 5
            : 4
  }
  async start(input: AiStartInput, dispatchGuard?: () => void): Promise<AiOperation> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    const prior =
      this.retained.get(input.operationId) ?? (await this.storage.operation(input.operationId))
    if (prior) {
      if (!sameProject(prior.view.scope, input.scope) || prior.view.digest !== input.digest)
        throw new AiError('context-changed')
      this.access.authorizeAi(input.scope, false)
      const protectedRecord =
        this.protectedRecords.get(input.operationId) ??
        (!this.retained.has(input.operationId) ? prior : null)
      if (!protectedRecord) throw new AiError('storage-unavailable')
      return structuredClone(protectedRecord.view) // Exact replay never resends inference.
    }
    await this.ensure()
    this.requireIdle()
    if (this.retained.size >= AI_LIMITS.jobs) throw new AiError('busy')
    const prepared = this.prepared.get(input.authorizationId)
    if (
      !prepared ||
      prepared.receipt.operationId !== input.operationId ||
      prepared.receipt.digest !== input.digest ||
      prepared.receipt.expiresAt < Date.now() ||
      !sameProject(prepared.input.scope, input.scope)
    )
      throw new AiError('context-changed')
    this.authorize(prepared.input, prepared.session, prepared.execution)
    const view: AiOperation = {
      operationId: input.operationId,
      scope: { ...input.scope },
      connectionId: prepared.input.connectionId,
      model: prepared.input.model,
      action: prepared.input.action,
      digest: input.digest,
      state: 'starting',
      text: '',
      sequence: 0,
      reason: null,
      startedAt: Date.now(),
      finishedAt: null
    }
    const execution = prepared.execution
    const item: CurrentOperation =
      execution.template === 'project-import-semantic-v1'
        ? {
            version: 12,
            input: structuredClone(prepared.input),
            execution: structuredClone(execution),
            view: { ...view, importRefusal: null },
            output: { commentary: '', finalText: null }
          }
        : execution.template === 'project-import-mapping-v1'
          ? {
              version: 12,
              input: structuredClone(prepared.input),
              execution: structuredClone(execution),
              view: { ...view, importRefusal: null },
              output: { commentary: '', finalText: null }
            }
          : execution.framingVersion === 6
            ? {
                version: 9,
                input: prepared.input,
                execution,
                view:
                  execution.outputContract === 'responses-research-v1'
                    ? { ...view, research: null }
                    : view,
                output: { commentary: '', finalText: null }
              }
            : execution.template === 'conversation-research-v1'
              ? {
                  version: 6,
                  input: prepared.input,
                  execution,
                  view: { ...view, research: null },
                  output: { commentary: '', finalText: null }
                }
              : execution.template === 'conversation-v2'
                ? {
                    version: 5,
                    input: prepared.input,
                    execution,
                    view,
                    output: { commentary: '', finalText: null }
                  }
                : {
                    version: 4,
                    input: prepared.input,
                    execution,
                    view,
                    output: { commentary: '', finalText: null }
                  }
    this.busy = true
    try {
      await this.storage.retain(item)
      this.retained.set(input.operationId, item)
      this.protectedRecords.set(input.operationId, structuredClone(item))
    } catch {
      // An uncertain initial write cannot be tried as a new dispatch. Preserve
      // this same identity for disk-only protection and never open a runtime.
      item.view = {
        ...item.view,
        state: 'unknown',
        reason: 'outcome-unknown',
        finishedAt: Date.now(),
        sequence: 1
      }
      this.retained.set(input.operationId, item)
      this.prepared.delete(input.authorizationId)
      this.journalFailure = true
      this.unprotectedOperationId = input.operationId
      this.publish()
      throw new AiError('storage-unavailable')
    } finally {
      this.busy = false
    }
    this.prepared.delete(input.authorizationId)
    this.activeOperationId = input.operationId
    this.dispatch = prepared.session
    this.emit({ kind: 'operation', operation: item.view })
    this.running = this.run(item, prepared.session, dispatchGuard).finally(() => {
      this.running = null
      this.dispatch = null
      this.activeOperationId = null
      this.publish()
    })
    this.publish()
    return structuredClone(this.protectedRecords.get(input.operationId)!.view)
  }
  private queueRetention(item: RetainedOperation): void {
    // Coalesce partial snapshots rather than retaining one promise/copy for each token.
    this.pendingRetention = structuredClone(item)
    if (this.publishTimer) return
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null
      this.flushRetention()
    }, 200)
  }
  private flushRetention(): void {
    if (this.journalFailure || this.retentionWriting || !this.pendingRetention) return
    this.retentionWriting = true
    let writingOperationId: string | null = null
    this.retention = (async () => {
      while (this.pendingRetention) {
        const item = this.pendingRetention
        this.pendingRetention = null
        writingOperationId = item.view.operationId
        await this.storage.retain(item)
        this.protectedRecords.set(item.view.operationId, structuredClone(item))
        this.emit({ kind: 'operation', operation: item.view })
      }
    })()
      .catch(() => {
        this.journalFailure = true
        this.unprotectedOperationId = writingOperationId
        void this.dispatch?.interrupt().catch(() => undefined)
        this.publish()
      })
      .finally(() => {
        this.retentionWriting = false
      })
  }
  private async run(
    item: CurrentOperation,
    session: AiDispatchSession,
    dispatchGuard?: () => void
  ): Promise<void> {
    const update = (value: AiTextUpdate): void => {
      if (!active(item.view)) return
      item.view = {
        ...item.view,
        text: value.text,
        ...(item.version === 12
          ? { importRefusal: value.state === 'failed' ? (value.importRefusal ?? null) : null }
          : {}),
        ...(item.version === 6 ||
        (item.version === 9 && item.execution.outputContract === 'responses-research-v1')
          ? { research: value.state === 'completed' ? (value.research ?? null) : null }
          : {}),
        state:
          value.state === 'running' && item.view.state === 'cancelling'
            ? 'cancelling'
            : value.state,
        reason: value.reason,
        sequence: item.view.sequence + 1,
        finishedAt: value.state === 'running' ? null : Date.now()
      }
      item.output = {
        commentary: value.commentary,
        finalText: value.state === 'completed' ? value.finalText : null
      }
      this.queueRetention(item)
    }
    try {
      const execution = item.execution
      this.authorize(item.input, session, execution)
      await session.execute(
        item.input,
        execution,
        async () => {
          if (
            this.closing ||
            this.suspended ||
            item.view.state === 'cancelling' ||
            this.journalFailure
          )
            throw new AiError('cancelled')
          dispatchGuard?.()
          this.authorize(item.input, session, execution)
        },
        update
      )
      if (active(item.view))
        update({
          text: item.view.text,
          commentary: item.output.commentary,
          finalText: null,
          state: 'unknown',
          reason: 'outcome-unknown'
        })
    } catch (error) {
      const reason = aiReason(error)
      update({
        text: item.view.text,
        commentary: item.output.commentary,
        finalText: null,
        state:
          reason === 'cancelled'
            ? 'cancelled'
            : reason === 'outcome-unknown'
              ? 'unknown'
              : 'failed',
        reason
      })
    } finally {
      if (this.publishTimer) {
        clearTimeout(this.publishTimer)
        this.publishTimer = null
      }
      this.flushRetention()
      await this.retention
      // A snapshot may have arrived while the previous write was settling.
      this.flushRetention()
      await this.retention
      // Unprotected output remains in memory and blocks close. It is never
      // emitted as protected or settled into a portable project on disk failure.
    }
  }
  async cancel(input: AiOperationInput): Promise<AiOperation> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    this.access.authorizeAi(input.scope, false)
    const item = this.retained.get(input.operationId)
    if (!item) {
      const cold = await this.contentRecord(input)
      if (!cold) throw new AiError('invalid-request')
      return structuredClone(cold.view)
    }
    if (!item || !sameProject(item.view.scope, input.scope)) throw new AiError('invalid-request')
    if (active(item.view) && this.activeOperationId === input.operationId) {
      item.view = { ...item.view, state: 'cancelling', sequence: item.view.sequence + 1 }
      this.queueRetention(item)
      try {
        await this.dispatch?.interrupt()
      } catch {
        // The protected operation owns cancellation status.
      }
    }
    const protectedRecord = this.protectedRecords.get(input.operationId)
    if (!protectedRecord) throw new AiError('storage-unavailable')
    return structuredClone(protectedRecord.view)
  }
  async operations(scope: OpenInput): Promise<AiOperation[]> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    this.access.authorizeAi(scope, false)
    return [...this.protectedRecords.values()]
      .filter((item) => sameProject(item.view.scope, scope))
      .map((item) => structuredClone(item.view))
  }
  async operationRecord(
    input: AiOperationInput
  ): Promise<import('../../shared/ai').AiOperationRecord> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    this.access.authorizeAi(input.scope, false)
    const item = await this.contentRecord(input)
    if (!item || !sameProject(item.view.scope, input.scope)) throw new AiError('invalid-request')
    return structuredClone({ input: item.input, operation: item.view })
  }
  /** Main-only recovery reader retains the original version and final channel.
   * It never loads a session or exposes local account identity through IPC. */
  async contentRecord(input: AiOperationInput): Promise<RetainedOperation | null> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    this.access.authorizeAi(input.scope, false)
    const item =
      this.protectedRecords.get(input.operationId) ??
      (!this.retained.has(input.operationId)
        ? await this.storage.operation(input.operationId)
        : null)
    if (!item && this.retained.has(input.operationId)) throw new AiError('storage-unavailable')
    if (item && !sameProject(item.view.scope, input.scope)) throw new AiError('invalid-request')
    return item ? structuredClone(item) : null
  }
  protectedContentOperation(
    operationId: string,
    version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  ): AiOperation | null {
    const item = this.protectedRecords.get(operationId)
    return item?.version === version ? contentOperation(item) : null
  }
  protectedContentState(
    operationId: string,
    version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  ): AiOperation['state'] | null {
    const item = this.protectedRecords.get(operationId)
    return item?.version === version ? contentState(item) : null
  }
  needsProtection(operationId: string): boolean {
    return this.journalFailure && this.unprotectedOperationId === operationId
  }
  async hasOperation(input: AiOperationInput): Promise<boolean> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    this.access.authorizeAi(input.scope, false)
    const item =
      this.retained.get(input.operationId) ?? (await this.storage.operation(input.operationId))
    if (item && !sameProject(item.view.scope, input.scope)) throw new AiError('invalid-request')
    return !!item
  }
  async retryProtection(input: AiOperationInput): Promise<AiOperation> {
    if (this.initialization) await this.initialization
    else await this.ensure()
    this.access.authorizeAi(input.scope, false)
    if (!this.retained.has(input.operationId)) {
      const cold = await this.contentRecord(input)
      if (!cold) throw new AiError('invalid-request')
      return structuredClone(cold.view)
    }
    if (this.running || this.busy || this.direct.hasAccountWork()) throw new AiError('busy')
    const item = this.retained.get(input.operationId)
    if (!item || !sameProject(item.view.scope, input.scope)) throw new AiError('invalid-request')
    this.busy = true
    try {
      await this.retention
      if (this.journalFailure && this.unprotectedOperationId !== input.operationId)
        throw new AiError('invalid-request')
      if (this.pendingRetention && this.pendingRetention.view.operationId !== input.operationId)
        throw new AiError('busy')
      if (this.publishTimer) {
        clearTimeout(this.publishTimer)
        this.publishTimer = null
      }
      await this.storage.retain(item)
      this.protectedRecords.set(input.operationId, structuredClone(item))
      this.pendingRetention = null
      this.journalFailure = false
      this.unprotectedOperationId = null
      this.emit({ kind: 'operation', operation: item.view })
      return structuredClone(item.view)
    } finally {
      this.busy = false
      this.publish()
    }
  }
  /** The existing native close/update handshake calls this before allowing storage
   * shutdown. It does not discard a pending draft or silently replay an operation. */
  beginClose(): void {
    this.closeRequested = true
    this.direct.cancelPreparation()
    this.invalidateReviews()
    this.publish()
  }
  hasProviderWork(): boolean {
    return !!(this.running || this.direct.hasAccountWork())
  }
  async prepareClose(stopProvider = false): Promise<boolean> {
    this.beginClose()
    if (this.hasProviderWork() && !stopProvider) return false
    this.closing = true
    this.publish()
    if (stopProvider) {
      const item = this.activeOperationId ? this.retained.get(this.activeOperationId) : null
      if (item && active(item.view)) {
        item.view = { ...item.view, state: 'cancelling', sequence: item.view.sequence + 1 }
        this.queueRetention(item)
      }
      const stopped = (async () => {
        await this.dispatch?.interrupt().catch(() => undefined)
        await this.direct.close()
        await this.running
      })()
      if (!(await providerSettled(stopped))) return false
    }
    this.flushRetention()
    await this.retention
    if (this.hasPendingWork()) return false
    return (await this.settleContent()) && !this.contentPending() && !this.journalFailure
  }
  resume(): void {
    this.closing = false
    this.closeRequested = false
    this.publish()
  }
  /** Wake/reload releases suspension only. A native close handshake still owns
   * its barrier until it finishes or explicitly keeps the window open. */
  resumeSession(): void {
    this.suspended = false
    this.publish()
  }
  suspend(): void {
    this.suspended = true
    this.invalidateReviews()
    this.publish()
    void this.dispatch?.interrupt().catch(() => undefined)
    this.direct.suspend()
  }
}
