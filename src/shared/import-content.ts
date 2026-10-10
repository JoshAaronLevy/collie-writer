import { isId } from '../domain/editor/schema'
import { exact, record, type OpenInput } from './projects'
import {
  isGraphRecord,
  isGraphRelation,
  type GraphRecord,
  type GraphRelation
} from './import-graph'
import { importHash, importTime } from './project-import'
import { type SourceMetadata } from './sources'

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
  authorship: ImportedContentOrigin['authorship']
  labels: ImportedContentOrigin['labels']
  losses: string[]
}
export type ImportContentRequest = OpenInput & {
  action: 'content-origins'
  kind: 'source' | 'note'
  id: string
  offset: number
}
export type ImportContentValue = {
  type: 'content-origins'
  origins: ImportedContentOrigin[]
  nextOffset: number | null
}
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
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'action', 'offset', 'kind', 'id']) &&
    isId(v.projectId) &&
    isId(v.workspaceId) &&
    uint(v.offset) &&
    v.action === 'content-origins' &&
    ['source', 'note'].includes(String(v.kind)) &&
    isId(v.id)
  )
}
export function isImportContentValue(v: unknown): v is ImportContentValue {
  return (
    record(v) &&
    exact(v, ['type', 'origins', 'nextOffset']) &&
    v.type === 'content-origins' &&
    Array.isArray(v.origins) &&
    v.origins.length <= 10 &&
    v.origins.every(isImportedContentOrigin) &&
    (v.nextOffset === null || uint(v.nextOffset))
  )
}
