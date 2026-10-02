import type { CaptureSource, AiTextCaptureFields, AiAttemptFields } from './ai-content'
export type { CaptureSource, AttemptState } from './ai-content'
import { isId } from '../domain/editor/schema'
import { AI_LIMITS, isAiOperation, isAiReason, type AiOperation, type AiReason } from './ai'
import { exact, record, isOpenInput, type OpenInput, type ProjectResult } from './projects'

export const CONVERSATION_CHANNEL = 'conversations.command'
export const CONVERSATION_CHANGED = 'conversations.changed'
export const CONVERSATION_LIMITS = { title: 160, list: 20, turns: 5, history: 12, ranges: 128, exportBytes: 64 * 1024 * 1024 } as const
/** Portable authorization evidence, never an execution grant or account identifier. */
export type AiCapture = AiTextCaptureFields & { conversationId: string; template: 'conversation-v1'; historyIds: string[] }
export type Conversation = { version: 1; id: string; revisionId: string; title: string; state: 'active' | 'archived'; createdAt: string; updatedAt: string }
export type ConversationMessage = { version: 1; id: string; revisionId: string; conversationId: string; attemptId: string; ordinal: number; role: 'user' | 'assistant'; text: string; createdAt: string }
export type ConversationAttempt = AiAttemptFields & { conversationId: string; captureId: string; userMessageId: string; assistantMessageId: string | null }
export type ConversationTurn = { attempt: ConversationAttempt; capture: AiCapture; user: ConversationMessage; assistant: ConversationMessage | null }
export type ConversationReview = OpenInput & { action: 'review'; conversationId: string; expectedRevision: string; expectedHead: string; captureId: string; createdAt: string; prompt: string; source: CaptureSource; historyIds: string[] }
export type ConversationChange = OpenInput & { action: 'change'; operationId: string; conversationId: string; expectedRevision: string | null; title: string; state: 'active' | 'archived' }
export type ConversationSubmit = OpenInput & { action: 'submit'; attemptId: string; review: ConversationReview; digest: string; send: boolean; connectionId: string | null; model: string | null }
export type ConversationRequest =
  | (OpenInput & { action: 'list'; state: 'active' | 'archived'; query: string; offset: number })
  | (OpenInput & { action: 'read'; conversationId: string; before: number | null })
  | ConversationChange | ConversationReview | ConversationSubmit
  | (OpenInput & { action: 'reconcile' })
  | (OpenInput & { action: 'cancel'; attemptId: string })
  | (OpenInput & { action: 'protect'; attemptId: string })
  | (OpenInput & { action: 'attempt'; attemptId: string })
  | (OpenInput & { action: 'export'; conversationId: string; expectedRevision: string; includeContext: boolean })
export type ConversationBinding = { attemptId: string; operationId: string; connectionId: string; model: string; digest: string; captureDigest: string }
export type ConversationWorkerInput = Exclude<ConversationRequest, ConversationSubmit | { action: 'cancel' | 'protect' | 'attempt' | 'reconcile' | 'export' }> | (OpenInput & (
  | { action: 'append'; submission: ConversationSubmit }
  | { action: 'bind'; binding: ConversationBinding }
  | { action: 'settle'; attemptId: string; binding: ConversationBinding | null; operation: AiOperation | null; reason: AiReason | null }
  | { action: 'bindings' }
  | { action: 'get'; attemptId: string }
  | { action: 'export'; conversationId: string; expectedRevision: string; includeContext: boolean; destinationPath: string }
))
export type ConversationValue =
  | { type: 'list'; items: Conversation[]; total: number }
  | { type: 'page'; conversation: Conversation; turns: ConversationTurn[]; olderThan: number | null; totalMessages: number }
  | { type: 'changed'; conversation: Conversation; head: string; updatedAt: string }
  | { type: 'review'; capture: AiCapture; excludedMessages: number }
  | { type: 'turn'; turn: ConversationTurn; fresh: boolean; head: string; updatedAt: string }
  | { type: 'bindings'; bindings: ConversationBinding[] }
  | { type: 'done' }
  | { type: 'exported'; path: string }
export type ConversationEvent = OpenInput & { attemptId: string | null; pending: boolean; issue: string | null }
export type ConversationAPI = { conversation(input: ConversationRequest): Promise<ProjectResult<ConversationValue>>; onConversationChanged(listener: (event: ConversationEvent) => void): () => void }

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !v.includes('\0')
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v))
const integer = (v: unknown, max = 1_000_000_000): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
export const isCaptureDigest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const model = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(v)
const state = (v: unknown): v is 'active' | 'archived' => v === 'active' || v === 'archived'
const scope = (v: Record<string, unknown>): boolean => isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId })
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= CONVERSATION_LIMITS.history && v.every(isId) && new Set(v).size === v.length
export function isCaptureSource(v: unknown): v is CaptureSource {
  if (!record(v)) return false
  if (v.kind === 'none') return exact(v, ['kind'])
  if (!isId(v.documentId) || !isId(v.revisionId)) return false
  if (v.kind === 'section') return exact(v, ['kind', 'documentId', 'revisionId'])
  return v.kind === 'passage' && exact(v, ['kind','documentId','revisionId','ranges']) && Array.isArray(v.ranges) && v.ranges.length > 0 && v.ranges.length <= CONVERSATION_LIMITS.ranges && v.ranges.every(r => record(r) && exact(r,['blockId','from','to']) && isId(r.blockId) && integer(r.from) && integer(r.to) && r.to > r.from) && new Set(v.ranges.map(r => r.blockId)).size === v.ranges.length
}
export function isAiCapture(v: unknown): v is AiCapture {
  return record(v) && exact(v,['version','id','conversationId','template','createdAt','head','prompt','source','historyIds','context','digest']) && v.version === 1 && isId(v.id) && isId(v.conversationId) && v.template === 'conversation-v1' && date(v.createdAt) && isId(v.head) && text(v.prompt,AI_LIMITS.prompt) && !!v.prompt.trim() && isCaptureSource(v.source) && ids(v.historyIds) && isCaptureDigest(v.digest) && Array.isArray(v.context) && v.context.length <= AI_LIMITS.chunks && v.context.every(c => record(c) && exact(c,['kind','id','revision','label','text']) && ['passage','section','history'].includes(String(c.kind)) && isId(c.id) && isId(c.revision) && text(c.label,200) && text(c.text,AI_LIMITS.context)) && v.context.reduce((n,c)=>n+c.text.length,0) <= AI_LIMITS.context
}
export function isConversation(v: unknown): v is Conversation { return record(v) && exact(v,['version','id','revisionId','title','state','createdAt','updatedAt']) && v.version===1 && isId(v.id) && isId(v.revisionId) && text(v.title,160) && !!v.title.trim() && state(v.state) && date(v.createdAt) && date(v.updatedAt) }
export function isConversationMessage(v: unknown): v is ConversationMessage { return record(v) && exact(v,['version','id','revisionId','conversationId','attemptId','ordinal','role','text','createdAt']) && v.version===1 && [v.id,v.revisionId,v.conversationId,v.attemptId].every(isId) && integer(v.ordinal) && ['user','assistant'].includes(String(v.role)) && text(v.text,v.role==='user'?AI_LIMITS.prompt:AI_LIMITS.output) && date(v.createdAt) }
export function isConversationAttempt(v: unknown): v is ConversationAttempt { return record(v) && exact(v,['version','id','revisionId','conversationId','captureId','userMessageId','assistantMessageId','state','provider','model','reason','sequence','createdAt','finishedAt','requestDigest']) && v.version===1 && [v.id,v.revisionId,v.conversationId,v.captureId,v.userMessageId].every(isId) && (v.assistantMessageId===null||isId(v.assistantMessageId)) && ['not-sent','preparing','running','stopping','completed','cancelled','failed','unknown'].includes(String(v.state)) && (v.provider===null||v.provider==='openai-codex') && (v.model===null||model(v.model)) && (v.reason===null||isAiReason(v.reason)) && integer(v.sequence) && date(v.createdAt) && (v.finishedAt===null||date(v.finishedAt)) && isCaptureDigest(v.requestDigest) }
export function isConversationTurn(v: unknown): v is ConversationTurn { return record(v) && exact(v,['attempt','capture','user','assistant']) && isConversationAttempt(v.attempt) && isAiCapture(v.capture) && isConversationMessage(v.user) && (v.assistant===null||isConversationMessage(v.assistant)) && v.attempt.captureId===v.capture.id && v.attempt.userMessageId===v.user.id && v.user.attemptId===v.attempt.id && v.user.role==='user' && v.user.text===v.capture.prompt && v.attempt.conversationId===v.capture.conversationId && v.user.conversationId===v.capture.conversationId && (v.assistant===null?v.attempt.assistantMessageId===null:v.assistant.id===v.attempt.assistantMessageId&&v.assistant.attemptId===v.attempt.id&&v.assistant.conversationId===v.capture.conversationId&&v.assistant.role==='assistant'&&v.assistant.ordinal===v.user.ordinal+1) }
export function isConversationRequest(v: unknown): v is ConversationRequest {
  if (!record(v)||!scope(v)) return false
  const fields=['projectId','workspaceId','action']
  switch(v.action) {
    case 'list': return exact(v,[...fields,'state','query','offset']) && state(v.state) && text(v.query,160) && integer(v.offset)
    case 'read': return exact(v,[...fields,'conversationId','before']) && isId(v.conversationId) && (v.before===null||integer(v.before))
    case 'change': return exact(v,[...fields,'operationId','conversationId','expectedRevision','title','state']) && isId(v.operationId) && isId(v.conversationId) && (v.expectedRevision===null||isId(v.expectedRevision)) && text(v.title,160) && v.title===v.title.trim() && !!v.title && state(v.state)
    case 'review': return exact(v,[...fields,'conversationId','expectedRevision','expectedHead','captureId','createdAt','prompt','source','historyIds']) && [v.conversationId,v.expectedRevision,v.expectedHead,v.captureId].every(isId) && date(v.createdAt) && text(v.prompt,AI_LIMITS.prompt) && !!v.prompt.trim() && isCaptureSource(v.source) && ids(v.historyIds)
    case 'submit': return exact(v,[...fields,'attemptId','review','digest','send','connectionId','model']) && isId(v.attemptId) && record(v.review) && v.review.action==='review' && isConversationRequest(v.review) && v.review.projectId===v.projectId && v.review.workspaceId===v.workspaceId && isCaptureDigest(v.digest) && typeof v.send==='boolean' && (v.connectionId===null||isId(v.connectionId)) && (v.model===null||model(v.model)) && (!v.send||(isId(v.connectionId)&&model(v.model)))
    case 'reconcile': return exact(v,fields)
    case 'cancel': case 'protect': case 'attempt': return exact(v,[...fields,'attemptId']) && isId(v.attemptId)
    case 'export': return exact(v,[...fields,'conversationId','expectedRevision','includeContext']) && isId(v.conversationId) && isId(v.expectedRevision) && typeof v.includeContext==='boolean'
    default: return false
  }
}
export function isConversationBinding(v: unknown): v is ConversationBinding { return record(v)&&exact(v,['attemptId','operationId','connectionId','model','digest','captureDigest'])&&[v.attemptId,v.operationId,v.connectionId].every(isId)&&model(v.model)&&isCaptureDigest(v.digest)&&isCaptureDigest(v.captureDigest) }
export function isConversationWorkerInput(v: unknown): v is ConversationWorkerInput {
  if (!record(v)||!scope(v)) return false
  const fields=['projectId','workspaceId','action']
  switch(v.action) {
    case 'list': case 'read': case 'change': case 'review': return isConversationRequest(v)
    case 'append': return exact(v,[...fields,'submission'])&&isConversationRequest(v.submission)&&v.submission.action==='submit'&&v.submission.projectId===v.projectId&&v.submission.workspaceId===v.workspaceId
    case 'bind': return exact(v,[...fields,'binding'])&&isConversationBinding(v.binding)
    case 'settle': return exact(v,[...fields,'attemptId','binding','operation','reason'])&&isId(v.attemptId)&&(v.binding===null||isConversationBinding(v.binding))&&(v.operation===null||isAiOperation(v.operation))&&(v.reason===null||isAiReason(v.reason))
    case 'bindings': return exact(v,fields)
    case 'get': return exact(v,[...fields,'attemptId'])&&isId(v.attemptId)
    case 'export': { const {destinationPath,...publicInput}=v;return isConversationRequest(publicInput)&&text(destinationPath,4096)&&!!destinationPath }
    default: return false
  }
}
export function isConversationValue(v: unknown): v is ConversationValue {
  if (!record(v)) return false
  switch(v.type) {
    case 'list': return exact(v,['type','items','total'])&&Array.isArray(v.items)&&v.items.length<=20&&v.items.every(isConversation)&&integer(v.total)
    case 'page': return exact(v,['type','conversation','turns','olderThan','totalMessages'])&&isConversation(v.conversation)&&Array.isArray(v.turns)&&v.turns.length<=5&&v.turns.every(isConversationTurn)&&v.turns.every(t=>t.attempt.conversationId===(v.conversation as Conversation).id)&&(v.olderThan===null||integer(v.olderThan))&&integer(v.totalMessages)
    case 'changed': return exact(v,['type','conversation','head','updatedAt'])&&isConversation(v.conversation)&&isId(v.head)&&date(v.updatedAt)
    case 'review': return exact(v,['type','capture','excludedMessages'])&&isAiCapture(v.capture)&&integer(v.excludedMessages)
    case 'turn': return exact(v,['type','turn','fresh','head','updatedAt'])&&isConversationTurn(v.turn)&&typeof v.fresh==='boolean'&&isId(v.head)&&date(v.updatedAt)
    case 'bindings': return exact(v,['type','bindings'])&&Array.isArray(v.bindings)&&v.bindings.length<=AI_LIMITS.jobs&&v.bindings.every(isConversationBinding)
    case 'done': return exact(v,['type'])
    case 'exported': return exact(v,['type','path'])&&text(v.path,4096)
    default: return false
  }
}
export function isConversationEvent(v: unknown): v is ConversationEvent {return record(v)&&exact(v,['projectId','workspaceId','attemptId','pending','issue'])&&scope(v)&&(v.attemptId===null||isId(v.attemptId))&&typeof v.pending==='boolean'&&(v.issue===null||text(v.issue,500))}
