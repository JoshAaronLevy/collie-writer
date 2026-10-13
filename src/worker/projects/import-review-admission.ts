import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import {
  isImportReview,
  isReviewChoice,
  isReviewRevision,
  isReviewRequest,
  isConfirmationManifest,
  isConfirmationEntry,
  type ImportReview,
  type ReviewChoice,
  type ReviewKind,
  type ReviewCounts,
  type ConfirmationManifest,
  type ConfirmationEntry
} from '../../shared/import-review'
import {
  isAnalysisCapture,
  isAnalysisRun,
  type AnalysisCapture,
  type AnalysisRun
} from '../../shared/import-analysis'
import type { GraphRecord, GraphRelation } from '../../shared/import-graph'
import type { SourceMetadata } from '../../shared/sources'
import { requestDigest } from '../storage/digest'
import { graphId } from './import-readers/graph'
import { readPlan, readPart, attempts, selections } from './import-plans'
import {
  localCandidate,
  localHasOmissions,
  validateLocalReview,
  validateLocalRecords
} from './import-normalization'
import { alreadyImportedReason } from './import-identities'
import { compatibleSourceMetadata, outsideSelectionReason, sourceKeys } from './import-automatic'
import { normalizeMetadata } from './sources'
import type { AnalysisContext } from './import-analysis-capture'

/** Stored review evidence and frozen portable admission; no review or destination writes. */
export const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
export function decode<T>(row: unknown, check: (v: unknown) => v is T, max = 256000): T {
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
export type Group = { id: string; kind: ReviewKind; records: GraphRecord[] }
export function groups(records: GraphRecord[]): Group[] {
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
export function results(
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
export function legacyResult(
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
export function reviewResults(
  db: Database.Database,
  p: string,
  review: ImportReview
): ImportReview['results'] {
  if (review.version === 3 || review.version === 4 || review.version === 5) {
    validateLocalReview(db, p, review)
    return []
  }
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
export function reviewAttempts(
  db: Database.Database,
  p: string,
  review: ImportReview
): Array<{ capture: AnalysisCapture; run: AnalysisRun }> {
  if (review.version === 3 || review.version === 4 || review.version === 5) return []
  return review.version === 2
    ? [legacyResult(db, p, review.legacyAttemptId)]
    : attempts(db, p, review.planId)
}
function reviewIdentity(review: ImportReview): string {
  if (review.version === 3 || review.version === 4 || review.version === 5)
    return graphId([
      review.version === 5
        ? 'import-review-semantic-v5'
        : review.version === 4
          ? 'import-review-mapped-v4'
          : 'import-review-local-v3',
      review.graphId,
      review.evidence
    ])
  return graphId(
    review.version === 2
      ? ['import-review-legacy-v2', review.planId, review.legacyAttemptId]
      : ['import-review-v1', review.planId, review.proposalId]
  )
}
export function manualChoices(
  db: Database.Database,
  p: string,
  reviewId: string,
  revisionId?: string
): ReviewChoice[] {
  return [...reviewChoices(db, p, reviewId, revisionId).choices.values()]
    .filter((c) => c.state !== 'undecided' && !c.automatic && c.reason !== alreadyImportedReason)
    .sort((a, b) => a.itemId.localeCompare(b.itemId))
}
export function identifiedRecords(
  db: Database.Database,
  p: string,
  review: ImportReview,
  automatic = false
): string[] {
  if (review.version === 3 || review.version === 4 || review.version === 5) return [] // Resolved from graph pages by prepareImportReview/validateReviewGraph.
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
export function blockedPartRecords(
  db: Database.Database,
  p: string,
  review: ImportReview,
  automatic = false
): string[] {
  if (review.version === 3 || review.version === 4 || review.version === 5) return []
  const runs = new Map(reviewAttempts(db, p, review).map((a) => [a.run.id, a.run])),
    blocked = new Set<string>()
  for (const result of review.results) {
    const run = runs.get(result.attemptId)
    if (!run?.proposal || run.version === 3 || run.version === 4) return corrupt()
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
export function storedManifest(
  ctx: Pick<AnalysisContext, 'db' | 'projectId'>,
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
export const isMaterialOmission = (entry: ConfirmationEntry): boolean =>
  entry.action === 'exclude' &&
  entry.kind !== 'retained' &&
  entry.choice.reason !== alreadyImportedReason &&
  entry.choice.reason !== outsideSelectionReason

export const automaticManifestId = (operationId: string): string =>
  graphId(['import-automatic-manifest-v1', operationId])
/** Local evidence is distinct from the frozen provider-result digest. */
export function reviewEvidenceDigest(review: ImportReview): string {
  return review.version === 3 || review.version === 4 || review.version === 5
    ? requestDigest({
        contract:
          review.version === 5
            ? 'import-semantic-evidence-v1'
            : review.version === 4
              ? 'import-mapped-evidence-v1'
              : 'import-local-evidence-v1',
        graphId: review.graphId,
        graphDigest: review.graphDigest,
        evidence: review.evidence
      })
    : requestDigest(review.results)
}

export function validatePortableReviews(db: Database.Database, p: string): void {
  const version = (
    db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number }
  ).v
  if (version < 28) return
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
    .all(p) as { id: string; plan_id: string | null; proposal_id: string | null; body: string }[]
  if (rows.length > 100000) return corrupt()
  for (const row of rows) {
    const review = decode(row, isImportReview),
      plan =
        review.version === 3 || review.version === 4 || review.version === 5
          ? null
          : readPlan(db, p, review.planId)
    if (review.version === 4 && version < 35) return corrupt()
    if (review.version === 5 && version < 36) return corrupt()
    if (review.version === 3 || review.version === 4 || review.version === 5)
      validateLocalReview(db, p, review)
    if (
      ((review.version === 3 || review.version === 4 || review.version === 5) && version < 33) ||
      (review.version === 2 && version < 32) ||
      review.id !== row.id ||
      review.id !== reviewIdentity(review) ||
      review.planId !== row.plan_id ||
      review.proposalId !== row.proposal_id ||
      (plan !== null &&
        (review.batchId !== plan.batchId ||
          review.graphId !== plan.graphId ||
          review.graphDigest !== plan.graphDigest)) ||
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
      const m = storedManifest({ db, projectId: p }, selector.id).manifest
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
        (rev.version === 3 && version < 32) ||
        (rev.version === 1 && rev.partial !== (request.action === 'review-partial')) ||
        (rev.version === 2 && version < 31)
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
        const saved = storedManifest({ db, projectId: p }, automaticManifestId(rev.id))
        if (
          saved.manifest.version !==
            (review.version === 3 || review.version === 4 || review.version === 5
              ? review.version
              : 2) ||
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
        saved = storedManifest({ db, projectId: p }, m.id),
        choices = reviewChoices(db, p, review.id, m.revisionId).choices
      if (
        ((m.version === 2 || saved.entries.some((e) => e.version === 2 || e.choice.automatic)) &&
          version < 31) ||
        (m.version === 3 || m.version === 4 || m.version === 5) !==
          (review.version === 3 || review.version === 4 || review.version === 5) ||
        (review.version === 4 && m.version !== 4) ||
        (review.version === 5 && m.version !== 5) ||
        m.id !== row.id ||
        m.revisionId !== row.revision_id ||
        m.reviewId !== review.id ||
        m.planId !== review.planId ||
        m.batchId !== review.batchId ||
        m.graphId !== review.graphId ||
        m.graphDigest !== review.graphDigest ||
        m.proposalId !== review.proposalId ||
        m.resultsDigest !== reviewEvidenceDigest(review) ||
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
  ).map(({ id }) => {
    const review = readImportReview(db, p, id)
    return {
      review,
      identified: identifiedRecords(db, p, review),
      recognized: identifiedRecords(db, p, review, true),
      automaticBlocked: blockedPartRecords(db, p, review, true),
      blockedRecords: blockedPartRecords(db, p, review),
      choices: (
        db
          .prepare(
            'SELECT substr(body,1,50001) AS body FROM import_review_choices WHERE project_id=? AND review_id=?'
          )
          .all(p, id) as { body: string }[]
      ).map((r) => decode(r, isReviewChoice, 50000)),
      manifests: (
        db
          .prepare(
            'SELECT id FROM import_confirmation_manifests WHERE project_id=? AND review_id=?'
          )
          .all(p, id) as { id: string }[]
      ).map(({ id }) => storedManifest({ db, projectId: p }, id))
    }
  })
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
    if (e.review.version === 3 || e.review.version === 4 || e.review.version === 5)
      validateLocalRecords(e.review, records, relations)
    const local =
        e.review.version === 3 || e.review.version === 4 || e.review.version === 5
          ? records.filter(localCandidate).map((r) => r.id)
          : null,
      identified = new Set(local ?? e.identified),
      recognized = new Set(local ?? e.recognized),
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
        if (entry.version > m.version || (entry.choice.automatic && m.version === 1))
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
        (m.version >= 2 &&
          m.partial !==
            (entries.some(isMaterialOmission) ||
              ((e.review.version === 3 || e.review.version === 4 || e.review.version === 5) &&
                localHasOmissions(e.review.evidence))))
      )
        return corrupt()
    }
  }
}
