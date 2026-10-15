import type Database from 'better-sqlite3'
import type { OpenInput } from '../../shared/projects'
import { isNotePassage, type NotePassage, type PassageSelection } from '../../shared/note-passage'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../storage/digest'
import { OriginalTranscriptText } from './conversation-transcript'
import { externalMessage, externalOrigin } from './external-conversations'
import { textBoundary } from './import-readers/graph'
import type { AiCapture } from '../../shared/conversations'

type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
/** Resolve only retained canonical text. Imported AI recall is deliberately not involved. */
export async function resolveNotePassage(ctx: Context, p: PassageSelection): Promise<NotePassage> {
  const c = ctx.db
    .prepare('SELECT title,revision_id FROM conversations WHERE project_id=? AND id=?')
    .get(ctx.projectId, p.conversationId) as { title: string; revision_id: string } | undefined
  if (!c || c.revision_id !== p.conversationRevisionId) throw new ProjectError('STALE_REVISION')
  let text: string,
    role: string,
    attemptId: string | null = null
  if (p.key.segment === 'imported') {
    const origin = externalOrigin(ctx.db, ctx.projectId, p.conversationId),
      m = externalMessage(ctx.db, ctx.projectId, p.key.messageId)
    if (
      !origin ||
      m.conversationId !== p.conversationId ||
      m.revisionId !== p.key.messageRevision ||
      m.sequence !== p.key.sequence ||
      m.visibility !== 'visible'
    )
      throw new ProjectError('STALE_REVISION')
    text = await new OriginalTranscriptText(ctx, origin.batchId).read(m.record)
    role = m.record.facts.find((f) => f.name === 'role')?.value ?? m.record.role ?? 'Unknown author'
  } else {
    const m = ctx.db
      .prepare('SELECT * FROM conversation_messages WHERE project_id=? AND id=?')
      .get(ctx.projectId, p.key.messageId) as
      | {
          conversation_id: string
          revision_id: string
          ordinal: number
          text: string
          role: string
          attempt_id: string
        }
      | undefined
    if (
      !m ||
      m.conversation_id !== p.conversationId ||
      m.revision_id !== p.key.messageRevision ||
      m.ordinal !== p.key.sequence
    )
      throw new ProjectError('STALE_REVISION')
    const attempt = ctx.db
      .prepare('SELECT body FROM conversation_attempts WHERE project_id=? AND id=?')
      .get(ctx.projectId, m.attempt_id) as { body: string }
    const captureRow = ctx.db
      .prepare(
        'SELECT c.body FROM ai_captures c JOIN conversation_attempts a ON a.project_id=c.project_id AND a.capture_id=c.id WHERE a.project_id=? AND a.id=?'
      )
      .get(ctx.projectId, m.attempt_id) as { body: string }
    const capture = JSON.parse(captureRow.body) as AiCapture
    if (
      (capture.version === 3 || capture.version === 4 || capture.version === 6) &&
      capture.purpose !== 'chat'
    )
      throw new ProjectError('VALIDATION')
    if (m.role === 'assistant' && JSON.parse(attempt.body).state !== 'completed')
      throw new ProjectError('STALE_REVISION')
    text = m.text
    role = m.role
    attemptId = m.attempt_id
  }
  if (
    p.end > text.length ||
    textBoundary(text, p.start) !== p.start ||
    textBoundary(text, p.end) !== p.end ||
    text.slice(p.start, p.end) !== p.quote
  )
    throw new ProjectError('STALE_REVISION')
  const passage: NotePassage = { ...p, version: 1, conversationTitle: c.title, role, attemptId }
  if (!isNotePassage(passage)) throw new ProjectError('VALIDATION')
  return passage
}

/** Immutable origins survive note edits, trash, outline restore and independent project copies. */
export function validatePortablePassages(db: Database.Database, projectId: string): void {
  if (
    db
      .prepare(
        "SELECT 1 FROM notes n LEFT JOIN note_passages p ON p.project_id=n.project_id AND p.note_id=n.id WHERE n.project_id=? AND n.origin='chat-passage-v1' AND p.note_id IS NULL LIMIT 1"
      )
      .get(projectId)
  )
    throw new ProjectError('CORRUPT_PROJECT')
  for (const row of db.prepare('SELECT * FROM note_passages').iterate() as Iterable<{
    project_id: string
    note_id: string
    body: string
  }>) {
    if (row.body.length > 160_000) throw new ProjectError('CORRUPT_PROJECT')
    const p: unknown = JSON.parse(row.body)
    if (
      row.project_id !== projectId ||
      !isNotePassage(p) ||
      !db
        .prepare("SELECT 1 FROM notes WHERE project_id=? AND id=? AND origin='chat-passage-v1'")
        .get(projectId, row.note_id) ||
      !db
        .prepare('SELECT 1 FROM conversations WHERE project_id=? AND id=?')
        .get(projectId, p.conversationId)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    if (p.key.segment === 'imported') {
      const m = externalMessage(db, projectId, p.key.messageId)
      if (
        m.conversationId !== p.conversationId ||
        m.sequence !== p.key.sequence ||
        m.revisionId !== p.key.messageRevision ||
        p.role !==
          (m.record.facts.find((f) => f.name === 'role')?.value ??
            m.record.role ??
            'Unknown author') ||
        p.end > m.record.texts.reduce((n, t) => n + t.units, 0)
      )
        throw new ProjectError('CORRUPT_PROJECT')
    } else {
      const m = db
        .prepare(
          'SELECT conversation_id,attempt_id,revision_id,ordinal,role,text FROM conversation_messages WHERE project_id=? AND id=?'
        )
        .get(projectId, p.key.messageId) as
        | {
            conversation_id: string
            attempt_id: string
            revision_id: string
            ordinal: number
            role: string
            text: string
          }
        | undefined
      if (
        !m ||
        m.conversation_id !== p.conversationId ||
        m.attempt_id !== p.attemptId ||
        m.revision_id !== p.key.messageRevision ||
        m.ordinal !== p.key.sequence ||
        m.role !== p.role ||
        m.text.slice(p.start, p.end) !== p.quote
      )
        throw new ProjectError('CORRUPT_PROJECT')
    }
  }
}

/** Admission resolves imported spans from hash-checked managed originals, beyond AI recall limits. */
export async function validatePassageOriginals(ctx: Omit<Context, 'workspaceId'>): Promise<void> {
  const version = (
    ctx.db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as {
      v: number
    }
  ).v
  if (version < 41) return
  let batchId = ''
  let reader: OriginalTranscriptText | null = null
  for (const row of ctx.db
    .prepare(
      "SELECT body FROM note_passages WHERE project_id=? AND json_extract(body,'$.key.segment')='imported' ORDER BY json_extract(body,'$.conversationId'),json_extract(body,'$.key.messageId')"
    )
    .iterate(ctx.projectId) as Iterable<{ body: string }>) {
    const p: NotePassage = JSON.parse(row.body),
      origin = externalOrigin(ctx.db, ctx.projectId, p.conversationId),
      message = externalMessage(ctx.db, ctx.projectId, p.key.messageId)
    if (!origin) throw new ProjectError('CORRUPT_PROJECT')
    if (!reader || batchId !== origin.batchId) {
      batchId = origin.batchId
      reader = new OriginalTranscriptText(ctx, batchId)
    }
    const text = await reader.read(message.record)
    if (
      p.end > text.length ||
      textBoundary(text, p.start) !== p.start ||
      textBoundary(text, p.end) !== p.end ||
      text.slice(p.start, p.end) !== p.quote
    )
      throw new ProjectError('CORRUPT_PROJECT')
  }
}

export function readNotePassage(
  db: Database.Database,
  projectId: string,
  noteId: string
): NotePassage | undefined {
  const row = db
    .prepare('SELECT body FROM note_passages WHERE project_id=? AND note_id=?')
    .get(projectId, noteId) as { body: string } | undefined
  if (!row) return undefined
  const p: unknown = JSON.parse(row.body)
  if (!isNotePassage(p)) throw new ProjectError('CORRUPT_PROJECT')
  return p
}

export function samePassage(a: NotePassage, b: PassageSelection): boolean {
  return (
    requestDigest({
      conversationId: a.conversationId,
      conversationRevisionId: a.conversationRevisionId,
      key: a.key,
      start: a.start,
      end: a.end,
      quote: a.quote
    }) === requestDigest(b)
  )
}
