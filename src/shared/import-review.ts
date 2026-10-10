import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'
import { importHash, importTime } from './project-import'
import { isSourceMetadata, type SourceMetadata } from './sources'
import { hasControlCharacters } from './control-characters'

export type ReviewKind = 'chat' | 'message' | 'source' | 'note' | 'retained'
export type ReviewLabel = { kind: 'tag' | 'category'; name: string }
export type ReviewChoice = {
  itemId: string
  recordId: string
  state: 'undecided' | 'include' | 'exclude'
  reason: string
  title: string
  metadata: SourceMetadata | null
  labels: ReviewLabel[]
  reuse: { id: string; revisionId: string; metadataDigest: string } | null
  acknowledged: boolean
  automatic?: { version: 1; sourceItemId: string | null }
}
export type ImportReview = ({ version: 1 } | { version: 2; legacyAttemptId: string }) & {
  id: string
  planId: string
  batchId: string
  graphId: string
  graphDigest: string
  proposalId: string | null
  results: Array<{ partId: string; attemptId: string; digest: string }>
}
export type ReviewRevision = {
  version: 1 | 2 | 3
  id: string
  reviewId: string
  parentId: string | null
  changes: number
  digest: string
  partial: boolean
}
export type ReviewCounts = {
  chats: number
  messages: number
  sources: number
  newSources: number
  reusedSources: number
  notes: number
  excluded: number
  retained: number
}
export type ConfirmationEntry = {
  version: 1 | 2
  itemId: string
  kind: ReviewKind
  title: string
  records: number
  recordsDigest: string
  choice: ReviewChoice
  action: 'create' | 'reuse' | 'link' | 'exclude'
  destinationId: string | null
  revisionId: string | null
  originId: string | null
  parentDestinationId: string | null
  bodyDigest: string | null
  labels: Array<ReviewLabel & { id: string; revisionId: string | null; action: 'create' | 'reuse' }>
}
export type ConfirmationManifest = {
  version: 1 | 2
  id: string
  reviewId: string
  revisionId: string
  planId: string
  batchId: string
  graphId: string
  graphDigest: string
  proposalId: string | null
  resultsDigest: string
  choicesDigest: string
  entriesDigest: string
  artifacts: Array<{ id: string; sha256: string; bytes: number }>
  expectedHead: string
  receiptId: string
  destinationTitle: string
  partial: boolean
  counts: ReviewCounts
  createdAt: string
}
export type AutomaticReviewRequest = OpenInput & {
  action: 'review-automatic'
  reviewId: string
  operationId: string
  expectedRevision: string | null
}
export type ImportSummary = {
  type: 'import-summary'
  manifest: ConfirmationManifest
  current: boolean
  outcome: 'ready' | 'empty' | 'already-present'
  omitted: number
  conversations: Array<{ id: string; title: string; messages: number }>
  offset: number
  total: number
}
export type ReviewRequest = OpenInput &
  (
    | AutomaticReviewRequest
    | { action: 'import-summary'; reviewId: string; manifestId: string; offset: number }
    | {
        action: 'review-reconcile'
        command: OpenInput &
          (
            | AutomaticReviewRequest
            | {
                action: 'review-save'
                reviewId: string
                operationId: string
                expectedRevision: string | null
                choice: ReviewChoice
              }
            | {
                action: 'review-chat'
                reviewId: string
                operationId: string
                expectedRevision: string | null
                choice: ReviewChoice
              }
            | {
                action: 'review-partial'
                reviewId: string
                operationId: string
                expectedRevision: string | null
                reason: string
              }
            | {
                action: 'confirmation-prepare'
                reviewId: string
                operationId: string
                expectedRevision: string
              }
          )
      }
    | {
        action: 'review-inherit'
        reviewId: string
        operationId: string
        expectedRevision: null
        fromReviewId: string
        fromRevisionId: string
      }
    | { action: 'review-open'; planId: string; proposalId: string | null }
    | { action: 'review-find'; batchId: string; graphId: string }
    | { action: 'review-legacy'; planId: string; attemptId: string }
    | {
        action: 'review-save'
        reviewId: string
        operationId: string
        expectedRevision: string | null
        choice: ReviewChoice
      }
    | {
        action: 'review-chat'
        reviewId: string
        operationId: string
        expectedRevision: string | null
        choice: ReviewChoice
      }
    | {
        action: 'review-partial'
        reviewId: string
        operationId: string
        expectedRevision: string | null
        reason: string
      }
    | {
        action: 'confirmation-prepare'
        reviewId: string
        operationId: string
        expectedRevision: string
      }
  )
export type ReviewRow = {
  id: string
  kind: ReviewKind
  title: string
  records: number
  eligible: boolean
  choice: ReviewChoice
  blockers: string[]
}
export type ReviewSource = {
  id: string
  revisionId: string
  metadataDigest: string
  title: string
  reason: string
  state: 'active' | 'trashed'
}
export type ReviewValue =
  | ImportSummary
  | { type: 'review-unapplied'; reviewId: string; operationId: string }
  | {
      type: 'review-found'
      reviewId: string | null
      manifestId: string | null
      legacyAttemptId: string | null
    }
  | {
      type: 'review-state'
      review: ImportReview
      revisionId: string | null
      manifestId: string | null
      current: boolean
    }

const nullableId = (v: unknown): boolean => v === null || isId(v)
const uint = (v: unknown, max = 100000): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const text = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max
const plain = (v: unknown, max = 500): v is string => text(v, max) && !hasControlCharacters(v)
const kind = (v: unknown): boolean =>
  ['chat', 'message', 'source', 'note', 'retained'].includes(String(v))
export const isReviewLabel = (v: unknown): v is ReviewLabel =>
  record(v) &&
  exact(v, ['kind', 'name']) &&
  ['tag', 'category'].includes(String(v.kind)) &&
  plain(v.name, 100) &&
  !!v.name.trim()
export function isReviewChoice(v: unknown): v is ReviewChoice {
  return (
    record(v) &&
    exact(v, [
      'itemId',
      'recordId',
      'state',
      'reason',
      'title',
      'metadata',
      'labels',
      'reuse',
      'acknowledged',
      ...(Object.hasOwn(v, 'automatic') ? ['automatic'] : [])
    ]) &&
    isId(v.itemId) &&
    isId(v.recordId) &&
    ['undecided', 'include', 'exclude'].includes(String(v.state)) &&
    plain(v.reason, 1000) &&
    plain(v.title) &&
    (v.metadata === null || isSourceMetadata(v.metadata)) &&
    Array.isArray(v.labels) &&
    v.labels.length <= 100 &&
    v.labels.every(isReviewLabel) &&
    (v.reuse === null ||
      (record(v.reuse) &&
        exact(v.reuse, ['id', 'revisionId', 'metadataDigest']) &&
        isId(v.reuse.id) &&
        isId(v.reuse.revisionId) &&
        importHash(v.reuse.metadataDigest))) &&
    (!Object.hasOwn(v, 'automatic') ||
      (record(v.automatic) &&
        exact(v.automatic, ['version', 'sourceItemId']) &&
        v.automatic.version === 1 &&
        nullableId(v.automatic.sourceItemId) &&
        v.automatic.sourceItemId !== v.itemId &&
        v.acknowledged === false &&
        v.state !== 'undecided')) &&
    typeof v.acknowledged === 'boolean' &&
    JSON.stringify(v).length <= 48000
  )
}
export function isImportReview(v: unknown): v is ImportReview {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'planId',
      'batchId',
      'graphId',
      'graphDigest',
      'proposalId',
      'results',
      ...(v.version === 2 ? ['legacyAttemptId'] : [])
    ]) &&
    (v.version === 1 ||
      (v.version === 2 &&
        isId(v.legacyAttemptId) &&
        v.proposalId === null &&
        Array.isArray(v.results) &&
        v.results.length === 1 &&
        v.results[0]?.attemptId === v.legacyAttemptId)) &&
    [v.id, v.planId, v.batchId, v.graphId].every(isId) &&
    importHash(v.graphDigest) &&
    nullableId(v.proposalId) &&
    Array.isArray(v.results) &&
    v.results.length <= 1024 &&
    v.results.every(
      (r) =>
        record(r) &&
        exact(r, ['partId', 'attemptId', 'digest']) &&
        isId(r.partId) &&
        isId(r.attemptId) &&
        importHash(r.digest)
    ) &&
    new Set(v.results.map((r) => r.partId)).size === v.results.length
  )
}
export function isReviewRevision(v: unknown): v is ReviewRevision {
  return (
    record(v) &&
    exact(v, ['version', 'id', 'reviewId', 'parentId', 'changes', 'digest', 'partial']) &&
    (v.version === 1 || v.version === 2 || v.version === 3) &&
    isId(v.id) &&
    isId(v.reviewId) &&
    nullableId(v.parentId) &&
    uint(v.changes, 50000) &&
    importHash(v.digest) &&
    typeof v.partial === 'boolean'
  )
}
const counts = (v: unknown): v is ReviewCounts =>
  record(v) &&
  exact(v, [
    'chats',
    'messages',
    'sources',
    'newSources',
    'reusedSources',
    'notes',
    'excluded',
    'retained'
  ]) &&
  Object.values(v).every((n) => uint(n, 50000))
export function isConfirmationManifest(v: unknown): v is ConfirmationManifest {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'reviewId',
      'revisionId',
      'planId',
      'batchId',
      'graphId',
      'graphDigest',
      'proposalId',
      'resultsDigest',
      'choicesDigest',
      'entriesDigest',
      'artifacts',
      'expectedHead',
      'receiptId',
      'destinationTitle',
      'partial',
      'counts',
      'createdAt'
    ]) &&
    (v.version === 1 || v.version === 2) &&
    [
      v.id,
      v.reviewId,
      v.revisionId,
      v.planId,
      v.batchId,
      v.graphId,
      v.expectedHead,
      v.receiptId
    ].every(isId) &&
    [v.graphDigest, v.resultsDigest, v.choicesDigest, v.entriesDigest].every(importHash) &&
    nullableId(v.proposalId) &&
    Array.isArray(v.artifacts) &&
    v.artifacts.length <= 5000 &&
    v.artifacts.every(
      (a) =>
        record(a) &&
        exact(a, ['id', 'sha256', 'bytes']) &&
        isId(a.id) &&
        importHash(a.sha256) &&
        uint(a.bytes, 256 * 1024 ** 2)
    ) &&
    text(v.destinationTitle, 1000) &&
    typeof v.partial === 'boolean' &&
    counts(v.counts) &&
    importTime(v.createdAt)
  )
}
export function isConfirmationEntry(v: unknown): v is ConfirmationEntry {
  return (
    record(v) &&
    exact(v, [
      'version',
      'itemId',
      'kind',
      'title',
      'records',
      'recordsDigest',
      'choice',
      'action',
      'destinationId',
      'revisionId',
      'originId',
      'parentDestinationId',
      'bodyDigest',
      'labels'
    ]) &&
    (v.version === 1 || v.version === 2) &&
    isId(v.itemId) &&
    kind(v.kind) &&
    text(v.title, 2000) &&
    uint(v.records, 50000) &&
    importHash(v.recordsDigest) &&
    isReviewChoice(v.choice) &&
    v.itemId === v.choice.itemId &&
    (v.version === 2
      ? ['create', 'reuse', 'link', 'exclude']
      : ['create', 'reuse', 'exclude']
    ).includes(String(v.action)) &&
    (v.version === 2 || !v.choice.automatic) &&
    (v.action === 'link') === !!v.choice.automatic?.sourceItemId &&
    (v.action !== 'link' || (v.kind === 'source' && v.choice.reuse === null)) &&
    [v.destinationId, v.revisionId, v.originId, v.parentDestinationId].every(nullableId) &&
    (v.bodyDigest === null || importHash(v.bodyDigest)) &&
    Array.isArray(v.labels) &&
    v.labels.length <= 100 &&
    v.labels.every(
      (l) =>
        record(l) &&
        exact(l, ['kind', 'name', 'id', 'revisionId', 'action']) &&
        isReviewLabel({ kind: l.kind, name: l.name }) &&
        isId(l.id) &&
        nullableId(l.revisionId) &&
        ['create', 'reuse'].includes(String(l.action))
    )
  )
}
export function isReviewRequest(v: unknown): v is ReviewRequest {
  if (!record(v) || !isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId }))
    return false
  const k = ['projectId', 'workspaceId', 'action']
  switch (v.action) {
    case 'review-reconcile':
      return (
        exact(v, [...k, 'command']) &&
        record(v.command) &&
        [
          'review-save',
          'review-chat',
          'review-partial',
          'confirmation-prepare',
          'review-automatic'
        ].includes(String(v.command.action)) &&
        isReviewRequest(v.command) &&
        v.command.projectId === v.projectId &&
        v.command.workspaceId === v.workspaceId
      )
    case 'review-inherit':
      return (
        exact(v, [
          ...k,
          'reviewId',
          'operationId',
          'expectedRevision',
          'fromReviewId',
          'fromRevisionId'
        ]) &&
        [v.reviewId, v.operationId, v.fromReviewId, v.fromRevisionId].every(isId) &&
        v.expectedRevision === null
      )
    case 'review-open':
      return exact(v, [...k, 'planId', 'proposalId']) && isId(v.planId) && nullableId(v.proposalId)
    case 'review-find':
      return exact(v, [...k, 'batchId', 'graphId']) && isId(v.batchId) && isId(v.graphId)
    case 'review-legacy':
      return exact(v, [...k, 'planId', 'attemptId']) && isId(v.planId) && isId(v.attemptId)
    case 'review-chat':
    case 'review-save':
      return (
        exact(v, [...k, 'reviewId', 'operationId', 'expectedRevision', 'choice']) &&
        isId(v.reviewId) &&
        isId(v.operationId) &&
        nullableId(v.expectedRevision) &&
        isReviewChoice(v.choice) &&
        !v.choice.automatic
      )
    case 'review-partial':
      return (
        exact(v, [...k, 'reviewId', 'operationId', 'expectedRevision', 'reason']) &&
        isId(v.reviewId) &&
        isId(v.operationId) &&
        nullableId(v.expectedRevision) &&
        plain(v.reason, 1000) &&
        !!v.reason.trim()
      )
    case 'review-automatic':
      return (
        exact(v, [...k, 'reviewId', 'operationId', 'expectedRevision']) &&
        isId(v.reviewId) &&
        isId(v.operationId) &&
        nullableId(v.expectedRevision)
      )
    case 'confirmation-prepare':
      return (
        exact(v, [...k, 'reviewId', 'operationId', 'expectedRevision']) &&
        [v.reviewId, v.operationId, v.expectedRevision].every(isId)
      )
    case 'import-summary':
      return (
        exact(v, [...k, 'reviewId', 'manifestId', 'offset']) &&
        isId(v.reviewId) &&
        isId(v.manifestId) &&
        uint(v.offset)
      )
    default:
      return false
  }
}
export function isReviewValue(v: unknown): v is ReviewValue {
  if (!record(v) || JSON.stringify(v).length > 900000) return false
  if (v.type === 'import-summary')
    return (
      exact(v, [
        'type',
        'manifest',
        'current',
        'outcome',
        'omitted',
        'conversations',
        'offset',
        'total'
      ]) &&
      isConfirmationManifest(v.manifest) &&
      typeof v.current === 'boolean' &&
      ['ready', 'empty', 'already-present'].includes(String(v.outcome)) &&
      uint(v.omitted, 50000) &&
      Array.isArray(v.conversations) &&
      v.conversations.length <= 50 &&
      v.conversations.every(
        (c) =>
          record(c) &&
          exact(c, ['id', 'title', 'messages']) &&
          isId(c.id) &&
          plain(c.title, 160) &&
          uint(c.messages, 50000)
      ) &&
      uint(v.offset) &&
      uint(v.total, 50000)
    )
  if (v.type === 'review-unapplied')
    return exact(v, ['type', 'reviewId', 'operationId']) && isId(v.reviewId) && isId(v.operationId)
  if (v.type === 'review-found')
    return (
      exact(v, ['type', 'reviewId', 'manifestId', 'legacyAttemptId']) &&
      [v.reviewId, v.manifestId, v.legacyAttemptId].every(nullableId) &&
      (!v.manifestId || !!v.reviewId)
    )
  return (
    v.type === 'review-state' &&
    exact(v, ['type', 'review', 'revisionId', 'manifestId', 'current']) &&
    isImportReview(v.review) &&
    nullableId(v.revisionId) &&
    nullableId(v.manifestId) &&
    typeof v.current === 'boolean'
  )
}

/** Older authored commands are decoded for portable history and read-only reconciliation only. */
export function isCurrentReviewRequest(v: unknown): v is ReviewRequest {
  return (
    isReviewRequest(v) &&
    ![
      'review-save',
      'review-chat',
      'review-partial',
      'confirmation-prepare',
      'review-inherit'
    ].includes(v.action)
  )
}
