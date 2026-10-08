import { withoutKeys } from '../../shared/objects'
import type Database from 'better-sqlite3'
import { readProjectDetails } from './details'

/** A structural overview only; AC05 owns retrieval from other manuscript bodies. */
export function conversationOverview(db: Database.Database, projectId: string): string {
  const details = readProjectDetails(db, projectId)
  const project = db.prepare('SELECT title FROM projects WHERE id=?').get(projectId) as {
    title: string
  }
  type Row = {
    id: string
    revision: string
    title: string
    kind: string
    synopsis: string
    depth: number
    total: number
  }
  const rows = db
    .prepare(
      `WITH RECURSIVE outline(id,revision,title,kind,synopsis,depth,path) AS (
    SELECT d.id,d.revision_id,d.title,d.kind,d.synopsis,0,printf('%08d',d.position)
    FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id
    WHERE d.project_id=? AND d.parent_id IS NULL AND s.state='active'
    UNION ALL
    SELECT d.id,d.revision_id,d.title,d.kind,d.synopsis,o.depth+1,o.path||'/'||printf('%08d',d.position)
    FROM documents d JOIN outline o ON d.parent_id=o.id JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id
    WHERE d.project_id=? AND s.state='active' AND o.depth<7
  ) SELECT id,revision,substr(title,1,160) AS title,kind,substr(synopsis,1,400) AS synopsis,depth,count(*) OVER() AS total
    FROM outline ORDER BY path,id LIMIT 201`
    )
    .all(projectId, projectId) as Row[]
  const outline: Omit<Row, 'total'>[] = []
  const overview = {
    title: project.title,
    subtitle: details.subtitle,
    kind: details.projectKind,
    description: details.description.slice(0, 2000),
    coverage:
      'Structure and existing synopses only. Titles/synopses may be abbreviated. Other manuscript bodies, research and other chats are not included.',
    descriptionAbbreviated: details.description.length > 2000,
    totalOutlineItems: rows[0]?.total ?? 0,
    includedOutlineItems: 0,
    outline
  }
  for (const row of rows) {
    outline.push(withoutKeys(row, ['total']))
    overview.includedOutlineItems = outline.length
    if (JSON.stringify(overview).length > 12000) {
      outline.pop()
      overview.includedOutlineItems = outline.length
      break
    }
  }
  return JSON.stringify(overview)
}
