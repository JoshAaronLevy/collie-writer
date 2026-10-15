import { isId } from '../domain/editor/schema'
import { hasControlCharacters } from './control-characters'
import {
  isMaterialTarget,
  isChapterMaterialItem,
  MATERIAL_KINDS,
  MATERIAL_PAGE_SIZE,
  type MaterialKind,
  type MaterialTarget,
  type ChapterMaterialItem,
  type ChapterMaterialView
} from './chapter-material'
import { exact, record, type OpenInput } from './projects'

export const TOPIC_LIMIT = 1000
export const PLANNING_RECORD_LIMIT = 200000
export const PLANNING_SELECTION_LIMIT = 100
export type Disposition = 'keep' | 'develop' | 'aside'
export type PlanningTopic = { id: string; title: string; position: number }
export type TopicMembership = MaterialTarget & { topicId: string }
export type MaterialDisposition = MaterialTarget & {
  state: Exclude<Disposition, 'keep'>
  reason: string
}
export type PlanningSnapshot = {
  topics: PlanningTopic[]
  memberships: TopicMembership[]
  dispositions: MaterialDisposition[]
}
export type PlanningDestination = { kind: 'chapter' | 'topic'; id: string }
export type PlanningLocation = { kind: 'pool' } | PlanningDestination
export type PlanningItem = {
  material: ChapterMaterialItem
  disposition: Disposition
  reason: string
  topicIds: string[]
}
export type PlanningCount = { id: string; count: number; developCount: number; asideCount: number }
export type PlanningView = {
  headCommitId: string
  topics: (PlanningTopic & Omit<PlanningCount, 'id'>)[]
  chapters: PlanningCount[]
  scopes: ChapterMaterialView['scopes']
  items: PlanningItem[]
  total: number
  libraryTotal: number
  offset: number
}
export type PlanningReadInput = OpenInput & {
  target?: MaterialTarget
  location: PlanningLocation
  filter: 'unplaced' | 'all' | 'aside'
  kind: MaterialKind | 'all'
  status: 'all' | 'develop'
  query: string
  offset: number
}
export type PlanningEdit =
  | { type: 'disposition'; targets: MaterialTarget[]; state: Disposition; reason: string }
  | {
      type: 'assign'
      targets: MaterialTarget[]
      to: PlanningDestination | null
      from: PlanningDestination | null
    }
  | { type: 'topic-create'; id: string; title: string }
  | { type: 'topic-rename'; id: string; title: string }
  | { type: 'topic-move'; id: string; position: number }
  | { type: 'topic-remove'; id: string }
  | { type: 'topic-chapter'; id: string; parentId: string | null; kind: 'chapter' | 'text' }
export type PlanningChangeInput = OpenInput & {
  action: 'set' | 'status'
  operationId: string
  expectedHead: string
  documentId: string
  change: PlanningEdit
}

const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !hasControlCharacters(v, true)
const title = (v: unknown): boolean => text(v, 500) && !!v.trim()
const count = (v: unknown, max = 1000000): boolean =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const unique = (ids: string[]): boolean => new Set(ids).size === ids.length
export function isPlanningDestination(v: unknown): v is PlanningDestination {
  return (
    record(v) &&
    exact(v, ['kind', 'id']) &&
    ['chapter', 'topic'].includes(String(v.kind)) &&
    isId(v.id)
  )
}
export function isPlanningLocation(v: unknown): v is PlanningLocation {
  return isPlanningDestination(v) || (record(v) && exact(v, ['kind']) && v.kind === 'pool')
}
export function isPlanningTopic(v: unknown): v is PlanningTopic {
  return (
    record(v) &&
    exact(v, ['id', 'title', 'position']) &&
    isId(v.id) &&
    title(v.title) &&
    count(v.position, TOPIC_LIMIT - 1)
  )
}
export function isTopicMembership(v: unknown): v is TopicMembership {
  return (
    record(v) &&
    exact(v, ['kind', 'id', 'topicId']) &&
    isMaterialTarget({ kind: v.kind, id: v.id }) &&
    isId(v.topicId)
  )
}
export function isMaterialDisposition(v: unknown): v is MaterialDisposition {
  return (
    record(v) &&
    exact(v, ['kind', 'id', 'state', 'reason']) &&
    isMaterialTarget({ kind: v.kind, id: v.id }) &&
    ['develop', 'aside'].includes(String(v.state)) &&
    text(v.reason, 1000)
  )
}
export function isPlanningSnapshot(v: unknown): v is PlanningSnapshot {
  if (
    !record(v) ||
    !exact(v, ['topics', 'memberships', 'dispositions']) ||
    !Array.isArray(v.topics) ||
    v.topics.length > TOPIC_LIMIT ||
    !v.topics.every(isPlanningTopic) ||
    !unique(v.topics.map((t) => t.id)) ||
    !v.topics.every((t, i) => t.position === i) ||
    !Array.isArray(v.memberships) ||
    v.memberships.length > PLANNING_RECORD_LIMIT ||
    !v.memberships.every(isTopicMembership) ||
    !unique(v.memberships.map((m) => `${m.topicId}:${m.kind}:${m.id}`)) ||
    !Array.isArray(v.dispositions) ||
    v.dispositions.length > PLANNING_RECORD_LIMIT ||
    !v.dispositions.every(isMaterialDisposition) ||
    !unique(v.dispositions.map((m) => `${m.kind}:${m.id}`))
  )
    return false
  const topics = new Set(v.topics.map((t) => t.id))
  return v.memberships.every((m) => topics.has(m.topicId))
}
export function isPlanningReadInput(v: unknown): v is PlanningReadInput {
  return (
    record(v) &&
    exact(v, [
      'projectId',
      'workspaceId',
      'location',
      'filter',
      'kind',
      'status',
      'query',
      'offset',
      ...(v.target === undefined ? [] : ['target'])
    ]) &&
    [v.projectId, v.workspaceId].every(isId) &&
    (v.target === undefined || isMaterialTarget(v.target)) &&
    isPlanningLocation(v.location) &&
    ['unplaced', 'all', 'aside'].includes(String(v.filter)) &&
    (v.kind === 'all' || MATERIAL_KINDS.includes(v.kind as MaterialKind)) &&
    ['all', 'develop'].includes(String(v.status)) &&
    text(v.query, 200) &&
    count(v.offset)
  )
}
export function isPlanningEdit(v: unknown): v is PlanningEdit {
  if (!record(v)) return false
  if (v.type === 'disposition' || v.type === 'assign') {
    if (
      !Array.isArray(v.targets) ||
      !v.targets.length ||
      v.targets.length > PLANNING_SELECTION_LIMIT ||
      !v.targets.every(isMaterialTarget) ||
      !unique(v.targets.map((t) => `${t.kind}:${t.id}`))
    )
      return false
    if (v.type === 'disposition')
      return (
        exact(v, ['type', 'targets', 'state', 'reason']) &&
        ['keep', 'develop', 'aside'].includes(String(v.state)) &&
        text(v.reason, 1000)
      )
    return (
      exact(v, ['type', 'targets', 'to', 'from']) &&
      (v.to === null || isPlanningDestination(v.to)) &&
      (v.from === null || isPlanningDestination(v.from)) &&
      (v.to !== null || v.from !== null) &&
      !(v.to && v.from && v.to.kind === v.from.kind && v.to.id === v.from.id)
    )
  }
  if (!isId(v.id)) return false
  if (v.type === 'topic-create' || v.type === 'topic-rename')
    return exact(v, ['type', 'id', 'title']) && title(v.title)
  if (v.type === 'topic-move')
    return exact(v, ['type', 'id', 'position']) && count(v.position, TOPIC_LIMIT - 1)
  if (v.type === 'topic-remove') return exact(v, ['type', 'id'])
  return (
    v.type === 'topic-chapter' &&
    exact(v, ['type', 'id', 'parentId', 'kind']) &&
    (v.parentId === null || isId(v.parentId)) &&
    ['chapter', 'text'].includes(String(v.kind))
  )
}
export function isPlanningChangeInput(v: unknown): v is PlanningChangeInput {
  return (
    record(v) &&
    exact(v, [
      'projectId',
      'workspaceId',
      'action',
      'operationId',
      'expectedHead',
      'documentId',
      'change'
    ]) &&
    [v.projectId, v.workspaceId, v.operationId, v.expectedHead, v.documentId].every(isId) &&
    ['set', 'status'].includes(String(v.action)) &&
    isPlanningEdit(v.change)
  )
}
function isCount(v: unknown): v is PlanningCount {
  return (
    record(v) &&
    exact(v, ['id', 'count', 'developCount', 'asideCount']) &&
    isId(v.id) &&
    [v.count, v.developCount, v.asideCount].every((n) => count(n)) &&
    Number(v.developCount) <= Number(v.count)
  )
}
export function isPlanningView(v: unknown): v is PlanningView {
  return (
    record(v) &&
    exact(v, [
      'headCommitId',
      'topics',
      'chapters',
      'scopes',
      'items',
      'total',
      'libraryTotal',
      'offset'
    ]) &&
    isId(v.headCommitId) &&
    [v.total, v.libraryTotal, v.offset].every((n) => count(n)) &&
    Array.isArray(v.topics) &&
    v.topics.length <= TOPIC_LIMIT &&
    v.topics.every(
      (t, i) =>
        record(t) &&
        exact(t, ['id', 'title', 'position', 'count', 'developCount', 'asideCount']) &&
        isPlanningTopic({ id: t.id, title: t.title, position: t.position }) &&
        t.position === i &&
        isCount({
          id: t.id,
          count: t.count,
          developCount: t.developCount,
          asideCount: t.asideCount
        })
    ) &&
    unique(v.topics.map((t) => t.id)) &&
    Array.isArray(v.chapters) &&
    v.chapters.length <= 10000 &&
    v.chapters.every(isCount) &&
    unique(v.chapters.map((c) => c.id)) &&
    Array.isArray(v.scopes) &&
    v.scopes.length <= 8 &&
    v.scopes.every(
      (s) =>
        record(s) &&
        exact(s, ['id', 'title', 'kind']) &&
        isId(s.id) &&
        title(s.title) &&
        ['part', 'chapter', 'text'].includes(String(s.kind))
    ) &&
    unique(v.scopes.map((s) => s.id)) &&
    Array.isArray(v.items) &&
    v.items.length <= MATERIAL_PAGE_SIZE &&
    v.items.length <= Number(v.total) &&
    v.items.every(
      (item) =>
        record(item) &&
        exact(item, ['material', 'disposition', 'reason', 'topicIds']) &&
        isChapterMaterialItem(item.material) &&
        ['keep', 'develop', 'aside'].includes(String(item.disposition)) &&
        text(item.reason, 1000) &&
        Array.isArray(item.topicIds) &&
        item.topicIds.length <= TOPIC_LIMIT &&
        item.topicIds.every(isId) &&
        unique(item.topicIds)
    ) &&
    unique(v.items.map((item) => `${item.material.kind}:${item.material.id}`))
  )
}
