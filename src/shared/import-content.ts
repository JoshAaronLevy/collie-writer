import { isId } from '../domain/editor/schema'
import { exact, record, type OpenInput } from './projects'
import {
  isGraphRecord,
  isGraphRelation,
  type GraphRecord,
  type GraphRelation
} from './import-graph'
import { importHash, importTime } from './project-import'
import { isSourceMetadata, type SourceMetadata } from './sources'

/** Immutable imported evidence, deliberately distinct from live AC07 reference receipts. */
export type ImportedContentOrigin = {
  version: 1
  id: string
  graphId: string
  graphDigest: string
  batchId: string
  record: GraphRecord
  relation: GraphRelation | null
  sourceId: string | null
  messageId: string | null
  noteId: string | null
  noteRevisionId: string | null
  bodyDigest: string | null
  authorship: 'unspecified' | 'declared-human' | 'declared-ai'
  labels: Array<{ kind: 'tag' | 'category'; name: string }>
  losses: string[]
  importedAt: string
  commitId: string
}
export type ContentCandidate = {
  recordId: string
  kind: 'source' | 'note'
  title: string
  eligible: boolean
  group: string | null
  metadata: SourceMetadata | null
  candidates: Array<{ id: string; reason: string; state: 'active' | 'trashed' }>
  decision: GraphRelation['decision']
  grade: string | null
  originatingRecordId: string | null
  authorship: ImportedContentOrigin['authorship']
  labels: ImportedContentOrigin['labels']
  losses: string[]
  preview: string
  textUnits: number
  locator: GraphRecord['locator']
}
export type ImportContentRequest = OpenInput &
  (
    | { action: 'content-preview'; batchId: string; graphId: string; offset: number }
    | { action: 'content-origins'; kind: 'source' | 'note'; id: string; offset: number }
  )
export type ImportContentValue =
  | {
      type: 'content-preview'
      graphId: string
      projectHead: string
      rows: ContentCandidate[]
      counts: {
        chats: number
        sources: number
        notes: number
        occurrences: number
        retained: number
        needsReview: number
      }
      nextOffset: number | null
    }
  | { type: 'content-origins'; origins: ImportedContentOrigin[]; nextOffset: number | null }
const uint = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000
const text = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max
const losses = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 64 && v.every((x) => text(x))
const labels = (v: unknown): v is ImportedContentOrigin['labels'] =>
  Array.isArray(v) &&
  v.length <= 100 &&
  v.every(
    (x) =>
      record(x) &&
      exact(x, ['kind', 'name']) &&
      ['tag', 'category'].includes(String(x.kind)) &&
      text(x.name, 100) &&
      !!x.name.trim()
  )
const authorship = (v: unknown): boolean =>
  ['unspecified', 'declared-human', 'declared-ai'].includes(String(v))
const optionalId = (v: unknown): boolean => v === null || isId(v)
export function isImportedContentOrigin(v: unknown): v is ImportedContentOrigin {
  if (
    !record(v) ||
    !exact(v, [
      'version',
      'id',
      'graphId',
      'graphDigest',
      'batchId',
      'record',
      'relation',
      'sourceId',
      'messageId',
      'noteId',
      'noteRevisionId',
      'bodyDigest',
      'authorship',
      'labels',
      'losses',
      'importedAt',
      'commitId'
    ])
  )
    return false
  if (
    v.version !== 1 ||
    !isId(v.id) ||
    !isId(v.graphId) ||
    !importHash(v.graphDigest) ||
    !isId(v.batchId) ||
    !isGraphRecord(v.record) ||
    !optionalId(v.sourceId) ||
    !optionalId(v.messageId) ||
    !optionalId(v.noteId) ||
    !optionalId(v.noteRevisionId) ||
    !authorship(v.authorship) ||
    !labels(v.labels) ||
    !losses(v.losses) ||
    !importTime(v.importedAt) ||
    !isId(v.commitId)
  )
    return false
  if (v.record.kind === 'note')
    return (
      v.relation === null &&
      v.sourceId === null &&
      v.messageId === null &&
      isId(v.noteId) &&
      isId(v.noteRevisionId) &&
      importHash(v.bodyDigest) &&
      v.record.eligible &&
      v.record.disposition === 'candidate'
    )
  return (
    v.record.kind === 'source' &&
    v.noteId === null &&
    v.noteRevisionId === null &&
    v.bodyDigest === null &&
    v.authorship === 'unspecified' &&
    v.labels.length === 0 &&
    (v.relation === null ||
      (isGraphRelation(v.relation) &&
        v.relation.kind === 'reference' &&
        v.relation.to === v.record.id)) &&
    (v.messageId === null || v.relation !== null) &&
    (v.sourceId === null || (v.record.eligible && v.record.disposition === 'candidate'))
  )
}
export function isImportContentRequest(v: unknown): v is ImportContentRequest {
  if (!record(v) || !isId(v.projectId) || !isId(v.workspaceId) || !uint(v.offset)) return false
  const keys = ['projectId', 'workspaceId', 'action', 'offset']
  return v.action === 'content-preview'
    ? exact(v, [...keys, 'batchId', 'graphId']) && isId(v.batchId) && isId(v.graphId)
    : v.action === 'content-origins' &&
        exact(v, [...keys, 'kind', 'id']) &&
        ['source', 'note'].includes(String(v.kind)) &&
        isId(v.id)
}
export function isImportContentValue(v: unknown): v is ImportContentValue {
  if (!record(v) || (v.nextOffset !== null && !uint(v.nextOffset))) return false
  if (v.type === 'content-origins')
    return (
      exact(v, ['type', 'origins', 'nextOffset']) &&
      Array.isArray(v.origins) &&
      v.origins.length <= 10 &&
      v.origins.every(isImportedContentOrigin)
    )
  return (
    v.type === 'content-preview' &&
    exact(v, ['type', 'graphId', 'projectHead', 'rows', 'counts', 'nextOffset']) &&
    isId(v.graphId) &&
    isId(v.projectHead) &&
    record(v.counts) &&
    exact(v.counts, ['chats', 'sources', 'notes', 'occurrences', 'retained', 'needsReview']) &&
    Object.values(v.counts).every(uint) &&
    Array.isArray(v.rows) &&
    v.rows.length <= 10 &&
    v.rows.every(
      (x) =>
        record(x) &&
        exact(x, [
          'recordId',
          'kind',
          'title',
          'eligible',
          'group',
          'metadata',
          'candidates',
          'decision',
          'grade',
          'originatingRecordId',
          'authorship',
          'labels',
          'losses',
          'preview',
          'textUnits',
          'locator'
        ]) &&
        isId(x.recordId) &&
        ['source', 'note'].includes(String(x.kind)) &&
        text(x.title, 500) &&
        typeof x.eligible === 'boolean' &&
        (x.group === null || importHash(x.group)) &&
        (x.metadata === null || isSourceMetadata(x.metadata)) &&
        Array.isArray(x.candidates) &&
        x.candidates.length <= 12 &&
        x.candidates.every(
          (c) =>
            record(c) &&
            exact(c, ['id', 'reason', 'state']) &&
            isId(c.id) &&
            text(c.reason) &&
            ['active', 'trashed'].includes(String(c.state))
        ) &&
        [null, 'kept', 'rejected', 'cited', 'search'].includes(x.decision as null) &&
        (x.grade === null || text(x.grade)) &&
        optionalId(x.originatingRecordId) &&
        authorship(x.authorship) &&
        labels(x.labels) &&
        losses(x.losses) &&
        text(x.preview, 1500) &&
        uintText(x.textUnits) &&
        record(x.locator) &&
        exact(x.locator, ['fileId', 'sha256', 'pointer']) &&
        isId(x.locator.fileId) &&
        importHash(x.locator.sha256) &&
        text(x.locator.pointer, 4000)
    )
  )
}
const uintText = (v: unknown): boolean =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000
