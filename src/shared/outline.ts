import { hasControlCharacters } from './control-characters'
import { isId, readDocument, type DocumentPayload } from '../domain/editor/schema'

export type OutlineKind = 'part' | 'chapter' | 'text'
export type OutlineState = 'active' | 'archived' | 'trashed' | 'merged'
export type OutlineDocument = {
  id: string
  parentId: string | null
  position: number
  kind: OutlineKind
  title: string
  status: string
  synopsis: string
  revisionId: string
  state: OutlineState
  replacementId: string | null
}
export type RetainedDocument = OutlineDocument & { payload: DocumentPayload }
export type AnchorTarget = {
  id: string
  kind: 'blockId' | 'citationId' | 'footnoteId'
  documentId: string
  state: 'active' | 'archived' | 'trashed' | 'deleted'
  replacementId: string | null
  label: string
}
export type ManuscriptSnapshot = {
  version: 1
  documents: RetainedDocument[]
  anchors: AnchorTarget[]
}
export type OutlineChange =
  | { type: 'create'; kind: OutlineKind; title: string; parentId: string | null }
  | { type: 'move'; documentId: string; parentId: string | null; position: number }
  | { type: 'split'; documentId: string; afterBlockId: string; title: string }
  | { type: 'merge'; documentId: string; targetId: string }
  | { type: 'state'; documentId: string; state: 'active' | 'archived' | 'trashed' }
  | {
      type: 'details'
      documentId: string
      title: string
      status: 'draft' | 'review' | 'complete'
      synopsis: string
    }
  | { type: 'repair'; anchorId: string; targetId: string }
  | { type: 'checkpoint'; title: string }
  | { type: 'restore'; checkpointId: string }
  | { type: 'prune'; checkpointIds: string[] }
export type OutlineInput = {
  projectId: string
  workspaceId: string
  operationId: string
  expectedHead: string
  expectedRevisions: Record<string, string>
  selectedId: string
  change: OutlineChange
}
export type HistoryInput = { projectId: string; workspaceId: string; checkpointId: string | null }
export type CheckpointSummary = {
  id: string
  parentId: string | null
  headCommitId: string
  createdAt: string
  reason: 'manual' | 'automatic' | 'structural' | 'restore'
  title: string
  bytes: number
}
export type HistoryView = {
  checkpointId: string | null
  headCommitId: string
  checkpoints: CheckpointSummary[]
  anchors: AnchorTarget[]
  snapshot: ManuscriptSnapshot | null
  currentSnapshot: ManuscriptSnapshot
  totalBytes: number
  prunableBytes: number
  prunableIds: string[]
}
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, fields: string[]): boolean =>
  Object.keys(v).length === fields.length && fields.every((k) => Object.hasOwn(v, k))
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !hasControlCharacters(v, true)
const title = (v: unknown): boolean => text(v, 500) && !!v.trim()
const nullableId = (v: unknown): boolean => v === null || isId(v)
export function isOutlineDocument(v: unknown): v is OutlineDocument {
  return (
    obj(v) &&
    keys(v, [
      'id',
      'parentId',
      'position',
      'kind',
      'title',
      'status',
      'synopsis',
      'revisionId',
      'state',
      'replacementId'
    ]) &&
    isId(v.id) &&
    isId(v.revisionId) &&
    nullableId(v.parentId) &&
    nullableId(v.replacementId) &&
    Number.isSafeInteger(v.position) &&
    Number(v.position) >= 0 &&
    Number(v.position) < 10000 &&
    ['part', 'chapter', 'text'].includes(String(v.kind)) &&
    title(v.title) &&
    ['draft', 'review', 'complete'].includes(String(v.status)) &&
    text(v.synopsis, 10000) &&
    ['active', 'archived', 'trashed', 'merged'].includes(String(v.state)) &&
    (v.state === 'merged' ? isId(v.replacementId) : v.replacementId === null)
  )
}
export function isAnchorTarget(v: unknown): v is AnchorTarget {
  return (
    obj(v) &&
    keys(v, ['id', 'kind', 'documentId', 'state', 'replacementId', 'label']) &&
    isId(v.id) &&
    isId(v.documentId) &&
    nullableId(v.replacementId) &&
    ['blockId', 'citationId', 'footnoteId'].includes(String(v.kind)) &&
    ['active', 'archived', 'trashed', 'deleted'].includes(String(v.state)) &&
    text(v.label, 200)
  )
}
export function isManuscriptSnapshot(v: unknown): v is ManuscriptSnapshot {
  if (
    !obj(v) ||
    !keys(v, ['version', 'documents', 'anchors']) ||
    v.version !== 1 ||
    !Array.isArray(v.documents) ||
    !v.documents.length ||
    v.documents.length > 10000 ||
    !Array.isArray(v.anchors) ||
    v.anchors.length > 1000000 ||
    !v.anchors.every(isAnchorTarget)
  )
    return false
  return v.documents.every((d) => {
    if (!obj(d)) return false
    const { payload, ...summary } = d
    if (!isOutlineDocument(summary)) return false
    try {
      readDocument(payload)
      return true
    } catch {
      return false
    }
  })
}
export function isOutlineInput(v: unknown): v is OutlineInput {
  if (
    !obj(v) ||
    !keys(v, [
      'projectId',
      'workspaceId',
      'operationId',
      'expectedHead',
      'expectedRevisions',
      'selectedId',
      'change'
    ]) ||
    ![v.projectId, v.workspaceId, v.operationId, v.expectedHead, v.selectedId].every(isId) ||
    !obj(v.expectedRevisions) ||
    !Object.keys(v.expectedRevisions).length ||
    Object.keys(v.expectedRevisions).length > 10000 ||
    !Object.entries(v.expectedRevisions).every(([id, revision]) => isId(id) && isId(revision)) ||
    !obj(v.change)
  )
    return false
  const c = v.change
  switch (c.type) {
    case 'create':
      return (
        keys(c, ['type', 'kind', 'title', 'parentId']) &&
        ['part', 'chapter', 'text'].includes(String(c.kind)) &&
        title(c.title) &&
        nullableId(c.parentId)
      )
    case 'move':
      return (
        keys(c, ['type', 'documentId', 'parentId', 'position']) &&
        isId(c.documentId) &&
        nullableId(c.parentId) &&
        Number.isSafeInteger(c.position) &&
        Number(c.position) >= 0 &&
        Number(c.position) < 10000
      )
    case 'split':
      return (
        keys(c, ['type', 'documentId', 'afterBlockId', 'title']) &&
        isId(c.documentId) &&
        isId(c.afterBlockId) &&
        title(c.title)
      )
    case 'merge':
      return keys(c, ['type', 'documentId', 'targetId']) && isId(c.documentId) && isId(c.targetId)
    case 'state':
      return (
        keys(c, ['type', 'documentId', 'state']) &&
        isId(c.documentId) &&
        ['active', 'archived', 'trashed'].includes(String(c.state))
      )
    case 'details':
      return (
        keys(c, ['type', 'documentId', 'title', 'status', 'synopsis']) &&
        isId(c.documentId) &&
        title(c.title) &&
        ['draft', 'review', 'complete'].includes(String(c.status)) &&
        text(c.synopsis, 10000)
      )
    case 'repair':
      return keys(c, ['type', 'anchorId', 'targetId']) && isId(c.anchorId) && isId(c.targetId)
    case 'checkpoint':
      return keys(c, ['type', 'title']) && title(c.title)
    case 'restore':
      return keys(c, ['type', 'checkpointId']) && isId(c.checkpointId)
    case 'prune':
      return (
        keys(c, ['type', 'checkpointIds']) &&
        Array.isArray(c.checkpointIds) &&
        c.checkpointIds.length > 0 &&
        c.checkpointIds.length <= 100000 &&
        c.checkpointIds.every(isId) &&
        new Set(c.checkpointIds).size === c.checkpointIds.length
      )
    default:
      return false
  }
}
export function isHistoryInput(v: unknown): v is HistoryInput {
  return (
    obj(v) &&
    keys(v, ['projectId', 'workspaceId', 'checkpointId']) &&
    isId(v.projectId) &&
    isId(v.workspaceId) &&
    nullableId(v.checkpointId)
  )
}
export function isHistoryView(v: unknown): v is HistoryView {
  return (
    obj(v) &&
    keys(v, [
      'checkpointId',
      'headCommitId',
      'checkpoints',
      'anchors',
      'snapshot',
      'currentSnapshot',
      'totalBytes',
      'prunableBytes',
      'prunableIds'
    ]) &&
    nullableId(v.checkpointId) &&
    isId(v.headCommitId) &&
    Array.isArray(v.checkpoints) &&
    v.checkpoints.length <= 100000 &&
    v.checkpoints.every(
      (c) =>
        obj(c) &&
        keys(c, ['id', 'parentId', 'headCommitId', 'createdAt', 'reason', 'title', 'bytes']) &&
        isId(c.id) &&
        nullableId(c.parentId) &&
        isId(c.headCommitId) &&
        typeof c.createdAt === 'string' &&
        Number.isFinite(Date.parse(c.createdAt)) &&
        ['manual', 'automatic', 'structural', 'restore'].includes(String(c.reason)) &&
        title(c.title) &&
        Number.isSafeInteger(c.bytes) &&
        Number(c.bytes) >= 0
    ) &&
    Array.isArray(v.anchors) &&
    v.anchors.length <= 1000000 &&
    v.anchors.every(isAnchorTarget) &&
    (v.snapshot === null || isManuscriptSnapshot(v.snapshot)) &&
    isManuscriptSnapshot(v.currentSnapshot) &&
    [v.totalBytes, v.prunableBytes].every((n) => Number.isSafeInteger(n) && Number(n) >= 0) &&
    Array.isArray(v.prunableIds) &&
    v.prunableIds.length <= 100000 &&
    v.prunableIds.every(isId)
  )
}
export function effectiveState(doc: OutlineDocument, documents: OutlineDocument[]): OutlineState {
  const byId = new Map(documents.map((d) => [d.id, d]))
  let result = doc.state,
    cursor = doc,
    count = 0
  while (cursor.parentId) {
    const parent = byId.get(cursor.parentId)
    if (!parent || ++count > documents.length) return 'trashed'
    if (parent.state === 'trashed' || parent.state === 'merged') return 'trashed'
    if (parent.state === 'archived' && result === 'active') result = 'archived'
    cursor = parent
  }
  return result
}
export function canParent(kind: OutlineKind, parent: OutlineDocument | undefined): boolean {
  return (
    !parent ||
    (parent.state === 'active' &&
      ((parent.kind === 'part' && kind !== 'part') ||
        (parent.kind === 'chapter' && kind === 'text')))
  )
}
