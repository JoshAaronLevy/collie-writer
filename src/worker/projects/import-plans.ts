import { importBatchAccepted } from './import-identities'
import { requestDigest } from '../storage/digest'
import { graphId } from './import-readers/graph'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import {
  isAnalysisPlan,
  isMultiPacket,
  isProposalRevision,
  type AnalysisPlan,
  type MultiPacket,
  type MultiWorker,
  type MultiValue,
  type ProposalRevision
} from '../../shared/import-multipart'
import {
  isAnalysisCapture,
  isAnalysisRun,
  type AnalysisRun,
  type AnalysisCapture
} from '../../shared/import-analysis'
import { IMPORT_LIMITS } from '../../shared/project-import'
import type { AnalysisContext } from './import-analysis-capture'
import {
  currentImport,
  multiPacketDigest,
  partition,
  planDigest,
  packetFits
} from './import-partition'
import { inWriteTransaction } from '../storage/driver'
import { analysisReservedBytes } from './import-analysis-budget'
import { requireSpace } from './streams'
import { LIMITS } from './manifest'
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
function decode<T>(row: unknown, accept: (v: unknown) => v is T, max = 1100000): T {
  if (!row) throw new ProjectError('NOT_FOUND')
  const text = (row as { body: string }).body
  if (typeof text !== 'string' || text.length > max) return corrupt()
  const v: unknown = JSON.parse(text)
  if (!accept(v) || JSON.stringify(v) !== text) return corrupt()
  return v
}
export function readPlan(db: Database.Database, p: string, id: string): AnalysisPlan {
  return decode(
    db
      .prepare(
        'SELECT substr(body,1,64001) AS body FROM import_analysis_plans WHERE project_id=? AND id=?'
      )
      .get(p, id),
    isAnalysisPlan,
    64000
  )
}
export function readPart(
  db: Database.Database,
  p: string,
  planId: string,
  id: string
): MultiPacket {
  return decode(
    db
      .prepare(
        'SELECT substr(body,1,60001) AS body FROM import_analysis_parts WHERE project_id=? AND plan_id=? AND id=?'
      )
      .get(p, planId, id),
    isMultiPacket,
    60000
  )
}
export function planEvidence(
  db: Database.Database,
  p: string,
  graphId: string
): Array<{ plan: AnalysisPlan; packets: MultiPacket[] }> {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 27
  )
    return []
  return (
    db
      .prepare('SELECT id FROM import_analysis_plans WHERE project_id=? AND graph_id=?')
      .all(p, graphId) as { id: string }[]
  ).map((r) => {
    const plan = readPlan(db, p, r.id)
    return { plan, packets: plan.parts.map((id) => readPart(db, p, plan.id, id)) }
  })
}
export function attempts(
  db: Database.Database,
  p: string,
  planId: string
): Array<{ run: AnalysisRun; capture: AnalysisCapture }> {
  const rows = db
    .prepare(
      "SELECT substr(r.body,1,1100001) AS run,substr(c.body,1,1100001) AS capture FROM import_analysis_runs r JOIN import_analysis_captures c ON c.project_id=r.project_id AND c.id=r.capture_id WHERE r.project_id=? AND json_extract(c.body,'$.packet.planId')=? ORDER BY r.rowid LIMIT 1025"
    )
    .all(p, planId) as { run: string; capture: string }[]
  if (rows.length > 1024) return corrupt()
  return rows.map((r) => ({
    run: decode({ body: r.run }, isAnalysisRun),
    capture: decode({ body: r.capture }, isAnalysisCapture)
  }))
}
export function selections(
  db: Database.Database,
  p: string,
  planId: string,
  requested?: string | null
): { id: string | null; selected: Map<string, string> } {
  const row = db
    .prepare(
      'SELECT current_proposal_id AS id FROM import_analysis_plan_state WHERE project_id=? AND plan_id=?'
    )
    .get(p, planId) as { id: string | null } | undefined
  if (!row) return corrupt()
  const id = requested === undefined ? row.id : requested,
    selected = new Map<string, string>(),
    seen = new Set<string>()
  let at = id
  while (at) {
    if (seen.has(at) || seen.size >= 1024) return corrupt()
    seen.add(at)
    const rev = decode(
      db
        .prepare(
          'SELECT substr(body,1,16001) AS body FROM import_analysis_proposals WHERE project_id=? AND plan_id=? AND id=?'
        )
        .get(p, planId, at),
      isProposalRevision
    )
    if (!selected.has(rev.partId)) selected.set(rev.partId, rev.attemptId)
    at = rev.parentId
  }
  return { id, selected }
}
/** Called in the same transaction as terminal settlement. An exact replay never advances the selector. */
export function consolidatePart(ctx: AnalysisContext, attemptId: string): void {
  const { db, projectId: p } = ctx,
    entry = decode(
      db
        .prepare(
          'SELECT substr(body,1,1100001) AS body FROM import_analysis_runs WHERE project_id=? AND id=?'
        )
        .get(p, attemptId),
      isAnalysisRun
    )
  const capture = decode(
    db
      .prepare(
        'SELECT substr(body,1,1100001) AS body FROM import_analysis_captures WHERE project_id=? AND id=?'
      )
      .get(p, entry.captureId),
    isAnalysisCapture
  )
  if (capture.version !== 2 || entry.validation !== 'valid') return
  if (
    db
      .prepare('SELECT id FROM import_analysis_proposals WHERE project_id=? AND attempt_id=?')
      .get(p, attemptId)
  )
    return
  const { planId, partId } = capture.packet,
    previous = selections(db, p, planId)
  const revision: ProposalRevision = {
    version: 1,
    id: randomUUID(),
    planId,
    parentId: previous.id,
    partId,
    attemptId
  }
  db.prepare('INSERT INTO import_analysis_proposals VALUES (?,?,?,?,?,?,?)').run(
    p,
    revision.id,
    planId,
    revision.parentId,
    partId,
    attemptId,
    JSON.stringify(revision)
  )
  db.prepare(
    'UPDATE import_analysis_plan_state SET current_proposal_id=? WHERE project_id=? AND plan_id=?'
  ).run(revision.id, p, planId)
}
export async function importPlanCommand(
  ctx: AnalysisContext,
  input: MultiWorker
): Promise<MultiValue> {
  const { db, projectId: p } = ctx
  if (input.action === 'plan-consolidate') throw new ProjectError('DENIED') // settlement is the sole writer
  if (input.action === 'plan-find') {
    const found = db
      .prepare(
        'SELECT id FROM import_analysis_plans WHERE project_id=? AND batch_id=? AND graph_id=?'
      )
      .get(p, input.batchId, input.graphId) as { id: string } | undefined
    if (!found) throw new ProjectError('NOT_FOUND')
    return importPlanCommand(ctx, { ...ctx, action: 'plan-read', planId: found.id, offset: 0 })
  }
  if (input.action === 'plan-prepare') {
    if (currentImport(ctx, input.batchId).id !== input.expectedRevision)
      throw new ProjectError('STALE_REVISION')
    const existing = db
      .prepare('SELECT id FROM import_analysis_plans WHERE project_id=? AND graph_id=?')
      .get(p, input.graphId) as { id: string } | undefined
    if (existing)
      return importPlanCommand(ctx, {
        ...input,
        action: 'plan-read',
        planId: existing.id,
        offset: 0
      })
    const { plan, packets } = await partition(ctx, input.batchId, input.graphId),
      bytes =
        Buffer.byteLength(JSON.stringify(plan)) +
        packets.reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0) +
        65536
    const graphBytes = (
      db
        .prepare(
          "SELECT coalesce(sum(json_extract(pg.body,'$.bytes')),0) AS n FROM import_graph_pages pg JOIN import_graphs g ON g.project_id=pg.project_id AND g.id=pg.graph_id WHERE g.project_id=? AND g.batch_id=?"
        )
        .get(p, input.batchId) as { n: number }
    ).n
    const intake = (
      db
        .prepare(
          'SELECT coalesce(sum(a.byte_size),0) AS n FROM managed_assets a JOIN import_artifacts i ON i.project_id=a.project_id AND i.asset_id=a.id WHERE i.project_id=? AND i.batch_id=?'
        )
        .get(p, input.batchId) as { n: number }
    ).n
    const database =
      Number(db.pragma('page_count', { simple: true })) *
      Number(db.pragma('page_size', { simple: true }))
    if (
      graphBytes + intake + analysisReservedBytes(db, p, input.batchId) + bytes >
        IMPORT_LIMITS.derivedBytes ||
      database + bytes * 2 > LIMITS.database
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    await requireSpace(ctx.workspace, bytes * 2)
    inWriteTransaction(db, () => {
      if (currentImport(ctx, input.batchId).id !== input.expectedRevision)
        throw new ProjectError('STALE_REVISION')
      db.prepare('INSERT INTO import_analysis_plans VALUES (?,?,?,?,?)').run(
        p,
        plan.id,
        plan.batchId,
        plan.graphId,
        JSON.stringify(plan)
      )
      packets.forEach((packet, i) =>
        db
          .prepare('INSERT INTO import_analysis_parts VALUES (?,?,?,?,?)')
          .run(p, packet.partId, plan.id, i, JSON.stringify(packet))
      )
      db.prepare('INSERT INTO import_analysis_plan_state VALUES (?,?,NULL)').run(p, plan.id)
      const prior = db.prepare('SELECT head_commit_id AS id FROM projects WHERE id=?').get(p) as {
          id: string
        },
        head = randomUUID(),
        now = new Date().toISOString()
      db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(p, head, prior.id, now)
      db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(head, now, p)
    })
    return importPlanCommand(ctx, { ...input, action: 'plan-read', planId: plan.id, offset: 0 })
  }
  const plan = readPlan(db, p, input.planId),
    revision = currentImport(ctx, plan.batchId),
    current =
      !importBatchAccepted(db, p, plan.batchId) &&
      revision.phase === 'preparing' &&
      revision.graphId === plan.graphId
  if (input.action === 'part-read')
    return { type: 'part', packet: readPart(db, p, plan.id, input.partId) }
  const entries = attempts(db, p, plan.id),
    latest = new Map(entries.map((e) => [e.capture.packet.partId, e])),
    choice = selections(db, p, plan.id)
  if (input.action === 'plan-select') {
    if (!current || input.proposalId !== choice.id) throw new ProjectError('STALE_REVISION')
    const partIds =
      input.mode === 'remaining'
        ? plan.parts.filter((id) => !latest.has(id)).slice(0, input.limit)
        : plan.parts.filter((id) => id === input.partId)
    if (!partIds.length) throw new ProjectError('VALIDATION')
    if (
      (
        db
          .prepare(
            'SELECT count(*) AS n FROM import_analysis_captures WHERE project_id=? AND batch_id=?'
          )
          .get(p, plan.batchId) as { n: number }
      ).n +
        partIds.length >
      1024
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    const packets = partIds.map((id) => readPart(db, p, plan.id, id))
    return {
      type: 'plan-selection',
      plan,
      proposalId: choice.id,
      partIds,
      units: packets.reduce((n, v) => n + JSON.stringify(v).length, 0),
      bytes: packets.reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0)
    }
  }
  if (input.action === 'proposal-read') {
    if (input.proposalId !== choice.id) throw new ProjectError('STALE_REVISION')
    const equivalence = new Map<string, string>(),
      identityGroups = new Map<string, string>(),
      fragmentRecords = new Map<string, { identityId: string }>()
    const root = (map: Map<string, string>, id: string): string => {
      let next = map.get(id)
      while (next && next !== id) {
        id = next
        next = map.get(id)
      }
      return id
    }
    const join = (map: Map<string, string>, a: string, b: string): void => {
      const x = root(map, a),
        y = root(map, b)
      if (x !== y) map.set(x < y ? y : x, x < y ? x : y)
    }
    const packets = plan.parts.map((id) => readPart(db, p, plan.id, id))
    for (const packet of packets)
      for (const f of packet.fragments)
        if (f.kind !== 'relation') fragmentRecords.set(f.recordId, { identityId: f.identityId })
    for (const packet of packets)
      for (const relation of packet.relations)
        if (relation.kind === 'equivalent' && relation.to) {
          join(equivalence, relation.from, relation.to)
          const a = fragmentRecords.get(relation.from),
            b = fragmentRecords.get(relation.to)
          if (a && b) join(identityGroups, a.identityId, b.identityId)
        }
    const groups = new Map<
      string,
      {
        id: string
        kind: string
        label: string
        records: Set<string>
        digests: Set<string>
        variants: Set<string>
      }
    >()
    for (const entry of entries) {
      if (
        choice.selected.get(entry.capture.packet.partId) !== entry.run.id ||
        entry.capture.version !== 2 ||
        !entry.run.proposal
      )
        continue
      for (const entity of entry.run.proposal.entities) {
        const fragment = entry.capture.packet.fragments.find(
          (f) => f.kind !== 'relation' && f.recordId === entity.candidateId
        )
        if (!fragment) return corrupt()
        const groupId = root(identityGroups, fragment.identityId)
        const g = groups.get(groupId) ?? {
          id: groupId,
          kind: entity.kind,
          label: fragment.label,
          records: new Set<string>(),
          digests: new Set<string>(),
          variants: new Set<string>()
        }
        g.records.add(fragment.recordId)
        g.digests.add(root(equivalence, fragment.recordId))
        for (const field of entity.fields)
          if (field.suggestedValue !== null)
            g.variants.add(`${field.name}: ${field.suggestedValue}`.slice(0, 500))
        groups.set(g.id, g)
      }
    }
    const value: Extract<MultiValue, { type: 'proposal-page' }> = {
      type: 'proposal-page',
      proposalId: choice.id,
      total: groups.size,
      items: [...groups.values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(input.offset, input.offset + 50)
        .map((g) => ({
          id: g.id,
          kind: g.kind,
          label: g.label,
          members: g.records.size,
          variants: [...g.variants].sort().slice(0, 2),
          conflict: g.digests.size > 1 || g.variants.size > 1
        }))
    }
    while (JSON.stringify(value).length > 98000 && value.items.length) value.items.pop()
    return value
  }
  const fileCoverage = new Map(
    plan.files.map((f) => [f.id, { fileId: f.id, identified: 0, unresolved: 0 }])
  )
  let identified = 0,
    unresolved = 0
  for (const e of entries)
    if (choice.selected.get(e.capture.packet.partId) === e.run.id)
      for (const c of e.run.proposal?.coverage ?? []) {
        c.outcome === 'identified' ? identified++ : unresolved++
        if (e.capture.version === 2) {
          const f = e.capture.packet.fragments.find((f) => f.id === c.fragmentId),
            coverage = f && fileCoverage.get(f.fileId)
          if (!coverage) return corrupt()
          c.outcome === 'identified' ? coverage.identified++ : coverage.unresolved++
        }
      }
  const value: Extract<MultiValue, { type: 'plan' }> = {
    type: 'plan',
    plan,
    current,
    proposalId: choice.id,
    total: plan.parts.length,
    completed: choice.selected.size,
    fileCoverage: [...fileCoverage.values()],
    identified,
    unresolved,
    remaining: plan.parts.filter((id) => !latest.has(id)).length,
    failed: [...latest.values()].filter(
      (e) => e.run.validation !== 'pending' && e.run.validation !== 'valid'
    ).length,
    offset: input.offset,
    execution: null,
    rows: plan.parts.slice(input.offset, input.offset + 50).map((id, i) => {
      const packet = readPart(db, p, plan.id, id),
        e = latest.get(id)
      return {
        id,
        ordinal: input.offset + i + 1,
        fragments: packet.fragments.length,
        files: [...new Set(packet.fragments.map((f) => f.fileId))],
        attemptId: e?.run.id ?? null,
        state: e?.run.state ?? 'not-started',
        validation: e?.run.validation ?? 'pending',
        selected: choice.selected.has(id)
      }
    })
  }
  while (JSON.stringify(value).length > 98000 && value.rows.length) value.rows.pop()
  return value
}
export function validatePortablePlans(db: Database.Database, p: string): void {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 27
  )
    return
  for (const table of [
    'import_analysis_plans',
    'import_analysis_parts',
    'import_analysis_proposals',
    'import_analysis_plan_state'
  ])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p)) corrupt()
  for (const row of db
    .prepare('SELECT id,batch_id,graph_id FROM import_analysis_plans WHERE project_id=?')
    .all(p) as { id: string; batch_id: string; graph_id: string }[]) {
    const plan = readPlan(db, p, row.id),
      packets = plan.parts.map((id) => readPart(db, p, plan.id, id))
    const partRows = db
      .prepare(
        'SELECT id,ordinal FROM import_analysis_parts WHERE project_id=? AND plan_id=? ORDER BY ordinal'
      )
      .all(p, plan.id) as { id: string; ordinal: number }[]
    if (
      plan.id !== row.id ||
      plan.batchId !== row.batch_id ||
      plan.graphId !== row.graph_id ||
      plan.digest !== planDigest(plan, packets) ||
      partRows.length !== plan.parts.length ||
      partRows.some((r, i) => r.ordinal !== i || r.id !== plan.parts[i])
    )
      corrupt()
    const graphRow = db
      .prepare('SELECT body FROM import_graphs WHERE project_id=? AND id=?')
      .get(p, plan.graphId) as { body: string } | undefined
    if (!graphRow) return corrupt()
    const graph = JSON.parse(graphRow.body)
    const revisionRow = db
      .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND id=? AND batch_id=?')
      .get(p, plan.revisionId, plan.batchId) as { body: string } | undefined
    if (!revisionRow) return corrupt()
    const revision = JSON.parse(revisionRow.body)
    if (
      plan.id !== graphId(['import-analysis-plan-v1', graph.id, graph.digest]) ||
      plan.revisionId !== graph.revisionId ||
      plan.createdAt !== graph.createdAt ||
      plan.graphDigest !== graph.digest ||
      plan.instructions !== revision.settings.instructions
    )
      return corrupt()
    const files = graph.files.map((f: { fileId: string; sha256: string }) => {
      const row = db
        .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
        .get(p, plan.batchId, f.fileId) as { body: string } | undefined
      if (!row) return corrupt()
      return { id: f.fileId, name: JSON.parse(row.body).originalName, sha256: f.sha256 }
    })
    if (
      requestDigest(plan.files) !==
      requestDigest(
        files.map((f: { id: string; name: string }) => ({
          id: f.id,
          name: f.name,
          fragments: packets.reduce(
            (n, v) => n + v.fragments.filter((x) => x.fileId === f.id).length,
            0
          )
        }))
      )
    )
      corrupt()
    if (
      packets.some(
        (v, i) =>
          v.partId !== graphId(['import-analysis-part-v1', plan.id, i]) ||
          requestDigest(v.files) !== requestDigest(files) ||
          requestDigest(v.settings) !== requestDigest(revision.settings)
      )
    )
      corrupt()
    if (
      packets.some(
        (packet) =>
          packet.planId !== plan.id ||
          packet.batchId !== plan.batchId ||
          packet.graphId !== plan.graphId ||
          packet.graphDigest !== plan.graphDigest ||
          packet.excluded !== plan.excluded ||
          packet.captureDigest !== multiPacketDigest(packet) ||
          !packetFits(packet)
      )
    )
      corrupt()
    if (
      plan.fragments !== packets.reduce((n, v) => n + v.fragments.length, 0) ||
      plan.inputUnits !== packets.reduce((n, v) => n + JSON.stringify(v).length, 0) ||
      plan.inputBytes !== packets.reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0)
    )
      corrupt()
    const entries = attempts(db, p, plan.id),
      byId = new Map(entries.map((e) => [e.run.id, e])),
      revs = db
        .prepare(
          'SELECT id,parent_id,part_id,attempt_id,body FROM import_analysis_proposals WHERE project_id=? AND plan_id=?'
        )
        .all(p, plan.id) as {
        id: string
        parent_id: string | null
        part_id: string
        attempt_id: string
        body: string
      }[]
    const previous = new Set<string | null>([null])
    let next = selections(db, p, plan.id).id,
      count = 0
    while (next) {
      const r = revs.find((r) => r.id === next)
      if (!r || ++count > 1024) corrupt()
      const rev = decode(r, isProposalRevision),
        entry = byId.get(rev.attemptId)
      if (
        rev.id !== r!.id ||
        rev.planId !== plan.id ||
        rev.parentId !== r!.parent_id ||
        rev.partId !== r!.part_id ||
        rev.attemptId !== r!.attempt_id ||
        !entry ||
        entry.run.validation !== 'valid' ||
        entry.capture.packet.partId !== rev.partId ||
        previous.has(rev.id)
      )
        corrupt()
      previous.add(rev.id)
      next = rev.parentId
    }
    if (
      count !== revs.length ||
      entries
        .filter((e) => e.run.validation === 'valid')
        .some((e) => !revs.some((r) => r.attempt_id === e.run.id))
    )
      corrupt()
  }
}
