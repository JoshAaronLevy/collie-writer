import { isId } from '../domain/editor/schema'
import { hasControlCharacters } from './control-characters'
import { exact, record, type CommitReceipt, type OpenInput } from './projects'

export const MATERIAL_KINDS = ['note', 'source', 'excerpt', 'chat'] as const
export type MaterialKind = (typeof MATERIAL_KINDS)[number]
export type MaterialTarget = { kind: MaterialKind; id: string }
export const MATERIAL_PAGE_SIZE = 20
export const MATERIAL_LINK_LIMIT = 200000
export type MaterialLink = MaterialTarget & { documentId: string }
export type ChapterMaterialInput = OpenInput & {
  documentId: string
  mode: 'linked' | 'available'
  kind: MaterialKind | 'all'
  query: string
  offset: number
}
export type ChapterMaterialChange = OpenInput & {
  action: 'set' | 'status'
  operationId: string
  expectedHead: string
  documentId: string
  target: MaterialTarget
  linked: boolean
}
export type ChapterMaterialItem = MaterialTarget & {
  title: string
  preview: string
  state: 'active' | 'archived' | 'trashed' | 'merged'
  documentIds: string[]
  sourceId: string | null
  versionId: string | null
  originDocumentId: string | null
}
export type ChapterMaterialView = {
  documentId: string
  headCommitId: string
  scopes: { id: string; title: string; kind: 'part' | 'chapter' | 'text' }[]
  items: ChapterMaterialItem[]
  total: number
  offset: number
}
export type ChapterMaterialResult = { receipt: CommitReceipt | null }

const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !hasControlCharacters(v, true)
const integer = (v: unknown, max: number): boolean =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const nullableId = (v: unknown): boolean => v === null || isId(v)
export function isMaterialTarget(v: unknown): v is MaterialTarget {
  return (
    record(v) &&
    exact(v, ['kind', 'id']) &&
    MATERIAL_KINDS.includes(v.kind as MaterialKind) &&
    isId(v.id)
  )
}
export function isMaterialLink(v: unknown): v is MaterialLink {
  return (
    record(v) &&
    exact(v, ['kind', 'id', 'documentId']) &&
    isMaterialTarget({ kind: v.kind, id: v.id }) &&
    isId(v.documentId)
  )
}
export function isChapterMaterialInput(v: unknown): v is ChapterMaterialInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'documentId', 'mode', 'kind', 'query', 'offset']) &&
    [v.projectId, v.workspaceId, v.documentId].every(isId) &&
    ['linked', 'available'].includes(String(v.mode)) &&
    (v.kind === 'all' || MATERIAL_KINDS.includes(v.kind as MaterialKind)) &&
    text(v.query, 200) &&
    integer(v.offset, 1000000)
  )
}
export function isChapterMaterialChange(v: unknown): v is ChapterMaterialChange {
  return (
    record(v) &&
    exact(v, [
      'projectId',
      'workspaceId',
      'action',
      'operationId',
      'expectedHead',
      'documentId',
      'target',
      'linked'
    ]) &&
    [v.projectId, v.workspaceId, v.operationId, v.expectedHead, v.documentId].every(isId) &&
    ['set', 'status'].includes(String(v.action)) &&
    isMaterialTarget(v.target) &&
    typeof v.linked === 'boolean'
  )
}
export function isChapterMaterialView(v: unknown): v is ChapterMaterialView {
  if (
    !record(v) ||
    !exact(v, ['documentId', 'headCommitId', 'scopes', 'items', 'total', 'offset']) ||
    !isId(v.documentId) ||
    !isId(v.headCommitId) ||
    !integer(v.total, 1000000) ||
    !integer(v.offset, 1000000) ||
    !Array.isArray(v.scopes) ||
    !v.scopes.length ||
    v.scopes.length > 8 ||
    !v.scopes.every(
      (s) =>
        record(s) &&
        exact(s, ['id', 'title', 'kind']) &&
        isId(s.id) &&
        text(s.title, 500) &&
        ['part', 'chapter', 'text'].includes(String(s.kind))
    ) ||
    v.scopes[0].id !== v.documentId ||
    new Set(v.scopes.map((s) => s.id)).size !== v.scopes.length ||
    !Array.isArray(v.items) ||
    v.items.length > MATERIAL_PAGE_SIZE
  )
    return false
  return (
    v.items.every(isChapterMaterialItem) &&
    new Set(v.items.map((item) => `${item.kind}:${item.id}`)).size === v.items.length &&
    v.items.length <= Number(v.total)
  )
}
export function isChapterMaterialResult(v: unknown): v is ChapterMaterialResult {
  return (
    record(v) &&
    exact(v, ['receipt']) &&
    (v.receipt === null ||
      (record(v.receipt) &&
        exact(v.receipt, ['projectId', 'documentId', 'revisionId', 'headCommitId']) &&
        Object.values(v.receipt).every(isId)))
  )
}

export function isChapterMaterialItem(v: unknown): v is ChapterMaterialItem {
  return (
    record(v) &&
    exact(v, [
      'kind',
      'id',
      'title',
      'preview',
      'state',
      'documentIds',
      'sourceId',
      'versionId',
      'originDocumentId'
    ]) &&
    isMaterialTarget({ kind: v.kind, id: v.id }) &&
    text(v.title, 2000) &&
    text(v.preview, 400) &&
    ['active', 'archived', 'trashed', 'merged'].includes(String(v.state)) &&
    Array.isArray(v.documentIds) &&
    v.documentIds.length <= 10000 &&
    v.documentIds.every(isId) &&
    new Set(v.documentIds).size === v.documentIds.length &&
    nullableId(v.originDocumentId) &&
    nullableId(v.sourceId) &&
    nullableId(v.versionId) &&
    (v.kind === 'excerpt'
      ? isId(v.sourceId) && isId(v.versionId)
      : v.sourceId === null && v.versionId === null) &&
    (v.kind === 'chat' || v.originDocumentId === null)
  )
}
