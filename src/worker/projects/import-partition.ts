import { importBatchAccepted } from './import-identities'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../storage/digest'
import { captureDigest } from '../ai/capture'
import { graphId, textBoundary, textDigest } from './import-readers/graph'
import { readGraph, readImportBlob, parseGraphPage } from './import-graphs'
import { OriginalTranscriptText } from './conversation-transcript'
import { IMPORT_LIMITS, type ImportFile, type ImportRevision } from '../../shared/project-import'
import type { GraphRecord, GraphRelation } from '../../shared/import-graph'
import { isMultiProposal } from '../../shared/import-analysis'
import {
  isAnalysisPlan,
  isMultiPacket,
  MULTIPART_PROMPT,
  MULTIPART_INSTRUCTIONS,
  type AnalysisPlan,
  type MultiPacket,
  type MultiFragment,
  type MultiCapture,
  type MultiReview,
  type MultiProposal
} from '../../shared/import-multipart'
import { parseInputJson } from './import-readers/json'
import type { AnalysisContext } from './import-analysis-capture'
export const multiPacketDigest = (p: MultiPacket): string => {
  const { captureDigest: _, ...rest } = p
  void _
  return requestDigest({
    contract: 'import-analysis-packet-v2',
    packet: rest,
    instructions: MULTIPART_INSTRUCTIONS
  })
}
export const planDigest = (p: AnalysisPlan, packets: MultiPacket[]): string => {
  const { digest: _, ...rest } = p
  void _
  return requestDigest({
    contract: 'import-analysis-plan-v1',
    plan: rest,
    parts: packets.map((p) => p.captureDigest)
  })
}
export function packetFits(p: MultiPacket): boolean {
  const raw = JSON.stringify(p),
    wire = JSON.stringify({
      model: 'x'.repeat(100),
      instructions: MULTIPART_INSTRUCTIONS,
      input: [{ role: 'user', content: raw }],
      store: false,
      stream: true
    })
  return (
    isMultiPacket(p) &&
    Buffer.byteLength(raw) <= 240000 &&
    wire.length <= 80000 &&
    Buffer.byteLength(wire) <= 320000
  )
}
export async function analysisGraph(
  ctx: AnalysisContext,
  graphId: string
): Promise<{ records: GraphRecord[]; relations: GraphRelation[] }> {
  const { pages } = readGraph(ctx.db, ctx.projectId, graphId),
    records: GraphRecord[] = [],
    relations: GraphRelation[] = []
  for (const page of pages) {
    const p = parseGraphPage(await readImportBlob(ctx, page, IMPORT_LIMITS.artifactBytes), page)
    records.push(...p.records)
    relations.push(...p.relations)
  }
  return { records, relations }
}
export function currentImport(ctx: AnalysisContext, batchId: string): ImportRevision {
  const row = ctx.db
    .prepare(
      'SELECT r.body FROM import_batches b JOIN import_batch_revisions r ON r.project_id=b.project_id AND r.id=b.current_revision_id WHERE b.project_id=? AND b.id=?'
    )
    .get(ctx.projectId, batchId) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return JSON.parse(row.body) as ImportRevision
}
export const metadataText = (r: GraphRecord): string =>
  JSON.stringify({
    ...r,
    texts: r.texts.map(({ fragments: _, ...t }) => {
      void _
      return t
    })
  })
export function fragmentsFor(
  r: GraphRecord,
  text: string,
  kind: MultiFragment['kind'],
  textId: string | null,
  graph: string,
  fileId = r.locator.fileId,
  digest = requestDigest(r)
): MultiFragment[] {
  const result: MultiFragment[] = []
  for (let start = 0; start < text.length || (!text.length && !result.length);) {
    const end = textBoundary(text, Math.min(text.length, start + 12000)),
      value = text.slice(start, end),
      sha256 = textDigest(value)
    result.push({
      id: graphId(['import-fragment-v1', graph, r.id, kind, textId, start, end, sha256]),
      recordId: r.id,
      recordDigest: digest,
      identityId: r.identityId,
      fileId,
      recordKind: r.kind,
      label: kind === 'relation' ? 'Relationship' : r.label,
      kind,
      textId,
      start,
      end,
      total: text.length,
      sha256,
      text: value
    })
    if (end === text.length) break
    start = end
  }
  return result
}
export async function partition(
  ctx: AnalysisContext,
  batchId: string,
  graph: string
): Promise<{ plan: AnalysisPlan; packets: MultiPacket[] }> {
  const revision = currentImport(ctx, batchId),
    { manifest } = readGraph(ctx.db, ctx.projectId, graph)
  if (
    importBatchAccepted(ctx.db, ctx.projectId, batchId) ||
    revision.phase !== 'preparing' ||
    revision.graphId !== graph ||
    manifest.batchId !== batchId
  )
    throw new ProjectError('STALE_REVISION')
  const { records, relations } = await analysisGraph(ctx, graph),
    selected = records.filter((r) => r.eligible && r.disposition === 'candidate'),
    selectedIds = new Set(selected.map((r) => r.id)),
    byId = new Map(records.map((r) => [r.id, r]))
  if (!selected.length) throw new ProjectError('VALIDATION')
  const files = manifest.files.map((f) => {
    const row = ctx.db
      .prepare('SELECT body FROM import_files WHERE project_id=? AND id=?')
      .get(ctx.projectId, f.fileId) as { body: string }
    const file = JSON.parse(row.body) as ImportFile
    return { id: file.id, name: file.originalName, sha256: file.sha256 }
  })
  const id = graphId(['import-analysis-plan-v1', graph, manifest.digest]),
    packets: MultiPacket[] = [],
    reader = new OriginalTranscriptText(ctx, batchId)
  let current: MultiPacket | null = null,
    fragmentCount = 0
  const next = (): MultiPacket => ({
    version: 2,
    contract: 'project-import-analysis-v2',
    outputContract: 'project-import-proposal-v2',
    planId: id,
    partId: graphId(['import-analysis-part-v1', id, packets.length]),
    captureDigest: '0'.repeat(64),
    batchId,
    graphId: graph,
    graphDigest: manifest.digest,
    settings: revision.settings,
    projectContext: null,
    files,
    fragments: [],
    relations: [],
    excluded: records.length - selected.length
  })
  const finish = (): void => {
    if (!current) return
    current.captureDigest = multiPacketDigest(current)
    if (!packetFits(current)) throw new ProjectError('LIMIT_EXCEEDED')
    packets.push(current)
    current = null
    if (packets.length > 1024) throw new ProjectError('LIMIT_EXCEEDED')
  }
  const add = (f: MultiFragment, relation?: GraphRelation): void => {
    const draft = current ?? next(),
      candidate = {
        ...draft,
        fragments: [...draft.fragments, f],
        relations:
          relation && !draft.relations.some((r) => r.id === relation.id)
            ? [...draft.relations, relation]
            : draft.relations
      }
    if (!packetFits(candidate)) {
      if (!current) throw new ProjectError('LIMIT_EXCEEDED')
      finish()
      add(f, relation)
      return
    }
    current = candidate
    fragmentCount++
  }
  for (const r of selected) {
    for (const f of fragmentsFor(r, metadataText(r), 'metadata', null, graph)) add(f)
    const body = await reader.read(r)
    let offset = 0
    for (const text of r.texts) {
      for (const f of fragmentsFor(
        r,
        body.slice(offset, offset + text.units),
        'text',
        text.id,
        graph
      ))
        add(f)
      offset += text.units
    }
  }
  for (const relation of relations.filter(
    (r) => selectedIds.has(r.from) || (!!r.to && selectedIds.has(r.to))
  )) {
    const original = byId.get(relation.from)
    if (!original) throw new ProjectError('CORRUPT_PROJECT')
    // Relationship metadata has its own stable identity; no excluded message body is transmitted.
    const witness = { ...original, id: relation.id, identityId: relation.id }
    for (const f of fragmentsFor(
      witness,
      JSON.stringify(relation),
      'relation',
      null,
      graph,
      relation.evidence.fileId,
      requestDigest(relation)
    ))
      add(f, relation)
  }
  finish()
  const plan: AnalysisPlan = {
    version: 1,
    id,
    revisionId: revision.id,
    batchId,
    graphId: graph,
    graphDigest: manifest.digest,
    createdAt: manifest.createdAt,
    digest: '',
    parts: packets.map((p) => p.partId),
    fragments: fragmentCount,
    records: selected.length,
    excluded: records.length - selected.length,
    inputUnits: packets.reduce((n, p) => n + JSON.stringify(p).length, 0),
    inputBytes: packets.reduce((n, p) => n + Buffer.byteLength(JSON.stringify(p)), 0),
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      fragments: packets.reduce(
        (n, p) => n + p.fragments.filter((x) => x.fileId === f.id).length,
        0
      )
    })),
    instructions: revision.settings.instructions
  }
  plan.digest = planDigest(plan, packets)
  if (!isAnalysisPlan(plan)) throw new ProjectError('LIMIT_EXCEEDED')
  return { plan, packets }
}
export function multiCapture(
  ctx: AnalysisContext,
  input: MultiReview,
  packet: MultiPacket
): MultiCapture {
  const revision = currentImport(ctx, input.batchId)
  if (
    revision.id !== input.expectedRevision ||
    importBatchAccepted(ctx.db, ctx.projectId, input.batchId) ||
    revision.phase !== 'preparing' ||
    revision.graphId !== input.graphId ||
    packet.planId !== input.planId ||
    packet.partId !== input.partId ||
    packet.batchId !== input.batchId ||
    packet.graphId !== input.graphId
  )
    throw new ProjectError('STALE_REVISION')
  const { manifest } = readGraph(ctx.db, ctx.projectId, input.graphId)
  const head = (
    ctx.db
      .prepare(
        'SELECT head_commit_id AS id FROM import_batch_revisions WHERE project_id=? AND id=?'
      )
      .get(ctx.projectId, manifest.revisionId) as { id: string }
  ).id
  const c: MultiCapture = {
    version: 2,
    id: input.captureId,
    createdAt: input.createdAt,
    head,
    prompt: MULTIPART_PROMPT,
    source: { kind: 'none' },
    context: [
      {
        kind: 'note',
        id: input.captureId,
        revision: input.graphId,
        label: 'Selected import part',
        text: JSON.stringify(packet)
      }
    ],
    digest: '',
    template: 'project-import-analysis-v2',
    packet
  }
  c.digest = captureDigest(c)
  return c
}
export function validateMultiProposal(output: string, p: MultiPacket): MultiProposal | null {
  try {
    if (output.length > 32000 || Buffer.byteLength(output) > 128000) return null
    const v = parseInputJson(output, 30000).value
    if (!isMultiProposal(v) || v.partId !== p.partId || v.captureDigest !== p.captureDigest)
      return null
    const fs = new Map(p.fragments.map((f) => [f.id, f])),
      records = new Map(
        p.fragments.filter((f) => f.kind !== 'relation').map((f) => [f.recordId, f])
      )
    if (
      v.coverage.length !== fs.size ||
      new Set(v.coverage.map((c) => c.fragmentId)).size !== fs.size ||
      v.coverage.some((c) => !fs.has(c.fragmentId))
    )
      return null
    if (new Set(v.entities.map((e) => e.candidateId)).size !== v.entities.length) return null
    for (const e of v.entities) {
      const r = records.get(e.candidateId)
      if (
        !r ||
        e.recordRefs.length !== 1 ||
        e.recordRefs[0] !== r.recordId ||
        e.kind !== (r.recordKind === 'conversation' ? 'chat' : r.recordKind) ||
        new Set(e.fields.map((f) => f.name)).size !== e.fields.length
      )
        return null
      for (const f of e.fields) {
        if (
          !['title', 'body', 'role', 'order'].includes(f.name) ||
          f.evidenceRefs.some((id) => id !== r.recordId)
        )
          return null
        if (f.suggestedValue !== null) {
          if (f.name !== 'title' || !f.inferred || !f.evidenceRefs.length) return null
        } else if (
          f.inferred ||
          f.valueRef !== `record:${r.recordId}:${f.name}` ||
          (f.name === 'body' && !['message', 'note'].includes(e.kind)) ||
          (['role', 'order'].includes(f.name) && e.kind !== 'message')
        )
          return null
      }
    }
    if (
      v.links.some(
        (l) =>
          !l.evidenceRefs.length ||
          !l.evidenceRefs.every((id) =>
            p.relations.some(
              (r) => r.id === id && r.kind === l.kind && r.from === l.from && r.to === l.to
            )
          )
      )
    )
      return null
    const allowed = new Set(p.fragments.map((f) => f.recordId))
    if (v.issues.some((i) => i.recordRefs.some((id) => !allowed.has(id)))) return null
    if (
      v.coverage.some(
        (c) =>
          c.outcome === 'identified' &&
          (fs.get(c.fragmentId)!.kind === 'relation'
            ? !v.links.some((l) => l.evidenceRefs.includes(fs.get(c.fragmentId)!.recordId))
            : !v.entities.some((e) => e.candidateId === fs.get(c.fragmentId)!.recordId))
      )
    )
      return null
    return v
  } catch {
    return null
  }
}
/** Portable plan evidence is checked against the admitted original graph, including every text range. */
export function validatePlanEvidence(
  records: GraphRecord[],
  relations: GraphRelation[],
  plan: AnalysisPlan,
  packets: MultiPacket[]
): void {
  const corrupt = (): never => {
      throw new ProjectError('CORRUPT_PROJECT')
    },
    selected = records.filter((r) => r.eligible && r.disposition === 'candidate'),
    byId = new Map(records.map((r) => [r.id, r])),
    eligible = new Set(selected.map((r) => r.id)),
    rels = relations.filter((r) => eligible.has(r.from) || (!!r.to && eligible.has(r.to))),
    rmap = new Map(rels.map((r) => [r.id, r]))
  const grouped = new Map<string, MultiFragment[]>()
  for (const p of packets)
    for (const f of p.fragments) {
      const key = JSON.stringify([f.kind, f.recordId, f.textId])
      const group = grouped.get(key) ?? []
      group.push(f)
      grouped.set(key, group)
    }
  const ordered: MultiFragment[] = []
  let groups = 0
  const check = (
    r: GraphRecord,
    kind: MultiFragment['kind'],
    textId: string | null,
    total: number,
    digest: string,
    text: string | null,
    fileId = r.locator.fileId,
    rd = requestDigest(r)
  ): void => {
    groups++
    const group = grouped.get(JSON.stringify([kind, r.id, textId]))
    if (!group?.length) return corrupt()
    let at = 0
    const body: string[] = []
    for (const f of group) {
      if (
        f.start !== at ||
        f.total !== total ||
        f.recordDigest !== rd ||
        f.identityId !== r.identityId ||
        f.recordKind !== r.kind ||
        f.fileId !== fileId ||
        f.sha256 !== textDigest(f.text) ||
        f.label !== (kind === 'relation' ? 'Relationship' : r.label) ||
        f.id !==
          graphId([
            'import-fragment-v1',
            plan.graphId,
            r.id,
            kind,
            textId,
            f.start,
            f.end,
            f.sha256
          ])
      )
        return corrupt()
      at = f.end
      body.push(f.text)
    }
    const joined = body.join('')
    if (at !== total || textDigest(joined) !== digest || (text !== null && joined !== text))
      return corrupt()
    // Exact deterministic boundaries, including surrogate-pair preservation.
    const expected = fragmentsFor(r, joined, kind, textId, plan.graphId, fileId, rd)
    ordered.push(...expected)
    if (requestDigest(group) !== requestDigest(expected)) return corrupt()
  }
  for (const r of selected) {
    const m = metadataText(r)
    check(r, 'metadata', null, m.length, textDigest(m), m)
    for (const t of r.texts) check(r, 'text', t.id, t.units, t.sha256, null)
  }
  for (const relation of rels) {
    const r = byId.get(relation.from)!
    const text = JSON.stringify(relation)
    check(
      { ...r, id: relation.id, identityId: relation.id },
      'relation',
      null,
      text.length,
      textDigest(text),
      text,
      relation.evidence.fileId,
      requestDigest(relation)
    )
  }
  if (requestDigest(ordered) !== requestDigest(packets.flatMap((p) => p.fragments)))
    return corrupt()
  if (
    groups !== grouped.size ||
    plan.records !== selected.length ||
    plan.excluded !== records.length - selected.length
  )
    return corrupt()
  for (const p of packets) {
    const expected = p.fragments
      .filter((f) => f.kind === 'relation')
      .map((f) => rmap.get(f.recordId))
    if (
      expected.some((r) => !r) ||
      requestDigest([...new Map(expected.map((r) => [r!.id, r!])).values()]) !==
        requestDigest(p.relations)
    )
      return corrupt()
  }
}
