import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { AI_LIMITS, AI_PROVIDER, type AiConnectInput, type AiEvent, type AiModel, type AiOperation, type AiOperationInput,
  type AiPrepareInput, type AiPrepared, type AiReason, type AiStartInput, type AiStatus } from '../../shared/ai'
import { sameProject } from '../../shared/access'
import type { AiSession } from '../../shared/ai-route'
import type { OpenInput } from '../../shared/projects'
import type { AccessService } from '../entitlements/service'
import { RELEASE } from '../release'
import { CodexRuntime, codexExecutable } from './codex-runtime'
import { PROVIDER_RUNTIMES } from './registry'
import type { RuntimeUpdate } from './runtime'
import { OPENAI_REGISTRATIONS, registration, requireIncludedFunding, requireTextOnlyRuntime,
  requireRegisteredRoute, routeFunding, selectAiRoute } from './deployment'
import { operationDigestV1 } from './operation-identity'
import { LocalCodexSession } from './local-codex-session'
import { AiError, aiReason } from './errors'
import { OpenAiSignIn, refreshOpenAi } from './openai-auth'
import { revokeOpenAi } from './openai-http'
import { AiStorage, secureAiStorage, type Account, type Credentials, type RetainedOperation } from './storage'

type Prepared = { receipt:AiPrepared; input:AiPrepareInput }
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
  private retained=new Map<string,RetainedOperation>()
  private runtime:CodexRuntime|null=null
  private running:Promise<void>|null=null
  private activeOperationId:string|null=null
  private pendingRetention:RetainedOperation|null=null
  private retention=Promise.resolve()
  private retentionWriting=false
  private attempted=new Map<string,string|null>()
  private cancelledAttempts=new Set<string>()
  private publishTimer:ReturnType<typeof setTimeout>|null=null
  private listeners=new Set<(event:AiEvent)=>void>()
  readonly storage:AiStorage
  private readonly local:LocalCodexSession
  constructor(workingRoot:()=>string|undefined,private readonly access:AccessService){
    this.storage=new AiStorage(workingRoot)
    this.local=new LocalCodexSession(this.storage,()=>{this.prepared.clear();this.publish()})
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
        this.credentials=await this.storage.credentials()
        if(selectAiRoute().kind==='local-codex-chatgpt')await this.local.initialize()
        const operations=await this.storage.operations()
        for(const item of operations){
          if(operationDigestV1(item.input)!==item.view.digest || !sameProject(item.input.scope,item.view.scope) || item.input.connectionId!==item.view.connectionId ||
            item.input.model!==item.view.model || item.input.action!==item.view.action)throw new AiError('storage-unavailable')
          if(active(item.view)){item.view={...item.view,state:'unknown',reason:'outcome-unknown',finishedAt:Date.now(),sequence:item.view.sequence+1};await this.storage.retain(item)}
          this.retained.set(item.view.operationId,item)
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
      const reasons:AiReason[]=['isolation-unresolved']
      if(!secureAiStorage())reasons.push('secure-storage-unavailable')
      if(this.storageFailure||this.journalFailure)reasons.push('storage-unavailable')
      if(this.runtimeState!=='development-installed')reasons.push('runtime-unavailable')
      const snapshot=this.local.snapshot(available&&!this.closing&&!this.busy&&!this.running,
        secureAiStorage()&&!this.storageFailure&&!this.journalFailure&&!this.closing&&!this.busy&&!this.running)
      return {sequence:++this.statusSequence,provider:AI_PROVIDER,channel:RELEASE.channel,implementation:'partial',route,
        funding:routeFunding(route),features:{conversation:{state:'unavailable',reason:'conversation-adapter-not-ready'},
          proofread:{state:'unavailable',reason:'proofreading-adapter-not-ready'}},
        configured:true,channelPermitted:true,commercialApproved:false,runtime:this.runtimeState,reasons,...snapshot}
    }
    if(route.kind!=='registered-openai') {
      const reasons:AiReason[]=['development-access-unavailable']
      if(!secureAiStorage())reasons.push('secure-storage-unavailable')
      if(this.storageFailure||this.journalFailure)reasons.push('storage-unavailable')
      if(this.runtimeState!=='development-installed')reasons.push('runtime-unavailable')
      if(this.lastReason&&!reasons.includes(this.lastReason))reasons.push(this.lastReason)
      return {sequence:++this.statusSequence,provider:AI_PROVIDER,channel:RELEASE.channel,implementation:'partial',
        route,session:{state:'unavailable',reason:route.reason},funding:routeFunding(route),
        features:{conversation:{state:'unavailable',reason:route.reason},proofread:{state:'unavailable',reason:route.reason}},
        configured:false,channelPermitted:false,commercialApproved:false,runtime:this.runtimeState,state:'unavailable',
        reasons,attemptId:null,activeConnectionId:null,connections:[],remoteRevocation:'none',
        local:null,actions:{connect:false,refresh:false,disconnect:false,select:false,resume:false,cleanup:false,protectConnection:false}}
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
    return {sequence:++this.statusSequence,provider:AI_PROVIDER,channel:RELEASE.channel,implementation:'partial',configured:!!config,
      route,session,funding:routeFunding(route),features:{conversation:{state:'unavailable',reason:'commercial-requirements-pending'},
        proofread:{state:'unavailable',reason:'commercial-requirements-pending'}},
      channelPermitted:permitted,commercialApproved:!!config?.commercialReference,runtime:this.runtimeState,
      state:this.connectionState??(!config?'unavailable':selected?.tokens?'signed-in':'signed-out'),reasons,attemptId:this.attempt?.attemptId??null,
      activeConnectionId:this.credentials?.activeId??null,connections:this.credentials?.accounts.map(a=>({id:a.id,label:a.label,
        state:!a.tokens?'signed-out':a.refreshPending||a.tokens.expiresAt<=Date.now()?'expired':'signed-in',planConsent:!!a.tokens?.scopes.includes('chatgpt.tokens.use.direct')}))??[],remoteRevocation:this.revocation,
      local:null,actions:{connect:settled&&permitted,refresh:settled&&permitted,disconnect:settled,select:settled&&permitted,resume:false,cleanup:false,protectConnection:false}}
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
      this.credentials=next;this.prepared.clear();this.revocation='none'
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
    this.busy=true;this.connectionState='refreshing';this.connectionActionId=id;this.authAbort=new AbortController();this.prepared.clear();this.publish()
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
    if(selectAiRoute().kind==='local-codex-chatgpt'){this.prepared.clear();await this.local.disconnect(id);return this.status()}
    requireRegisteredRoute()
    const account=this.account(id)
    this.busy=true;this.connectionState='disconnecting';this.connectionActionId=id;this.prepared.clear();this.authAbort=new AbortController();this.publish()
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
    this.prepared.clear();await this.local.resumeAccount(id);return this.status()
  }
  async cleanupConnection():Promise<AiStatus> {
    await this.ensure();this.requireIdle()
    if(selectAiRoute().kind!=='local-codex-chatgpt')throw new AiError('development-access-unavailable')
    this.prepared.clear();await this.local.cleanup();return this.status()
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
      this.credentials!.activeId=id;this.prepared.clear()
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
    await this.ensure();this.requireIdle();const account=this.requireSession(id)
    // Catalog access sends no prompt. Isolation must still be established before launching a child.
    requireTextOnlyRuntime()
    const runtime=PROVIDER_RUNTIMES[AI_PROVIDER].create(this.storage);this.busy=true
    try{await runtime.open(account.tokens!.access);return await runtime.models()}
    finally{await runtime.close();this.busy=false}
  }
  private authorize(input:AiPrepareInput):void {
    try{this.access.authorizeAi(input.scope,true)}catch{throw new AiError('read-only-project')}
    // The route declaration supplies no execution authority. CD03/CD04 own the
    // local session, isolation and route-bound grants; v1 is registered-only.
    requireRegisteredRoute()
    this.requireSession(input.connectionId)
    // Applies to every request and internal continuation. No balance-preflight fallback.
    requireIncludedFunding()
    requireTextOnlyRuntime()
  }
  async prepare(input:AiPrepareInput):Promise<AiPrepared> {
    await this.ensure();this.requireIdle()
    try{this.access.authorizeAi(input.scope,true)}catch{throw new AiError('read-only-project')}
    requireRegisteredRoute()
    const selected=this.account(input.connectionId)
    if(selected.tokens&&selected.tokens.expiresAt<=Date.now()+120000)await this.refresh(input.connectionId)
    this.authorize(input)
    for(const [key,value]of this.prepared)if(value.receipt.expiresAt<Date.now())this.prepared.delete(key)
    if(this.retained.has(input.operationId))throw new AiError('context-changed')
    if(this.prepared.size>=8||this.retained.size>=AI_LIMITS.jobs)throw new AiError('busy')
    const receipt:AiPrepared={authorizationId:randomUUID(),operationId:input.operationId,digest:operationDigestV1(input),expiresAt:Date.now()+5*60000}
    this.prepared.set(receipt.authorizationId,{receipt,input:structuredClone(input)})
    return {...receipt}
  }
  async start(input:AiStartInput):Promise<AiOperation> {
    await this.ensure()
    const prior=this.retained.get(input.operationId)
    if(prior){
      if(!sameProject(prior.view.scope,input.scope)||prior.view.digest!==input.digest)throw new AiError('context-changed')
      this.access.authorizeAi(input.scope,false)
      return structuredClone(prior.view) // Exact replay observes the same attempt, never resends inference.
    }
    this.requireIdle()
    const prepared=this.prepared.get(input.authorizationId)
    if(!prepared||prepared.receipt.operationId!==input.operationId||prepared.receipt.digest!==input.digest||prepared.receipt.expiresAt<Date.now()||!sameProject(prepared.input.scope,input.scope))throw new AiError('context-changed')
    this.authorize(prepared.input)
    const account=this.requireSession(prepared.input.connectionId)
    const item:RetainedOperation={version:1,input:prepared.input,view:{operationId:input.operationId,scope:{...input.scope},connectionId:account.id,model:prepared.input.model,
      action:prepared.input.action,digest:input.digest,state:'starting',text:'',sequence:0,reason:null,startedAt:Date.now(),finishedAt:null}}
    this.busy=true
    try{await this.storage.retain(item);this.retained.set(input.operationId,item)}catch{this.storageFailure=true;throw new AiError('storage-unavailable')}finally{this.busy=false}
    this.prepared.delete(input.authorizationId)
    this.activeOperationId=input.operationId
    const runtime=PROVIDER_RUNTIMES[AI_PROVIDER].create(this.storage);this.runtime=runtime
    this.emit({kind:'operation',operation:item.view})
    this.running=this.run(item,runtime,account).finally(()=>{this.running=null;this.runtime=null;this.activeOperationId=null;this.publish()})
    return structuredClone(item.view)
  }
  private queueRetention(item:RetainedOperation):void {
    // Coalesce partial snapshots rather than retaining one promise/copy for each token.
    this.pendingRetention=structuredClone(item)
    if(this.publishTimer)return
    this.publishTimer=setTimeout(()=>{this.publishTimer=null;this.flushRetention()},200)
  }
  private flushRetention():void {
    if(this.retentionWriting||!this.pendingRetention)return
    this.retentionWriting=true
    let writingOperationId:string|null=null
    this.retention=(async()=>{
      while(this.pendingRetention){
        const item=this.pendingRetention;this.pendingRetention=null
        writingOperationId=item.view.operationId
        await this.storage.retain(item)
        this.emit({kind:'operation',operation:item.view})
      }
    })().catch(()=>{
      this.journalFailure=true;this.unprotectedOperationId=writingOperationId;this.lastReason='storage-unavailable'
      void this.runtime?.interrupt().catch(()=>undefined);this.publish()
    })
      .finally(()=>{this.retentionWriting=false})
  }
  private async run(item:RetainedOperation,runtime:CodexRuntime,account:Account):Promise<void> {
    const update=(value:RuntimeUpdate):void=>{
      item.view={...item.view,text:value.text,state:value.state==='running'&&item.view.state==='cancelling'?'cancelling':value.state,
        reason:value.reason,sequence:item.view.sequence+1,finishedAt:value.state==='running'?null:Date.now()}
      this.queueRetention(item)
    }
    try{
      this.authorize(item.input)
      if(this.closing)throw new AiError('cancelled')
      await runtime.open(account.tokens!.access)
      const catalog=await runtime.models()
      if(!catalog.some(model=>model.id===item.input.model))throw new AiError('model-unavailable')
      const payload=JSON.stringify({request:item.input.prompt,context:item.input.context})
      await runtime.execute(item.input.model,payload,async()=>{
        if(this.closing||item.view.state==='cancelling')throw new AiError('cancelled')
        this.authorize(item.input)
      },update)
    }catch(error){update({text:item.view.text,state:'failed',reason:aiReason(error)})}
    finally{
      await runtime.close()
      if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null}
      this.flushRetention();await this.retention
      // Preserve in-memory output after disk failure; close stays blocked.
      if(this.journalFailure)this.emit({kind:'operation',operation:item.view})
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
      try{await this.runtime?.interrupt()}catch{this.lastReason='outcome-unknown'}
    }
    return structuredClone(item.view)
  }
  async operations(scope:OpenInput):Promise<AiOperation[]> {
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(scope,false)
    return [...this.retained.values()].filter(item=>sameProject(item.view.scope,scope)).map(item=>structuredClone(item.view))
  }
  async operationRecord(input:AiOperationInput):Promise<import('../../shared/ai').AiOperationRecord>{
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    const item=this.retained.get(input.operationId)
    if(!item||!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    return structuredClone({input:item.input,operation:item.view})
  }
  async retryProtection(input:AiOperationInput):Promise<AiOperation>{
    if(this.initialization)await this.initialization;else await this.ensure()
    this.access.authorizeAi(input.scope,false)
    if(this.running||this.busy||this.attempt)throw new AiError('busy')
    const item=this.retained.get(input.operationId)
    if(!item||!sameProject(item.view.scope,input.scope))throw new AiError('invalid-request')
    this.busy=true
    try{
      await this.retention
      if(this.journalFailure&&this.unprotectedOperationId!==input.operationId)throw new AiError('invalid-request')
      if(this.pendingRetention&&this.pendingRetention.view.operationId!==input.operationId)throw new AiError('busy')
      if(this.publishTimer){clearTimeout(this.publishTimer);this.publishTimer=null}
      await this.storage.retain(item)
      this.pendingRetention=null;this.journalFailure=false;this.unprotectedOperationId=null;this.lastReason=null
      this.emit({kind:'operation',operation:item.view})
      return structuredClone(item.view)
    }finally{this.busy=false;this.publish()}
  }
  /** The existing native close/update handshake calls this before allowing storage
   * shutdown. It does not discard a pending draft or silently replay an operation. */
  async prepareClose():Promise<boolean> {
    this.closing=true;this.prepared.clear()
    if(this.attempt){this.attempt.cancel();await this.authWork}
    if(!await this.local.close()){this.closing=false;this.publish();return false}
    if(this.hasPendingWork()){this.closing=false;this.publish();return false}
    await this.retention
    return !this.journalFailure
  }
  resume():void {this.closing=false;this.publish()}
  suspend():void {this.prepared.clear();this.attempt?.cancel();this.authAbort?.abort();this.local.suspend();void this.runtime?.interrupt().catch(()=>undefined)}
}
