import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { isId } from '../../domain/editor/schema'
import { exact, record } from '../../shared/projects'
import {
  isMaterialLink,
  MATERIAL_KINDS,
  MATERIAL_LINK_LIMIT,
  type MaterialLink,
  type MaterialTarget
} from '../../shared/chapter-material'
import { retainNoteRevision } from './notes'
import { retainSourceRevision } from './sources'

export const materialTables = {
  note: { table: 'notes', links: 'note_links', column: 'note_id' },
  source: { table: 'sources', links: 'source_links', column: 'source_id' },
  excerpt: { table: 'source_excerpts', links: 'excerpt_document_links', column: 'excerpt_id' },
  chat: { table: 'conversations', links: 'conversation_document_links', column: 'conversation_id' }
} as const
export function hasChapterMaterial(db: Database.Database): boolean {
  return (
    (db.prepare('SELECT schema_version FROM format').get() as { schema_version: number })
      .schema_version >= 39
  )
}
export const materialKey = (target: MaterialTarget): string => `${target.kind}:${target.id}`
const linkKey = (link: MaterialLink): string => `${materialKey(link)}:${link.documentId}`
export function materialDocumentIds(
  db: Database.Database,
  p: string,
  target: MaterialTarget
): string[] {
  const { links, column } = materialTables[target.kind]
  return (
    db
      .prepare(
        `SELECT document_id FROM ${links} WHERE project_id=? AND ${column}=? ORDER BY document_id`
      )
      .all(p, target.id) as { document_id: string }[]
  ).map((r) => r.document_id)
}
export function materialLinks(db: Database.Database, p: string): MaterialLink[] {
  const result: MaterialLink[] = []
  for (const kind of MATERIAL_KINDS) {
    const { links, column } = materialTables[kind]
    for (const r of db
      .prepare(
        `SELECT ${column} AS id,document_id AS documentId FROM ${links} WHERE project_id=? ORDER BY ${column},document_id`
      )
      .iterate(p) as Iterable<{ id: string; documentId: string }>) {
      if (result.length >= MATERIAL_LINK_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
      result.push({ kind, ...r })
    }
  }
  return result
}
/** Links participate in note/source revisions, so a retained form cannot overwrite a newer assignment. */
function reviseMaterial(db: Database.Database, p: string, target: MaterialTarget): void {
  if (target.kind === 'excerpt') return // Excerpts are immutable; the project head guards their links.
  const now = new Date().toISOString()
  if (target.kind === 'note') retainNoteRevision(db, p, target.id, now)
  if (target.kind === 'source') retainSourceRevision(db, p, target.id, now)
  db.prepare(
    `UPDATE ${materialTables[target.kind].table} SET revision_id=?,updated_at=? WHERE project_id=? AND id=?`
  ).run(randomUUID(), now, p, target.id)
}
export function setMaterialLink(
  db: Database.Database,
  p: string,
  link: MaterialLink,
  linked: boolean
): void {
  const { links, column } = materialTables[link.kind]
  const present = !!db
    .prepare(`SELECT 1 FROM ${links} WHERE project_id=? AND ${column}=? AND document_id=?`)
    .get(p, link.id, link.documentId)
  if (present === linked) return
  if (linked) {
    const total = MATERIAL_KINDS.reduce(
      (count, kind) =>
        count +
        (
          db
            .prepare(`SELECT count(*) AS n FROM ${materialTables[kind].links} WHERE project_id=?`)
            .get(p) as { n: number }
        ).n,
      0
    )
    if (total >= MATERIAL_LINK_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
  }
  reviseMaterial(db, p, link)
  if (linked) db.prepare(`INSERT INTO ${links} VALUES (?,?,?)`).run(p, link.id, link.documentId)
  else
    db.prepare(`DELETE FROM ${links} WHERE project_id=? AND ${column}=? AND document_id=?`).run(
      p,
      link.id,
      link.documentId
    )
}
/** Caller owns a write transaction. Only association rows and their revision guards change. */
export function replaceMaterialLinks(db: Database.Database, p: string, next: MaterialLink[]): void {
  if (next.length > MATERIAL_LINK_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
  const before = materialLinks(db, p),
    old = new Set(before.map(linkKey)),
    desired = new Set(next.map(linkKey))
  const affected = new Map<string, MaterialTarget>()
  for (const link of before) if (!desired.has(linkKey(link))) affected.set(materialKey(link), link)
  for (const link of next) if (!old.has(linkKey(link))) affected.set(materialKey(link), link)
  for (const target of affected.values()) reviseMaterial(db, p, target)
  for (const link of before)
    if (!desired.has(linkKey(link))) {
      const { links, column } = materialTables[link.kind]
      db.prepare(`DELETE FROM ${links} WHERE project_id=? AND ${column}=? AND document_id=?`).run(
        p,
        link.id,
        link.documentId
      )
    }
  for (const link of next)
    if (!old.has(linkKey(link))) {
      const { links } = materialTables[link.kind]
      db.prepare(`INSERT OR IGNORE INTO ${links} VALUES (?,?,?)`).run(p, link.id, link.documentId)
    }
}
export function mergeMaterialLinks(
  db: Database.Database,
  p: string,
  from: string,
  to: string
): void {
  if (!hasChapterMaterial(db)) return
  const links = materialLinks(db, p)
  replaceMaterialLinks(db, p, [
    ...new Map(
      [
        ...links,
        ...links.filter((l) => l.documentId === from).map((l) => ({ ...l, documentId: to }))
      ].map((l) => [linkKey(l), l])
    ).values()
  ])
}
export function checkpointMaterialLinks(
  db: Database.Database,
  p: string,
  checkpointId: string
): void {
  if (!hasChapterMaterial(db)) return
  const body = JSON.stringify({ version: 1, links: materialLinks(db, p) })
  if (Buffer.byteLength(body) > 32 * 1024 ** 2) throw new ProjectError('LIMIT_EXCEEDED')
  db.prepare('INSERT INTO chapter_material_history VALUES (?,?,?)').run(p, checkpointId, body)
}
function readMaterialHistory(body: string): MaterialLink[] {
  if (Buffer.byteLength(body) > 32 * 1024 ** 2) throw new ProjectError('CORRUPT_PROJECT')
  const value: unknown = JSON.parse(body)
  if (
    !record(value) ||
    !exact(value, ['version', 'links']) ||
    value.version !== 1 ||
    !Array.isArray(value.links) ||
    value.links.length > MATERIAL_LINK_LIMIT ||
    !value.links.every(isMaterialLink) ||
    new Set(value.links.map(linkKey)).size !== value.links.length
  )
    throw new ProjectError('CORRUPT_PROJECT')
  return value.links
}
export function restoreMaterialLinks(
  db: Database.Database,
  p: string,
  checkpointId: string,
  documentIds: Set<string>
): void {
  if (!hasChapterMaterial(db)) return
  const row = db
    .prepare('SELECT body FROM chapter_material_history WHERE project_id=? AND checkpoint_id=?')
    .get(p, checkpointId) as { body: string } | undefined
  // Earlier checkpoints have no association snapshot. Keep their historical contract and current links.
  if (!row) return
  const saved = readMaterialHistory(row.body)
  replaceMaterialLinks(db, p, [
    ...saved,
    ...materialLinks(db, p).filter((l) => !documentIds.has(l.documentId))
  ])
}
export function validatePortableMaterial(db: Database.Database, p: string): void {
  for (const table of [
    'conversation_document_links',
    'excerpt_document_links',
    'chapter_material_history'
  ])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p))
      throw new ProjectError('CORRUPT_PROJECT')
  const validate = (links: MaterialLink[], documents?: Set<string>): void => {
    for (const link of links) {
      if (
        !isMaterialLink(link) ||
        (documents && !documents.has(link.documentId)) ||
        !db
          .prepare(`SELECT 1 FROM ${materialTables[link.kind].table} WHERE project_id=? AND id=?`)
          .get(p, link.id) ||
        !db.prepare('SELECT 1 FROM documents WHERE project_id=? AND id=?').get(p, link.documentId)
      )
        throw new ProjectError('CORRUPT_PROJECT')
    }
  }
  validate(materialLinks(db, p))
  for (const row of db
    .prepare(
      'SELECT h.checkpoint_id,h.body,c.snapshot FROM chapter_material_history h JOIN history_checkpoints c ON c.project_id=h.project_id AND c.id=h.checkpoint_id WHERE h.project_id=?'
    )
    .iterate(p) as Iterable<{ checkpoint_id: string; body: string; snapshot: string }>) {
    if (!isId(row.checkpoint_id)) throw new ProjectError('CORRUPT_PROJECT')
    const snapshot = JSON.parse(row.snapshot) as { documents: { documentId: string }[] }
    validate(readMaterialHistory(row.body), new Set(snapshot.documents.map((d) => d.documentId)))
  }
}
