import { randomUUID } from 'node:crypto'
import type { AiConnectInput, AiModel, AiStatus } from '../../shared/ai'
import type { AiCatalog, AiSelectModelInput } from '../../shared/ai-catalog'
import type { AiConnectionReason, AiSession } from '../../shared/ai-route'
import { CodexAccountError, CodexAccountRuntime } from './codex-account-runtime'
import { AiError } from './errors'
import { emptyLocalSession, type LocalCodexSessionV2 } from './local-session-metadata'
import type { AiStorage } from './storage'

/** One main-owned account session, independent of project/panel lifetime. The
 * encrypted active pointer alone grants resume authority; retired candidates
 * are only eligible for logout. No credential bytes are handled by Collie. */
export class LocalCodexSession {
  private data = emptyLocalSession()
  private initialized = false
  private runtime: CodexAccountRuntime | null = null
  private controller: AbortController | null = null
  private work: Promise<void> | null = null
  private activity: 'connect' | 'resume' | 'disconnect' | 'cleanup' | 'protect' | 'models' | null = null
  private catalog: AiCatalog = {state:'not-loaded'}
  private epoch: string | null = null
  private attempt: { input: AiConnectInput; cancelled: boolean; accepting: boolean } | null = null
  private cancelled = new Set<string>()
  private attempted = new Map<string,string|null>()
  private pendingWrite: LocalCodexSessionV2 | null = null
  private connected = false
  private closing = false
  private closeWork: Promise<boolean> | null = null
  private issue: AiConnectionReason | null = null
  private revocation: AiStatus['remoteRevocation'] = 'none'
  constructor(private readonly storage: AiStorage, private readonly changed: () => void) {}
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.data = await this.storage.localSession()
    this.initialized = true
    if (this.data.lastAttempt) this.attempted.set(this.data.lastAttempt.attemptId,this.data.lastAttempt.connectionId)
  }
  hasPendingWork(): boolean { return !!(this.work || this.pendingWrite) }
  snapshot(available: boolean, canProtect: boolean): Pick<AiStatus,'session'|'state'|'attemptId'|'activeConnectionId'|'connections'|'actions'|'remoteRevocation'|'local'|'catalog'> {
    const account = this.data.active?.account
    const idle = available && this.initialized && !this.work && !this.pendingWrite && !this.closing
    const session: AiSession = this.attempt ? {state:'signing-in',attemptId:this.attempt.input.attemptId} :
      this.activity === 'disconnect' && account ? {state:'disconnecting',connectionId:account.connectionId} :
      this.activity === 'resume' && account ? {state:'resuming',connectionId:account.connectionId} :
      this.activity === 'models' && account ? {state:'refreshing',connectionId:account.connectionId} :
      !available ? {state:'unavailable',reason:'secure-session-unavailable'} :
      !account ? {state:'signed-out'} : this.connected && !this.pendingWrite ? {state:'signed-in',connectionId:account.connectionId} :
      this.issue === 'reconnect-required' || this.issue === 'local-account-changed' ? {state:'reconnect-required',connectionId:account.connectionId} :
      {state:'saved-needs-resume',connectionId:account.connectionId}
    return {session,catalog:structuredClone(this.catalog),state:this.attempt?'signing-in':this.activity==='disconnect'?'disconnecting':this.work?'refreshing':
      !available?'unavailable':this.connected&&!this.pendingWrite?'signed-in':'signed-out',
      attemptId:this.attempt?.input.attemptId??null,activeConnectionId:account?.connectionId??null,
      connections:account?[{id:account.connectionId,label:account.label,state:this.connected&&!this.pendingWrite?'signed-in':'signed-out',planConsent:false}]:[],
      actions:{connect:idle&&this.data.retired.length<7,resume:idle&&!!account&&!this.connected,refresh:false,disconnect:idle&&!!account,
        select:false,cleanup:idle&&this.data.retired.length>0,protectConnection:canProtect&&!this.work&&!!this.pendingWrite&&!this.closing,
        refreshModels:idle&&this.connected&&!!account,selectModel:idle&&this.connected&&this.catalog.state==='loaded'&&this.catalog.models.length>0},
      remoteRevocation:this.revocation,
      local:{issue:this.pendingWrite&&!this.work?'local-protection-required':this.issue,cleanupCount:this.data.retired.length,
        protectionPending:!!this.pendingWrite&&!this.work,cancellable:!!this.attempt&&!this.attempt.accepting&&!this.attempt.cancelled}}
  }
  private requireIdle(): void { if (this.closing || this.work || this.pendingWrite) throw new AiError('busy') }
  private async save(next: LocalCodexSessionV2): Promise<void> {
    // Keep the exact desired envelope on uncertainty. Its only recovery action
    // rewrites local encrypted metadata; it cannot spawn/login/infer.
    this.data=structuredClone(next);this.pendingWrite=structuredClone(next)
    await this.storage.saveLocalSession(this.pendingWrite)
    this.pendingWrite=null
  }
  private failure(error: unknown): void {
    this.issue = this.pendingWrite ? 'local-protection-required' : error instanceof CodexAccountError ? error.connectionReason :
      error instanceof AiError && error.reason === 'cancelled' ? null :
      error instanceof AiError && error.reason === 'runtime-unavailable' ? 'local-runtime-exited' :
      error instanceof AiError && error.reason === 'secure-storage-unavailable' ? 'secure-session-unavailable' : this.issue ?? 'reconnect-required'
  }
  private begin(activity: NonNullable<LocalCodexSession['activity']>, operation: (signal: AbortSignal)=>Promise<void>): void {
    this.activity=activity;this.issue=null
    const controller=new AbortController();this.controller=controller
    // Schedule after work is assigned, so immediate status/actions are serialized.
    this.work=Promise.resolve().then(()=>operation(controller.signal)).catch(error=>this.failure(error)).finally(()=>{
      this.activity=null;this.work=null;this.controller=null;this.attempt=null;this.changed()
    })
    this.changed()
  }
  private async stopRuntime(): Promise<void> {
    const runtime=this.runtime;this.runtime=null;this.connected=false;this.epoch=null;this.catalog={state:'not-loaded'}
    await runtime?.close()
  }
  private async open(profileId: string, signal: AbortSignal): Promise<CodexAccountRuntime> {
    const runtime=new CodexAccountRuntime(this.storage,reason=>{
      if (this.runtime!==runtime) return
      this.connected=false;this.epoch=null;this.catalog={state:'not-loaded'};this.issue=reason;this.changed()
    })
    this.runtime=runtime
    try { await runtime.open(profileId,signal);return runtime }
    catch(error) { await this.stopRuntime();throw error }
  }
  connect(input: AiConnectInput): void {
    if (this.cancelled.has(input.attemptId)) return
    if (this.attempted.has(input.attemptId)) {
      if (this.attempted.get(input.attemptId)!==input.connectionId) throw new AiError('invalid-request')
      return
    }
    this.requireIdle()
    if (input.connectionId !== (this.data.active?.account.connectionId??null)) throw new AiError('invalid-request')
    if (this.data.retired.length>=7) throw new AiError('busy')
    if (this.attempted.size>=64) this.attempted.delete(this.attempted.keys().next().value!)
    this.attempted.set(input.attemptId,input.connectionId)
    const attempt={input:structuredClone(input),cancelled:false,accepting:false};this.attempt=attempt
    const prior=this.data.active,profileId=randomUUID()
    this.begin('connect',async signal=>{
      try {
        // Candidate cannot be resumed after interruption, even if login succeeds
        // before Collie can persist/observe its completion.
        await this.save({...this.data,lastAttempt:input,retired:[...this.data.retired,profileId]})
        await this.stopRuntime()
        if (signal.aborted||attempt.cancelled) throw new AiError('cancelled')
        const runtime=await this.open(profileId,signal)
        const label=await runtime.login(signal)
        if (signal.aborted||attempt.cancelled||this.closing) throw new AiError('cancelled')
        if (!runtime.isAlive()) throw new CodexAccountError('local-runtime-exited')
        // Matching completion and account read have now won the cancellation
        // race. Disable cancellation before the durable adoption write starts;
        // a later Cancel reports the committed result, never false cancellation.
        attempt.accepting=true;this.changed()
        await this.save({...this.data,active:{profileId,account:{connectionId:randomUUID(),label}},
          retired:[...this.data.retired.filter(id=>id!==profileId),...(prior?[prior.profileId]:[])]})
        this.connected=runtime.isAlive();this.revocation='none'
        this.epoch=this.connected?runtime.epoch:null
        if (!this.connected) this.issue='local-runtime-exited'
      } catch(error) {
        await this.stopRuntime()
        // A failed final write restores the old pointer and retains the new
        // namespace for logout; an uncertain restoration blocks normal close.
        if (this.data.active?.profileId===profileId) {
          await this.save({...this.data,active:prior,retired:[...this.data.retired.filter(id=>id!==prior?.profileId),profileId]})
        }
        throw error
      }
      // Retired profiles are explicit, visible cleanup work; never launch a
      // second token owner or silently reauthenticate an old account here.
    })
  }
  async cancel(attemptId: string): Promise<void> {
    if (this.cancelled.size>=64) this.cancelled.delete(this.cancelled.values().next().value!)
    this.cancelled.add(attemptId)
    const attempt=this.attempt
    if (!attempt || attempt.input.attemptId!==attemptId) return
    const work=this.work
    if (attempt.accepting) {
      await work
      if (this.connected && !this.closing && !this.work && this.data.lastAttempt?.attemptId===attemptId) {
        this.issue='login-completed-before-cancel';this.changed()
      }
      return
    }
    attempt.cancelled=true
    const runtime=this.runtime,controller=this.controller
    // Tombstone first. Give the exact runtime login a chance to cancel; closing
    // also releases the callback listener when its reply is lost.
    try { await runtime?.cancelLogin() } catch {/* Candidate stays retired. */}
    controller?.abort();await work
  }
  async resumeAccount(connectionId: string): Promise<void> {
    this.requireIdle()
    const active=this.data.active
    if (!active||active.account.connectionId!==connectionId) throw new AiError('signed-out')
    if (this.connected) return
    this.begin('resume',async signal=>{
      await this.stopRuntime()
      try {
        const runtime=await this.open(active.profileId,signal),label=await runtime.readAccount()
        if (signal.aborted||this.closing) throw new AiError('cancelled')
        if (!runtime.isAlive()) throw new CodexAccountError('local-runtime-exited')
        // Published account/read has no stable subject/workspace ID. A changed
        // label requires new browser authorization; CD04 owns execution binding.
        if (label!==active.account.label) throw new CodexAccountError('local-account-changed')
        this.connected=true;this.epoch=runtime.epoch
      } catch(error) {await this.stopRuntime();throw error}
    })
    await this.work
  }
  async disconnect(connectionId: string): Promise<void> {
    this.requireIdle()
    const active=this.data.active
    if (!active || active.account.connectionId!==connectionId) throw new AiError('signed-out')
    this.begin('disconnect',async signal=>{
      // Persist removal authority first; restart cannot resume a half-signed-out account.
      try {await this.save({...this.data,active:null,retired:[...this.data.retired,active.profileId]})}
      finally {await this.stopRuntime()}
      this.revocation='unconfirmed'
      await this.cleanRetired(signal)
    })
    await this.work
  }
  /** Explicit user action only. Status/model reads below never contact Codex. */
  async refreshModels(connectionId: string): Promise<void> {
    this.requireIdle()
    const active=this.data.active,runtime=this.runtime,epoch=this.epoch
    if (!active||active.account.connectionId!==connectionId||!this.connected||!runtime||!epoch) throw new AiError('signed-out')
    const previous=this.catalog.state==='loaded'?this.catalog.selectedModelId:null
    this.catalog={state:'loading'}
    this.begin('models',async signal=>{
      // This action has a different controller from the original login. Close
      // the same child to settle its pending reads promptly on close/suspend.
      const abort=():void=>{void runtime.close()}
      signal.addEventListener('abort',abort,{once:true})
      try {
        if (signal.aborted) throw new AiError('cancelled')
        const label=await runtime.readAccount()
        if (label!==active.account.label) throw new CodexAccountError('local-account-changed')
        const models=await runtime.models()
        if (signal.aborted||this.closing||this.runtime!==runtime||this.epoch!==epoch||!runtime.isAlive()) throw new AiError('cancelled')
        // Keep an explicit choice only when the same account still advertises it.
        // Never silently switch to a catalog default or another model.
        this.catalog={state:'loaded',revision:randomUUID(),models,selectedModelId:models.some(m=>m.id===previous)?previous:null}
      } catch(error) {
        if (error instanceof CodexAccountError && ['local-account-changed','reconnect-required'].includes(error.connectionReason)) await this.stopRuntime()
        if (this.runtime===runtime&&this.epoch===epoch&&!signal.aborted&&!this.closing) {
          const reason=error instanceof CodexAccountError&&['model-catalog-timeout','login-timeout'].includes(error.connectionReason)?'model-catalog-timeout':'model-catalog-unavailable'
          this.catalog={state:'failed',reason}
          throw new CodexAccountError(reason)
        }
        throw error
      } finally {signal.removeEventListener('abort',abort)}
    })
    await this.work
  }
  selectModel(input: AiSelectModelInput): void {
    this.requireIdle()
    if (!this.connected||!this.runtime?.isAlive()||input.connectionId!==this.data.active?.account.connectionId) throw new AiError('signed-out')
    if (this.catalog.state!=='loaded'||this.catalog.revision!==input.catalogRevision) throw new AiError('context-changed')
    if (!this.catalog.models.some(m=>m.id===input.modelId)) throw new AiError('model-unavailable')
    this.catalog={...this.catalog,selectedModelId:input.modelId};this.changed()
  }
  legacyModels(connectionId: string): AiModel[] {
    if (connectionId!==this.data.active?.account.connectionId||!this.connected) throw new AiError('signed-out')
    // I12 accepts mere membership as Send eligibility. Keep its legacy endpoint
    // empty until CD04/CD05 replace that check with a durable local-route grant.
    // Real model choices are exposed only through the connection catalog.
    return []
  }
  private async cleanRetired(signal: AbortSignal): Promise<void> {
    await this.stopRuntime()
    for (const profileId of [...this.data.retired]) {
      if (signal.aborted||this.closing) throw new AiError('cancelled')
      try {
        const runtime=await this.open(profileId,signal)
        await runtime.logout()
        await this.save({...this.data,retired:this.data.retired.filter(id=>id!==profileId)})
        this.revocation='unconfirmed'
      } catch(error) {if (!this.pendingWrite) this.issue='local-cleanup-required';throw error}
      finally {await this.stopRuntime()}
    }
  }
  async cleanup(): Promise<void> {
    this.requireIdle()
    if (!this.data.retired.length) return
    this.begin('cleanup',signal=>this.cleanRetired(signal));await this.work
  }
  async protect(): Promise<void> {
    if (this.work||this.closing) throw new AiError('busy')
    const pending=this.pendingWrite
    if (!pending) return
    this.begin('protect',async()=>{await this.storage.saveLocalSession(pending);this.pendingWrite=null})
    await this.work
  }
  close(): Promise<boolean> {
    if (this.closeWork) return this.closeWork
    this.closing=true
    this.closeWork=(async()=>{
      if (this.attempt) await this.cancel(this.attempt.input.attemptId)
      else {this.controller?.abort();await this.work}
      await this.stopRuntime()
      return !this.pendingWrite
    })().finally(()=>{this.closing=false;this.closeWork=null;this.changed()})
    return this.closeWork
  }
  suspend(): void { void this.close() }
}
