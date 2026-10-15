import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import {
  PLANNING_ANALYSIS,
  type PlanningScope,
  type PlanningOrigin
} from '../../shared/planning-conversation'
import { MATERIAL_KINDS, type MaterialTarget } from '../../shared/chapter-material'
import { requestDigest } from '../storage/digest'
import { materialSql, type MaterialRow } from './material-reader'
import { effectiveState } from '../../shared/outline'
import { materialScopes, materialDocuments } from './chapter-material'
import { readKnowledgeSettings } from './conversation-knowledge'
import { externalMessage, externalOrigin } from './external-conversations'
import { OriginalTranscriptText } from './conversation-transcript'
import { conversationOverview } from './conversation-overview'
import { textBoundary } from './import-readers/graph'

export type PlanningContext = {
  db: Database.Database
  projectId: string
  workspaceId: string
  root: string
  workspace: string
}
type Part = Omit<PlanningOrigin, 'start' | 'end' | 'total'> & {
  text: string
  known?: PlanningOrigin[]
}
export type PlanningCorpus = {
  label: string
  chunks: PlanningOrigin[][]
  prefixes: string[]
  total: number
  eligible: number
  excluded: number
  unreadable: number
  omitted: number
  partial: string[]
  snapshot: string
  structure: string
}
function noteText(body: string): string {
  const out: string[] = []
  const visit = (node: { text?: string; content?: (typeof node)[] }): void => {
    if (node.text) out.push(node.text)
    node.content?.forEach(visit)
    if (['paragraph', 'heading'].includes((node as { type?: string }).type ?? '')) out.push('\n')
  }
  visit((JSON.parse(body) as { ast: Parameters<typeof visit>[0] }).ast)
  return out.join('')
}
async function* parts(
  ctx: PlanningContext,
  row: MaterialRow,
  known?: Map<string, PlanningOrigin[]>
): AsyncGenerator<Part> {
  const { db, projectId: p } = ctx
  const base: Part = {
    kind: row.kind,
    id: row.id,
    title: row.title.slice(0, 200),
    revision: row.id,
    part: 'note',
    partId: row.id,
    versionId: null,
    key: null,
    page: null,
    role: '',
    text: ''
  }
  if (row.kind === 'note') {
    const n = db
      .prepare('SELECT revision_id,body,origin FROM notes WHERE project_id=? AND id=?')
      .get(p, row.id) as { revision_id: string; body: string; origin: string }
    yield {
      ...base,
      revision: n.revision_id,
      role: n.origin === 'human' ? 'Human note' : 'Retained note; may include AI discussion',
      text: noteText(n.body)
    }
  } else if (row.kind === 'excerpt') {
    const e = db
      .prepare('SELECT quote,version_id FROM source_excerpts WHERE project_id=? AND id=?')
      .get(p, row.id) as { quote: string; version_id: string }
    yield {
      ...base,
      part: 'excerpt',
      versionId: e.version_id,
      text: e.quote,
      role: 'Saved excerpt; check its original source'
    }
  } else if (row.kind === 'source') {
    const s = db
      .prepare('SELECT revision_id,metadata FROM sources WHERE project_id=? AND id=?')
      .get(p, row.id) as { revision_id: string; metadata: string }
    yield {
      ...base,
      part: 'metadata',
      revision: s.revision_id,
      text: s.metadata,
      role: 'Bibliographic metadata only; no page fetch or verification'
    }
    for (const page of db
      .prepare(
        "SELECT v.id,p.page_index,p.text,p.text_hash FROM source_version_selections selected JOIN source_versions v ON v.project_id=selected.project_id AND v.id=selected.version_id JOIN source_attachments a ON a.project_id=v.project_id AND a.id=v.attachment_id JOIN source_pages p ON p.project_id=v.project_id AND p.version_id=v.id WHERE selected.project_id=? AND selected.source_id=? AND a.state='active' AND p.state='text' ORDER BY p.page_index"
      )
      .iterate(p, row.id) as Iterable<{
      id: string
      page_index: number
      text: string
      text_hash: string
    }>)
      yield {
        ...base,
        part: 'page',
        versionId: page.id,
        page: page.page_index,
        revision: page.text_hash,
        text: page.text,
        role: 'Locally extracted source text; not independently verified'
      }
  } else {
    const origin = externalOrigin(db, p, row.id)
    if (origin) {
      const reader = new OriginalTranscriptText(ctx, origin.batchId)
      for (const message of db
        .prepare(
          'SELECT id FROM external_messages WHERE project_id=? AND conversation_id=? ORDER BY sequence'
        )
        .iterate(p, row.id) as Iterable<{ id: string }>) {
        const m = externalMessage(db, p, message.id),
          r = m.record
        if (
          m.visibility !== 'visible' ||
          !r.eligible ||
          !['user', 'assistant'].includes(r.role ?? '')
        )
          continue
        yield {
          ...base,
          part: 'imported',
          partId: m.id,
          revision: m.revisionId,
          key: {
            segment: 'imported',
            sequence: m.sequence,
            messageId: m.id,
            messageRevision: m.revisionId
          },
          role: (r.facts.find((f) => f.name === 'role')?.value ?? r.role ?? 'Unknown').slice(
            0,
            500
          ),
          ...(known?.has(m.id) &&
          known.get(m.id)![0].revision === m.revisionId &&
          known.get(m.id)![0].total === r.texts.reduce((n, t) => n + t.units, 0)
            ? { text: '', known: known.get(m.id) }
            : { text: await reader.read(r) })
        }
      }
    }
    for (const m of db
      .prepare(
        "SELECT m.id,m.revision_id,m.ordinal,m.role,m.text FROM conversation_messages m JOIN conversation_attempts a ON a.project_id=m.project_id AND a.id=m.attempt_id JOIN ai_captures c ON c.project_id=a.project_id AND c.id=a.capture_id WHERE m.project_id=? AND m.conversation_id=? AND json_extract(a.body,'$.state')='completed' AND coalesce(json_extract(c.body,'$.purpose'),'chat')='chat' ORDER BY m.ordinal"
      )
      .iterate(p, row.id) as Iterable<{
      id: string
      revision_id: string
      ordinal: number
      role: string
      text: string
    }>)
      yield {
        ...base,
        part: 'native',
        partId: m.id,
        revision: m.revision_id,
        key: {
          segment: 'native',
          sequence: m.ordinal,
          messageId: m.id,
          messageRevision: m.revision_id
        },
        role: m.role,
        text: m.text
      }
  }
}
export async function planningCorpus(
  ctx: PlanningContext,
  chat: string,
  scope: PlanningScope,
  previous?: PlanningCorpus
): Promise<PlanningCorpus> {
  const { db, projectId: p } = ctx
  const known = new Map<string, PlanningOrigin[]>()
  for (const ref of previous?.chunks.flat() ?? [])
    if (ref.part === 'imported') known.set(ref.partId, [...(known.get(ref.partId) ?? []), ref])
  const settings = readKnowledgeSettings(db, p, chat),
    excluded = new Set(settings.excluded.map((t) => `${t.kind}:${t.id}`))
  const scopes = scope.kind === 'chapter' ? materialScopes(db, p, scope.id) : []
  const overview = JSON.parse(conversationOverview(db, p)) as {
    outline: { id: string }[]
    includedOutlineItems: number
  }
  overview.outline = overview.outline.filter((d) => !excluded.has(`document:${d.id}`))
  overview.includedOutlineItems = overview.outline.length
  let label = 'Project material',
    structure = JSON.stringify(overview)
  if (scope.kind === 'topic') {
    const t = db
      .prepare('SELECT title FROM planning_topics WHERE project_id=? AND id=?')
      .get(p, scope.id) as { title: string } | undefined
    if (!t) throw new ProjectError('NOT_FOUND')
    label = `Topic: ${t.title}`
  } else if (scope.kind === 'chapter') {
    const docs = materialDocuments(db, p),
      doc = docs.find((d) => d.id === scope.id)
    if (!doc || effectiveState(doc, docs) !== 'active') throw new ProjectError('STALE_REVISION')
    const d = db
      .prepare('SELECT title,synopsis FROM documents WHERE project_id=? AND id=?')
      .get(p, scope.id) as { title: string; synopsis: string }
    label = `Chapter: ${d.title}`
    structure = JSON.stringify({
      chapter: excluded.has(`document:${scope.id}`)
        ? null
        : { title: d.title, synopsis: d.synopsis.slice(0, 4000) },
      overview: JSON.parse(structure)
    })
  } else if (scope.kind === 'selection') label = `${scope.items.length} selected items`
  const result: PlanningCorpus = {
    label: label.slice(0, 200),
    chunks: [],
    prefixes: [],
    total: 0,
    eligible: 0,
    excluded: 0,
    unreadable: 0,
    omitted: 0,
    partial: [],
    snapshot: '',
    structure
  }
  let origins = 0,
    batch: PlanningOrigin[] = [],
    size = 0
  const complete = (): void => {
    if (batch.length) {
      result.chunks.push(batch)
      batch = []
      size = 0
    }
  }
  for (const kind of MATERIAL_KINDS) {
    const sql = materialSql(kind),
      params: Record<string, string | number> = { p },
      filters = ['t.project_id=@p']
    if (scope.kind === 'topic') {
      params.topic = scope.id
      filters.push(
        `EXISTS(SELECT 1 FROM planning_topic_members l WHERE l.project_id=t.project_id AND l.topic_id=@topic AND l.material_kind='${kind}' AND l.material_id=t.id)`
      )
    }
    if (scope.kind === 'chapter') {
      scopes.forEach((s, i) => {
        params[`d${i}`] = s.id
      })
      filters.push(
        `EXISTS(SELECT 1 FROM ${sql.links} l WHERE l.project_id=t.project_id AND l.${sql.column}=t.id AND l.document_id IN (${scopes.map((_, i) => `@d${i}`).join(',')}))`
      )
    }
    if (scope.kind === 'selection') {
      const ids = scope.items.filter((i) => i.kind === kind).map((i) => i.id)
      if (!ids.length) continue
      ids.forEach((id, i) => {
        params[`id${i}`] = id
      })
      filters.push(`t.id IN (${ids.map((_, i) => `@id${i}`).join(',')})`)
    }
    // Keyset pages cover the scope, independently of visible cards and recency.
    let after = ''
    while (true) {
      const rows = db
        .prepare(
          `SELECT '${kind}' AS kind,t.id,${sql.title} AS title,${sql.state} AS state FROM ${sql.from} WHERE ${filters.join(' AND ')} AND t.id>@after ORDER BY t.id LIMIT 100`
        )
        .all({ ...params, after }) as MaterialRow[]
      if (!rows.length) break
      after = rows[rows.length - 1].id
      for (const row of rows) {
        result.total++
        const disposition = db
          .prepare(
            'SELECT state,reason FROM planning_dispositions WHERE project_id=? AND material_kind=? AND material_id=?'
          )
          .get(p, kind, row.id) as { state: string; reason: string } | undefined
        let blocked =
          row.state !== 'active' ||
          disposition?.state === 'aside' ||
          excluded.has(`${kind}:${row.id}`) ||
          (kind === 'chat' && (row.id === chat || externalOrigin(db, p, row.id)?.excluded === true))
        if (kind === 'excerpt') {
          const e = db
            .prepare(
              "SELECT v.source_id FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id JOIN source_attachments a ON a.project_id=v.project_id AND a.id=v.attachment_id WHERE e.project_id=? AND e.id=? AND a.state='active' AND EXISTS(SELECT 1 FROM source_version_selections s WHERE s.project_id=v.project_id AND s.source_id=v.source_id AND s.version_id=v.id) AND NOT EXISTS(SELECT 1 FROM source_excerpts newer WHERE newer.project_id=e.project_id AND newer.supersedes_id=e.id)"
            )
            .get(p, row.id) as { source_id: string } | undefined
          blocked ||=
            !e ||
            excluded.has(`source:${e.source_id}`) ||
            !!db
              .prepare(
                "SELECT 1 FROM planning_dispositions WHERE project_id=? AND material_kind='source' AND material_id=? AND state='aside'"
              )
              .get(p, e?.source_id ?? '')
        }
        if (kind === 'note') {
          const n = db
            .prepare(
              "SELECT json_extract(body,'$.conversationId') AS chat FROM note_passages WHERE project_id=? AND note_id=?"
            )
            .get(p, row.id) as { chat: string } | undefined
          blocked ||=
            !!n &&
            (excluded.has(`chat:${n.chat}`) || externalOrigin(db, p, n.chat)?.excluded === true)
        }
        if (blocked) {
          result.excluded++
          continue
        }
        result.eligible++
        if (origins >= PLANNING_ANALYSIS.origins) {
          result.omitted++
          continue
        }
        let readable = false
        const initialOrigins = origins
        try {
          for await (const part of parts(ctx, row, known)) {
            if ((!part.known && !part.text.trim()) || part.text.includes('\0')) continue
            readable = true
            const { text, known: ranges, ...reference } = part
            const total = ranges?.[0].total ?? text.length
            for (let start = 0; start < total;) {
              if (origins >= PLANNING_ANALYSIS.origins) {
                result.partial.push(materialIdentity(row))
                break
              }
              const end =
                ranges?.find((r) => r.start === start)?.end ??
                textBoundary(text, Math.min(text.length, start + PLANNING_ANALYSIS.chunk))
              if (end <= start) throw new ProjectError('STALE_REVISION')
              const ref = {
                ...reference,
                role: `${reference.role}${disposition?.state === 'develop' ? ` · Needs development: ${disposition.reason}` : ''}`.slice(
                  0,
                  500
                ),
                start,
                end,
                total
              }
              if (batch.length >= 10 || size + end - start > PLANNING_ANALYSIS.batch) complete()
              batch.push(ref)
              size += end - start
              origins++
              start = end
            }
            if (origins >= PLANNING_ANALYSIS.origins) {
              result.partial.push(materialIdentity(row))
              break
            }
          }
        } catch (error) {
          if (!(error instanceof ProjectError)) throw error
          if (origins > initialOrigins) result.partial.push(materialIdentity(row))
          else readable = false
        }
        if (
          kind === 'source' &&
          db
            .prepare(
              "SELECT 1 FROM source_version_selections s JOIN source_pages page ON page.project_id=s.project_id AND page.version_id=s.version_id WHERE s.project_id=? AND s.source_id=? AND page.state<>'text' LIMIT 1"
            )
            .get(p, row.id)
        )
          result.partial.push(materialIdentity(row))
        if (!readable) result.unreadable++
      }
    }
  }
  complete()
  result.partial = [...new Set(result.partial)]
  // A prefix summary depends on all preceding inputs, not on later additions.
  let prefix = requestDigest({ contract: 1, scope, structure })
  for (const chunk of result.chunks) {
    prefix = requestDigest({ prefix, chunk })
    result.prefixes.push(prefix)
  }
  result.snapshot = requestDigest({ ...result, snapshot: '' })
  return result
}
/** One request-local original reader; only the exact referenced message is decoded. */
export function planningTextReader(
  ctx: PlanningContext
): (origin: PlanningOrigin) => Promise<string> {
  let original: { batchId: string; reader: OriginalTranscriptText } | null = null
  const { db, projectId: p } = ctx
  return async (origin) => {
    let text = '',
      revision = '',
      versionId: string | null = null
    if (origin.part === 'imported') {
      const m = externalMessage(db, p, origin.partId),
        chat = externalOrigin(db, p, origin.id)
      if (
        !chat ||
        m.conversationId !== origin.id ||
        m.visibility !== 'visible' ||
        !m.record.eligible ||
        chat.excluded
      )
        throw new ProjectError('STALE_REVISION')
      if (original?.batchId !== chat.batchId)
        original = { batchId: chat.batchId, reader: new OriginalTranscriptText(ctx, chat.batchId) }
      text = await original.reader.read(m.record)
      revision = m.revisionId
    } else if (origin.part === 'native') {
      const m = db
        .prepare(
          'SELECT text,revision_id,conversation_id FROM conversation_messages WHERE project_id=? AND id=?'
        )
        .get(p, origin.partId) as
        { text: string; revision_id: string; conversation_id: string } | undefined
      if (!m || m.conversation_id !== origin.id) throw new ProjectError('STALE_REVISION')
      text = m.text
      revision = m.revision_id
    } else if (origin.part === 'note') {
      const n = db
        .prepare('SELECT revision_id,body FROM notes WHERE project_id=? AND id=?')
        .get(p, origin.id) as { revision_id: string; body: string } | undefined
      if (!n) throw new ProjectError('STALE_REVISION')
      text = noteText(n.body)
      revision = n.revision_id
    } else if (origin.part === 'excerpt') {
      const e = db
        .prepare('SELECT quote,version_id FROM source_excerpts WHERE project_id=? AND id=?')
        .get(p, origin.id) as { quote: string; version_id: string } | undefined
      if (!e) throw new ProjectError('STALE_REVISION')
      text = e.quote
      revision = origin.id
      versionId = e.version_id
    } else if (origin.part === 'metadata') {
      const source = db
        .prepare('SELECT metadata,revision_id FROM sources WHERE project_id=? AND id=?')
        .get(p, origin.id) as { metadata: string; revision_id: string } | undefined
      if (!source) throw new ProjectError('STALE_REVISION')
      text = source.metadata
      revision = source.revision_id
    } else {
      const page = db
        .prepare(
          'SELECT text,text_hash FROM source_pages WHERE project_id=? AND version_id=? AND page_index=?'
        )
        .get(p, origin.versionId, origin.page) as { text: string; text_hash: string } | undefined
      if (!page) throw new ProjectError('STALE_REVISION')
      text = page.text
      revision = page.text_hash
      versionId = origin.versionId
    }
    if (
      revision !== origin.revision ||
      versionId !== origin.versionId ||
      text.length !== origin.total ||
      textBoundary(text, origin.start) !== origin.start ||
      textBoundary(text, origin.end) !== origin.end
    )
      throw new ProjectError('STALE_REVISION')
    return text.slice(origin.start, origin.end)
  }
}
export function materialIdentity(v: MaterialTarget): string {
  return `${v.kind}:${v.id}`
}
