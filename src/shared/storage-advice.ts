import { exact, record } from './projects'
import { isId } from '../domain/editor/schema'
import type { InventoryGroup } from './storage-inventory'

/** Product advice defaults; operation preflight uses its own estimates and safety margin. */
export const STORAGE_ADVICE = {
  projectCache: 500 * 1024 ** 2,
  appCache: 2 * 1024 ** 3,
  project: 5 * 1024 ** 3,
  volumeFloor: 5 * 1024 ** 3,
  volumeFraction: 0.1,
  sizeResetFraction: 0.8,
  volumeResetFactor: 1.25,
  limit: 128
} as const
export type InventoryVolume = {
  key: string
  label: string
  path: string
  available: number | null
  total: number | null
  asOf: string
}
export type StorageCondition = {
  key: string
  kind: 'cache' | 'project' | 'volume'
  title: string
  groupId: string | null
  offset: number
  volume: string | null
  bytes: number | null
  threshold: number
  signal: 'high' | 'between' | 'clear' | 'unknown'
}
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const label = (v: unknown): v is string => typeof v === 'string' && /^Volume [1-9]\d?$/.test(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
export const isStorageConditionKey = (v: unknown): v is string =>
  typeof v === 'string' &&
  (v === 'cache:app' ||
    /^volume:[a-f0-9]{64}$/.test(v) ||
    (/^(cache|project):[a-f0-9-]{36}:[a-f0-9-]{36}$/.test(v) && v.split(':').slice(1).every(isId)))
export function isInventoryVolume(v: unknown): v is InventoryVolume {
  return (
    record(v) &&
    exact(v, ['key', 'label', 'path', 'available', 'total', 'asOf']) &&
    typeof v.key === 'string' &&
    /^[a-f0-9]{64}$/.test(v.key) &&
    label(v.label) &&
    text(v.path, 4096) &&
    ((v.available === null && v.total === null) ||
      (integer(v.available) && integer(v.total) && v.available <= v.total)) &&
    typeof v.asOf === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.asOf)
  )
}
export function isStorageCondition(v: unknown): v is StorageCondition {
  return (
    record(v) &&
    exact(v, [
      'key',
      'kind',
      'title',
      'groupId',
      'offset',
      'volume',
      'bytes',
      'threshold',
      'signal'
    ]) &&
    isStorageConditionKey(v.key) &&
    ['cache', 'project', 'volume'].includes(String(v.kind)) &&
    text(v.title, 500) &&
    (v.groupId === null || isId(v.groupId)) &&
    integer(v.offset) &&
    v.offset <= 5000 &&
    v.offset % 25 === 0 &&
    (v.volume === null || label(v.volume)) &&
    (v.bytes === null || integer(v.bytes)) &&
    integer(v.threshold) &&
    ['high', 'between', 'clear', 'unknown'].includes(String(v.signal))
  )
}
/** All groups contribute, regardless of the currently displayed inventory page. */
export function storageConditions(
  groups: InventoryGroup[],
  volumes: InventoryVolume[],
  complete: boolean
): { conditions: StorageCondition[]; omitted: number } {
  const conditions: StorageCondition[] = []
  const workingUnknown = groups.some(
    (g) => g.region === 'working' && g.categories.some((c) => c.unknown > 0)
  )
  let cache = 0,
    cacheUnknown = false
  const sizeSignal = (
    bytes: number,
    threshold: number,
    known: boolean
  ): StorageCondition['signal'] =>
    bytes >= threshold
      ? 'high'
      : known && bytes < threshold * STORAGE_ADVICE.sizeResetFraction
        ? 'clear'
        : known
          ? 'between'
          : 'unknown'
  groups.forEach((g, index) => {
    if (g.region !== 'working') return
    const searches = g.categories.filter((c) => c.kind === 'search')
    const searchBytes = searches.reduce((n, c) => n + c.bytes, 0)
    cache += searchBytes
    cacheUnknown ||= g.categories.some((c) => c.unknown > 0 || c.kind === 'unclassified')
    if (!g.scope) return
    const base = {
      title: g.title,
      groupId: g.id,
      offset: Math.floor(index / 25) * 25,
      volume: null
    }
    const known =
      complete &&
      !workingUnknown &&
      !g.categories.some((c) => c.unknown > 0 || c.kind === 'unclassified')
    const scope = `${g.scope.projectId}:${g.scope.workspaceId}`
    const bytes = g.categories.reduce((n, c) => n + c.bytes, 0)
    conditions.push({
      ...base,
      key: `cache:${scope}`,
      kind: 'cache',
      bytes: searchBytes,
      threshold: STORAGE_ADVICE.projectCache,
      signal: sizeSignal(searchBytes, STORAGE_ADVICE.projectCache, known)
    })
    conditions.push({
      ...base,
      key: `project:${scope}`,
      kind: 'project',
      bytes,
      threshold: STORAGE_ADVICE.project,
      signal: sizeSignal(
        bytes,
        STORAGE_ADVICE.project,
        complete && !workingUnknown && !g.categories.some((c) => c.unknown > 0)
      )
    })
  })
  conditions.push({
    key: 'cache:app',
    kind: 'cache',
    title: 'All measured search cache',
    groupId: null,
    offset: 0,
    volume: null,
    bytes: cache,
    threshold: STORAGE_ADVICE.appCache,
    signal: sizeSignal(cache, STORAGE_ADVICE.appCache, complete && !cacheUnknown)
  })
  for (const v of volumes) {
    const threshold = Math.max(
      STORAGE_ADVICE.volumeFloor,
      Math.ceil((v.total ?? 0) * STORAGE_ADVICE.volumeFraction)
    )
    conditions.push({
      key: `volume:${v.key}`,
      kind: 'volume',
      title: v.label,
      groupId: null,
      offset: 0,
      volume: v.label,
      bytes: v.available,
      threshold,
      signal:
        v.available === null
          ? 'unknown'
          : v.available < threshold
            ? 'high'
            : v.available >= threshold * STORAGE_ADVICE.volumeResetFactor
              ? 'clear'
              : 'between'
    })
  }
  // Prioritize actual threshold crossings in a bounded reply. Omission never clears prior advice.
  conditions.sort(
    (a, b) =>
      Number(b.signal === 'high') - Number(a.signal === 'high') ||
      Number(b.kind === 'volume') - Number(a.kind === 'volume') ||
      Number(b.key === 'cache:app') - Number(a.key === 'cache:app')
  )
  return {
    conditions: conditions.slice(0, STORAGE_ADVICE.limit),
    omitted: Math.max(0, conditions.length - STORAGE_ADVICE.limit)
  }
}
