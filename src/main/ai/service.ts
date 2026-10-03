import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { AI_LIMITS, AI_PROVIDER, type AiConnectInput, type AiEvent, type AiModel, type AiOperation, type AiOperationInput,
  type AiPrepareInput, type AiPrepared, type AiReason, type AiStartInput, type AiStatus } from '../../shared/ai'
import { sameProject } from '../../shared/access'
import type { AiSession } from '../../shared/ai-route'
import type { AiSelectModelInput } from '../../shared/ai-catalog'
import type { OpenInput } from '../../shared/projects'
import type { AccessService } from '../entitlements/service'
import { RELEASE } from '../release'
import { codexExecutable, type CodexRuntime } from './codex-runtime'
import { PROVIDER_RUNTIMES } from './registry'
import type { CodexTextUpdate } from './codex-text-turn'
import type { AiDispatchSession } from './dispatch-session'
import { CODEX_VERSION, OPENAI_REGISTRATIONS, registration, requireIncludedFunding, requireTextOnlyRuntime,
  requireRegisteredRoute, routeFunding, selectAiRoute } from './deployment'
import { operationDigestV1 } from './operation-identity'
import { contentOperation, identityHash, localExecution, operationDigestV2, templateFor,
  type ContentTemplate, type LocalExecutionV2 } from './local-operation'
import { LocalCodexSession } from './local-codex-session'
import { localExecutionReadiness, localFeatureAvailability } from './codex-local-policy'
import { AiError, aiReason } from './errors'
import { OpenAiSignIn, refreshOpenAi } from './openai-auth'
import { revokeOpenAi } from './openai-http'
import { AiStorage, secureAiStorage, type Account, type Credentials, type RetainedOperation } from './storage'

type Prepared = { receipt:AiPrepared; input:AiPrepareInput; execution:LocalExecutionV2|null; session:AiDispatchSession }
export type ContentAuthorization = {reviewStamp:string;template:ContentTemplate;captureDigest:string}
function active(view:AiOperation):boolean { return ['starting','running','cancelling'].includes(view.state) }

/** Main owns sessions and jobs independently of any mounted renderer panel. */
export class AiService {
  private credentials:Credentials|null=null
  private initialization:Promise<void>|null=null
  private storageFailure=false
  private journalFailure=false
  private unprotectedOperationId:string|null=null
  private busy=false
  private closing=false
  private attempt:OpenAiSignIn|null=null
  private authWork:Promise<void>|null=null
  private authAbort:AbortController|null=null
  private connectionState:AiStatus['state']|null=null
  private connectionActionId:string|null=null
  private lastReason:AiReason|null=null
  private statusSequence=0
  private revocation:AiStatus['remoteRevocation']='none'
  private runtimeState:AiStatus['runtime']='unavailable'
  private prepared=new Map<string,Prepared>()
  private reviewGeneration=randomUUID()
  private retained=new Map<string,RetainedOperation>()
  private protectedRecords=new Map<string,RetainedOperation>()
  private dispatch:AiDispatchSession|null=null
  private running:Promise<void>|null=null
  private activeOperationId:string|null=null
  private pendingRetention:RetainedOperation|null=null
  private retention=Promise.resolve()
  private retentionWriting=false
  private attempted=new Map<string,string|null>()
  private cancelledAttempts=new Set<string>()
  private publishTimer:ReturnType<typeof setTimeout>|null=null
  private listeners=new Set<(event:AiEvent)=>void>()
  private contentPending:()=>boolean=()=>false
  setContentPending(read:()=>boolean):void {this.contentPending=read}
  contentWorkChanged():void {this.publish()}
  readonly storage:AiStorage
  private readonly local:LocalCodexSession
  constructor(workingRoot:()=>string|undefined,private readonly access:AccessService){
    this.storage=new AiStorage(workingRoot)
    this.local=new LocalCodexSession(this.storage,()=>{this.invalidateReviews();this.publish()})
  }
  private invalidateReviews():void {this.prepared.clear();this.reviewGeneration=randomUUID()}
  private currentReviewStamp(action:AiPrepareInput['action']):string {
    return identityHash({generation:this.reviewGeneration,route:selectAiRoute(),action,template:templateFor(action)})
  }
  /** Main-memory stamp only: changing a route/account/model invalidates an
   * unsubmitted review. No account/model refresh occurs while reading it. */
  async reviewStamp(action:AiPrepareInput['action']):Promise<string> {
    try{await this.ensure()}catch{/* Unavailable secure AI storage must not prevent an offline review/save. */}
    return this.currentReviewStamp(action)
  }
  subscribe(listener:(event:AiEvent)=>void):()=>void {this.listeners.add(listener);return()=>this.listeners.delete(listener)}
  hasPendingWork():boolean{return !!(this.busy||this.attempt||this.running||this.pendingRetention||this.retentionWriting||this.journalFailure||this.local.hasPendingWork())}
  private emit(event:AiEvent):void {
    for(const listener of this.listeners)try{listener(structuredClone(event))}catch{/* A lost renderer cannot erase the retained operation. */}
  }
  private publish():void {this.emit({kind:'connection',status:this.status()})}
  private async ensure():Promise<void> {
    if(!this.initialization){
      this.initialization=(async()=>{
        this.retained.clear()
        this.protectedRecords.clear()
        this.credentials=await this.storage.credentials()
        if(selectAiRoute().kind==='local-codex-chatgpt')await this.local.initialize()
        const operations=await this.storage.operations()
        for(const item of operations){
          // Storage validates the record using its own version and frozen digest.
          if(active(item.view)){item.view={...item.view,state:'unknown',reason:'outcome-unknown',finishedAt:Date.now(),sequence:item.view.sequence+1};await this.storage.retain(item)}
          this.retained.set(item.view.operationId,item)
          this.protectedRecords.set(item.view.operationId,structuredClone(item))
        }
        this.runtimeState=app.isPackaged?'not-packaged':await codexExecutable().then(()=> 'development-installed' as const,()=> 'unavailable' as const)
        this.storageFailure=false
      })().catch(error=>{this.storageFailure=true;this.initialization=null;throw error})
    }
    await this.initialization
    if(this.storageFailure||this.journalFailure)throw new AiError('storage-unavailable')
  }
  async readStatus():Promise<AiStatus> {try{await this.ensure()}catch{/* A local connection problem never blocks writing or app startup. */}return this.status()}
  status():AiStatus {
    const route=selectAiRoute()
    if(route.kind==='local-codex-chatgpt') {
      const available=secureAiStorage()&&!this.storageFailure&&!this.journalFailure&&this.runtimeState==='development-installed'
      const execution=localExecutionReadiness(),reasons:AiReason[]=execution.state==='unavailable'?['isolation-unresolved']:[]
      if(!secureAiStorage())reasons.push('secure-storage-unavailable')
      if(this.storageFailure||this.journalFailure)reasons.push('storage-unavailable')
      if(this.runtimeState!=='development-installed')reasons.push('runtime-unavailable')
      const idle=!this.closing&&!this.busy&&!this.running&&!this.contentPending()
      const snapshot=this.local.snapshot(available,secureAiStorage()&&!this.storageFailure&&!this.journalFailure&&idle,idle)
      return {sequence:++this.statusSequence,reviewRevision:this.currentReviewStamp('conversation'),provider:AI_PROVIDER,channel:RELEASE.channel,implementation:'partial',route,
        funding:routeFunding(route),features:this.localFeatures(snapshot),execution,
        configured:true,channelPermitted:true,commercialApproved:false,runtime:this.runtimeState,reasons,...snapshot}
    }
    if(route.kind!=='registered-openai') {
      const reasons:AiReason[]=['development-access-unavailable']
      if(!secureAiStorage())reasons.push('secure-storage-unavailable')
      if(this.storageFailure||this.journalFailure)reasons.push('storage-unavailable')
      if(this.runtimeState!=='development-installed')reasons.push('runtime-unavailable')
      if(this.lastReason&&!reasons.includes(this.lastReason))reasons.push(this.lastReason)
      return {sequence:++this.statusSequence,reviewRevision:this.currentReviewStamp('conversation'),provider:AI_PROVIDER,channel:RELEASE.channel,implementation:'partial',
        route,session:{state:'unavailable',reason:route.reason},funding:routeFunding(route),
        features:{conversation:{state:'unavailable',reason:route.reason},proofread:{state:'unavailable',reason:route.reason}},
        configured:false,channelPermitted:false,commercialApproved:false,runtime:this.runtimeState,state:'unavailable',
        reasons,attemptId:null,activeConnectionId:null,connections:[],remoteRevocation:'none',
        catalog:null,execution:null,local:null,actions:{connect:false,refresh:false,disconnect:false,select:false,resume:false,cleanup:false,protectConnection:false,refreshModels:false,selectModel:false}}
    }
    const config=OPENAI_REGISTRATIONS[RELEASE.channel],reasons:AiReason[]=[]
    try{registration()}catch(error){reasons.push(aiReason(error))}
    if(!config)reasons.push('configuration-required')
    if(!secureAiStorage())reasons.push('secure-storage-unavailable')
    if(this.storageFailure||this.journalFailure)reasons.push('storage-unavailable')
    const selected=this.credentials?.accounts.find(a=>a.id===this.credentials?.activeId)
    if(!selected?.tokens)reasons.push('signed-out')
    else if(selected.tokens.expiresAt<=Date.now()||selected.refreshPending)reasons.push('session-expired')
    else if(!selected.tokens.scopes.includes('chatgpt.tokens.use.direct'))reasons.push('consent-required')
    reasons.push('funding-unknown','isolation-unresolved')
    if(this.runtimeState!=='development-installed')reasons.push('runtime-unavailable')
    if(this.lastReason&&!reasons.includes(this.lastReason))reasons.push(this.lastReason)
    const settled=!!this.credentials&&secureAiStorage()&&!this.storageFailure&&!this.journalFailure&&!this.busy&&!this.attempt&&!this.running&&!this.closing
    const permitted=!!config&&!reasons.some(reason=>['configuration-required','commercial-activation-pending','development-access-unavailable'].includes(reason))
    const session:AiSession=this.attempt?{state:'signing-in',attemptId:this.attempt.attemptId}:
      this.connectionState==='disconnecting'&&this.connectionActionId?{state:'disconnecting',connectionId:this.connectionActionId}:
      this.connectionState==='refreshing'&&this.connectionActionId?{state:'refreshing',connectionId:this.connectionActionId}:
      !config?{state:'unavailable',reason:'commercial-requirements-pending'}:
      !selected?.tokens?{state:'signed-out'}:
      selected.refreshPending||selected.tokens.expiresAt<=Date.now()?{state:'reconnect-required',connectionId:selected.id}:
      {state:'signed-in',connectionId:selected.id}
    return {sequence:++this.statusSequence,reviewRevision:this.currentReviewStamp('conversation'),provider:AI_PROVIDER,channel:RELEASE.channel,implementation:'partial',configured:!!config,
      route,session,funding:routeFunding(route),features:{conversation:{state:'unavailable',reason:'commercial-requirements-pending'},
        proofread:{state:'unavailable',reason:'commercial-requirements-pending'}},
      channelPermitted:permitted,commercialApproved:!!config?.commercialReference,runtime:this.runtimeState,
      state:this.connectionState??(!config?'unavailable':selected?.tokens?'signed-in':'signed-out'),reasons,attemptId:this.attempt?.attemptId??null,
      activeConnectionId:this.credentials?.activeId??null,connections:this.credentials?.accounts.map(a=>({id:a.id,label:a.label,
        state:!a.tokens?'signed-out':a.refreshPending||a.tokens.expiresAt<=Date.now()?'expired':'signed-in',planConsent:!!a.tokens?.scopes.includes('chatgpt.tokens.use.direct')}))??[],remoteRevocation:this.revocation,
      catalog:null,execution:null,local:null,actions:{connect:settled&&permitted,refresh:settled&&permitted,disconnect:settled,select:settled&&permitted,resume:false,cleanup:false,protectConnection:false,refreshModels:false,selectModel:false}}
  }
  private localFeatures(snapshot:ReturnType<LocalCodexSession['snapshot']>,dispatching=false) {
    return localFeatureAvailability({session:snapshot.session,catalog:snapshot.catalog,execution:localExecutionReadiness(),
      accountProtectionPending:!!snapshot.local?.protectionPending,
      protectionPending:this.journalFailure||(!dispatching&&this.contentPending()),
      busy:this.closing||this.busy||(!dispatching&&!!this.running),
      capacityFull:!dispatching&&this.retained.size>=AI_LIMITS.jobs,identityKnown:this.local.hasExecutionIdentity()})
  }
  private requireIdle():void {if(this.closing||this.busy||this.attempt||this.running||this.local.hasPendingWork())throw new AiError('busy')}
  private account(id:string):Account {
    const value=this.credentials?.accounts.find(a=>a.id===id)
    if(!value)throw new AiError('signed-out')
    return value
  }
  private async saveCredentials():Promise<void> {
    try{await this.storage.saveCredentials(this.credentials!)}catch(error){this.storageFailure=true;throw error}
  }
  async connect(input:AiConnectInput):Promise<AiStatus> {
    await this.ensure()
    if(selectAiRoute().kind==='local-codex-chatgpt') {
      if(this.cancelledAttempts.has(input.attemptId))return this.status()
      if(this.closing||this.busy||this.running)throw new AiError('busy')
      this.local.connect(input);return this.status()
    }
    if(this.cancelledAttempts.has(input.attemptId))return this.status()
    if(this.attempted.has(input.attemptId)){
      if(this.attempted.get(input.attemptId)!==input.connectionId)throw new AiError('invalid-request')
      return this.status()
    }
    this.requireIdle()
    const config=registration(),existing=input.connectionId?this.account(input.connectionId):undefined
    if(existing&&existing.clientId!==config.clientId)throw new AiError('configuration-required')
    if(!existing&&this.credentials!.accounts.length>=8)throw new AiError('busy')
    this.busy=true
    try{await this.saveCredentials()}finally{this.busy=false}
    if(this.cancelledAttempts.has(input.attemptId))return this.status()
    if(this.closing)throw new AiError('busy')
    const attempt=new OpenAiSignIn(input.attemptId)
    if(this.attempted.size>=64)this.attempted.delete(this.attempted.keys().next().value!)
    this.attempted.set(input.attemptId,input.connectionId)
    this.attempt=attempt;this.connectionState='signing-in';this.lastReason=null;this.publish()
    const task=(async()=>{
      const result=await attempt.run(config,this.credentials!.hostId,existing)
      if(this.attempt!==attempt||attempt.abort.signal.aborted||this.closing)throw new AiError('cancelled')
      const duplicate=this.credentials!.accounts.find(a=>a.clientId===config.clientId&&a.subject===result.subject)
      const id=existing?.id??duplicate?.id??randomUUID()
      const account:Account={id,clientId:config.clientId,subject:result.subject,label:result.label,tokens:result.tokens,refreshPending:false}
      const next={...this.credentials!,activeId:id,accounts:[...this.credentials!.accounts.filter(a=>a.id!==id),account]}
      // Persist before publishing success. On uncertain storage, all further calls stay closed.
      try{await this.storage.saveCredentials(next)}catch{this.storageFailure=true;throw new AiError('storage-unavailable')}
      if(this.attempt!==attempt||attempt.abort.signal.aborted||this.closing){
        try{await this.storage.saveCredentials(this.credentials!)}catch{this.storageFailure=true;throw new AiError('storage-unavailable')}
        throw new AiError('cancelled')
      }
      this.credentials=next;this.invalidateReviews();this.revocation='none'
    })().catch(error=>{this.lastReason=aiReason(error)}).finally(()=>{
      if(this.attempt===attempt){this.attempt=null;this.connectionState=null}
      this.authWork=null;this.publish()
    })
    this.authWork=task
    return this.status()
  }
  async cancelConnect(attemptId:string):Promise<AiStatus> {
    // Cancellation may arrive while the matching connect call is still loading
    // or protecting credentials. It must also stop that not-yet-opened browser.
    if(this.cancelledAttempts.size>=64)this.cancelledAttempts.delete(this.cancelledAttempts.values().next().value!)
    this.cancelledAttempts.add(attemptId)
    if(selectAiRoute().kind==='local-codex-chatgpt'){await this.local.cancel(attemptId);return this.status()}
    if(this.attempt?.attemptId===attemptId){this.attempt.cancel();await this.authWork}
    return this.status()
  }
  async refresh(id:string):Promise<AiStatus> {
    await this.ensure();this.requireIdle();const config=registration()
    const account=this.account(id)
    if(account.clientId!==config.clientId)throw new AiError('configuration-required')
    if(!account.tokens)throw new AiError('signed-out')
    this.busy=true;this.connectionState='refreshing';this.connectionActionId=id;this.authAbort=new AbortController();this.invalidateReviews();this.publish()
    try{
      if(account.tokens.expiresAt<=Date.now()+120000){
        account.refreshPending=true;await this.saveCredentials()
        const next=await refreshOpenAi(account,this.authAbort.signal)
        account.tokens=next;account.refreshPending=false;await this.saveCredentials();this.lastReason=null
      }
    }catch(error){
      // A sent rotation with an unknown outcome is never replayed with the old token.
      account.tokens=null;account.refreshPending=false
      try{await this.saveCredentials()}catch{this.storageFailure=true}
      this.lastReason=aiReason(error);throw error
    }finally{this.busy=false;this.connectionState=null;this.connectionActionId=null;this.authAbort=null;this.publish()}
    return this.status()
  }
  async disconnect(id:string):Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    if(selectAiRoute().kind==='local-codex-chatgpt'){this.invalidateReviews();await this.local.disconnect(id);return this.status()}
    requireRegisteredRoute()
    const account=this.account(id)
    this.busy=true;this.connectionState='disconnecting';this.connectionActionId=id;this.invalidateReviews();this.authAbort=new AbortController();this.publish()
    try{
      let confirmed=false
      const hadTokens=!!account.tokens
      if(account.tokens){
        // Durable local sign-out intent prevents reuse after interruption, even if
        // remote revocation or the final encrypted write has an unknown outcome.
        account.refreshPending=true;await this.saveCredentials()
        // No stored token authorizes a route after its deployment permission is removed.
        try{if(registration().clientId===account.clientId)confirmed=await revokeOpenAi(account.tokens.refresh,account.clientId,this.authAbort.signal)}catch{/* Local sign-out remains available. */}
      }
      account.tokens=null;account.refreshPending=false
      if(this.credentials!.activeId===id)this.credentials!.activeId=null
      this.revocation=!hadTokens?'none':confirmed?'confirmed':'unconfirmed';await this.saveCredentials();this.lastReason=null
    }finally{this.busy=false;this.connectionState=null;this.connectionActionId=null;this.authAbort=null;this.publish()}
    return this.status()
  }
  async resumeConnection(id:string):Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    if(selectAiRoute().kind!=='local-codex-chatgpt')throw new AiError('development-access-unavailable')
    this.invalidateReviews();await this.local.resumeAccount(id);return this.status()
  }
  async cleanupConnection():Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    if(selectAiRoute().kind!=='local-codex-chatgpt')throw new AiError('development-access-unavailable')
    this.invalidateReviews();await this.local.cleanup();return this.status()
  }
  async protectConnection():Promise<AiStatus> {
    await this.ensure()
    if(selectAiRoute().kind!=='local-codex-chatgpt')throw new AiError('development-access-unavailable')
    if(this.closing||this.busy||this.running||this.attempt)throw new AiError('busy')
    await this.local.protect();return this.status()
  }
  /** Choosing an already protected account is a local explicit action. It never
   * reopens OAuth, refreshes a token, sends context or establishes AI eligibility. */
  async select(id:string):Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    const config=registration(),account=this.account(id)
    if(account.clientId!==config.clientId)throw new AiError('configuration-required')
    if(!account.tokens)throw new AiError('signed-out')
    const previous=this.credentials!.activeId
    this.busy=true
    try{
      this.credentials!.activeId=id;this.invalidateReviews()
      await this.saveCredentials();this.lastReason=null
    }catch(error){this.credentials!.activeId=previous;throw error}
    finally{this.busy=false;this.publish()}
    return this.status()
  }
  private requireSession(id:string):Account {
    registration()
    if(!secureAiStorage()||this.storageFailure)throw new AiError(this.storageFailure?'storage-unavailable':'secure-storage-unavailable')
    const account=this.account(id)
    if(this.credentials!.activeId!==id||!account.tokens)throw new AiError('signed-out')
    if(account.refreshPending||account.tokens.expiresAt<=Date.now())throw new AiError('session-expired')
    if(account.clientId!==registration().clientId)throw new AiError('configuration-required')
    if(!['chatgpt.tokens.use.direct','resource.invoke'].every(scope=>account.tokens!.scopes.includes(scope)))throw new AiError('consent-required')
    return account
  }
  async models(id:string):Promise<AiModel[]> {
    await this.ensure()
    if(selectAiRoute().kind==='local-codex-chatgpt')return this.local.legacyModels(id)
    this.requireIdle();const account=this.requireSession(id)
    // Catalog access sends no prompt. Isolation must still be established before launching a child.
    requireTextOnlyRuntime()
    const runtime=PROVIDER_RUNTIMES[AI_PROVIDER].create(this.storage);this.busy=true
    try{await runtime.open(account.tokens!.access);return await runtime.models()}
    finally{await runtime.close();this.busy=false}
  }
  async refreshModels(id:string):Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    if(selectAiRoute().kind!=='local-codex-chatgpt')throw new AiError('development-access-unavailable')
    this.invalidateReviews();await this.local.refreshModels(id);return this.status()
  }
  async selectModel(input:AiSelectModelInput):Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    if(selectAiRoute().kind!=='local-codex-chatgpt')throw new AiError('development-access-unavailable')
    this.local.selectModel(input);return this.status()
  }
  private authorize(input:AiPrepareInput,session:AiDispatchSession,execution:LocalExecutionV2|null):void {
    try{this.access.authorizeAi(input.scope,true)}catch{throw new AiError('read-only-project')}
    const route=selectAiRoute()
    if(this.closing||route.kind!==session.route)throw new AiError('context-changed')
    if(execution&&(route.kind!=='local-codex-chatgpt'||route.policyRevision!==execution.policyRevision||CODEX_VERSION!==execution.runtimeVersion))throw new AiError('context-changed')
    if(route.kind==='local-codex-chatgpt') {
      if(!secureAiStorage())throw new AiError('secure-storage-unavailable')
      if(this.storageFailure||this.journalFailure)throw new AiError('storage-unavailable')
      if(this.runtimeState!=='development-installed')throw new AiError('runtime-unavailable')
      const available=secureAiStorage()&&!this.storageFailure&&!this.journalFailure&&this.runtimeState==='development-installed'
      // The content owner has already reserved this exact intent. Its own write
      // and running slot must not be mistaken for competing work.
      const feature=this.localFeatures(this.local.snapshot(available,false,false),true)[input.action]
      if(feature.state==='unavailable')throw new AiError(feature.reason==='output-protection-required'?'storage-unavailable':
        feature.reason==='model-selection-required'||feature.reason==='model-refresh-required'||feature.reason==='no-text-models'?'model-unavailable':
        feature.reason==='connect-required'?'signed-out':feature.reason==='resume-required'||feature.reason==='reconnect-required'?'session-expired':
        feature.reason==='local-workspace-identity-unavailable'?'auth-failed':
        feature.reason==='account-work-pending'||feature.reason==='ai-work-pending'?'busy':'isolation-unresolved')
      if(feature.connectionId!==input.connectionId||feature.model!==input.model)throw new AiError('context-changed')
    }
    session.authorize(input,execution)
  }
  private registeredSession():AiDispatchSession {
    let runtime:CodexRuntime|null=null
    return {route:'registered-openai',authorize:(input,execution)=>{
      if(execution)throw new AiError('context-changed')
      requireRegisteredRoute();this.requireSession(input.connectionId);requireIncludedFunding();requireTextOnlyRuntime()
    },execute:async(input,_execution,authorize,update)=>{
      const account=this.requireSession(input.connectionId)
      runtime=PROVIDER_RUNTIMES[AI_PROVIDER].create(this.storage)
      try {
        await authorize();await runtime.open(account.tokens!.access)
        const catalog=await runtime.models()
        if(!catalog.some(model=>model.id===input.model))throw new AiError('model-unavailable')
        await runtime.execute(input.model,JSON.stringify({request:input.prompt,context:input.context}),authorize,
          value=>update({...value,commentary:'',finalText:null}))
      } finally {await runtime.close()}
    },interrupt:async()=>{await runtime?.interrupt()}}
  }
  /** Public raw prepare stays registered-only. Managed Codex requires a capture
   * committed by one of the two main content adapters and its live review. */
  async prepare(input:AiPrepareInput,content?:ContentAuthorization):Promise<AiPrepared> {
    await this.ensure();this.requireIdle()
    try{this.access.authorizeAi(input.scope,true)}catch{throw new AiError('read-only-project')}
    if(content&&(content.template!==templateFor(input.action)||content.reviewStamp!==this.currentReviewStamp(input.action)))throw new AiError('context-changed')
    const route=selectAiRoute()
    let execution:LocalExecutionV2|null=null,session:AiDispatchSession
    if(route.kind==='local-codex-chatgpt') {
      if(!content)throw new AiError('invalid-request')
      execution=localExecution(input,this.local.executionIdentity(input),content.template,content.captureDigest)
      session=this.local.dispatchSession()
    } else {
      requireRegisteredRoute()
      const selected=this.account(input.connectionId)
      if(selected.tokens&&selected.tokens.expiresAt<=Date.now()+120000)await this.refresh(input.connectionId)
      session=this.registeredSession()
    }
    this.requireIdle()
    if(content&&content.reviewStamp!==this.currentReviewStamp(input.action))throw new AiError('context-changed')
    this.authorize(input,session,execution)
    for(const [key,value]of this.prepared)if(value.receipt.expiresAt<Date.now())this.prepared.delete(key)
    if(this.retained.has(input.operationId))throw new AiError('context-changed')
    if(this.prepared.size>=8||this.retained.size>=AI_LIMITS.jobs)throw new AiError('busy')
    const receipt:AiPrepared={authorizationId:randomUUID(),operationId:input.operationId,digest:execution?operationDigestV2(input,execution):operationDigestV1(input),expiresAt:Date.now()+5*60000}
    this.prepared.set(receipt.authorizationId,{receipt,input:structuredClone(input),execution,session})
    return {...receipt}
  }
  preparedVersion(authorizationId:string):1|2 {
    const prepared=this.prepared.get(authorizationId)
    if(!prepared)throw new AiError('context-changed')
    return prepared.execution?2:1
  }
  async start(input:AiStartInput):Promise<AiOperation> {
    if(this.initialization)await this.initialization;else await this.ensure()
    const prior=this.retained.get(input.operationId)
    if(prior){
      if(!sameProject(prior.view.scope,input.scope)||prior.view.digest!==input.digest)throw new AiError('context-changed')
      this.access.authorizeAi(input.scope,false)
      const protectedRecord=this.protectedRecords.get(input.operationId)
      if(!protectedRecord)throw new AiError('storage-unavailable')
      return structuredClone(protectedRecord.view) // Exact replay never resends inference.
    }
    await this.ensure()
    this.requireIdle()
    if(this.retained.size>=AI_LIMITS.jobs)throw new AiError('busy')
    const prepared=this.prepared.get(input.authorizationId)
    if(!prepared||prepared.receipt.operationId!==input.operationId||prepared.receipt.digest!==input.digest||prepared.receipt.expiresAt<Date.now()||!sameProject(prepared.input.scope,input.scope))throw new AiError('context-changed')
    this.authorize(prepared.input,prepared.session,prepared.execution)
    const view:AiOperation={operationId:input.operationId,scope:{...input.scope},connectionId:prepared.input.connectionId,model:prepared.input.model,
      action:prepared.input.action,digest:input.digest,state:'starting',text:'',sequence:0,reason:null,startedAt:Date.now(),finishedAt:null}
    const item:RetainedOperation=prepared.execution?{version:2,input:prepared.input,execution:prepared.execution,view,output:{commentary:'',finalText:null}}:
      {version:1,input:prepared.input,view}
    this.busy=true
    try {
      await this.storage.retain(item);this.retained.set(input.operationId,item);this.protectedRecords.set(input.operationId,structuredClone(item))
    } catch {
      // An uncertain initial write cannot be tried as a new dispatch. Preserve
      // this same identity for disk-only protection and never open a runtime.
      item.view={...item.view,state:'unknown',reason:'outcome-unknown',finishedAt:Date.now(),sequence:1}
      this.retained.set(input.operationId,item);this.prepared.delete(input.authorizationId)
      this.journalFailure=true;this.unprotectedOperationId=input.operationId;this.lastReason='storage-unavailable'
      this.publish();throw new AiError('storage-unavailable')
    } finally {this.busy=false}
    this.prepared.delete(input.authorizationId)
    this.activeOperationId=input.operationId
    this.dispatch=prepared.session
    this.emit({kind:'operation',operation:item.view})
    this.running=this.run(item,prepared.session).finally(()=>{this.running=null;this.dispatch=null;this.activeOperationId=null;this.publish()})
    this.publish()
    return structuredClone(this.protectedRecords.get(input.operationId)!.view)
  }
  private queueRetention(item:RetainedOperation):void {
    // Coalesce partial snapshots rather than retaining one promise/copy for each token.
    this.pendingRetention=structuredClone(item)
    if(this.publishTimer)return
    this.publishTimer=setTimeout(()=>{this.publishTimer=null;this.flushRetention()},200)
  }
  private flushRetention():void {
    if(this.journalFailure||this.retentionWriting||!this.pendingRetention)return
    this.retentionWriting=true
    let writingOperationId:string|null=null
    this.retention=(async()=>{
      while(this.pendingRetention){
        const item=this.pendingRetention;this.pendingRetention=null
        writingOperationId=item.view.operationId
        await this.storage.retain(item)
        this.protectedRecords.set(item.view.operationId,structuredClone(item))
        this.emit({kind:'operation',operation:item.view})
      }
    })().catch(()=>{
      this.journalFailure=true;this.unprotectedOperationId=writingOperationId;this.lastReason='storage-unavailable'
      void this.dispatch?.interrupt().catch(()=>undefined);this.publish()
    })
      .finally(()=>{this.retentionWriting=false})
  }
  private async run(item:RetainedOperation,session:AiDispatchSession):Promise<void> {
    const update=(value:CodexTextUpdate):void=>{
      if(!active(item.view))return
      item.view={...item.view,text:value.text,state:value.state==='running'&&item.view.state==='cancelling'?'cancelling':value.state,
        reason:value.reason,sequence:item.view.sequence+1,finishedAt:value.state==='running'?null:Date.now()}
      if(item.version===2)item.output={commentary:value.commentary,finalText:value.state==='completed'?value.finalText:null}
      this.queueRetention(item)
    }
    try{
      const execution=item.version===2?item.execution:null
      this.authorize(item.input,session,execution)
      await session.execute(item.input,execution,async()=>{
        if(this.closing||item.view.state==='cancelling'||this.journalFailure)throw new AiError('cancelled')
        this.authorize(item.input,session,execution)
      },update)
      if(active(item.view))update({text:item.view.text,commentary:item.version===2?item.output.commentary:'',finalText:null,state:'unknown',reason:'outcome-unknown'})
    }catch(error){update({text:item.view.text,commentary:item.version===2?item.output.commentary:'',finalText:null,state:'failed',reason:aiReason(error)})}
    finally{
      if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null}
      this.flushRetention();await this.retention
      // A snapshot may have arrived while the previous write was settling.
      this.flushRetention();await this.retention
      // Unprotected output remains in memory and blocks close. It is never
      // emitted as protected or settled into a portable project on disk failure.
    }
  }
  async cancel(input:AiOperationInput):Promise<AiOperation> {
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    const item=this.retained.get(input.operationId)
    if(!item||!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    if(active(item.view)&&this.activeOperationId===input.operationId){
      item.view={...item.view,state:'cancelling',sequence:item.view.sequence+1}
      this.queueRetention(item)
      try{await this.dispatch?.interrupt()}catch{this.lastReason='outcome-unknown'}
    }
    const protectedRecord=this.protectedRecords.get(input.operationId)
    if(!protectedRecord)throw new AiError('storage-unavailable')
    return structuredClone(protectedRecord.view)
  }
  async operations(scope:OpenInput):Promise<AiOperation[]> {
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(scope,false)
    return [...this.protectedRecords.values()].filter(item=>sameProject(item.view.scope,scope)).map(item=>structuredClone(item.view))
  }
  async operationRecord(input:AiOperationInput):Promise<import('../../shared/ai').AiOperationRecord>{
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    const item=this.protectedRecords.get(input.operationId)
    if(!item||!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    return structuredClone({input:item.input,operation:item.view})
  }
  /** Main-only recovery reader retains the original version and final channel.
   * It never loads a session or exposes local account identity through IPC. */
  async contentRecord(input:AiOperationInput):Promise<RetainedOperation|null> {
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    const item=this.protectedRecords.get(input.operationId)
    if(!item&&this.retained.has(input.operationId))throw new AiError('storage-unavailable')
    if(item&&!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    return item?structuredClone(item):null
  }
  protectedContentOperation(operationId:string,version:1|2):AiOperation|null {
    const item=this.protectedRecords.get(operationId)
    return item?.version===version?contentOperation(item):null
  }
  needsProtection(operationId:string):boolean {return this.journalFailure&&this.unprotectedOperationId===operationId}
  async hasOperation(input:AiOperationInput):Promise<boolean> {
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    const item=this.retained.get(input.operationId)
    if(item&&!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    return !!item
  }
  async retryProtection(input:AiOperationInput):Promise<AiOperation>{
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    if(this.running||this.busy||this.attempt||this.local.hasPendingWork())throw new AiError('busy')
    const item=this.retained.get(input.operationId)
    if(!item||!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    this.busy=true
    try{
      await this.retention
      if(this.journalFailure&&this.unprotectedOperationId!==input.operationId)throw new AiError('invalid-request')
      if(this.pendingRetention&&this.pendingRetention.view.operationId!==input.operationId)throw new AiError('busy')
      if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null}
      await this.storage.retain(item)
      this.protectedRecords.set(input.operationId,structuredClone(item))
      this.pendingRetention=null;this.journalFailure=false;this.unprotectedOperationId=null;this.lastReason=null
      this.emit({kind:'operation',operation:item.view})
      return structuredClone(item.view)
    }finally{this.busy=false;this.publish()}
  }
  /** The existing native close/update handshake calls this before allowing storage
   * shutdown. It does not discard a pending draft or silently replay an operation. */
  async prepareClose():Promise<boolean> {
    this.closing=true;this.invalidateReviews()
    if(this.attempt){this.attempt.cancel();await this.authWork}
    if(!await this.local.close()){this.closing=false;this.publish();return false}
    if(this.hasPendingWork()){this.closing=false;this.publish();return false}
    await this.retention
    return !this.journalFailure
  }
  resume():void {this.closing=false;this.publish()}
  suspend():void {this.invalidateReviews();this.attempt?.cancel();this.authAbort?.abort();this.local.suspend();void this.dispatch?.interrupt().catch(()=>undefined)}
}
