import {
  automaticChoices,
  compatibleSourceMetadata,
  outsideSelectionReason,
  sourceKeys
} from './import-automatic'
import { OriginalTranscriptText } from './conversation-transcript'
import {
  acceptedIdentities,
  importIdentity,
  alreadyImportedReason,
  importBatchAccepted
} from './import-identities'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import {
  isImportReview,
  isReviewChoice,
  isReviewRevision,
  isReviewRequest,
  isConfirmationManifest,
  isConfirmationEntry,
  type AutomaticReviewRequest,
  type ImportSummary,
  type ImportReview,
  type ReviewChoice,
  type ReviewRevision,
  type ReviewKind,
  type ReviewRequest,
  type ReviewValue,
  type ReviewRow,
  type ReviewCounts,
  type ReviewSource,
  type ConfirmationEntry,
  type ConfirmationManifest
} from '../../shared/import-review'
import type { GraphRecord, GraphRelation } from '../../shared/import-graph'
import type { ContentCandidate } from '../../shared/import-content'
import type { SourceMetadata } from '../../shared/sources'
import { IMPORT_LIMITS } from '../../shared/project-import'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { graphId } from './import-readers/graph'
import { readPlan, readPart, attempts, selections } from './import-plans'
import { currentImport } from './import-partition'
import { prepareImportContent, type PreparedContent } from './import-content'
import { normalizeMetadata } from './sources'
import { analysisReservedBytes } from './import-analysis-budget'
import { requireSpace } from './streams'
import { LIMITS } from './manifest'
import type { AnalysisContext } from './import-analysis-capture'
import {
  isAnalysisCapture,
  isAnalysisRun,
  type AnalysisCapture,
  type AnalysisRun
} from '../../shared/import-analysis'
import { hasControlCharacters } from '../../shared/control-characters'

const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
function decode<T>(row: unknown, check: (v: unknown) => v is T, max = 256000): T {
  if (!row) throw new ProjectError('NOT_FOUND')
  const body = (row as { body: string }).body
  if (typeof body !== 'string' || body.length > max) return corrupt()
  const value: unknown = JSON.parse(body)
  if (!check(value) || JSON.stringify(value) !== body) return corrupt()
  return value
}
export function readImportReview(db: Database.Database, p: string, id: string): ImportReview {
  return decode(
    db
      .prepare(
        'SELECT substr(body,1,256001) AS body FROM import_reviews WHERE project_id=? AND id=?'
      )
      .get(p, id),
    isImportReview
  )
}
export function reviewChoices(
  db: Database.Database,
  p: string,
  id: string,
  at?: string | null
): { revisionId: string | null; partial: boolean; choices: Map<string, ReviewChoice> } {
  const state = db
    .prepare(
      'SELECT current_revision_id AS id FROM import_review_state WHERE project_id=? AND review_id=?'
    )
    .get(p, id) as { id: string | null } | undefined
  if (!state) return corrupt()
  const revisionId = at === undefined ? state.id : at,
    choices = new Map<string, ReviewChoice>(),
    seen = new Set<string>()
  let next = revisionId,
    partial = false,
    total = 0
  while (next) {
    if (seen.has(next) || seen.size >= 1024) return corrupt()
    seen.add(next)
    const rev = decode(
      db
        .prepare(
          'SELECT substr(body,1,4001) AS body FROM import_review_revisions WHERE project_id=? AND review_id=? AND id=?'
        )
        .get(p, id, next),
      isReviewRevision,
      4000
    )
    if (rev.id !== next || rev.reviewId !== id) return corrupt()
    const changes = (
      db
        .prepare(
          'SELECT substr(body,1,50001) AS body FROM import_review_choices WHERE project_id=? AND review_id=? AND revision_id=? ORDER BY item_id'
        )
        .all(p, id, next) as { body: string }[]
    ).map((r) => decode(r, isReviewChoice, 50000))
    total += changes.length
    if (total > 100000 || changes.length !== rev.changes || requestDigest(changes) !== rev.digest)
      return corrupt()
    for (const c of changes) if (!choices.has(c.itemId)) choices.set(c.itemId, c)
    partial ||= rev.partial
    next = rev.parentId
  }
  return { revisionId, partial, choices }
}
type Group = { id: string; kind: ReviewKind; records: GraphRecord[] }
function groups(records: GraphRecord[]): Group[] {
  const map = new Map<string, Group>()
  for (const r of records) {
    const kind: ReviewKind =
        r.kind === 'conversation'
          ? 'chat'
          : ['message', 'source', 'note'].includes(r.kind)
            ? (r.kind as ReviewKind)
            : 'retained',
      id = graphId(['import-review-item-v1', kind, r.identityId]),
      g = map.get(id) ?? { id, kind, records: [] }
    g.records.push(r)
    map.set(id, g)
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id))
}
function results(
  db: Database.Database,
  p: string,
  planId: string,
  proposalId: string | null
): ImportReview['results'] {
  const selected = selections(db, p, planId, proposalId).selected,
    byId = new Map(attempts(db, p, planId).map((a) => [a.run.id, a]))
  return [...selected]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([partId, attemptId]) => {
      const a = byId.get(attemptId)
      if (
        !a ||
        a.run.version !== 2 ||
        a.capture.version !== 2 ||
        a.run.validation !== 'valid' ||
        !a.run.proposal ||
        a.capture.packet.partId !== partId
      )
        return corrupt()
      return { partId, attemptId, digest: requestDigest({ capture: a.capture, run: a.run }) }
    })
}
/** A v1 result remains the original protected attempt, never a fabricated multipart attempt. */
function legacyResult(
  db: Database.Database,
  p: string,
  attemptId: string
): { capture: AnalysisCapture; run: AnalysisRun } {
  const run = decode(
      db
        .prepare('SELECT body FROM import_analysis_runs WHERE project_id=? AND id=?')
        .get(p, attemptId),
      isAnalysisRun,
      1100000
    ),
    capture = decode(
      db
        .prepare('SELECT body FROM import_analysis_captures WHERE project_id=? AND id=?')
        .get(p, run.captureId),
      isAnalysisCapture,
      1100000
    )
  if (
    capture.version !== 1 ||
    run.version !== 1 ||
    run.validation !== 'valid' ||
    !run.proposal ||
    run.captureId !== capture.id ||
    run.proposal.captureDigest !== capture.packet.captureDigest
  )
    return corrupt()
  return { capture, run }
}
function reviewResults(
  db: Database.Database,
  p: string,
  review: ImportReview
): ImportReview['results'] {
  if (review.version === 1) return results(db, p, review.planId, review.proposalId)
  const entry = legacyResult(db, p, review.legacyAttemptId)
  if (
    entry.capture.packet.batchId !== review.batchId ||
    entry.capture.packet.graphId !== review.graphId ||
    entry.capture.packet.graphDigest !== review.graphDigest
  )
    return corrupt()
  return [
    { partId: entry.capture.packet.partId, attemptId: entry.run.id, digest: requestDigest(entry) }
  ]
}
function reviewAttempts(
  db: Database.Database,
  p: string,
  review: ImportReview
): Array<{ capture: AnalysisCapture; run: AnalysisRun }> {
  return review.version === 2
    ? [legacyResult(db, p, review.legacyAttemptId)]
    : attempts(db, p, review.planId)
}
function reviewIdentity(review: ImportReview): string {
  return graphId(
    review.version === 2
      ? ['import-review-legacy-v2', review.planId, review.legacyAttemptId]
      : ['import-review-v1', review.planId, review.proposalId]
  )
}
function manualChoices(
  db: Database.Database,
  p: string,
  reviewId: string,
  revisionId?: string
): ReviewChoice[] {
  return [...reviewChoices(db, p, reviewId, revisionId).choices.values()]
    .filter((c) => c.state !== 'undecided' && !c.automatic && c.reason !== alreadyImportedReason)
    .sort((a, b) => a.itemId.localeCompare(b.itemId))
}
function current(ctx: AnalysisContext, review: ImportReview): boolean {
  const rev = currentImport(ctx, review.batchId)
  return (
    !importBatchAccepted(ctx.db, ctx.projectId, review.batchId) &&
    rev.phase === 'preparing' &&
    rev.graphId === review.graphId &&
    (review.version === 2 ||
      selections(ctx.db, ctx.projectId, review.planId).id === review.proposalId)
  )
}
function source(
  db: Database.Database,
  p: string,
  id: string,
  reason = 'Explicit existing source'
): ReviewSource | null {
  const seen = new Set<string>()
  let next: string | null = id
  while (next && !seen.has(next) && seen.size < 32) {
    seen.add(next)
    const row = db
      .prepare(
        'SELECT id,revision_id,metadata,state,replacement_id FROM sources WHERE project_id=? AND id=?'
      )
      .get(p, next) as
      | {
          id: string
          revision_id: string
          metadata: string
          state: 'active' | 'trashed' | 'merged'
          replacement_id: string | null
        }
      | undefined
    if (!row) return null
    if (row.state === 'merged') {
      next = row.replacement_id
      continue
    }
    const metadata = JSON.parse(row.metadata) as SourceMetadata
    return {
      id: row.id,
      revisionId: row.revision_id,
      metadataDigest: requestDigest(metadata),
      title: metadata.title,
      reason,
      state: row.state
    }
  }
  return null
}
function identifiedRecords(
  db: Database.Database,
  p: string,
  review: ImportReview,
  automatic = false
): string[] {
  if (review.version === 2) {
    const { capture, run } = legacyResult(db, p, review.legacyAttemptId)
    if (capture.version !== 1 || run.version !== 1 || !run.proposal) return corrupt()
    const covered = new Set(
        run.proposal.coverage.filter((c) => c.outcome === 'identified').map((c) => c.fragmentId)
      ),
      entities = new Set(run.proposal.entities.flatMap((e) => e.recordRefs))
    return capture.packet.fragments
      .filter((f) => covered.has(f.id) && (!automatic || entities.has(f.record.id)))
      .map((f) => f.record.id)
  }
  const runs = new Map(reviewAttempts(db, p, review).map((a) => [a.run.id, a.run])),
    covered = new Set<string>(),
    totals = new Map<string, { all: number; identified: number }>()
  for (const result of review.results) {
    const run = runs.get(result.attemptId)
    if (!run || run.version !== 2 || !run.proposal || run.validation !== 'valid') return corrupt()
    const entityIds = new Set(run.proposal.entities.map((e) => e.candidateId))
    for (const c of run.proposal.coverage)
      if (c.outcome === 'identified') {
        if (!automatic) covered.add(c.fragmentId)
        else
          for (const f of readPart(db, p, review.planId, result.partId).fragments)
            if (f.id === c.fragmentId && f.kind !== 'relation' && entityIds.has(f.recordId))
              covered.add(f.id)
      }
  }
  const plan = readPlan(db, p, review.planId)
  for (const id of plan.parts)
    for (const f of readPart(db, p, plan.id, id).fragments) {
      const count = totals.get(f.recordId) ?? { all: 0, identified: 0 }
      count.all++
      if (covered.has(f.id)) count.identified++
      totals.set(f.recordId, count)
    }
  return [...totals]
    .filter(([, c]) => (automatic ? c.identified > 0 : c.all === c.identified))
    .map(([id]) => id)
}
function blockedPartRecords(
  db: Database.Database,
  p: string,
  review: ImportReview,
  automatic = false
): string[] {
  const runs = new Map(reviewAttempts(db, p, review).map((a) => [a.run.id, a.run])),
    blocked = new Set<string>()
  for (const result of review.results) {
    const run = runs.get(result.attemptId)
    if (!run?.proposal) return corrupt()
    if (automatic)
      for (const issue of run.proposal.issues)
        if (issue.blocking && !['missing-metadata', 'conversion-loss'].includes(issue.code))
          for (const id of issue.recordRefs) blocked.add(id)
    if (
      run.proposal.issues.some(
        (i) =>
          i.blocking &&
          !i.recordRefs.length &&
          (!automatic || !['missing-metadata', 'conversion-loss'].includes(i.code))
      )
    )
      if (review.version === 2) {
        const entry = legacyResult(db, p, review.legacyAttemptId)
        if (entry.capture.version !== 1) return corrupt()
        for (const f of entry.capture.packet.fragments) blocked.add(f.record.id)
      } else
        for (const f of readPart(db, p, review.planId, result.partId).fragments)
          blocked.add(f.recordId)
  }
  return [...blocked]
}
function frozenSourceMetadata(
  db: Database.Database,
  p: string,
  reuse: NonNullable<ReviewChoice['reuse']>
): SourceMetadata {
  const current = db
    .prepare('SELECT revision_id,metadata FROM sources WHERE project_id=? AND id=?')
    .get(p, reuse.id) as { revision_id: string; metadata: string } | undefined
  if (!current) return corrupt()
  if (current.revision_id === reuse.revisionId)
    return JSON.parse(current.metadata) as SourceMetadata
  const previous = db
    .prepare(
      'SELECT snapshot FROM source_revisions WHERE project_id=? AND source_id=? AND revision_id=?'
    )
    .get(p, reuse.id, reuse.revisionId) as { snapshot: string } | undefined
  if (!previous || previous.snapshot.length > 400000) return corrupt()
  const snapshot = JSON.parse(previous.snapshot) as { metadata: string }
  return JSON.parse(snapshot.metadata) as SourceMetadata
}
function reuseCurrent(ctx: AnalysisContext, c: ReviewChoice): boolean {
  if (!c.reuse) return true
  const s = source(ctx.db, ctx.projectId, c.reuse.id)
  return (
    !!s &&
    s.state === 'active' &&
    s.id === c.reuse.id &&
    s.revisionId === c.reuse.revisionId &&
    s.metadataDigest === c.reuse.metadataDigest
  )
}
function reviewMetadata(m: SourceMetadata | null): SourceMetadata | null {
  return m && JSON.stringify(m).length <= 40000 ? m : null
}
function seed(g: Group, content: Map<string, ContentCandidate>): ReviewChoice {
  const r = g.records.find((r) => r.eligible && r.disposition === 'candidate') ?? g.records[0],
    c = content.get(r.id)
  return {
    itemId: g.id,
    recordId: r.id,
    state: 'undecided',
    reason: '',
    title: hasControlCharacters(c?.metadata?.title ?? r.label)
      ? ''
      : (c?.metadata?.title ?? r.label).slice(0, 500),
    metadata: reviewMetadata(c?.metadata ?? null),
    labels: c?.labels ?? [],
    reuse: null,
    acknowledged: false
  }
}
export type Prepared = {
  review: ImportReview
  content: PreparedContent
  groups: Group[]
  byId: Map<string, Group>
  records: Map<string, GraphRecord>
  recordGroups: Map<string, Group>
  members: Map<string, GraphRelation | null>
  children: Map<string, string[]>
  contentRows: Map<string, ContentCandidate>
  identified: Set<string>
  recognized: Set<string>
  automaticBlocked: Set<string>
  blockedRecords: Set<string>
  revisionId: string | null
  manifestId: string | null
  partial: boolean
  choices: Map<string, ReviewChoice>
  rows: ReviewRow[]
  counts: ReviewCounts
  undecided: number
  blocking: number
  current: boolean
}
export async function prepareImportReview(
  ctx: AnalysisContext,
  review: ImportReview,
  override?: Map<string, ReviewChoice>
): Promise<Prepared> {
  const content = await prepareImportContent(ctx, review.batchId, review.graphId),
    gs = groups(content.records),
    contentRows = new Map(content.rows.map((c) => [c.recordId, c])),
    records = new Map(content.records.map((r) => [r.id, r])),
    selection = reviewChoices(ctx.db, ctx.projectId, review.id),
    identified = new Set(identifiedRecords(ctx.db, ctx.projectId, review)),
    issues = new Map<string, string[]>()
  if (requestDigest(review.results) !== requestDigest(reviewResults(ctx.db, ctx.projectId, review)))
    return corrupt()
  const runMap = new Map(reviewAttempts(ctx.db, ctx.projectId, review).map((a) => [a.run.id, a]))
  for (const result of review.results) {
    const entry = runMap.get(result.attemptId)!
    if (!entry.run.proposal) return corrupt()
    const proposal = entry.run.proposal
    for (const i of proposal.issues) {
      const text = `${i.blocking ? 'Needs resolution' : 'Notice'}: ${i.code}: ${i.explanation}`
      for (const id of i.recordRefs) issues.set(id, [...(issues.get(id) ?? []), text].slice(0, 64))
    }
  }
  const choices = new Map(
      gs.map((g) => [
        g.id,
        override?.get(g.id) ?? selection.choices.get(g.id) ?? seed(g, contentRows)
      ])
    ),
    prepared: Prepared = {
      review,
      content,
      groups: gs,
      byId: new Map(gs.map((g) => [g.id, g])),
      records,
      recordGroups: new Map(gs.flatMap((g) => g.records.map((r) => [r.id, g] as const))),
      members: new Map(),
      children: new Map(),
      contentRows,
      identified,
      recognized: new Set(identifiedRecords(ctx.db, ctx.projectId, review, true)),
      automaticBlocked: new Set(blockedPartRecords(ctx.db, ctx.projectId, review, true)),
      blockedRecords: new Set(blockedPartRecords(ctx.db, ctx.projectId, review)),
      revisionId: selection.revisionId,
      manifestId: (
        ctx.db
          .prepare(
            'SELECT current_manifest_id AS id FROM import_review_state WHERE project_id=? AND review_id=?'
          )
          .get(ctx.projectId, review.id) as { id: string | null }
      ).id,
      partial: selection.partial,
      choices,
      rows: [],
      counts: {
        chats: 0,
        messages: 0,
        sources: 0,
        newSources: 0,
        reusedSources: 0,
        notes: 0,
        excluded: 0,
        retained: 0
      },
      undecided: 0,
      blocking: 0,
      current: current(ctx, review)
    }
  for (const relation of content.relations.filter((l) => l.kind === 'member')) {
    if (
      prepared.members.has(relation.from) &&
      prepared.members.get(relation.from)?.to !== relation.to
    )
      prepared.members.set(relation.from, null)
    else if (!prepared.members.has(relation.from)) prepared.members.set(relation.from, relation)
    if (relation.to) {
      const children = prepared.children.get(relation.to) ?? []
      children.push(relation.from)
      prepared.children.set(relation.to, children)
    }
  }
  const previouslyAccepted = acceptedIdentities(ctx.db, ctx.projectId)
  const recordGroup = prepared.recordGroups
  for (const g of gs) {
    const c = choices.get(g.id)!,
      r = g.records.find((r) => r.id === c.recordId)
    if (!r) return corrupt()
    const candidate = contentRows.get(r.id),
      eligible = g.records.some((r) => r.eligible && r.disposition === 'candidate'),
      blockers: string[] = [],
      warnings = [
        ...new Set([...r.issues, ...(candidate?.losses ?? []), ...(issues.get(r.id) ?? [])])
      ].slice(0, 62)
    if (g.records.length > 1)
      warnings.push(
        `${g.records.length} original representations share this identity. The chosen representation supplies the destination; other originals stay retained.`
      )
    if (candidate?.candidates.length)
      warnings.push(
        'Existing source matches are suggestions. Creating a source adds another record; Use existing keeps its metadata and verification unchanged.'
      )
    if (!eligible)
      warnings.push(
        'Retained only: not admitted by the selected categories, original decision, path or supported reader.'
      )
    if (eligible && c.state === 'undecided') {
      blockers.push('Choose Include or Exclude explicitly.')
      prepared.undecided++
    }
    if (c.state === 'exclude' && !c.reason.trim()) blockers.push('An exclusion needs a reason.')
    const identity = importIdentity(r),
      prior = previouslyAccepted.get(identity.key)
    if (prior)
      warnings.push(
        prior === identity.fingerprint
          ? alreadyImportedReason
          : 'This original identity was already imported with different content. Keep the accepted record and exclude this conflict; no automatic overwrite or merge is available.'
      )
    if (c.state === 'include') {
      if (prior)
        blockers.push(
          prior === identity.fingerprint
            ? 'Already imported. Exclude this original to avoid a duplicate.'
            : 'An accepted identity has different original content. Exclude this conflict before confirmation.'
        )
      if ((c.automatic ? prepared.automaticBlocked : prepared.blockedRecords).has(r.id))
        blockers.push(
          'A blocking analysis issue prevents this original from being included. Saved findings and originals remain retained.'
        )
      if (g.kind === 'retained')
        blockers.push(
          'This record has no supported destination. Explicitly exclude it from the accepted subset.'
        )
      if (!r.eligible || r.disposition !== 'candidate')
        blockers.push(
          'This original is not eligible. Changing categories or paths requires a new analyzed selection.'
        )
      if (!(c.automatic ? prepared.recognized : identified).has(r.id))
        blockers.push(
          'Not every planned fragment of this original has an identified protected result. Analyze it or explicitly exclude it.'
        )
      if (g.kind !== 'message' && !(g.kind === 'source' && c.reuse) && !c.title.trim())
        blockers.push('A destination title is required.')
      if (
        (warnings.length || r.unknownFields.length || g.records.length > 1) &&
        !c.acknowledged &&
        !c.automatic
      )
        blockers.push(
          'Acknowledge the shown original differences, unknown fields and mapping losses.'
        )
      if (g.kind === 'source') {
        if (!c.reuse && !c.metadata)
          blockers.push('A supported source mapping or an active existing source is required.')
        if (!reuseCurrent(ctx, c))
          blockers.push(
            'The selected source changed, was removed or merged. Review the current canonical source and save the choice again.'
          )
      }
      if (g.kind === 'note' && !content.notes.has(r.id))
        blockers.push('This original has no supported literal note body.')
      if (g.kind === 'message') {
        const member = prepared.members.get(r.id),
          parent = member?.to ? recordGroup.get(member.to) : undefined,
          parentChoice = parent ? choices.get(parent.id) : undefined
        if (
          !parent ||
          parent.kind !== 'chat' ||
          parentChoice?.state !== 'include' ||
          parentChoice.recordId !== member?.to
        )
          blockers.push(
            'Include the exact original chat envelope for this message, or choose a message representation that belongs to the included envelope. Dependencies are never included automatically.'
          )
        if (
          !['selected', 'array-order'].includes(r.path) ||
          r.order === null ||
          !r.role ||
          !r.texts.length
        )
          blockers.push(
            'The original message path, order, role or text is unresolved; a new analyzed selection is required.'
          )
      }
      if (g.kind === 'chat') {
        if (c.title.trim().length > 160)
          blockers.push(
            'Chat titles may contain at most 160 characters. Shorten the destination title.'
          )
        const children = (prepared.children.get(r.id) ?? [])
          .map((id) => recordGroup.get(id))
          .filter((x): x is Group => !!x)
        if (!children.some((ch) => choices.get(ch.id)?.state === 'include'))
          blockers.push(
            'Include at least one eligible message from the chosen original envelope, or exclude this chat.'
          )
      }
    }
    const row: ReviewRow = {
      id: g.id,
      kind: g.kind,
      title: c.title,
      records: g.records.length,
      eligible,
      choice: c,
      blockers
    }
    prepared.rows.push(row)
  }
  // Strong identifier duplicates are explicit review conflicts, never title-driven merges.
  const keys = new Map<string, ReviewRow[]>()
  for (const row of prepared.rows.filter(
    (r) => r.kind === 'source' && r.choice.state === 'include'
  )) {
    const m = row.choice.metadata
    if (!m) continue
    for (const key of [
      m.DOI ? `doi:${m.DOI}` : '',
      m.ISBN ? `isbn:${m.ISBN}` : '',
      m.URL ? `url:${m.URL}` : ''
    ].filter(Boolean))
      keys.set(key, [...(keys.get(key) ?? []), row])
  }
  for (const rows of keys.values())
    if (
      rows.length > 1 &&
      !(
        (rows.every((r) => r.choice.reuse) &&
          new Set(rows.map((r) => r.choice.reuse!.id)).size === 1) ||
        new Set(rows.map((r) => r.choice.automatic?.sourceItemId ?? r.id)).size === 1
      )
    )
      for (const row of rows)
        if (
          !row.blockers.includes(
            'Included sources share a strong identifier. Exclude duplicate occurrences or explicitly reuse the same existing source.'
          )
        )
          row.blockers.push(
            'Included sources share a strong identifier. Exclude duplicate occurrences or explicitly reuse the same existing source.'
          )
  for (const row of prepared.rows) {
    const link = row.choice.automatic?.sourceItemId
    if (!link) continue
    const target = choices.get(link)
    if (
      row.kind !== 'source' ||
      row.choice.state !== 'include' ||
      !target ||
      target.state !== 'include' ||
      target.reuse ||
      target.automatic?.sourceItemId ||
      !row.choice.metadata ||
      !target.metadata ||
      !compatibleSourceMetadata([row.choice.metadata, target.metadata]) ||
      !sourceKeys(row.choice.metadata).some((k) => sourceKeys(target.metadata!).includes(k))
    )
      row.blockers.push('The consolidated source target is no longer available.')
  }
  const reused = new Set<string>()
  for (const row of prepared.rows) {
    prepared.blocking += row.blockers.length ? 1 : 0
    prepared.counts.retained += row.choice.state === 'include' ? row.records - 1 : row.records
    if (row.choice.state === 'exclude') prepared.counts.excluded += row.records
    if (row.choice.state !== 'include') continue
    if (row.kind === 'chat') prepared.counts.chats++
    if (row.kind === 'message') prepared.counts.messages++
    if (row.kind === 'note') prepared.counts.notes++
    if (row.kind === 'source') {
      if (row.choice.reuse) reused.add(row.choice.reuse.id)
      else if (!row.choice.automatic?.sourceItemId) prepared.counts.newSources++
    }
  }
  prepared.counts.reusedSources = reused.size
  prepared.counts.sources = prepared.counts.newSources + reused.size
  return prepared
}
function page(prepared: Prepared): ReviewValue {
  return {
    type: 'review-state',
    review: prepared.review,
    revisionId: prepared.revisionId,
    manifestId: prepared.manifestId,
    current: prepared.current
  }
}
function projectHead(ctx: AnalysisContext): { id: string; title: string } {
  return ctx.db
    .prepare('SELECT head_commit_id AS id,title FROM projects WHERE id=?')
    .get(ctx.projectId) as { id: string; title: string }
}
function advance(ctx: AnalysisContext, id: string = randomUUID()): string {
  const now = new Date().toISOString()
  ctx.db
    .prepare('INSERT INTO commits VALUES (?,?,?,?)')
    .run(ctx.projectId, id, projectHead(ctx).id, now)
  ctx.db
    .prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?')
    .run(id, now, ctx.projectId)
  return id
}
export async function importReviewCapacity(
  ctx: AnalysisContext,
  batchId: string,
  bytes: number
): Promise<void> {
  const { db, projectId: p } = ctx,
    graph = (
      db
        .prepare(
          "SELECT coalesce(sum(json_extract(pg.body,'$.bytes')),0) AS n FROM import_graph_pages pg JOIN import_graphs g ON g.project_id=pg.project_id AND g.id=pg.graph_id WHERE g.project_id=? AND g.batch_id=?"
        )
        .get(p, batchId) as { n: number }
    ).n,
    intake = (
      db
        .prepare(
          'SELECT coalesce(sum(a.byte_size),0) AS n FROM managed_assets a JOIN import_artifacts i ON i.project_id=a.project_id AND i.asset_id=a.id WHERE i.project_id=? AND i.batch_id=?'
        )
        .get(p, batchId) as { n: number }
    ).n,
    database =
      Number(db.pragma('page_count', { simple: true })) *
      Number(db.pragma('page_size', { simple: true }))
  if (
    graph + intake + analysisReservedBytes(db, p, batchId) + bytes > IMPORT_LIMITS.derivedBytes ||
    database + bytes * 2 > LIMITS.database
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  await requireSpace(ctx.workspace, bytes * 2)
}
function commandBody(input: ReviewRequest): string {
  const { projectId: _, workspaceId: __, ...body } = input
  void _
  void __
  return JSON.stringify(body)
}
function writeRevision(
  ctx: AnalysisContext,
  p: Prepared,
  input: Extract<
    ReviewRequest,
    {
      action:
        'review-save' | 'review-chat' | 'review-partial' | 'review-automatic' | 'review-inherit'
    }
  >,
  changes: ReviewChoice[]
): void {
  const { db, projectId: id } = ctx,
    revision: ReviewRevision = {
      version: input.action === 'review-inherit' ? 3 : input.action === 'review-automatic' ? 2 : 1,
      id: input.operationId,
      reviewId: p.review.id,
      parentId: p.revisionId,
      changes: changes.length,
      digest: requestDigest(changes),
      partial:
        input.action === 'review-partial' ||
        (['review-automatic', 'review-inherit'].includes(input.action) &&
          changes.some((c) => c.state === 'exclude'))
    }
  if (
    !current(ctx, p.review) ||
    reviewChoices(db, id, p.review.id).revisionId !== input.expectedRevision
  )
    throw new ProjectError('STALE_REVISION')
  if (
    (
      db
        .prepare(
          'SELECT count(*) AS n FROM import_review_revisions WHERE project_id=? AND review_id=?'
        )
        .get(id, p.review.id) as { n: number }
    ).n >= 1024
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  if (
    (
      db
        .prepare(
          'SELECT count(*) AS n FROM import_review_choices WHERE project_id=? AND review_id=?'
        )
        .get(id, p.review.id) as { n: number }
    ).n +
      changes.length >
    100000
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  db.prepare('INSERT INTO import_review_revisions VALUES (?,?,?,?,?,?)').run(
    id,
    revision.id,
    p.review.id,
    revision.parentId,
    commandBody(input),
    JSON.stringify(revision)
  )
  for (const c of changes)
    db.prepare('INSERT INTO import_review_choices VALUES (?,?,?,?,?)').run(
      id,
      p.review.id,
      revision.id,
      c.itemId,
      JSON.stringify(c)
    )
  db.prepare(
    'UPDATE import_review_state SET current_revision_id=?,current_manifest_id=NULL WHERE project_id=? AND review_id=?'
  ).run(revision.id, id, p.review.id)
  advance(ctx)
}
function manifestEntries(p: Prepared): ConfirmationEntry[] {
  const ids = new Map(
      p.groups
        .filter((g) => p.choices.get(g.id)!.state === 'include')
        .map((g) => [g.id, p.choices.get(g.id)!.reuse?.id ?? randomUUID()])
    ),
    groupByRecord = new Map(p.groups.flatMap((g) => g.records.map((r) => [r.id, g.id] as const)))
  const entries = p.groups.map((g) => {
    const c = p.choices.get(g.id)!,
      r = p.records.get(c.recordId)!,
      include = c.state === 'include',
      member = p.members.get(r.id)
    return {
      version: c.automatic ? 2 : 1,
      itemId: g.id,
      kind: g.kind,
      title: g.kind === 'source' ? (c.metadata?.title ?? c.title) : c.title.trim(),
      records: g.records.length,
      recordsDigest: requestDigest(
        g.records
          .map((r) => ({ id: r.id, digest: requestDigest(r) }))
          .sort((a, b) => a.id.localeCompare(b.id))
      ),
      choice: c,
      action: include
        ? c.reuse
          ? 'reuse'
          : c.automatic?.sourceItemId
            ? 'link'
            : 'create'
        : 'exclude',
      destinationId: include ? ids.get(g.id)! : null,
      revisionId: include ? (c.reuse?.revisionId ?? randomUUID()) : null,
      originId: include ? randomUUID() : null,
      parentDestinationId:
        include && g.kind === 'message' && member?.to
          ? (ids.get(groupByRecord.get(member.to)!) ?? null)
          : null,
      bodyDigest:
        include && g.kind === 'note'
          ? requestDigest(p.content.notes.get(r.id)!)
          : include && g.kind === 'message'
            ? requestDigest(r.texts)
            : null,
      labels: []
    } satisfies ConfirmationEntry
  })
  const byId = new Map(entries.map((e) => [e.itemId, e]))
  for (const e of entries)
    if (e.action === 'link') {
      const target = byId.get(e.choice.automatic!.sourceItemId!)
      if (!target || target.action !== 'create' || target.kind !== 'source') return corrupt()
      e.destinationId = target.destinationId
      e.revisionId = target.revisionId
      e.title = target.title
    }
  return entries
}
export function manifestCurrent(
  ctx: AnalysisContext,
  manifest: ConfirmationManifest,
  p: Prepared,
  entries: ConfirmationEntry[]
): boolean {
  if (
    !p.current ||
    p.revisionId !== manifest.revisionId ||
    projectHead(ctx).id !== manifest.expectedHead
  )
    return false
  if (entries.some((e) => e.action === 'reuse' && !reuseCurrent(ctx, e.choice))) return false
  for (const e of entries)
    for (const l of e.labels)
      if (l.action === 'reuse') {
        const row = ctx.db
          .prepare(
            'SELECT revision_id,state,kind,name FROM note_labels WHERE project_id=? AND id=?'
          )
          .get(ctx.projectId, l.id) as
          { revision_id: string; state: string; kind: string; name: string } | undefined
        if (
          !row ||
          row.state !== 'active' ||
          row.revision_id !== l.revisionId ||
          row.kind !== l.kind ||
          row.name !== l.name
        )
          return false
      }
  return true
}
export function storedManifest(
  ctx: AnalysisContext,
  id: string
): { manifest: ConfirmationManifest; entries: ConfirmationEntry[] } {
  const manifest = decode(
      ctx.db
        .prepare(
          'SELECT substr(body,1,256001) AS body FROM import_confirmation_manifests WHERE project_id=? AND id=?'
        )
        .get(ctx.projectId, id),
      isConfirmationManifest
    ),
    entries = (
      ctx.db
        .prepare(
          'SELECT item_id,substr(body,1,60001) AS body FROM import_confirmation_entries WHERE project_id=? AND manifest_id=? ORDER BY item_id'
        )
        .all(ctx.projectId, id) as { item_id: string; body: string }[]
    ).map((r) => {
      const entry = decode(r, isConfirmationEntry, 60000)
      if (entry.itemId !== r.item_id) return corrupt()
      return entry
    })
  if (entries.length > 50000 || requestDigest(entries) !== manifest.entriesDigest) return corrupt()
  return { manifest, entries }
}
async function prepareManifest(
  ctx: AnalysisContext,
  p: Prepared,
  input: Extract<ReviewRequest, { action: 'confirmation-prepare' }>,
  automatic?: { command: AutomaticReviewRequest; changes: ReviewChoice[] }
): Promise<ReviewValue> {
  const { db, projectId: id } = ctx,
    review = p.review
  const prior = db
    .prepare('SELECT id FROM import_confirmation_manifests WHERE project_id=? AND id=?')
    .get(id, input.operationId)
  if (prior) {
    const saved = storedManifest(ctx, input.operationId)
    if (
      saved.manifest.reviewId !== review.id ||
      saved.manifest.revisionId !== input.expectedRevision
    )
      throw new ProjectError('OPERATION_CONFLICT')
    return importSummary(saved, manifestCurrent(ctx, saved.manifest, p, saved.entries))
  }
  if (
    !p.current ||
    p.revisionId !== (automatic ? automatic.command.expectedRevision : input.expectedRevision)
  )
    throw new ProjectError('STALE_REVISION')
  if (
    (
      db
        .prepare(
          'SELECT count(*) AS n FROM import_confirmation_manifests WHERE project_id=? AND review_id=?'
        )
        .get(id, review.id) as { n: number }
    ).n >= 1024
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  if (
    p.blocking ||
    p.undecided ||
    (!automatic &&
      !Object.entries(p.counts).some(
        ([k, n]) => ['chats', 'sources', 'notes'].includes(k) && n > 0
      ) &&
      !p.rows.some((r) => r.choice.reason === alreadyImportedReason))
  )
    throw new ProjectError('VALIDATION')
  const entries = manifestEntries(p),
    labels = new Map<string, ConfirmationEntry['labels'][number]>()
  for (const e of entries)
    if (e.action === 'reuse') e.title = source(db, id, e.destinationId!)!.title
  for (const e of entries.filter((e) => e.kind === 'note' && e.action === 'create'))
    for (const l of e.choice.labels) {
      const normalized = l.name.trim().normalize('NFKC').toLowerCase(),
        key = `${l.kind}:${normalized}`
      let label = labels.get(key)
      if (!label) {
        const row = db
          .prepare(
            "SELECT id,revision_id,name FROM note_labels WHERE project_id=? AND kind=? AND normalized=? AND state='active'"
          )
          .get(id, l.kind, normalized) as
          { id: string; revision_id: string; name: string } | undefined
        label = {
          ...l,
          name: row?.name ?? l.name.trim(),
          id: row?.id ?? randomUUID(),
          revisionId: row?.revision_id ?? null,
          action: row ? 'reuse' : 'create'
        }
        labels.set(key, label)
      }
      if (!e.labels.some((old) => old.id === label.id)) e.labels.push(label)
    }
  const artifacts = (
      db
        .prepare(
          'SELECT id,body FROM import_files WHERE project_id=? AND batch_id=? UNION ALL SELECT id,body FROM import_artifacts WHERE project_id=? AND batch_id=? UNION ALL SELECT id,body FROM import_graph_pages WHERE project_id=? AND graph_id=?'
        )
        .all(id, review.batchId, id, review.batchId, id, review.graphId) as {
        id: string
        body: string
      }[]
    )
      .map((r) => {
        const a = JSON.parse(r.body) as { sha256: string; bytes: number }
        return { id: r.id, sha256: a.sha256, bytes: a.bytes }
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    manifest: ConfirmationManifest = {
      version: automatic || entries.some((e) => e.version === 2) ? 2 : 1,
      id: input.operationId,
      reviewId: review.id,
      revisionId: automatic?.command.operationId ?? p.revisionId!,
      planId: review.planId,
      batchId: review.batchId,
      graphId: review.graphId,
      graphDigest: review.graphDigest,
      proposalId: review.proposalId,
      resultsDigest: requestDigest(review.results),
      choicesDigest: requestDigest(entries.map((e) => e.choice)),
      entriesDigest: requestDigest(entries),
      artifacts,
      expectedHead: randomUUID(),
      receiptId: randomUUID(),
      destinationTitle: projectHead(ctx).title,
      partial:
        automatic || entries.some((e) => e.version === 2)
          ? entries.some(isMaterialOmission)
          : p.partial || p.counts.excluded > 0,
      counts: p.counts,
      createdAt: new Date().toISOString()
    }
  if (
    !isConfirmationManifest(manifest) ||
    JSON.stringify(manifest).length > 256000 ||
    entries.some((e) => !isConfirmationEntry(e) || JSON.stringify(e).length > 60000)
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  await importReviewCapacity(
    ctx,
    review.batchId,
    Buffer.byteLength(JSON.stringify(manifest)) +
      entries.reduce((n, e) => n + Buffer.byteLength(JSON.stringify(e)) + 512, 32768) +
      (automatic?.changes.reduce((n, c) => n + Buffer.byteLength(JSON.stringify(c)) + 512, 32768) ??
        0)
  )
  const head = p.content.head
  inWriteTransaction(db, () => {
    if (
      !current(ctx, review) ||
      reviewChoices(db, id, review.id).revisionId !== p.revisionId ||
      projectHead(ctx).id !== head ||
      entries.some((e) => !reuseCurrent(ctx, e.choice))
    )
      throw new ProjectError('STALE_REVISION')
    if (automatic) writeRevision(ctx, p, automatic.command, automatic.changes)
    db.prepare('INSERT INTO import_confirmation_manifests VALUES (?,?,?,?,?)').run(
      id,
      manifest.id,
      review.id,
      manifest.revisionId,
      JSON.stringify(manifest)
    )
    for (const e of entries)
      db.prepare('INSERT INTO import_confirmation_entries VALUES (?,?,?,?)').run(
        id,
        manifest.id,
        e.itemId,
        JSON.stringify(e)
      )
    db.prepare(
      'UPDATE import_review_state SET current_manifest_id=? WHERE project_id=? AND review_id=?'
    ).run(manifest.id, id, review.id)
    advance(ctx, manifest.expectedHead)
  })
  return importSummary({ manifest, entries }, true)
}

const isMaterialOmission = (entry: ConfirmationEntry): boolean =>
  entry.action === 'exclude' &&
  entry.kind !== 'retained' &&
  entry.choice.reason !== alreadyImportedReason &&
  entry.choice.reason !== outsideSelectionReason

const automaticManifestId = (operationId: string): string =>
  graphId(['import-automatic-manifest-v1', operationId])
function importSummary(
  saved: ReturnType<typeof storedManifest>,
  current: boolean,
  offset = 0
): ImportSummary {
  const { manifest, entries } = saved,
    counts = new Map<string, number>()
  for (const e of entries)
    if (e.kind === 'message' && e.action === 'create' && e.parentDestinationId)
      counts.set(e.parentDestinationId, (counts.get(e.parentDestinationId) ?? 0) + 1)
  const chats = entries.filter((e) => e.kind === 'chat' && e.action === 'create'),
    omitted = entries.filter(isMaterialOmission).length,
    conversations = chats.slice(offset, offset + 50).map((e) => ({
      id: e.destinationId!,
      title: e.title,
      messages: counts.get(e.destinationId!) ?? 0
    }))
  return {
    type: 'import-summary',
    manifest,
    current,
    outcome: entries.some((e) => e.action !== 'exclude')
      ? 'ready'
      : entries.some((e) => e.choice.reason === alreadyImportedReason) && omitted === 0
        ? 'already-present'
        : 'empty',
    omitted,
    conversations,
    offset,
    total: chats.length
  }
}
export async function importReviewCommand(
  ctx: AnalysisContext,
  input: ReviewRequest
): Promise<ReviewValue> {
  const { db, projectId: id } = ctx
  if (input.action === 'review-find') {
    const planRow = db
      .prepare(
        'SELECT id FROM import_analysis_plans WHERE project_id=? AND batch_id=? AND graph_id=?'
      )
      .get(id, input.batchId, input.graphId) as { id: string } | undefined
    let reviewId: string | null = null
    if (planRow) {
      const normal = graphId(['import-review-v1', planRow.id, selections(db, id, planRow.id).id]),
        found = db
          .prepare('SELECT id FROM import_reviews WHERE project_id=? AND id=?')
          .get(id, normal) as { id: string } | undefined,
        legacy = db
          .prepare(
            "SELECT id FROM import_reviews WHERE project_id=? AND plan_id=? AND json_extract(body,'$.version')=2 ORDER BY rowid DESC LIMIT 1"
          )
          .get(id, planRow.id) as { id: string } | undefined
      reviewId =
        found?.id ?? (selections(db, id, planRow.id).selected.size ? null : (legacy?.id ?? null))
    }
    const selector = reviewId
        ? (db
            .prepare(
              'SELECT current_manifest_id AS id FROM import_review_state WHERE project_id=? AND review_id=?'
            )
            .get(id, reviewId) as { id: string | null })
        : null,
      rows = db
        .prepare(
          "SELECT r.id,r.body FROM import_analysis_runs r JOIN import_analysis_captures c ON c.project_id=r.project_id AND c.id=r.capture_id WHERE r.project_id=? AND c.batch_id=? AND json_extract(c.body,'$.packet.graphId')=? AND json_extract(c.body,'$.version')=1 ORDER BY r.rowid DESC LIMIT 1025"
        )
        .all(id, input.batchId, input.graphId) as { id: string; body: string }[]
    if (rows.length > 1024) return corrupt()
    const usable = rows.find((r) => decode(r, isAnalysisRun, 1100000).validation === 'valid')
    return {
      type: 'review-found',
      reviewId,
      manifestId: selector?.id ?? null,
      legacyAttemptId: usable?.id ?? rows[0]?.id ?? null
    }
  }
  if (input.action === 'review-reconcile') {
    const original = input.command
    readImportReview(db, id, original.reviewId)
    const table =
      original.action === 'confirmation-prepare'
        ? 'import_confirmation_manifests'
        : 'import_review_revisions'
    if (
      !db
        .prepare(`SELECT 1 FROM ${table} WHERE project_id=? AND id=?`)
        .get(id, original.operationId)
    )
      return {
        type: 'review-unapplied',
        reviewId: original.reviewId,
        operationId: original.operationId
      }
    return importReviewCommand(ctx, original)
  }
  if (input.action === 'review-open' || input.action === 'review-legacy') {
    const plan = readPlan(db, id, input.planId),
      legacy = input.action === 'review-legacy' ? legacyResult(db, id, input.attemptId) : null,
      review: ImportReview = legacy
        ? {
            version: 2,
            legacyAttemptId: legacy.run.id,
            id: graphId(['import-review-legacy-v2', plan.id, legacy.run.id]),
            planId: plan.id,
            batchId: plan.batchId,
            graphId: plan.graphId,
            graphDigest: plan.graphDigest,
            proposalId: null,
            results: [
              {
                partId: legacy.capture.packet.partId,
                attemptId: legacy.run.id,
                digest: requestDigest(legacy)
              }
            ]
          }
        : {
            version: 1,
            id: graphId([
              'import-review-v1',
              plan.id,
              input.action === 'review-open' ? input.proposalId : null
            ]),
            planId: plan.id,
            batchId: plan.batchId,
            graphId: plan.graphId,
            graphDigest: plan.graphDigest,
            proposalId: input.action === 'review-open' ? input.proposalId : null,
            results: results(
              db,
              id,
              plan.id,
              input.action === 'review-open' ? input.proposalId : null
            )
          }
    if (
      legacy &&
      (legacy.capture.packet.batchId !== plan.batchId ||
        legacy.capture.packet.graphId !== plan.graphId ||
        legacy.capture.packet.graphDigest !== plan.graphDigest)
    )
      throw new ProjectError('DENIED')
    if (!current(ctx, review)) throw new ProjectError('STALE_REVISION')
    if (
      !db.prepare('SELECT 1 FROM import_reviews WHERE project_id=? AND id=?').get(id, review.id)
    ) {
      if (
        (
          db
            .prepare('SELECT count(*) AS n FROM import_reviews WHERE project_id=? AND plan_id=?')
            .get(id, plan.id) as { n: number }
        ).n >= 256
      )
        throw new ProjectError('LIMIT_EXCEEDED')
      await importReviewCapacity(
        ctx,
        review.batchId,
        Buffer.byteLength(JSON.stringify(review)) + 32768
      )
      inWriteTransaction(db, () => {
        if (
          legacy &&
          (legacy.capture.packet.batchId !== plan.batchId ||
            legacy.capture.packet.graphId !== plan.graphId ||
            legacy.capture.packet.graphDigest !== plan.graphDigest)
        )
          throw new ProjectError('DENIED')
        if (!current(ctx, review)) throw new ProjectError('STALE_REVISION')
        db.prepare('INSERT INTO import_reviews VALUES (?,?,?,?,?)').run(
          id,
          review.id,
          review.planId,
          review.proposalId,
          JSON.stringify(review)
        )
        db.prepare('INSERT INTO import_review_state VALUES (?,?,NULL,NULL)').run(id, review.id)
        advance(ctx)
      })
    }
    let prepared = await prepareImportReview(ctx, readImportReview(db, id, review.id))
    if (!prepared.revisionId) {
      const previous = db
        .prepare(
          'SELECT id FROM import_reviews WHERE project_id=? AND plan_id=? AND rowid<(SELECT rowid FROM import_reviews WHERE project_id=? AND id=?) ORDER BY rowid DESC LIMIT 256'
        )
        .all(id, plan.id, id, review.id) as { id: string }[]
      for (const source of previous) {
        const selection = reviewChoices(db, id, source.id),
          changes = manualChoices(db, id, source.id)
        if (!selection.revisionId || !changes.length) continue
        if (
          changes.some(
            (c) => !prepared.byId.get(c.itemId)?.records.some((r) => r.id === c.recordId)
          )
        )
          return corrupt()
        await importReviewCapacity(
          ctx,
          review.batchId,
          Buffer.byteLength(JSON.stringify(changes)) + 32768
        )
        inWriteTransaction(db, () =>
          writeRevision(
            ctx,
            prepared,
            {
              projectId: id,
              workspaceId: ctx.workspaceId,
              action: 'review-inherit',
              reviewId: review.id,
              operationId: graphId([
                'import-review-inherit-v3',
                review.id,
                source.id,
                selection.revisionId
              ]),
              expectedRevision: null,
              fromReviewId: source.id,
              fromRevisionId: selection.revisionId!
            },
            changes
          )
        )
        prepared = await prepareImportReview(ctx, review)
        break
      }
    }
    if (!prepared.revisionId) {
      const accepted = acceptedIdentities(db, id)
      const skipped = prepared.groups.flatMap((g) => {
        const c = prepared.choices.get(g.id)!,
          r = prepared.records.get(c.recordId)!,
          identity = importIdentity(r)
        return accepted.get(identity.key) === identity.fingerprint
          ? [{ ...c, state: 'exclude' as const, reason: alreadyImportedReason }]
          : []
      })
      if (skipped.length) {
        await importReviewCapacity(
          ctx,
          review.batchId,
          Buffer.byteLength(JSON.stringify(skipped)) + 32768
        )
        inWriteTransaction(db, () =>
          writeRevision(
            ctx,
            prepared,
            {
              projectId: id,
              workspaceId: ctx.workspaceId,
              action: 'review-partial',
              reviewId: review.id,
              operationId: randomUUID(),
              expectedRevision: null,
              reason: alreadyImportedReason
            },
            skipped
          )
        )
        prepared = await prepareImportReview(ctx, review)
      }
    }
    return page(prepared)
  }
  const review = readImportReview(db, id, input.reviewId)
  if (input.action === 'review-automatic') {
    const prior = db
      .prepare('SELECT request FROM import_review_revisions WHERE project_id=? AND id=?')
      .get(id, input.operationId) as { request: string } | undefined
    if (prior) {
      if (
        requestDigest(JSON.parse(prior.request)) !== requestDigest(JSON.parse(commandBody(input)))
      )
        throw new ProjectError('OPERATION_CONFLICT')
      const saved = storedManifest(ctx, automaticManifestId(input.operationId)),
        prepared = await prepareImportReview(ctx, review)
      return importSummary(saved, manifestCurrent(ctx, saved.manifest, prepared, saved.entries))
    }
    const manifestId = automaticManifestId(input.operationId)
    for (const operation of [input.operationId, manifestId])
      for (const table of [
        'import_review_revisions',
        'import_confirmation_manifests',
        'domain_operations'
      ]) {
        const key = table === 'domain_operations' ? 'operation_id' : 'id'
        if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id=? AND ${key}=?`).get(id, operation))
          throw new ProjectError('OPERATION_CONFLICT')
      }
    if (!review.results.length) throw new ProjectError('VALIDATION')
    const initial = await prepareImportReview(ctx, review)
    if (!initial.current || initial.revisionId !== input.expectedRevision)
      throw new ProjectError('STALE_REVISION')
    const choices = automaticChoices(db, id, initial)
    let prepared = await prepareImportReview(ctx, review, choices)
    // Settle unsupported dependencies without reinterpreting saved human corrections.
    for (let pass = 0; pass < 3; pass++) {
      const blocked = prepared.rows.filter(
        (r) => r.choice.automatic && r.choice.state === 'include' && r.blockers.length
      )
      if (!blocked.length) break
      for (const row of blocked)
        choices.set(row.id, {
          ...row.choice,
          state: 'exclude',
          reason: 'Required original evidence or a compatible destination was unavailable.',
          reuse: null,
          automatic: { version: 1, sourceItemId: null }
        })
      prepared = await prepareImportReview(ctx, review, choices)
    }
    if (prepared.blocking || prepared.undecided) throw new ProjectError('VALIDATION')
    const originals = new OriginalTranscriptText(ctx, review.batchId)
    for (const row of prepared.rows)
      if (row.kind === 'message' && row.choice.state === 'include')
        await originals.read(prepared.records.get(row.choice.recordId)!)
    const changes = [...choices.values()]
      .filter((c) => requestDigest(c) !== requestDigest(initial.choices.get(c.itemId)))
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
    await prepareManifest(
      ctx,
      prepared,
      {
        ...input,
        action: 'confirmation-prepare',
        operationId: manifestId,
        expectedRevision: input.operationId
      },
      { command: input, changes }
    )
    return importSummary(storedManifest(ctx, manifestId), true)
  }
  if (
    input.action === 'review-save' ||
    input.action === 'review-chat' ||
    input.action === 'review-partial' ||
    input.action === 'confirmation-prepare'
  ) {
    const other =
      input.action === 'confirmation-prepare'
        ? 'import_review_revisions'
        : 'import_confirmation_manifests'
    if (
      db.prepare(`SELECT 1 FROM ${other} WHERE project_id=? AND id=?`).get(id, input.operationId) ||
      db
        .prepare('SELECT 1 FROM domain_operations WHERE project_id=? AND operation_id=?')
        .get(id, input.operationId)
    )
      throw new ProjectError('OPERATION_CONFLICT')
  }
  // Same-operation reconciliation precedes current scope/head/selection checks.
  if (
    input.action === 'review-save' ||
    input.action === 'review-chat' ||
    input.action === 'review-partial'
  ) {
    const prior = db
      .prepare('SELECT request FROM import_review_revisions WHERE project_id=? AND id=?')
      .get(id, input.operationId) as { request: string } | undefined
    if (prior) {
      if (
        requestDigest(JSON.parse(prior.request)) !== requestDigest(JSON.parse(commandBody(input)))
      )
        throw new ProjectError('OPERATION_CONFLICT')
      return page(await prepareImportReview(ctx, review))
    }
  }
  const p = await prepareImportReview(ctx, review)
  if (input.action === 'import-summary') {
    const saved = storedManifest(ctx, input.manifestId)
    if (saved.manifest.reviewId !== review.id) throw new ProjectError('DENIED')
    return importSummary(
      saved,
      manifestCurrent(ctx, saved.manifest, p, saved.entries),
      input.offset
    )
  }
  // Retained manual commands can reconcile an applied operation, but cannot author new choices.
  if (input.action === 'confirmation-prepare') {
    const saved = storedManifest(ctx, input.operationId)
    if (
      saved.manifest.reviewId !== review.id ||
      saved.manifest.revisionId !== input.expectedRevision
    )
      throw new ProjectError('OPERATION_CONFLICT')
    return importSummary(saved, manifestCurrent(ctx, saved.manifest, p, saved.entries))
  }
  throw new ProjectError('DENIED')
}
export function validatePortableReviews(db: Database.Database, p: string): void {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 28
  )
    return
  for (const table of [
    'import_reviews',
    'import_review_revisions',
    'import_review_choices',
    'import_review_state',
    'import_confirmation_manifests',
    'import_confirmation_entries'
  ])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p)) return corrupt()
  const rows = db
    .prepare(
      'SELECT id,plan_id,proposal_id,substr(body,1,256001) AS body FROM import_reviews WHERE project_id=? LIMIT 100001'
    )
    .all(p) as { id: string; plan_id: string; proposal_id: string | null; body: string }[]
  if (rows.length > 100000) return corrupt()
  for (const row of rows) {
    const review = decode(row, isImportReview),
      plan = readPlan(db, p, review.planId)
    if (
      (review.version === 2 &&
        (db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v < 32) ||
      review.id !== row.id ||
      review.id !== reviewIdentity(review) ||
      review.planId !== row.plan_id ||
      review.proposalId !== row.proposal_id ||
      review.batchId !== plan.batchId ||
      review.graphId !== plan.graphId ||
      review.graphDigest !== plan.graphDigest ||
      requestDigest(review.results) !== requestDigest(reviewResults(db, p, review))
    )
      return corrupt()
    reviewChoices(db, p, review.id)
    const selector = db
      .prepare(
        'SELECT current_manifest_id AS id FROM import_review_state WHERE project_id=? AND review_id=?'
      )
      .get(p, review.id) as { id: string | null }
    if (selector.id) {
      const m = storedManifest({ db, projectId: p } as AnalysisContext, selector.id).manifest
      if (m.reviewId !== review.id || m.revisionId !== reviewChoices(db, p, review.id).revisionId)
        return corrupt()
    }
    const revisions = db
      .prepare(
        'SELECT id,parent_id,request,substr(body,1,4001) AS body FROM import_review_revisions WHERE project_id=? AND review_id=? LIMIT 1025'
      )
      .all(p, review.id) as {
      id: string
      parent_id: string | null
      request: string
      body: string
    }[]
    if (revisions.length > 1024) return corrupt()
    const seen = new Set<string>()
    let next = reviewChoices(db, p, review.id).revisionId
    while (next) {
      seen.add(next)
      const r = revisions.find((r) => r.id === next)
      if (!r) return corrupt()
      next = r.parent_id
    }
    if (seen.size !== revisions.length) return corrupt()
    for (const r of revisions) {
      const rev = decode(r, isReviewRevision, 4000),
        request = JSON.parse(r.request) as Record<string, unknown>,
        routing = { projectId: p, workspaceId: p, ...request }
      if (
        !isReviewRequest(routing) ||
        ![
          'review-save',
          'review-chat',
          'review-partial',
          'review-automatic',
          'review-inherit'
        ].includes(routing.action) ||
        rev.id !== r.id ||
        rev.reviewId !== review.id ||
        rev.parentId !== r.parent_id ||
        request.operationId !== rev.id ||
        request.reviewId !== review.id ||
        request.expectedRevision !== rev.parentId ||
        (rev.version === 2) !== (request.action === 'review-automatic') ||
        (rev.version === 3) !== (request.action === 'review-inherit') ||
        (rev.version === 3 &&
          (db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v < 32) ||
        (rev.version === 1 && rev.partial !== (request.action === 'review-partial')) ||
        (rev.version === 2 &&
          (db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v < 31)
      )
        return corrupt()
      const choices = (
        db
          .prepare(
            'SELECT item_id,substr(body,1,50001) AS body FROM import_review_choices WHERE project_id=? AND review_id=? AND revision_id=? ORDER BY item_id'
          )
          .all(p, review.id, rev.id) as { item_id: string; body: string }[]
      ).map((r) => {
        const c = decode(r, isReviewChoice, 50000)
        if (c.itemId !== r.item_id) return corrupt()
        return c
      })
      if (
        choices.length !== rev.changes ||
        requestDigest(choices) !== rev.digest ||
        (request.action === 'review-save' &&
          (choices.length !== 1 ||
            requestDigest(choices[0]) !==
              requestDigest({
                ...(request.choice as ReviewChoice),
                metadata: (request.choice as ReviewChoice).metadata
                  ? normalizeMetadata((request.choice as ReviewChoice).metadata!)
                  : null
              }))) ||
        (request.action === 'review-partial' &&
          choices.some((c) => c.state !== 'exclude' || c.reason !== request.reason))
      )
        return corrupt()
      if ((rev.version === 1 || rev.version === 3) && choices.some((c) => c.automatic))
        return corrupt()
      if (routing.action === 'review-inherit') {
        const source = readImportReview(db, p, routing.fromReviewId),
          order = db
            .prepare(
              'SELECT (SELECT rowid FROM import_reviews WHERE project_id=? AND id=?) < (SELECT rowid FROM import_reviews WHERE project_id=? AND id=?) AS earlier'
            )
            .get(p, source.id, p, review.id) as { earlier: number }
        if (
          source.id === review.id ||
          source.planId !== review.planId ||
          source.graphId !== review.graphId ||
          order.earlier !== 1 ||
          rev.id !==
            graphId(['import-review-inherit-v3', review.id, source.id, routing.fromRevisionId]) ||
          rev.partial !== choices.some((c) => c.state === 'exclude') ||
          requestDigest(choices) !==
            requestDigest(manualChoices(db, p, source.id, routing.fromRevisionId))
        )
          return corrupt()
      }
      if (rev.version === 2) {
        if (
          choices.some((c) => !c.automatic) ||
          rev.partial !== choices.some((c) => c.state === 'exclude')
        )
          return corrupt()
        const saved = storedManifest(
          { db, projectId: p } as AnalysisContext,
          automaticManifestId(rev.id)
        )
        if (
          saved.manifest.version !== 2 ||
          saved.manifest.reviewId !== review.id ||
          saved.manifest.revisionId !== rev.id
        )
          return corrupt()
      }
      if (request.action === 'review-chat') {
        const requested = request.choice as ReviewChoice,
          saved = choices.find((c) => c.itemId === requested.itemId)
        if (
          !saved ||
          requested.state !== 'include' ||
          !requested.acknowledged ||
          requestDigest(saved) !== requestDigest(requested) ||
          choices.some((c) => c.state !== 'include' || !c.acknowledged)
        )
          return corrupt()
      }
    }
    const manifests = db
      .prepare(
        'SELECT id,revision_id,substr(body,1,256001) AS body FROM import_confirmation_manifests WHERE project_id=? AND review_id=? LIMIT 1025'
      )
      .all(p, review.id) as { id: string; revision_id: string; body: string }[]
    if (manifests.length > 1024) return corrupt()
    for (const row of manifests) {
      const m = decode(row, isConfirmationManifest),
        saved = storedManifest({ db, projectId: p } as AnalysisContext, m.id),
        choices = reviewChoices(db, p, review.id, m.revisionId).choices
      if (
        ((m.version === 2 || saved.entries.some((e) => e.version === 2 || e.choice.automatic)) &&
          (db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v < 31) ||
        m.id !== row.id ||
        m.revisionId !== row.revision_id ||
        m.reviewId !== review.id ||
        m.planId !== review.planId ||
        m.batchId !== review.batchId ||
        m.graphId !== review.graphId ||
        m.graphDigest !== review.graphDigest ||
        m.proposalId !== review.proposalId ||
        m.resultsDigest !== requestDigest(review.results) ||
        m.choicesDigest !== requestDigest(saved.entries.map((e) => e.choice)) ||
        !db.prepare('SELECT 1 FROM commits WHERE project_id=? AND id=?').get(p, m.expectedHead)
      )
        return corrupt()
      for (const e of saved.entries)
        if (
          (e.choice.state !== 'undecided' && !choices.has(e.itemId)) ||
          (choices.has(e.itemId) &&
            requestDigest(choices.get(e.itemId)) !== requestDigest(e.choice))
        )
          return corrupt()
      for (const e of saved.entries)
        if (e.action === 'reuse') {
          if (!e.choice.reuse) return corrupt()
          const metadata = frozenSourceMetadata(db, p, e.choice.reuse)
          if (
            requestDigest(metadata) !== e.choice.reuse.metadataDigest ||
            e.title !== metadata.title
          )
            return corrupt()
        }
      for (const a of m.artifacts) {
        const row = db
          .prepare(
            'SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=? UNION ALL SELECT body FROM import_artifacts WHERE project_id=? AND batch_id=? AND id=? UNION ALL SELECT body FROM import_graph_pages WHERE project_id=? AND graph_id=? AND id=?'
          )
          .all(p, m.batchId, a.id, p, m.batchId, a.id, p, m.graphId, a.id) as { body: string }[]
        if (row.length !== 1) return corrupt()
        const actual = JSON.parse(row[0].body) as { sha256: string; bytes: number }
        if (a.sha256 !== actual.sha256 || a.bytes !== actual.bytes) return corrupt()
      }
    }
  }
}

export function reviewGraphEvidence(
  db: Database.Database,
  p: string,
  graph: string
): Array<{
  review: ImportReview
  choices: ReviewChoice[]
  identified: string[]
  recognized: string[]
  automaticBlocked: string[]
  blockedRecords: string[]
  manifests: Array<{ manifest: ConfirmationManifest; entries: ConfirmationEntry[] }>
}> {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 28
  )
    return []
  return (
    db
      .prepare(
        "SELECT id FROM import_reviews WHERE project_id=? AND json_extract(body,'$.graphId')=?"
      )
      .all(p, graph) as { id: string }[]
  ).map(({ id }) => ({
    review: readImportReview(db, p, id),
    identified: identifiedRecords(db, p, readImportReview(db, p, id)),
    recognized: identifiedRecords(db, p, readImportReview(db, p, id), true),
    automaticBlocked: blockedPartRecords(db, p, readImportReview(db, p, id), true),
    blockedRecords: blockedPartRecords(db, p, readImportReview(db, p, id)),
    choices: (
      db
        .prepare(
          'SELECT substr(body,1,50001) AS body FROM import_review_choices WHERE project_id=? AND review_id=?'
        )
        .all(p, id) as { body: string }[]
    ).map((r) => decode(r, isReviewChoice, 50000)),
    manifests: (
      db
        .prepare('SELECT id FROM import_confirmation_manifests WHERE project_id=? AND review_id=?')
        .all(p, id) as { id: string }[]
    ).map(({ id }) => storedManifest({ db, projectId: p } as AnalysisContext, id))
  }))
}
export function validateReviewGraph(
  records: GraphRecord[],
  relations: GraphRelation[],
  evidence: ReturnType<typeof reviewGraphEvidence>
): void {
  const gs = groups(records),
    byId = new Map(gs.map((g) => [g.id, g])),
    members = new Map<string, GraphRelation | null>()
  for (const l of relations.filter((l) => l.kind === 'member')) {
    if (members.has(l.from) && members.get(l.from)?.to !== l.to) members.set(l.from, null)
    else if (!members.has(l.from)) members.set(l.from, l)
  }
  for (const e of evidence) {
    const identified = new Set(e.identified),
      recognized = new Set(e.recognized),
      automaticBlocked = new Set(e.automaticBlocked),
      blocked = new Set(e.blockedRecords)
    for (const c of e.choices)
      if (!byId.get(c.itemId)?.records.some((r) => r.id === c.recordId)) return corrupt()
    for (const { manifest: m, entries } of e.manifests) {
      if (entries.length !== gs.length) return corrupt()
      const entryById = new Map(entries.map((e) => [e.itemId, e])),
        destinations = new Map(entries.map((e) => [e.choice.recordId, e])),
        counts: ReviewCounts = {
          chats: 0,
          messages: 0,
          sources: 0,
          newSources: 0,
          reusedSources: 0,
          notes: 0,
          excluded: 0,
          retained: 0
        },
        reused = new Set<string>(),
        ids = new Set<string>()
      for (const entry of entries) {
        const g = byId.get(entry.itemId),
          r = g?.records.find((r) => r.id === entry.choice.recordId)
        if (
          !g ||
          !r ||
          entry.kind !== g.kind ||
          entry.records !== g.records.length ||
          entry.recordsDigest !==
            requestDigest(
              g.records
                .map((r) => ({ id: r.id, digest: requestDigest(r) }))
                .sort((a, b) => a.id.localeCompare(b.id))
            )
        )
          return corrupt()
        if (entry.version > m.version || (entry.choice.automatic && m.version !== 2))
          return corrupt()
        const eligible = g.records.some((r) => r.eligible && r.disposition === 'candidate')
        counts.retained +=
          entry.choice.state === 'include' ? g.records.length - 1 : g.records.length
        if (entry.choice.state === 'exclude') counts.excluded += g.records.length
        if (entry.action === 'exclude') {
          if (
            (eligible && entry.choice.state !== 'exclude') ||
            entry.destinationId !== null ||
            entry.revisionId !== null ||
            entry.originId !== null ||
            entry.parentDestinationId !== null ||
            entry.bodyDigest !== null ||
            entry.labels.length
          )
            return corrupt()
          continue
        }
        if (
          entry.choice.state !== 'include' ||
          !r.eligible ||
          r.disposition !== 'candidate' ||
          entry.kind === 'retained' ||
          !(entry.choice.automatic ? recognized : identified).has(r.id) ||
          (entry.choice.automatic ? automaticBlocked : blocked).has(r.id) ||
          !entry.destinationId ||
          !entry.revisionId ||
          !entry.originId ||
          (entry.action === 'reuse') !== !!entry.choice.reuse ||
          (entry.action === 'reuse' &&
            (entry.kind !== 'source' ||
              entry.destinationId !== entry.choice.reuse?.id ||
              entry.revisionId !== entry.choice.reuse.revisionId))
        )
          return corrupt()
        if (entry.action === 'link') {
          const target = entryById.get(entry.choice.automatic!.sourceItemId!)
          if (
            entry.kind !== 'source' ||
            !target ||
            target.kind !== 'source' ||
            target.action !== 'create' ||
            target.destinationId !== entry.destinationId ||
            target.revisionId !== entry.revisionId ||
            target.title !== entry.title ||
            !entry.choice.metadata ||
            !target.choice.metadata ||
            !compatibleSourceMetadata([entry.choice.metadata, target.choice.metadata]) ||
            !sourceKeys(entry.choice.metadata).some((k) =>
              sourceKeys(target.choice.metadata!).includes(k)
            )
          )
            return corrupt()
        }
        if (entry.action === 'create') {
          if (ids.has(entry.destinationId)) return corrupt()
          ids.add(entry.destinationId)
        }
        if (entry.kind === 'chat') counts.chats++
        if (entry.kind === 'message') {
          counts.messages++
          const member = members.get(r.id),
            parent = member?.to ? destinations.get(member.to) : undefined
          if (
            !parent ||
            parent.kind !== 'chat' ||
            parent.action !== 'create' ||
            entry.parentDestinationId !== parent.destinationId ||
            entry.bodyDigest !== requestDigest(r.texts) ||
            !['selected', 'array-order'].includes(r.path)
          )
            return corrupt()
        } else if (entry.parentDestinationId !== null) return corrupt()
        if (entry.kind === 'note') {
          counts.notes++
          if (!entry.bodyDigest) return corrupt()
        }
        if (entry.kind === 'source') {
          if (
            entry.action === 'create' &&
            (!entry.choice.metadata ||
              entry.title !== entry.choice.metadata.title ||
              requestDigest(normalizeMetadata(entry.choice.metadata)) !==
                requestDigest(entry.choice.metadata))
          )
            return corrupt()
          if (entry.action === 'reuse') reused.add(entry.destinationId)
          else if (entry.action === 'create') counts.newSources++
        }
      }
      counts.reusedSources = reused.size
      counts.sources = counts.newSources + reused.size
      const parents = new Set(
        entries
          .filter((e) => e.kind === 'message' && e.action === 'create')
          .map((e) => e.parentDestinationId)
      )
      if (
        entries.some(
          (e) => e.kind === 'chat' && e.action === 'create' && !parents.has(e.destinationId)
        )
      )
        return corrupt()
      if (
        requestDigest(counts) !== requestDigest(m.counts) ||
        (m.version === 2 && m.partial !== entries.some(isMaterialOmission))
      )
        return corrupt()
    }
  }
}
