import { hasControlCharacters } from './control-characters'
import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'

export type SearchCacheInput =
  | { kind: 'preview'; scope: OpenInput; id: string }
  | { kind: 'status'; scope: OpenInput; id: string }
  | { kind: 'clear'; scope: OpenInput; id: string; reviewId: string }
export type CacheFileView = {
  name: string
  bytes: number | null
  status: 'eligible' | 'retained' | 'removed' | 'absent' | 'unknown'
  reason: string
}
export type SearchCacheView = {
  id: string
  scope: OpenInput
  reviewId: string | null
  head: string | null
  phase: 'preview' | 'complete' | 'interrupted' | 'not-started'
  path: string
  at: string
  limited: boolean
  files: CacheFileView[]
}
export function isSearchCacheInput(v: unknown): v is SearchCacheInput {
  return (
    record(v) &&
    isId(v.id) &&
    isOpenInput(v.scope) &&
    ((['preview', 'status'].includes(String(v.kind)) && exact(v, ['kind', 'scope', 'id'])) ||
      (v.kind === 'clear' && exact(v, ['kind', 'scope', 'id', 'reviewId']) && isId(v.reviewId)))
  )
}
export function isCacheFileView(v: unknown): v is CacheFileView {
  return (
    record(v) &&
    exact(v, ['name', 'bytes', 'status', 'reason']) &&
    typeof v.name === 'string' &&
    v.name.startsWith('search.sqlite') &&
    !v.name.includes('/') &&
    !v.name.includes('\\') &&
    !hasControlCharacters(v.name) &&
    v.name.length <= 255 &&
    (v.bytes === null || (Number.isSafeInteger(v.bytes) && Number(v.bytes) >= 0)) &&
    ['eligible', 'retained', 'removed', 'absent', 'unknown'].includes(String(v.status)) &&
    typeof v.reason === 'string' &&
    v.reason.length <= 500
  )
}
export function isSearchCacheView(v: unknown): v is SearchCacheView {
  return (
    record(v) &&
    exact(v, ['id', 'scope', 'reviewId', 'head', 'phase', 'path', 'at', 'limited', 'files']) &&
    isId(v.id) &&
    isOpenInput(v.scope) &&
    (v.reviewId === null || isId(v.reviewId)) &&
    (v.head === null || isId(v.head)) &&
    ['preview', 'complete', 'interrupted', 'not-started'].includes(String(v.phase)) &&
    typeof v.path === 'string' &&
    v.path.length <= 4096 &&
    typeof v.at === 'string' &&
    Number.isFinite(Date.parse(v.at)) &&
    typeof v.limited === 'boolean' &&
    Array.isArray(v.files) &&
    v.files.length <= 128 &&
    v.files.every(isCacheFileView) &&
    new Set(v.files.map((f) => f.name)).size === v.files.length
  )
}
