import { RESEARCH_INSTRUCTIONS, RESEARCH_POLICY, researchFits } from './direct-research'
import {
  conversationFits,
  conversationFrame,
  CONVERSATION_INSTRUCTIONS_V2,
  type DirectTextExecution
} from './direct-conversation'
import { randomUUID } from 'node:crypto'
import type { AiConnectInput, AiPrepareInput, AiStatus } from '../../shared/ai'
import type { AiCatalog, AiSelectModelInput } from '../../shared/ai-catalog'
import type { AiDirectStatus, DirectStage } from '../../shared/ai-direct'
import type { AiActionAvailability, AiConnectionReason } from '../../shared/ai-route'
import { AiError } from './errors'
import { selectAiRoute, OPENAI } from './deployment'
import type { AiStorage } from './storage'
import {
  emptyPlanCredentials,
  planAuthorized,
  type PlanAccount,
  type PlanCredentials
} from './direct-credentials'
import { PlanSignIn, parsePlanTokens } from './direct-auth'
import { openAiRequest, revokeOpenAi } from './openai-http'
import {
  directFailure,
  directIssue,
  DirectError,
  httpFailure,
  terminalRefresh,
  unusableCredential
} from './direct-errors'
import { planModels, planResponse } from './direct-http'
import {
  DIRECT_INSTRUCTIONS,
  directAccountIdentity,
  directFits,
  directFrame
} from './direct-operation'
import type { AiDispatchSession } from './dispatch-session'
import { DirectConnectionIssues } from './connection-health'
import type { AiConnectionHealthReason } from '../../shared/ai-connection-health'
import { emptyPlanPreferences, type PlanPreferences } from './direct-preferences'

/** Owner-only SIWC public client. No managed Codex profile is opened or read. */
export class DirectPlanSession {
  private data: PlanCredentials = emptyPlanCredentials()
  private catalog: AiCatalog = { state: 'not-loaded' }
  private epoch = randomUUID()
  private preferences = emptyPlanPreferences()
  private preferencesUnreadable = false
  private pendingPreferences: PlanPreferences | null = null
  private preparation: { id: string; generation: string } | null = null
  private preparing = false
  private researchObservation: {
    connectionId: string
    model: string
    epoch: string
    catalog: string
    state: 'observed-success' | 'observed-refusal'
  } | null = null
  researchEvidence(): 'observed-success' | 'observed-refusal' | null {
    const o = this.researchObservation,
      catalog = this.catalog
    return o &&
      o.connectionId === this.data.activeId &&
      o.epoch === this.epoch &&
      catalog.state === 'loaded' &&
      catalog.revision === o.catalog &&
      catalog.selectedModelId === o.model
      ? o.state
      : null
  }
  private rejectedModels = new Map<string, string>()
  // One sanitized diagnostic per saved account (at most eight), never content
  // or credentials. Reconnecting or loading models cannot erase this evidence.
  private requestFailures = new Map<string, NonNullable<AiDirectStatus['lastRequestFailure']>>()
  private pendingWrite: PlanCredentials | null = null
  private work: Promise<void> | null = null
  private controller: AbortController | null = null
  private login: PlanSignIn | null = null
  private attempts = new Map<string, string | null>()
  private cancelled = new Set<string>()
  private connectionState: AiStatus['state'] | null = null
  private actionId: string | null = null
  private revocation: AiStatus['remoteRevocation'] = 'none'
  private readonly healthIssues = new DirectConnectionIssues()
  private detail: AiDirectStatus = {
    stage: null,
    authentication: 'signed-out',
    planAuthorized: false,
    inference: 'not-run',
    issue: null,
    lastRequestFailure: null,
    preparation: 'idle',
    preferences: 'ready',
    protectionPending: false
  }
  constructor(
    private readonly storage: AiStorage,
    private readonly changed: (invalidate: boolean) => void
  ) {}
  async initialize(): Promise<void> {
    this.data = await this.storage.planCredentials()
    try {
      await this.readPreferences()
    } catch {
      // A separate preference failure must not discard a protected account.
      this.preferencesUnreadable = true
    }
  }
  connectionIssue(): AiConnectionHealthReason | null {
    const issue = this.healthIssues.reason(this.data.activeId)
    if (issue) return issue
    const remembered = this.preferences.accounts.find((a) => a.connectionId === this.data.activeId)
    return remembered &&
      this.catalog.state === 'loaded' &&
      this.catalog.models.length &&
      (!this.catalog.models.some((m) => m.id === remembered.modelId) ||
        this.rejectedModels.get(remembered.connectionId) === remembered.modelId)
      ? 'model-unavailable'
      : null
  }
  hasPendingWork(): boolean {
    return !!(this.work || this.pendingWrite || this.pendingPreferences)
  }
  hasAccountWork(): boolean {
    return !!this.work
  }
  private requireIdle(): void {
    if (this.hasPendingWork()) throw new AiError('busy')
    if (selectAiRoute().kind !== 'local-chatgpt-plan')
      throw new AiError('development-access-unavailable')
  }
  private account(id: string): PlanAccount {
    const a = this.data.accounts.find((a) => a.id === id)
    if (!a) throw new AiError('signed-out')
    return a
  }
  private selected(): PlanAccount | undefined {
    return this.data.accounts.find((a) => a.id === this.data.activeId)
  }
  private reset(): void {
    this.epoch = randomUUID()
    this.preparation = null
    this.catalog = { state: 'not-loaded' }
    this.detail.inference = 'not-run'
    this.changed(true)
  }
  private stage(stage: DirectStage): void {
    this.detail.stage = stage
    this.changed(false)
  }
  private async save(next: PlanCredentials): Promise<void> {
    const candidate = structuredClone(next)
    try {
      await this.storage.savePlanCredentials(candidate)
      this.data = candidate
    } catch (error) {
      this.pendingWrite = candidate
      this.detail.issue = directIssue('credential-storage', 'storage-unavailable')
      this.changed(true)
      throw error
    }
  }
  private async readPreferences(): Promise<void> {
    const next = await this.storage.planPreferences()
    if (next.accounts.some((entry) => !this.data.accounts.some((a) => a.id === entry.connectionId)))
      throw new AiError('storage-unavailable')
    this.preferences = next
    this.preferencesUnreadable = false
  }
  private rememberedModel(id: string): string | null {
    return this.preferences.accounts.find((a) => a.connectionId === id)?.modelId ?? null
  }
  private async saveModel(id: string, modelId: string): Promise<void> {
    if (this.preferencesUnreadable) throw new AiError('storage-unavailable')
    if (this.rememberedModel(id) === modelId) return
    const next: PlanPreferences = {
      version: 1,
      accounts: [
        ...this.preferences.accounts.filter((a) => a.connectionId !== id),
        { connectionId: id, modelId }
      ]
    }
    try {
      await this.storage.savePlanPreferences(next)
      this.preferences = next
    } catch (error) {
      this.pendingPreferences = next
      this.changed(true)
      throw error
    }
  }
  async protect(): Promise<void> {
    if (this.work) throw new AiError('busy')
    // Reserve the owner throughout local writes, too. A second click cannot race
    // a model/account change or report close-safe while the write is outstanding.
    const work = (async () => {
      if (this.pendingWrite) {
        await this.storage.savePlanCredentials(this.pendingWrite)
        this.data = this.pendingWrite
        this.pendingWrite = null
        this.reset()
      }
      if (this.pendingPreferences) {
        await this.storage.savePlanPreferences(this.pendingPreferences)
        this.preferences = this.pendingPreferences
        this.pendingPreferences = null
        const id = this.data.activeId
        const modelId = id ? this.rememberedModel(id) : null
        if (this.catalog.state === 'loaded' && this.catalog.models.some((m) => m.id === modelId)) {
          this.catalog = { ...this.catalog, selectedModelId: modelId }
          if (id && this.rejectedModels.get(id) !== modelId) {
            this.rejectedModels.delete(id)
            this.healthIssues.replaceModel(id)
          }
        }
      }
      if (this.preferencesUnreadable) await this.readPreferences()
      this.detail.issue = null
      this.changed(true)
    })()
    this.work = work
    this.changed(false)
    try {
      await work
    } finally {
      if (this.work === work) this.work = null
      this.changed(false)
    }
  }
  /** One queued intent for the current account generation, never a polling trigger. */
  requestPreparation(id: string): void {
    if (this.data.activeId !== id) throw new AiError('signed-out')
    if (this.preparing || this.preparation?.generation === this.epoch) return
    const account = this.account(id)
    if (!account.subject || !account.tokens || account.pending) throw new AiError('session-expired')
    if (this.pendingWrite || this.pendingPreferences || this.preferencesUnreadable) return
    if (!planAuthorized(account))
      throw new DirectError(directIssue('plan-authorization', 'consent-required'))
    this.preparation = { id, generation: this.epoch }
    this.changed(false)
  }
  cancelPreparation(): void {
    this.preparation = null
  }
  /** Called only by the service's settlement notifications after its guards pass. */
  startPreparation(): void {
    const requested = this.preparation
    if (!requested || this.hasPendingWork()) return
    this.preparation = null
    if (requested.generation !== this.epoch || requested.id !== this.data.activeId) return
    void this.refreshModels(requested.id).catch(() => undefined) // Status owns the outcome.
  }
  private begin(
    stage: DirectStage,
    state: AiStatus['state'] | null,
    id: string | null,
    action: (signal: AbortSignal) => Promise<void>
  ): Promise<void> {
    this.requireIdle()
    this.controller = new AbortController()
    this.connectionState = state
    this.actionId = id
    this.detail.issue = null
    this.detail.stage = stage
    const signal = this.controller.signal
    const work = Promise.resolve()
      .then(() => action(signal))
      .catch((error) => {
        this.detail.issue = this.pendingWrite
          ? directIssue('credential-storage', 'storage-unavailable')
          : directFailure(this.detail.stage ?? stage, error)
        if (id) this.healthIssues.record(id, this.detail.issue)
        throw error
      })
      .finally(() => {
        if (this.work === work) {
          this.work = null
          this.controller = null
          this.connectionState = null
          this.actionId = null
          this.login = null
        }
        this.changed(false)
      })
    this.work = work
    this.changed(false)
    return work
  }
  connect(input: AiConnectInput): void {
    if (this.cancelled.has(input.attemptId)) return
    if (this.attempts.has(input.attemptId)) {
      if (this.attempts.get(input.attemptId) !== input.connectionId)
        throw new AiError('invalid-request')
      return
    }
    this.requireIdle()
    const existing = input.connectionId ? this.account(input.connectionId) : undefined
    if (!existing && this.data.accounts.length >= 8) throw new AiError('busy')
    if (this.attempts.size >= 64) this.attempts.delete(this.attempts.keys().next().value!)
    this.attempts.set(input.attemptId, input.connectionId)
    const login = new PlanSignIn(input.attemptId, (stage) => this.stage(stage))
    const work = this.begin('registration', 'signing-in', input.connectionId, async (signal) => {
      this.login = login
      signal.addEventListener('abort', () => login.cancel(), { once: true })
      await this.save(this.data) // Stable host ID is durable before opening a browser.
      if (signal.aborted || this.cancelled.has(input.attemptId)) {
        login.cancel()
        throw new AiError('cancelled')
      }
      let registration = existing
      const result = await login.run(this.data.hostId, existing, async (clientId) => {
        if (registration) return
        if (this.data.accounts.some((a) => a.clientId === clientId))
          throw new AiError('auth-failed')
        registration = {
          id: randomUUID(),
          clientId,
          subject: null,
          label: `ChatGPT registration ${this.data.accounts.length + 1} (finish sign-in)`,
          hint: null,
          tokens: null,
          pending: null
        }
        await this.save({ ...this.data, accounts: [...this.data.accounts, registration] })
      })
      if (signal.aborted || login.abort.signal.aborted) throw new AiError('cancelled')
      if (!registration) throw new AiError('auth-failed')
      const saved: PlanAccount = {
        ...registration,
        ...result,
        pending: null,
        label: registration.subject
          ? registration.label
          : `${result.label} · Account ${this.data.accounts.findIndex((a) => a.id === registration!.id) + 1}`
      }
      // Never store parse helper fields or change an unrelated active account.
      const account: PlanAccount = {
        id: saved.id,
        clientId: saved.clientId,
        subject: saved.subject,
        label: saved.label,
        hint: saved.hint,
        tokens: saved.tokens,
        pending: null
      }
      await this.save({
        ...this.data,
        activeId: account.id,
        accounts: this.data.accounts.map((a) => (a.id === account.id ? account : a))
      })
      this.revocation = 'none'
      this.healthIssues.confirm(account.id, 'authorization')
      this.reset()
      this.stage('plan-authorization')
      if (!planAuthorized(account))
        this.detail.issue = directIssue('plan-authorization', 'consent-required')
      else if (!signal.aborted) this.requestPreparation(account.id)
    })
    void work.catch(() => undefined) // Status owns the asynchronous browser outcome.
  }
  async cancel(attemptId: string): Promise<void> {
    if (this.cancelled.size >= 64) this.cancelled.delete(this.cancelled.values().next().value!)
    this.cancelled.add(attemptId)
    if (this.login?.attemptId === attemptId) {
      this.controller?.abort()
      this.login.cancel()
      await this.work?.catch(() => undefined)
    }
  }
  private async renewOnce(id: string, signal: AbortSignal): Promise<void> {
    const account = this.account(id),
      tokens = account.tokens
    if (!tokens || account.pending) throw new AiError('session-expired')
    if (tokens.expiresAt > Date.now() + 120000) return
    if (!tokens.refresh || Date.now() < tokens.earliestRefreshAt) {
      // An early-refresh restriction does not revoke a still-valid access token.
      // Never submit a refresh before the provider's permitted time.
      if (tokens.expiresAt > Date.now()) return
      throw new AiError('session-expired')
    }
    this.stage('renewal')
    await this.save({
      ...this.data,
      accounts: this.data.accounts.map((a) => (a.id === id ? { ...a, pending: 'refresh' } : a))
    })
    try {
      const response = await openAiRequest(
        OPENAI.token,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: account.clientId,
          refresh_token: tokens.refresh,
          resource: OPENAI.resource
        }),
        signal
      )
      if (response.status !== 200) throw httpFailure('renewal', response.status, response.value)
      const next = await parsePlanTokens(
        response.value,
        account.clientId,
        signal,
        account.subject,
        undefined,
        account.hint
      )
      const replacement: PlanAccount = {
        ...account,
        tokens: next.tokens,
        hint: next.hint,
        pending: null
      }
      await this.save({
        ...this.data,
        accounts: this.data.accounts.map((a) => (a.id === id ? replacement : a))
      })
      this.healthIssues.confirm(id, 'authorization')
      if (tokens.scopes.join(' ') !== next.tokens.scopes.join(' ')) this.reset()
    } catch (error) {
      if (this.pendingWrite) throw error // Preserve the exact latest credential candidate.
      if (terminalRefresh(error)) {
        await this.save({
          ...this.data,
          accounts: this.data.accounts.map((a) =>
            a.id === id ? { ...a, tokens: null, pending: null } : a
          )
        })
        this.reset()
      } else if (error instanceof DirectError && error.issue.httpStatus !== null) {
        // A known endpoint refusal did not return replacement tokens. Preserve
        // this grant for an explicit later attempt (including transient errors).
        await this.save({
          ...this.data,
          accounts: this.data.accounts.map((a) => (a.id === id ? { ...a, pending: null } : a))
        })
      }
      // Lost response, failed validation or interruption leaves pending rotation
      // protected. Never replay its possibly consumed refresh token.
      throw error
    }
  }
  private async discardConfirmedInvalid(id: string, code: string | null): Promise<void> {
    if (!unusableCredential(code)) return
    await this.save({
      ...this.data,
      accounts: this.data.accounts.map((a) =>
        a.id === id ? { ...a, tokens: null, pending: null } : a
      )
    })
    this.epoch = randomUUID()
    this.preparation = null
    this.catalog = { state: 'not-loaded' }
    this.changed(true)
  }
  async renew(id: string): Promise<void> {
    await this.begin('renewal', 'refreshing', id, (signal) => this.renewOnce(id, signal))
  }
  async select(id: string): Promise<void> {
    this.requireIdle()
    const a = this.account(id)
    if (!a.subject || !a.tokens || a.pending) throw new AiError('session-expired')
    await this.begin('plan-authorization', null, id, async () => {
      await this.save({ ...this.data, activeId: id })
      this.reset()
      this.requestPreparation(id)
    })
  }
  async disconnect(id: string): Promise<void> {
    await this.begin('renewal', 'disconnecting', id, async (signal) => {
      const account = this.account(id),
        refresh = account.tokens?.refresh
      await this.save({
        ...this.data,
        accounts: this.data.accounts.map((a) =>
          a.id === id ? { ...a, pending: 'sign-out', hint: null } : a
        )
      })
      let confirmed = false
      if (refresh) {
        confirmed = await revokeOpenAi(refresh, account.clientId, signal)
        if (!confirmed && !signal.aborted) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 500)
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer)
                resolve()
              },
              { once: true }
            )
          })
          if (!signal.aborted) confirmed = await revokeOpenAi(refresh, account.clientId, signal)
        }
      }
      await this.save({
        ...this.data,
        activeId: this.data.activeId === id ? null : this.data.activeId,
        accounts: this.data.accounts.map((a) =>
          a.id === id ? { ...a, tokens: null, hint: null, pending: null } : a
        )
      })
      this.revocation = !refresh ? 'none' : confirmed ? 'confirmed' : 'unconfirmed'
      this.reset()
    })
  }
  async refreshModels(id: string): Promise<void> {
    this.requireIdle()
    if (this.data.activeId !== id) throw new AiError('signed-out')
    this.preparation = null
    this.preparing = true
    this.catalog = { state: 'loading' }
    this.changed(true)
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    try {
      await this.begin('model-discovery', null, id, async (signal) => {
        // Transport deadlines still apply. Abort through the credential owner;
        // never race away from a possibly rotated token or a pending local write.
        const owner = this.controller
        timer = setTimeout(() => {
          timedOut = true
          owner?.abort()
        }, 45000)
        if (this.preferencesUnreadable) throw new AiError('storage-unavailable')
        if (signal.aborted) throw new AiError('cancelled')
        await this.renewOnce(id, signal)
        if (signal.aborted) throw new AiError('cancelled')
        const account = this.requireAccount(id)
        const generation = this.epoch
        this.stage('model-discovery')
        const models = await planModels(account.tokens!.access, signal).catch(async (error) => {
          if (error instanceof DirectError) await this.discardConfirmedInvalid(id, error.issue.code)
          throw error
        })
        if (signal.aborted || generation !== this.epoch || id !== this.data.activeId)
          throw new AiError('cancelled')
        this.healthIssues.confirm(id, 'catalog')
        const remembered = this.rememberedModel(id)
        const defaults = models.filter((m) => m.isDefault)
        const modelId =
          remembered ?? (defaults.length === 1 ? defaults[0].id : models[0]?.id) ?? null
        const selectedModelId =
          modelId && models.some((m) => m.id === modelId) && this.rejectedModels.get(id) !== modelId
            ? modelId
            : null
        this.catalog = { state: 'loaded', revision: randomUUID(), models, selectedModelId: null }
        if (selectedModelId) {
          this.stage('model-preference')
          await this.saveModel(id, selectedModelId)
          if (signal.aborted || generation !== this.epoch || id !== this.data.activeId)
            throw new AiError('cancelled')
          this.catalog = { ...this.catalog, selectedModelId }
        }
        this.changed(true)
      })
    } catch (error) {
      // A failed preference write retains the fresh catalog and exact candidate
      // for disk-only protection; model discovery must not be repeated to save it.
      if (timedOut && !this.pendingWrite && !this.pendingPreferences) {
        this.detail.issue = directIssue(
          this.detail.stage ?? 'model-discovery',
          'offline',
          'interrupted'
        )
        this.healthIssues.record(id, this.detail.issue)
      }
      if (!this.pendingPreferences)
        this.catalog = {
          state: 'failed',
          reason: timedOut ? 'model-catalog-timeout' : 'model-catalog-unavailable'
        }
      this.changed(true)
      throw error
    } finally {
      clearTimeout(timer)
      this.preparing = false
      this.changed(false)
    }
  }
  async selectModel(input: AiSelectModelInput): Promise<void> {
    this.requireIdle()
    this.requireAccount(input.connectionId)
    const catalog = this.catalog
    if (catalog.state !== 'loaded' || catalog.revision !== input.catalogRevision)
      throw new AiError('context-changed')
    if (
      !catalog.models.some((m) => m.id === input.modelId) ||
      this.rejectedModels.get(input.connectionId) === input.modelId
    )
      throw new AiError('model-unavailable')
    this.changed(true)
    await this.begin('model-preference', null, input.connectionId, async () => {
      await this.saveModel(input.connectionId, input.modelId)
      this.catalog = { ...catalog, selectedModelId: input.modelId }
      if (this.rejectedModels.get(input.connectionId) !== input.modelId) {
        this.rejectedModels.delete(input.connectionId)
        this.healthIssues.replaceModel(input.connectionId)
      }
      this.changed(true)
    })
  }
  private requireAccount(id: string): PlanAccount {
    if (selectAiRoute().kind !== 'local-chatgpt-plan' || this.pendingWrite)
      throw new AiError(
        this.pendingWrite ? 'storage-unavailable' : 'development-access-unavailable'
      )
    const a = this.account(id)
    if (this.data.activeId !== id || !a.tokens || !a.subject) throw new AiError('signed-out')
    if (a.pending || a.tokens.expiresAt <= Date.now()) throw new AiError('session-expired')
    if (!planAuthorized(a))
      throw new DirectError(directIssue('plan-authorization', 'consent-required'))
    return a
  }
  execution(
    input: AiPrepareInput,
    captureDigest: string,
    template: 'conversation-v1' | 'conversation-v2' | 'conversation-research-v1' = 'conversation-v1'
  ): DirectTextExecution {
    this.requireIdle()
    const a = this.requireAccount(input.connectionId),
      catalog = this.catalog
    const contractIssue = this.healthIssues.requestContractIssue(a.id)
    if (contractIssue) throw new DirectError(contractIssue)
    if (
      input.action !== 'conversation' ||
      !(template === 'conversation-research-v1'
        ? researchFits(input)
        : template === 'conversation-v2'
          ? conversationFits(input)
          : directFits(input))
    )
      throw new AiError('invalid-request')
    if (catalog.state !== 'loaded' || catalog.selectedModelId !== input.model)
      throw new AiError('model-unavailable')
    if (template === 'conversation-research-v1')
      return {
        route: 'local-chatgpt-plan',
        policyRevision: 1,
        researchPolicy: structuredClone(RESEARCH_POLICY),
        framingVersion: 3,
        template,
        outputContract: 'responses-research-v1',
        accountFingerprint: directAccountIdentity(a.clientId, a.subject!),
        sessionGeneration: this.epoch,
        catalogRevision: catalog.revision,
        captureDigest,
        framedText: conversationFrame(input),
        instructions: RESEARCH_INSTRUCTIONS
      }
    if (template === 'conversation-v2')
      return {
        route: 'local-chatgpt-plan',
        policyRevision: 1,
        framingVersion: 2,
        template,
        outputContract: 'responses-text-v1',
        accountFingerprint: directAccountIdentity(a.clientId, a.subject!),
        sessionGeneration: this.epoch,
        catalogRevision: catalog.revision,
        captureDigest,
        framedText: conversationFrame(input),
        instructions: CONVERSATION_INSTRUCTIONS_V2
      }
    return {
      route: 'local-chatgpt-plan',
      policyRevision: 1,
      framingVersion: 1,
      template: 'conversation-v1',
      outputContract: 'responses-text-v1',
      accountFingerprint: directAccountIdentity(a.clientId, a.subject!),
      sessionGeneration: this.epoch,
      catalogRevision: catalog.revision,
      captureDigest,
      framedText: directFrame(input),
      instructions: DIRECT_INSTRUCTIONS
    }
  }
  dispatchSession(): AiDispatchSession {
    const controller = new AbortController()
    const authorize: AiDispatchSession['authorize'] = (input, execution) => {
      if (!execution || execution.route !== 'local-chatgpt-plan')
        throw new AiError('context-changed')
      const current = this.execution(input, execution.captureDigest, execution.template)
      if (JSON.stringify(current) !== JSON.stringify(execution))
        throw new AiError('context-changed')
    }
    return {
      route: 'local-chatgpt-plan',
      authorize,
      execute: async (input, execution, guard, update) => {
        let sent = false,
          text = ''
        try {
          authorize(input, execution)
          await guard()
          if (!execution || execution.route !== 'local-chatgpt-plan')
            throw new AiError('context-changed')
          const account = this.requireAccount(input.connectionId)
          if (controller.signal.aborted) throw new AiError('cancelled')
          this.detail.inference = 'sending'
          this.detail.issue = null
          this.stage('inference-http')
          sent = true
          await planResponse(
            account.tokens!.access,
            input.model,
            execution,
            controller.signal,
            (value) => {
              text = value.text
              update(value)
              if (value.state === 'completed') {
                if (execution.template === 'conversation-research-v1' && value.research?.searched)
                  this.researchObservation = {
                    connectionId: input.connectionId,
                    model: input.model,
                    epoch: execution.sessionGeneration,
                    catalog: execution.catalogRevision,
                    state: 'observed-success'
                  }
                this.detail.inference = 'completed'
                this.healthIssues.confirm(input.connectionId, 'response')
                this.rejectedModels.delete(input.connectionId)
                this.changed(false)
              }
            },
            () => {
              this.detail.inference = 'streaming'
              this.stage('inference-stream')
            }
          )
        } catch (error) {
          const issue = directFailure(this.detail.stage ?? 'inference-http', error)
          const searchRefusal =
            execution?.route === 'local-chatgpt-plan' &&
            execution.template === 'conversation-research-v1' &&
            (issue.reason === 'model-unavailable' ||
              issue.code === 'subscription_sharing_unsupported_capability' ||
              (issue.httpStatus === 403 &&
                (issue.parameter === 'tools' || issue.parameter?.startsWith('tools[') === true)))
          if (searchRefusal && execution?.route === 'local-chatgpt-plan')
            this.researchObservation = {
              connectionId: input.connectionId,
              model: input.model,
              epoch: execution.sessionGeneration,
              catalog: execution.catalogRevision,
              state: 'observed-refusal'
            }
          if (sent && !searchRefusal) {
            this.healthIssues.record(input.connectionId, issue)
            if (issue.reason === 'model-unavailable')
              this.rejectedModels.set(input.connectionId, input.model)
          }
          const uncertain =
            sent &&
            (controller.signal.aborted ||
              !(error instanceof DirectError) ||
              issue.kind === 'interrupted')
          this.detail.issue = uncertain
            ? { ...issue, reason: 'outcome-unknown', kind: 'interrupted' }
            : issue
          this.detail.inference = uncertain
            ? 'unknown'
            : issue.kind === 'incomplete'
              ? 'incomplete'
              : issue.reason === 'cancelled'
                ? 'cancelled'
                : 'failed'
          if (sent)
            this.requestFailures.set(input.connectionId, {
              operationId: input.operationId,
              model: input.model,
              occurredAt: Date.now(),
              issue: { ...this.detail.issue }
            })
          try {
            await this.discardConfirmedInvalid(input.connectionId, issue.code)
          } catch {
            // The exact token-clearing candidate is retained. Its local-only
            // protection action can finish before the conversation handoff.
            this.detail.issue = directIssue('credential-storage', 'storage-unavailable')
          }
          // A request failure is not a lost account or model catalog. Confirmed
          // invalid credentials are handled above; fixed contract refusals remain
          // blocked by healthIssues. Only a model refusal clears the selection.
          if (
            !searchRefusal &&
            issue.reason === 'model-unavailable' &&
            this.catalog.state === 'loaded'
          ) {
            this.catalog = { ...this.catalog, revision: randomUUID(), selectedModelId: null }
            this.changed(true)
          }
          update({
            text,
            commentary: '',
            finalText: null,
            state: uncertain ? 'unknown' : issue.reason === 'cancelled' ? 'cancelled' : 'failed',
            reason: uncertain ? 'outcome-unknown' : issue.reason
          })
          this.changed(false)
        }
      },
      interrupt: async () => {
        controller.abort()
      }
    }
  }
  snapshot(
    available: boolean,
    idle: boolean,
    blocked: AiConnectionReason | null,
    canProtect = idle
  ): Pick<
    AiStatus,
    | 'session'
    | 'state'
    | 'connections'
    | 'activeConnectionId'
    | 'attemptId'
    | 'remoteRevocation'
    | 'catalog'
    | 'direct'
    | 'actions'
    | 'features'
  > {
    const a = this.selected(),
      usable = !!a?.tokens && !a.pending && a.tokens.expiresAt > Date.now(),
      authorized = planAuthorized(a)
    const accountIdle = available && idle && !this.hasPendingWork()
    const session: AiStatus['session'] =
      this.connectionState === 'signing-in'
        ? {
            state: 'signing-in',
            attemptId: this.login?.attemptId ?? [...this.attempts.keys()].at(-1)!
          }
        : this.connectionState === 'refreshing' && this.actionId
          ? { state: 'refreshing', connectionId: this.actionId }
          : this.connectionState === 'disconnecting' && this.actionId
            ? { state: 'disconnecting', connectionId: this.actionId }
            : a?.tokens
              ? usable
                ? { state: 'signed-in', connectionId: a.id }
                : { state: 'reconnect-required', connectionId: a.id }
              : { state: 'signed-out' }
    const reason: AiConnectionReason | null = !available
      ? 'secure-session-unavailable'
      : this.pendingWrite || this.pendingPreferences || this.preferencesUnreadable
        ? 'output-protection-required'
        : (blocked ??
          (this.work
            ? 'account-work-pending'
            : !a?.tokens
              ? 'connect-required'
              : !usable
                ? 'reconnect-required'
                : !authorized
                  ? 'plan-authorization-required'
                  : this.healthIssues.blocksRequestContract(a.id)
                    ? 'request-contract-unavailable'
                    : this.catalog.state === 'failed'
                      ? this.catalog.reason
                      : this.catalog.state !== 'loaded'
                        ? 'model-refresh-required'
                        : !this.catalog.models.length
                          ? 'no-text-models'
                          : !this.catalog.selectedModelId
                            ? 'model-selection-required'
                            : null))
    const conversation: AiActionAvailability = reason
      ? { state: 'unavailable', reason }
      : {
          state: 'available',
          connectionId: a!.id,
          model: (this.catalog as Extract<AiCatalog, { state: 'loaded' }>).selectedModelId!
        }
    return {
      session,
      state: this.connectionState ?? (a?.tokens ? 'signed-in' : 'signed-out'),
      connections: this.data.accounts.map((a) => ({
        id: a.id,
        label: a.label,
        state: !a.tokens
          ? 'signed-out'
          : a.pending || a.tokens.expiresAt <= Date.now()
            ? 'expired'
            : 'signed-in',
        planConsent: planAuthorized(a)
      })),
      activeConnectionId: this.data.activeId,
      attemptId: session.state === 'signing-in' ? session.attemptId : null,
      remoteRevocation: this.revocation,
      catalog: structuredClone(this.catalog),
      direct: {
        ...this.detail,
        issue: this.detail.issue ?? this.healthIssues.requestContractIssue(this.data.activeId),
        lastRequestFailure: a ? structuredClone(this.requestFailures.get(a.id) ?? null) : null,
        authentication: usable ? 'verified' : a?.tokens ? 'reconnect-required' : 'signed-out',
        planAuthorized: authorized,
        preparation: this.preparing ? 'running' : this.preparation ? 'waiting' : 'idle',
        preferences: this.pendingPreferences
          ? 'pending'
          : this.preferencesUnreadable
            ? 'unreadable'
            : 'ready',
        protectionPending: !!this.pendingWrite
      },
      features: {
        conversation,
        proofread: { state: 'unavailable', reason: 'proofreading-adapter-not-ready' }
      },
      actions: {
        connect: accountIdle,
        refresh: accountIdle && !!a?.tokens,
        disconnect: accountIdle,
        select: accountIdle,
        resume: false,
        cleanup: false,
        protectConnection:
          available &&
          canProtect &&
          !this.work &&
          !!(this.pendingWrite || this.pendingPreferences || this.preferencesUnreadable),
        refreshModels:
          accountIdle && !this.preferencesUnreadable && !!a?.tokens && !a.pending && authorized,
        selectModel:
          accountIdle &&
          !this.preferencesUnreadable &&
          usable &&
          authorized &&
          this.catalog.state === 'loaded'
      }
    }
  }
  async close(): Promise<boolean> {
    this.cancelPreparation()
    this.controller?.abort()
    this.login?.cancel()
    await this.work?.catch(() => undefined)
    return !this.pendingWrite && !this.pendingPreferences
  }
  suspend(): void {
    this.cancelPreparation()
    this.controller?.abort()
    this.login?.cancel()
    this.changed(true)
  }
}
