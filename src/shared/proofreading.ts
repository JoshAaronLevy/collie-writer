import type { Mark } from '../domain/editor/schema'
import { isAiHandoffReceipt, type AiHandoffReceipt } from './ai-handoff'
import { isId, safeLink } from '../domain/editor/schema'
import { AI_LIMITS, isAiOperation, isAiReason, type AiOperation, type AiReason } from './ai'
import type { AiAttemptFields, AiTextCaptureFields, CaptureSource } from './ai-content'
import { isCaptureDigest, isCaptureSource, isProofreadingBinding, isConversationEvent, type ConversationBinding, type ConversationEvent } from './conversations'
import { exact, record, isOpenInput, type OpenInput, type ProjectResult } from './projects'
import { MECHANICS_RESULT_V1 as mechanics } from './mechanics-contract'

export const PROOFREADING_CHANNEL = 'proofreading.command'
export const PROOFREADING_CHANGED = 'proofreading.changed'
export const PROOFREADING_LIMITS = { targets:mechanics.limits.targets, findings:mechanics.limits.findings, runs:10000, list:20, replacement:mechanics.limits.span } as const
export type ProofreadSource = Exclude<CaptureSource,{kind:'none'}>
export type ProofreadTarget = { id:string; blockId:string; from:number; to:number; text:string; marks:Mark[] }
export type CoverageKind = 'table'|'image'|'quotation'|'citation'|'footnote'|'footnote-body'|'break'|'unsupported-boundary'
export type ProofreadCoverage = { includedCharacters:number; excluded:{kind:CoverageKind;count:number}[] }
export type ProofreadCapture = AiTextCaptureFields & { source:ProofreadSource; mode:'mechanics'; template:'mechanics-v1'; language:'en-US'; targets:ProofreadTarget[]; coverage:ProofreadCoverage }
export type FindingSuggestion = { targetId:string; from:number; to:number; before:string; replacement:string; reason:string; kind:typeof mechanics.kinds[number] }
export type ProofreadFinding = FindingSuggestion & { version:1; id:string; runId:string; revisionId:string; decision:'pending'|'accepted'|'ignored'; decidedAt:string|null; checkpointId:string|null }
export type ProofreadRun = AiAttemptFields & { captureId:string; output:string; validation:'pending'|'valid'|'invalid'|'not-completed' }
export type ProofreadBundle = { attempt:ProofreadRun; capture:ProofreadCapture; findings:ProofreadFinding[]; validity:'current'|'stale'|'missing' }
export type ProofreadReview = OpenInput & { action:'review'; expectedHead:string; captureId:string; createdAt:string; source:ProofreadSource }
export type ProofreadSubmit = OpenInput & { action:'submit'; attemptId:string; review:ProofreadReview; digest:string; send:boolean; connectionId:string|null; model:string|null }
export type ProofreadDecision = OpenInput & { action:'decide'; operationId:string; attemptId:string; findingId:string; expectedRevision:string; expectedHead:string; decision:'apply'|'ignore'|'undo-ignore' }
export type ProofreadRequest = ProofreadReview | ProofreadSubmit | ProofreadDecision
  | (OpenInput & { action:'list'; offset:number })
  | (OpenInput & { action:'attempt'|'cancel'|'protect'|'acknowledge'; attemptId:string })
  | (OpenInput & { action:'reconcile' })
export type ProofreadWorkerInput = ProofreadReview | ProofreadDecision | Extract<ProofreadRequest,{action:'list'}> | (OpenInput & (
  { action:'append'; submission:ProofreadSubmit } | { action:'receipt'; decision:ProofreadDecision } | { action:'get'; attemptId:string } | {action:'bindings'} |
  { action:'bind'; binding:ConversationBinding } |
  { action:'binding'; attemptId:string } |
  { action:'handoff'; binding:ConversationBinding; operation:AiOperation; acknowledged:boolean } |
  { action:'retire'; receipt:AiHandoffReceipt } |
  { action:'settle'; attemptId:string; binding:ConversationBinding|null; operation:AiOperation|null; reason:AiReason|null }
))
export type ProofreadSummary = { id:string; createdAt:string; state:ProofreadRun['state']; label:string; findings:number; validation:ProofreadRun['validation'] }
export type ProofreadValue =
  | { type:'list'; items:ProofreadSummary[]; total:number }
  | { type:'review'; capture:ProofreadCapture }
  | { type:'turn'; turn:ProofreadBundle; fresh:boolean; head:string; updatedAt:string }
  | { type:'decision'; turn:ProofreadBundle; documentId:string; revisionId:string; head:string; updatedAt:string }
  | { type:'bindings'; bindings:ConversationBinding[] } | { type:'done' }
  | { type:'binding'; binding:ConversationBinding|null; receipt:AiHandoffReceipt|null; retired:boolean }
  | { type:'handoff'; receipt:AiHandoffReceipt }
export type ProofreadingAPI = { proofreading(input:ProofreadRequest):Promise<ProjectResult<ProofreadValue>>; onProofreadingChanged(listener:(event:ConversationEvent)=>void):()=>void }
export { isConversationEvent as isProofreadingEvent }

const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!v.includes('\0')
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))
const integer=(v:unknown,max=1_000_000_000):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max
const model=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(v)
const states=['not-sent','preparing','running','stopping','completed','cancelled','failed','unknown']
const validations=['pending','valid','invalid','not-completed']
const targetPattern=new RegExp(mechanics.targetPattern)
const targetId=(v:unknown):v is string=>typeof v==='string'&&targetPattern.test(v)
export const isProofreadText=(v:unknown):v is string=>text(v,AI_LIMITS.context)&&!/[\u0000-\u001f\u007f\u2028\u2029]/u.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)
export function isProofreadTarget(v:unknown):v is ProofreadTarget {
  return record(v)&&exact(v,['id','blockId','from','to','text','marks'])&&targetId(v.id)&&isId(v.blockId)&&integer(v.from)&&integer(v.to)&&v.to>v.from&&isProofreadText(v.text)&&v.text.length===v.to-v.from&&Array.isArray(v.marks)&&v.marks.length<=5&&v.marks.every(m=>record(m)&&(m.type==='link'?exact(m,['type','attrs'])&&record(m.attrs)&&exact(m.attrs,['href'])&&safeLink(m.attrs.href):exact(m,['type'])&&['bold','italic','underline','strike'].includes(String(m.type))))&&new Set(v.marks.map(m=>m.type)).size===v.marks.length
}
export function isProofreadCapture(v:unknown):v is ProofreadCapture {
  if(!record(v)||!exact(v,['version','id','createdAt','head','prompt','source','context','digest','mode','template','language','targets','coverage']))return false
  if(!isCaptureSource(v.source)||v.source.kind==='none'||!Array.isArray(v.targets)||!v.targets.every(isProofreadTarget)||!record(v.coverage))return false
  const source=v.source,targets=v.targets,coverage=v.coverage
  return v.version===1&&isId(v.id)&&date(v.createdAt)&&isId(v.head)&&text(v.prompt,AI_LIMITS.prompt)&&isCaptureDigest(v.digest)&&v.mode==='mechanics'&&v.template==='mechanics-v1'&&v.language==='en-US'
    &&targets.length>0&&targets.length<=128&&targets.every((t,i)=>t.id===`run-${i+1}`)
    &&exact(coverage,['includedCharacters','excluded'])&&integer(coverage.includedCharacters,AI_LIMITS.context)&&coverage.includedCharacters===targets.reduce((n,t)=>n+t.text.length,0)
    &&Array.isArray(coverage.excluded)&&coverage.excluded.length<=8&&coverage.excluded.every(e=>record(e)&&exact(e,['kind','count'])&&['table','image','quotation','citation','footnote','footnote-body','break','unsupported-boundary'].includes(String(e.kind))&&integer(e.count)&&e.count>0)&&new Set(coverage.excluded.map(e=>e.kind)).size===coverage.excluded.length
    &&Array.isArray(v.context)&&v.context.length===1&&v.context.every(c=>record(c)&&exact(c,['kind','id','revision','label','text'])&&c.kind===source.kind&&c.id===source.documentId&&c.revision===source.revisionId&&text(c.label,200)&&text(c.text,AI_LIMITS.context))
}
export function isFindingSuggestion(v:unknown):v is FindingSuggestion {
  return record(v)&&exact(v,[...mechanics.findingKeys])&&targetId(v.targetId)&&integer(v.from,mechanics.limits.offset)&&integer(v.to,mechanics.limits.offset)&&v.to>v.from&&isProofreadText(v.before)&&v.before.length>0&&v.before.length<=mechanics.limits.span&&v.before.length===v.to-v.from&&isProofreadText(v.replacement)&&v.replacement.length<=mechanics.limits.span&&v.before!==v.replacement&&text(v.reason,mechanics.limits.reason)&&!!v.reason.trim()&&mechanics.kinds.some(kind=>kind===v.kind)
}
export function isProofreadFinding(v:unknown):v is ProofreadFinding {
  if(!record(v))return false
  const {version,id,runId,revisionId,decision,decidedAt,checkpointId,...suggestion}=v
  return version===1&&[id,runId,revisionId].every(isId)&&['pending','accepted','ignored'].includes(String(decision))&&(decidedAt===null||date(decidedAt))&&(decision==='accepted'?isId(checkpointId):checkpointId===null)&&isFindingSuggestion(suggestion)
}
export function isProofreadRun(v:unknown):v is ProofreadRun {
  return record(v)&&exact(v,['version','id','revisionId','state','provider','model','reason','sequence','createdAt','finishedAt','requestDigest','captureId','output','validation'])&&v.version===1&&[v.id,v.revisionId,v.captureId].every(isId)&&states.includes(String(v.state))&&(v.provider===null||v.provider==='openai-codex')&&(v.model===null||model(v.model))&&(v.reason===null||isAiReason(v.reason))&&integer(v.sequence)&&date(v.createdAt)&&(v.finishedAt===null||date(v.finishedAt))&&isCaptureDigest(v.requestDigest)&&text(v.output,AI_LIMITS.output)&&validations.includes(String(v.validation))&&((v.validation==='valid'||v.validation==='invalid')===(v.state==='completed'))&&((v.provider===null)===(v.model===null))&&(v.state!=='not-sent'||v.sequence===0&&v.provider===null&&v.output==='')&&(!['preparing','running','stopping','not-sent'].includes(String(v.state))||v.validation==='pending')&&(v.state!=='completed'||v.provider!==null&&v.finishedAt!==null)
}
export function isProofreadBundle(v:unknown):v is ProofreadBundle {
  if(!record(v)||!exact(v,['attempt','capture','findings','validity'])||!isProofreadRun(v.attempt)||!isProofreadCapture(v.capture)||!Array.isArray(v.findings)||!v.findings.every(isProofreadFinding))return false
  const attempt=v.attempt,findings=v.findings
  return attempt.captureId===v.capture.id&&findings.length<=100&&findings.every(f=>f.runId===attempt.id)&&new Set(findings.map(f=>f.id)).size===findings.length&&(attempt.validation==='valid'||findings.length===0)&&['current','stale','missing'].includes(String(v.validity))
}
export function isProofreadRequest(v:unknown):v is ProofreadRequest {
  if(!record(v)||!isOpenInput({projectId:v.projectId,workspaceId:v.workspaceId}))return false
  const fields=['projectId','workspaceId','action']
  switch(v.action){
    case 'list': return exact(v,[...fields,'offset'])&&integer(v.offset)
    case 'review': return exact(v,[...fields,'expectedHead','captureId','createdAt','source'])&&isId(v.expectedHead)&&isId(v.captureId)&&date(v.createdAt)&&isCaptureSource(v.source)&&v.source.kind!=='none'
    case 'submit': return exact(v,[...fields,'attemptId','review','digest','send','connectionId','model'])&&isId(v.attemptId)&&record(v.review)&&v.review.action==='review'&&isProofreadRequest(v.review)&&v.review.projectId===v.projectId&&v.review.workspaceId===v.workspaceId&&isCaptureDigest(v.digest)&&typeof v.send==='boolean'&&(v.connectionId===null||isId(v.connectionId))&&(v.model===null||model(v.model))&&(!v.send||(isId(v.connectionId)&&model(v.model)))
    case 'decide': return exact(v,[...fields,'operationId','attemptId','findingId','expectedRevision','expectedHead','decision'])&&[v.operationId,v.attemptId,v.findingId,v.expectedRevision,v.expectedHead].every(isId)&&['apply','ignore','undo-ignore'].includes(String(v.decision))
    case 'attempt': case 'cancel': case 'protect': case 'acknowledge': return exact(v,[...fields,'attemptId'])&&isId(v.attemptId)
    case 'reconcile': return exact(v,fields)
    default:return false
  }
}
export function isProofreadWorkerInput(v:unknown):v is ProofreadWorkerInput {
  if(!record(v)||!isOpenInput({projectId:v.projectId,workspaceId:v.workspaceId}))return false
  const fields=['projectId','workspaceId','action']
  switch(v.action){
    case 'list':case 'review':case 'decide':return isProofreadRequest(v)
    case 'append':return exact(v,[...fields,'submission'])&&isProofreadRequest(v.submission)&&v.submission.action==='submit'&&v.submission.projectId===v.projectId&&v.submission.workspaceId===v.workspaceId
    case 'receipt':return exact(v,[...fields,'decision'])&&isProofreadRequest(v.decision)&&v.decision.action==='decide'&&v.decision.projectId===v.projectId&&v.decision.workspaceId===v.workspaceId
    case 'get':return exact(v,[...fields,'attemptId'])&&isId(v.attemptId)
    case 'bindings':return exact(v,fields)
    case 'binding':return exact(v,[...fields,'attemptId'])&&isId(v.attemptId)
    case 'handoff':return exact(v,[...fields,'binding','operation','acknowledged'])&&isProofreadingBinding(v.binding)&&isAiOperation(v.operation)&&typeof v.acknowledged==='boolean'
    case 'retire':return exact(v,[...fields,'receipt'])&&isAiHandoffReceipt(v.receipt)&&v.receipt.purpose==='proofread'&&v.receipt.scope.projectId===v.projectId&&v.receipt.scope.workspaceId===v.workspaceId
    case 'bind':return exact(v,[...fields,'binding'])&&isProofreadingBinding(v.binding)
    case 'settle':return exact(v,[...fields,'attemptId','binding','operation','reason'])&&isId(v.attemptId)&&(v.binding===null||isProofreadingBinding(v.binding))&&(v.operation===null||isAiOperation(v.operation))&&(v.reason===null||isAiReason(v.reason))
    default:return false
  }
}
export function isProofreadValue(v:unknown):v is ProofreadValue {
  if(!record(v))return false
  switch(v.type){
    case 'list':return exact(v,['type','items','total'])&&integer(v.total,10000)&&Array.isArray(v.items)&&v.items.length<=20&&v.items.every(r=>record(r)&&exact(r,['id','createdAt','state','label','findings','validation'])&&isId(r.id)&&date(r.createdAt)&&states.includes(String(r.state))&&text(r.label,200)&&integer(r.findings,100)&&validations.includes(String(r.validation)))
    case 'review':return exact(v,['type','capture'])&&isProofreadCapture(v.capture)
    case 'turn':return exact(v,['type','turn','fresh','head','updatedAt'])&&isProofreadBundle(v.turn)&&typeof v.fresh==='boolean'&&isId(v.head)&&date(v.updatedAt)
    case 'decision':return exact(v,['type','turn','documentId','revisionId','head','updatedAt'])&&isProofreadBundle(v.turn)&&[v.documentId,v.revisionId,v.head].every(isId)&&date(v.updatedAt)
    case 'bindings':return exact(v,['type','bindings'])&&Array.isArray(v.bindings)&&v.bindings.length<=AI_LIMITS.jobs&&v.bindings.every(isProofreadingBinding)
    case 'binding':return exact(v,['type','binding','receipt','retired'])&&(v.binding===null||isProofreadingBinding(v.binding))&&(v.receipt===null||isAiHandoffReceipt(v.receipt)&&v.receipt.purpose==='proofread')&&typeof v.retired==='boolean'&&(!v.retired||v.binding!==null&&v.receipt!==null)
    case 'handoff':return exact(v,['type','receipt'])&&isAiHandoffReceipt(v.receipt)&&v.receipt.purpose==='proofread'
    case 'done':return exact(v,['type'])
    default:return false
  }
}
