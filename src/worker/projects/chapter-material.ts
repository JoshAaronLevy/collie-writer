import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { replaceControlCharacters } from '../../shared/control-characters'
import { effectiveState, type OutlineDocument } from '../../shared/outline'
import {
  MATERIAL_KINDS,
  MATERIAL_PAGE_SIZE,
  type ChapterMaterialInput,
  type ChapterMaterialChange,
  type ChapterMaterialView,
  type ChapterMaterialItem,
  type ChapterMaterialResult,
  type MaterialKind
} from '../../shared/chapter-material'
import { type CommitReceipt, isProjectValue } from '../../shared/projects'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { materialDocumentIds, materialTables, setMaterialLink } from './material-links'

function documents(db: Database.Database, p: string): OutlineDocument[] {
  return db
    .prepare(
      'SELECT d.id,d.parent_id AS parentId,d.kind,d.title,s.state FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=?'
    )
    .all(p) as OutlineDocument[]
}
function head(db: Database.Database, p: string): string {
  const row = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(p) as
    { head_commit_id: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return row.head_commit_id
}
function scopes(db: Database.Database, p: string, id: string): ChapterMaterialView['scopes'] {
  const docs = documents(db, p),
    result: ChapterMaterialView['scopes'] = []
  let doc = docs.find((d) => d.id === id)
  if (!doc) throw new ProjectError('NOT_FOUND')
  while (doc) {
    if (result.length >= 8 || result.some((s) => s.id === doc!.id))
      throw new ProjectError('CORRUPT_PROJECT')
    result.push({ id: doc.id, title: doc.title, kind: doc.kind })
    doc = docs.find((d) => d.id === doc!.parentId)
  }
  return result
}
const clean = (value: string, max: number): string => replaceControlCharacters(value).slice(0, max)
function notePreview(body: string): string {
  let text = ''
  const visit = (node: { text?: string; content?: (typeof node)[] }): void => {
    if (text.length >= 400) return
    if (node.text) text += `${node.text} `
    node.content?.forEach(visit)
  }
  visit((JSON.parse(body) as { ast: Parameters<typeof visit>[0] }).ast)
  return clean(text, 400)
}
export function readChapterMaterial(
  db: Database.Database,
  input: ChapterMaterialInput
): ChapterMaterialView {
  const p = input.projectId,
    scope = scopes(db, p, input.documentId)
  // The SQL unions only identity/title metadata. Bodies are read for the bounded visible page.
  const queries = (input.kind === 'all' ? MATERIAL_KINDS : [input.kind]).map((kind) => {
    const { table, links, column } = materialTables[kind]
    const from =
      kind === 'excerpt'
        ? 'source_excerpts t JOIN source_versions v ON v.project_id=t.project_id AND v.id=t.version_id JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id'
        : `${table} t`
    const title =
      kind === 'source'
        ? "json_extract(t.metadata,'$.title')"
        : kind === 'excerpt'
          ? "CASE WHEN t.label<>'' THEN t.label ELSE json_extract(s.metadata,'$.title') END"
          : 't.title'
    const state = kind === 'excerpt' ? 's.state' : 't.state'
    const inherited = scope.map((_, i) => `@scope${i}`).join(',')
    const rank = `CASE ${scope.map((_, i) => `WHEN EXISTS (SELECT 1 FROM ${links} l WHERE l.project_id=t.project_id AND l.${column}=t.id AND l.document_id=@scope${i}) THEN ${i}`).join(' ')} ELSE 8 END`
    return `SELECT '${kind}' AS kind,t.id,${title} AS title,${state} AS state,${rank} AS rank FROM ${from} WHERE t.project_id=@project AND instr(lower(${title}),lower(@query))>0 AND ${
      input.mode === 'linked'
        ? `EXISTS (SELECT 1 FROM ${links} l WHERE l.project_id=t.project_id AND l.${column}=t.id AND l.document_id IN (${inherited}))`
        : `${state}='active'`
    }`
  })
  const union = queries.join(' UNION ALL '),
    params = {
      project: p,
      query: input.query.trim(),
      ...Object.fromEntries(scope.map((s, i) => [`scope${i}`, s.id]))
    }
  const total = (db.prepare(`SELECT count(*) AS n FROM (${union})`).get(params) as { n: number }).n
  const rows = db
    .prepare(
      `SELECT kind,id,title,state FROM (${union}) ORDER BY ${input.mode === 'linked' ? 'rank,' : ''}lower(title),kind,id LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: MATERIAL_PAGE_SIZE, offset: input.offset }) as {
    kind: MaterialKind
    id: string
    title: string
    state: ChapterMaterialItem['state']
  }[]
  const items = rows.map((row): ChapterMaterialItem => {
    const item: ChapterMaterialItem = {
      ...row,
      title: clean(row.title, 2000),
      preview: '',
      documentIds: materialDocumentIds(db, p, row),
      sourceId: null,
      versionId: null,
      originDocumentId: null
    }
    if (row.kind === 'note') {
      const note = db
        .prepare('SELECT body FROM notes WHERE project_id=? AND id=?')
        .get(p, row.id) as { body: string }
      item.preview = notePreview(note.body)
    } else if (row.kind === 'excerpt') {
      const excerpt = db
        .prepare(
          'SELECT e.quote,e.version_id,v.source_id FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id WHERE e.project_id=? AND e.id=?'
        )
        .get(p, row.id) as { quote: string; version_id: string; source_id: string }
      item.preview = clean(excerpt.quote, 400)
      item.sourceId = excerpt.source_id
      item.versionId = excerpt.version_id
    } else if (row.kind === 'chat') {
      item.originDocumentId = (
        db
          .prepare('SELECT origin_document_id FROM conversations WHERE project_id=? AND id=?')
          .get(p, row.id) as { origin_document_id: string | null }
      ).origin_document_id
    }
    return item
  })
  return {
    documentId: input.documentId,
    headCommitId: head(db, p),
    scopes: scope,
    items,
    total,
    offset: input.offset
  }
}
export function changeChapterMaterial(
  db: Database.Database,
  input: ChapterMaterialChange
): ChapterMaterialResult {
  const digest = requestDigest({ ...input, action: 'set' }),
    p = input.projectId
  const prior = (): CommitReceipt | null => {
    const row = db
      .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
      .get(p, input.operationId) as { digest: string; result: string } | undefined
    if (!row) return null
    if (row.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
    const receipt: unknown = JSON.parse(row.result)
    if (!isProjectValue('commit', receipt)) throw new ProjectError('CORRUPT_PROJECT')
    return receipt as CommitReceipt
  }
  if (input.action === 'status') return { receipt: prior() }
  return inWriteTransaction(db, () => {
    const recorded = prior()
    if (recorded) return { receipt: recorded }
    if (head(db, p) !== input.expectedHead) throw new ProjectError('STALE_REVISION')
    const docs = documents(db, p),
      doc = docs.find((d) => d.id === input.documentId)
    if (!doc || effectiveState(doc, docs) !== 'active') throw new ProjectError('STALE_REVISION')
    const { table } = materialTables[input.target.kind]
    const target = db
      .prepare(`SELECT * FROM ${table} WHERE project_id=? AND id=?`)
      .get(p, input.target.id) as { state?: string; version_id?: string } | undefined
    if (!target) throw new ProjectError('NOT_FOUND')
    if (input.linked) {
      const state =
        input.target.kind === 'excerpt'
          ? (
              db
                .prepare(
                  'SELECT s.state FROM source_versions v JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id WHERE v.project_id=? AND v.id=?'
                )
                .get(p, target.version_id!) as { state: string }
            ).state
          : target.state
      if (state !== 'active') throw new ProjectError('STALE_REVISION')
    }
    setMaterialLink(db, p, { ...input.target, documentId: input.documentId }, input.linked)
    const time = new Date().toISOString(),
      nextHead = randomUUID()
    db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(p, nextHead, input.expectedHead, time)
    db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(
      nextHead,
      time,
      p
    )
    const revision = db
      .prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?')
      .get(p, input.documentId) as { revision_id: string }
    const receipt = {
      projectId: p,
      documentId: input.documentId,
      revisionId: revision.revision_id,
      headCommitId: nextHead
    }
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
      p,
      input.operationId,
      digest,
      JSON.stringify(receipt)
    )
    return { receipt }
  })
}
