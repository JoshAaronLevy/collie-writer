import { isId } from '../domain/editor/schema'
import { exact, isOpenInput, record, type OpenInput } from './projects'

export const AI_CHANNELS = {
  status: 'ai.status', connect: 'ai.connect', cancelConnect: 'ai.cancelConnect',
  refresh: 'ai.refresh', disconnect: 'ai.disconnect', models: 'ai.models',
  prepare: 'ai.prepare', start: 'ai.start', cancel: 'ai.cancel', operations: 'ai.operations', record: 'ai.record', protect: 'ai.protect'
} as const
export const AI_CHANGED = 'ai.changed'
export const AI_PROVIDER = 'openai-codex' as const
export const AI_LIMITS = { prompt: 16000, context: 64000, chunks: 32, output: 128000, jobs: 64 } as const
export type AiReason = 'configuration-required' | 'development-access-unavailable' | 'commercial-activation-pending' |
  'secure-storage-unavailable' | 'storage-unavailable' | 'signed-out' | 'session-expired' | 'consent-required' |
  'funding-unknown' | 'runtime-unavailable' | 'isolation-unresolved' | 'model-unavailable' |
  'read-only-project' | 'busy' | 'invalid-request' | 'cancelled' | 'auth-failed' | 'offline' |
  'quota-exhausted' | 'provider-failed' | 'outcome-unknown' | 'output-limit' | 'context-changed'
const reasons: AiReason[] = ['configuration-required','development-access-unavailable','commercial-activation-pending',
  'secure-storage-unavailable','storage-unavailable','signed-out','session-expired','consent-required','funding-unknown',
  'runtime-unavailable','isolation-unresolved','model-unavailable','read-only-project','busy','invalid-request',
  'cancelled','auth-failed','offline','quota-exhausted','provider-failed','outcome-unknown','output-limit','context-changed']
export type AiResult<T> = { ok: true; requestId: string; value: T } | { ok: false; requestId: string; reason: AiReason }
export type AiConnection = { id: string; label: string; state: 'signed-in' | 'expired' | 'signed-out'; planConsent: boolean }
export type AiStatus = {
  provider: typeof AI_PROVIDER
  channel: 'development' | 'beta' | 'production'
  implementation: 'partial'
  configured: boolean
  channelPermitted: boolean
  commercialApproved: boolean
  funding: 'unknown'
  runtime: 'development-installed' | 'not-packaged' | 'unavailable'
  state: 'unavailable' | 'signed-out' | 'signing-in' | 'signed-in' | 'refreshing' | 'disconnecting'
  reasons: AiReason[]
  attemptId: string | null
  activeConnectionId: string | null
  connections: AiConnection[]
  remoteRevocation: 'none' | 'confirmed' | 'unconfirmed'
}
export type AiConnectInput = { attemptId: string; connectionId: string | null }
export type AiAttemptInput = { attemptId: string }
export type AiConnectionInput = { connectionId: string }
export type AiModel = { id: string; label: string; eligibility: 'unverified' }
export type AiContext = { kind: 'passage' | 'section' | 'note' | 'source-excerpt' | 'history'; id: string; revision: string; label: string; text: string }
export type AiPrepareInput = { scope: OpenInput; operationId: string; connectionId: string; model: string; action: 'conversation' | 'proofread'; prompt: string; context: AiContext[] }
export type AiPrepared = { authorizationId: string; operationId: string; digest: string; expiresAt: number }
export type AiStartInput = { scope: OpenInput; operationId: string; authorizationId: string; digest: string }
export type AiOperationInput = { scope: OpenInput; operationId: string }
export type AiOperation = {
  operationId: string; scope: OpenInput; connectionId: string; model: string; action: 'conversation' | 'proofread';
  digest: string; state: 'starting' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed' | 'unknown';
  text: string; sequence: number; reason: AiReason | null; startedAt: number; finishedAt: number | null
}
/** Snapshots make dropped/coalesced notifications recoverable; no raw runtime events cross IPC. */
export type AiEvent = { kind: 'connection'; status: AiStatus } | { kind: 'operation'; operation: AiOperation }
export type AiOperationRecord = { input: AiPrepareInput; operation: AiOperation }
export type AiAPI = {
  aiStatus: () => Promise<AiResult<AiStatus>>
  connectAi: (input: AiConnectInput) => Promise<AiResult<AiStatus>>
  cancelAiConnection: (input: AiAttemptInput) => Promise<AiResult<AiStatus>>
  refreshAiConnection: (input: AiConnectionInput) => Promise<AiResult<AiStatus>>
  disconnectAi: (input: AiConnectionInput) => Promise<AiResult<AiStatus>>
  aiModels: (input: AiConnectionInput) => Promise<AiResult<AiModel[]>>
  prepareAiOperation: (input: AiPrepareInput) => Promise<AiResult<AiPrepared>>
  startAiOperation: (input: AiStartInput) => Promise<AiResult<AiOperation>>
  cancelAiOperation: (input: AiOperationInput) => Promise<AiResult<AiOperation>>
  aiOperations: (scope: OpenInput) => Promise<AiResult<AiOperation[]>>
  readAiOperation: (input: AiOperationInput) => Promise<AiResult<AiOperationRecord>>
  retryAiProtection: (input: AiOperationInput) => Promise<AiResult<AiOperation>>
  onAiChanged: (callback: (event: AiEvent) => void) => () => void
}
export const isAiReason = (v: unknown): v is AiReason => typeof v === 'string' && reasons.includes(v as AiReason)
export const aiText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !v.includes('\u0000')
const nullableId = (v: unknown): boolean => v === null || isId(v)
const time = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0
export function isAiConnect(v: unknown): v is AiConnectInput { return record(v) && exact(v,['attemptId','connectionId']) && isId(v.attemptId) && nullableId(v.connectionId) }
export function isAiAttempt(v: unknown): v is AiAttemptInput { return record(v) && exact(v,['attemptId']) && isId(v.attemptId) }
export function isAiConnection(v: unknown): v is AiConnectionInput { return record(v) && exact(v,['connectionId']) && isId(v.connectionId) }
export function isAiPrepare(v: unknown): v is AiPrepareInput {
  return record(v) && exact(v,['scope','operationId','connectionId','model','action','prompt','context']) && isOpenInput(v.scope) &&
    isId(v.operationId) && isId(v.connectionId) && aiText(v.model,100) && /^[a-zA-Z0-9._-]+$/.test(v.model) &&
    ['conversation','proofread'].includes(String(v.action)) && aiText(v.prompt,AI_LIMITS.prompt) && v.prompt.trim().length > 0 &&
    Array.isArray(v.context) && v.context.length <= AI_LIMITS.chunks && v.context.every(c => record(c) &&
      exact(c,['kind','id','revision','label','text']) && ['passage','section','note','source-excerpt','history'].includes(String(c.kind)) &&
      isId(c.id) && isId(c.revision) && aiText(c.label,200) && aiText(c.text,AI_LIMITS.context)) &&
    v.context.reduce((n,c) => n + c.text.length, 0) <= AI_LIMITS.context
}
export function isAiPrepared(v: unknown): v is AiPrepared { return record(v) && exact(v,['authorizationId','operationId','digest','expiresAt']) && isId(v.authorizationId) && isId(v.operationId) && typeof v.digest === 'string' && /^[a-f0-9]{64}$/.test(v.digest) && time(v.expiresAt) }
export function isAiStart(v: unknown): v is AiStartInput { return record(v) && exact(v,['scope','operationId','authorizationId','digest']) && isOpenInput(v.scope) && isId(v.operationId) && isId(v.authorizationId) && typeof v.digest === 'string' && /^[a-f0-9]{64}$/.test(v.digest) }
export function isAiOperationInput(v: unknown): v is AiOperationInput { return record(v) && exact(v,['scope','operationId']) && isOpenInput(v.scope) && isId(v.operationId) }
export function isAiOperation(v: unknown): v is AiOperation {
  return record(v) && exact(v,['operationId','scope','connectionId','model','action','digest','state','text','sequence','reason','startedAt','finishedAt']) &&
    isId(v.operationId) && isOpenInput(v.scope) && isId(v.connectionId) && aiText(v.model,100) && ['conversation','proofread'].includes(String(v.action)) &&
    typeof v.digest === 'string' && /^[a-f0-9]{64}$/.test(v.digest) && ['starting','running','cancelling','completed','cancelled','failed','unknown'].includes(String(v.state)) &&
    aiText(v.text,AI_LIMITS.output) && Number.isSafeInteger(v.sequence) && Number(v.sequence) >= 0 && (v.reason === null || isAiReason(v.reason)) && time(v.startedAt) && (v.finishedAt === null || time(v.finishedAt))
}
export function isAiStatus(v: unknown): v is AiStatus {
  return record(v) && exact(v,['provider','channel','implementation','configured','channelPermitted','commercialApproved','funding','runtime','state','reasons','attemptId','activeConnectionId','connections','remoteRevocation']) &&
    v.provider === AI_PROVIDER && ['development','beta','production'].includes(String(v.channel)) && v.implementation === 'partial' &&
    [v.configured,v.channelPermitted,v.commercialApproved].every(b=>typeof b==='boolean') && v.funding === 'unknown' &&
    ['development-installed','not-packaged','unavailable'].includes(String(v.runtime)) && ['unavailable','signed-out','signing-in','signed-in','refreshing','disconnecting'].includes(String(v.state)) &&
    Array.isArray(v.reasons) && v.reasons.length <= reasons.length && v.reasons.every(isAiReason) && nullableId(v.attemptId) && nullableId(v.activeConnectionId) &&
    Array.isArray(v.connections) && v.connections.length <= 8 && v.connections.every(c=>record(c) && exact(c,['id','label','state','planConsent']) && isId(c.id) && aiText(c.label,200) && ['signed-in','expired','signed-out'].includes(String(c.state)) && typeof c.planConsent==='boolean') &&
    ['none','confirmed','unconfirmed'].includes(String(v.remoteRevocation))
}
export function isAiModels(v: unknown): v is AiModel[] { return Array.isArray(v) && v.length <= 100 && v.every(m=>record(m) && exact(m,['id','label','eligibility']) && aiText(m.id,100) && aiText(m.label,200) && m.eligibility==='unverified') }
export function isAiEvent(v: unknown): v is AiEvent { return record(v) && (v.kind==='connection' && exact(v,['kind','status']) && isAiStatus(v.status) || v.kind==='operation' && exact(v,['kind','operation']) && isAiOperation(v.operation)) }
export function isAiOperationRecord(v:unknown):v is AiOperationRecord {return record(v)&&exact(v,['input','operation'])&&isAiPrepare(v.input)&&isAiOperation(v.operation)&&v.input.operationId===v.operation.operationId}
export function isAiResult<T>(v: unknown, id: string, valid: (value: unknown)=>boolean): v is AiResult<T> {
  return record(v) && v.requestId===id && (v.ok===true && exact(v,['ok','requestId','value']) && valid(v.value) || v.ok===false && exact(v,['ok','requestId','reason']) && isAiReason(v.reason))
}
