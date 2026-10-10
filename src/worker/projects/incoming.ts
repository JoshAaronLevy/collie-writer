import { retiredWorkspace } from './working-copy-records'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdir, rename, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenInput } from '../../shared/projects'
import { contained, syncDirectory, syncFile, writeJson } from '../storage/files'
import { inWriteTransaction } from '../storage/driver'
import { inspectVersion } from '../storage/schema'
import { readPortableGraph } from './portable-db'
import { validateImportArtifactFiles } from './import-sessions'
import type { SnapshotManifest } from './manifest'
import { writeDestination, type SavedLocation } from './file-state'

/** Promote only an already extracted/validated app-owned directory. A copy gets a new project identity. */
export async function promoteIncoming(
  root: string,
  staging: string,
  manifest: SnapshotManifest,
  copy: boolean,
  destination: SavedLocation | null,
  nativeBinding?: string
): Promise<OpenInput> {
  await contained(root, staging, true)
  const projectId = copy ? randomUUID() : manifest.projectId,
    workspaceId = randomUUID()
  const database = join(staging, 'project.sqlite')
  await contained(root, database, false)
  if (copy) {
    const db = new Database(database, { nativeBinding, fileMustExist: true })
    try {
      db.pragma('trusted_schema=OFF')
      db.pragma('foreign_keys=ON')
      db.pragma('synchronous=FULL')
      inWriteTransaction(db, () => {
        db.pragma('defer_foreign_keys=ON')
        for (const table of [
          'commits',
          'documents',
          'domain_operations',
          'editor_ids',
          'managed_assets',
          ...(inspectVersion(db) >= 3
            ? ['outline_state', 'anchor_targets', 'history_checkpoints', 'history_content']
            : []),
          ...(inspectVersion(db) >= 4
            ? [
                'notes',
                'note_revisions',
                'note_links',
                'note_labels',
                'note_label_links',
                'annotations',
                'annotation_revisions'
              ]
            : []),
          ...(inspectVersion(db) >= 5
            ? [
                'sources',
                'source_revisions',
                'source_aliases',
                'source_links',
                'source_attachments',
                'source_import_reports',
                'source_import_records'
              ]
            : []),
          ...(inspectVersion(db) >= 6
            ? ['source_versions', 'source_version_selections', 'source_pages', 'source_excerpts']
            : []),
          ...(inspectVersion(db) >= 7
            ? [
                'research_questions',
                'research_claims',
                'evidence_links',
                'research_decisions',
                'research_revisions'
              ]
            : []),
          ...(inspectVersion(db) >= 8 ? ['citation_settings', 'citation_occurrences'] : []),
          ...(inspectVersion(db) >= 10 ? ['project_details'] : []),
          ...(inspectVersion(db) >= 12
            ? [
                'proofreading_captures',
                'proofreading_runs',
                'proofreading_findings',
                'proofreading_decisions'
              ]
            : []),
          ...(inspectVersion(db) >= 18 ? ['conversation_memory'] : []),
          ...(inspectVersion(db) >= 19 ? ['conversation_context'] : []),
          ...(inspectVersion(db) >= 20 ? ['conversation_research'] : []),
          ...(inspectVersion(db) >= 21 ? ['conversation_sources'] : []),
          ...(inspectVersion(db) >= 24 ? ['external_conversations', 'external_messages'] : []),
          ...(inspectVersion(db) >= 25 ? ['imported_content_origins'] : []),
          ...(inspectVersion(db) >= 29 ? ['import_receipts', 'import_accepted_items'] : []),
          ...(inspectVersion(db) >= 28
            ? [
                'import_reviews',
                'import_review_revisions',
                'import_review_choices',
                'import_review_state',
                'import_confirmation_manifests',
                'import_confirmation_entries'
              ]
            : []),
          ...(inspectVersion(db) >= 27
            ? [
                'import_analysis_plans',
                'import_analysis_parts',
                'import_analysis_proposals',
                'import_analysis_plan_state'
              ]
            : []),
          ...(inspectVersion(db) >= 26 ? ['import_analysis_captures', 'import_analysis_runs'] : []),
          ...(inspectVersion(db) >= 23 ? ['import_graphs', 'import_graph_pages'] : []),
          ...(inspectVersion(db) >= 22
            ? ['import_batches', 'import_batch_revisions', 'import_files', 'import_artifacts']
            : []),
          ...(inspectVersion(db) >= 11
            ? ['conversations', 'ai_captures', 'conversation_attempts', 'conversation_messages']
            : []),
          ...(inspectVersion(db) >= 9
            ? ['compilation_recipes', 'compilation_recipe_revisions', 'interchange_imports']
            : [])
        ])
          db.prepare(`UPDATE ${table} SET project_id=? WHERE project_id=?`).run(
            projectId,
            manifest.projectId
          )
        db.prepare('UPDATE projects SET id=? WHERE id=?').run(projectId, manifest.projectId)
        const receipts = db
          .prepare('SELECT operation_id,result FROM domain_operations WHERE project_id=?')
          .all(projectId) as { operation_id: string; result: string }[]
        const update = db.prepare(
          'UPDATE domain_operations SET result=? WHERE project_id=? AND operation_id=?'
        )
        for (const row of receipts)
          update.run(
            JSON.stringify({ ...JSON.parse(row.result), projectId }),
            projectId,
            row.operation_id
          )
      })
      const graph = readPortableGraph(db)
      await validateImportArtifactFiles(root, staging, graph.importArtifacts)
    } finally {
      db.close()
    }
  }
  await syncFile(database)
  await rename(database, join(staging, 'working.sqlite'))
  await writeJson(join(staging, 'origin.json'), {
    sourceProjectId: manifest.projectId,
    snapshotId: manifest.snapshotId,
    headCommitId: manifest.headCommitId,
    parentSnapshotId: manifest.parentSnapshotId,
    independentCopy: copy
  })
  if (destination && !copy) await writeDestination(staging, destination)
  const parent = join(root, 'workspaces'),
    project = join(parent, projectId)
  await contained(root, parent, true)
  let created = true
  try {
    await mkdir(project, { mode: 0o700 })
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
      throw error
    created = false
  }
  await contained(root, project, true)
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      await contained(root, join(project, 'owner.sqlite') + suffix, false)
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
        throw error
    }
  }
  const lock = new Database(join(project, 'owner.sqlite'), { nativeBinding, timeout: 0 })
  try {
    lock.pragma('trusted_schema=OFF')
    lock.pragma('journal_mode=DELETE')
    lock.exec('BEGIN EXCLUSIVE')
    const names = await readdir(project)
    // Existing roots are reusable only when every former workspace has durable retirement proof.
    if (
      (!created && (copy || !names.some(isId))) ||
      names.length > 1024 ||
      names.some(
        (name) =>
          name !== 'owner.sqlite' &&
          !(isId(name) && retiredWorkspace(root, { projectId, workspaceId: name }))
      )
    )
      throw new ProjectError('OPERATION_CONFLICT')
    await rename(staging, join(project, workspaceId))
    await syncDirectory(project)
    await syncDirectory(parent)
  } finally {
    lock.close()
  }
  return { projectId, workspaceId }
}
