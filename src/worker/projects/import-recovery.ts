import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import {
  isImportRevision,
  isImportMutation,
  type ImportRevision
} from '../../shared/project-import'
import { requestDigest } from '../storage/digest'
import { readGraph } from './import-graphs'
export function evidenceAncestor(
  db: Database.Database,
  projectId: string,
  current: ImportRevision,
  sourceId: string
): boolean {
  if (current.phase !== 'preparing' || !current.graphId) return false
  let id: string | null = current.graphId
  const visited = new Set<string>()
  while (id && visited.size < 1000 && !visited.has(id)) {
    visited.add(id)
    const g: import('../../shared/import-graph').ImportGraph = readGraph(db, projectId, id).manifest
    if (g.batchId !== current.batchId) return false
    const row = db
      .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND id=?')
      .get(projectId, g.revisionId) as { body: string } | undefined
    const r: unknown = row ? JSON.parse(row.body) : null
    if (!isImportRevision(r)) throw new ProjectError('CORRUPT_PROJECT')
    if (
      requestDigest(r.settings) !== requestDigest(current.settings) ||
      requestDigest(r.selectedFileIds) !== requestDigest(current.selectedFileIds)
    )
      return false
    if (g.id === sourceId) return true
    id = g.version === 1 ? null : g.sourceGraphId
  }
  return false
}
/** Explicit transition revision, still on this exact retained selection's ancestry. */
export function hasHybridTransition(
  db: Database.Database,
  projectId: string,
  revisionId: string
): boolean {
  const visited = new Set<string>()
  let id: string | null = revisionId
  while (id && visited.size < 1000 && !visited.has(id)) {
    visited.add(id)
    const row = db
      .prepare('SELECT parent_id,request FROM import_batch_revisions WHERE project_id=? AND id=?')
      .get(projectId, id) as { parent_id: string | null; request: string } | undefined
    if (!row) throw new ProjectError('CORRUPT_PROJECT')
    const m = JSON.parse(row.request)
    if (m.version === 5 && m.action === 'transition-hybrid') return true
    id = row.parent_id
  }
  return false
}

export function partialGraphParent(
  db: Database.Database,
  projectId: string,
  parentId: unknown,
  rawMutation: unknown,
  graph: import('../../shared/import-graph').ImportGraph
): boolean {
  if (typeof parentId !== 'string' || typeof rawMutation !== 'string' || graph.version === 1)
    return false
  const m: unknown = JSON.parse(rawMutation)
  if (
    !isImportMutation(m) ||
    ![6, 7].includes(m.version) ||
    !('sourceGraphId' in m) ||
    m.sourceGraphId !== graph.sourceGraphId ||
    m.expectedRevision !== parentId ||
    m.batchId !== graph.batchId ||
    (m.version === 6) !== (graph.version === 3)
  )
    return false
  const row = db
    .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND id=?')
    .get(projectId, parentId) as { body: string } | undefined
  const r: unknown = row ? JSON.parse(row.body) : null
  return isImportRevision(r) && evidenceAncestor(db, projectId, r, graph.sourceGraphId)
}
