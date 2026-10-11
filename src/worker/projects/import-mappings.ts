import { evidenceAncestor } from './import-recovery'
import { isSemanticArtifact, type SemanticArtifact } from '../../shared/import-semantic'
import { isAnalysisCapture, isAnalysisRun } from '../../shared/import-analysis'
import { discoveryProfileStructure, type DiscoveryCapture } from '../../shared/import-discovery'
import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectError } from '../../domain/projects/errors'
import { record, type OpenInput } from '../../shared/projects'
import {
  IMPORT_LIMITS,
  isImportFile,
  isImportRevision,
  type ImportFile,
  type ImportSettings
} from '../../shared/project-import'
import { type GraphRecord, type GraphRelation, type ImportGraph } from '../../shared/import-graph'
import {
  MAPPING_LIMITS,
  isImportMapping,
  isMappingArtifact,
  isMappingNormalization,
  isStructureProfile,
  type ImportMapping,
  type MappingArtifact,
  type MappingNormalization,
  type StructureProfile
} from '../../shared/import-mapping'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { contained } from '../storage/files'
import { stageBlob } from './blobs'
import { requireSpace } from './streams'
import { LIMITS, type BlobRef } from './manifest'
import {
  readGraph,
  readImportBlob,
  makeImportGraphPages,
  validateBuiltImportGraph,
  parseGraphPage,
  type ImportArtifactRef
} from './import-graphs'
import { localGraphSettings } from './import-normalization'
import { analysisReservedBytes } from './import-analysis-budget'
import { graphId } from './import-readers/records'
import { MappingWork, profileStructure, decodeMappingJson } from './import-readers/mapping-profile'
import { MappingInterpreter } from './import-readers/mapping'

type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
type SourceBinding = {
  graph: ImportGraph
  files: ImportFile[]
  settings: ImportSettings
  head: string
}
export type MappingEvidenceRef = Omit<SourceBinding, 'head'> & {
  artifact: MappingArtifact
  captures?: DiscoveryCapture[]
  selectedPrograms?: import('../../shared/import-mapping').ImportMapping[]
}
const MEDIA = 'application/vnd.collie.import+json'
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const artifactDigest = (a: MappingArtifact): string => {
  const body: Partial<MappingArtifact> = { ...a }
  delete body.digest
  return requestDigest({ contract: 'import-mapping-artifact-v1', ...body })
}
function parse<T>(
  text: string,
  accepts: (v: unknown) => v is T,
  max: number = IMPORT_LIMITS.descriptorUnits
): T {
  if (typeof text !== 'string' || text.length > max) return corrupt()
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return corrupt()
  }
  if (!accepts(value) || JSON.stringify(value) !== text) return corrupt()
  return value
}
function originalFiles(db: Database.Database, projectId: string, graph: ImportGraph): ImportFile[] {
  return graph.files.map((f) => {
    const row = db
      .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
      .get(projectId, graph.batchId, f.fileId) as { body: string } | undefined
    if (!row) return corrupt()
    const file = parse(row.body, isImportFile)
    if (file.id !== f.fileId || file.sha256 !== f.sha256 || file.batchId !== graph.batchId)
      return corrupt()
    return file
  })
}
export function importEvidenceBinding(ctx: Context, id: string, writable: boolean): SourceBinding {
  const { manifest: graph } = readGraph(ctx.db, ctx.projectId, id),
    files = originalFiles(ctx.db, ctx.projectId, graph)
  const head = (
    ctx.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(ctx.projectId) as {
      head_commit_id: string
    }
  ).head_commit_id
  if (writable) {
    const row = ctx.db
        .prepare('SELECT current_revision_id FROM import_batches WHERE project_id=? AND id=?')
        .get(ctx.projectId, graph.batchId) as { current_revision_id: string } | undefined,
      revisionRow = ctx.db
        .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND id=?')
        .get(ctx.projectId, row?.current_revision_id ?? '') as { body: string } | undefined
    if (!row || !revisionRow) throw new ProjectError('STALE_REVISION')
    const revision = parse(revisionRow.body, isImportRevision)
    if (
      !evidenceAncestor(ctx.db, ctx.projectId, revision, graph.id) ||
      revision.phase === 'discarded' ||
      ctx.db
        .prepare('SELECT 1 FROM import_receipts WHERE project_id=? AND batch_id=?')
        .get(ctx.projectId, graph.batchId)
    )
      throw new ProjectError('VALIDATION')
  }
  return { graph, files, head, settings: localGraphSettings(ctx.db, ctx.projectId, graph) }
}
function descriptor(
  graph: ImportGraph,
  id: string,
  part: MappingArtifact['part'],
  ownerId: string,
  bytes: Buffer,
  time: string
): MappingArtifact {
  const a: MappingArtifact = {
    version: 1,
    kind: 'mapping-v1',
    id,
    batchId: graph.batchId,
    assetId: graphId(['mapping-asset-v1', id]),
    sha256: hash(bytes),
    bytes: bytes.length,
    digest: '',
    createdAt: time,
    graphId: graph.id,
    revisionId: graph.revisionId,
    ownerId,
    part
  }
  a.digest = artifactDigest(a)
  if (!isMappingArtifact(a)) throw new ProjectError('LIMIT_EXCEEDED')
  return a
}
function retained(ctx: Context, id: string): MappingArtifact | null {
  const row = ctx.db
    .prepare('SELECT body FROM import_artifacts WHERE project_id=? AND id=?')
    .get(ctx.projectId, id) as { body: string } | undefined
  return row ? parse(row.body, isMappingArtifact) : null
}
/** Shared managed mapping/semantic evidence writer; never domain content or AI work. */
export async function retainImportEvidence(
  ctx: Context,
  source: ReturnType<typeof importEvidenceBinding>,
  items: Array<{ artifact: MappingArtifact | SemanticArtifact; bytes: Buffer }>,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  const missing: typeof items = []
  for (const item of items) {
    const row = ctx.db
      .prepare('SELECT body FROM import_artifacts WHERE project_id=? AND id=?')
      .get(ctx.projectId, item.artifact.id) as { body: string } | undefined
    const old = row
      ? parse(
          row.body,
          (v): v is MappingArtifact | SemanticArtifact =>
            isMappingArtifact(v) || isSemanticArtifact(v)
        )
      : null
    if (
      old &&
      (old.sha256 !== item.artifact.sha256 ||
        old.graphId !== source.graph.id ||
        old.kind !== item.artifact.kind ||
        (old.kind === 'mapping-v1' &&
          item.artifact.kind === 'mapping-v1' &&
          (old.ownerId !== item.artifact.ownerId || old.part !== item.artifact.part)))
    )
      throw new ProjectError('OPERATION_CONFLICT')
    if (!old) missing.push(item)
  }
  if (!missing.length) return
  const used = (
      ctx.db
        .prepare(
          `SELECT coalesce(sum(a.byte_size),0) AS n FROM managed_assets a WHERE a.project_id=? AND
    (a.id IN (SELECT asset_id FROM import_artifacts WHERE project_id=? AND batch_id=?) OR
     a.id IN (SELECT p.asset_id FROM import_graph_pages p JOIN import_graphs g ON g.project_id=p.project_id AND g.id=p.graph_id WHERE g.project_id=? AND g.batch_id=?))`
        )
        .get(
          ctx.projectId,
          ctx.projectId,
          source.graph.batchId,
          ctx.projectId,
          source.graph.batchId
        ) as { n: number }
    ).n,
    bytes = missing.reduce((n, i) => n + i.bytes.length, 0),
    assets = (ctx.db.prepare('SELECT count(*) AS n FROM managed_assets').get() as { n: number }).n,
    databaseBytes =
      Number(ctx.db.pragma('page_count', { simple: true })) *
      Number(ctx.db.pragma('page_size', { simple: true }))
  if (
    used +
      bytes +
      analysisReservedBytes(ctx.db, ctx.projectId, source.graph.batchId) +
      2 * IMPORT_LIMITS.artifactBytes >
      IMPORT_LIMITS.derivedBytes ||
    assets + missing.length + 16 >= LIMITS.entries ||
    databaseBytes + 8 * 1024 ** 2 > LIMITS.database
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  await requireSpace(ctx.workspace, bytes * 2 + 8 * 1024 ** 2)
  for (const item of missing) {
    signal?.throwIfAborted()
    const temporary = join(ctx.workspace, 'blobs', `.mapping-${randomUUID()}`)
    try {
      await contained(ctx.root, join(ctx.workspace, 'blobs'), true)
      await writeFile(temporary, item.bytes, { flag: 'wx', mode: 0o600 })
      const saved = await stageBlob(
        ctx.root,
        ctx.workspace,
        temporary,
        undefined,
        undefined,
        IMPORT_LIMITS.artifactBytes
      )
      if (saved.sha256 !== item.artifact.sha256 || saved.bytes !== item.artifact.bytes)
        return corrupt()
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }
  signal?.throwIfAborted()
  inWriteTransaction(ctx.db, () => {
    const current = importEvidenceBinding(ctx, source.graph.id, true)
    if (current.head !== source.head) throw new ProjectError('STALE_REVISION')
    for (const item of items) {
      const row = ctx.db
        .prepare('SELECT body FROM import_artifacts WHERE project_id=? AND id=?')
        .get(ctx.projectId, item.artifact.id) as { body: string } | undefined
      const old = row
        ? parse(
            row.body,
            (v): v is MappingArtifact | SemanticArtifact =>
              isMappingArtifact(v) || isSemanticArtifact(v)
          )
        : null
      if (
        old &&
        (old.sha256 !== item.artifact.sha256 ||
          old.graphId !== source.graph.id ||
          old.kind !== item.artifact.kind ||
          (old.kind === 'mapping-v1' &&
            item.artifact.kind === 'mapping-v1' &&
            (old.ownerId !== item.artifact.ownerId || old.part !== item.artifact.part)))
      )
        throw new ProjectError('OPERATION_CONFLICT')
      if (old) continue
      ctx.db
        .prepare('INSERT INTO managed_assets VALUES (?,?,?,?,?,?)')
        .run(
          ctx.projectId,
          item.artifact.assetId,
          `import-${item.artifact.id}.json`,
          MEDIA,
          item.artifact.bytes,
          item.artifact.sha256
        )
      ctx.db
        .prepare('INSERT INTO import_artifacts VALUES (?,?,?,?,?)')
        .run(
          ctx.projectId,
          item.artifact.id,
          item.artifact.batchId,
          item.artifact.assetId,
          JSON.stringify(item.artifact)
        )
    }
    const head = randomUUID(),
      time = new Date().toISOString()
    ctx.db
      .prepare('INSERT INTO commits VALUES (?,?,?,?)')
      .run(ctx.projectId, head, source.head, time)
    ctx.db
      .prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?')
      .run(head, time, ctx.projectId)
  })
}
export async function prepareImportMappingProfiles(
  ctx: Context,
  graphId: string,
  signal?: AbortSignal,
  fileIds?: string[]
): Promise<StructureProfile[]> {
  const source = importEvidenceBinding(ctx, graphId, true),
    work = new MappingWork(signal),
    profiles: StructureProfile[] = [],
    items: Array<{ artifact: MappingArtifact; bytes: Buffer }> = []
  const files = fileIds ? source.files.filter((f) => fileIds.includes(f.id)) : source.files
  if (
    !files.length ||
    (fileIds && (new Set(fileIds).size !== fileIds.length || files.length !== fileIds.length))
  )
    throw new ProjectError('VALIDATION')
  let values = 0
  for (const file of files) {
    signal?.throwIfAborted()
    const { parsed } = decodeMappingJson(
      await readImportBlob(ctx, file, IMPORT_LIMITS.fileBytes),
      signal
    )
    values += parsed.values
    if (values > MAPPING_LIMITS.traversals) throw new ProjectError('LIMIT_EXCEEDED')
    const profile = await profileStructure(file, parsed, graphId, work),
      bytes = Buffer.from(JSON.stringify(profile), 'utf8')
    profiles.push(profile)
    items.push({
      artifact: descriptor(
        source.graph,
        profile.id,
        'profile',
        profile.id,
        bytes,
        new Date().toISOString()
      ),
      bytes
    })
  }
  await retainImportEvidence(ctx, source, items, signal)
  return profiles
}
export async function readImportMappingProfile(
  ctx: Context,
  id: string
): Promise<StructureProfile> {
  const a = retained(ctx, id)
  if (!a || a.part !== 'profile') throw new ProjectError('NOT_FOUND')
  const profile = parse(
    (await readImportBlob(ctx, a, IMPORT_LIMITS.artifactBytes)).toString('utf8'),
    isStructureProfile,
    MAPPING_LIMITS.profileUnits
  )
  if (profile.id !== id) return corrupt()
  return profile
}
function normalizationId(graph: ImportGraph, mapping: ImportMapping): string {
  return graphId(['mapping-normalization-v1', graph.id, graph.revisionId, mapping])
}
function admitProgram(mapping: ImportMapping, profiles: StructureProfile[]): void {
  if (
    !isImportMapping(mapping) ||
    requestDigest(mapping.profiles) !== requestDigest(profiles.map((p) => p.id)) ||
    profiles.reduce((n, p) => n + p.values, 0) > MAPPING_LIMITS.traversals
  )
    throw new ProjectError('VALIDATION')
  for (const rule of mapping.rules) {
    const variants = new Set(
      profiles
        .filter((p) => rule.from.profiles.includes(p.id))
        .flatMap((p) => p.variants.map((v) => v.id))
    )
    if (rule.variants.some((v) => !variants.has(v))) throw new ProjectError('VALIDATION')
  }
}
export async function prepareImportMappingNormalization(
  ctx: Context,
  sourceGraphId: string,
  mapping: ImportMapping,
  signal?: AbortSignal
): Promise<MappingNormalization> {
  if (!isImportMapping(mapping)) throw new ProjectError('VALIDATION')
  const source = importEvidenceBinding(ctx, sourceGraphId, true),
    id = normalizationId(source.graph, mapping),
    old = retained(ctx, id)
  if (old) return readImportMappingNormalization(ctx, id)
  const profiles = await Promise.all(mapping.profiles.map((p) => readImportMappingProfile(ctx, p)))
  admitProgram(mapping, profiles)
  const files = source.files.filter((f) => profiles.some((p) => p.fileId === f.id))
  if (
    files.length !== profiles.length ||
    files.some(
      (f, i) =>
        f.id !== profiles[i].fileId ||
        f.sha256 !== profiles[i].sha256 ||
        retained(ctx, profiles[i].id)?.graphId !== sourceGraphId
    )
  )
    throw new ProjectError('VALIDATION')
  const settings = source.settings,
    interpreter = new MappingInterpreter(settings, mapping, profiles, new MappingWork(signal))
  for (const file of files) {
    signal?.throwIfAborted()
    const { parsed, bom } = decodeMappingJson(
      await readImportBlob(ctx, file, IMPORT_LIMITS.fileBytes),
      signal
    )
    await interpreter.fileInput(file, parsed, bom)
  }
  const built = await interpreter.finish(),
    pages = makeImportGraphPages(id, built),
    result: MappingNormalization = {
      version: 1,
      kind: 'mapping-applied',
      id,
      batchId: source.graph.batchId,
      graphId: sourceGraphId,
      revisionId: source.graph.revisionId,
      settings,
      mapping,
      files: files.map((f, i) => ({ fileId: f.id, sha256: f.sha256, profileId: profiles[i].id })),
      result: {
        files: built.files,
        textUnits: built.textUnits,
        recordsDigest: requestDigest(built.records),
        relationsDigest: requestDigest(built.relations),
        records: built.records.length,
        relations: built.relations.length,
        pages: pages.map((p) => p.descriptor)
      }
    }
  // Pages reuse the protected graph layout, but their owner is a mapping artifact, never a local-reader review.
  for (const p of pages) p.descriptor.assetId = graphId(['mapping-asset-v1', p.descriptor.id])
  validateBuiltImportGraph(source.graph, id, built, pages, files)
  if (
    !isMappingNormalization(result) ||
    JSON.stringify(result).length > IMPORT_LIMITS.artifactBytes / 2
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  const time = new Date().toISOString(),
    bytes = Buffer.from(JSON.stringify(result), 'utf8'),
    items = [
      { artifact: descriptor(source.graph, id, 'normalization', id, bytes, time), bytes },
      ...pages.map((p) => ({
        artifact: descriptor(source.graph, p.descriptor.id, 'page', id, p.bytes, time),
        bytes: p.bytes
      }))
    ]
  const count = (
    ctx.db
      .prepare(
        "SELECT count(*) AS n FROM import_artifacts WHERE project_id=? AND batch_id=? AND json_extract(body,'$.part')='normalization'"
      )
      .get(ctx.projectId, source.graph.batchId) as { n: number }
  ).n
  if (count >= MAPPING_LIMITS.bundles) throw new ProjectError('LIMIT_EXCEEDED')
  await retainImportEvidence(ctx, source, items, signal)
  return result
}
export async function readImportMappingNormalization(
  ctx: Context,
  id: string
): Promise<MappingNormalization> {
  const a = retained(ctx, id)
  if (!a || a.part !== 'normalization') throw new ProjectError('NOT_FOUND')
  const result = parse(
    (await readImportBlob(ctx, a, IMPORT_LIMITS.artifactBytes)).toString('utf8'),
    isMappingNormalization,
    IMPORT_LIMITS.artifactBytes
  )
  if (
    result.id !== id ||
    result.graphId !== a.graphId ||
    result.revisionId !== a.revisionId ||
    result.batchId !== a.batchId
  )
    return corrupt()
  return result
}
/** Existing table/asset owners include these rows in Save, copy, retention and archive snapshots. */
export function validatePortableImportMappings(
  db: Database.Database,
  projectId: string,
  version: number
): ImportArtifactRef[] {
  const captures = (
    version < 35
      ? []
      : (db
          .prepare(
            "SELECT body FROM import_analysis_captures WHERE project_id=? AND json_extract(body,'$.version')=3"
          )
          .all(projectId) as { body: string }[])
  ).map((row) => {
    const c: unknown = JSON.parse(row.body)
    if (!isAnalysisCapture(c) || c.version !== 3) return corrupt()
    return c
  })
  const refs: ImportArtifactRef[] = [],
    graphs = new Map<string, ReturnType<typeof importEvidenceBinding>>(),
    counts = new Map<string, number>()
  let rows = 0
  for (const raw of db.prepare('SELECT * FROM import_artifacts').iterate()) {
    if (
      !record(raw) ||
      typeof raw.body !== 'string' ||
      raw.body.length > IMPORT_LIMITS.descriptorUnits ||
      ++rows >= LIMITS.entries
    )
      return corrupt()
    let value: unknown
    try {
      value = JSON.parse(raw.body)
    } catch {
      return corrupt()
    }
    if (
      record(value) &&
      (value.kind === 'intake-v1' || (version >= 36 && value.kind === 'semantic-plan-v1'))
    )
      continue
    if (
      version < 34 ||
      !record(raw) ||
      raw.project_id !== projectId ||
      refs.length >= LIMITS.entries
    )
      return corrupt()
    const a = parse(String(raw.body), isMappingArtifact),
      asset = db
        .prepare('SELECT * FROM managed_assets WHERE project_id=? AND id=?')
        .get(projectId, a.assetId)
    if (
      a.id !== raw.id ||
      a.batchId !== raw.batch_id ||
      a.assetId !== raw.asset_id ||
      artifactDigest(a) !== a.digest ||
      a.assetId !== graphId(['mapping-asset-v1', a.id]) ||
      !record(asset) ||
      asset.original_name !== `import-${a.id}.json` ||
      asset.media_type !== MEDIA ||
      asset.sha256 !== a.sha256 ||
      asset.byte_size !== a.bytes
    )
      return corrupt()
    let source = graphs.get(a.graphId)
    if (!source) {
      const { manifest: graph } = readGraph(db, projectId, a.graphId)
      source = {
        graph,
        files: originalFiles(db, projectId, graph),
        head: '',
        settings: localGraphSettings(db, projectId, graph)
      }
      graphs.set(a.graphId, source)
    }
    if (
      source.graph.batchId !== a.batchId ||
      source.graph.revisionId !== a.revisionId ||
      (a.part !== 'page' && a.ownerId !== a.id)
    )
      return corrupt()
    if (a.part === 'normalization') {
      const n = (counts.get(a.batchId) ?? 0) + 1
      counts.set(a.batchId, n)
      if (n > MAPPING_LIMITS.bundles) return corrupt()
    }
    const selectedPrograms: import('../../shared/import-mapping').ImportMapping[] = []
    if (a.part === 'normalization' && version >= 35)
      for (const row of db
        .prepare(
          "SELECT body FROM import_graphs WHERE project_id=? AND json_extract(body,'$.version')=2"
        )
        .all(projectId) as { body: string }[]) {
        const g = JSON.parse(row.body) as Extract<ImportGraph, { version: 2 }>
        for (const selection of g.mappings.filter((m) => m.normalizationId === a.id)) {
          const runRow = db
            .prepare('SELECT body FROM import_analysis_runs WHERE project_id=? AND id=?')
            .get(projectId, selection.attemptId) as { body: string } | undefined
          const r: unknown = runRow ? JSON.parse(runRow.body) : null
          if (!isAnalysisRun(r) || r.version !== 3 || !r.proposal || r.validation !== 'valid')
            return corrupt()
          selectedPrograms.push(r.proposal.mapping)
        }
      }
    refs.push({
      sha256: a.sha256,
      bytes: a.bytes,
      mapping: {
        artifact: a,
        graph: source.graph,
        files: source.files,
        settings: source.settings,
        selectedPrograms,
        captures: captures.filter(
          (c) => c.packet.graphId === a.graphId && c.packet.profiles.some((p) => p.id === a.id)
        )
      }
    })
  }
  return refs
}
/** Replays finite interpretation against every retained original. Samples cannot certify a result. */
export async function validateMappingArtifactBytes(
  refs: ImportArtifactRef[],
  read: (ref: BlobRef) => Promise<Buffer>
): Promise<void> {
  const profiles = new Map<string, StructureProfile>(),
    normalizations = new Map<string, MappingNormalization>(),
    pages = new Map<string, Buffer>(),
    evidence = new Map<string, MappingEvidenceRef>()
  for (const ref of refs)
    if (ref.mapping) {
      const e = ref.mapping,
        a = e.artifact,
        bytes = await read(a)
      if (
        !isMappingArtifact(a) ||
        a.bytes !== ref.bytes ||
        a.sha256 !== ref.sha256 ||
        bytes.length !== a.bytes ||
        hash(bytes) !== a.sha256 ||
        evidence.has(a.id)
      )
        return corrupt()
      evidence.set(a.id, e)
      if (a.part === 'profile') {
        const p = parse(bytes.toString('utf8'), isStructureProfile, MAPPING_LIMITS.profileUnits)
        if (p.id !== a.id || !e.files.some((f) => f.id === p.fileId && f.sha256 === p.sha256))
          return corrupt()
        for (const c of e.captures ?? []) {
          const sample = c.packet.profiles.find((x) => x.id === p.id)!
          if (
            sample.digest !== p.digest ||
            sample.structure !== discoveryProfileStructure(p) ||
            !c.packet.files.some((f) => f.id === p.fileId && f.sha256 === p.sha256)
          )
            return corrupt()
        }
        profiles.set(a.id, p)
      } else if (a.part === 'normalization') {
        const n = parse(bytes.toString('utf8'), isMappingNormalization, IMPORT_LIMITS.artifactBytes)
        if (
          n.id !== a.id ||
          n.graphId !== a.graphId ||
          n.revisionId !== a.revisionId ||
          n.batchId !== a.batchId ||
          normalizationId(e.graph, n.mapping) !== n.id ||
          requestDigest(n.settings) !== requestDigest(e.settings) ||
          requestDigest(n.files.map((f) => f.fileId)) !==
            requestDigest(
              e.files.filter((f) => n.files.some((nf) => nf.fileId === f.id)).map((f) => f.id)
            ) ||
          n.files.some((f) => !e.files.some((ef) => ef.id === f.fileId && ef.sha256 === f.sha256))
        )
          return corrupt()
        if (e.selectedPrograms?.some((m) => requestDigest(m) !== requestDigest(n.mapping)))
          return corrupt()
        normalizations.set(a.id, n)
      } else pages.set(a.id, bytes)
    }
  // Replay one file at a time, releasing parsed bodies between files.
  for (const [id, p] of profiles) {
    const e = evidence.get(id)!,
      file = e.files.find((f) => f.id === p.fileId)!,
      { parsed } = decodeMappingJson(await read(file)),
      actual = await profileStructure(file, parsed, e.graph.id)
    if (requestDigest(actual) !== requestDigest(p)) return corrupt()
  }
  const usedPages = new Set<string>()
  for (const [id, n] of normalizations) {
    const e = evidence.get(id)!,
      admitted = n.files.map((f) => profiles.get(f.profileId))
    if (
      admitted.some(
        (p, i) =>
          !p ||
          p.fileId !== n.files[i].fileId ||
          p.sha256 !== n.files[i].sha256 ||
          evidence.get(p.id)?.graph.id !== e.graph.id
      )
    )
      return corrupt()
    admitProgram(n.mapping, admitted as StructureProfile[])
    const interpreter = new MappingInterpreter(
        n.settings,
        n.mapping,
        admitted as StructureProfile[]
      ),
      records: GraphRecord[] = [],
      relations: GraphRelation[] = []
    for (const file of e.files.filter((f) => n.files.some((nf) => nf.fileId === f.id))) {
      const { parsed, bom } = decodeMappingJson(await read(file))
      await interpreter.fileInput(file, parsed, bom)
    }
    const built = await interpreter.finish(),
      retainedPages: Parameters<typeof validateBuiltImportGraph>[3] = []
    for (const p of n.result.pages) {
      const pe = evidence.get(p.id),
        bytes = pages.get(p.id)
      if (
        !pe ||
        !bytes ||
        pe.artifact.part !== 'page' ||
        pe.artifact.ownerId !== id ||
        pe.artifact.graphId !== e.graph.id ||
        pe.artifact.assetId !== p.assetId ||
        pe.artifact.sha256 !== p.sha256 ||
        pe.artifact.bytes !== p.bytes ||
        usedPages.has(p.id)
      )
        return corrupt()
      usedPages.add(p.id)
      const page = parseGraphPage(bytes, p)
      retainedPages.push({ descriptor: p, bytes })
      records.push(...page.records)
      relations.push(...page.relations)
    }
    if (
      requestDigest(records) !== n.result.recordsDigest ||
      requestDigest(relations) !== n.result.relationsDigest ||
      requestDigest(built.records) !== n.result.recordsDigest ||
      requestDigest(built.relations) !== n.result.relationsDigest ||
      built.textUnits !== n.result.textUnits ||
      requestDigest(built.files) !== requestDigest(n.result.files)
    )
      return corrupt()
    validateBuiltImportGraph(e.graph, id, built, retainedPages, e.files)
  }
  if (usedPages.size !== pages.size) return corrupt()
}
