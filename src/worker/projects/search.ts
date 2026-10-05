import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { readDocument } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import type {
  SearchActivity,
  SearchHit,
  SearchInput,
  SearchKind,
  SearchView
} from '../../shared/search'
import { inWriteTransaction, openStorageDatabase } from '../storage/driver'

type Meta = {
  state: SearchActivity['state']
  phase: number
  cursor: string
  generation: string
  target_head: string | null
  indexed_head: string | null
  job_id: string | null
  processed: number
  total: number
  error: string | null
}
type Entry = {
  key: string
  kind: SearchKind
  entityId: string
  revision: string
  title: string
  body: string
  sourceId: string | null
  documentId: string | null
  noteId: string | null
  versionId: string | null
  pageIndex: number | null
  anchorId: string | null
  sectionIds: string
  tagIds: string
  state: string
}
type Stored = {
  id: number
  entity_key: string
  kind: SearchKind
  entity_id: string
  revision: string
  title: string
  body: string
  source_id: string | null
  document_id: string | null
  note_id: string | null
  version_id: string | null
  page_index: number | null
  anchor_id: string | null
  section_ids: string
  tag_ids: string
  state: string
}
const phases = [
  'documents',
  'notes',
  'sources',
  'research_questions',
  'research_claims',
  'source_pages'
] as const
const batches = 12
const joined = (ids: string[]): string => (ids.length ? `|${ids.join('|')}|` : '')
function words(payload: unknown): string {
  const parts: string[] = []
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Record<string, unknown>
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    else if (node.type === 'hardBreak') parts.push('\n')
    for (const [name, child] of Object.entries(node))
      if (name === 'content' || name === 'footnotesById' || name === 'ast') visit(child)
    if (['paragraph', 'heading', 'blockquote', 'listItem', 'tableRow'].includes(String(node.type)))
      parts.push('\n')
  }
  visit(payload)
  return parts.join(' ')
}
function metadataText(raw: string): string {
  const value = JSON.parse(raw) as Record<string, unknown>
  return Object.values(value)
    .flatMap((item) =>
      Array.isArray(item)
        ? item.map((x) =>
            typeof x === 'object'
              ? Object.values(x as Record<string, unknown>).join(' ')
              : String(x)
          )
        : typeof item === 'string'
          ? item
          : []
    )
    .join(' ')
}
const head = (db: Database.Database): string =>
  (db.prepare('SELECT head_commit_id FROM projects').get() as { head_commit_id: string })
    .head_commit_id
const project = (db: Database.Database): string =>
  (db.prepare('SELECT id FROM projects').get() as { id: string }).id
const count = (db: Database.Database, sql: string): number =>
  (db.prepare(sql).get() as { n: number }).n
/** Device-local, disposable projection. No search table enters a project archive. */
export class LocalSearch {
  readonly index: Database.Database
  private coverage: {
    head: string
    expected: number
    pagesWithText: number
    pagesWithoutText: number
    uninspectedSources: number
    uninspected: SearchActivity['uninspected']
  } | null = null
  constructor(path: string, nativeBinding?: string) {
    this.index = openStorageDatabase(path, nativeBinding)
    try {
      this.index
        .exec(`CREATE TABLE IF NOT EXISTS search_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, state TEXT NOT NULL, phase INTEGER NOT NULL, cursor TEXT NOT NULL, generation TEXT NOT NULL, target_head TEXT, indexed_head TEXT, job_id TEXT, processed INTEGER NOT NULL, total INTEGER NOT NULL, error TEXT) STRICT;
      CREATE TABLE IF NOT EXISTS search_entries (id INTEGER PRIMARY KEY, entity_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, source_id TEXT, document_id TEXT, note_id TEXT, version_id TEXT, page_index INTEGER, anchor_id TEXT, section_ids TEXT NOT NULL, tag_ids TEXT NOT NULL, state TEXT NOT NULL, generation TEXT NOT NULL) STRICT;
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(title,body, tokenize='unicode61 remove_diacritics 2');`)
      this.index
        .prepare(
          "INSERT OR IGNORE INTO search_meta VALUES (1,1,'partial',0,'','',NULL,NULL,NULL,0,0,NULL)"
        )
        .run()
      const meta = this.meta()
      if (meta.phase < 0 || meta.phase > phases.length) throw new ProjectError('CORRUPT_PROJECT')
      if (meta.state === 'queued' || meta.state === 'running')
        this.index.prepare("UPDATE search_meta SET state='interrupted' WHERE singleton=1").run()
    } catch (error) {
      this.index.close()
      throw error
    }
  }
  close(): void {
    this.index.close()
  }
  private meta(): Meta {
    return this.index.prepare('SELECT * FROM search_meta WHERE singleton=1').get() as Meta
  }
  private total(db: Database.Database): number {
    return phases.reduce((sum, table) => sum + count(db, `SELECT count(*) n FROM ${table}`), 0)
  }
  start(db: Database.Database, operations: Database.Database, rebuild = false): void {
    const before = this.meta()
    if (before.state === 'queued' || before.state === 'running') return
    const id = randomUUID(),
      generation = randomUUID(),
      now = new Date().toISOString(),
      total = this.total(db)
    inWriteTransaction(this.index, () => {
      if (rebuild) {
        this.index.prepare('DELETE FROM search_fts').run()
        this.index.prepare('DELETE FROM search_entries').run()
      }
      this.index
        .prepare(
          "UPDATE search_meta SET state='queued',phase=0,cursor='',generation=?,target_head=?,job_id=?,processed=0,total=?,error=NULL WHERE singleton=1"
        )
        .run(generation, head(db), id, total)
    })
    operations.prepare("INSERT INTO jobs VALUES (?,?,'search','queued',?,NULL)").run(id, id, now)
  }
  cancel(operations: Database.Database): void {
    const m = this.meta()
    if (m.state === 'queued' || m.state === 'running') {
      this.index.prepare("UPDATE search_meta SET state='cancelled' WHERE singleton=1").run()
      operations
        .prepare("UPDATE jobs SET state='cancelled' WHERE id=? AND kind='search'")
        .run(m.job_id)
    }
  }
  needsWork(): boolean {
    const m = this.meta()
    return m.state === 'queued' || m.state === 'running'
  }
  ensure(db: Database.Database, operations: Database.Database): void {
    const m = this.meta()
    if (m.state === 'partial' || (m.state === 'completed' && m.indexed_head !== head(db)))
      this.start(db, operations)
  }
  private select(db: Database.Database, phase: number, cursor: string): Record<string, unknown>[] {
    const projectId = project(db)
    if (phase === 5) {
      const [version = '', page = '-1'] = cursor ? (JSON.parse(cursor) as [string, string]) : []
      return db
        .prepare(
          'SELECT p.*,v.source_id,v.sha256,s.metadata,s.state source_state FROM source_pages p JOIN source_versions v ON v.project_id=p.project_id AND v.id=p.version_id JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id WHERE p.project_id=? AND (p.version_id>? OR p.version_id=? AND p.page_index>?) ORDER BY p.version_id,p.page_index LIMIT ?'
        )
        .all(projectId, version, version, Number(page), batches) as Record<string, unknown>[]
    }
    const table = phases[phase]
    return db
      .prepare(`SELECT * FROM ${table} WHERE project_id=? AND id>? ORDER BY id LIMIT ?`)
      .all(projectId, cursor, batches) as Record<string, unknown>[]
  }
  private entry(db: Database.Database, phase: number, row: Record<string, unknown>): Entry | null {
    const id = String(row.id ?? ''),
      version = String(row.version_id ?? '')
    if (phase === 0) {
      if (row.kind !== 'text') return null
      const payload = readDocument(JSON.parse(String(row.payload)))
      return {
        key: `draft:${id}`,
        kind: 'draft',
        entityId: id,
        revision: String(row.revision_id),
        title: String(row.title),
        body: `${row.synopsis} ${words(payload)}`,
        sourceId: null,
        documentId: id,
        noteId: null,
        versionId: null,
        pageIndex: null,
        anchorId: null,
        sectionIds: joined([id]),
        tagIds: '',
        state: String(
          (
            db
              .prepare('SELECT state FROM outline_state WHERE project_id=? AND document_id=?')
              .get(row.project_id, id) as { state: string }
          ).state
        )
      }
    }
    if (phase === 1) {
      const links = (
        db
          .prepare('SELECT document_id FROM note_links WHERE project_id=? AND note_id=?')
          .all(row.project_id, id) as { document_id: string }[]
      ).map((x) => x.document_id)
      const tags = (
        db
          .prepare(
            "SELECT l.id FROM note_label_links x JOIN note_labels l ON l.project_id=x.project_id AND l.id=x.label_id WHERE x.project_id=? AND x.note_id=? AND l.state='active'"
          )
          .all(row.project_id, id) as { id: string }[]
      ).map((x) => x.id)
      return {
        key: `note:${id}`,
        kind: 'note',
        entityId: id,
        revision: String(row.revision_id),
        title: String(row.title),
        body: words(readDocument(JSON.parse(String(row.body)))),
        sourceId: null,
        documentId: null,
        noteId: id,
        versionId: null,
        pageIndex: null,
        anchorId: null,
        sectionIds: joined(links),
        tagIds: joined(tags),
        state: String(row.state)
      }
    }
    if (phase === 2) {
      const links = (
        db
          .prepare('SELECT document_id FROM source_links WHERE project_id=? AND source_id=?')
          .all(row.project_id, id) as { document_id: string }[]
      ).map((x) => x.document_id)
      const m = JSON.parse(String(row.metadata)) as { title: string }
      return {
        key: `source:${id}`,
        kind: 'source',
        entityId: id,
        revision: String(row.revision_id),
        title: m.title,
        body: metadataText(String(row.metadata)),
        sourceId: id,
        documentId: null,
        noteId: null,
        versionId: null,
        pageIndex: null,
        anchorId: null,
        sectionIds: joined(links),
        tagIds: '',
        state: String(row.state)
      }
    }
    if (phase === 3 || phase === 4)
      return {
        key: `${phase === 3 ? 'question' : 'claim'}:${id}`,
        kind: phase === 3 ? 'question' : 'claim',
        entityId: id,
        revision: String(row.revision_id),
        title: String(row.text).slice(0, 500),
        body: String(row.text),
        sourceId: null,
        documentId: row.document_id as string | null,
        noteId: row.note_id as string | null,
        versionId: null,
        pageIndex: null,
        anchorId: null,
        sectionIds: row.document_id ? joined([String(row.document_id)]) : '',
        tagIds: '',
        state: String(row.state)
      }
    if (row.state !== 'text' || !row.text) return null
    const sourceId = String(row.source_id),
      page = Number(row.page_index),
      m = JSON.parse(String(row.metadata)) as { title: string }
    const links = (
      db
        .prepare('SELECT document_id FROM source_links WHERE project_id=? AND source_id=?')
        .all(row.project_id, sourceId) as { document_id: string }[]
    ).map((x) => x.document_id)
    return {
      key: `page:${version}:${page}`,
      kind: 'page',
      entityId: version,
      revision: String(row.text_hash),
      title: `${m.title} · ${page === 0 ? 'plain text' : `page ${row.label || page}`}`.slice(
        0,
        500
      ),
      body: String(row.text),
      sourceId,
      documentId: null,
      noteId: null,
      versionId: version,
      pageIndex: page,
      anchorId: null,
      sectionIds: joined(links),
      tagIds: '',
      state: String(row.source_state)
    }
  }
  private upsert(entry: Entry, generation: string): void {
    const prior = this.index
      .prepare(
        'SELECT id,revision,title,body,section_ids,tag_ids,state FROM search_entries WHERE entity_key=?'
      )
      .get(entry.key) as
      | {
          id: number
          revision: string
          title: string
          body: string
          section_ids: string
          tag_ids: string
          state: string
        }
      | undefined
    if (
      prior &&
      prior.revision === entry.revision &&
      prior.title === entry.title &&
      prior.body === entry.body &&
      prior.section_ids === entry.sectionIds &&
      prior.tag_ids === entry.tagIds &&
      prior.state === entry.state
    ) {
      this.index
        .prepare('UPDATE search_entries SET generation=? WHERE id=?')
        .run(generation, prior.id)
      return
    }
    if (prior) {
      this.index.prepare('DELETE FROM search_fts WHERE rowid=?').run(prior.id)
      this.index.prepare('DELETE FROM search_entries WHERE id=?').run(prior.id)
    }
    const result = this.index
      .prepare(
        'INSERT INTO search_entries (entity_key,kind,entity_id,revision,title,body,source_id,document_id,note_id,version_id,page_index,anchor_id,section_ids,tag_ids,state,generation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run(
        entry.key,
        entry.kind,
        entry.entityId,
        entry.revision,
        entry.title,
        entry.body,
        entry.sourceId,
        entry.documentId,
        entry.noteId,
        entry.versionId,
        entry.pageIndex,
        entry.anchorId,
        entry.sectionIds,
        entry.tagIds,
        entry.state,
        generation
      )
    this.index
      .prepare('INSERT INTO search_fts (rowid,title,body) VALUES (?,?,?)')
      .run(result.lastInsertRowid, entry.title, entry.body)
  }
  batch(db: Database.Database, operations: Database.Database): boolean {
    const m = this.meta()
    if (m.state !== 'queued' && m.state !== 'running') return false
    try {
      if (m.state === 'queued') {
        this.index.prepare("UPDATE search_meta SET state='running' WHERE singleton=1").run()
        operations
          .prepare("UPDATE jobs SET state='running' WHERE id=? AND kind='search'")
          .run(m.job_id)
      }
      if (m.phase === phases.length) {
        this.finish(db, operations, m)
        return false
      }
      const rows = this.select(db, m.phase, m.cursor)
      inWriteTransaction(this.index, () => {
        for (const row of rows) {
          const e = this.entry(db, m.phase, row)
          if (e) this.upsert(e, m.generation)
        }
        const last = rows.at(-1),
          cursor = last
            ? m.phase === 5
              ? JSON.stringify([String(last.version_id), String(last.page_index)])
              : String(last.id)
            : ''
        this.index
          .prepare(
            'UPDATE search_meta SET phase=?,cursor=?,processed=processed+?,total=max(total,processed+?) WHERE singleton=1'
          )
          .run(rows.length < batches ? m.phase + 1 : m.phase, cursor, rows.length, rows.length)
      })
      return true
    } catch {
      this.index
        .prepare(
          "UPDATE search_meta SET state='failed',error='Indexing failed; retry or rebuild the local index.' WHERE singleton=1"
        )
        .run()
      operations
        .prepare("UPDATE jobs SET state='failed' WHERE id=? AND kind='search'")
        .run(m.job_id)
      return false
    }
  }
  private finish(db: Database.Database, operations: Database.Database, m: Meta): void {
    inWriteTransaction(this.index, () => {
      const stale = this.index
        .prepare('SELECT id FROM search_entries WHERE generation<>?')
        .iterate(m.generation) as Iterable<{ id: number }>
      const remove = this.index.prepare('DELETE FROM search_fts WHERE rowid=?')
      for (const row of stale) remove.run(row.id)
      this.index.prepare('DELETE FROM search_entries WHERE generation<>?').run(m.generation)
      const latest = head(db)
      this.index
        .prepare(
          "UPDATE search_meta SET state=?,indexed_head=?,phase=0,cursor='',total=processed,error=NULL WHERE singleton=1"
        )
        .run(latest === m.target_head ? 'completed' : 'partial', m.target_head)
    })
    operations
      .prepare("UPDATE jobs SET state='completed',result=? WHERE id=? AND kind='search'")
      .run(JSON.stringify({ indexedHead: m.target_head }), m.job_id)
  }
  activity(db: Database.Database): SearchActivity {
    const m = this.meta(),
      current = head(db)
    if (!this.coverage || this.coverage.head !== current) {
      const pagesWithText = count(db, "SELECT count(*) n FROM source_pages WHERE state='text'")
      const pagesWithoutText = count(db, "SELECT count(*) n FROM source_pages WHERE state<>'text'")
      const missing =
        "FROM sources s LEFT JOIN source_version_selections a ON a.project_id=s.project_id AND a.source_id=s.id LEFT JOIN source_versions v ON v.project_id=a.project_id AND v.id=a.version_id WHERE s.state='active' AND (v.status IS NULL OR v.status<>'indexed')"
      const uninspectedSources = count(db, `SELECT count(*) n ${missing}`)
      const uninspected = (
        db
          .prepare(
            `SELECT s.id,s.metadata,coalesce(v.status,'not_inspected') status ${missing} ORDER BY s.created_at LIMIT 100`
          )
          .all() as { id: string; metadata: string; status: string }[]
      ).map((row) => ({
        id: row.id,
        title: (JSON.parse(row.metadata) as { title: string }).title,
        status: row.status
      }))
      const expected =
        count(db, "SELECT count(*) n FROM documents WHERE kind='text'") +
        count(db, 'SELECT count(*) n FROM notes') +
        count(db, 'SELECT count(*) n FROM sources') +
        count(db, 'SELECT count(*) n FROM research_questions') +
        count(db, 'SELECT count(*) n FROM research_claims') +
        pagesWithText
      this.coverage = {
        head: current,
        expected,
        pagesWithText,
        pagesWithoutText,
        uninspectedSources,
        uninspected
      }
    }
    return {
      state: m.state,
      jobId: m.job_id,
      processed: m.processed,
      total: m.total,
      indexed: count(this.index, 'SELECT count(*) n FROM search_entries'),
      expected: this.coverage.expected,
      indexedHead: m.indexed_head,
      currentHead: current,
      pagesWithText: this.coverage.pagesWithText,
      pagesWithoutText: this.coverage.pagesWithoutText,
      uninspectedSources: this.coverage.uninspectedSources,
      uninspected: this.coverage.uninspected,
      error: m.error
    }
  }
  private status(db: Database.Database, row: Stored): SearchHit['status'] {
    let current: { revision: string; state: string; source_id?: string } | undefined
    if (row.kind === 'draft')
      current = db
        .prepare(
          'SELECT d.revision_id revision,o.state FROM documents d JOIN outline_state o ON o.project_id=d.project_id AND o.document_id=d.id WHERE d.id=?'
        )
        .get(row.entity_id) as typeof current
    else if (row.kind === 'note')
      current = db
        .prepare('SELECT revision_id revision,state FROM notes WHERE id=?')
        .get(row.entity_id) as typeof current
    else if (row.kind === 'source')
      current = db
        .prepare('SELECT revision_id revision,state FROM sources WHERE id=?')
        .get(row.entity_id) as typeof current
    else if (row.kind === 'question' || row.kind === 'claim')
      current = db
        .prepare(
          `SELECT revision_id revision,state FROM research_${row.kind === 'question' ? 'questions' : 'claims'} WHERE id=?`
        )
        .get(row.entity_id) as typeof current
    else
      current = db
        .prepare(
          'SELECT p.text_hash revision,s.state,s.id source_id FROM source_pages p JOIN source_versions v ON v.project_id=p.project_id AND v.id=p.version_id JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id WHERE p.version_id=? AND p.page_index=?'
        )
        .get(row.version_id, row.page_index) as typeof current
    if (!current || ['trashed', 'merged', 'archived', 'folder'].includes(current.state))
      return 'removed'
    if (
      current.revision !== row.revision ||
      (row.kind === 'page' && current.source_id !== row.source_id)
    )
      return 'stale'
    if (row.kind === 'page') {
      const active = db
        .prepare('SELECT version_id FROM source_version_selections WHERE source_id=?')
        .get(row.source_id) as { version_id: string } | undefined
      if (active?.version_id !== row.version_id) return 'older_version'
    }
    return 'current'
  }
  search(db: Database.Database, input: SearchInput): SearchView {
    const activity = this.activity(db),
      query = input.query.trim()
    if (!query) return { activity, hits: [], hasMore: false, offset: input.offset }
    const phrase = `"${query.replaceAll('"', '""')}"`
    const rows = this.index
      .prepare(
        `SELECT e.* FROM search_fts JOIN search_entries e ON e.id=search_fts.rowid WHERE search_fts MATCH ? AND (?='all' OR e.kind=?) AND (? IS NULL OR instr(e.tag_ids,'|'||?||'|')>0) AND (? IS NULL OR instr(e.section_ids,'|'||?||'|')>0) AND (? IS NULL OR e.source_id=?) ORDER BY bm25(search_fts) LIMIT 51 OFFSET ?`
      )
      .all(
        phrase,
        input.kind,
        input.kind,
        input.tagId,
        input.tagId,
        input.documentId,
        input.documentId,
        input.sourceId,
        input.sourceId,
        input.offset
      ) as Stored[]
    const hits = rows.slice(0, 50).map((row) => {
      const content = row.body || row.title,
        at = content.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()),
        start = Math.max(0, at - 90),
        excerpt = content
          .slice(start, start + 400)
          .replace(/\s+/g, ' ')
          .slice(0, 500)
      return {
        key: row.entity_key,
        kind: row.kind,
        entityId: row.entity_id,
        title: row.title,
        excerpt,
        sourceId: row.source_id,
        documentId: row.document_id,
        noteId: row.note_id,
        versionId: row.version_id,
        pageIndex: row.page_index,
        anchorId: row.anchor_id,
        status: this.status(db, row)
      } as SearchHit
    })
    return { activity, hits, hasMore: rows.length > 50, offset: input.offset }
  }
}
