import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'

export const PROJECT_APPLICATION_ID = 1129270359
export const PROJECT_SCHEMA_VERSION = 5
// Persisted schema is app-owned; never execute DDL or migrations supplied by a project.
export const projectTablesV1 = [
  `CREATE TABLE format (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, minimum_reader INTEGER NOT NULL, editor_version INTEGER NOT NULL) STRICT`,
  `CREATE TABLE commits (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,parent_id) REFERENCES commits(project_id,id)) STRICT`,
  `CREATE TABLE projects (id TEXT PRIMARY KEY, template TEXT NOT NULL, title TEXT NOT NULL, locale TEXT NOT NULL, head_commit_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(id,head_commit_id) REFERENCES commits(project_id,id)) STRICT`,
  `CREATE TABLE documents (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, synopsis TEXT NOT NULL, revision_id TEXT NOT NULL, editor_version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,parent_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE domain_operations (project_id TEXT NOT NULL, operation_id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(project_id,operation_id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE editor_ids (project_id TEXT NOT NULL, id TEXT NOT NULL, document_id TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`
] as const
export const assetTable = `CREATE TABLE managed_assets (project_id TEXT NOT NULL, id TEXT NOT NULL, original_name TEXT NOT NULL, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK(byte_size>=0), sha256 TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`
export const outlineTables = [
  `CREATE TABLE history_content (project_id TEXT NOT NULL, id TEXT NOT NULL, content TEXT NOT NULL, byte_size INTEGER NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE outline_state (project_id TEXT NOT NULL, document_id TEXT NOT NULL, state TEXT NOT NULL, replacement_id TEXT, PRIMARY KEY(project_id,document_id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id), FOREIGN KEY(project_id,replacement_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE anchor_targets (project_id TEXT NOT NULL, id TEXT NOT NULL, document_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, replacement_id TEXT, label TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id), FOREIGN KEY(project_id,replacement_id) REFERENCES anchor_targets(project_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`,
  `CREATE TABLE history_checkpoints (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, head_commit_id TEXT NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, title TEXT NOT NULL, snapshot TEXT NOT NULL, byte_size INTEGER NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,head_commit_id) REFERENCES commits(project_id,id)) STRICT`
] as const
export const projectTablesV2 = [...projectTablesV1, assetTable] as const
export const projectTablesV3 = [...projectTablesV2, ...outlineTables] as const
export const noteTables = [
  `CREATE TABLE notes (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE note_revisions (project_id TEXT NOT NULL, note_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,note_id,revision_id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id)) STRICT`,
  `CREATE TABLE note_links (project_id TEXT NOT NULL, note_id TEXT NOT NULL, document_id TEXT NOT NULL, PRIMARY KEY(project_id,note_id,document_id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE note_labels (project_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, normalized TEXT NOT NULL, state TEXT NOT NULL, revision_id TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE note_label_links (project_id TEXT NOT NULL, note_id TEXT NOT NULL, label_id TEXT NOT NULL, PRIMARY KEY(project_id,note_id,label_id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id), FOREIGN KEY(project_id,label_id) REFERENCES note_labels(project_id,id)) STRICT`,
  `CREATE TABLE annotations (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, document_id TEXT NOT NULL, block_id TEXT NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, quote TEXT NOT NULL, interpretation TEXT NOT NULL, state TEXT NOT NULL, anchor_state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE annotation_revisions (project_id TEXT NOT NULL, annotation_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,annotation_id,revision_id), FOREIGN KEY(project_id,annotation_id) REFERENCES annotations(project_id,id)) STRICT`
] as const
export const projectTablesV4 = [...projectTablesV3, ...noteTables] as const
export const sourceTables = [
  `CREATE TABLE sources (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, metadata TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','trashed','merged')), replacement_id TEXT, verified INTEGER NOT NULL CHECK(verified IN (0,1)), provenance TEXT NOT NULL, raw_import TEXT, unknown_fields TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,replacement_id) REFERENCES sources(project_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`,
  `CREATE TABLE source_revisions (project_id TEXT NOT NULL, source_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,source_id,revision_id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)) STRICT`,
  `CREATE TABLE source_aliases (project_id TEXT NOT NULL, alias TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(project_id,alias), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)) STRICT`,
  `CREATE TABLE source_links (project_id TEXT NOT NULL, source_id TEXT NOT NULL, document_id TEXT NOT NULL, PRIMARY KEY(project_id,source_id,document_id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE source_attachments (project_id TEXT NOT NULL, id TEXT NOT NULL, source_id TEXT NOT NULL, asset_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','removed')), created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES managed_assets(project_id,id)) STRICT`,
  `CREATE TABLE source_import_reports (project_id TEXT NOT NULL, id TEXT NOT NULL, format TEXT NOT NULL, report TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE source_import_records (project_id TEXT NOT NULL, report_id TEXT NOT NULL, record_index INTEGER NOT NULL, raw_record TEXT NOT NULL, unknown_fields TEXT NOT NULL, action TEXT NOT NULL, source_id TEXT, error TEXT, PRIMARY KEY(project_id,report_id,record_index), FOREIGN KEY(project_id,report_id) REFERENCES source_import_reports(project_id,id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`
] as const
export const projectTables = [...projectTablesV4, ...sourceTables] as const
const sqlKey = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

export function createProjectSchema(db: Database.Database): void {
  for (const statement of projectTables) db.exec(statement)
  db.prepare('INSERT INTO format VALUES (1,?,?,?)').run(PROJECT_SCHEMA_VERSION, PROJECT_SCHEMA_VERSION, 1)
  db.pragma(`application_id = ${PROJECT_APPLICATION_ID}`)
  db.pragma(`user_version = ${PROJECT_SCHEMA_VERSION}`)
}
export function inspectVersion(db: Database.Database): number {
  db.pragma('trusted_schema = OFF')
  if (db.pragma('application_id', { simple: true }) !== PROJECT_APPLICATION_ID) throw new ProjectError('CORRUPT_PROJECT')
  const version = db.pragma('user_version', { simple: true }) as number
  if (!Number.isInteger(version) || version < 1) throw new ProjectError('CORRUPT_PROJECT')
  if (version > PROJECT_SCHEMA_VERSION) throw new ProjectError('FORMAT_TOO_NEW')
  return version
}
export function validateProjectSchema(db: Database.Database, expectedVersion = PROJECT_SCHEMA_VERSION): void {
  const version = inspectVersion(db)
  if (version !== expectedVersion) throw new ProjectError('MIGRATION_FAILED')
  const objects = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { sql: string | null }[]
  const expected = new Set((expectedVersion === 1 ? projectTablesV1 : expectedVersion === 2 ? projectTablesV2 : expectedVersion === 3 ? projectTablesV3 : expectedVersion === 4 ? projectTablesV4 : projectTables).map(sqlKey))
  if (objects.length !== expected.size || objects.some(o => !o.sql || !expected.has(sqlKey(o.sql)))) throw new ProjectError('CORRUPT_PROJECT')
  const format = db.prepare('SELECT * FROM format').all() as { schema_version: number; minimum_reader: number; editor_version: number }[]
  if (format.length !== 1 || format[0].minimum_reader > PROJECT_SCHEMA_VERSION || format[0].editor_version > 1) throw new ProjectError('FORMAT_TOO_NEW')
  if (format[0].schema_version !== version || format[0].editor_version !== 1 || format[0].minimum_reader !== expectedVersion) throw new ProjectError('CORRUPT_PROJECT')
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new ProjectError('CORRUPT_PROJECT')
}
