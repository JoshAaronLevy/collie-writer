import { planEvidence } from './import-plans'
import { reviewGraphEvidence, validateReviewGraph } from './import-review'
import { validatePlanEvidence } from './import-partition'
import { analysisEvidence } from './import-analysis'
import { analysisReservedBytes } from './import-analysis-budget'
import { validateAnalysisEvidence } from './import-analysis-capture'
import type { AnalysisCaptureV1 as AnalysisCapture } from '../../shared/import-analysis'
import { contentEvidence, validateContentEvidence } from './imported-provenance'
import type { ImportedContentOrigin } from '../../shared/import-content'
import { externalEvidence, validateExternalEvidence } from './external-conversations'
import type { ExternalEvidence } from '../../shared/conversation-transcript'
import type Database from 'better-sqlite3'
import { constants } from 'node:fs'
import { open, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { ProjectError } from '../../domain/projects/errors'
import { record, type OpenInput } from '../../shared/projects'
import {
  IMPORT_LIMITS,
  type ImportFile,
  type ImportRevision,
  type ImportSettings
} from '../../shared/project-import'
import {
  GRAPH_LIMITS,
  graphKinds,
  isImportGraph,
  isGraphPage,
  isGraphPageDescriptor,
  isGraphRecord,
  type ImportGraph,
  type GraphPage,
  type GraphPageDescriptor,
  type GraphRecord,
  type GraphRelation
} from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'
import { contained } from '../storage/files'
import { stageBlob } from './blobs'
import { requireSpace } from './streams'
import { LIMITS, type BlobRef } from './manifest'
import { GraphBuilder, type BuiltGraph } from './import-readers/graph'
import { InputError } from './import-readers/json'

export const IMPORT_GRAPH_MEDIA = 'application/vnd.collie.import-graph+json'
export type ImportArtifactRef = BlobRef & {
  graph?: {
    manifest: ImportGraph
    page: GraphPageDescriptor
    files: ImportFile[]
    external?: ExternalEvidence
    content?: ImportedContentOrigin[]
    analysis?: AnalysisCapture[]
    plans?: ReturnType<typeof planEvidence>
    reviews?: ReturnType<typeof reviewGraphEvidence>
  }
}
type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
export type PreparedGraph = {
  manifest: ImportGraph
  pages: Array<{ descriptor: GraphPageDescriptor; bytes: Buffer }>
}
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
function body<T>(
  text: string,
  accept: (v: unknown) => v is T,
  maximum: number = IMPORT_LIMITS.descriptorUnits
): T {
  if (typeof text !== 'string' || text.length > maximum) return corrupt()
  const parsed: unknown = JSON.parse(text)
  if (!accept(parsed) || JSON.stringify(parsed) !== text) return corrupt()
  return parsed
}
export async function readImportBlob(
  ctx: Pick<Context, 'root' | 'workspace'>,
  ref: BlobRef,
  maximum: number
): Promise<Buffer> {
  if (ref.bytes > maximum) return corrupt()
  const path = join(ctx.workspace, 'blobs', ref.sha256)
  await contained(ctx.root, path, false)
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await file.stat()
    if (!before.isFile() || before.nlink !== 1 || before.size !== ref.bytes) return corrupt()
    const bytes = Buffer.alloc(ref.bytes + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await file.read(bytes, offset, bytes.length - offset, null)
      if (!read.bytesRead) break
      offset += read.bytesRead
    }
    const after = await file.stat()
    if (
      offset !== ref.bytes ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      hash(bytes.subarray(0, offset)) !== ref.sha256
    )
      return corrupt()
    return bytes.subarray(0, offset)
  } finally {
    await file.close()
  }
}
function totals(
  records: GraphRecord[],
  relations: GraphRelation[]
): Pick<
  ImportGraph,
  | 'records'
  | 'relations'
  | 'conversations'
  | 'messages'
  | 'sources'
  | 'notes'
  | 'excluded'
  | 'unresolved'
  | 'fragments'
  | 'textUnits'
> {
  return {
    records: records.length,
    relations: relations.length,
    conversations: new Set(
      records
        .filter((r) => r.kind === 'conversation' && r.externalConversationId !== null)
        .map((r) => r.identityId)
    ).size,
    messages: new Set(
      records
        .filter(
          (r) =>
            r.kind === 'message' &&
            r.disposition === 'candidate' &&
            !['alternate', 'unresolved'].includes(r.path)
        )
        .map((r) => r.identityId)
    ).size,
    sources: records.filter((r) => r.kind === 'source').length,
    notes: records.filter((r) => r.kind === 'note').length,
    excluded: records.filter(
      (r) =>
        ['internal', 'unsupported', 'rejected', 'search'].includes(r.disposition) ||
        r.path === 'alternate'
    ).length,
    unresolved: records.filter(
      (r) =>
        r.disposition === 'unresolved' ||
        r.path === 'unresolved' ||
        r.issues.some((i) => /unresolved|inferred|conflict|no proven/u.test(i))
    ).length,
    fragments: records.reduce((n, r) => n + r.texts.reduce((n, t) => n + t.fragments.length, 0), 0),
    textUnits: records.reduce(
      (n, r) =>
        n +
        r.texts.reduce((n, t) => n + t.units, 0) +
        r.facts.reduce((n, f) => n + f.value.length, 0),
      0
    )
  }
}
export function graphDigest(manifest: ImportGraph, pages: GraphPageDescriptor[]): string {
  const value: Partial<ImportGraph> = { ...manifest }
  delete value.digest
  return requestDigest({ contract: 'import-graph-v1', manifest: value, pages })
}
function makePages(
  id: string,
  built: BuiltGraph
): Array<{ descriptor: GraphPageDescriptor; bytes: Buffer }> {
  const pages: PreparedGraph['pages'] = []
  for (const kind of ['records', 'relations'] as const) {
    const rows = kind === 'records' ? built.records : built.relations
    let page: GraphPage = {
      version: 1,
      graphId: id,
      index: pages.length,
      records: [],
      relations: []
    }
    const finish = (): void => {
      if (!page.records.length && !page.relations.length) return
      const bytes = Buffer.from(JSON.stringify(page), 'utf8')
      if (
        pages.length >= GRAPH_LIMITS.pages ||
        bytes.length > IMPORT_LIMITS.artifactBytes ||
        !isGraphPage(page)
      )
        throw new ProjectError('LIMIT_EXCEEDED')
      pages.push({
        descriptor: {
          version: 1,
          id: randomUUID(),
          graphId: id,
          index: pages.length,
          assetId: randomUUID(),
          sha256: hash(bytes),
          bytes: bytes.length,
          records: page.records.length,
          relations: page.relations.length,
          recordIds: page.records.map((r) => r.id),
          kinds: Object.fromEntries(
            graphKinds.map((kind) => [kind, page.records.filter((r) => r.kind === kind).length])
          ) as GraphPageDescriptor['kinds']
        },
        bytes
      })
      page = { version: 1, graphId: id, index: pages.length, records: [], relations: [] }
    }
    for (const row of rows) {
      if (JSON.stringify(row).length > 48000) throw new ProjectError('LIMIT_EXCEEDED')
      if (
        page[kind].length >= IMPORT_LIMITS.page ||
        JSON.stringify(page).length + JSON.stringify(row).length > 60000
      )
        finish()
      if (kind === 'records') page.records.push(row as GraphRecord)
      else page.relations.push(row as GraphRelation)
    }
    finish()
  }
  return pages
}
export async function prepareImportGraph(
  ctx: Context,
  previous: ImportRevision,
  revisionId: string,
  createdAt: string,
  files: ImportFile[],
  settings: ImportSettings
): Promise<PreparedGraph> {
  if (!previous.selectedFileIds.length) throw new ProjectError('VALIDATION')
  const builder = new GraphBuilder(settings)
  for (const id of previous.selectedFileIds) {
    const file = files.find((f) => f.id === id)
    if (!file) return corrupt()
    await builder.fileInput(file, () => readImportBlob(ctx, file, IMPORT_LIMITS.fileBytes))
  }
  let built: BuiltGraph
  try {
    built = builder.finish()
  } catch (error) {
    if (error instanceof InputError) throw new ProjectError('LIMIT_EXCEEDED')
    throw error
  }
  const id = randomUUID(),
    pages = makePages(id, built)
  const manifest: ImportGraph = {
    version: 1,
    id,
    batchId: previous.batchId,
    sourceRevisionId: previous.id,
    revisionId,
    createdAt,
    readerVersion: 1,
    files: built.files,
    ...totals(built.records, built.relations),
    pages: pages.length,
    digest: ''
  }
  manifest.digest = graphDigest(
    manifest,
    pages.map((p) => p.descriptor)
  )
  if (!isImportGraph(manifest) || JSON.stringify(manifest).length > 40000)
    throw new ProjectError('LIMIT_EXCEEDED')
  const admission = new GraphArtifactValidator()
  for (const page of pages)
    admission.add(
      {
        sha256: page.descriptor.sha256,
        bytes: page.descriptor.bytes,
        graph: {
          manifest,
          page: page.descriptor,
          files: files.filter((f) => previous.selectedFileIds.includes(f.id))
        }
      },
      page.bytes
    )
  admission.finish()
  // Empty/unsupported selections still have an inspectable coverage manifest with zero pages.
  const used = ctx.db
    .prepare(
      'SELECT coalesce(sum(a.byte_size),0) AS n FROM managed_assets a WHERE a.project_id=? AND (a.id IN (SELECT asset_id FROM import_artifacts WHERE project_id=? AND batch_id=?) OR a.id IN (SELECT p.asset_id FROM import_graph_pages p JOIN import_graphs g ON g.project_id=p.project_id AND g.id=p.graph_id WHERE g.project_id=? AND g.batch_id=?))'
    )
    .get(ctx.projectId, ctx.projectId, previous.batchId, ctx.projectId, previous.batchId) as {
    n: number
  }
  const bytes = pages.reduce((n, p) => n + p.bytes.length, 0)
  const assets = ctx.db
    .prepare('SELECT count(*) AS n FROM managed_assets WHERE project_id=?')
    .get(ctx.projectId) as { n: number }
  if (
    used.n +
      analysisReservedBytes(ctx.db, ctx.projectId, previous.batchId) +
      bytes +
      2 * IMPORT_LIMITS.artifactBytes >
      IMPORT_LIMITS.derivedBytes ||
    assets.n + pages.length + 16 + IMPORT_LIMITS.activeBatches >= LIMITS.entries
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  await requireSpace(ctx.workspace, bytes * 2 + 8 * 1024 ** 2)
  for (const page of pages) {
    const path = join(ctx.workspace, 'blobs', `.import-graph-${randomUUID()}`)
    try {
      await contained(ctx.root, join(ctx.workspace, 'blobs'), true)
      await writeFile(path, page.bytes, { flag: 'wx', mode: 0o600 })
      const saved = await stageBlob(
        ctx.root,
        ctx.workspace,
        path,
        undefined,
        undefined,
        IMPORT_LIMITS.artifactBytes
      )
      if (saved.sha256 !== page.descriptor.sha256 || saved.bytes !== page.descriptor.bytes)
        return corrupt()
    } finally {
      await unlink(path).catch(() => {})
    }
  }
  return { manifest, pages }
}
export function installImportGraph(ctx: Context, graph: PreparedGraph): void {
  const m = graph.manifest
  ctx.db
    .prepare('INSERT INTO import_graphs VALUES (?,?,?,?,?,?)')
    .run(ctx.projectId, m.id, m.batchId, m.revisionId, m.sourceRevisionId, JSON.stringify(m))
  for (const { descriptor: p } of graph.pages) {
    ctx.db
      .prepare('INSERT INTO managed_assets VALUES (?,?,?,?,?,?)')
      .run(
        ctx.projectId,
        p.assetId,
        `import-graph-${p.id}.json`,
        IMPORT_GRAPH_MEDIA,
        p.bytes,
        p.sha256
      )
    ctx.db
      .prepare('INSERT INTO import_graph_pages VALUES (?,?,?,?,?,?)')
      .run(ctx.projectId, p.id, m.id, p.index, p.assetId, JSON.stringify(p))
  }
}
export function readGraph(
  db: Database.Database,
  projectId: string,
  id: string
): { manifest: ImportGraph; pages: GraphPageDescriptor[] } {
  const row = db
    .prepare('SELECT * FROM import_graphs WHERE project_id=? AND id=?')
    .get(projectId, id)
  if (!record(row)) throw new ProjectError('NOT_FOUND')
  const manifest = body(String(row.body), isImportGraph, 40000)
  if (
    manifest.id !== row.id ||
    manifest.batchId !== row.batch_id ||
    manifest.revisionId !== row.revision_id ||
    manifest.sourceRevisionId !== row.source_revision_id
  )
    return corrupt()
  const pages: GraphPageDescriptor[] = []
  for (const raw of db
    .prepare(
      'SELECT * FROM import_graph_pages WHERE project_id=? AND graph_id=? ORDER BY page_index'
    )
    .iterate(projectId, id)) {
    if (pages.length >= GRAPH_LIMITS.pages || !record(raw)) return corrupt()
    const p = body(String(raw.body), isGraphPageDescriptor)
    if (
      p.id !== raw.id ||
      p.graphId !== id ||
      p.index !== pages.length ||
      raw.page_index !== p.index ||
      p.assetId !== raw.asset_id
    )
      return corrupt()
    const asset = db
      .prepare('SELECT * FROM managed_assets WHERE project_id=? AND id=?')
      .get(projectId, p.assetId)
    if (
      !record(asset) ||
      asset.original_name !== `import-graph-${p.id}.json` ||
      asset.media_type !== IMPORT_GRAPH_MEDIA ||
      asset.byte_size !== p.bytes ||
      asset.sha256 !== p.sha256
    )
      return corrupt()
    pages.push(p)
  }
  if (
    pages.length !== manifest.pages ||
    pages.reduce((n, p) => n + p.records, 0) !== manifest.records ||
    pages.reduce((n, p) => n + p.relations, 0) !== manifest.relations ||
    graphDigest(manifest, pages) !== manifest.digest
  )
    return corrupt()
  return { manifest, pages }
}
export function validatePortableImportGraphs(
  db: Database.Database,
  projectId: string
): ImportArtifactRef[] {
  const refs: ImportArtifactRef[] = [],
    perBatch = new Map<string, number>()
  let pages = 0,
    graphs = 0
  for (const raw of db.prepare('SELECT project_id,id FROM import_graphs ORDER BY id').iterate()) {
    if (!record(raw) || raw.project_id !== projectId || ++graphs >= LIMITS.entries) return corrupt()
    const graph = readGraph(db, projectId, String(raw.id)),
      m = graph.manifest
    const revision = db
      .prepare(
        'SELECT body,parent_id FROM import_batch_revisions WHERE project_id=? AND batch_id=? AND id=?'
      )
      .get(projectId, m.batchId, m.revisionId)
    const source = db
      .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND batch_id=? AND id=?')
      .get(projectId, m.batchId, m.sourceRevisionId)
    if (!record(revision) || !record(source)) return corrupt()
    const r = JSON.parse(String(revision.body)) as ImportRevision,
      s = JSON.parse(String(source.body)) as ImportRevision
    if (
      r.version !== 2 ||
      r.graphId !== m.id ||
      r.createdAt !== m.createdAt ||
      revision.parent_id !== m.sourceRevisionId ||
      requestDigest(r.selectedFileIds) !== requestDigest(m.files.map((f) => f.fileId)) ||
      requestDigest(r.selectedFileIds) !== requestDigest(s.selectedFileIds) ||
      requestDigest(r.settings) !== requestDigest(s.settings)
    )
      return corrupt()
    const files = m.files.map((coverage) => {
      const row = db
        .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
        .get(projectId, m.batchId, coverage.fileId)
      if (!record(row)) return corrupt()
      const file = JSON.parse(String(row.body)) as ImportFile
      if (file.sha256 !== coverage.sha256) return corrupt()
      return file
    })
    const bytes = graph.pages.reduce((n, p) => n + p.bytes, 0)
    perBatch.set(m.batchId, (perBatch.get(m.batchId) ?? 0) + bytes)
    if (
      !graph.pages.length &&
      (m.records ||
        m.relations ||
        m.conversations ||
        m.messages ||
        m.sources ||
        m.notes ||
        m.excluded ||
        m.unresolved ||
        m.fragments ||
        m.textUnits ||
        m.files.some((f) => f.records))
    )
      return corrupt()
    const external = externalEvidence(db, projectId, m.id)
    const content = contentEvidence(db, projectId, m.id)
    const analysis = analysisEvidence(db, projectId, m.id)
    const plans = planEvidence(db, projectId, m.id)
    const reviews = reviewGraphEvidence(db, projectId, m.id)
    if (
      !graph.pages.length &&
      (external.origins.length ||
        external.messages.length ||
        content.length ||
        analysis.length ||
        plans.length ||
        reviews.length)
    )
      return corrupt()
    for (const page of graph.pages) {
      if (++pages >= LIMITS.entries) return corrupt()
      refs.push({
        sha256: page.sha256,
        bytes: page.bytes,
        graph: { manifest: m, page, files, external, content, analysis, plans, reviews }
      })
    }
  }
  if (
    (db.prepare('SELECT count(*) AS n FROM import_graph_pages').get() as { n: number }).n !==
      pages ||
    (
      db
        .prepare(
          "SELECT count(*) AS n FROM import_batch_revisions WHERE json_extract(body,'$.version')=2"
        )
        .get() as { n: number }
    ).n !== graphs
  )
    return corrupt()
  for (const [batchId, bytes] of perBatch) {
    const intake = db
      .prepare(
        'SELECT coalesce(sum(a.byte_size),0) AS n FROM managed_assets a JOIN import_artifacts i ON i.project_id=a.project_id AND i.asset_id=a.id WHERE i.project_id=? AND i.batch_id=?'
      )
      .get(projectId, batchId) as { n: number }
    if (
      intake.n + bytes + analysisReservedBytes(db, projectId, batchId) >
      IMPORT_LIMITS.derivedBytes
    )
      return corrupt()
  }
  return refs
}
export function parseGraphPage(bytes: Buffer, descriptor: GraphPageDescriptor): GraphPage {
  if (bytes.length !== descriptor.bytes || hash(bytes) !== descriptor.sha256) return corrupt()
  const p = body(new TextDecoder('utf-8', { fatal: true }).decode(bytes), isGraphPage, 60000)
  if (
    p.graphId !== descriptor.graphId ||
    p.index !== descriptor.index ||
    p.records.length !== descriptor.records ||
    p.relations.length !== descriptor.relations ||
    requestDigest(p.records.map((r) => r.id)) !== requestDigest(descriptor.recordIds) ||
    graphKinds.some(
      (kind) => p.records.filter((r) => r.kind === kind).length !== descriptor.kinds[kind]
    )
  )
    return corrupt()
  return p
}
/** Cross-page semantic admission, shared by working opens, Save, archives, copies and retained proofs. */
export class GraphArtifactValidator {
  private current: ImportGraph | null = null
  private records: GraphRecord[] = []
  private relations: GraphRelation[] = []
  private files: ImportFile[] = []
  private pages = 0
  private analysis: AnalysisCapture[] = []
  private plans: ReturnType<typeof planEvidence> = []
  private reviews: ReturnType<typeof reviewGraphEvidence> = []
  private content: ImportedContentOrigin[] = []
  private external: ExternalEvidence = { origins: [], messages: [] }
  add(ref: ImportArtifactRef, bytes: Buffer): void {
    if (!ref.graph) return
    const { manifest, page, files } = ref.graph
    if (this.current?.id !== manifest.id) {
      this.finish()
      this.current = manifest
      this.files = files
      this.content = ref.graph.content ?? []
      this.analysis = ref.graph.analysis ?? []
      this.plans = ref.graph.plans ?? []
      this.reviews = ref.graph.reviews ?? []
      this.external = ref.graph.external ?? { origins: [], messages: [] }
    }
    if (page.index !== this.pages++) return corrupt()
    const value = parseGraphPage(bytes, page)
    this.records.push(...value.records)
    this.relations.push(...value.relations)
    if (
      this.records.length > GRAPH_LIMITS.records ||
      this.relations.length > GRAPH_LIMITS.relations
    )
      return corrupt()
  }
  finish(): void {
    if (!this.current) return
    const ids = new Set<string>(),
      fragments = new Set<string>(),
      texts = new Set<string>(),
      relationIds = new Set<string>(),
      counts = new Map<string, number>()
    const locator = (loc: GraphRecord['locator']): void => {
      if (!this.files.some((f) => f.id === loc.fileId && f.sha256 === loc.sha256)) corrupt()
    }
    for (const [index, r] of this.records.entries()) {
      if (r.order !== index) return corrupt()
      if (ids.has(r.id) || !isGraphRecord(r) || JSON.stringify(r).length > 48000) return corrupt()
      ids.add(r.id)
      locator(r.locator)
      counts.set(r.locator.fileId, (counts.get(r.locator.fileId) ?? 0) + 1)
      if (
        r.eligible &&
        ['message', 'note'].includes(r.kind) &&
        r.texts.reduce((n, t) => n + t.units, 0) > GRAPH_LIMITS.text
      )
        return corrupt()
      for (const fact of r.facts) {
        locator(fact.locator)
        if (fact.locator.fileId !== r.locator.fileId) return corrupt()
      }
      for (const text of r.texts) {
        locator(text.locator)
        if (text.locator.fileId !== r.locator.fileId) return corrupt()
        if (texts.has(text.id)) return corrupt()
        texts.add(text.id)
        let offset = 0
        for (const fragment of text.fragments) {
          if (fragment.start !== offset || fragment.end > text.units || fragments.has(fragment.id))
            return corrupt()
          fragments.add(fragment.id)
          offset = fragment.end
        }
        if (offset !== text.units) return corrupt()
      }
    }
    const byId = new Map(this.records.map((r) => [r.id, r]))
    const members = new Set<string>()
    for (const r of this.relations) {
      locator(r.evidence)
      if (!ids.has(r.from) || (r.to !== null && !ids.has(r.to)) || relationIds.has(r.id))
        return corrupt()
      const from = byId.get(r.from)!,
        to = r.to ? byId.get(r.to) : null
      if (r.kind === 'member') {
        if (
          !to ||
          to.kind !== 'conversation' ||
          !['message', 'retained'].includes(from.kind) ||
          members.has(from.id) ||
          from.conversationIdentityId !== to.identityId ||
          from.originNamespace !== to.originNamespace ||
          from.externalConversationId !== to.externalConversationId
        )
          return corrupt()
        members.add(from.id)
      }
      if (
        r.kind === 'parent' &&
        (!from.nodeId ||
          (to && (!to.nodeId || from.conversationIdentityId !== to.conversationIdentityId)))
      )
        return corrupt()
      if (
        r.kind === 'reference' &&
        (from.kind !== 'message' || !to || !['source', 'retained'].includes(to.kind))
      )
        return corrupt()
      if (
        ['equivalent', 'same-identity'].includes(r.kind) &&
        (!to || from.identityId !== to.identityId)
      )
        return corrupt()
      if (
        r.kind === 'equivalent' &&
        (!to ||
          from.kind !== 'message' ||
          to.kind !== 'message' ||
          !from.texts.length ||
          from.role !== to.role ||
          requestDigest(from.texts.map((t) => t.sha256)) !==
            requestDigest(to.texts.map((t) => t.sha256)))
      )
        return corrupt()
      if (r.kind === 'possible-match' && (!to || from.kind !== 'source' || to.kind !== 'source'))
        return corrupt()
      relationIds.add(r.id)
    }
    for (const r of this.records)
      if (r.conversationIdentityId && !members.has(r.id)) return corrupt()
    const total = totals(this.records, this.relations)
    if (
      Object.entries(total).some(
        ([key, value]) => this.current![key as keyof ImportGraph] !== value
      ) ||
      this.pages !== this.current.pages ||
      this.current.files.some((f) => f.records !== (counts.get(f.fileId) ?? 0))
    )
      return corrupt()
    validateExternalEvidence(this.current, this.records, this.external)
    validateContentEvidence(this.current, this.records, this.relations, this.content)
    validateAnalysisEvidence(this.records, this.relations, this.analysis, this.current.digest)
    for (const { plan, packets } of this.plans)
      validatePlanEvidence(this.records, this.relations, plan, packets)
    validateReviewGraph(this.records, this.relations, this.reviews)
    this.current = null
    this.records = []
    this.relations = []
    this.files = []
    this.pages = 0
  }
}
