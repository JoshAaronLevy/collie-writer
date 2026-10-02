import { randomUUID } from 'node:crypto'
import type { AiOperation, AiPrepareInput, AiReason } from '../../shared/ai'
import { isConversationValue, type ConversationBinding, type ConversationEvent, type ConversationRequest, type ConversationSubmit, type ConversationTurn, type ConversationValue, type ConversationWorkerInput } from '../../shared/conversations'
import { isProofreadValue, isProofreadWorkerInput, type ProofreadRequest, type ProofreadSubmit, type ProofreadBundle, type ProofreadValue, type ProofreadWorkerInput } from '../../shared/proofreading'
import { isConversationWorkerInput } from '../../shared/conversations'
import type { OpenInput } from '../../shared/projects'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../../worker/storage/digest'
import type { StorageWorker } from '../storage-worker'
import type { AiService } from '../ai/service'
import { aiReason } from '../ai/errors'

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
  hasPendingWork():boolean {return this.commands>0||!!this.writing||this.queued.size>0||this.failures.size>0}
  private publish(scope:OpenInput,attemptId:string|null,issue:string|null=null):void {
    const failed=[...this.failures].find(([,input])=>same(input,scope)),running=[...this.live.values()].find(owner=>same(owner.scope,scope))
    const event:ConversationEvent={projectId:scope.projectId,workspaceId:scope.workspaceId,attemptId:failed?.[0]??running?.binding.attemptId??attemptId,pending:this.hasPendingWork()||this.ai.hasPendingWork(),issue:issue??(failed?'AI output needs local protection.':null)}
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
    try{const value=await this.worker(input);this.failures.delete(attemptId);return value}
    catch(error){this.failures.set(attemptId,structuredClone(input));this.publish(input,attemptId,'The AI request has an unconfirmed local write. Keep it open and retry local protection.');throw error}
  }
  private enqueue(owner:Bound,operation:AiOperation):void {
    if(['starting','running','cancelling'].includes(operation.state))this.live.set(operation.operationId,owner);else this.live.delete(operation.operationId)
    const prior=this.queued.get(owner.binding.attemptId)
    if(prior?.operation&&prior.operation.sequence>operation.sequence)return
    this.queued.set(owner.binding.attemptId,{...owner.scope,action:'settle',attemptId:owner.binding.attemptId,binding:owner.binding,operation,reason:null})
    this.publish(owner.scope,owner.binding.attemptId)
    if(!this.timer&&!this.writing)this.timer=setTimeout(()=>{this.timer=null;void this.drain()},250)
  }
  private async drain():Promise<void> {
    if(this.writing)return this.writing
    this.writing=(async()=>{
      while(this.queued.size){
        const [id,input]=this.queued.entries().next().value!
        this.queued.delete(id)
        try{await this.protect(input,id)}catch{/* Exact input remains available for a disk-only retry. */}
        this.publish(input,id,this.failures.has(id)?'AI output needs local protection. Retry local protection.':null)
      }
    })()
    try{await this.writing}finally{this.writing=null;if(this.queued.size&&!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.drain()},250);for(const owner of this.bound.values())this.publish(owner.scope,owner.binding.attemptId,this.failures.has(owner.binding.attemptId)?'AI output needs local protection.':null)}
  }
  private preparedInput(scope:OpenInput,b:ConversationBinding,t:ContentTurn):AiPrepareInput {
    return {scope,operationId:b.operationId,connectionId:b.connectionId,model:b.model,action:this.kind==='conversation'?'conversation':'proofread',prompt:t.capture.prompt,context:t.capture.context}
  }
  private async get(scope:OpenInput,id:string):Promise<ContentTurn> {const value=await this.worker({...scope,action:'get',attemptId:id});if(value.type!=='turn')throw new ProjectError('UNAVAILABLE');return value.turn}
  private async loadBindings(scope:OpenInput):Promise<ConversationBinding[]> {
    const result=await this.worker({...scope,action:'bindings'});if(result.type!=='bindings')throw new ProjectError('UNAVAILABLE')
    for(const binding of result.bindings)this.bound.set(binding.operationId,{scope,binding})
    return result.bindings
  }
  private async reconcile(scope:OpenInput):Promise<void> {
    for(const [id,input] of [...this.failures])if(same(scope,input))await this.protect(input,id)
    const bindings=await this.loadBindings(scope)
    if(!bindings.length)return
    const operations=await this.ai.operations(scope)
    for(const binding of bindings) {
      const operation=operations.find(op=>op.operationId===binding.operationId)
      if(operation) {
        const record=await this.ai.operationRecord({scope,operationId:binding.operationId}),t=await this.get(scope,binding.attemptId)
        const input=this.preparedInput(scope,binding,t)
        if(t.capture.digest!==binding.captureDigest||requestDigest(input)!==requestDigest(record.input)||record.operation.digest!==binding.digest)throw new ProjectError('DENIED')
        await this.protect({...scope,action:'settle',attemptId:binding.attemptId,binding,operation:record.operation,reason:null},binding.attemptId)
      } else await this.protect({...scope,action:'settle',attemptId:binding.attemptId,binding,operation:null,reason:'outcome-unknown'},binding.attemptId)
    }
  }
  private async submit(input:ContentSubmit):Promise<ContentValue> {
    const scope={projectId:input.projectId,workspaceId:input.workspaceId}
    // Checking an existing receipt needs no new edit or inference authority.
    try {
      const existing=await this.get(scope,input.attemptId)
      if(existing.attempt.requestDigest!==requestDigest(input))throw new ProjectError('OPERATION_CONFLICT')
      return await this.worker({...scope,action:'get',attemptId:input.attemptId})
    } catch(error) {if(!(error instanceof ProjectError)||error.code!=='NOT_FOUND')throw error}
    const stored=await this.worker({...scope,action:'append',submission:input} as ContentWorkerInput)
    if(stored.type!=='turn')throw new ProjectError('UNAVAILABLE')
    // A replay can observe a past dispatch, but can never create one. Crash recovery is read-only.
    if(!stored.fresh)return stored
    if(!input.send) {
      let reason:AiReason|null=null
      try{reason=(await this.ai.readStatus()).reasons[0]??null}catch(error){reason=aiReason(error)}
      return this.protect({...scope,action:'settle',attemptId:input.attemptId,binding:null,operation:null,reason},input.attemptId)
    }
    let binding:ConversationBinding|null=null
    try {
      const operationId=randomUUID(),preparedInput:AiPrepareInput={scope,operationId,connectionId:input.connectionId!,model:input.model!,action:this.kind==='conversation'?'conversation':'proofread',prompt:stored.turn.capture.prompt,context:stored.turn.capture.context}
      const prepared=await this.ai.prepare(preparedInput)
      binding={attemptId:input.attemptId,operationId,connectionId:input.connectionId!,model:input.model!,digest:prepared.digest,captureDigest:stored.turn.capture.digest}
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
    if(changes)this.commands++
    try {
      if(input.action==='decide'){
        if(this.kind!=='proofreading')throw new ProjectError('VALIDATION')
        // Reading an already committed human decision is not a new editing grant.
        const receipt=await this.worker({projectId:input.projectId,workspaceId:input.workspaceId,action:'receipt',decision:input})
        if(receipt.type==='decision')return receipt
        return await this.worker(input)
      }
      if(input.action==='attempt')return await this.worker({projectId:input.projectId,workspaceId:input.workspaceId,action:'get',attemptId:input.attemptId})
      if(input.action==='submit')return await this.submit(input)
      if(input.action==='reconcile'){await this.reconcile({projectId:input.projectId,workspaceId:input.workspaceId});return {type:'done'}}
      if(input.action==='cancel'||input.action==='protect') {
        const scope={projectId:input.projectId,workspaceId:input.workspaceId},pending=this.failures.get(input.attemptId)
        if(pending&&input.action==='protect'){if(!same(scope,pending))throw new ProjectError('DENIED');await this.protect(pending,input.attemptId)}
        const binding=(await this.loadBindings(scope)).find(b=>b.attemptId===input.attemptId)
        if(!binding){if(pending)return {type:'done'};throw new ProjectError('NOT_FOUND')}
        if(input.action==='cancel')this.enqueue({scope,binding},await this.ai.cancel({scope,operationId:binding.operationId}))
        else {
          const retained=await this.ai.operations(scope)
          if(retained.some(op=>op.operationId===binding.operationId))await this.ai.retryProtection({scope,operationId:binding.operationId})
          await this.reconcile(scope)
        }
        return {type:'done'}
      }
      if(!isConversationWorkerInput(input)&&!isProofreadWorkerInput(input))throw new ProjectError('VALIDATION')
      return await this.worker(input)
    } finally {if(changes){this.commands--;this.publish(input,'attemptId'in input?input.attemptId:null,this.failures.size?'AI output needs local protection.':null)}}
  }
}
