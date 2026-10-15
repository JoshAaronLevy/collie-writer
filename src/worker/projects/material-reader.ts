import type Database from 'better-sqlite3'
import { replaceControlCharacters } from '../../shared/control-characters'
import type { ChapterMaterialItem, MaterialKind } from '../../shared/chapter-material'
import type { SourceMetadata } from '../../shared/sources'
import { materialDocumentIds, materialTables } from './material-links'
export type MaterialRow = {
  kind: MaterialKind
  id: string
  title: string
  state: ChapterMaterialItem['state']
}
export function materialSql(kind: MaterialKind): {
  from: string
  title: string
  state: string
  links: string
  column: string
} {
  const { table, links, column } = materialTables[kind]
  return {
    from:
      kind === 'excerpt'
        ? 'source_excerpts t JOIN source_versions v ON v.project_id=t.project_id AND v.id=t.version_id JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id'
        : `${table} t`,
    title:
      kind === 'source'
        ? "json_extract(t.metadata,'$.title')"
        : kind === 'excerpt'
          ? "CASE WHEN t.label<>'' THEN t.label ELSE json_extract(s.metadata,'$.title') END"
          : 't.title',
    state: kind === 'excerpt' ? 's.state' : 't.state',
    links,
    column
  }
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
export function materialItem(
  db: Database.Database,
  p: string,
  row: MaterialRow
): ChapterMaterialItem {
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
  } else if (row.kind === 'source') {
    const source = db
      .prepare('SELECT metadata FROM sources WHERE project_id=? AND id=?')
      .get(p, row.id) as { metadata: string }
    const metadata = JSON.parse(source.metadata) as SourceMetadata
    item.preview = clean(
      [
        metadata.author.map((a) => a.literal || `${a.given} ${a.family}`.trim()).join(', '),
        metadata.issued,
        metadata.containerTitle
      ]
        .filter(Boolean)
        .join(' · '),
      400
    )
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
    const message = db
      .prepare(
        "SELECT substr(text,1,400) AS text FROM conversation_messages WHERE project_id=? AND conversation_id=? AND role='user' ORDER BY ordinal LIMIT 1"
      )
      .get(p, row.id) as { text: string } | undefined
    item.preview = clean(message?.text ?? '', 400)
  }
  return item
}
