import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'
import { importHash, importTime } from './project-import'
import { isSourceMetadata, type SourceMetadata } from './sources'
import { isGraphRecord, type GraphRecord } from './import-graph'
import { hasControlCharacters } from './control-characters'

export type ReviewKind = 'chat' | 'message' | 'source' | 'note' | 'retained'
export type ReviewTab = 'chats' | 'sources' | 'notes' | 'issues'
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
}
export type ImportReview = {
  version: 1
  id: string
  planId: string
  batchId: string
  graphId: string
  graphDigest: string
  proposalId: string | null
  results: Array<{ partId: string; attemptId: string; digest: string }>
}
export type ReviewRevision = {
  version: 1
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
  version: 1
  itemId: string
  kind: ReviewKind
  title: string
  records: number
  recordsDigest: string
  choice: ReviewChoice
  action: 'create' | 'reuse' | 'exclude'
  destinationId: string | null
  revisionId: string | null
  originId: string | null
  parentDestinationId: string | null
  bodyDigest: string | null
  labels: Array<ReviewLabel & { id: string; revisionId: string | null; action: 'create' | 'reuse' }>
}
export type ConfirmationManifest = {
  version: 1
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
export type ReviewRequest = OpenInput &
  (
    | {
        action: 'review-reconcile'
        command: OpenInput &
          (
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
    | { action: 'review-open'; planId: string; proposalId: string | null }
    | { action: 'review-page'; reviewId: string; tab: ReviewTab; offset: number }
    | { action: 'review-item'; reviewId: string; itemId: string; offset: number }
    | { action: 'review-sources'; query: string; offset: number }
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
    | { action: 'confirmation-page'; reviewId: string; manifestId: string; offset: number }
  )
export type ReviewRow = {
  id: string
  kind: ReviewKind
  title: string
  records: number
  eligible: boolean
  choice: ReviewChoice
  blockers: string[]
  warnings: string[]
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
  | { type: 'review-unapplied'; reviewId: string; operationId: string }
  | {
      type: 'review-page'
      review: ImportReview
      revisionId: string | null
      manifestId: string | null
      current: boolean
      counts: ReviewCounts
      undecided: number
      blocking: number
      partial: boolean
      tab: ReviewTab
      offset: number
      total: number
      rows: ReviewRow[]
      files: Array<{ id: string; name: string; records: number; identified: number }>
      globalIssues: string[]
    }
  | {
      type: 'review-item'
      reviewId: string
      revisionId: string | null
      row: ReviewRow
      total: number
      offset: number
      variants: Array<{
        record: GraphRecord
        identified: boolean
        suggestedTitles: string[]
        metadata: SourceMetadata | null
        labels: ReviewLabel[]
        authorship: string
        decision: string | null
        grade: string | null
        originatingRecordId: string | null
        losses: string[]
        candidates: ReviewSource[]
      }>
      readyMessages: number
      parents: Array<{ id: string; title: string }>
    }
  | { type: 'review-sources'; rows: ReviewSource[]; offset: number; more: boolean }
  | {
      type: 'confirmation-page'
      manifest: ConfirmationManifest
      current: boolean
      entries: ConfirmationEntry[]
      offset: number
      total: number
    }

const nullableId = (v: unknown): boolean => v === null || isId(v)
const uint = (v: unknown, max = 100000): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const text = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max
const plain = (v: unknown, max = 500): v is string => text(v, max) && !hasControlCharacters(v)
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 64 && v.every((x) => text(x))
const kind = (v: unknown): boolean =>
  ['chat', 'message', 'source', 'note', 'retained'].includes(String(v))
const tab = (v: unknown): boolean => ['chats', 'sources', 'notes', 'issues'].includes(String(v))
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
      'acknowledged'
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
      'results'
    ]) &&
    v.version === 1 &&
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
    v.version === 1 &&
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
    v.version === 1 &&
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
    v.version === 1 &&
    isId(v.itemId) &&
    kind(v.kind) &&
    text(v.title, 2000) &&
    uint(v.records, 50000) &&
    importHash(v.recordsDigest) &&
    isReviewChoice(v.choice) &&
    v.itemId === v.choice.itemId &&
    ['create', 'reuse', 'exclude'].includes(String(v.action)) &&
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
        ['review-save', 'review-chat', 'review-partial', 'confirmation-prepare'].includes(
          String(v.command.action)
        ) &&
        isReviewRequest(v.command) &&
        v.command.projectId === v.projectId &&
        v.command.workspaceId === v.workspaceId
      )
    case 'review-open':
      return exact(v, [...k, 'planId', 'proposalId']) && isId(v.planId) && nullableId(v.proposalId)
    case 'review-page':
      return (
        exact(v, [...k, 'reviewId', 'tab', 'offset']) &&
        isId(v.reviewId) &&
        tab(v.tab) &&
        uint(v.offset)
      )
    case 'review-item':
      return (
        exact(v, [...k, 'reviewId', 'itemId', 'offset']) &&
        isId(v.reviewId) &&
        isId(v.itemId) &&
        uint(v.offset)
      )
    case 'review-sources':
      return exact(v, [...k, 'query', 'offset']) && plain(v.query, 100) && uint(v.offset)
    case 'review-chat':
    case 'review-save':
      return (
        exact(v, [...k, 'reviewId', 'operationId', 'expectedRevision', 'choice']) &&
        isId(v.reviewId) &&
        isId(v.operationId) &&
        nullableId(v.expectedRevision) &&
        isReviewChoice(v.choice)
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
    case 'confirmation-prepare':
      return (
        exact(v, [...k, 'reviewId', 'operationId', 'expectedRevision']) &&
        [v.reviewId, v.operationId, v.expectedRevision].every(isId)
      )
    case 'confirmation-page':
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
const source = (v: unknown): boolean =>
  record(v) &&
  exact(v, ['id', 'revisionId', 'metadataDigest', 'title', 'reason', 'state']) &&
  isId(v.id) &&
  isId(v.revisionId) &&
  importHash(v.metadataDigest) &&
  text(v.title, 2000) &&
  text(v.reason) &&
  ['active', 'trashed'].includes(String(v.state))
const row = (v: unknown): boolean =>
  record(v) &&
  exact(v, ['id', 'kind', 'title', 'records', 'eligible', 'choice', 'blockers', 'warnings']) &&
  isId(v.id) &&
  kind(v.kind) &&
  text(v.title, 500) &&
  uint(v.records, 50000) &&
  typeof v.eligible === 'boolean' &&
  isReviewChoice(v.choice) &&
  strings(v.blockers) &&
  strings(v.warnings)
export function isReviewValue(v: unknown): v is ReviewValue {
  if (!record(v) || JSON.stringify(v).length > 900000) return false
  if (v.type === 'review-unapplied')
    return exact(v, ['type', 'reviewId', 'operationId']) && isId(v.reviewId) && isId(v.operationId)
  if (v.type === 'review-page')
    return (
      exact(v, [
        'type',
        'review',
        'revisionId',
        'manifestId',
        'current',
        'counts',
        'undecided',
        'blocking',
        'partial',
        'tab',
        'offset',
        'total',
        'rows',
        'files',
        'globalIssues'
      ]) &&
      isImportReview(v.review) &&
      nullableId(v.revisionId) &&
      nullableId(v.manifestId) &&
      typeof v.current === 'boolean' &&
      counts(v.counts) &&
      uint(v.undecided, 50000) &&
      uint(v.blocking, 50000) &&
      typeof v.partial === 'boolean' &&
      tab(v.tab) &&
      uint(v.offset) &&
      uint(v.total, 50000) &&
      Array.isArray(v.rows) &&
      v.rows.length <= 10 &&
      v.rows.every(row) &&
      Array.isArray(v.files) &&
      v.files.length <= 100 &&
      v.files.every(
        (f) =>
          record(f) &&
          exact(f, ['id', 'name', 'records', 'identified']) &&
          isId(f.id) &&
          text(f.name, 255) &&
          uint(f.records, 50000) &&
          uint(f.identified, 50000)
      ) &&
      strings(v.globalIssues)
    )
  if (v.type === 'review-item')
    return (
      exact(v, [
        'type',
        'reviewId',
        'revisionId',
        'row',
        'total',
        'offset',
        'variants',
        'parents',
        'readyMessages'
      ]) &&
      isId(v.reviewId) &&
      nullableId(v.revisionId) &&
      row(v.row) &&
      uint(v.total, 50000) &&
      uint(v.offset) &&
      Array.isArray(v.variants) &&
      v.variants.length <= 10 &&
      v.variants.every(
        (a) =>
          record(a) &&
          exact(a, [
            'record',
            'identified',
            'suggestedTitles',
            'metadata',
            'labels',
            'authorship',
            'decision',
            'grade',
            'originatingRecordId',
            'losses',
            'candidates'
          ]) &&
          isGraphRecord(a.record) &&
          typeof a.identified === 'boolean' &&
          strings(a.suggestedTitles) &&
          (a.metadata === null || isSourceMetadata(a.metadata)) &&
          Array.isArray(a.labels) &&
          a.labels.length <= 100 &&
          a.labels.every(isReviewLabel) &&
          text(a.authorship, 100) &&
          (a.decision === null ||
            ['kept', 'rejected', 'cited', 'search'].includes(String(a.decision))) &&
          (a.grade === null || text(a.grade)) &&
          nullableId(a.originatingRecordId) &&
          strings(a.losses) &&
          Array.isArray(a.candidates) &&
          a.candidates.length <= 12 &&
          a.candidates.every(source)
      ) &&
      uint(v.readyMessages, 50000) &&
      Array.isArray(v.parents) &&
      v.parents.length <= 10 &&
      v.parents.every(
        (p) => record(p) && exact(p, ['id', 'title']) && isId(p.id) && text(p.title, 500)
      )
    )
  if (v.type === 'review-sources')
    return (
      exact(v, ['type', 'rows', 'offset', 'more']) &&
      Array.isArray(v.rows) &&
      v.rows.length <= 20 &&
      v.rows.every(source) &&
      uint(v.offset) &&
      typeof v.more === 'boolean'
    )
  return (
    v.type === 'confirmation-page' &&
    exact(v, ['type', 'manifest', 'current', 'entries', 'offset', 'total']) &&
    isConfirmationManifest(v.manifest) &&
    typeof v.current === 'boolean' &&
    Array.isArray(v.entries) &&
    v.entries.length <= 10 &&
    v.entries.every(isConfirmationEntry) &&
    uint(v.offset) &&
    uint(v.total, 50000)
  )
}
