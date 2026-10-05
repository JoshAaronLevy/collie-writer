import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'

export type SearchKind = 'draft' | 'note' | 'source' | 'question' | 'claim' | 'page'
export type SearchState =
  'queued' | 'running' | 'partial' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export type SearchActivity = {
  state: SearchState
  jobId: string | null
  processed: number
  total: number
  indexedHead: string | null
  currentHead: string
  indexed: number
  expected: number
  pagesWithText: number
  pagesWithoutText: number
  uninspectedSources: number
  uninspected: { id: string; title: string; status: string }[]
  error: string | null
}
export type SearchHit = {
  key: string
  kind: SearchKind
  entityId: string
  title: string
  excerpt: string
  sourceId: string | null
  documentId: string | null
  noteId: string | null
  versionId: string | null
  pageIndex: number | null
  anchorId: string | null
  status: 'current' | 'stale' | 'removed' | 'older_version'
}
export type SearchView = {
  activity: SearchActivity
  hits: SearchHit[]
  hasMore: boolean
  offset: number
}
export type SearchInput = OpenInput & {
  query: string
  kind: SearchKind | 'all'
  tagId: string | null
  documentId: string | null
  sourceId: string | null
  offset: number
}
export type SearchActionInput = OpenInput & { action: 'refresh' | 'rebuild' | 'cancel' }

const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x)
const exact = (x: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(x).length === keys.length && keys.every((key) => Object.hasOwn(x, key))
const scope = (x: Record<string, unknown>): boolean => isId(x.projectId) && isId(x.workspaceId)
const nullableId = (x: unknown): boolean => x === null || isId(x)
const text = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length <= max && !/[\u0000-\u001f]/u.test(x)
const count = (x: unknown, max: number): boolean =>
  Number.isSafeInteger(x) && Number(x) >= 0 && Number(x) <= max
export function isSearchInput(x: unknown): x is SearchInput {
  return (
    object(x) &&
    exact(x, [
      'projectId',
      'workspaceId',
      'query',
      'kind',
      'tagId',
      'documentId',
      'sourceId',
      'offset'
    ]) &&
    scope(x) &&
    text(x.query, 200) &&
    ['all', 'draft', 'note', 'source', 'question', 'claim', 'page'].includes(String(x.kind)) &&
    [x.tagId, x.documentId, x.sourceId].every(nullableId) &&
    count(x.offset, 10000)
  )
}
export function isSearchActionInput(x: unknown): x is SearchActionInput {
  return (
    object(x) &&
    exact(x, ['projectId', 'workspaceId', 'action']) &&
    scope(x) &&
    ['refresh', 'rebuild', 'cancel'].includes(String(x.action))
  )
}
export function isSearchView(x: unknown): x is SearchView {
  if (
    !object(x) ||
    !exact(x, ['activity', 'hits', 'hasMore', 'offset']) ||
    !object(x.activity) ||
    !Array.isArray(x.hits) ||
    x.hits.length > 50 ||
    typeof x.hasMore !== 'boolean' ||
    !count(x.offset, 10000)
  )
    return false
  if (!isSearchActivity(x.activity)) return false
  return x.hits.every(
    (h: unknown) =>
      object(h) &&
      exact(h, [
        'key',
        'kind',
        'entityId',
        'title',
        'excerpt',
        'sourceId',
        'documentId',
        'noteId',
        'versionId',
        'pageIndex',
        'anchorId',
        'status'
      ]) &&
      text(h.key, 150) &&
      ['draft', 'note', 'source', 'question', 'claim', 'page'].includes(String(h.kind)) &&
      isId(h.entityId) &&
      text(h.title, 500) &&
      text(h.excerpt, 500) &&
      [h.sourceId, h.documentId, h.noteId, h.versionId, h.anchorId].every(nullableId) &&
      (h.pageIndex === null || count(h.pageIndex, 10000)) &&
      ['current', 'stale', 'removed', 'older_version'].includes(String(h.status))
  )
}
export function isSearchActivity(x: unknown): x is SearchActivity {
  return (
    object(x) &&
    exact(x, [
      'state',
      'jobId',
      'processed',
      'total',
      'indexedHead',
      'currentHead',
      'indexed',
      'expected',
      'pagesWithText',
      'pagesWithoutText',
      'uninspectedSources',
      'uninspected',
      'error'
    ]) &&
    ['queued', 'running', 'partial', 'completed', 'failed', 'cancelled', 'interrupted'].includes(
      String(x.state)
    ) &&
    nullableId(x.jobId) &&
    nullableId(x.indexedHead) &&
    isId(x.currentHead) &&
    [
      x.processed,
      x.total,
      x.indexed,
      x.expected,
      x.pagesWithText,
      x.pagesWithoutText,
      x.uninspectedSources
    ].every((v) => count(v, 10000000)) &&
    Array.isArray(x.uninspected) &&
    x.uninspected.length <= 100 &&
    x.uninspected.every(
      (item: unknown) =>
        object(item) &&
        exact(item, ['id', 'title', 'status']) &&
        isId(item.id) &&
        text(item.title, 500) &&
        text(item.status, 40)
    ) &&
    (x.error === null || text(x.error, 500))
  )
}
