import type Database from 'better-sqlite3'
import { readDocument, type CitationItem, type DocumentPayload } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'

export type CitationOccurrence = { citationId: string; footnoteId: string | null; items: CitationItem[] }
export function citationOccurrences(payload: DocumentPayload): CitationOccurrence[] {
  const result: CitationOccurrence[] = []
  const visit = (value: unknown, footnoteId: string | null): void => {
    if (!value || typeof value !== 'object') return
    const node = value as { type?: string; attrs?: { citationId: string; items: CitationItem[] }; content?: unknown[] }
    if (node.type === 'citation' && node.attrs) result.push({ citationId: node.attrs.citationId, footnoteId, items: node.attrs.items })
    node.content?.forEach(child => visit(child, footnoteId))
  }
  visit(payload.ast, null)
  for (const [id,body] of Object.entries(payload.footnotesById)) visit(body,id)
  return result
}
export function projectCitations(db: Database.Database, projectId: string, documentId: string, payload: DocumentPayload): void {
  db.prepare('DELETE FROM citation_occurrences WHERE project_id=? AND document_id=?').run(projectId,documentId)
  const insert = db.prepare('INSERT INTO citation_occurrences VALUES (?,?,?,?,?,?,?)')
  for (const occurrence of citationOccurrences(payload)) occurrence.items.forEach((item,index) => insert.run(projectId,documentId,occurrence.citationId,index,item.sourceId,occurrence.footnoteId,JSON.stringify(item)))
}
export function rebuildCitations(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM citation_occurrences WHERE project_id=?').run(projectId)
  for (const doc of db.prepare("SELECT d.id,d.payload FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.kind='text' AND s.state<>'merged'").all(projectId) as { id: string; payload: string }[]) projectCitations(db,projectId,doc.id,readDocument(JSON.parse(doc.payload)))
}
export function validatePortableCitations(db: Database.Database, projectId: string): void {
  for (const table of ['citation_settings','citation_occurrences']) if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(projectId)) throw new ProjectError('CORRUPT_PROJECT')
  const expected: string[] = []
  for (const doc of db.prepare("SELECT d.id,d.payload FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.kind='text' AND s.state<>'merged'").all(projectId) as { id: string; payload: string }[]) {
    for (const c of citationOccurrences(readDocument(JSON.parse(doc.payload)))) c.items.forEach((item,index) => expected.push(JSON.stringify([doc.id,c.citationId,index,item.sourceId,c.footnoteId,JSON.stringify(item)])))
  }
  const actual = (db.prepare('SELECT document_id,citation_id,item_index,source_id,footnote_id,item FROM citation_occurrences WHERE project_id=?').all(projectId) as { document_id: string; citation_id: string; item_index: number; source_id: string; footnote_id: string | null; item: string }[]).map(r => JSON.stringify([r.document_id,r.citation_id,r.item_index,r.source_id,r.footnote_id,r.item]))
  if (JSON.stringify(expected.sort()) !== JSON.stringify(actual.sort())) throw new ProjectError('CORRUPT_PROJECT')
}
