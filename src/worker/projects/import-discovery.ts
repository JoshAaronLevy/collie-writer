import { importEvidenceBinding } from './import-mappings'
import { taskRefusal, assertTaskAttempt } from './import-refusals'
import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import {
  discoveryProfileStructure,
  DISCOVERY_INSTRUCTIONS,
  DISCOVERY_LIMIT,
  DISCOVERY_PROMPT,
  isDiscoveryOutput,
  isDiscoveryPacket,
  type DiscoveryOutput,
  type DiscoveryCapture,
  type DiscoveryPacket,
  type DiscoveryReview,
  type DiscoveryRequest,
  type DiscoveryValue
} from '../../shared/import-discovery'
import {
  isAnalysisCapture,
  isAnalysisRun,
  type AnalysisRun,
  type AnalysisCapture
} from '../../shared/import-analysis'
import { importFailureReason } from '../../shared/import-analysis-problem'
import { IMPORT_LIMITS, type ImportFile } from '../../shared/project-import'
import { type StructureProfile } from '../../shared/import-mapping'
import { requestDigest } from '../storage/digest'
import { captureDigest } from '../ai/capture'
import { readGraph, readImportBlob, parseGraphPage } from './import-graphs'
import { localGraphSettings, localCandidate } from './import-normalization'
import {
  prepareImportMappingProfiles,
  readImportMappingProfile,
  prepareImportMappingNormalization
} from './import-mappings'
import { graphId } from './import-readers/graph'
import { InputError, parseInputJson } from './import-readers/json'
import type { AnalysisContext } from './import-analysis-capture'

export function discoveryPacketDigest(p: DiscoveryPacket): string {
  const { captureDigest: _, ...packet } = p
  void _
  return requestDigest({
    contract: 'import-discovery-packet-v1',
    packet,
    instructions: DISCOVERY_INSTRUCTIONS
  })
}
export function validateDiscoveryOutput(
  text: string,
  p: DiscoveryPacket
): ReturnType<typeof output> {
  try {
    if (text.length > 32000) return null
    return output(parseInputJson(text, 100000).value, p)
  } catch {
    return null
  }
}
function output(v: unknown, p: DiscoveryPacket): DiscoveryOutput | null {
  return isDiscoveryOutput(v) &&
    v.partId === p.partId &&
    v.captureDigest === p.captureDigest &&
    requestDigest(v.mapping.profiles) === requestDigest(p.profiles.map((x) => x.id))
    ? v
    : null
}
function files(db: Database.Database, projectId: string, batchId: string): ImportFile[] {
  return (
    db
      .prepare(
        "SELECT body FROM import_files WHERE project_id=? AND batch_id=? ORDER BY json_extract(body,'$.order')"
      )
      .all(projectId, batchId) as { body: string }[]
  ).map((r) => JSON.parse(r.body) as ImportFile)
}
async function profilePackets(
  ctx: AnalysisContext,
  id: string,
  prepare: boolean
): Promise<{ packets: DiscoveryPacket[]; omitted: number; reason: string }> {
  const { manifest: g, pages } = readGraph(ctx.db, ctx.projectId, id),
    settings = localGraphSettings(ctx.db, ctx.projectId, g)
  if (g.version !== 1) return { packets: [], omitted: 0, reason: '' }
  if (settings.instructions.trim())
    return {
      packets: [],
      omitted: 0,
      reason:
        'Structure discovery alone cannot apply these instructions. Submit to interpret complete supported content. Your files and instructions are kept.'
    }
  const known = new Set<string>()
  for (const page of pages)
    for (const r of parseGraphPage(
      await readImportBlob(ctx, page, IMPORT_LIMITS.artifactBytes),
      page
    ).records)
      if (localCandidate(r)) known.add(r.locator.fileId)
  const originals = files(ctx.db, ctx.projectId, g.batchId),
    needs = g.files.filter(
      (f) =>
        !known.has(f.fileId) &&
        ['generic-json-v1', 'none'].includes(f.reader) &&
        ['unsupported', 'read'].includes(f.status) &&
        originals.find((x) => x.id === f.fileId)?.mediaType === 'application/json'
    )
  let omitted = 0
  const profiles: StructureProfile[] = []
  for (const f of needs) {
    try {
      if (prepare)
        profiles.push(...(await prepareImportMappingProfiles(ctx, id, undefined, [f.fileId])))
      else {
        const rows = ctx.db
          .prepare(
            "SELECT id FROM import_artifacts WHERE project_id=? AND graph_id=? AND json_extract(body,'$.part')='profile'"
          )
          .all(ctx.projectId, id) as { id: string }[]
        let found = false
        for (const r of rows) {
          const p = await readImportMappingProfile(ctx, r.id)
          if (p.fileId === f.fileId) {
            profiles.push(p)
            found = true
            break
          }
        }
        if (!found) omitted++
      }
    } catch (error) {
      if (error instanceof ProjectError && ['LIMIT_EXCEEDED', 'VALIDATION'].includes(error.code))
        omitted++
      else if (error instanceof InputError) omitted++
      else throw error
    }
  }
  const groups = new Map<string, StructureProfile[]>()
  for (const p of profiles) {
    // Same shape alone is insufficient: representative meaning must agree too.
    const key = requestDigest({
        fields: p.fields,
        collections: p.collections,
        variants: p.variants.map((v) => ({
          id: v.id,
          path: v.path,
          first: { sample: v.first.sample, omitted: v.first.omitted },
          last: { sample: v.last.sample, omitted: v.last.omitted }
        }))
      }),
      group = groups.get(key) ?? []
    group.push(p)
    groups.set(key, group)
  }
  const packets: DiscoveryPacket[] = []
  for (const group of groups.values()) {
    if (packets.length >= DISCOVERY_LIMIT) {
      omitted += group.length
      continue
    }
    // Full profiles remain protected locally; wire evidence is an explicitly bounded projection.
    const samples = group.map((p) => ({
      id: p.id,
      digest: p.digest,
      structure: discoveryProfileStructure(p)
    }))
    const task = graphId([
        'import-discovery-task-v1',
        id,
        group.map((p) => ({ id: p.id, digest: p.digest }))
      ]),
      packet: DiscoveryPacket = {
        version: 1,
        contract: 'project-import-mapping-v1',
        partId: task,
        captureDigest: '0'.repeat(64),
        batchId: g.batchId,
        graphId: g.id,
        graphDigest: g.digest,
        settings,
        files: group.map((p) => {
          const f = originals.find((f) => f.id === p.fileId)!
          return { id: f.id, name: f.originalName, sha256: f.sha256 }
        }),
        profiles: samples,
        outputContract: 'project-import-mapping-result-v1'
      }
    packet.captureDigest = discoveryPacketDigest(packet)
    if (!isDiscoveryPacket(packet)) {
      omitted += group.length
      continue
    }
    packets.push(packet)
  }
  return {
    packets,
    omitted,
    reason: omitted
      ? 'Some JSON structures exceed discovery limits: up to 8 structure requests per selection, with bounded examples and mappings. Supported findings are kept. Import fewer unfamiliar files at a time, or use a simpler structured export.'
      : ''
  }
}
export async function discoveryCapture(
  ctx: AnalysisContext,
  r: DiscoveryReview
): Promise<DiscoveryCapture> {
  const g = readGraph(ctx.db, ctx.projectId, r.graphId).manifest,
    current = ctx.db
      .prepare('SELECT current_revision_id FROM import_batches WHERE project_id=? AND id=?')
      .get(ctx.projectId, r.batchId) as { current_revision_id: string } | undefined
  if (
    g.batchId !== r.batchId ||
    g.revisionId !== r.expectedRevision ||
    !current ||
    ctx.db
      .prepare('SELECT 1 FROM import_receipts WHERE project_id=? AND batch_id=?')
      .get(ctx.projectId, g.batchId)
  )
    throw new ProjectError('STALE_REVISION')
  importEvidenceBinding(ctx, g.id, true)
  const packet = (await profilePackets(ctx, g.id, false)).packets.find((p) => p.partId === r.partId)
  if (!packet) throw new ProjectError('NOT_FOUND')
  const revision = ctx.db
    .prepare(
      'SELECT head_commit_id AS head FROM import_batch_revisions WHERE project_id=? AND id=?'
    )
    .get(ctx.projectId, g.revisionId) as { head: string }
  const c: DiscoveryCapture = {
    version: 3,
    id: r.captureId,
    source: { kind: 'none' },
    head: revision.head,
    digest: '',
    createdAt: r.createdAt,
    template: 'project-import-mapping-v1',
    prompt: DISCOVERY_PROMPT,
    context: [
      {
        kind: 'note',
        id: r.captureId,
        revision: g.id,
        label: 'Import structure examples',
        text: JSON.stringify(packet)
      }
    ],
    packet
  }
  c.digest = captureDigest(c)
  assertTaskAttempt(ctx, c)
  return c
}
export async function discoveryCommand(
  ctx: AnalysisContext,
  input: DiscoveryRequest
): Promise<DiscoveryValue> {
  const g = readGraph(ctx.db, ctx.projectId, input.graphId).manifest,
    prepared = await profilePackets(ctx, g.id, input.action === 'discovery-prepare'),
    tasks: DiscoveryValue['tasks'] = []
  const rows = ctx.db
    .prepare(
      'SELECT c.body AS capture,r.body AS run FROM import_analysis_captures c JOIN import_analysis_runs r ON r.project_id=c.project_id AND r.capture_id=c.id WHERE c.project_id=? AND c.graph_id=? ORDER BY r.rowid'
    )
    .all(ctx.projectId, g.id) as { capture: string; run: string }[]
  for (const packet of prepared.packets) {
    let found: AnalysisRun | null = null,
      foundCapture: AnalysisCapture | null = null,
      attempts = 0
    for (const row of rows) {
      const c: unknown = JSON.parse(row.capture),
        r: unknown = JSON.parse(row.run)
      if (!isAnalysisCapture(c) || !isAnalysisRun(r)) throw new ProjectError('CORRUPT_PROJECT')
      if (c.version === 3 && c.packet.captureDigest === packet.captureDigest) {
        attempts++
        if (!found || found.validation !== 'valid' || r.validation === 'valid') {
          found = r
          foundCapture = c
        }
      }
    }
    let normalizationId: string | null = null,
      reason = '',
      state: DiscoveryValue['tasks'][number]['state'] = 'unread'
    if (found) {
      state =
        found.validation === 'pending'
          ? 'pending'
          : found.validation === 'valid'
            ? 'valid'
            : found.validation === 'invalid'
              ? 'invalid'
              : 'interrupted'
      reason =
        state === 'invalid'
          ? 'ChatGPT could not provide a valid structural mapping. Its response is retained; no original content was invented.'
          : state === 'interrupted'
            ? importFailureReason(found.reason)
            : ''
      if (found.version === 3 && found.proposal && found.validation === 'valid') {
        const nid = graphId([
            'mapping-normalization-v1',
            g.id,
            g.revisionId,
            found.proposal.mapping
          ]),
          retained = ctx.db
            .prepare('SELECT 1 FROM import_artifacts WHERE project_id=? AND id=?')
            .get(ctx.projectId, nid)
        if (retained) normalizationId = nid
        else if (input.action === 'discovery-apply' && input.attemptId === found.id) {
          try {
            normalizationId = (
              await prepareImportMappingNormalization(ctx, g.id, found.proposal.mapping)
            ).id
          } catch (error) {
            if (
              error instanceof ProjectError &&
              ['VALIDATION', 'LIMIT_EXCEEDED'].includes(error.code)
            ) {
              state = 'invalid'
              reason =
                'The mapping could not be applied safely to the full file. Independent supported findings are kept.'
            } else throw error
          }
        }
      }
    }
    const refusal =
      found && foundCapture
        ? taskRefusal(ctx.db, ctx.projectId, found, foundCapture, attempts)
        : null
    tasks.push({
      id: packet.partId,
      state: refusal?.state ?? state,
      attemptId: found?.id ?? null,
      normalizationId,
      reason: refusal?.reason ?? reason
    })
  }
  return {
    type: 'discovery',
    batchId: g.batchId,
    graphId: g.id,
    revisionId: g.revisionId,
    tasks,
    omitted: prepared.omitted,
    reason: prepared.reason,
    execution: null
  }
}
export function validatePortableDiscoveryCapture(
  ctx: Pick<AnalysisContext, 'db' | 'projectId'>,
  c: DiscoveryCapture
): void {
  if (c.packet.captureDigest !== discoveryPacketDigest(c.packet))
    throw new ProjectError('CORRUPT_PROJECT')
  for (const p of c.packet.profiles) {
    const a = ctx.db
      .prepare('SELECT body FROM import_artifacts WHERE project_id=? AND graph_id=? AND id=?')
      .get(ctx.projectId, c.packet.graphId, p.id) as { body: string } | undefined
    if (!a || JSON.parse(a.body).part !== 'profile') throw new ProjectError('CORRUPT_PROJECT')
  }
}
