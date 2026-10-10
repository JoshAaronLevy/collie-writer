import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { importHash, importTime, IMPORT_LIMITS } from './project-import'

export const GRAPH_LIMITS = {
  units: 20_000_000,
  values: 1_000_000,
  depth: 64,
  string: 2_000_000,
  records: 50_000,
  relations: 100_000,
  text: 1_000_000,
  fragment: 16_000,
  preview: 8_000,
  pageUnits: 100_000,
  pages: 4000
} as const
export type GraphLocator = { fileId: string; sha256: string; pointer: string }
export type GraphText = {
  id: string
  locator: GraphLocator
  units: number
  start: number
  end: number
  sha256: string
  fragments: Array<{ id: string; start: number; end: number }>
}
export type GraphFact = { name: string; value: string; locator: GraphLocator }
export type GraphRecord = {
  version: 1
  id: string
  kind: 'conversation' | 'message' | 'source' | 'note' | 'unclassified' | 'retained'
  locator: GraphLocator
  originNamespace: 'chatgpt' | 'curated' | 'unknown'
  identityId: string
  conversationIdentityId: string | null
  externalId: string | null
  externalConversationId: string | null
  nodeId: string | null
  label: string
  role: string | null
  contentType: string | null
  order: number
  path: 'selected' | 'alternate' | 'array-order' | 'unresolved' | 'none'
  disposition: 'candidate' | 'internal' | 'unsupported' | 'unresolved' | 'rejected' | 'search'
  eligible: boolean
  texts: GraphText[]
  facts: GraphFact[]
  unknownFields: string[]
  issues: string[]
}
export type GraphRelation = {
  version: 1
  id: string
  kind: 'member' | 'parent' | 'reference' | 'same-identity' | 'equivalent' | 'possible-match'
  from: string
  to: string | null
  evidence: GraphLocator
  decision: 'kept' | 'rejected' | 'cited' | 'search' | null
  grade: string | null
  issue: string | null
}
export type GraphFileCoverage = {
  fileId: string
  sha256: string
  reader:
    | 'raw-chat-v1'
    | 'curated-chat-v1'
    | 'message-array-v1'
    | 'mixed-json-v1'
    | 'generic-json-v1'
    | 'text-v1'
    | 'bibliography-v1'
    | 'none'
  status: 'read' | 'unsupported' | 'corrupt' | 'limited'
  bom: boolean
  records: number
  issues: string[]
}
export type ImportGraph = {
  version: 1
  id: string
  batchId: string
  sourceRevisionId: string
  revisionId: string
  createdAt: string
  readerVersion: 1
  files: GraphFileCoverage[]
  records: number
  relations: number
  conversations: number
  messages: number
  sources: number
  notes: number
  excluded: number
  unresolved: number
  fragments: number
  textUnits: number
  pages: number
  digest: string
}
export type GraphPage = {
  version: 1
  graphId: string
  index: number
  records: GraphRecord[]
  relations: GraphRelation[]
}
export type GraphPageDescriptor = {
  version: 1
  id: string
  graphId: string
  index: number
  assetId: string
  sha256: string
  bytes: number
  records: number
  relations: number
  recordIds: string[]
  kinds: Record<GraphRecord['kind'], number>
}
export type GraphReadRequest = {
  action: 'graph-read'
  batchId: string
  graphId: string
  view: 'records' | 'relations'
  offset: number
  filter: 'all' | GraphRecord['kind']
  recordId: string | null
}
export type GraphTextRequest = {
  action: 'graph-text'
  batchId: string
  graphId: string
  recordId: string
  textId: string
  offset: number
}
export type GraphValue =
  | {
      type: 'graph'
      graph: ImportGraph
      records: GraphRecord[]
      relations: GraphRelation[]
      total: number
      nextOffset: number | null
    }
  | {
      type: 'graph-text'
      graphId: string
      recordId: string
      textId: string
      text: string
      offset: number
      total: number
      nextOffset: number | null
    }
const uint = (v: unknown, max: number): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const str = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max
const nullable = (v: unknown): v is string | null => v === null || str(v)
const idOrNull = (v: unknown): boolean => v === null || isId(v)
const strings = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((s) => str(s))
export const graphKinds = [
  'conversation',
  'message',
  'source',
  'note',
  'unclassified',
  'retained'
] as const
export function isGraphLocator(v: unknown): v is GraphLocator {
  return (
    record(v) &&
    exact(v, ['fileId', 'sha256', 'pointer']) &&
    isId(v.fileId) &&
    importHash(v.sha256) &&
    str(v.pointer, 8192) &&
    (v.pointer === '' || v.pointer.startsWith('/')) &&
    !/~(?![01])/u.test(v.pointer)
  )
}
export function isGraphRecord(v: unknown): v is GraphRecord {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'kind',
      'locator',
      'originNamespace',
      'identityId',
      'conversationIdentityId',
      'externalId',
      'externalConversationId',
      'nodeId',
      'label',
      'role',
      'contentType',
      'order',
      'path',
      'disposition',
      'eligible',
      'texts',
      'facts',
      'unknownFields',
      'issues'
    ]) &&
    v.version === 1 &&
    isId(v.id) &&
    graphKinds.includes(v.kind as GraphRecord['kind']) &&
    isGraphLocator(v.locator) &&
    ['chatgpt', 'curated', 'unknown'].includes(String(v.originNamespace)) &&
    isId(v.identityId) &&
    idOrNull(v.conversationIdentityId) &&
    nullable(v.externalId) &&
    nullable(v.externalConversationId) &&
    nullable(v.nodeId) &&
    str(v.label, 256) &&
    nullable(v.role) &&
    nullable(v.contentType) &&
    uint(v.order, GRAPH_LIMITS.records) &&
    ['selected', 'alternate', 'array-order', 'unresolved', 'none'].includes(String(v.path)) &&
    ['candidate', 'internal', 'unsupported', 'unresolved', 'rejected', 'search'].includes(
      String(v.disposition)
    ) &&
    typeof v.eligible === 'boolean' &&
    (!v.eligible ||
      (v.disposition === 'candidate' && !['alternate', 'unresolved'].includes(String(v.path)))) &&
    Array.isArray(v.texts) &&
    v.texts.length <= 128 &&
    v.texts.every(
      (t) =>
        record(t) &&
        exact(t, ['id', 'locator', 'units', 'start', 'end', 'sha256', 'fragments']) &&
        isId(t.id) &&
        isGraphLocator(t.locator) &&
        uint(t.units, GRAPH_LIMITS.string) &&
        uint(t.start, GRAPH_LIMITS.units) &&
        uint(t.end, GRAPH_LIMITS.units) &&
        t.end - t.start === t.units &&
        importHash(t.sha256) &&
        Array.isArray(t.fragments) &&
        t.fragments.length <= 128 &&
        t.fragments.every(
          (f) =>
            record(f) &&
            exact(f, ['id', 'start', 'end']) &&
            isId(f.id) &&
            uint(f.start, GRAPH_LIMITS.string) &&
            uint(f.end, GRAPH_LIMITS.string) &&
            f.end > f.start &&
            f.end - f.start <= GRAPH_LIMITS.fragment
        )
    ) &&
    (v.disposition !== 'internal' || (v.texts.length === 0 && !v.eligible)) &&
    Array.isArray(v.facts) &&
    v.facts.length <= 32 &&
    v.facts.every(
      (f) =>
        record(f) &&
        exact(f, ['name', 'value', 'locator']) &&
        str(f.name, 128) &&
        str(f.value) &&
        isGraphLocator(f.locator)
    ) &&
    strings(v.unknownFields, 128) &&
    strings(v.issues, 32)
  )
}
export function isGraphRelation(v: unknown): v is GraphRelation {
  return (
    record(v) &&
    exact(v, ['version', 'id', 'kind', 'from', 'to', 'evidence', 'decision', 'grade', 'issue']) &&
    v.version === 1 &&
    isId(v.id) &&
    ['member', 'parent', 'reference', 'same-identity', 'equivalent', 'possible-match'].includes(
      String(v.kind)
    ) &&
    isId(v.from) &&
    idOrNull(v.to) &&
    isGraphLocator(v.evidence) &&
    (v.decision === null || ['kept', 'rejected', 'cited', 'search'].includes(String(v.decision))) &&
    nullable(v.grade) &&
    nullable(v.issue)
  )
}
export function isImportGraph(v: unknown): v is ImportGraph {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'batchId',
      'sourceRevisionId',
      'revisionId',
      'createdAt',
      'readerVersion',
      'files',
      'records',
      'relations',
      'conversations',
      'messages',
      'sources',
      'notes',
      'excluded',
      'unresolved',
      'fragments',
      'textUnits',
      'pages',
      'digest'
    ]) &&
    v.version === 1 &&
    v.readerVersion === 1 &&
    [v.id, v.batchId, v.sourceRevisionId, v.revisionId].every(isId) &&
    importTime(v.createdAt) &&
    importHash(v.digest) &&
    uint(v.records, GRAPH_LIMITS.records) &&
    uint(v.relations, GRAPH_LIMITS.relations) &&
    ['conversations', 'messages', 'sources', 'notes', 'excluded', 'unresolved'].every((k) =>
      uint(v[k], GRAPH_LIMITS.records)
    ) &&
    uint(v.fragments, GRAPH_LIMITS.units) &&
    uint(v.textUnits, GRAPH_LIMITS.units) &&
    uint(v.pages, GRAPH_LIMITS.pages) &&
    Array.isArray(v.files) &&
    v.files.length <= IMPORT_LIMITS.files &&
    v.files.every(
      (f) =>
        record(f) &&
        exact(f, ['fileId', 'sha256', 'reader', 'status', 'bom', 'records', 'issues']) &&
        isId(f.fileId) &&
        importHash(f.sha256) &&
        [
          'raw-chat-v1',
          'curated-chat-v1',
          'message-array-v1',
          'mixed-json-v1',
          'generic-json-v1',
          'text-v1',
          'bibliography-v1',
          'none'
        ].includes(String(f.reader)) &&
        ['read', 'unsupported', 'corrupt', 'limited'].includes(String(f.status)) &&
        typeof f.bom === 'boolean' &&
        uint(f.records, GRAPH_LIMITS.records) &&
        strings(f.issues, 32)
    )
  )
}
export function isGraphPage(v: unknown): v is GraphPage {
  return (
    record(v) &&
    exact(v, ['version', 'graphId', 'index', 'records', 'relations']) &&
    v.version === 1 &&
    isId(v.graphId) &&
    uint(v.index, GRAPH_LIMITS.pages - 1) &&
    Array.isArray(v.records) &&
    v.records.length <= IMPORT_LIMITS.page &&
    v.records.every(isGraphRecord) &&
    Array.isArray(v.relations) &&
    v.relations.length <= IMPORT_LIMITS.page &&
    v.relations.every(isGraphRelation) &&
    !(v.records.length && v.relations.length) &&
    v.records.length + v.relations.length > 0
  )
}
export function isGraphPageDescriptor(v: unknown): v is GraphPageDescriptor {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'graphId',
      'index',
      'assetId',
      'sha256',
      'bytes',
      'records',
      'relations',
      'recordIds',
      'kinds'
    ]) &&
    v.version === 1 &&
    [v.id, v.graphId, v.assetId].every(isId) &&
    uint(v.index, GRAPH_LIMITS.pages - 1) &&
    importHash(v.sha256) &&
    uint(v.bytes, IMPORT_LIMITS.artifactBytes) &&
    uint(v.records, IMPORT_LIMITS.page) &&
    uint(v.relations, IMPORT_LIMITS.page) &&
    !(v.records && v.relations) &&
    Number(v.records) + Number(v.relations) > 0 &&
    Array.isArray(v.recordIds) &&
    v.recordIds.length === v.records &&
    v.recordIds.every(isId) &&
    new Set(v.recordIds).size === v.recordIds.length &&
    record(v.kinds) &&
    exact(v.kinds, [...graphKinds]) &&
    graphKinds.every((k) => uint((v.kinds as Record<string, unknown>)[k], IMPORT_LIMITS.page)) &&
    Object.values(v.kinds).reduce<number>((n, v) => n + Number(v), 0) === v.records
  )
}
export function isGraphReadRequest(v: Record<string, unknown>): boolean {
  const base = ['projectId', 'workspaceId', 'action', 'batchId', 'graphId']
  return (
    isId(v.batchId) &&
    isId(v.graphId) &&
    ((v.action === 'graph-read' &&
      exact(v, [...base, 'view', 'offset', 'filter', 'recordId']) &&
      ['records', 'relations'].includes(String(v.view)) &&
      uint(v.offset, GRAPH_LIMITS.relations) &&
      ['all', ...graphKinds].includes(String(v.filter)) &&
      idOrNull(v.recordId) &&
      (v.recordId === null || (v.view === 'records' && v.offset === 0 && v.filter === 'all'))) ||
      (v.action === 'graph-text' &&
        exact(v, [...base, 'recordId', 'textId', 'offset']) &&
        isId(v.recordId) &&
        isId(v.textId) &&
        uint(v.offset, GRAPH_LIMITS.string)))
  )
}
export function isGraphValue(v: Record<string, unknown>): v is GraphValue {
  if (v.type === 'graph-text')
    return (
      exact(v, [
        'type',
        'graphId',
        'recordId',
        'textId',
        'text',
        'offset',
        'total',
        'nextOffset'
      ]) &&
      [v.graphId, v.recordId, v.textId].every(isId) &&
      str(v.text, GRAPH_LIMITS.preview) &&
      uint(v.offset, GRAPH_LIMITS.string) &&
      uint(v.total, GRAPH_LIMITS.string) &&
      v.offset + v.text.length <= v.total &&
      (v.nextOffset === null
        ? v.offset + v.text.length === v.total
        : uint(v.nextOffset, GRAPH_LIMITS.string) &&
          v.nextOffset === v.offset + v.text.length &&
          v.nextOffset < v.total &&
          v.text.length > 0)
    )
  return (
    v.type === 'graph' &&
    exact(v, ['type', 'graph', 'records', 'relations', 'total', 'nextOffset']) &&
    isImportGraph(v.graph) &&
    Array.isArray(v.records) &&
    v.records.length <= IMPORT_LIMITS.page &&
    v.records.every(isGraphRecord) &&
    Array.isArray(v.relations) &&
    v.relations.length <= IMPORT_LIMITS.page &&
    v.relations.every(isGraphRelation) &&
    uint(v.total, GRAPH_LIMITS.relations) &&
    (v.nextOffset === null || uint(v.nextOffset, GRAPH_LIMITS.relations)) &&
    JSON.stringify(v).length <= GRAPH_LIMITS.pageUnits
  )
}
