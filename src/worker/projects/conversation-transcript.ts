import type Database from 'better-sqlite3'
import type { OpenInput } from '../../shared/projects'
import type {
  Conversation,
  ConversationMessage,
  ConversationTurn
} from '../../shared/conversations'
import type { ImportFile } from '../../shared/project-import'
import { IMPORT_LIMITS } from '../../shared/project-import'
import type { GraphRecord } from '../../shared/import-graph'
import {
  TRANSCRIPT_LIMITS,
  historicalTime,
  transcriptRole,
  type TranscriptInput,
  type TranscriptSource,
  type TranscriptEntry,
  type TranscriptKey,
  type TranscriptCursor,
  type TranscriptValue
} from '../../shared/conversation-transcript'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../storage/digest'
import { externalOrigin, externalMessage } from './external-conversations'
import { readImportBlob } from './import-graphs'
import { parseInputJson, valueAt } from './import-readers/json'
import { textBoundary, textDigest } from './import-readers/graph'

type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
export type NativeTranscriptReaders = {
  conversation: (id: string) => Conversation
  message: (id: string) => ConversationMessage
  turn: (id: string) => ConversationTurn
}
type Loaded = {
  id: string
  revision: string
  title: string
  keys: TranscriptKey[]
  omittedInternal: number
  entry: (key: TranscriptKey) => Promise<TranscriptEntry>
  fullText: (key: TranscriptKey) => Promise<{ text: string; record: GraphRecord | null }>
}
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
const stale = (): never => {
  throw new ProjectError('STALE_REVISION')
}
const sameKey = (a: TranscriptKey, b: TranscriptKey): boolean =>
  requestDigest(a) === requestDigest(b)
const units = (r: GraphRecord): number => r.texts.reduce((n, t) => n + t.units, 0)
/** One bounded original-file decode and one message body cached per read request. */
export class OriginalTranscriptText {
  private cached: { id: string; hash: string; value: unknown } | null = null
  private message: { id: string; digest: string; text: string } | null = null
  constructor(
    private readonly ctx: Context,
    private readonly batchId: string
  ) {}
  async read(r: GraphRecord): Promise<string> {
    if (r.disposition === 'internal' || units(r) > 20_000_000) return corrupt()
    const digest = requestDigest(r.texts)
    if (this.message?.id === r.id && this.message.digest === digest) return this.message.text
    const parts: string[] = []
    for (const t of r.texts) {
      if (this.cached?.id !== t.locator.fileId || this.cached.hash !== t.locator.sha256) {
        const row = this.ctx.db
          .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
          .get(this.ctx.projectId, this.batchId, t.locator.fileId) as { body: string } | undefined
        if (!row) return corrupt()
        const file = JSON.parse(row.body) as ImportFile
        if (file.sha256 !== t.locator.sha256) return corrupt()
        let decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          await readImportBlob(this.ctx, file, IMPORT_LIMITS.fileBytes)
        )
        if (decoded.startsWith('\uFEFF')) decoded = decoded.slice(1)
        this.cached = {
          id: file.id,
          hash: file.sha256,
          value: file.mediaType === 'application/json' ? parseInputJson(decoded).value : decoded
        }
      }
      const field = valueAt(this.cached.value, t.locator.pointer)
      if (
        typeof field !== 'string' ||
        t.end > field.length ||
        textBoundary(field, t.start) !== t.start ||
        textBoundary(field, t.end) !== t.end
      )
        return corrupt()
      const text = field.slice(t.start, t.end)
      if (text.length !== t.units || textDigest(text) !== t.sha256) return corrupt()
      parts.push(text)
    }
    const text = parts.join('')
    this.message = { id: r.id, digest, text }
    return text
  }
}
function externalEntry(
  key: TranscriptKey,
  r: GraphRecord,
  graphId: string,
  variants: string[],
  importedAt: string | null,
  visibility: TranscriptEntry['visibility'],
  text: string
): TranscriptEntry {
  return {
    key,
    role: transcriptRole(r),
    originalRole: r.facts.find((f) => f.name === 'role')?.value ?? r.role,
    historicalTime: historicalTime(r),
    importedAt,
    visibility,
    text: text.slice(0, textBoundary(text, Math.min(text.length, TRANSCRIPT_LIMITS.excerpt))),
    textUnits: text.length,
    external: { graphId, record: r, variants },
    native: null
  }
}
async function load(
  ctx: Context,
  source: TranscriptSource,
  native: NativeTranscriptReaders
): Promise<Loaded> {
  const c = native.conversation(source.conversationId)
  if (c.revisionId !== source.revisionId) return stale()
  const origin = externalOrigin(ctx.db, ctx.projectId, c.id),
    keys: TranscriptKey[] = []
  if (origin)
    for (const r of ctx.db
      .prepare(
        "SELECT id,sequence,json_extract(body,'$.revisionId') AS revision FROM external_messages WHERE project_id=? AND conversation_id=? ORDER BY sequence LIMIT 50001"
      )
      .iterate(ctx.projectId, c.id) as Iterable<{ id: string; sequence: number; revision: string }>)
      keys.push({
        segment: 'imported',
        sequence: r.sequence,
        messageId: r.id,
        messageRevision: r.revision
      })
  if (keys.length > 50000) return corrupt()
  for (const r of ctx.db
    .prepare(
      'SELECT id,ordinal,revision_id FROM conversation_messages WHERE project_id=? AND conversation_id=? ORDER BY ordinal LIMIT 100002'
    )
    .iterate(ctx.projectId, c.id) as Iterable<{ id: string; ordinal: number; revision_id: string }>)
    keys.push({
      segment: 'native',
      sequence: r.ordinal,
      messageId: r.id,
      messageRevision: r.revision_id
    })
  if (keys.length > 150001) return corrupt()
  const reader = origin ? new OriginalTranscriptText(ctx, origin.batchId) : null
  const get = (key: TranscriptKey): GraphRecord | null => {
    if (key.segment === 'native') return null
    const m = externalMessage(ctx.db, ctx.projectId, key.messageId)
    if (
      !origin ||
      m.conversationId !== c.id ||
      m.sequence !== key.sequence ||
      m.revisionId !== key.messageRevision
    )
      return stale()
    return m.record
  }
  return {
    id: c.id,
    revision: c.revisionId,
    title: c.title,
    keys,
    omittedInternal: 0,
    entry: async (key) => {
      const r = get(key)
      if (r) {
        const m = externalMessage(ctx.db, ctx.projectId, key.messageId)
        return externalEntry(
          key,
          r,
          origin!.graphId,
          m.variants,
          origin!.importedAt,
          m.visibility,
          await reader!.read(r)
        )
      }
      const m = native.message(key.messageId)
      if (
        m.conversationId !== c.id ||
        m.revisionId !== key.messageRevision ||
        m.ordinal !== key.sequence
      )
        return stale()
      const t = native.turn(m.attemptId)
      return {
        key,
        role: m.role,
        originalRole: m.role,
        historicalTime: {
          raw: m.createdAt,
          normalizedUtc: m.createdAt,
          precision: 'Collie timestamp (milliseconds)',
          zoneKnown: true
        },
        importedAt: null,
        visibility: 'visible',
        text: m.text.slice(
          0,
          textBoundary(m.text, Math.min(m.text.length, TRANSCRIPT_LIMITS.excerpt))
        ),
        textUnits: m.text.length,
        external: null,
        native: {
          attemptId: m.attemptId,
          state: t.attempt.state,
          preparation:
            (t.capture.version === 3 || t.capture.version === 4 || t.capture.version === 6) &&
            t.capture.purpose !== 'chat'
        }
      }
    },
    fullText: async (key) => {
      const record = get(key)
      if (record) return { text: await reader!.read(record), record }
      const m = native.message(key.messageId)
      if (
        m.conversationId !== c.id ||
        m.revisionId !== key.messageRevision ||
        m.ordinal !== key.sequence
      )
        return stale()
      return { text: m.text, record: null }
    }
  }
}
export async function transcriptCommand(
  ctx: Context,
  input: TranscriptInput,
  native: NativeTranscriptReaders
): Promise<TranscriptValue> {
  const loaded = await load(ctx, input.source, native)
  const cursor = (key: TranscriptKey): TranscriptCursor => ({
    version: 1,
    conversationId: loaded.id,
    revisionId: loaded.revision,
    key
  })
  const locate = (key: TranscriptKey): number => {
    const i = loaded.keys.findIndex((k) => sameKey(k, key))
    if (i < 0) return stale()
    return i
  }
  const check = (c: TranscriptCursor): number => {
    if (c.conversationId !== loaded.id || c.revisionId !== loaded.revision) return stale()
    return locate(c.key)
  }
  if (input.action === 'transcript-read') {
    const at = input.target ? locate(input.target) : input.cursor ? check(input.cursor) : null
    let index =
      at === null
        ? input.direction === 'forward'
          ? 0
          : loaded.keys.length - 1
        : input.target
          ? at
          : at + (input.direction === 'forward' ? 1 : -1)
    const entries: TranscriptEntry[] = []
    let first = -1,
      last = -1
    while (index >= 0 && index < loaded.keys.length && entries.length < TRANSCRIPT_LIMITS.page) {
      const entry = await loaded.entry(loaded.keys[index])
      if (JSON.stringify(entries).length + JSON.stringify(entry).length > 90000) break
      if (input.direction === 'forward') entries.push(entry)
      else entries.unshift(entry)
      first = first < 0 ? index : Math.min(first, index)
      last = Math.max(last, index)
      index += input.direction === 'forward' ? 1 : -1
    }
    return {
      type: 'transcript',
      version: 1,
      source: input.source,
      conversationId: loaded.id,
      revisionId: loaded.revision,
      title: loaded.title,
      entries,
      total: loaded.keys.length,
      before: first > 0 ? cursor(loaded.keys[first]) : null,
      after: last >= 0 && last < loaded.keys.length - 1 ? cursor(loaded.keys[last]) : null,
      omittedInternal: loaded.omittedInternal
    }
  }
  if (input.action === 'transcript-text') {
    locate(input.target)
    const { text, record } = await loaded.fullText(input.target)
    if (input.offset > text.length || textBoundary(text, input.offset) !== input.offset)
      return stale()
    const end = textBoundary(text, Math.min(text.length, input.offset + TRANSCRIPT_LIMITS.slice))
    const mapping: Extract<TranscriptValue, { type: 'transcript-text' }>['mapping'] = []
    if (record) {
      let at = 0
      for (const part of record.texts) {
        const from = Math.max(at, input.offset),
          to = Math.min(at + part.units, end)
        if (to > from)
          mapping.push({
            from,
            to,
            textId: part.id,
            originalFrom: part.start + from - at,
            originalTo: part.start + to - at
          })
        at += part.units
      }
    } else if (end > input.offset)
      mapping.push({
        from: input.offset,
        to: end,
        textId: null,
        originalFrom: input.offset,
        originalTo: end
      })
    return {
      type: 'transcript-text',
      version: 1,
      source: input.source,
      target: input.target,
      text: text.slice(input.offset, end),
      offset: input.offset,
      total: text.length,
      nextOffset: end < text.length ? end : null,
      mapping
    }
  }
  let index = input.after ? check(input.after.cursor) : 0,
    offset = input.after?.offset ?? 0,
    scanned = 0
  const items: Extract<TranscriptValue, { type: 'transcript-matches' }>['items'] = []
  const query = input.query.trim(),
    pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu')
  while (index < loaded.keys.length && scanned < 32 && items.length < 20) {
    const key = loaded.keys[index],
      entry = await loaded.entry(key),
      { text } = await loaded.fullText(key)
    if (offset > text.length || textBoundary(text, offset) !== offset) return stale()
    if (entry.visibility === 'excluded' || entry.native?.preparation || offset === text.length) {
      index++
      offset = 0
      scanned++
      continue
    }
    const end = textBoundary(text, Math.min(text.length, offset + TRANSCRIPT_LIMITS.slice)),
      match = pattern.exec(text.slice(offset, end))
    scanned++
    if (match) {
      const found = offset + match.index
      items.push({
        key,
        role: entry.role,
        offset: found,
        preview: text
          .slice(Math.max(0, found - 60), found + 150)
          .replace(/\s+/gu, ' ')
          .slice(0, 220)
      })
      index++
      offset = 0
    } else if (end === text.length) {
      index++
      offset = 0
    } else offset = textBoundary(text, Math.max(offset + 1, end - query.length + 1))
  }
  return {
    type: 'transcript-matches',
    version: 1,
    source: input.source,
    query: input.query,
    items,
    next:
      index < loaded.keys.length
        ? { cursor: cursor(loaded.keys[index]), offset, query: input.query }
        : null
  }
}

/** Existing export owner supplies the byte budget and destination. Imported records never get live outcome labels. */
export async function appendExternalTranscript(
  ctx: Context,
  conversationId: string,
  append: (text: string) => void
): Promise<void> {
  const origin = externalOrigin(ctx.db, ctx.projectId, conversationId)
  if (!origin) return
  const reader = new OriginalTranscriptText(ctx, origin.batchId)
  append(
    `\nImported history · imported ${origin.importedAt}\nThis text export includes original identity records but cannot carry managed original files, all graph relationships, live source navigation or executable state. Save a .collie file to retain the supported graph.\nOriginal conversation evidence\n${JSON.stringify(origin, null, 2)}\n`
  )
  for (const row of ctx.db
    .prepare(
      'SELECT id FROM external_messages WHERE project_id=? AND conversation_id=? ORDER BY sequence'
    )
    .iterate(ctx.projectId, conversationId) as Iterable<{ id: string }>) {
    const m = externalMessage(ctx.db, ctx.projectId, row.id),
      text = await reader.read(m.record),
      key: TranscriptKey = {
        segment: 'imported',
        sequence: m.sequence,
        messageId: m.id,
        messageRevision: m.revisionId
      }
    const entry = externalEntry(
      key,
      m.record,
      origin.graphId,
      m.variants,
      origin.importedAt,
      m.visibility,
      text
    )
    append(
      `\nExternal ${entry.originalRole ?? 'unknown role'} · historical time ${entry.historicalTime.raw ?? 'not supplied'} · ${entry.visibility}\n${text}\n`
    )
    append(
      `Origin and variants (unverified external material; identity display mapping)\n${JSON.stringify(m, null, 2)}\n`
    )
  }
  append('\nEnd of immutable imported prefix. Any following messages are native Collie history.\n')
}
