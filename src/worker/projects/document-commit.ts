import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { isId, readDocument } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { effectiveState, isEditableKind } from '../../shared/outline'
import type { CommitInput, CommitReceipt, OpenProject } from '../../shared/projects'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { automaticCheckpoint, indexDocumentIds, updateDocumentAnchors } from './manuscript'
import { mapDocumentAnnotations, reconcileAnnotationAnchors } from './notes'
import { projectCitations } from './citation-occurrences'

/** Runs only inside the repository's admitted, serialized workspace owner. */
export function commitManuscript(
  db: Database.Database,
  input: CommitInput,
  readSelected: () => OpenProject
): CommitReceipt {
  const payload = readDocument(input.payload)
  // References must resolve within this project, including retained source aliases after a merge.
  const references = (v: unknown): boolean =>
    !!v &&
    typeof v === 'object' &&
    Object.entries(v).some(
      ([key, child]) =>
        (key === 'sourceId' &&
          (!isId(child) ||
            !db
              .prepare(
                'SELECT 1 FROM sources WHERE project_id=? AND id=? UNION SELECT 1 FROM source_aliases WHERE project_id=? AND alias=?'
              )
              .get(input.projectId, child, input.projectId, child))) ||
        (key === 'assetId' &&
          !db
            .prepare('SELECT id FROM managed_assets WHERE project_id=? AND id=?')
            .get(input.projectId, child)) ||
        references(child)
    )
  if (references(payload)) throw new ProjectError('VALIDATION')
  const digest = requestDigest(input)
  return inWriteTransaction(db, () => {
    const prior = db
      .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
      .get(input.projectId, input.operationId) as { digest: string; result: string } | undefined
    if (prior) {
      if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
      return JSON.parse(prior.result) as CommitReceipt
    }
    const document = db
      .prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?')
      .get(input.projectId, input.documentId) as { revision_id: string } | undefined
    if (!document) throw new ProjectError('NOT_FOUND')
    if (document.revision_id !== input.expectedRevisionId) throw new ProjectError('STALE_REVISION')
    const selected = readSelected()
    const summary = selected.documents.find((d) => d.id === input.documentId)!
    if (
      !summary ||
      !isEditableKind(summary.kind) ||
      effectiveState(summary, selected.documents) !== 'active'
    )
      throw new ProjectError('VALIDATION')
    const revisionId = randomUUID(),
      headCommitId = randomUUID(),
      time = new Date().toISOString()
    db.prepare('DELETE FROM editor_ids WHERE project_id=? AND document_id=?').run(
      input.projectId,
      input.documentId
    )
    indexDocumentIds(db, input.projectId, input.documentId, payload)
    mapDocumentAnnotations(db, input.projectId, input.documentId, selected.payload, payload)
    updateDocumentAnchors(db, input.projectId, input.documentId, payload)
    projectCitations(db, input.projectId, input.documentId, payload)
    reconcileAnnotationAnchors(db, input.projectId)
    db.prepare('UPDATE documents SET revision_id=?,payload=? WHERE project_id=? AND id=?').run(
      revisionId,
      JSON.stringify(payload),
      input.projectId,
      input.documentId
    )
    db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(
      input.projectId,
      headCommitId,
      selected.headCommitId,
      time
    )
    db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(
      headCommitId,
      time,
      input.projectId
    )
    automaticCheckpoint(db, input.projectId)
    const receipt = {
      projectId: input.projectId,
      documentId: input.documentId,
      revisionId,
      headCommitId
    }
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
      input.projectId,
      input.operationId,
      digest,
      JSON.stringify(receipt)
    )
    return receipt
  })
}
