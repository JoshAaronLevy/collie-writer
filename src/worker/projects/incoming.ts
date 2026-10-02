import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenInput } from '../../shared/projects'
import { contained, syncDirectory, syncFile, writeJson } from '../storage/files'
import { inWriteTransaction } from '../storage/driver'
import { inspectVersion } from '../storage/schema'
import { readPortableGraph } from './portable-db'
import type { SnapshotManifest } from './manifest'
import { writeDestination, type SavedLocation } from './file-state'

/** Promote only an already extracted/validated app-owned directory. A copy gets a new project identity. */
export async function promoteIncoming(root: string, staging: string, manifest: SnapshotManifest, copy: boolean, destination: SavedLocation | null, nativeBinding?: string): Promise<OpenInput> {
  await contained(root, staging, true)
  const projectId = copy ? randomUUID() : manifest.projectId, workspaceId = randomUUID()
  const database = join(staging, 'project.sqlite')
  await contained(root, database, false)
  if (copy) {
    const db = new Database(database, { nativeBinding, fileMustExist: true })
    try {
      db.pragma('trusted_schema=OFF'); db.pragma('foreign_keys=ON'); db.pragma('synchronous=FULL')
      inWriteTransaction(db, () => {
        db.pragma('defer_foreign_keys=ON')
        for (const table of ['commits','documents','domain_operations','editor_ids','managed_assets', ...(inspectVersion(db) >= 3 ? ['outline_state','anchor_targets','history_checkpoints','history_content'] : []), ...(inspectVersion(db) >= 4 ? ['notes','note_revisions','note_links','note_labels','note_label_links','annotations','annotation_revisions'] : []), ...(inspectVersion(db) >= 5 ? ['sources','source_revisions','source_aliases','source_links','source_attachments','source_import_reports','source_import_records'] : []), ...(inspectVersion(db) >= 6 ? ['source_versions','source_version_selections','source_pages','source_excerpts'] : []), ...(inspectVersion(db) >= 7 ? ['research_questions','research_claims','evidence_links','research_decisions','research_revisions'] : []), ...(inspectVersion(db) >= 8 ? ['citation_settings','citation_occurrences'] : []), ...(inspectVersion(db) >= 10 ? ['project_details'] : []), ...(inspectVersion(db) >= 9 ? ['compilation_recipes','compilation_recipe_revisions','interchange_imports'] : [])]) db.prepare(`UPDATE ${table} SET project_id=? WHERE project_id=?`).run(projectId, manifest.projectId)
        db.prepare('UPDATE projects SET id=? WHERE id=?').run(projectId, manifest.projectId)
        const receipts = db.prepare('SELECT operation_id,result FROM domain_operations WHERE project_id=?').all(projectId) as { operation_id: string; result: string }[]
        const update = db.prepare('UPDATE domain_operations SET result=? WHERE project_id=? AND operation_id=?')
        for (const row of receipts) update.run(JSON.stringify({ ...JSON.parse(row.result), projectId }), projectId, row.operation_id)
      })
      readPortableGraph(db)
    } finally { db.close() }
  }
  await syncFile(database)
  await rename(database, join(staging, 'working.sqlite'))
  await writeJson(join(staging, 'origin.json'), { sourceProjectId: manifest.projectId, snapshotId: manifest.snapshotId, headCommitId: manifest.headCommitId, parentSnapshotId: manifest.parentSnapshotId, independentCopy: copy })
  if (destination && !copy) await writeDestination(staging, destination)
  const parent = join(root, 'workspaces'), project = join(parent, projectId)
  await contained(root, parent, true)
  await mkdir(project, { mode: 0o700 }) // Never replace an existing local workspace.
  await rename(staging, join(project, workspaceId))
  await syncDirectory(project); await syncDirectory(parent)
  return { projectId, workspaceId }
}
