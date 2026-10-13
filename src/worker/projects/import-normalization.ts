import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import type { GraphRecord, GraphRelation, ImportGraph } from '../../shared/import-graph'
import {
  isLocalImportEvidence,
  isMappedImportEvidence,
  isSemanticImportEvidence,
  type SemanticImportEvidence,
  type MappedImportEvidence,
  type LocalImportEvidence
} from '../../shared/import-normalization'
import type { ImportReview } from '../../shared/import-review'
import { isImportRevision, type ImportSettings } from '../../shared/project-import'
import { requestDigest } from '../storage/digest'
import { readGraph } from './import-graphs'

const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
export type LocalImportReview = Extract<ImportReview, { version: 3 | 4 | 5 }>

/** Only the existing reader's eligible original representations can become candidates. */
export const localCandidate = (r: GraphRecord): boolean =>
  r.eligible &&
  r.disposition === 'candidate' &&
  ['conversation', 'message', 'source', 'note'].includes(r.kind)

export function localRecordEvidence(
  records: GraphRecord[],
  relations: GraphRelation[]
): Pick<LocalImportEvidence, 'recordsDigest' | 'relationsDigest'> {
  return {
    recordsDigest: requestDigest(records),
    relationsDigest: requestDigest(relations)
  }
}
export function unresolvedLocalRecords(
  records: GraphRecord[],
  settings: ImportSettings
): GraphRecord[] {
  return records.filter((r) => {
    const category =
      r.kind === 'conversation' || r.kind === 'message'
        ? 'chats'
        : r.kind === 'source'
          ? 'sources'
          : r.kind === 'note'
            ? 'notes'
            : null
    return (
      (!category || settings.categories.includes(category)) &&
      (r.disposition === 'unsupported' || r.disposition === 'unresolved' || r.path === 'unresolved')
    )
  })
}
export const localHasOmissions = (
  e: LocalImportEvidence | MappedImportEvidence | SemanticImportEvidence
): boolean =>
  (e.kind === 'ai-interpretation' && e.unresolvedTasks > 0) ||
  e.coverage.unreadFiles > 0 ||
  e.coverage.unresolvedRecords > 0

export function localCoverage(
  graph: ImportGraph,
  records: GraphRecord[],
  settings: ImportSettings
): LocalImportEvidence['coverage'] {
  const candidates = records.filter(localCandidate).length
  return {
    records: records.length,
    candidates,
    retained: records.length - candidates,
    unreadFiles: graph.files.filter((f) => f.status !== 'read').length,
    unresolvedRecords: unresolvedLocalRecords(records, settings).length
  }
}
export function localGraphSettings(
  db: Database.Database,
  projectId: string,
  graph: ImportGraph
): LocalImportEvidence['settings'] {
  const row = db
    .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND batch_id=? AND id=?')
    .get(projectId, graph.batchId, graph.revisionId) as { body: string } | undefined
  if (!row) return corrupt()
  const revision: unknown = JSON.parse(row.body)
  if (
    !isImportRevision(revision) ||
    revision.id !== graph.revisionId ||
    revision.batchId !== graph.batchId ||
    revision.graphId !== graph.id ||
    requestDigest(revision.selectedFileIds) !== requestDigest(graph.files.map((f) => f.fileId))
  )
    return corrupt()
  return revision.settings
}
/** SQL admission binds the compact result to immutable settings and every protected graph page. */
export function validateLocalReview(
  db: Database.Database,
  projectId: string,
  review: LocalImportReview
): void {
  const { manifest: graph, pages } = readGraph(db, projectId, review.graphId),
    e = review.evidence
  if (
    !(review.version === 5
      ? isSemanticImportEvidence(e)
      : review.version === 4
        ? isMappedImportEvidence(e)
        : isLocalImportEvidence(e)) ||
    graph.version !== (review.version === 5 ? 3 : review.version === 4 ? 2 : 1) ||
    (review.version === 5 &&
      (graph.version !== 3 ||
        review.evidence.sourceGraphId !== graph.sourceGraphId ||
        review.evidence.unresolvedTasks !== graph.unresolvedTasks ||
        requestDigest(review.evidence.semantic) !== requestDigest(graph.semantic))) ||
    (review.version === 4 &&
      (graph.version !== 2 ||
        review.evidence.sourceGraphId !== graph.sourceGraphId ||
        requestDigest(review.evidence.mappings) !== requestDigest(graph.mappings))) ||
    graph.batchId !== review.batchId ||
    graph.digest !== review.graphDigest ||
    e.readerVersion !== graph.readerVersion ||
    e.revisionId !== graph.revisionId ||
    e.pagesDigest !== requestDigest(pages) ||
    requestDigest(e.settings) !== requestDigest(localGraphSettings(db, projectId, graph)) ||
    e.coverage.records !== graph.records ||
    e.coverage.unreadFiles !== graph.files.filter((f) => f.status !== 'read').length
  )
    return corrupt()
}
/** Blob admission and live preparation resolve evidence against all records, never a sampled prefix. */
export function validateLocalRecords(
  review: LocalImportReview,
  records: GraphRecord[],
  relations: GraphRelation[]
): void {
  const actual = localRecordEvidence(records, relations),
    e = review.evidence,
    candidates = records.filter(localCandidate).length
  if (
    e.recordsDigest !== actual.recordsDigest ||
    e.relationsDigest !== actual.relationsDigest ||
    e.coverage.records !== records.length ||
    e.coverage.candidates !== candidates ||
    e.coverage.retained !== records.length - candidates ||
    e.coverage.unresolvedRecords !== unresolvedLocalRecords(records, e.settings).length
  )
    return corrupt()
}
