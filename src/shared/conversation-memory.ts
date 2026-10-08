import { isId } from '../domain/editor/schema'
import { aiText } from './ai'
import { exact, record } from './projects'

export const MEMORY_LIMITS = {
  text: 6000,
  input: 36000,
  recentPairs: 2,
  checkpoints: 1000,
  messages: 20000
} as const
export const MEMORY_PROMPT =
  'Prepare a compact working memory, aiming for 2500-4000 characters and never exceeding 6000 characters. Preserve goals, agreed decisions, terminology, unresolved questions, qualifications and source identifiers from the supplied material. Distinguish user decisions from assistant suggestions. Retain explicit uncertainty and coverage limitations. Do not invent facts, quotations or references. Summaries are not evidence or verbatim quotations. Return only the useful memory in Markdown.'
export type MemoryPurpose = 'chat' | 'chat-summary' | 'overview-summary'
export type MemoryMessageRef = { id: string; revision: string; ordinal: number }
export type MemoryCoverage =
  | { kind: 'chat'; previousId: string | null; messages: MemoryMessageRef[] }
  | { kind: 'overview'; digest: string; documents: { id: string; revision: string }[] }
export type MemoryCheckpoint = {
  version: 1
  id: string
  conversationId: string
  producingAttemptId: string
  parentId: string | null
  coverage: MemoryCoverage
  text: string
  state: 'accepted' | 'edited'
  createdAt: string
}
export function isMemoryCoverage(v: unknown): v is MemoryCoverage {
  if (!record(v)) return false
  if (v.kind === 'chat')
    return (
      exact(v, ['kind', 'previousId', 'messages']) &&
      (v.previousId === null || isId(v.previousId)) &&
      Array.isArray(v.messages) &&
      v.messages.length > 0 &&
      v.messages.length <= 256 &&
      v.messages.length % 2 === 0 &&
      v.messages.every(
        (m) =>
          record(m) &&
          exact(m, ['id', 'revision', 'ordinal']) &&
          isId(m.id) &&
          isId(m.revision) &&
          Number.isSafeInteger(m.ordinal) &&
          Number(m.ordinal) >= 0
      ) &&
      new Set(v.messages.map((m) => m.id)).size === v.messages.length
    )
  return (
    v.kind === 'overview' &&
    exact(v, ['kind', 'digest', 'documents']) &&
    typeof v.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(v.digest) &&
    Array.isArray(v.documents) &&
    v.documents.length <= 201 &&
    v.documents.every(
      (d) => record(d) && exact(d, ['id', 'revision']) && isId(d.id) && isId(d.revision)
    )
  )
}
export function isMemoryCheckpoint(v: unknown): v is MemoryCheckpoint {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'conversationId',
      'producingAttemptId',
      'parentId',
      'coverage',
      'text',
      'state',
      'createdAt'
    ]) &&
    v.version === 1 &&
    [v.id, v.conversationId, v.producingAttemptId].every(isId) &&
    (v.parentId === null || isId(v.parentId)) &&
    isMemoryCoverage(v.coverage) &&
    aiText(v.text, MEMORY_LIMITS.text) &&
    !!v.text.trim() &&
    (v.state === 'accepted' || v.state === 'edited') &&
    typeof v.createdAt === 'string' &&
    Number.isFinite(Date.parse(v.createdAt)) &&
    new Date(v.createdAt).toISOString() === v.createdAt
  )
}
