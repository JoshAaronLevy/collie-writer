import { randomUUID } from 'node:crypto'
import type { AiOperation, AiPrepareInput, AiReason } from '../../shared/ai'
import { bindingVersion, isConversationValue, type ConversationBinding, type ConversationEvent, type ConversationRequest, type ConversationSubmit, type ConversationTurn, type ConversationValue, type ConversationWorkerInput } from '../../shared/conversations'
import { isProofreadValue, isProofreadWorkerInput, type ProofreadRequest, type ProofreadSubmit, type ProofreadBundle, type ProofreadValue, type ProofreadWorkerInput } from '../../shared/proofreading'
import { isConversationWorkerInput } from '../../shared/conversations'
import type { OpenInput } from '../../shared/projects'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../../worker/storage/digest'
import type { StorageWorker } from '../storage-worker'
import type { AiService, ContentAuthorization } from '../ai/service'
import { aiReason } from '../ai/errors'
import { contentOperation, localRequestFits, templateFor } from './local-operation'

type ContentWorkerInput = ConversationWorkerInput | ProofreadWorkerInput
type ContentValue = ConversationValue | ProofreadValue
type ContentSubmit = ConversationSubmit | ProofreadSubmit
type ContentTurn = ConversationTurn | ProofreadBundle
type ContentRequest = Exclude<ConversationRequest,{action:'export'}> | ProofreadRequest
type Bound = { scope: OpenInput; binding: ConversationBinding }
const same = (a:OpenInput,b:OpenInput):boolean => a.projectId===b.projectId&&a.workspaceId===b.workspaceId
/** Shared durable dispatch, binding, output protection and recovery for project-owned AI content. */
export class AiContentService {
  private bound=new Map<string,Bound>()
  private live=new Map<string,Bound>()
  private queued=new Map<string,Extract<ContentWorkerInput,{action:'settle'}>>()
  private failures=new Map<string,ContentWorkerInput>()
  private protecting=new Map<string,Promise<ContentValue>>()
  private reviews=new Map<string,ContentAuthorization & {reviewDigest:string;expiresAt:number}>()
  private seen=new Map<string,number>()
  private timer:ReturnType<typeof setTimeout>|null=null
  private writing:Promise<void>|null=null
  private commands=0
  private listeners=new Set<(event:ConversationEvent)=>void>()
  private otherPending:()=>boolean=()=>false
  setOtherPending(read:()=>boolean):void {this.otherPending=read}
  constructor(private readonly storage:StorageWorker,private readonly ai:AiService,private readonly kind:'conversation'|'proofreading') {
    ai.subscribe(event=>{
      if(event.kind==='connection'){for(const owner of this.bound.values())this.publish(owner.scope,owner.binding.attemptId,this.failures.has(owner.binding.attemptId)?'AI output needs local protection.':null);return}
      const owner=this.bound.get(event.operation.operationId)
      if(owner&&same(owner.scope,event.operation.scope))this.enqueue(owner,event.operation)
    })
  }
  subscribe(listener:(event:ConversationEvent)=>void):()=>void {this.listeners.add(listener);return()=>this.listeners.delete(listener)}
  hasPendingWork():boolean {return this.commands>0||!!this.writing||this.queued.size>0||this.failures.size>0||this.protecting.size>0}
  private publish(scope:OpenInput,attemptId:string|null,issue:string|null=null):void {
    const failed=[...this.failures].find(([,input])=>same(input,scope)),running=[...this.live.values()].find(owner=>same(owner.scope,scope))
    const unprotected=[...this.bound.values()].find(owner=>same(owner.scope,scope)&&this.ai.needsProtection(owner.binding.operationId))
    const event:ConversationEvent={projectId:scope.projectId,workspaceId:scope.workspaceId,attemptId:failed?.[0]??unprotected?.binding.attemptId??running?.binding.attemptId??attemptId,pending:this.hasPendingWork()||this.ai.hasPendingWork(),issue:issue??(failed||unprotected?'AI output needs local protection. Retry local output protection before closing.':null)}
    for(const listener of this.listeners)try{listener(event)}catch{/* Renderer loss does not interrupt local protection. */}
  }
  async worker(input:ContentWorkerInput):Promise<ContentValue> {
    const command=this.kind==='conversation'&&isConversationWorkerInput(input)?{kind:'conversation' as const,input}:this.kind==='proofreading'&&isProofreadWorkerInput(input)?{kind:'proofreading' as const,input}:null
    if(!command)throw new ProjectError('VALIDATION')
    const result=await this.storage.request(randomUUID(),command)
    if(!result.ok)throw new ProjectError(result.error.code)
    if(this.kind==='conversation'&&isConversationValue(result.value))return result.value
    if(this.kind==='proofreading'&&isProofreadValue(result.value))return result.value
    throw new ProjectError('UNAVAILABLE')
  }
  private async protect(input:ContentWorkerInput,attemptId:string):Promise<ContentValue> {
    while(this.protecting.has(attemptId)) {
      try{await this.protecting.get(attemptId)}catch{/* The exact failed request below retains priority. */}
    }
    const pending=this.failures.get(attemptId)
    if(pending&&requestDigest(pending)!==requestDigest(input))throw new ProjectError('UNAVAILABLE')
    const task=this.worker(input).then(value=>{this.failures.delete(attemptId);return value},error=>{
      this.failures.set(attemptId,structuredClone(input));this.publish(input,attemptId,'The AI request has an unconfirmed local write. Keep it open and retry local protection.');throw error
    })
    this.protecting.set(attemptId,task)
    try{return await task}finally{if(this.protecting.get(attemptId)===task)this.protecting.delete(attemptId);this.ai.contentWorkChanged()}
  }
  private enqueue(owner:Bound,notification:AiOperation):void {
    // Resolve from the protected owner, including the final-channel projection.
    // Never turn an unprotected return value or a different binding into output.
    const operation=this.ai.protectedContentOperation(notification.operationId,bindingVersion(owner.binding))
    if(!operation||!same(owner.scope,operation.scope)||operation.operationId!==owner.binding.operationId||
      operation.digest!==owner.binding.digest||operation.connectionId!==owner.binding.connectionId||operation.model!==owner.binding.model||
      operation.action!==(this.kind==='conversation'?'conversation':'proofread'))return
    if((this.seen.get(operation.operationId)??-1)>=operation.sequence)return
    this.seen.set(operation.operationId,operation.sequence)
    if(['starting','running','cancelling'].includes(operation.state))this.live.set(operation.operationId,owner);else this.live.delete(operation.operationId)
    this.queued.set(owner.binding.attemptId,{...owner.scope,action:'settle',attemptId:owner.binding.attemptId,binding:owner.binding,operation,reason:null})
    this.ai.contentWorkChanged()
    this.publish(owner.scope,owner.binding.attemptId)
    if(!this.timer&&!this.writing)this.timer=setTimeout(()=>{this.timer=null;void this.drain()},250)
  }
  private async drain():Promise<void> {
    if(this.writing)return this.writing
    this.writing=(async()=>{
      while(this.queued.size){
        // A newer snapshot cannot replace an uncertain exact worker write.
        const next=[...this.queued].find(([id])=>!this.failures.has(id))
        if(!next)break
        const [id,input]=next
        this.queued.delete(id)
        try{await this.protect(input,id)}catch{/* Exact input remains available for a disk-only retry. */}
        this.publish(input,id,this.failures.has(id)?'AI output needs local protection. Retry local protection.':null)
      }
    })()
    try{await this.writing}finally{this.writing=null;this.ai.contentWorkChanged();if([...this.queued.keys()].some(id=>!this.failures.has(id))&&!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.drain()},250);for(const owner of this.bound.values())this.publish(owner.scope,owner.binding.attemptId,this.failures.has(owner.binding.attemptId)?'AI output needs local protection.':null)}
  }
  private preparedInput(scope:OpenInput,b:ConversationBinding,t:ContentTurn):AiPrepareInput {
    return {scope,operationId:b.operationId,connectionId:b.connectionId,model:b.model,action:this.kind==='conversation'?'conversation':'proofread',prompt:t.capture.prompt,context:t.capture.context}
  }
  private async get(scope:OpenInput,id:string):Promise<ContentTurn> {const value=await this.worker({...scope,action:'get',attemptId:id});if(value.type!=='turn')throw new ProjectError('UNAVAILABLE');return value.turn}
  private async loadBindings(scope:OpenInput):Promise<ConversationBinding[]> {
    const result=await this.worker({...scope,action:'bindings'});if(result.type!=='bindings')throw new ProjectError('UNAVAILABLE')
    for(const binding of result.bindings){
      const previous=this.bound.get(binding.operationId)
      if(previous&&(!same(previous.scope,scope)||requestDigest(previous.binding)!==requestDigest(binding)))throw new ProjectError('DENIED')
      this.bound.set(binding.operationId,{scope,binding})
    }
    return result.bindings
  }
  private async reconcile(scope:OpenInput):Promise<void> {
    if(this.writing)await this.writing
    for(const [id,input] of [...this.failures])if(same(scope,input))await this.protect(input,id)
    const bindings=await this.loadBindings(scope)
    if(!bindings.length)return
    for(const binding of bindings) {
      const record=await this.ai.contentRecord({scope,operationId:binding.operationId})
      if(record) {
        const t=await this.get(scope,binding.attemptId)
        const input=this.preparedInput(scope,binding,t)
        if(record.version!==bindingVersion(binding)||t.capture.digest!==binding.captureDigest||requestDigest(input)!==requestDigest(record.input)||record.view.digest!==binding.digest||
          record.version===2&&(record.execution.captureDigest!==t.capture.digest||record.execution.template!==t.capture.template))throw new ProjectError('DENIED')
        const operation=contentOperation(record)
        await this.protect({...scope,action:'settle',attemptId:binding.attemptId,binding,operation,reason:null},binding.attemptId)
        if(['starting','running','cancelling'].includes(operation.state))this.live.set(binding.operationId,{scope,binding});else this.live.delete(binding.operationId)
      } else await this.protect({...scope,action:'settle',attemptId:binding.attemptId,binding,operation:null,reason:'outcome-unknown'},binding.attemptId)
    }
    await this.drain()
  }
  private async submit(input:ContentSubmit):Promise<ContentValue> {
    const scope={projectId:input.projectId,workspaceId:input.workspaceId}
    // Checking an existing receipt needs no new edit or inference authority.
    try {
      const existing=await this.get(scope,input.attemptId)
      if(existing.attempt.requestDigest!==requestDigest(input))throw new ProjectError('OPERATION_CONFLICT')
      return await this.worker({...scope,action:'get',attemptId:input.attemptId})
    } catch(error) {if(!(error instanceof ProjectError)||error.code!=='NOT_FOUND')throw error}
    const action=this.kind==='conversation'?'conversation':'proofread',review=this.reviews.get(input.review.captureId)
    if(input.send&&(!review||review.expiresAt<Date.now()||review.reviewDigest!==requestDigest(input.review)||review.captureDigest!==input.digest||
      review.template!==templateFor(action)||review.reviewStamp!==await this.ai.reviewStamp(action)))throw new ProjectError('STALE_REVISION')
    const stored=await this.worker({...scope,action:'append',submission:input} as ContentWorkerInput)
    if(stored.type!=='turn')throw new ProjectError('UNAVAILABLE')
    // A replay can observe a past dispatch, but can never create one. Crash recovery is read-only.
    if(!stored.fresh)return stored
    this.reviews.delete(input.review.captureId)
    if(!input.send) {
      let reason:AiReason|null=null
      try{reason=(await this.ai.readStatus()).reasons[0]??null}catch(error){reason=aiReason(error)}
      return this.protect({...scope,action:'settle',attemptId:input.attemptId,binding:null,operation:null,reason},input.attemptId)
    }
    let binding:ConversationBinding|null=null
    try {
      const operationId=randomUUID(),preparedInput:AiPrepareInput={scope,operationId,connectionId:input.connectionId!,model:input.model!,action:this.kind==='conversation'?'conversation':'proofread',prompt:stored.turn.capture.prompt,context:stored.turn.capture.context}
      if(!review||review.template!==stored.turn.capture.template||review.captureDigest!==stored.turn.capture.digest)throw new ProjectError('STALE_REVISION')
      const prepared=await this.ai.prepare(preparedInput,review)
      const fields={attemptId:input.attemptId,operationId,connectionId:input.connectionId!,model:input.model!,digest:prepared.digest,captureDigest:stored.turn.capture.digest}
      binding=this.ai.preparedVersion(prepared.authorizationId)===2?{version:2,...fields}:fields
      await this.protect({...scope,action:'bind',binding},input.attemptId)
      this.bound.set(operationId,{scope,binding})
      const operation=await this.ai.start({scope,operationId,authorizationId:prepared.authorizationId,digest:prepared.digest})
      this.enqueue({scope,binding},operation)
    } catch(error) {
      // No output is invented for refusals. Once dispatch authority exists, an interrupted outcome is uncertain.
      if(binding&&this.failures.has(input.attemptId))throw error
      await this.protect({...scope,action:'settle',attemptId:input.attemptId,binding,operation:null,reason:aiReason(error)},input.attemptId)
    }
    const result=await this.worker({...scope,action:'get',attemptId:input.attemptId});return result
  }
  async command(input:ContentRequest):Promise<ContentValue> {
    const changes=['submit','change','decide','reconcile','cancel','protect'].includes(input.action)
    if(input.action==='submit'&&(this.hasPendingWork()||this.ai.hasPendingWork()||this.otherPending())) {
      // Lost replies can inspect the exact existing intent even while its output needs protection.
      let previous:ContentTurn
      try{previous=await this.get({projectId:input.projectId,workspaceId:input.workspaceId},input.attemptId)}catch{throw new ProjectError('ACCESS_BUSY')}
      if(previous.attempt.requestDigest!==requestDigest(input))throw new ProjectError('OPERATION_CONFLICT')
      return this.worker({projectId:input.projectId,workspaceId:input.workspaceId,action:'get',attemptId:input.attemptId})
    }
    if(changes){this.commands++;this.ai.contentWorkChanged()}
    try {
      if(input.action==='decide'){
        if(this.kind!=='proofreading')throw new ProjectError('VALIDATION')
        // Reading an already committed human decision is not a new editing grant.
        const receipt=await this.worker({projectId:input.projectId,workspaceId:input.workspaceId,action:'receipt',decision:input})
        if(receipt.type==='decision')return receipt
        return await this.worker(input)
      }
      if(input.action==='attempt')return await this.worker({projectId:input.projectId,workspaceId:input.workspaceId,action:'get',attemptId:input.attemptId})
      if(input.action==='review') {
        // Capture the route before the worker await: account/model changes while
        // reviewing must not silently authorize the newly selected session.
        const action=this.kind==='conversation'?'conversation':'proofread',reviewStamp=await this.ai.reviewStamp(action)
        const result=await this.worker(input)
        if(result.type!=='review'||result.capture.template!==templateFor(action))throw new ProjectError('UNAVAILABLE')
        if(this.kind==='conversation'&&!localRequestFits(result.capture))throw new ProjectError('LIMIT_EXCEEDED')
        if(this.reviews.size>=64)this.reviews.delete(this.reviews.keys().next().value!)
        this.reviews.set(input.captureId,{reviewStamp,template:result.capture.template,captureDigest:result.capture.digest,
          reviewDigest:requestDigest(input),expiresAt:Date.now()+5*60000})
        return result
      }
      if(input.action==='submit')return await this.submit(input)
      if(input.action==='reconcile'){await this.reconcile({projectId:input.projectId,workspaceId:input.workspaceId});return {type:'done'}}
      if(input.action==='cancel'||input.action==='protect') {
        if(input.action==='protect'&&this.writing)await this.writing
        const scope={projectId:input.projectId,workspaceId:input.workspaceId},pending=this.failures.get(input.attemptId)
        if(pending&&input.action==='protect'){if(!same(scope,pending))throw new ProjectError('DENIED');await this.protect(pending,input.attemptId)}
        const binding=(await this.loadBindings(scope)).find(b=>b.attemptId===input.attemptId)
        if(!binding){if(pending)return {type:'done'};throw new ProjectError('NOT_FOUND')}
        if(input.action==='cancel')this.enqueue({scope,binding},await this.ai.cancel({scope,operationId:binding.operationId}))
        else {
          if(await this.ai.hasOperation({scope,operationId:binding.operationId}))await this.ai.retryProtection({scope,operationId:binding.operationId})
          await this.reconcile(scope)
        }
        return {type:'done'}
      }
      if(!isConversationWorkerInput(input)&&!isProofreadWorkerInput(input))throw new ProjectError('VALIDATION')
      return await this.worker(input)
    } finally {if(changes){this.commands--;this.ai.contentWorkChanged();this.publish(input,'attemptId'in input?input.attemptId:null,this.failures.size?'AI output needs local protection.':null)}}
  }
}
