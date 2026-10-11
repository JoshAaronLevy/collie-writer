import { taskRefusal, assertTaskAttempt } from './import-refusals'
import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { record } from '../../shared/projects'
import { IMPORT_LIMITS, type ImportSettings, type ImportFile } from '../../shared/project-import'
import {
  isAnalysisCapture,
  isAnalysisRun,
  type AnalysisRun,
  type AnalysisCapture
} from '../../shared/import-analysis'
import { importFailureReason } from '../../shared/import-analysis-problem'
import {
  SEMANTIC_INSTRUCTIONS,
  SEMANTIC_PROMPT,
  SEMANTIC_TASK_LIMIT,
  isSemanticArtifact,
  isSemanticPlan,
  isSemanticOutput,
  isSemanticPacket,
  type SemanticPlan,
  type SemanticArtifact,
  type SemanticPacket,
  type SemanticOutput,
  type SemanticCapture,
  type SemanticReview,
  type SemanticRequest,
  type SemanticValue,
  type SemanticSelection,
  type SemanticTask
} from '../../shared/import-semantic'
import type { GraphRecord, GraphText, ImportGraph } from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'
import { captureDigest } from '../ai/capture'
import { readGraph, readImportBlob, parseGraphPage, type ImportArtifactRef } from './import-graphs'
import { retainImportEvidence, importEvidenceBinding } from './import-mappings'
import { OriginalTranscriptText } from './conversation-transcript'
import { localCandidate, localGraphSettings } from './import-normalization'
import { graphId, textDigest, textBoundary } from './import-readers/records'
import { parseInputJson, valueAt } from './import-readers/json'
import type { BuiltGraph } from './import-readers/graph'
import type { AnalysisContext } from './import-analysis-capture'
type Context = Pick<AnalysisContext, 'db' | 'projectId' | 'workspaceId' | 'root' | 'workspace'>
import type { BlobRef } from './manifest'
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
const hash = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
export const semanticPlanId = (g: ImportGraph): string =>
  graphId(['import-semantic-plan-v1', g.id, g.digest])
const planDigest = (p: SemanticPlan): string => {
  const { digest: _, ...body } = p
  void _
  return requestDigest({ contract: 'import-semantic-plan-v1', ...body })
}
const artifactDigest = (p: SemanticArtifact): string => {
  const { digest: _, ...body } = p
  void _
  return requestDigest({ contract: 'import-semantic-artifact-v1', ...body })
}
export const semanticPacketDigest = (p: SemanticPacket): string => {
  const { captureDigest: _, ...body } = p
  void _
  return requestDigest({
    contract: 'import-semantic-packet-v1',
    packet: body,
    instructions: SEMANTIC_INSTRUCTIONS
  })
}
async function built(ctx: Context, id: string): Promise<BuiltGraph> {
  const { manifest: g, pages } = readGraph(ctx.db, ctx.projectId, id),
    b: BuiltGraph = { records: [], relations: [], files: g.files, textUnits: g.textUnits }
  for (const p of pages) {
    const v = parseGraphPage(await readImportBlob(ctx, p, IMPORT_LIMITS.artifactBytes), p)
    b.records.push(...v.records)
    b.relations.push(...v.relations)
  }
  return b
}
type TextRead = (r: GraphRecord, t: GraphText) => Promise<string>
const visible = (r: GraphRecord): boolean =>
  r.disposition === 'candidate' && !['alternate', 'unresolved'].includes(r.path)
function contextRecords(b: BuiltGraph, task: SemanticTask): SemanticPacket['records'] {
  const ids = new Set(task.context),
    parents = new Map(b.relations.filter((r) => r.kind === 'member').map((r) => [r.from, r.to]))
  return b.records
    .filter((r) => ids.has(r.id))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      parentId: parents.get(r.id) ?? null,
      label: r.label,
      role: r.role,
      metadata: r.facts.map((f) => ({ name: f.name, value: f.value })),
      unknownFields: r.unknownFields
    }))
}
async function packet(
  p: SemanticPlan,
  task: SemanticTask,
  b: BuiltGraph,
  read: TextRead
): Promise<SemanticPacket> {
  const ranges: SemanticPacket['ranges'] = [],
    byId = new Map(b.records.map((r) => [r.id, r]))
  for (const range of task.ranges) {
    const r = byId.get(range.recordId),
      t = r?.texts.find((t) => t.id === range.textId)
    if (!r || !t || range.total !== t.units || range.end > t.units) return corrupt()
    const text = await read(r, t)
    ranges.push({ ...range, text: text.slice(range.start, range.end) })
  }
  const result: SemanticPacket = {
    version: 1,
    contract: 'project-import-semantic-v1',
    partId: task.id,
    captureDigest: '0'.repeat(64),
    planId: p.id,
    graphId: p.graphId,
    graphDigest: p.graphDigest,
    batchId: p.batchId,
    settings: p.settings,
    mode: task.mode,
    targets: task.targets,
    records: contextRecords(b, task),
    ranges
  }
  result.captureDigest = semanticPacketDigest(result)
  return result
}
/** Classification scans original text; metadata presence does not suppress additional inline references. */
async function makePlan(
  g: ImportGraph,
  settings: ImportSettings,
  b: BuiltGraph,
  read: TextRead
): Promise<SemanticPlan> {
  const p: SemanticPlan = {
    version: 1,
    id: semanticPlanId(g),
    batchId: g.batchId,
    graphId: g.id,
    graphDigest: g.digest,
    revisionId: g.revisionId,
    settings,
    tasks: [],
    limitation: '',
    digest: ''
  }
  const semanticRecords = b.records.filter((r) => visible(r) && r.texts.length > 0),
    targets = b.records.filter(localCandidate).map((r) => r.id)
  const task = (
    mode: SemanticTask['mode'],
    ranges: SemanticTask['ranges'],
    context: string[],
    targetIds: string[]
  ): SemanticTask => ({
    id: graphId(['import-semantic-task-v1', p.id, mode, ranges, context, targetIds]),
    mode,
    ranges,
    context,
    targets: targetIds
  })
  if (settings.instructions.trim()) {
    if (
      g.files.some(
        (f) =>
          f.status !== 'read' ||
          f.reader === 'none' ||
          (g.version === 1 && f.reader === 'generic-json-v1')
      ) ||
      b.records.some((r) => r.disposition === 'unresolved' || r.disposition === 'unsupported')
    )
      p.limitation =
        'Your instructions require content that could not be fully read. No unfiltered findings will be imported. Narrow the selection to supported content or remove the instructions.'
    else if (targets.length > 128)
      p.limitation =
        'This selection has too many items to apply your instructions in one complete context. Import fewer files or a smaller export; your originals and instructions are kept.'
    else {
      const ranges: SemanticTask['ranges'] = []
      for (const r of semanticRecords)
        for (const t of r.texts)
          if (t.units > 0)
            ranges.push({
              id: graphId(['semantic-range-v1', p.id, r.id, t.id, 0, t.units]),
              recordId: r.id,
              textId: t.id,
              start: 0,
              end: t.units,
              total: t.units
            })
      const context = b.records.filter((r) => visible(r)).map((r) => r.id),
        t = task('selection', ranges, context, targets)
      if (!isSemanticPacket(await packet(p, t, b, read)))
        p.limitation =
          'Your instructions need more original context than one supported request can hold (50,000 characters including metadata). Use a smaller selection or export. Collie has not applied the instructions or included unfiltered items.'
      else p.tasks.push(t)
    }
  } else {
    const parents = new Map(
      b.relations.filter((r) => r.kind === 'member').map((r) => [r.from, r.to])
    )
    const referenceTargets = new Map<string, Set<string>>()
    const sourcesById = new Map(b.records.filter((r) => r.kind === 'source').map((r) => [r.id, r]))
    for (const link of b.relations)
      if (link.kind === 'reference' && link.to) {
        const source = sourcesById.get(link.to)
        if (!source) continue
        const values = referenceTargets.get(link.from) ?? new Set<string>()
        for (const fact of source.facts)
          if (
            [
              'URL',
              'url',
              'DOI',
              'ISBN',
              'normalized.URL',
              'mapped.original.URL',
              'mapped.original.DOI',
              'mapped.original.ISBN'
            ].includes(fact.name) &&
            fact.value
          ) {
            values.add(fact.value)
            if (fact.name.endsWith('DOI')) {
              values.add(`https://doi.org/${fact.value}`)
              values.add(`http://dx.doi.org/${fact.value}`)
            }
          }
        referenceTargets.set(link.from, values)
      }
    for (const r of semanticRecords) {
      // Structured bibliography/source rows are already interpreted by the local reader.
      if (r.kind !== 'message' && r.kind !== 'note') continue
      const plain = g.files.find((f) => f.fileId === r.locator.fileId)?.reader === 'text-v1'
      for (const t of r.texts) {
        const text = await read(r, t)
        let remaining = text
        for (const literal of referenceTargets.get(r.id) ?? [])
          remaining = remaining.split(literal).join('')
        // Production classification only: literal notes stay local; reference-like prose needs interpretation.
        const sources =
          settings.categories.includes('sources') &&
          (plain ||
            /(?:https?:\/\/|\bdoi\s*[:/]\s*\S+|\bISBN\s*[: -]?\s*\d|\b[Rr]eferences\b|\b[Bb]ibliography\b|(?:^|\n)\s*(?:#{1,6}\s*)?[Ss]ources?\s*:|\([A-Z][^\n()]{1,80},?\s+(?:19|20)\d{2}[a-z]?\)|\b[A-Z][^\n()]{0,80}\((?:19|20)\d{2}[a-z]?\)|\[[^\]\n]{2,100}\]\([^)]+\))/u.test(
              remaining
            ))
        const notes =
          settings.categories.includes('notes') &&
          r.kind === 'message' &&
          /(?:^|\n)\s*(?:#{1,6}\s*)?(?:Notes?|Personal notes?)\s*:/iu.test(text)
        if (!sources && !notes) continue
        for (let start = 0; start < text.length;) {
          const end = textBoundary(text, Math.min(text.length, start + 24000)),
            range = {
              id: graphId(['semantic-range-v1', p.id, r.id, t.id, start, end]),
              recordId: r.id,
              textId: t.id,
              start,
              end,
              total: t.units
            },
            parent = parents.get(r.id),
            context = [r.id, ...(parent ? [parent] : [])],
            item = task('prose', [range], context, [])
          if (!isSemanticPacket(await packet(p, item, b, read))) {
            p.limitation =
              'Some prose and its metadata exceed the supported interpretation context; those references remain unresolved.'
            break
          }
          p.tasks.push(item)
          if (p.tasks.length > SEMANTIC_TASK_LIMIT) {
            p.tasks = []
            p.limitation =
              'This selection needs more than 1,024 targeted interpretation tasks. Import fewer files or a smaller export. Independently supported local findings remain available.'
            break
          }
          if (end === text.length) break
          start = textBoundary(text, Math.max(start + 1, end - 512))
        }
        if (p.limitation.includes('1,024')) break
      }
      if (p.limitation.includes('1,024')) break
      if (p.tasks.length % 16 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }
  p.digest = planDigest(p)
  if (!isSemanticPlan(p) || JSON.stringify(p).length > IMPORT_LIMITS.artifactBytes)
    throw new ProjectError('IMPORT_ANALYSIS_TOO_LARGE')
  return p
}
function artifact(db: Database.Database, p: string, id: string): SemanticArtifact | null {
  const row = db
    .prepare('SELECT body FROM import_artifacts WHERE project_id=? AND id=?')
    .get(p, id) as { body: string } | undefined
  if (!row) return null
  const a: unknown = JSON.parse(row.body)
  if (!isSemanticArtifact(a) || a.digest !== artifactDigest(a)) return corrupt()
  return a
}
async function plan(ctx: Context, id: string, prepare: boolean): Promise<SemanticPlan> {
  const source = importEvidenceBinding(ctx, id, prepare)
  if (source.graph.version === 3) throw new ProjectError(prepare ? 'VALIDATION' : 'NOT_FOUND')
  const old = artifact(ctx.db, ctx.projectId, semanticPlanId(source.graph))
  if (old) {
    const p: unknown = JSON.parse(
      (await readImportBlob(ctx, old, IMPORT_LIMITS.artifactBytes)).toString('utf8')
    )
    if (
      !isSemanticPlan(p) ||
      p.digest !== planDigest(p) ||
      p.graphDigest !== source.graph.digest ||
      requestDigest(p.settings) !== requestDigest(source.settings)
    )
      return corrupt()
    return p
  }
  if (!prepare) throw new ProjectError('NOT_FOUND')
  const b = await built(ctx, id),
    reader = new OriginalTranscriptText(ctx, source.graph.batchId),
    p = await makePlan(source.graph, source.settings, b, (r, t) =>
      reader.read({ ...r, texts: [t] })
    ),
    bytes = Buffer.from(JSON.stringify(p)),
    a: SemanticArtifact = {
      version: 1,
      kind: 'semantic-plan-v1',
      id: p.id,
      batchId: p.batchId,
      graphId: p.graphId,
      revisionId: p.revisionId,
      assetId: graphId(['semantic-plan-asset-v1', p.id]),
      sha256: hash(bytes),
      bytes: bytes.length,
      createdAt: new Date().toISOString(),
      digest: ''
    }
  a.digest = artifactDigest(a)
  await retainImportEvidence(ctx, source, [{ artifact: a, bytes }])
  return p
}
export function validateSemanticOutput(text: string, p: SemanticPacket): SemanticOutput | null {
  try {
    const v: unknown = parseInputJson(text, 100000).value
    if (
      !isSemanticOutput(v) ||
      v.partId !== p.partId ||
      v.captureDigest !== p.captureDigest ||
      requestDigest(v.decisions.map((d) => d.recordId).sort()) !==
        requestDigest([...p.targets].sort())
    )
      return null
    const byId = new Map(p.ranges.map((r) => [r.id, r])),
      validSpan = (s: SemanticOutput['extractions'][number]['span']): boolean => {
        const r = byId.get(s.rangeId)
        return (
          !!r &&
          s.end <= r.text.length &&
          textBoundary(r.text, s.start) === s.start &&
          textBoundary(r.text, s.end) === s.end
        )
      }
    if (
      v.unresolvedRanges.some((id) => !byId.has(id)) ||
      v.extractions.some(
        (e) =>
          !p.settings.categories.includes(e.kind === 'source' ? 'sources' : 'notes') ||
          (e.kind === 'note' &&
            p.records.find((r) => r.id === byId.get(e.span.rangeId)?.recordId)?.kind === 'note') ||
          !validSpan(e.span) ||
          new Set(e.fields.map((f) => f.name)).size !== e.fields.length ||
          e.fields.some(
            (f) =>
              !validSpan(f.span) ||
              f.span.end - f.span.start > 1000 ||
              f.span.rangeId !== e.span.rangeId ||
              f.span.start < e.span.start ||
              f.span.end > e.span.end ||
              (e.kind === 'note' && f.name !== 'title')
          ) ||
          (e.kind === 'source' && !e.fields.some((f) => f.name === 'title' || f.name === 'URL'))
      )
    )
      return null
    if (
      !v.supported &&
      (v.extractions.length ||
        v.decisions.some((d) => d.decision !== 'unresolved') ||
        v.unresolvedRanges.length !== p.ranges.length)
    )
      return null
    return v
  } catch {
    return null
  }
}
export async function semanticCapture(
  ctx: AnalysisContext,
  r: SemanticReview
): Promise<SemanticCapture> {
  const source = importEvidenceBinding(ctx, r.graphId, true),
    p = await plan(ctx, r.graphId, false),
    task = p.tasks.find((t) => t.id === r.partId)
  if (!task || r.expectedRevision !== source.graph.revisionId || r.batchId !== p.batchId)
    throw new ProjectError('STALE_REVISION')
  const b = await built(ctx, r.graphId),
    reader = new OriginalTranscriptText(ctx, p.batchId),
    value = await packet(p, task, b, (r, t) => reader.read({ ...r, texts: [t] }))
  if (!isSemanticPacket(value)) throw new ProjectError('IMPORT_ANALYSIS_TOO_LARGE')
  const revision = ctx.db
    .prepare('SELECT head_commit_id AS id FROM import_batch_revisions WHERE project_id=? AND id=?')
    .get(ctx.projectId, source.graph.revisionId) as { id: string }
  const c: SemanticCapture = {
    version: 4,
    id: r.captureId,
    source: { kind: 'none' },
    head: revision.id,
    digest: '',
    createdAt: r.createdAt,
    template: 'project-import-semantic-v1',
    prompt: SEMANTIC_PROMPT,
    context: [
      {
        kind: 'note',
        id: r.captureId,
        revision: r.graphId,
        label: 'Import interpretation evidence',
        text: JSON.stringify(value)
      }
    ],
    packet: value
  }
  c.digest = captureDigest(c)
  assertTaskAttempt(ctx, c)
  return c
}
export async function semanticCommand(
  ctx: Context,
  input: SemanticRequest
): Promise<SemanticValue> {
  const p = await plan(ctx, input.graphId, input.action === 'semantic-prepare'),
    rows = ctx.db
      .prepare(
        'SELECT c.body AS capture,r.body AS run FROM import_analysis_captures c JOIN import_analysis_runs r ON r.project_id=c.project_id AND r.capture_id=c.id WHERE c.project_id=? AND c.graph_id=? ORDER BY r.rowid'
      )
      .all(ctx.projectId, p.graphId) as { capture: string; run: string }[]
  const tasks: SemanticValue['tasks'] = p.tasks.map((t) => {
    let found: AnalysisRun | null = null,
      foundCapture: AnalysisCapture | null = null,
      attempts = 0
    for (const row of rows) {
      const c: unknown = JSON.parse(row.capture),
        r: unknown = JSON.parse(row.run)
      if (!isAnalysisCapture(c) || !isAnalysisRun(r)) return corrupt()
      if (c.version === 4 && c.packet.planId === p.id && c.packet.partId === t.id) {
        attempts++
        if (!found || found.validation !== 'valid' || r.validation === 'valid') {
          found = r
          foundCapture = c
        }
      }
    }
    const state =
      found?.validation === 'pending'
        ? 'pending'
        : found?.validation === 'valid'
          ? 'valid'
          : found?.validation === 'invalid'
            ? 'invalid'
            : found
              ? 'interrupted'
              : 'unread'
    const refusal =
      found && foundCapture
        ? taskRefusal(ctx.db, ctx.projectId, found, foundCapture, attempts)
        : null
    const unsupported = found?.version === 4 && found.proposal && !found.proposal.supported
    return {
      id: t.id,
      state: refusal?.state ?? state,
      attemptId: found?.id ?? null,
      normalizationId: null,
      reason:
        refusal?.reason ??
        (unsupported
          ? 'Your instructions or this passage could not be interpreted safely. Unresolved content is kept.'
          : state === 'invalid'
            ? 'ChatGPT did not return valid original span references. That response was retained but not imported.'
            : state === 'interrupted'
              ? importFailureReason(found!.reason)
              : '')
    }
  })
  return {
    type: 'semantic',
    planId: p.id,
    batchId: p.batchId,
    graphId: p.graphId,
    revisionId: p.revisionId,
    tasks,
    omitted: p.limitation ? 1 : 0,
    reason: p.limitation,
    execution: null
  }
}
type Selected = { capture: SemanticCapture; run: Extract<AnalysisRun, { version: 4 }> }
function selected(
  db: Database.Database,
  projectId: string,
  s: SemanticSelection,
  sourceId: string
): Selected[] {
  return s.attempts.map((id) => {
    const row = db
      .prepare(
        'SELECT c.body AS capture,r.body AS run FROM import_analysis_runs r JOIN import_analysis_captures c ON c.project_id=r.project_id AND c.id=r.capture_id WHERE r.project_id=? AND r.id=?'
      )
      .get(projectId, id) as { capture: string; run: string } | undefined
    if (!row) return corrupt()
    const c: unknown = JSON.parse(row.capture),
      r: unknown = JSON.parse(row.run)
    if (
      !isAnalysisCapture(c) ||
      c.version !== 4 ||
      !isAnalysisRun(r) ||
      r.version !== 4 ||
      !r.proposal ||
      r.validation !== 'valid' ||
      c.packet.planId !== s.planId ||
      c.packet.graphId !== sourceId
    )
      return corrupt()
    return { capture: c, run: r }
  })
}
/** Deterministic composition copies full records or literal original spans; it never rewrites bodies. */
function compose(p: SemanticPlan, b: BuiltGraph, results: Selected[]): BuiltGraph {
  const instructions = !!p.settings.instructions.trim(),
    selection = results.find((x) => x.capture.packet.mode === 'selection'),
    decisions = new Map(selection?.run.proposal?.decisions.map((d) => [d.recordId, d.decision])),
    resolved = instructions && !p.limitation && selection?.run.proposal?.supported
  const records = b.records.map((r) => {
      if (!instructions || !localCandidate(r)) return { ...r }
      const decision = resolved ? decisions.get(r.id) : 'unresolved'
      return decision === 'include'
        ? { ...r }
        : {
            ...r,
            eligible: false,
            ...(decision === 'unresolved'
              ? {
                  disposition: 'unresolved' as const,
                  issues: [
                    ...r.issues.slice(0, 31),
                    'The instruction condition is unresolved for this original record.'
                  ]
                }
              : {})
          }
    }),
    relations = [...b.relations],
    byId = new Map(b.records.map((r) => [r.id, r])),
    ids = new Set(records.map((r) => r.id))
  for (const entry of results) {
    const output = entry.run.proposal!,
      packet = entry.capture.packet
    if (!output.supported) continue
    for (const e of output.extractions) {
      const range = packet.ranges.find((r) => r.id === e.span.rangeId)!,
        parent = byId.get(range.recordId)!,
        part = parent.texts.find((t) => t.id === range.textId)!,
        start = part.start + range.start + e.span.start,
        end = part.start + range.start + e.span.end,
        id = graphId(['semantic-original-record-v1', part.locator, e.kind, start, end])
      if (ids.has(id)) continue
      ids.add(id)
      const body = range.text.slice(e.span.start, e.span.end),
        textId = graphId([
          'semantic-original-text-v1',
          e.kind,
          parent.id,
          part.locator.fileId,
          part.locator.sha256,
          part.locator.pointer,
          start,
          end
        ]),
        fields = e.fields.map((f) => ({
          name: f.name,
          value: range.text.slice(f.span.start, f.span.end),
          start: part.start + range.start + f.span.start,
          end: part.start + range.start + f.span.end
        })),
        title =
          fields.find((f) => f.name === 'title')?.value ??
          fields.find((f) => f.name === 'URL')?.value ??
          'Imported note'
      const r: GraphRecord = {
        version: 1,
        id,
        kind: e.kind,
        locator: part.locator,
        originNamespace: 'unknown',
        identityId: graphId([
          'semantic-original-identity-v1',
          part.locator.sha256,
          part.locator.pointer,
          e.kind,
          start,
          end
        ]),
        conversationIdentityId: null,
        externalId: null,
        externalConversationId: null,
        nodeId: null,
        label: title.replace(/[\r\n\t]/gu, ' ').slice(0, 256),
        role: null,
        contentType: 'semantic-original-v1',
        order: records.length,
        path: 'none',
        disposition: 'candidate',
        eligible: true,
        texts: [
          {
            id: textId,
            locator: part.locator,
            start,
            end,
            units: body.length,
            sha256: textDigest(body),
            fragments: []
          }
        ],
        facts: [{ name: 'semantic.origin', value: parent.id, locator: part.locator }],
        unknownFields: [],
        issues: [
          'Extracted from original prose; bibliographic facts remain unverified and note authorship unspecified.'
        ]
      }
      for (let pos = 0; pos < body.length;) {
        const next = textBoundary(body, Math.min(body.length, pos + 16000))
        r.texts[0].fragments.push({
          id: graphId(['fragment-v1', textId, pos, next]),
          start: pos,
          end: next
        })
        pos = next
      }
      for (const f of fields) {
        if (f.value.length > 4000) {
          r.issues.push('An overlong original metadata field could not be represented.')
          continue
        }
        r.facts.push(
          { name: `semantic.original.${f.name}`, value: f.value, locator: part.locator },
          {
            name: `semantic.span.${f.name}`,
            value: JSON.stringify({ start: f.start, end: f.end }),
            locator: part.locator
          }
        )
      }
      records.push(r)
      if (e.kind === 'source' && parent.kind === 'message')
        relations.push({
          version: 1,
          id: graphId(['relation-v1', 'reference', parent.id, r.id, part.locator, 'cited']),
          kind: 'reference',
          from: parent.id,
          to: r.id,
          evidence: part.locator,
          decision: 'cited',
          grade: null,
          issue: null
        })
    }
  }
  // A conversation with excluded messages retains original order/identity; no reconstructed transcript is invented.
  return {
    records: records.map((r, order) => ({ ...r, order })),
    relations,
    files: b.files.map((f) => ({
      ...f,
      records: records.filter((r) => r.locator.fileId === f.fileId).length
    })),
    textUnits: records.reduce(
      (n, r) =>
        n +
        r.texts.reduce((n, t) => n + t.units, 0) +
        r.facts.reduce((n, f) => n + f.value.length, 0),
      0
    )
  }
}
export async function semanticBuiltGraph(
  ctx: Context,
  sourceId: string,
  s: SemanticSelection
): Promise<BuiltGraph> {
  const p = await plan(ctx, sourceId, false)
  if (p.id !== s.planId) throw new ProjectError('STALE_REVISION')
  const results = selected(ctx.db, ctx.projectId, s, sourceId)
  if (new Set(results.map((r) => r.capture.packet.partId)).size !== results.length) return corrupt()
  return compose(p, await built(ctx, sourceId), results)
}
export async function semanticUnresolved(
  ctx: Context,
  sourceId: string,
  s: SemanticSelection
): Promise<number> {
  const p = await plan(ctx, sourceId, false),
    results = selected(ctx.db, ctx.projectId, s, sourceId)
  return unresolved(p, results)
}
function unresolved(p: SemanticPlan, results: Selected[]): number {
  const byId = new Map(results.map((r) => [r.capture.packet.partId, r]))
  return (
    (p.limitation ? 1 : 0) +
    p.tasks.filter((t) => {
      const r = byId.get(t.id)
      return (
        !r ||
        !r.run.proposal?.supported ||
        r.run.proposal.unresolvedRanges.length > 0 ||
        r.run.proposal.decisions.some((d) => d.decision === 'unresolved')
      )
    }).length
  )
}
export function validatePortableSemanticCapture(
  db: Database.Database,
  projectId: string,
  c: SemanticCapture
): void {
  const g = readGraph(db, projectId, c.packet.graphId).manifest,
    a = artifact(db, projectId, c.packet.planId)
  if (
    !a ||
    a.graphId !== g.id ||
    a.revisionId !== g.revisionId ||
    c.packet.planId !== semanticPlanId(g) ||
    c.packet.captureDigest !== semanticPacketDigest(c.packet) ||
    c.packet.graphDigest !== g.digest ||
    requestDigest(c.packet.settings) !== requestDigest(localGraphSettings(db, projectId, g))
  )
    return corrupt()
}
export function validateSemanticGraphSql(
  db: Database.Database,
  projectId: string,
  g: Extract<ImportGraph, { version: 3 }>
): void {
  const source = readGraph(db, projectId, g.sourceGraphId).manifest,
    a = artifact(db, projectId, g.semantic.planId),
    results = selected(db, projectId, g.semantic, source.id)
  if (
    source.version === 3 ||
    source.batchId !== g.batchId ||
    source.revisionId !== g.sourceRevisionId ||
    !a ||
    a.graphId !== source.id ||
    g.semantic.planId !== semanticPlanId(source) ||
    requestDigest(source.files.map((f) => ({ fileId: f.fileId, sha256: f.sha256 }))) !==
      requestDigest(g.files.map((f) => ({ fileId: f.fileId, sha256: f.sha256 }))) ||
    new Set(results.map((r) => r.capture.packet.partId)).size !== results.length
  )
    return corrupt()
  for (const r of results) validatePortableSemanticCapture(db, projectId, r.capture)
}
export type SemanticEvidenceRef = {
  artifact: SemanticArtifact
  source: ImportGraph
  settings: ImportSettings
  pages: ReturnType<typeof readGraph>['pages']
  files: ImportFile[]
  captures: SemanticCapture[]
  derived: Array<{
    graph: Extract<ImportGraph, { version: 3 }>
    pages: ReturnType<typeof readGraph>['pages']
    results: Selected[]
  }>
}
export function validatePortableImportSemantics(
  db: Database.Database,
  projectId: string,
  version: number
): ImportArtifactRef[] {
  const refs: ImportArtifactRef[] = [],
    allCaptures = (
      version >= 36
        ? (db
            .prepare(
              "SELECT body FROM import_analysis_captures WHERE project_id=? AND json_extract(body,'$.version')=4"
            )
            .all(projectId) as { body: string }[])
        : []
    ).map((row) => {
      const c: unknown = JSON.parse(row.body)
      if (!isAnalysisCapture(c) || c.version !== 4) return corrupt()
      validatePortableSemanticCapture(db, projectId, c)
      return c
    })
  for (const raw of db
    .prepare("SELECT * FROM import_artifacts WHERE json_extract(body,'$.kind')='semantic-plan-v1'")
    .iterate()) {
    if (
      version < 36 ||
      !record(raw) ||
      raw.project_id !== projectId ||
      typeof raw.body !== 'string'
    )
      return corrupt()
    const a = artifact(db, projectId, String(raw.id))
    if (
      !a ||
      a.id !== raw.id ||
      a.batchId !== raw.batch_id ||
      a.assetId !== raw.asset_id ||
      a.assetId !== graphId(['semantic-plan-asset-v1', a.id])
    )
      return corrupt()
    const { manifest: source, pages } = readGraph(db, projectId, a.graphId),
      asset = db
        .prepare('SELECT * FROM managed_assets WHERE project_id=? AND id=?')
        .get(projectId, a.assetId)
    if (
      source.version === 3 ||
      source.revisionId !== a.revisionId ||
      source.batchId !== a.batchId ||
      a.id !== semanticPlanId(source) ||
      !record(asset) ||
      asset.sha256 !== a.sha256 ||
      asset.byte_size !== a.bytes ||
      asset.original_name !== `import-${a.id}.json` ||
      asset.media_type !== 'application/vnd.collie.import+json'
    )
      return corrupt()
    const derived: SemanticEvidenceRef['derived'] = []
    for (const row of db
      .prepare(
        "SELECT id FROM import_graphs WHERE project_id=? AND json_extract(body,'$.version')=3 AND json_extract(body,'$.sourceGraphId')=?"
      )
      .all(projectId, source.id) as { id: string }[]) {
      const g = readGraph(db, projectId, row.id)
      if (g.manifest.version !== 3) return corrupt()
      validateSemanticGraphSql(db, projectId, g.manifest)
      derived.push({
        graph: g.manifest,
        pages: g.pages,
        results: selected(db, projectId, g.manifest.semantic, source.id)
      })
    }
    const files = source.files.map((f) => {
      const row = db
        .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
        .get(projectId, source.batchId, f.fileId) as { body: string } | undefined
      if (!row) return corrupt()
      const file = JSON.parse(row.body) as ImportFile
      if (file.sha256 !== f.sha256) return corrupt()
      return file
    })
    refs.push({
      sha256: a.sha256,
      bytes: a.bytes,
      semantic: {
        artifact: a,
        source,
        pages,
        files,
        settings: localGraphSettings(db, projectId, source),
        captures: allCaptures.filter((c) => c.packet.planId === a.id),
        derived
      }
    })
  }
  return refs
}
/** Rebuilds plans/packets/composition from protected originals for Save, copy and archive admission. */
export async function validateSemanticArtifactBytes(
  refs: ImportArtifactRef[],
  read: (r: BlobRef) => Promise<Buffer>
): Promise<void> {
  const load = async (
    g: ImportGraph,
    pages: ReturnType<typeof readGraph>['pages']
  ): Promise<BuiltGraph> => {
    const b: BuiltGraph = { records: [], relations: [], files: g.files, textUnits: g.textUnits }
    for (const page of pages) {
      const x = parseGraphPage(await read(page), page)
      b.records.push(...x.records)
      b.relations.push(...x.relations)
    }
    return b
  }
  for (const ref of refs) {
    const e = ref.semantic
    if (!e) continue
    const bytes = await read(ref)
    if (hash(bytes) !== e.artifact.sha256 || bytes.length !== e.artifact.bytes) return corrupt()
    const p: unknown = JSON.parse(bytes.toString('utf8'))
    if (!isSemanticPlan(p) || p.digest !== planDigest(p) || p.id !== e.artifact.id) return corrupt()
    const source = await load(e.source, e.pages)
    let cached: { fileId: string; value: unknown } | null = null
    const text: TextRead = async (r, t) => {
      const f = e.files.find((f) => f.id === t.locator.fileId)
      if (!f || f.sha256 !== t.locator.sha256) return corrupt()
      if (cached?.fileId !== f.id) {
        const bytes = await read(f)
        if (bytes.length !== f.bytes || hash(bytes) !== f.sha256) return corrupt()
        let raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
        if (raw.startsWith('\uFEFF')) raw = raw.slice(1)
        cached = {
          fileId: f.id,
          value: f.mediaType === 'application/json' ? parseInputJson(raw).value : raw
        }
      }
      const v = valueAt(cached.value, t.locator.pointer)
      if (
        typeof v !== 'string' ||
        t.end > v.length ||
        textBoundary(v, t.start) !== t.start ||
        textBoundary(v, t.end) !== t.end
      )
        return corrupt()
      const part = v.slice(t.start, t.end)
      if (textDigest(part) !== t.sha256 || part.length !== t.units || r.disposition === 'internal')
        return corrupt()
      return part
    }
    if (requestDigest(await makePlan(e.source, e.settings, source, text)) !== requestDigest(p))
      return corrupt()
    for (const c of e.captures) {
      const task = p.tasks.find((t) => t.id === c.packet.partId)
      if (!task || requestDigest(await packet(p, task, source, text)) !== requestDigest(c.packet))
        return corrupt()
    }
    for (const d of e.derived) {
      const expected = compose(p, source, d.results),
        actual = await load(d.graph, d.pages)
      if (
        d.graph.unresolvedTasks !== unresolved(p, d.results) ||
        requestDigest(expected) !== requestDigest(actual)
      )
        return corrupt()
    }
  }
}
