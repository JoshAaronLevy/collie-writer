import { isId } from '../domain/editor/schema'
import { exact, isOpenInput, record, type OpenInput, type ProjectResult } from './projects'
import {
  isInventoryVolume,
  isStorageCondition,
  STORAGE_ADVICE,
  type InventoryVolume,
  type StorageCondition
} from './storage-advice'

export const STORAGE_INVENTORY = 'storage.inventory'
export const INVENTORY_PAGE_SIZE = 25
export const INVENTORY_GROUP_LIMIT = 5000

/** Reporting categories are not deletion authority. Unknown content stays retained. */
export const STORAGE_CATEGORIES = {
  database: 'Project database and history',
  assets: 'Managed originals and images',
  citations: 'Managed citation files',
  search: 'Rebuildable search cache',
  recovery: 'Retained copies and recovery',
  operations: 'Local metadata and operations',
  ai: 'AI records (shared storage also includes credentials)',
  application: 'Application profile, session and logs',
  unclassified: 'Retained / unclassified',
  selected: 'Recorded selected file',
  previous: 'Recorded previous file',
  backup: 'Recorded backup file'
} as const
export type StorageCategory = keyof typeof STORAGE_CATEGORIES
export const CACHE_CATEGORIES = {
  search: {
    owner: 'LocalSearch',
    reconstruction: 'Committed project writing and research',
    clearAvailable: true
  }
} as const satisfies Partial<
  Record<
    StorageCategory,
    {
      owner: string
      reconstruction: string
      clearAvailable: boolean
    }
  >
>
export type InventoryRegion = 'working' | 'application' | 'external'
export type InventoryCount = { bytes: number; files: number; unknown: number }
export type InventoryCategory = InventoryCount & {
  kind: StorageCategory
  volume: string | null
  path: string
}
export type InventoryGroup = {
  id: string
  scope: OpenInput | null
  title: string
  path: string
  region: InventoryRegion
  note: 'none' | 'metadata-unavailable' | 'recorded-location' | 'shared-ai' | 'known-ai'
  categories: InventoryCategory[]
}
export type InventoryReport = {
  id: string
  state: 'running' | 'complete' | 'cancelled' | 'limited' | 'failed'
  startedAt: string
  asOf: string
  visited: number
  duplicates: number
  totals: Record<InventoryRegion, InventoryCount>
  groups: InventoryGroup[]
  offset: number
  totalGroups: number
  volumes: InventoryVolume[]
  conditions: StorageCondition[]
  omitted: number
}
export type InventoryCommand =
  | { kind: 'start'; id: string }
  | { kind: 'page'; id: string; offset: number }
  | { kind: 'cancel'; id: string }
/** Main supplies already validated, in-memory ownership. Never accepted from the renderer. */
export type InventoryAiOwner = { operationId: string; scope: OpenInput }
export function isInventoryAiOwners(v: unknown): v is InventoryAiOwner[] {
  return (
    Array.isArray(v) &&
    v.length <= 512 &&
    v.every(
      (o) =>
        record(o) &&
        exact(o, ['operationId', 'scope']) &&
        isId(o.operationId) &&
        isOpenInput(o.scope)
    ) &&
    new Set(v.map((o) => o.operationId)).size === v.length
  )
}
export type StorageInventoryAPI = {
  storageInventory: (command: InventoryCommand) => Promise<ProjectResult<InventoryReport>>
}
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
export function isInventoryCommand(v: unknown): v is InventoryCommand {
  return (
    record(v) &&
    isId(v.id) &&
    (((v.kind === 'start' || v.kind === 'cancel') && exact(v, ['kind', 'id'])) ||
      (v.kind === 'page' &&
        exact(v, ['kind', 'id', 'offset']) &&
        integer(v.offset) &&
        v.offset <= INVENTORY_GROUP_LIMIT &&
        v.offset % INVENTORY_PAGE_SIZE === 0))
  )
}
function isCount(v: unknown): v is InventoryCount {
  return (
    record(v) &&
    exact(v, ['bytes', 'files', 'unknown']) &&
    integer(v.bytes) &&
    integer(v.files) &&
    integer(v.unknown)
  )
}
function isGroup(v: unknown): v is InventoryGroup {
  return (
    record(v) &&
    exact(v, ['id', 'scope', 'title', 'path', 'region', 'note', 'categories']) &&
    isId(v.id) &&
    (v.scope === null || isOpenInput(v.scope)) &&
    text(v.title, 500) &&
    text(v.path, 4096) &&
    ['working', 'application', 'external'].includes(String(v.region)) &&
    ['none', 'metadata-unavailable', 'recorded-location', 'shared-ai', 'known-ai'].includes(
      String(v.note)
    ) &&
    Array.isArray(v.categories) &&
    v.categories.length <= 128 &&
    v.categories.every(
      (c) =>
        record(c) &&
        exact(c, ['kind', 'volume', 'path', 'bytes', 'files', 'unknown']) &&
        text(c.path, 4096) &&
        typeof c.kind === 'string' &&
        Object.hasOwn(STORAGE_CATEGORIES, c.kind) &&
        (c.volume === null ||
          (typeof c.volume === 'string' && /^Volume [1-9]\d?$/.test(c.volume))) &&
        integer(c.bytes) &&
        integer(c.files) &&
        integer(c.unknown)
    )
  )
}
export function isInventoryReport(v: unknown): v is InventoryReport {
  return (
    record(v) &&
    exact(v, [
      'id',
      'state',
      'startedAt',
      'asOf',
      'visited',
      'duplicates',
      'totals',
      'groups',
      'offset',
      'totalGroups',
      'volumes',
      'conditions',
      'omitted'
    ]) &&
    isId(v.id) &&
    ['running', 'complete', 'cancelled', 'limited', 'failed'].includes(String(v.state)) &&
    [v.startedAt, v.asOf].every(
      (t) => typeof t === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)
    ) &&
    integer(v.visited) &&
    integer(v.duplicates) &&
    record(v.totals) &&
    exact(v.totals, ['working', 'application', 'external']) &&
    ['working', 'application', 'external'].every((k) =>
      isCount((v.totals as Record<string, unknown>)[k])
    ) &&
    integer(v.offset) &&
    v.offset <= INVENTORY_GROUP_LIMIT &&
    v.offset % INVENTORY_PAGE_SIZE === 0 &&
    integer(v.totalGroups) &&
    v.totalGroups <= INVENTORY_GROUP_LIMIT &&
    Array.isArray(v.groups) &&
    v.groups.length <= INVENTORY_PAGE_SIZE &&
    v.groups.every(isGroup) &&
    new Set(v.groups.map((g) => g.id)).size === v.groups.length &&
    Array.isArray(v.volumes) &&
    v.volumes.length <= 64 &&
    v.volumes.every(isInventoryVolume) &&
    new Set(v.volumes.map((x) => x.key)).size === v.volumes.length &&
    new Set(v.volumes.map((x) => x.label)).size === v.volumes.length &&
    Array.isArray(v.conditions) &&
    v.conditions.length <= STORAGE_ADVICE.limit &&
    v.conditions.every(isStorageCondition) &&
    new Set(v.conditions.map((x) => x.key)).size === v.conditions.length &&
    integer(v.omitted) &&
    v.omitted <= 20000
  )
}
