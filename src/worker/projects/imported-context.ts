import type Database from 'better-sqlite3'
import type { OpenInput } from '../../shared/projects'
import type {
  ImportedContextMessage,
  ImportedMessageReference
} from '../../shared/imported-context'
import { ProjectError } from '../../domain/projects/errors'
import { externalOrigin, externalMessage, descendsFrom } from './external-conversations'
import { OriginalTranscriptText } from './conversation-transcript'
import { textDigest } from './import-readers/graph'

export type ImportedContext = Map<string, ImportedContextMessage[]>
/** Request-local, bounded original reads. Never cached as execution authority. */
export async function loadImportedContext(
  ctx: OpenInput & { db: Database.Database; root: string; workspace: string },
  current: string,
  extra: string[] = [],
  recall = true,
  excluded: string[] = []
): Promise<ImportedContext> {
  const result: ImportedContext = new Map()
  const candidates = recall
    ? (ctx.db
        .prepare(
          "SELECT c.id FROM conversations c JOIN external_conversations e ON e.project_id=c.project_id AND e.conversation_id=c.id WHERE c.project_id=? AND c.state='active' AND json_extract(e.body,'$.excluded')=0 ORDER BY c.updated_at DESC,c.id LIMIT 16"
        )
        .all(ctx.projectId) as { id: string }[])
    : []
  let budget = 260000
  for (const id of [...new Set([current, ...extra, ...candidates.map((c) => c.id)])].slice(0, 25)) {
    const origin = externalOrigin(ctx.db, ctx.projectId, id)
    if (!origin || origin.excluded || excluded.includes(id)) continue
    const rows = ctx.db
      .prepare(
        'SELECT id FROM external_messages WHERE project_id=? AND conversation_id=? ORDER BY sequence DESC LIMIT ?'
      )
      .all(ctx.projectId, id, id === current ? 512 : 40) as { id: string }[]
    const reader = new OriginalTranscriptText(ctx, origin.batchId)
    const messages: ImportedContextMessage[] = []
    let used = 0
    for (const row of rows) {
      const m = externalMessage(ctx.db, ctx.projectId, row.id),
        r = m.record
      const size = r.texts.reduce((n, t) => n + t.units, 0)
      if (
        m.visibility !== 'visible' ||
        (r.role !== 'user' && r.role !== 'assistant') ||
        !r.eligible ||
        size === 0 ||
        size > 36000 ||
        used + size > (id === current ? 24000 : 8000) ||
        size > budget ||
        messages.length >= (id === current ? 32 : 16)
      )
        continue
      const text = await reader.read(r)
      if (text.includes('\0')) continue
      messages.push({
        version: 1,
        conversationId: id,
        id: m.id,
        revision: m.revisionId,
        graphId: m.graphId,
        recordId: r.id,
        sequence: m.sequence,
        role: r.role,
        originalRole: r.facts.find((f) => f.name === 'role')?.value ?? r.role,
        start: 0,
        end: text.length,
        text
      })
      used += size
      budget -= size
    }
    result.set(id, messages.reverse())
  }
  return result
}
export function validateImportedReference(
  db: Database.Database,
  p: string,
  ref: ImportedMessageReference,
  text?: string,
  head?: string
): void {
  const m = externalMessage(db, p, ref.id),
    r = m.record
  if (
    m.conversationId !== ref.conversationId ||
    m.revisionId !== ref.revision ||
    m.graphId !== ref.graphId ||
    r.id !== ref.recordId ||
    m.sequence !== ref.sequence ||
    m.visibility !== 'visible' ||
    !r.eligible ||
    r.role !== ref.role ||
    (r.facts.find((f) => f.name === 'role')?.value ?? r.role) !== ref.originalRole ||
    ref.start !== 0 ||
    ref.end !== r.texts.reduce((n, t) => n + t.units, 0)
  )
    throw new ProjectError('CORRUPT_PROJECT')
  if (head) {
    const origin = externalOrigin(db, p, m.conversationId)
    if (!origin || !descendsFrom(db, p, head, origin.commitId))
      throw new ProjectError('CORRUPT_PROJECT')
  }
  if (text !== undefined) {
    let offset = 0
    for (const part of r.texts) {
      if (textDigest(text.slice(offset, offset + part.units)) !== part.sha256)
        throw new ProjectError('CORRUPT_PROJECT')
      offset += part.units
    }
    if (offset !== text.length) throw new ProjectError('CORRUPT_PROJECT')
  }
}
