import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { hasControlCharacters } from './control-characters'
import { importHash, importTime, type ImportSettings, isImportSettings } from './project-import'
import {
  isGraphPageDescriptor,
  type GraphPageDescriptor,
  type GraphFileCoverage
} from './import-graph'

export const MAPPING_LIMITS = {
  rules: 32,
  path: 16,
  traversals: 1_000_000,
  fields: 2048,
  variants: 256,
  collections: 256,
  sampleUnits: 512,
  profileUnits: 120_000,
  programUnits: 32_000,
  bundles: 32,
  yieldEvery: 1024
} as const
export type MappingStep = { field: string } | { index: number } | { each: true }
export type FieldPath = Array<Exclude<MappingStep, { each: true }>>
export type MappingPath = MappingStep[]
export type MappingParent = { rule: string; key: FieldPath | null; scope: 'file' | 'selection' }
export type MappingOrder =
  | { kind: 'array' }
  | { kind: 'number'; field: FieldPath }
  | { kind: 'parent-chain'; parent: FieldPath; current: FieldPath }
export type SourceDecision = 'kept' | 'rejected' | 'search' | 'cited'
export type MappingDecision =
  | SourceDecision
  | {
      path: FieldPath
      aliases: Array<{ original: string | number | boolean; decision: SourceDecision }>
    }
type CommonRule = {
  id: string
  from: { profiles: string[]; parent: string | null; path: MappingPath }
  variants: string[]
  identity: FieldPath | null
  title: FieldPath | null
  time: FieldPath | null
}
export type MappingRule = CommonRule &
  (
    | { kind: 'conversation' }
    | {
        kind: 'message'
        body: MappingPath
        role: FieldPath
        channel: FieldPath | null
        aliases: Array<{
          original: string
          role: 'user' | 'assistant' | 'system' | 'tool' | 'internal'
        }>
        parent: MappingParent
        order: MappingOrder
      }
    | {
        kind: 'source'
        fields: Array<{ name: string; path: FieldPath }>
        parent: MappingParent | null
        decision: MappingDecision
      }
    | {
        kind: 'note'
        body: MappingPath
        tags: FieldPath | null
        categories: FieldPath | null
        authorship: FieldPath | null
      }
  )
export type ImportMapping = { version: 1; profiles: string[]; rules: MappingRule[] }
export type StructureProfile = {
  version: 1
  id: string
  fileId: string
  sha256: string
  values: number
  fields: Array<{ path: MappingPath; types: Array<{ type: string; count: number }> }>
  collections: Array<{ path: MappingPath; arrays: number; items: number; min: number; max: number }>
  variants: Array<{
    id: string
    path: MappingPath
    count: number
    first: { pointer: string; sample: string; omitted: boolean }
    last: { pointer: string; sample: string; omitted: boolean }
  }>
  digest: string
}
export type MappingArtifact = {
  version: 1
  kind: 'mapping-v1'
  id: string
  batchId: string
  assetId: string
  sha256: string
  bytes: number
  digest: string
  createdAt: string
  graphId: string
  revisionId: string
  ownerId: string
  part: 'profile' | 'normalization' | 'page'
}
export type MappingNormalization = {
  version: 1
  kind: 'mapping-applied'
  id: string
  batchId: string
  graphId: string
  revisionId: string
  settings: ImportSettings
  mapping: ImportMapping
  files: Array<{ fileId: string; sha256: string; profileId: string }>
  result: {
    files: GraphFileCoverage[]
    textUnits: number
    recordsDigest: string
    relationsDigest: string
    records: number
    relations: number
    pages: GraphPageDescriptor[]
  }
}
const count = (n: unknown, max = 1_000_000): boolean =>
  Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max
export const mappingKey = (v: unknown): v is string =>
  typeof v === 'string' &&
  !!v.length &&
  v.length <= 128 &&
  !['__proto__', 'prototype', 'constructor'].includes(v) &&
  !hasControlCharacters(v, false, 0x7f)
export function isMappingPath(v: unknown, each = true): v is MappingPath {
  return (
    Array.isArray(v) &&
    v.length <= MAPPING_LIMITS.path &&
    v.every(
      (s) =>
        record(s) &&
        ((exact(s, ['field']) && mappingKey(s.field)) ||
          (exact(s, ['index']) && count(s.index)) ||
          (each && exact(s, ['each']) && s.each === true))
    )
  )
}
const field = (v: unknown): v is FieldPath => isMappingPath(v, false)
const optional = (v: unknown): boolean => v === null || field(v)
const parent = (v: unknown): v is MappingParent =>
  record(v) &&
  exact(v, ['rule', 'key', 'scope']) &&
  mappingKey(v.rule) &&
  optional(v.key) &&
  (v.scope === 'file' || v.scope === 'selection')
const sourceFields = [
  'type',
  'title',
  'author',
  'issued',
  'DOI',
  'ISBN',
  'ISSN',
  'URL',
  'container-title',
  'publisher',
  'volume',
  'issue',
  'page',
  'edition',
  'language'
]
const decision = (v: unknown): v is SourceDecision =>
  typeof v === 'string' && ['kept', 'rejected', 'search', 'cited'].includes(v)
function isMappingDecision(v: unknown): v is MappingDecision {
  return (
    decision(v) ||
    (record(v) &&
      exact(v, ['path', 'aliases']) &&
      field(v.path) &&
      Array.isArray(v.aliases) &&
      v.aliases.length > 0 &&
      v.aliases.length <= 32 &&
      v.aliases.every(
        (a) =>
          record(a) &&
          exact(a, ['original', 'decision']) &&
          decision(a.decision) &&
          (mappingKey(a.original) ||
            typeof a.original === 'boolean' ||
            (typeof a.original === 'number' && Number.isSafeInteger(a.original)))
      ) &&
      new Set(v.aliases.map((a) => JSON.stringify(a.original))).size === v.aliases.length)
  )
}
export function isImportMapping(v: unknown): v is ImportMapping {
  if (
    !record(v) ||
    !exact(v, ['version', 'profiles', 'rules']) ||
    v.version !== 1 ||
    !Array.isArray(v.profiles) ||
    !v.profiles.length ||
    v.profiles.length > 100 ||
    !v.profiles.every(isId) ||
    new Set(v.profiles).size !== v.profiles.length ||
    !Array.isArray(v.rules) ||
    !v.rules.length ||
    v.rules.length > MAPPING_LIMITS.rules ||
    JSON.stringify(v).length > MAPPING_LIMITS.programUnits
  )
    return false
  const seen = new Map<string, string>(),
    scopes = new Map<string, string[]>(),
    profileIds = new Set(v.profiles)
  for (const r of v.rules) {
    if (
      !record(r) ||
      !mappingKey(r.id) ||
      seen.has(r.id) ||
      !record(r.from) ||
      !exact(r.from, ['profiles', 'parent', 'path']) ||
      !Array.isArray(r.from.profiles) ||
      !r.from.profiles.length ||
      r.from.profiles.length > 100 ||
      !r.from.profiles.every((p) => isId(p) && profileIds.has(p)) ||
      new Set(r.from.profiles).size !== r.from.profiles.length ||
      !(r.from.parent === null || (typeof r.from.parent === 'string' && seen.has(r.from.parent))) ||
      !isMappingPath(r.from.path) ||
      !optional(r.identity) ||
      !optional(r.title) ||
      !optional(r.time) ||
      !Array.isArray(r.variants) ||
      r.variants.length > MAPPING_LIMITS.variants ||
      !r.variants.every(importHash) ||
      new Set(r.variants).size !== r.variants.length
    )
      return false
    const from = r.from
    if (
      typeof from.parent === 'string' &&
      !(from.profiles as string[]).every((p) => scopes.get(String(from.parent))?.includes(p))
    )
      return false
    const common = ['id', 'kind', 'from', 'variants', 'identity', 'title', 'time']
    if (r.kind === 'conversation') {
      if (!exact(r, common) || r.from.parent !== null) return false
    } else if (r.kind === 'message') {
      if (
        !exact(r, [...common, 'body', 'role', 'channel', 'aliases', 'parent', 'order']) ||
        !isMappingPath(r.body) ||
        !field(r.role) ||
        !optional(r.channel) ||
        !parent(r.parent) ||
        seen.get(r.parent.rule) !== 'conversation' ||
        (r.parent.key === null && r.from.parent !== r.parent.rule) ||
        !Array.isArray(r.aliases) ||
        !r.aliases.length ||
        r.aliases.length > 32 ||
        !r.aliases.every(
          (a) =>
            record(a) &&
            exact(a, ['original', 'role']) &&
            mappingKey(a.original) &&
            typeof a.role === 'string' &&
            ['user', 'assistant', 'system', 'tool', 'internal'].includes(a.role)
        ) ||
        new Set(r.aliases.map((a) => a.original)).size !== r.aliases.length ||
        !record(r.order)
      )
        return false
      if (r.order.kind === 'array') {
        if (!exact(r.order, ['kind'])) return false
      } else if (r.order.kind === 'number') {
        if (!exact(r.order, ['kind', 'field']) || !field(r.order.field)) return false
      } else if (r.order.kind === 'parent-chain') {
        if (
          !exact(r.order, ['kind', 'parent', 'current']) ||
          !field(r.order.parent) ||
          !field(r.order.current) ||
          r.identity === null
        )
          return false
      } else return false
    } else if (r.kind === 'source') {
      if (
        !exact(r, [...common, 'fields', 'parent', 'decision']) ||
        !Array.isArray(r.fields) ||
        !r.fields.length ||
        r.fields.length > sourceFields.length ||
        !r.fields.every(
          (f) =>
            record(f) &&
            exact(f, ['name', 'path']) &&
            typeof f.name === 'string' &&
            sourceFields.includes(f.name) &&
            field(f.path)
        ) ||
        new Set(r.fields.map((f) => f.name)).size !== r.fields.length ||
        !isMappingDecision(r.decision) ||
        !(
          r.parent === null ||
          (parent(r.parent) &&
            seen.get(r.parent.rule) === 'message' &&
            (r.parent.key !== null || r.from.parent === r.parent.rule))
        )
      )
        return false
    } else if (r.kind === 'note') {
      if (
        !exact(r, [...common, 'body', 'tags', 'categories', 'authorship']) ||
        !isMappingPath(r.body) ||
        ![r.tags, r.categories, r.authorship].every(optional)
      )
        return false
    } else return false
    seen.set(r.id, r.kind)
    scopes.set(r.id, from.profiles as string[])
  }
  return true
}
export function isStructureProfile(v: unknown): v is StructureProfile {
  const example = (e: unknown): boolean =>
    record(e) &&
    exact(e, ['pointer', 'sample', 'omitted']) &&
    typeof e.pointer === 'string' &&
    e.pointer.length <= 8192 &&
    (!e.pointer || e.pointer.startsWith('/')) &&
    typeof e.sample === 'string' &&
    e.sample.length <= MAPPING_LIMITS.sampleUnits &&
    typeof e.omitted === 'boolean'
  const pathRow = (r: unknown): r is Record<string, unknown> => record(r) && isMappingPath(r.path)
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'fileId',
      'sha256',
      'values',
      'fields',
      'collections',
      'variants',
      'digest'
    ]) &&
    v.version === 1 &&
    [v.id, v.fileId].every(isId) &&
    [v.sha256, v.digest].every(importHash) &&
    count(v.values) &&
    Array.isArray(v.fields) &&
    v.fields.length <= MAPPING_LIMITS.fields &&
    v.fields.every(
      (f) =>
        pathRow(f) &&
        exact(f, ['path', 'types']) &&
        Array.isArray(f.types) &&
        f.types.length <= 7 &&
        f.types.every(
          (t) =>
            record(t) &&
            exact(t, ['type', 'count']) &&
            typeof t.type === 'string' &&
            ['null', 'string', 'number', 'boolean', 'array', 'object'].includes(t.type) &&
            count(t.count)
        )
    ) &&
    Array.isArray(v.collections) &&
    v.collections.length <= MAPPING_LIMITS.collections &&
    v.collections.every(
      (c) =>
        pathRow(c) &&
        exact(c, ['path', 'arrays', 'items', 'min', 'max']) &&
        [c.arrays, c.items, c.min, c.max].every((n) => count(n)) &&
        Number(c.min) <= Number(c.max)
    ) &&
    Array.isArray(v.variants) &&
    v.variants.length <= MAPPING_LIMITS.variants &&
    v.variants.every(
      (r) =>
        pathRow(r) &&
        exact(r, ['id', 'path', 'count', 'first', 'last']) &&
        importHash(r.id) &&
        count(r.count) &&
        example(r.first) &&
        example(r.last)
    ) &&
    JSON.stringify(v).length <= MAPPING_LIMITS.profileUnits
  )
}
export function isMappingArtifact(v: unknown): v is MappingArtifact {
  return (
    record(v) &&
    exact(v, [
      'version',
      'kind',
      'id',
      'batchId',
      'assetId',
      'sha256',
      'bytes',
      'digest',
      'createdAt',
      'graphId',
      'revisionId',
      'ownerId',
      'part'
    ]) &&
    v.version === 1 &&
    v.kind === 'mapping-v1' &&
    [v.id, v.batchId, v.assetId, v.graphId, v.revisionId, v.ownerId].every(isId) &&
    [v.sha256, v.digest].every(importHash) &&
    count(v.bytes, 1024 ** 2) &&
    importTime(v.createdAt) &&
    typeof v.part === 'string' &&
    ['profile', 'normalization', 'page'].includes(v.part)
  )
}
export function isMappingNormalization(v: unknown): v is MappingNormalization {
  if (!record(v) || !isImportMapping(v.mapping)) return false
  const mapping = v.mapping
  const valid =
    record(v) &&
    exact(v, [
      'version',
      'kind',
      'id',
      'batchId',
      'graphId',
      'revisionId',
      'settings',
      'mapping',
      'files',
      'result'
    ]) &&
    v.version === 1 &&
    v.kind === 'mapping-applied' &&
    [v.id, v.batchId, v.graphId, v.revisionId].every(isId) &&
    isImportSettings(v.settings) &&
    isImportMapping(v.mapping) &&
    Array.isArray(v.files) &&
    v.files.length > 0 &&
    v.files.length <= 100 &&
    v.files.every(
      (f) =>
        record(f) &&
        exact(f, ['fileId', 'sha256', 'profileId']) &&
        [f.fileId, f.profileId].every(isId) &&
        importHash(f.sha256)
    ) &&
    new Set(v.files.map((f) => f.fileId)).size === v.files.length &&
    v.mapping.profiles.length === v.files.length &&
    v.files.every((f, i) => mapping.profiles[i] === f.profileId) &&
    record(v.result) &&
    exact(v.result, [
      'files',
      'textUnits',
      'recordsDigest',
      'relationsDigest',
      'records',
      'relations',
      'pages'
    ]) &&
    count(v.result.textUnits, 20_000_000) &&
    count(v.result.records, 50_000) &&
    count(v.result.relations, 100_000) &&
    [v.result.recordsDigest, v.result.relationsDigest].every(importHash) &&
    Array.isArray(v.result.files) &&
    v.result.files.length === v.files.length &&
    v.result.files.every(
      (f) =>
        record(f) &&
        exact(f, ['fileId', 'sha256', 'reader', 'status', 'bom', 'records', 'issues']) &&
        isId(f.fileId) &&
        importHash(f.sha256) &&
        f.reader === 'generic-json-v1' &&
        typeof f.status === 'string' &&
        ['read', 'unsupported', 'corrupt', 'limited'].includes(f.status) &&
        typeof f.bom === 'boolean' &&
        count(f.records, 50_000) &&
        Array.isArray(f.issues) &&
        f.issues.length <= 32 &&
        f.issues.every((i) => typeof i === 'string' && i.length <= 4000)
    ) &&
    Array.isArray(v.result.pages) &&
    v.result.pages.length <= 4000 &&
    v.result.pages.every(isGraphPageDescriptor) &&
    v.result.pages.every((p, i) => p.graphId === v.id && p.index === i) &&
    v.result.pages.reduce((n, p) => n + p.records, 0) === v.result.records &&
    v.result.pages.reduce((n, p) => n + p.relations, 0) === v.result.relations
  if (!valid) return false
  const n = v as MappingNormalization
  return (
    n.result.files.every(
      (f, i) => f.fileId === n.files[i].fileId && f.sha256 === n.files[i].sha256
    ) &&
    n.result.files.reduce((total, f) => total + f.records, 0) === n.result.records &&
    new Set(n.result.pages.map((p) => p.id)).size === n.result.pages.length &&
    new Set(n.result.pages.map((p) => p.assetId)).size === n.result.pages.length
  )
}
