import type Database from 'better-sqlite3'
import { isId } from '../../domain/editor/schema'

export const SEARCH_SCHEMA = `CREATE TABLE IF NOT EXISTS search_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, state TEXT NOT NULL, phase INTEGER NOT NULL, cursor TEXT NOT NULL, generation TEXT NOT NULL, target_head TEXT, indexed_head TEXT, job_id TEXT, processed INTEGER NOT NULL, total INTEGER NOT NULL, error TEXT) STRICT;
      CREATE TABLE IF NOT EXISTS search_entries (id INTEGER PRIMARY KEY, entity_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, source_id TEXT, document_id TEXT, note_id TEXT, version_id TEXT, page_index INTEGER, anchor_id TEXT, section_ids TEXT NOT NULL, tag_ids TEXT NOT NULL, state TEXT NOT NULL, generation TEXT NOT NULL) STRICT;
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(title,body, tokenize='unicode61 remove_diacritics 2');`
const normalized = (sql: string): string =>
  sql
    .toLowerCase()
    .replace(/if not exists /g, '')
    .replace(/\s+/g, ' ')
    .replace(/;$/, '')
    .trim()
/** Schema proof is separate from the reporting filename classification. */
export function searchProjection(
  db: Database.Database,
  operations: Database.Database,
  retained = false
): boolean {
  try {
    const rows = db.prepare('SELECT type,name,sql FROM sqlite_schema LIMIT 20').all() as {
      type: string
      name: string
      sql: string | null
    }[]
    const main = ['search_meta', 'search_entries', 'search_fts']
    const shadows = [
      'search_fts_data',
      'search_fts_idx',
      'search_fts_content',
      'search_fts_docsize',
      'search_fts_config'
    ]
    const statements = SEARCH_SCHEMA.split(';')
      .filter((s) => s.trim())
      .map(normalized)
    if (
      rows.length !== 9 ||
      !rows.every((r) =>
        main.includes(r.name)
          ? r.type === 'table' && !!r.sql && statements.includes(normalized(r.sql))
          : shadows.includes(r.name)
            ? r.type === 'table'
            : r.name === 'sqlite_autoindex_search_entries_1' && r.type === 'index' && r.sql === null
      )
    )
      return false
    const meta = db.prepare('SELECT version,phase,state,job_id FROM search_meta LIMIT 2').all() as {
      version: number
      phase: number
      state: string
      job_id: string | null
    }[]
    if (
      meta.length !== 1 ||
      ![1, 2].includes(meta[0].version) ||
      meta[0].phase < 0 ||
      meta[0].phase > 6 ||
      !['partial', 'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(
        meta[0].state
      )
    )
      return false
    if (meta[0].job_id === null) return !retained
    return (
      isId(meta[0].job_id) &&
      !!operations
        .prepare("SELECT 1 FROM jobs WHERE id=? AND operation_id=? AND kind='search'")
        .get(meta[0].job_id, meta[0].job_id)
    )
  } catch {
    return false
  }
}
