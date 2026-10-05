import { hasControlCharacters } from './control-characters'
import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, names: string[]): boolean =>
  Object.keys(v).length === names.length && names.every((name) => Object.hasOwn(v, name))

export const SOURCE_TYPES = [
  'article-journal',
  'book',
  'chapter',
  'report',
  'thesis',
  'webpage'
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]
export type SourceCreator = { family: string; given: string; literal: string }
export type SourceMetadata = {
  type: SourceType
  title: string
  author: SourceCreator[]
  issued: string
  containerTitle: string
  publisher: string
  edition: string
  volume: string
  issue: string
  page: string
  DOI: string
  URL: string
  ISBN: string
  ISSN: string
}
export type SourceAttachment = {
  id: string
  name: string
  mediaType: string
  bytes: number
  sha256: string
  state: 'active' | 'removed'
}
export type SourceRecord = {
  id: string
  revisionId: string
  metadata: SourceMetadata
  state: 'active' | 'trashed' | 'merged'
  replacementId: string | null
  verified: boolean
  provenance: string
  rawImport: string | null
  unknownFields: string[]
  aliases: string[]
  documentIds: string[]
  attachments: SourceAttachment[]
  createdAt: string
  updatedAt: string
}
export type SourceReport = {
  id: string
  format: BibliographyFormat
  imported: number
  skipped: number
  errors: string[]
  losses: string[]
  createdAt: string
}
export type SourcesView = { sources: SourceRecord[]; reports: SourceReport[]; headCommitId: string }
export type SourceChange =
  | {
      type: 'create'
      id: string
      metadata: SourceMetadata
      verified: boolean
      documentIds: string[]
    }
  | {
      type: 'update'
      id: string
      expectedRevisionId: string
      metadata: SourceMetadata
      verified: boolean
      documentIds: string[]
    }
  | { type: 'state'; id: string; expectedRevisionId: string; state: 'active' | 'trashed' }
  | { type: 'merge'; id: string; targetId: string; expectedRevisionId: string }
  | { type: 'removeAttachment'; id: string; attachmentId: string; expectedRevisionId: string }
export type SourceChangeInput = OpenInput & { operationId: string; change: SourceChange }
export type BibliographyFormat = 'csl-json' | 'bibtex' | 'ris'
export type SourcePick = { token: string; name: string }
export type SourceImportRow = {
  index: number
  metadata: SourceMetadata | null
  externalId: string
  unknownFields: string[]
  losses: string[]
  error: string | null
  candidates: { id: string; reason: string }[]
}
export type SourceImportPreview = {
  token: string
  digest: string
  format: BibliographyFormat
  rows: SourceImportRow[]
  count: number
}
export type SourceImportChoice = {
  index: number
  action: 'create' | 'merge' | 'link' | 'skip'
  targetId: string | null
}
export type SourcePreviewInput = OpenInput & { token: string }
export type SourceImportInput = OpenInput & {
  operationId: string
  token: string
  digest: string
  choices: SourceImportChoice[]
}
export type WorkerSourcePreview = SourcePreviewInput & {
  sourcePath: string
  format: BibliographyFormat
}
export type WorkerSourceImport = SourceImportInput & {
  sourcePath: string
  format: BibliographyFormat
}
export type SourceAttachmentInput = OpenInput & {
  operationId: string
  token: string
  sourceId: string
}
export type WorkerSourceAttachment = SourceAttachmentInput & {
  sourcePath: string
  originalName: string
}
export type SourceExportInput = OpenInput & {
  operationId: string
  format: BibliographyFormat
  sourceIds: string[]
}
export type WorkerSourceExport = SourceExportInput & { destinationPath: string }
export type SourceAttachmentExportInput = OpenInput & {
  attachmentId: string
  suggestedName: string
}
export type WorkerSourceAttachmentExport = SourceAttachmentExportInput & { destinationPath: string }
export type SourceExportReceipt = { path: string; count: number; losses: string[] }
export const SOURCE_PROGRESS = 'sources.attachmentProgress'
export type SourceProgress = { operationId: string; transferred: number; total: number }
export function isSourceProgress(v: unknown): v is SourceProgress {
  return (
    record(v) &&
    exact(v, ['operationId', 'transferred', 'total']) &&
    isId(v.operationId) &&
    Number.isSafeInteger(v.transferred) &&
    Number.isSafeInteger(v.total) &&
    Number(v.transferred) >= 0 &&
    Number(v.total) >= 0 &&
    Number(v.transferred) <= Number(v.total) &&
    Number(v.total) <= 1024 ** 3
  )
}

const str = (v: unknown, n: number): v is string =>
  typeof v === 'string' && v.length <= n && !hasControlCharacters(v)
const rawText = (v: unknown, n: number): v is string =>
  typeof v === 'string' && v.length <= n && !hasControlCharacters(v, true)
export function isSourceMetadata(v: unknown): v is SourceMetadata {
  return (
    record(v) &&
    exact(v, [
      'type',
      'title',
      'author',
      'issued',
      'containerTitle',
      'publisher',
      'edition',
      'volume',
      'issue',
      'page',
      'DOI',
      'URL',
      'ISBN',
      'ISSN'
    ]) &&
    SOURCE_TYPES.includes(v.type as SourceType) &&
    str(v.title, 2000) &&
    v.title.trim().length > 0 &&
    Array.isArray(v.author) &&
    v.author.length <= 100 &&
    v.author.every(
      (a: unknown) =>
        record(a) &&
        exact(a, ['family', 'given', 'literal']) &&
        str(a.family, 300) &&
        str(a.given, 300) &&
        str(a.literal, 600) &&
        (a.literal.trim() || a.family.trim())
    ) &&
    [
      'issued',
      'containerTitle',
      'publisher',
      'edition',
      'volume',
      'issue',
      'page',
      'DOI',
      'URL',
      'ISBN',
      'ISSN'
    ].every((k) => str(v[k], 2000))
  )
}
const ids = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(isId) && new Set(v).size === v.length
export function isSourceChangeInput(v: unknown): v is SourceChangeInput {
  if (
    !record(v) ||
    !isId(v.projectId) ||
    !isId(v.workspaceId) ||
    !isId(v.operationId) ||
    !record(v.change)
  )
    return false
  const c = v.change
  if (c.type === 'create')
    return (
      exact(c, ['type', 'id', 'metadata', 'verified', 'documentIds']) &&
      isId(c.id) &&
      isSourceMetadata(c.metadata) &&
      typeof c.verified === 'boolean' &&
      ids(c.documentIds, 10000)
    )
  if (c.type === 'update')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'metadata', 'verified', 'documentIds']) &&
      isId(c.id) &&
      isId(c.expectedRevisionId) &&
      isSourceMetadata(c.metadata) &&
      typeof c.verified === 'boolean' &&
      ids(c.documentIds, 10000)
    )
  if (c.type === 'state')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'state']) &&
      isId(c.id) &&
      isId(c.expectedRevisionId) &&
      ['active', 'trashed'].includes(String(c.state))
    )
  if (c.type === 'merge')
    return (
      exact(c, ['type', 'id', 'targetId', 'expectedRevisionId']) &&
      isId(c.id) &&
      isId(c.targetId) &&
      isId(c.expectedRevisionId) &&
      c.id !== c.targetId
    )
  if (c.type === 'removeAttachment')
    return (
      exact(c, ['type', 'id', 'attachmentId', 'expectedRevisionId']) &&
      isId(c.id) &&
      isId(c.attachmentId) &&
      isId(c.expectedRevisionId)
    )
  return false
}
export function isSourceScope(v: unknown): v is OpenInput {
  return (
    record(v) && exact(v, ['projectId', 'workspaceId']) && isId(v.projectId) && isId(v.workspaceId)
  )
}
export function isSourcePreviewInput(v: unknown): v is SourcePreviewInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'token']) &&
    [v.projectId, v.workspaceId, v.token].every(isId)
  )
}
export function isSourceImportInput(v: unknown): v is SourceImportInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'operationId', 'token', 'digest', 'choices']) &&
    [v.projectId, v.workspaceId, v.operationId, v.token].every(isId) &&
    typeof v.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(v.digest) &&
    Array.isArray(v.choices) &&
    v.choices.length <= 2000 &&
    v.choices.every(
      (c: unknown) =>
        record(c) &&
        exact(c, ['index', 'action', 'targetId']) &&
        Number.isSafeInteger(c.index) &&
        Number(c.index) >= 0 &&
        ['create', 'merge', 'link', 'skip'].includes(String(c.action)) &&
        (c.targetId === null || isId(c.targetId))
    )
  )
}
export function isSourceAttachmentInput(v: unknown): v is SourceAttachmentInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'operationId', 'token', 'sourceId']) &&
    [v.projectId, v.workspaceId, v.operationId, v.token, v.sourceId].every(isId)
  )
}
export function isSourceExportInput(v: unknown): v is SourceExportInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'operationId', 'format', 'sourceIds']) &&
    [v.projectId, v.workspaceId, v.operationId].every(isId) &&
    ['csl-json', 'bibtex', 'ris'].includes(String(v.format)) &&
    ids(v.sourceIds, 10000)
  )
}
export function isSourceAttachmentExportInput(v: unknown): v is SourceAttachmentExportInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'attachmentId', 'suggestedName']) &&
    [v.projectId, v.workspaceId, v.attachmentId].every(isId) &&
    str(v.suggestedName, 255) &&
    !!v.suggestedName &&
    !/[\\/:]/.test(v.suggestedName) &&
    /\.(pdf|png|jpe?g|txt)$/i.test(v.suggestedName)
  )
}
export function isSourcesView(v: unknown): v is SourcesView {
  return (
    record(v) &&
    exact(v, ['sources', 'reports', 'headCommitId']) &&
    isId(v.headCommitId) &&
    Array.isArray(v.sources) &&
    v.sources.length <= 100000 &&
    v.sources.every(
      (s: unknown) =>
        record(s) &&
        isId(s.id) &&
        isId(s.revisionId) &&
        isSourceMetadata(s.metadata) &&
        ['active', 'trashed', 'merged'].includes(String(s.state)) &&
        (s.replacementId === null || isId(s.replacementId)) &&
        typeof s.verified === 'boolean' &&
        str(s.provenance, 1000) &&
        (s.rawImport === null || rawText(s.rawImport, 300000)) &&
        Array.isArray(s.unknownFields) &&
        s.unknownFields.every((x: unknown) => str(x, 200)) &&
        Array.isArray(s.aliases) &&
        s.aliases.length <= 1000 &&
        s.aliases.every((x: unknown) => str(x, 500)) &&
        ids(s.documentIds, 10000) &&
        Array.isArray(s.attachments) &&
        s.attachments.length <= 1000 &&
        s.attachments.every(
          (a: unknown) =>
            record(a) &&
            isId(a.id) &&
            str(a.name, 255) &&
            str(a.mediaType, 100) &&
            Number.isSafeInteger(a.bytes) &&
            Number(a.bytes) >= 0 &&
            typeof a.sha256 === 'string' &&
            /^[a-f0-9]{64}$/.test(a.sha256) &&
            ['active', 'removed'].includes(String(a.state))
        ) &&
        str(s.createdAt, 40) &&
        str(s.updatedAt, 40)
    ) &&
    Array.isArray(v.reports) &&
    v.reports.length <= 1000 &&
    v.reports.every(
      (r: unknown) =>
        record(r) &&
        isId(r.id) &&
        ['csl-json', 'bibtex', 'ris'].includes(String(r.format)) &&
        Number.isSafeInteger(r.imported) &&
        Number.isSafeInteger(r.skipped) &&
        Array.isArray(r.errors) &&
        Array.isArray(r.losses) &&
        r.errors.every((x: unknown) => str(x, 2000)) &&
        r.losses.every((x: unknown) => str(x, 2000)) &&
        str(r.createdAt, 40)
    )
  )
}
export function isSourcePreview(v: unknown): v is SourceImportPreview {
  return (
    record(v) &&
    exact(v, ['token', 'digest', 'format', 'rows', 'count']) &&
    isId(v.token) &&
    typeof v.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(v.digest) &&
    ['csl-json', 'bibtex', 'ris'].includes(String(v.format)) &&
    Number.isSafeInteger(v.count) &&
    Array.isArray(v.rows) &&
    v.rows.length === v.count &&
    v.rows.length <= 2000 &&
    v.rows.every(
      (r: unknown, index: number) =>
        record(r) &&
        exact(r, [
          'index',
          'metadata',
          'externalId',
          'unknownFields',
          'losses',
          'error',
          'candidates'
        ]) &&
        r.index === index &&
        (r.metadata === null || isSourceMetadata(r.metadata)) &&
        str(r.externalId, 500) &&
        Array.isArray(r.unknownFields) &&
        r.unknownFields.length <= 20 &&
        r.unknownFields.every((x: unknown) => str(x, 200)) &&
        Array.isArray(r.losses) &&
        r.losses.length <= 20 &&
        r.losses.every((x: unknown) => str(x, 2000)) &&
        (r.error === null || str(r.error, 2000)) &&
        Array.isArray(r.candidates) &&
        r.candidates.length <= 12 &&
        r.candidates.every(
          (c: unknown) =>
            record(c) && exact(c, ['id', 'reason']) && isId(c.id) && str(c.reason, 200)
        )
    )
  )
}
