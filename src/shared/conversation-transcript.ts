import { isId } from '../domain/editor/schema'
import { exact, record, type OpenInput } from './projects'
import { importHash, importTime } from './project-import'
import { isGraphRecord, type GraphRecord } from './import-graph'

export const TRANSCRIPT_LIMITS = {
  page: 20,
  excerpt: 1500,
  slice: 8000,
  reply: 100000,
  messages: 100000,
  variants: 128
} as const
/** Immutable accepted prefix evidence; no attempt, capture, account or execution authority. */
export type ExternalConversation = {
  version: 1
  conversationId: string
  revisionId: string
  batchId: string
  graphId: string
  graphDigest: string
  record: GraphRecord
  variants: string[]
  importedAt: string
  commitId: string
  excluded: boolean
}
export type ExternalMessage = {
  version: 1
  id: string
  revisionId: string
  conversationId: string
  graphId: string
  sequence: number
  visibility: 'visible' | 'excluded'
  orderRecordId: string
  record: GraphRecord
  variants: string[]
}
export type ExternalEvidence = { origins: ExternalConversation[]; messages: ExternalMessage[] }
export type HistoricalTime = {
  raw: string | null
  normalizedUtc: string | null
  precision: string | null
  zoneKnown: boolean | null
}
export type TranscriptKey = {
  segment: 'imported' | 'native'
  sequence: number
  messageId: string
  messageRevision: string
}
export type TranscriptCursor = {
  version: 1
  conversationId: string
  revisionId: string
  key: TranscriptKey
}
export type TranscriptSource =
  | { kind: 'accepted'; conversationId: string; revisionId: string }
  | { kind: 'staged'; batchId: string; graphId: string; recordId: string }
export type TranscriptRequest = OpenInput & {
  action: 'transcript-read'
  source: TranscriptSource
  cursor: TranscriptCursor | null
  direction: 'forward' | 'backward'
  target: TranscriptKey | null
}
export type TranscriptTextRequest = OpenInput & {
  action: 'transcript-text'
  source: TranscriptSource
  target: TranscriptKey
  offset: number
}
export type TranscriptFindRequest = OpenInput & {
  action: 'transcript-find'
  source: TranscriptSource
  query: string
  after: { cursor: TranscriptCursor; offset: number; query: string } | null
}
export type TranscriptInput = TranscriptRequest | TranscriptTextRequest | TranscriptFindRequest
export type TranscriptEntry = {
  key: TranscriptKey
  role: 'user' | 'assistant' | 'system' | 'developer' | 'tool' | 'unknown'
  originalRole: string | null
  historicalTime: HistoricalTime
  importedAt: string | null
  visibility: 'visible' | 'excluded'
  text: string
  textUnits: number
  external: { graphId: string; record: GraphRecord; variants: string[] } | null
  native: { attemptId: string; state: string; preparation: boolean } | null
}
export type TranscriptSummary = {
  version: 1
  importedAt: string
  historicalTime: HistoricalTime
  archivedInOriginal: boolean | null
  doNotRecallInOriginal: boolean | null
  excluded: boolean
  messages: number
}
export type TranscriptValue =
  | {
      type: 'transcript'
      version: 1
      source: TranscriptSource
      conversationId: string
      revisionId: string
      title: string
      entries: TranscriptEntry[]
      total: number
      before: TranscriptCursor | null
      after: TranscriptCursor | null
      omittedInternal: number
    }
  | {
      type: 'transcript-text'
      version: 1
      source: TranscriptSource
      target: TranscriptKey
      text: string
      offset: number
      total: number
      nextOffset: number | null
      mapping: {
        from: number
        to: number
        textId: string | null
        originalFrom: number
        originalTo: number
      }[]
    }
  | {
      type: 'transcript-matches'
      version: 1
      source: TranscriptSource
      query: string
      items: {
        key: TranscriptKey
        role: TranscriptEntry['role']
        preview: string
        offset: number
      }[]
      next: TranscriptFindRequest['after']
    }
const uint = (v: unknown, max = 1_000_000_000): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const nullable = (v: unknown): v is string | null => v === null || text(v, 4000)
const variants = (v: unknown, chosen: string): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= TRANSCRIPT_LIMITS.variants &&
  v.every(isId) &&
  v.includes(chosen) &&
  new Set(v).size === v.length
export function isExternalConversation(v: unknown): v is ExternalConversation {
  return (
    record(v) &&
    exact(v, [
      'version',
      'conversationId',
      'revisionId',
      'batchId',
      'graphId',
      'graphDigest',
      'record',
      'variants',
      'importedAt',
      'commitId',
      'excluded'
    ]) &&
    v.version === 1 &&
    [v.conversationId, v.revisionId, v.batchId, v.graphId, v.commitId].every(isId) &&
    importHash(v.graphDigest) &&
    importTime(v.importedAt) &&
    typeof v.excluded === 'boolean' &&
    isGraphRecord(v.record) &&
    v.record.kind === 'conversation' &&
    v.record.eligible &&
    v.record.disposition === 'candidate' &&
    variants(v.variants, v.record.id) &&
    JSON.stringify(v).length <= 64000
  )
}
export function isExternalMessage(v: unknown): v is ExternalMessage {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'revisionId',
      'conversationId',
      'graphId',
      'sequence',
      'visibility',
      'orderRecordId',
      'record',
      'variants'
    ]) &&
    v.version === 1 &&
    [v.id, v.revisionId, v.conversationId, v.graphId].every(isId) &&
    uint(v.sequence, 49999) &&
    ['visible', 'excluded'].includes(String(v.visibility)) &&
    isGraphRecord(v.record) &&
    v.record.kind === 'message' &&
    v.record.disposition !== 'internal' &&
    v.record.texts.reduce((n, t) => n + t.units, 0) <= 1_000_000 &&
    (v.visibility === 'excluded' ||
      (v.record.eligible &&
        v.record.disposition === 'candidate' &&
        ['user', 'assistant'].includes(v.record.role ?? '') &&
        v.record.texts.some((t) => t.units > 0))) &&
    isId(v.orderRecordId) &&
    variants(v.variants, v.record.id) &&
    v.variants.includes(v.orderRecordId) &&
    JSON.stringify(v).length <= 64000
  )
}
export function historicalTime(r: GraphRecord): HistoricalTime {
  const fact = (name: string): string | null => {
    const value = r.facts.find((f) => f.name === name)?.value
    return value === undefined || value === 'null' ? null : value
  }
  const normalized = fact('historicalTime.normalizedUtc'),
    zone = fact('historicalTime.zoneKnown')
  return {
    raw: fact('historicalTime.raw') ?? fact('create_time') ?? fact('date'),
    normalizedUtc: normalized === 'unknown' ? null : normalized,
    precision: fact('historicalTime.precision'),
    zoneKnown: zone === 'true' ? true : zone === 'false' ? false : null
  }
}
export function originalFlag(r: GraphRecord, name: string): boolean | null {
  const v = r.facts.find((f) => f.name === name)?.value
  return v === 'true' ? true : v === 'false' ? false : null
}
export function transcriptRole(r: GraphRecord): TranscriptEntry['role'] {
  return ['user', 'assistant', 'system', 'developer', 'tool'].includes(r.role ?? '')
    ? (r.role as TranscriptEntry['role'])
    : 'unknown'
}
export function isTranscriptKey(v: unknown): v is TranscriptKey {
  return (
    record(v) &&
    exact(v, ['segment', 'sequence', 'messageId', 'messageRevision']) &&
    ['imported', 'native'].includes(String(v.segment)) &&
    uint(v.sequence) &&
    isId(v.messageId) &&
    isId(v.messageRevision)
  )
}
export function isTranscriptCursor(v: unknown): v is TranscriptCursor {
  return (
    record(v) &&
    exact(v, ['version', 'conversationId', 'revisionId', 'key']) &&
    v.version === 1 &&
    isId(v.conversationId) &&
    isId(v.revisionId) &&
    isTranscriptKey(v.key)
  )
}
export function isTranscriptSource(v: unknown): v is TranscriptSource {
  return (
    record(v) &&
    ((v.kind === 'accepted' &&
      exact(v, ['kind', 'conversationId', 'revisionId']) &&
      isId(v.conversationId) &&
      isId(v.revisionId)) ||
      (v.kind === 'staged' &&
        exact(v, ['kind', 'batchId', 'graphId', 'recordId']) &&
        [v.batchId, v.graphId, v.recordId].every(isId)))
  )
}
export function isTranscriptInput(v: Record<string, unknown>): boolean {
  const base = ['projectId', 'workspaceId', 'action', 'source']
  if (!isTranscriptSource(v.source)) return false
  if (v.action === 'transcript-read')
    return (
      exact(v, [...base, 'cursor', 'direction', 'target']) &&
      (v.cursor === null || isTranscriptCursor(v.cursor)) &&
      ['forward', 'backward'].includes(String(v.direction)) &&
      (v.target === null || isTranscriptKey(v.target)) &&
      !(v.cursor && v.target)
    )
  if (v.action === 'transcript-text')
    return (
      exact(v, [...base, 'target', 'offset']) &&
      isTranscriptKey(v.target) &&
      uint(v.offset, 20_000_000)
    )
  if (v.action === 'transcript-find')
    return (
      exact(v, [...base, 'query', 'after']) &&
      text(v.query, 160) &&
      !!v.query.trim() &&
      (v.after === null ||
        (record(v.after) &&
          exact(v.after, ['cursor', 'offset', 'query']) &&
          isTranscriptCursor(v.after.cursor) &&
          uint(v.after.offset, 20_000_000) &&
          v.after.query === v.query))
    )
  return false
}
function isHistoricalTime(v: unknown): v is HistoricalTime {
  return (
    record(v) &&
    exact(v, ['raw', 'normalizedUtc', 'precision', 'zoneKnown']) &&
    nullable(v.raw) &&
    nullable(v.normalizedUtc) &&
    nullable(v.precision) &&
    (v.zoneKnown === null || typeof v.zoneKnown === 'boolean')
  )
}
export function isTranscriptSummary(v: unknown): v is TranscriptSummary {
  return (
    record(v) &&
    exact(v, [
      'version',
      'importedAt',
      'historicalTime',
      'archivedInOriginal',
      'doNotRecallInOriginal',
      'excluded',
      'messages'
    ]) &&
    v.version === 1 &&
    importTime(v.importedAt) &&
    isHistoricalTime(v.historicalTime) &&
    [v.archivedInOriginal, v.doNotRecallInOriginal].every(
      (f) => f === null || typeof f === 'boolean'
    ) &&
    typeof v.excluded === 'boolean' &&
    uint(v.messages, 50000)
  )
}
function isEntry(v: unknown): v is TranscriptEntry {
  return (
    record(v) &&
    exact(v, [
      'key',
      'role',
      'originalRole',
      'historicalTime',
      'importedAt',
      'visibility',
      'text',
      'textUnits',
      'external',
      'native'
    ]) &&
    isTranscriptKey(v.key) &&
    ['user', 'assistant', 'system', 'developer', 'tool', 'unknown'].includes(String(v.role)) &&
    nullable(v.originalRole) &&
    isHistoricalTime(v.historicalTime) &&
    (v.importedAt === null || importTime(v.importedAt)) &&
    ['visible', 'excluded'].includes(String(v.visibility)) &&
    text(v.text, TRANSCRIPT_LIMITS.excerpt) &&
    uint(v.textUnits, 20_000_000) &&
    v.text.length <= v.textUnits &&
    (v.key.segment === 'imported'
      ? v.native === null &&
        record(v.external) &&
        exact(v.external, ['graphId', 'record', 'variants']) &&
        isId(v.external.graphId) &&
        isGraphRecord(v.external.record) &&
        v.external.record.kind === 'message' &&
        v.external.record.disposition !== 'internal' &&
        variants(v.external.variants, v.external.record.id)
      : v.external === null &&
        record(v.native) &&
        exact(v.native, ['attemptId', 'state', 'preparation']) &&
        isId(v.native.attemptId) &&
        text(v.native.state, 40) &&
        typeof v.native.preparation === 'boolean')
  )
}
export function isTranscriptValue(v: unknown): v is TranscriptValue {
  if (
    !record(v) ||
    v.version !== 1 ||
    !isTranscriptSource(v.source) ||
    JSON.stringify(v).length > TRANSCRIPT_LIMITS.reply
  )
    return false
  if (v.type === 'transcript')
    return (
      exact(v, [
        'type',
        'version',
        'source',
        'conversationId',
        'revisionId',
        'title',
        'entries',
        'total',
        'before',
        'after',
        'omittedInternal'
      ]) &&
      isId(v.conversationId) &&
      isId(v.revisionId) &&
      text(v.title, 256) &&
      Array.isArray(v.entries) &&
      v.entries.length <= TRANSCRIPT_LIMITS.page &&
      v.entries.every(isEntry) &&
      uint(v.total) &&
      uint(v.omittedInternal) &&
      (v.before === null || isTranscriptCursor(v.before)) &&
      (v.after === null || isTranscriptCursor(v.after))
    )
  if (v.type === 'transcript-matches')
    return (
      exact(v, ['type', 'version', 'source', 'query', 'items', 'next']) &&
      text(v.query, 160) &&
      Array.isArray(v.items) &&
      v.items.length <= 20 &&
      v.items.every(
        (i) =>
          record(i) &&
          exact(i, ['key', 'role', 'preview', 'offset']) &&
          isTranscriptKey(i.key) &&
          ['user', 'assistant', 'system', 'developer', 'tool', 'unknown'].includes(
            String(i.role)
          ) &&
          text(i.preview, 220) &&
          uint(i.offset, 20_000_000)
      ) &&
      (v.next === null ||
        (record(v.next) &&
          exact(v.next, ['cursor', 'offset', 'query']) &&
          isTranscriptCursor(v.next.cursor) &&
          uint(v.next.offset, 20_000_000) &&
          v.next.query === v.query))
    )
  if (v.type === 'transcript-text')
    return (
      exact(v, [
        'type',
        'version',
        'source',
        'target',
        'text',
        'offset',
        'total',
        'nextOffset',
        'mapping'
      ]) &&
      isTranscriptKey(v.target) &&
      text(v.text, TRANSCRIPT_LIMITS.slice) &&
      uint(v.offset, 20_000_000) &&
      uint(v.total, 20_000_000) &&
      v.offset + v.text.length <= v.total &&
      (v.nextOffset === null
        ? v.offset + v.text.length === v.total
        : v.nextOffset === v.offset + v.text.length &&
          Number(v.nextOffset) < v.total &&
          v.text.length > 0) &&
      Array.isArray(v.mapping) &&
      v.mapping.length <= 128 &&
      v.mapping.every(
        (m) =>
          record(m) &&
          exact(m, ['from', 'to', 'textId', 'originalFrom', 'originalTo']) &&
          [m.from, m.to, m.originalFrom, m.originalTo].every((n) => uint(n, 20_000_000)) &&
          (m.textId === null || isId(m.textId)) &&
          Number(m.to) > Number(m.from) &&
          Number(m.to) - Number(m.from) === Number(m.originalTo) - Number(m.originalFrom)
      )
    )
  return false
}
