import { importBatchAccepted } from './import-identities'
import { validatePortableImportCommits } from './import-commit'
import { validatePortableImportAnalysis } from './import-analysis'
import { importContentCommand } from './import-content'
import { validateImportedContent } from './imported-provenance'
import {
  prepareImportGraph,
  installImportGraph,
  validatePortableImportGraphs,
  GraphArtifactValidator,
  readImportBlob,
  type ImportArtifactRef
} from './import-graphs'
import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { unlink, writeFile } from 'node:fs/promises'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import {
  IMPORT_LIMITS,
  isImportArtifact,
  isImportFile,
  isImportMutation,
  isImportReceipt,
  isImportRevision,
  importTime,
  type ImportArtifact,
  type ImportFile,
  type ImportMutation,
  type ImportRevision,
  type ImportSessionReceipt,
  type ImportValue,
  type ImportWorkerInput
} from '../../shared/project-import'
import { record, type OpenInput } from '../../shared/projects'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { contained } from '../storage/files'
import { stageBlob } from './blobs'
import { requireSpace } from './streams'
import { analysisReservedBytes } from './import-analysis-budget'
import { LIMITS, type BlobRef } from './manifest'

export const IMPORT_ORIGINAL_MEDIA = 'application/octet-stream'
export const IMPORT_ARTIFACT_MEDIA = 'application/vnd.collie.import+json'
type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
type RevisionRow = {
  project_id: string
  id: string
  batch_id: string
  parent_id: string | null
  operation_id: string
  head_commit_id: string
  request: string
  body: string
  artifact_id: string
}
type StoredBatch = { id: string; current_revision_id: string; created_at: string }
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
function parse<T>(body: string, accepts: (v: unknown) => v is T): T {
  if (typeof body !== 'string' || body.length > IMPORT_LIMITS.descriptorUnits) return corrupt()
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return corrupt()
  }
  // These are app-authored immutable envelopes, never permissively parsed user exports.
  if (!accepts(value) || JSON.stringify(value) !== body) return corrupt()
  return value
}
export function importMutationDigest(mutation: ImportMutation): string {
  return requestDigest({ contract: `project-import-command-v${mutation.version}`, mutation })
}
function contentDigest(label: string, value: ImportRevision | ImportArtifact): string {
  const content: Partial<ImportRevision | ImportArtifact> = { ...value }
  delete content.digest
  return requestDigest({ contract: label, content })
}
function batch(db: Database.Database, projectId: string, id: string): StoredBatch {
  const value = db
    .prepare(
      'SELECT id,current_revision_id,created_at FROM import_batches WHERE project_id=? AND id=?'
    )
    .get(projectId, id) as StoredBatch | undefined
  if (!value) throw new ProjectError('NOT_FOUND')
  if (!isId(value.id) || !isId(value.current_revision_id) || !importTime(value.created_at))
    return corrupt()
  return value
}
function revision(
  db: Database.Database,
  projectId: string,
  batchId: string,
  id: string
): ImportRevision {
  const row = db
    .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND batch_id=? AND id=?')
    .get(projectId, batchId, id) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  const value = parse(row.body, isImportRevision)
  if (
    value.id !== id ||
    value.batchId !== batchId ||
    value.digest !== contentDigest(`project-import-revision-v${value.version}`, value)
  )
    return corrupt()
  return value
}
function files(db: Database.Database, projectId: string, batchId: string): ImportFile[] {
  const values: ImportFile[] = []
  for (const raw of db
    .prepare(
      'SELECT id,asset_id,body FROM import_files WHERE project_id=? AND batch_id=? ORDER BY id'
    )
    .iterate(projectId, batchId)) {
    if (values.length >= IMPORT_LIMITS.files) return corrupt()
    const row = raw as { id: string; asset_id: string; body: string },
      value = parse(row.body, isImportFile)
    if (value.batchId !== batchId || value.id !== row.id || value.assetId !== row.asset_id)
      return corrupt()
    values.push(value)
  }
  values.sort((a, b) => a.order - b.order)
  if (
    values.some((f, i) => f.order !== i) ||
    values.reduce((n, f) => n + f.bytes, 0) > IMPORT_LIMITS.batchBytes
  )
    return corrupt()
  return values
}
/** Intake coverage makes no claims about extracted records or AI analysis. */
function intakeBytes(value: ImportRevision, retained: ImportFile[]): Buffer {
  const selected = value.selectedFileIds.map((id) => {
    const file = retained.find((f) => f.id === id)
    if (!file) return corrupt()
    return { fileId: id, sha256: file.sha256, bytes: file.bytes, disposition: 'unprocessed' }
  })
  return Buffer.from(
    JSON.stringify({
      version: 1,
      kind: 'intake-v1',
      batchId: value.batchId,
      revisionId: value.id,
      selected,
      selectedBytes: selected.reduce((n, f) => n + f.bytes, 0),
      graphId: null,
      proposalId: null,
      analyzedRecords: 0,
      acceptedRecords: 0
    }),
    'utf8'
  )
}
function lookup(
  db: Database.Database,
  projectId: string,
  mutation: ImportMutation
): ImportSessionReceipt | null {
  const row = db
    .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
    .get(projectId, mutation.operationId) as { digest: string; result: string } | undefined
  if (!row) return null
  if (row.digest !== importMutationDigest(mutation)) throw new ProjectError('OPERATION_CONFLICT')
  const receipt = parse(row.result, isImportReceipt)
  if (
    receipt.projectId !== projectId ||
    receipt.batchId !== mutation.batchId ||
    !validateImportOperation(db, projectId, mutation.operationId, row.digest, receipt)
  )
    return corrupt()
  return receipt
}
/** This result branch is valid only at schema 22+, after exact schema admission. */
export function validateImportOperation(
  db: Database.Database,
  projectId: string,
  operationId: string,
  digest: string,
  result: unknown
): boolean {
  if (!isImportReceipt(result) || result.projectId !== projectId) return false
  const row = db
    .prepare('SELECT * FROM import_batch_revisions WHERE project_id=? AND batch_id=? AND id=?')
    .get(projectId, result.batchId, result.revisionId) as RevisionRow | undefined
  if (!row || row.operation_id !== operationId || row.head_commit_id !== result.headCommitId)
    return false
  const mutation = parse(row.request, isImportMutation)
  return (
    mutation.operationId === operationId &&
    mutation.batchId === result.batchId &&
    importMutationDigest(mutation) === digest
  )
}
function readValue(ctx: Context, input: ImportWorkerInput): ImportValue {
  if (input.action === 'lookup')
    return {
      type: 'receipt',
      operationId: input.mutation.operationId,
      receipt: lookup(ctx.db, ctx.projectId, input.mutation)
    }
  if (input.action === 'read') {
    const stored = batch(ctx.db, ctx.projectId, input.batchId),
      retained = files(ctx.db, ctx.projectId, input.batchId)
    return {
      type: 'batch',
      revision: revision(
        ctx.db,
        ctx.projectId,
        input.batchId,
        input.revisionId ?? stored.current_revision_id
      ),
      files: retained.slice(input.offset, input.offset + IMPORT_LIMITS.page),
      totalFiles: retained.length,
      nextOffset:
        input.offset + IMPORT_LIMITS.page < retained.length
          ? input.offset + IMPORT_LIMITS.page
          : null
    }
  }
  if (input.action !== 'list') throw new ProjectError('VALIDATION')
  const total = count(ctx.db, 'import_batches', ctx.projectId)
  if (total > IMPORT_LIMITS.batches) return corrupt()
  const rows = ctx.db
    .prepare(
      'SELECT id,current_revision_id,created_at FROM import_batches WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?'
    )
    .all(ctx.projectId, IMPORT_LIMITS.page, input.offset) as StoredBatch[]
  return {
    type: 'batches',
    total,
    nextOffset:
      input.offset + IMPORT_LIMITS.page < total ? input.offset + IMPORT_LIMITS.page : null,
    batches: rows.map((stored) => {
      const value = revision(ctx.db, ctx.projectId, stored.id, stored.current_revision_id),
        retained = files(ctx.db, ctx.projectId, stored.id)
      return {
        id: stored.id,
        revisionId: value.id,
        phase: importBatchAccepted(ctx.db, ctx.projectId, stored.id) ? 'completed' : value.phase,
        createdAt: stored.created_at,
        selectedFiles: value.selectedFileIds.length,
        retainedFiles: retained.length,
        retainedBytes: retained.reduce((n, f) => n + f.bytes, 0)
      }
    })
  }
}
function count(
  db: Database.Database,
  table: 'import_batches' | 'managed_assets',
  projectId: string
): number {
  return (
    db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id=?`).get(projectId) as {
      n: number
    }
  ).n
}
function nextContent(
  mutation: ImportMutation,
  previous: ImportRevision | null
): Pick<ImportRevision, 'phase' | 'selectedFileIds' | 'settings'> {
  if (mutation.action === 'create') {
    if (previous) throw new ProjectError('OPERATION_CONFLICT')
    return { phase: 'preparing', selectedFileIds: [], settings: mutation.settings }
  }
  if (!previous || previous.id !== mutation.expectedRevision)
    throw new ProjectError('STALE_REVISION')
  if (previous.phase === 'discarded') throw new ProjectError('OPERATION_CONFLICT')
  if (mutation.action === 'configure')
    return {
      phase: 'preparing',
      settings: mutation.settings,
      selectedFileIds: mutation.selectedFileIds
    }
  return {
    phase: mutation.action === 'discard' ? 'discarded' : 'preparing',
    settings: previous.settings,
    selectedFileIds:
      mutation.action === 'add-file'
        ? [...previous.selectedFileIds, mutation.file.id]
        : previous.selectedFileIds
  }
}
export async function importSessionCommand(
  ctx: Context,
  input: ImportWorkerInput
): Promise<ImportValue> {
  if (input.action === 'content-origins') return importContentCommand(ctx, input)
  if (input.action !== 'mutate' && input.action !== 'stage-file') return readValue(ctx, input)
  const mutation = input.mutation,
    existing = lookup(ctx.db, ctx.projectId, mutation)
  // Outcome reconciliation precedes path inspection, capacity and current-revision checks.
  if (existing) return { type: 'receipt', operationId: mutation.operationId, receipt: existing }
  if (importBatchAccepted(ctx.db, ctx.projectId, mutation.batchId))
    throw new ProjectError('OPERATION_CONFLICT')
  const stored =
    mutation.action === 'create' ? null : batch(ctx.db, ctx.projectId, mutation.batchId)
  const previous = stored
    ? revision(ctx.db, ctx.projectId, mutation.batchId, stored.current_revision_id)
    : null
  const content = nextContent(mutation, previous),
    retained = stored ? files(ctx.db, ctx.projectId, mutation.batchId) : []
  const active = ctx.db
    .prepare(
      "SELECT count(*) AS n FROM import_batches b JOIN import_batch_revisions r ON r.project_id=b.project_id AND r.batch_id=b.id AND r.id=b.current_revision_id WHERE b.project_id=? AND json_extract(r.body,'$.phase')!='discarded' AND NOT EXISTS (SELECT 1 FROM import_receipts c WHERE c.project_id=b.project_id AND c.batch_id=b.id)"
    )
    .get(ctx.projectId) as { n: number }
  if (mutation.action === 'create') {
    if (count(ctx.db, 'import_batches', ctx.projectId) >= IMPORT_LIMITS.batches)
      throw new ProjectError('LIMIT_EXCEEDED')
    if (active.n >= IMPORT_LIMITS.activeBatches) throw new ProjectError('LIMIT_EXCEEDED')
    if (
      ctx.db
        .prepare('SELECT 1 FROM import_batches WHERE project_id=? AND id=?')
        .get(ctx.projectId, mutation.batchId)
    )
      throw new ProjectError('OPERATION_CONFLICT')
  }
  const revisions = ctx.db
    .prepare('SELECT count(*) AS n FROM import_batch_revisions WHERE project_id=? AND batch_id=?')
    .get(ctx.projectId, mutation.batchId) as { n: number }
  // Keep one final revision available for explicit discard at the cap.
  if (revisions.n >= IMPORT_LIMITS.revisions - (mutation.action === 'discard' ? 0 : 1))
    throw new ProjectError('LIMIT_EXCEEDED')
  const remainingActive =
    active.n + (mutation.action === 'create' ? 1 : mutation.action === 'discard' ? -1 : 0)
  const newAssets = mutation.action === 'add-file' ? 2 : 1
  if (
    count(ctx.db, 'managed_assets', ctx.projectId) + newAssets + remainingActive >
    LIMITS.entries - 16
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  const time = new Date().toISOString(),
    artifactId = randomUUID(),
    artifactAssetId = randomUUID()
  let added: ImportFile | null = null
  if (mutation.action === 'add-file') {
    if (input.action !== 'stage-file' || !isAbsolute(input.sourcePath))
      throw new ProjectError('DENIED')
    if (
      retained.length >= IMPORT_LIMITS.files ||
      retained.reduce((n, f) => n + f.bytes, 0) + mutation.file.bytes > IMPORT_LIMITS.batchBytes
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    if (
      ctx.db
        .prepare('SELECT 1 FROM import_files WHERE project_id=? AND id=?')
        .get(ctx.projectId, mutation.file.id) ||
      ctx.db
        .prepare('SELECT 1 FROM managed_assets WHERE project_id=? AND id=?')
        .get(ctx.projectId, mutation.file.assetId)
    )
      throw new ProjectError('OPERATION_CONFLICT')
    added = {
      version: 1,
      ...mutation.file,
      batchId: mutation.batchId,
      order: retained.length,
      createdAt: time
    }
    retained.push(added)
  }
  if (content.selectedFileIds.some((id) => !retained.some((f) => f.id === id)))
    throw new ProjectError('VALIDATION')
  const revisionId = randomUUID()
  const graph =
    mutation.action === 'prepare-graph'
      ? await prepareImportGraph(ctx, previous!, revisionId, time, retained, content.settings)
      : null
  const value: ImportRevision = {
    version: graph ? 2 : 1,
    id: revisionId,
    batchId: mutation.batchId,
    parentRevisionId: previous?.id ?? null,
    ...content,
    retention: 'whole-originals',
    intakeArtifactId: artifactId,
    graphId: graph?.manifest.id ?? null,
    planId: null,
    proposalId: null,
    reviewId: null,
    receiptId: null,
    createdAt: time,
    digest: ''
  }
  value.digest = contentDigest(`project-import-revision-v${value.version}`, value)
  const bytes = intakeBytes(value, retained)
  const used = ctx.db
    .prepare(
      'SELECT coalesce(sum(byte_size),0) AS n FROM managed_assets WHERE project_id=? AND (id IN (SELECT asset_id FROM import_artifacts WHERE project_id=? AND batch_id=?) OR id IN (SELECT p.asset_id FROM import_graph_pages p JOIN import_graphs g ON g.project_id=p.project_id AND g.id=p.graph_id WHERE g.project_id=? AND g.batch_id=?))'
    )
    .get(ctx.projectId, ctx.projectId, mutation.batchId, ctx.projectId, mutation.batchId) as {
    n: number
  }
  if (
    bytes.length > IMPORT_LIMITS.artifactBytes ||
    used.n +
      analysisReservedBytes(ctx.db, ctx.projectId, mutation.batchId) +
      (graph?.pages.reduce((n, p) => n + p.descriptor.bytes, 0) ?? 0) +
      bytes.length +
      (mutation.action === 'discard' ? 0 : IMPORT_LIMITS.artifactBytes) >
      IMPORT_LIMITS.derivedBytes
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  // Original plus temporary artifact, SQL/WAL growth and rollback reserve; Save/migration budget separately.
  const databaseBytes =
    Number(ctx.db.pragma('page_count', { simple: true })) *
    Number(ctx.db.pragma('page_size', { simple: true }))
  if (!Number.isSafeInteger(databaseBytes) || databaseBytes + 8 * 1024 ** 2 > LIMITS.database)
    throw new ProjectError('LIMIT_EXCEEDED')
  await requireSpace(ctx.workspace, (added?.bytes ?? 0) + bytes.length * 2 + 8 * 1024 ** 2)
  if (input.action === 'stage-file') {
    const original = await stageBlob(
      ctx.root,
      ctx.workspace,
      input.sourcePath,
      undefined,
      undefined,
      IMPORT_LIMITS.fileBytes
    )
    if (
      original.sha256 !== input.mutation.file.sha256 ||
      original.bytes !== input.mutation.file.bytes
    )
      throw new ProjectError('EXTERNAL_CHANGE')
  }
  const temporary = join(ctx.workspace, 'blobs', `.import-${randomUUID()}`)
  let blob: BlobRef
  try {
    await contained(ctx.root, join(ctx.workspace, 'blobs'), true)
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
    blob = await stageBlob(
      ctx.root,
      ctx.workspace,
      temporary,
      undefined,
      undefined,
      IMPORT_LIMITS.artifactBytes
    )
  } finally {
    await unlink(temporary).catch(() => {})
  }
  const artifact: ImportArtifact = {
    version: 1,
    id: artifactId,
    batchId: mutation.batchId,
    kind: 'intake-v1',
    assetId: artifactAssetId,
    ...blob,
    createdAt: time,
    digest: ''
  }
  artifact.digest = contentDigest('project-import-artifact-v1', artifact)
  const receipt = inWriteTransaction(ctx.db, () => {
    const replay = lookup(ctx.db, ctx.projectId, mutation)
    if (replay) return replay
    if (stored && batch(ctx.db, ctx.projectId, stored.id).current_revision_id !== previous!.id)
      throw new ProjectError('STALE_REVISION')
    const head = (
      ctx.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(ctx.projectId) as {
        head_commit_id: string
      }
    ).head_commit_id
    const result: ImportSessionReceipt = {
      version: 2,
      kind: 'import-session',
      projectId: ctx.projectId,
      batchId: mutation.batchId,
      revisionId: value.id,
      headCommitId: randomUUID()
    }
    ctx.db
      .prepare('INSERT INTO commits VALUES (?,?,?,?)')
      .run(ctx.projectId, result.headCommitId, head, time)
    if (!stored)
      ctx.db
        .prepare('INSERT INTO import_batches VALUES (?,?,?,?)')
        .run(ctx.projectId, mutation.batchId, value.id, time)
    const asset = ctx.db.prepare('INSERT INTO managed_assets VALUES (?,?,?,?,?,?)')
    if (added) {
      asset.run(
        ctx.projectId,
        added.assetId,
        `import-${added.id}.bin`,
        IMPORT_ORIGINAL_MEDIA,
        added.bytes,
        added.sha256
      )
      ctx.db
        .prepare('INSERT INTO import_files VALUES (?,?,?,?,?)')
        .run(ctx.projectId, added.id, mutation.batchId, added.assetId, JSON.stringify(added))
    }
    asset.run(
      ctx.projectId,
      artifact.assetId,
      `import-${artifact.id}.json`,
      IMPORT_ARTIFACT_MEDIA,
      artifact.bytes,
      artifact.sha256
    )
    ctx.db
      .prepare('INSERT INTO import_artifacts VALUES (?,?,?,?,?)')
      .run(ctx.projectId, artifact.id, mutation.batchId, artifact.assetId, JSON.stringify(artifact))
    ctx.db
      .prepare('INSERT INTO import_batch_revisions VALUES (?,?,?,?,?,?,?,?,?)')
      .run(
        ctx.projectId,
        value.id,
        mutation.batchId,
        value.parentRevisionId,
        mutation.operationId,
        result.headCommitId,
        JSON.stringify(mutation),
        JSON.stringify(value),
        artifact.id
      )
    if (graph) installImportGraph(ctx, graph)
    ctx.db
      .prepare('UPDATE import_batches SET current_revision_id=? WHERE project_id=? AND id=?')
      .run(value.id, ctx.projectId, mutation.batchId)
    ctx.db
      .prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?')
      .run(result.headCommitId, time, ctx.projectId)
    ctx.db
      .prepare('INSERT INTO domain_operations VALUES (?,?,?,?)')
      .run(
        ctx.projectId,
        mutation.operationId,
        importMutationDigest(mutation),
        JSON.stringify(result)
      )
    return result
  })
  return { type: 'receipt', operationId: mutation.operationId, receipt }
}

/** SQL semantics and canonical artifact contents are validated together, without physical row-order authority. */
export function validatePortableImports(
  db: Database.Database,
  projectId: string
): ImportArtifactRef[] {
  const version = (
    db.prepare('SELECT schema_version FROM format WHERE singleton=1').get() as {
      schema_version: number
    }
  ).schema_version
  if (version < 22) return []
  validateImportedContent(db, projectId)
  validatePortableImportAnalysis(db, projectId)
  validatePortableImportCommits(db, projectId)
  const artifactRefs: ImportArtifactRef[] = []
  let batches = 0,
    revisionCount = 0,
    fileCount = 0,
    active = 0
  for (const raw of db.prepare('SELECT * FROM import_batches').iterate()) {
    const row = raw as StoredBatch & { project_id: string }
    if (++batches > IMPORT_LIMITS.batches || row.project_id !== projectId) return corrupt()
    batch(db, projectId, row.id)
    const retained = files(db, projectId, row.id),
      pendingFiles = new Set(retained.map((f) => f.id))
    fileCount += retained.length
    const revisions = new Map<string, RevisionRow>()
    for (const rawRevision of db
      .prepare('SELECT * FROM import_batch_revisions WHERE project_id=? AND batch_id=?')
      .iterate(projectId, row.id)) {
      if (revisions.size >= IMPORT_LIMITS.revisions || ++revisionCount >= LIMITS.entries)
        return corrupt()
      const stored = rawRevision as RevisionRow
      revisions.set(stored.id, stored)
    }
    const chain: RevisionRow[] = [],
      visited = new Set<string>()
    let current: string | null = row.current_revision_id
    while (current !== null) {
      const stored = revisions.get(current)
      if (!stored || visited.has(current)) return corrupt()
      visited.add(current)
      chain.push(stored)
      current = stored.parent_id
    }
    if (visited.size !== revisions.size || !chain.length) return corrupt()
    chain.reverse()
    let previous: ImportRevision | null = null,
      seenFiles = 0,
      derivedBytes = 0
    for (const stored of chain) {
      const value = revision(db, projectId, row.id, stored.id),
        mutation = parse(stored.request, isImportMutation)
      if (
        (value.version === 2 && version < 23) ||
        (value.version === 2) !== (mutation.action === 'prepare-graph') ||
        mutation.batchId !== row.id ||
        mutation.operationId !== stored.operation_id ||
        value.parentRevisionId !== stored.parent_id ||
        value.intakeArtifactId !== stored.artifact_id
      )
        return corrupt()
      if ((!previous && mutation.action !== 'create') || (previous && mutation.action === 'create'))
        return corrupt()
      const content = nextContent(mutation, previous)
      if (
        requestDigest(content) !==
        requestDigest({
          phase: value.phase,
          settings: value.settings,
          selectedFileIds: value.selectedFileIds
        })
      )
        return corrupt()
      if (mutation.action === 'add-file') {
        const added = retained.find((f) => f.id === mutation.file.id)
        if (
          !added ||
          !pendingFiles.delete(added.id) ||
          added.order !== seenFiles++ ||
          added.createdAt !== value.createdAt
        )
          return corrupt()
        const selection = {
          id: added.id,
          assetId: added.assetId,
          originalName: added.originalName,
          sha256: added.sha256,
          bytes: added.bytes,
          mediaType: added.mediaType
        }
        if (requestDigest(selection) !== requestDigest(mutation.file)) return corrupt()
      }
      const available = retained.slice(0, seenFiles)
      if (value.selectedFileIds.some((id) => !available.some((f) => f.id === id))) return corrupt()
      const artifactRow = db
        .prepare(
          'SELECT asset_id,body FROM import_artifacts WHERE project_id=? AND batch_id=? AND id=?'
        )
        .get(projectId, row.id, value.intakeArtifactId) as
        { asset_id: string; body: string } | undefined
      if (!artifactRow) return corrupt()
      const artifact = parse(artifactRow.body, isImportArtifact),
        expected = intakeBytes(value, available)
      if (
        artifact.id !== value.intakeArtifactId ||
        artifact.batchId !== row.id ||
        artifact.createdAt !== value.createdAt ||
        artifact.assetId !== artifactRow.asset_id ||
        artifact.digest !== contentDigest('project-import-artifact-v1', artifact) ||
        artifact.sha256 !== hash(expected) ||
        artifact.bytes !== expected.length ||
        (derivedBytes += artifact.bytes) > IMPORT_LIMITS.derivedBytes
      )
        return corrupt()
      validateAsset(
        db,
        projectId,
        artifact.assetId,
        artifact,
        IMPORT_ARTIFACT_MEDIA,
        `import-${artifact.id}.json`
      )
      artifactRefs.push({ sha256: artifact.sha256, bytes: artifact.bytes })
      const receipt = lookup(db, projectId, mutation)
      if (
        !receipt ||
        receipt.revisionId !== value.id ||
        receipt.headCommitId !== stored.head_commit_id ||
        !db
          .prepare('SELECT 1 FROM commits WHERE project_id=? AND id=?')
          .get(projectId, stored.head_commit_id)
      )
        return corrupt()
      if (!previous && value.createdAt !== row.created_at) return corrupt()
      previous = value
    }
    if (
      pendingFiles.size ||
      !previous ||
      (previous.phase !== 'discarded' &&
        !importBatchAccepted(db, projectId, row.id) &&
        ++active > IMPORT_LIMITS.activeBatches)
    )
      return corrupt()
    for (const file of retained)
      validateAsset(
        db,
        projectId,
        file.assetId,
        file,
        IMPORT_ORIGINAL_MEDIA,
        `import-${file.id}.bin`
      )
  }
  for (const [table, expected] of [
    ['import_batch_revisions', revisionCount],
    ['import_files', fileCount],
    ['import_artifacts', revisionCount]
  ] as const) {
    const actual = (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    if (actual !== expected) return corrupt()
  }
  if (version >= 23) artifactRefs.push(...validatePortableImportGraphs(db, projectId))
  return artifactRefs
}
function validateAsset(
  db: Database.Database,
  projectId: string,
  id: string,
  ref: BlobRef,
  media: string,
  name: string
): void {
  const asset = db
    .prepare('SELECT * FROM managed_assets WHERE project_id=? AND id=?')
    .get(projectId, id)
  if (
    !record(asset) ||
    asset.sha256 !== ref.sha256 ||
    asset.byte_size !== ref.bytes ||
    asset.media_type !== media ||
    asset.original_name !== name
  )
    corrupt()
}
/** Bounded semantic read phase, used for working data, snapshots, archive reads and copies. */
export async function validateImportArtifactBytes(
  refs: ImportArtifactRef[],
  read: (ref: BlobRef) => Promise<Buffer>
): Promise<void> {
  const graphs = new GraphArtifactValidator()
  for (const ref of refs) {
    if (ref.bytes > IMPORT_LIMITS.artifactBytes) return corrupt()
    const bytes = await read(ref)
    if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256) return corrupt()
    graphs.add(ref, bytes)
  }
  graphs.finish()
}
export async function validateImportArtifactFiles(
  root: string,
  workspace: string,
  refs: ImportArtifactRef[]
): Promise<void> {
  await validateImportArtifactBytes(refs, (ref) =>
    readImportBlob({ root, workspace }, ref, IMPORT_LIMITS.artifactBytes)
  )
}
