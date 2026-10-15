import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { effectiveState, type OutlineDocument } from '../../shared/outline'
import {
  MATERIAL_KINDS,
  MATERIAL_PAGE_SIZE,
  type ChapterMaterialInput,
  type ChapterMaterialChange,
  type ChapterMaterialView,
  type ChapterMaterialResult
} from '../../shared/chapter-material'
import { type CommitReceipt, isProjectValue } from '../../shared/projects'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { materialTables, setMaterialLink } from './material-links'
import { materialSql, materialItem, type MaterialRow } from './material-reader'

export function materialDocuments(db: Database.Database, p: string): OutlineDocument[] {
  return db
    .prepare(
      'SELECT d.id,d.parent_id AS parentId,d.kind,d.title,s.state FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=?'
    )
    .all(p) as OutlineDocument[]
}
export function materialHead(db: Database.Database, p: string): string {
  const row = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(p) as
    { head_commit_id: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return row.head_commit_id
}
export function materialScopes(
  db: Database.Database,
  p: string,
  id: string
): ChapterMaterialView['scopes'] {
  const docs = materialDocuments(db, p),
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
export function readChapterMaterial(
  db: Database.Database,
  input: ChapterMaterialInput
): ChapterMaterialView {
  const p = input.projectId,
    scope = materialScopes(db, p, input.documentId)
  // The SQL unions only identity/title metadata. Bodies are read for the bounded visible page.
  const queries = (input.kind === 'all' ? MATERIAL_KINDS : [input.kind]).map((kind) => {
    const { from, title, state, links, column } = materialSql(kind)
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
    .all({ ...params, limit: MATERIAL_PAGE_SIZE, offset: input.offset }) as MaterialRow[]
  const items = rows.map((row) => materialItem(db, p, row))
  return {
    documentId: input.documentId,
    headCommitId: materialHead(db, p),
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
    if (materialHead(db, p) !== input.expectedHead) throw new ProjectError('STALE_REVISION')
    const docs = materialDocuments(db, p),
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
