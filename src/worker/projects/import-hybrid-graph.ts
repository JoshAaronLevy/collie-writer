import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import type {
  GraphRecord,
  GraphRelation,
  ImportGraph,
  MappingSelection
} from '../../shared/import-graph'
import { IMPORT_LIMITS } from '../../shared/project-import'
import { isAnalysisCapture, isAnalysisRun } from '../../shared/import-analysis'
import { isMappingNormalization } from '../../shared/import-mapping'
import { requestDigest } from '../storage/digest'
import { readGraph, readImportBlob, parseGraphPage, type ImportArtifactRef } from './import-graphs'
import { readImportMappingNormalization } from './import-mappings'
import type { BuiltGraph } from './import-readers/graph'
import type { OpenInput } from '../../shared/projects'
import type { BlobRef } from './manifest'
type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
export function validateHybridGraphSql(
  db: Database.Database,
  p: string,
  g: Extract<ImportGraph, { version: 2 }>
): Array<{
  normalizationId: string
  mapping: import('../../shared/import-mapping').ImportMapping
}> {
  const results: Array<{
    normalizationId: string
    mapping: import('../../shared/import-mapping').ImportMapping
  }> = []
  const source = readGraph(db, p, g.sourceGraphId).manifest
  if (
    source.version !== 1 ||
    source.batchId !== g.batchId ||
    source.revisionId !== g.sourceRevisionId ||
    requestDigest(source.files.map((f) => ({ fileId: f.fileId, sha256: f.sha256 }))) !==
      requestDigest(g.files.map((f) => ({ fileId: f.fileId, sha256: f.sha256 })))
  )
    return corrupt()
  for (const m of g.mappings) {
    const row = db
        .prepare(
          'SELECT c.body AS capture,r.body AS run FROM import_analysis_runs r JOIN import_analysis_captures c ON c.project_id=r.project_id AND c.id=r.capture_id WHERE r.project_id=? AND r.id=?'
        )
        .get(p, m.attemptId) as { capture: string; run: string } | undefined,
      a = db
        .prepare('SELECT body FROM import_artifacts WHERE project_id=? AND id=?')
        .get(p, m.normalizationId) as { body: string } | undefined
    if (!row || !a) return corrupt()
    const c: unknown = JSON.parse(row.capture),
      r: unknown = JSON.parse(row.run),
      artifact = JSON.parse(a.body)
    if (
      !isAnalysisCapture(c) ||
      c.version !== 3 ||
      !isAnalysisRun(r) ||
      r.version !== 3 ||
      r.validation !== 'valid' ||
      !r.proposal ||
      c.packet.graphId !== source.id ||
      artifact.graphId !== source.id ||
      artifact.part !== 'normalization'
    )
      return corrupt()
    results.push({ normalizationId: m.normalizationId, mapping: r.proposal.mapping })
  }
  return results
}
function merge(source: BuiltGraph, mapped: BuiltGraph[]): BuiltGraph {
  const replaced = new Set<string>(),
    records: GraphRecord[] = [],
    relations: GraphRelation[] = []
  for (const b of mapped)
    for (const f of b.files) {
      if (replaced.has(f.fileId)) return corrupt()
      replaced.add(f.fileId)
    }
  records.push(
    ...source.records.filter((r) => !replaced.has(r.locator.fileId)),
    ...mapped.flatMap((b) => b.records)
  )
  const ids = new Set(records.map((r) => r.id))
  if (ids.size !== records.length) return corrupt()
  relations.push(
    ...source.relations.filter((r) => ids.has(r.from) && (r.to === null || ids.has(r.to))),
    ...mapped.flatMap((b) => b.relations)
  )
  const files = source.files.map(
    (f) => mapped.flatMap((b) => b.files).find((x) => x.fileId === f.fileId) ?? f
  )
  return {
    records: records.map((r, order) => ({ ...r, order })),
    relations,
    files,
    textUnits: records.reduce(
      (n, r) =>
        n +
        r.texts.reduce((n, t) => n + t.units, 0) +
        r.facts.reduce((n, f) => n + f.value.length, 0),
      0
    )
  }
}
export async function hybridBuiltGraph(
  ctx: Context,
  sourceId: string,
  mappings: MappingSelection[]
): Promise<BuiltGraph> {
  const source = readGraph(ctx.db, ctx.projectId, sourceId),
    base: BuiltGraph = {
      records: [],
      relations: [],
      files: source.manifest.files,
      textUnits: source.manifest.textUnits
    },
    mapped: BuiltGraph[] = []
  for (const page of source.pages) {
    const p = parseGraphPage(await readImportBlob(ctx, page, IMPORT_LIMITS.artifactBytes), page)
    base.records.push(...p.records)
    base.relations.push(...p.relations)
  }
  for (const selection of mappings) {
    const n = await readImportMappingNormalization(ctx, selection.normalizationId)
    if (n.graphId !== sourceId || n.revisionId !== source.manifest.revisionId) return corrupt()
    const row = ctx.db
        .prepare('SELECT body FROM import_analysis_runs WHERE project_id=? AND id=?')
        .get(ctx.projectId, selection.attemptId) as { body: string } | undefined,
      r: unknown = row ? JSON.parse(row.body) : null
    if (
      !isAnalysisRun(r) ||
      r.version !== 3 ||
      r.validation !== 'valid' ||
      !r.proposal ||
      requestDigest(r.proposal.mapping) !== requestDigest(n.mapping)
    )
      return corrupt()
    const b: BuiltGraph = {
      records: [],
      relations: [],
      files: n.result.files,
      textUnits: n.result.textUnits
    }
    for (const p of n.result.pages) {
      const parsed = parseGraphPage(await readImportBlob(ctx, p, IMPORT_LIMITS.artifactBytes), p)
      b.records.push(...parsed.records)
      b.relations.push(...parsed.relations)
    }
    mapped.push(b)
  }
  return merge(base, mapped)
}
/** Portable admission proves the combined graph equals known originals plus whole-file mapped results. */
export async function validateHybridGraphBytes(
  refs: ImportArtifactRef[],
  read: (r: BlobRef) => Promise<Buffer>
): Promise<void> {
  const graphRefs = new Map<string, ImportArtifactRef[]>()
  for (const r of refs)
    if (r.graph) {
      const a = graphRefs.get(r.graph.manifest.id) ?? []
      a.push(r)
      graphRefs.set(r.graph.manifest.id, a)
    }
  const load = async (rs: ImportArtifactRef[]): Promise<BuiltGraph> => {
    const manifest = rs[0]?.graph?.manifest
    if (!manifest) return corrupt()
    const b: BuiltGraph = {
      records: [],
      relations: [],
      files: manifest.files,
      textUnits: manifest.textUnits
    }
    for (const r of rs) {
      const p = parseGraphPage(await read(r), r.graph!.page)
      b.records.push(...p.records)
      b.relations.push(...p.relations)
    }
    return b
  }
  for (const rs of graphRefs.values()) {
    const g = rs[0].graph!.manifest
    if (g.version !== 2) continue
    const baseRefs = graphRefs.get(g.sourceGraphId),
      base = baseRefs
        ? await load(baseRefs)
        : {
            records: [],
            relations: [],
            files: g.files.map((f) => ({ ...f, records: 0 })),
            textUnits: 0
          },
      mapped: BuiltGraph[] = []
    for (const m of g.mappings) {
      const ref = refs.find((r) => r.mapping?.artifact.id === m.normalizationId)
      if (!ref) return corrupt()
      const n: unknown = JSON.parse((await read(ref)).toString('utf8'))
      if (
        !isMappingNormalization(n) ||
        n.graphId !== g.sourceGraphId ||
        requestDigest(n.mapping) !==
          requestDigest(
            rs[0].graph!.mappingRuns?.find((r) => r.normalizationId === m.normalizationId)?.mapping
          )
      )
        return corrupt()
      const b: BuiltGraph = {
        records: [],
        relations: [],
        files: n.result.files,
        textUnits: n.result.textUnits
      }
      for (const p of n.result.pages) {
        const pageRef = refs.find((r) => r.mapping?.artifact.id === p.id)
        if (!pageRef) return corrupt()
        const parsed = parseGraphPage(await read(pageRef), p)
        b.records.push(...parsed.records)
        b.relations.push(...parsed.relations)
      }
      mapped.push(b)
    }
    const expected = merge(base, mapped),
      actual = await load(rs)
    if (requestDigest(actual) !== requestDigest(expected)) return corrupt()
  }
}
