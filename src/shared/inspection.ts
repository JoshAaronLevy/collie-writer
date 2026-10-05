import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'
import { isSourceMetadata, type SourceMetadata } from './sources'

export const PDF_INSPECTION_LIMIT = 32 * 1024 * 1024
export const PDF_PAGE_LIMIT = 400
export const PDF_EXTRACTOR = 'pdfjs:6.3.289:text-v1'
export const TEXT_EXTRACTOR = 'utf8:text-v1'

export type InspectionStatus =
  | 'pending'
  | 'extracting'
  | 'indexed'
  | 'partial'
  | 'no_text'
  | 'failed'
  | 'password_required'
  | 'unsupported'
export type InspectedVersion = {
  id: string
  sourceId: string
  attachmentId: string
  sha256: string
  mediaType: 'application/pdf' | 'text/plain'
  metadata: SourceMetadata
  extractorVersion: string | null
  status: InspectionStatus
  documentTitle: string
  documentAuthor: string
  totalPages: number | null
  pagesProcessed: number
  pagesWithText: number
  revisionId: string
  createdAt: string
}
export type InspectedPage = {
  versionId: string
  index: number
  label: string | null
  state: 'text' | 'no_text' | 'failed'
  characters: number
  textHash: string
  error: string | null
}
export type SourceExcerpt = {
  id: string
  versionId: string
  pageIndex: number | null
  pageLabel: string | null
  representationHash: string | null
  startOffset: number | null
  endOffset: number | null
  quote: string
  contextBefore: string
  contextAfter: string
  kind: 'extracted' | 'transcription' | 'correction'
  label: string
  supersedesId: string | null
  createdAt: string
}
export type InspectionView = {
  sourceId: string
  activeVersionId: string | null
  versions: InspectedVersion[]
  pages: InspectedPage[]
  excerpts: SourceExcerpt[]
  headCommitId: string
}
export type InspectionPageText = {
  versionId: string
  pageIndex: number
  text: string
  textHash: string
}
export type InspectionAsset = {
  url: string
  bytes: number
  mediaType: 'application/pdf' | 'text/plain'
  sha256: string
}
export type WorkerInspectionAsset = Omit<InspectionAsset, 'url'> & { path: string }

export type InspectionScope = OpenInput & { sourceId: string }
export type InspectionPageInput = InspectionScope & { versionId: string; pageIndex: number }
export type InspectionAssetInput = InspectionScope & { versionId: string }
export type InspectionChange =
  | { type: 'ensure'; attachmentId: string }
  | { type: 'choose'; versionId: string; expectedRevisionId: string }
  | {
      type: 'start'
      versionId: string
      extractorVersion: string
      totalPages: number
      documentTitle: string
      documentAuthor: string
    }
  | {
      type: 'page'
      versionId: string
      pageIndex: number
      label: string | null
      state: 'text' | 'no_text' | 'failed'
      text: string
      error: string | null
    }
  | {
      type: 'finish'
      versionId: string
      outcome: 'done' | 'cancelled' | 'failed' | 'password_required' | 'unsupported'
    }
  | {
      type: 'excerpt'
      id: string
      versionId: string
      pageIndex: number | null
      kind: 'extracted' | 'transcription' | 'correction'
      quote: string
      startOffset: number | null
      endOffset: number | null
      label: string
      supersedesId: string | null
    }
export type InspectionChangeInput = InspectionScope & {
  operationId: string
  change: InspectionChange
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k))
const str = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const index = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 10000
const position = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000
const scope = (v: Record<string, unknown>): boolean =>
  isId(v.projectId) && isId(v.workspaceId) && isId(v.sourceId)
export function isInspectionScope(v: unknown): v is InspectionScope {
  return record(v) && exact(v, ['projectId', 'workspaceId', 'sourceId']) && scope(v)
}
export function isInspectionPageInput(v: unknown): v is InspectionPageInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'sourceId', 'versionId', 'pageIndex']) &&
    scope(v) &&
    isId(v.versionId) &&
    index(v.pageIndex)
  )
}
export function isInspectionAssetInput(v: unknown): v is InspectionAssetInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'sourceId', 'versionId']) &&
    scope(v) &&
    isId(v.versionId)
  )
}
export function isInspectionChangeInput(v: unknown): v is InspectionChangeInput {
  if (
    !record(v) ||
    !exact(v, ['projectId', 'workspaceId', 'sourceId', 'operationId', 'change']) ||
    !scope(v) ||
    !isId(v.operationId) ||
    !record(v.change)
  )
    return false
  const c = v.change
  if (c.type === 'ensure') return exact(c, ['type', 'attachmentId']) && isId(c.attachmentId)
  if (c.type === 'choose')
    return (
      exact(c, ['type', 'versionId', 'expectedRevisionId']) &&
      isId(c.versionId) &&
      isId(c.expectedRevisionId)
    )
  if (c.type === 'start')
    return (
      exact(c, [
        'type',
        'versionId',
        'extractorVersion',
        'totalPages',
        'documentTitle',
        'documentAuthor'
      ]) &&
      isId(c.versionId) &&
      [PDF_EXTRACTOR, TEXT_EXTRACTOR].includes(String(c.extractorVersion)) &&
      index(c.totalPages) &&
      str(c.documentTitle, 500) &&
      str(c.documentAuthor, 500)
    )
  if (c.type === 'page')
    return (
      exact(c, ['type', 'versionId', 'pageIndex', 'label', 'state', 'text', 'error']) &&
      isId(c.versionId) &&
      index(c.pageIndex) &&
      (c.label === null || str(c.label, 100)) &&
      ['text', 'no_text', 'failed'].includes(String(c.state)) &&
      str(c.text, 100000) &&
      (c.error === null || str(c.error, 500))
    )
  if (c.type === 'finish')
    return (
      exact(c, ['type', 'versionId', 'outcome']) &&
      isId(c.versionId) &&
      ['done', 'cancelled', 'failed', 'password_required', 'unsupported'].includes(
        String(c.outcome)
      )
    )
  if (c.type === 'excerpt')
    return (
      exact(c, [
        'type',
        'id',
        'versionId',
        'pageIndex',
        'kind',
        'quote',
        'startOffset',
        'endOffset',
        'label',
        'supersedesId'
      ]) &&
      isId(c.id) &&
      isId(c.versionId) &&
      (c.pageIndex === null || index(c.pageIndex)) &&
      ['extracted', 'transcription', 'correction'].includes(String(c.kind)) &&
      str(c.quote, 10000) &&
      c.quote.trim().length > 0 &&
      (c.startOffset === null || position(c.startOffset)) &&
      (c.endOffset === null || position(c.endOffset)) &&
      str(c.label, 200) &&
      (c.supersedesId === null || isId(c.supersedesId))
    )
  return false
}
export function isInspectionView(v: unknown): v is InspectionView {
  return (
    record(v) &&
    exact(v, ['sourceId', 'activeVersionId', 'versions', 'pages', 'excerpts', 'headCommitId']) &&
    isId(v.sourceId) &&
    isId(v.headCommitId) &&
    (v.activeVersionId === null || isId(v.activeVersionId)) &&
    Array.isArray(v.versions) &&
    v.versions.length <= 1000 &&
    v.versions.every(
      (x: unknown) =>
        record(x) &&
        exact(x, [
          'id',
          'sourceId',
          'attachmentId',
          'sha256',
          'mediaType',
          'metadata',
          'extractorVersion',
          'status',
          'documentTitle',
          'documentAuthor',
          'totalPages',
          'pagesProcessed',
          'pagesWithText',
          'revisionId',
          'createdAt'
        ]) &&
        [x.id, x.sourceId, x.attachmentId, x.revisionId].every(isId) &&
        hash(x.sha256) &&
        ['application/pdf', 'text/plain'].includes(String(x.mediaType)) &&
        isSourceMetadata(x.metadata) &&
        (x.extractorVersion === null ||
          [PDF_EXTRACTOR, TEXT_EXTRACTOR].includes(String(x.extractorVersion))) &&
        [
          'pending',
          'extracting',
          'indexed',
          'partial',
          'no_text',
          'failed',
          'password_required',
          'unsupported'
        ].includes(String(x.status)) &&
        str(x.documentTitle, 500) &&
        str(x.documentAuthor, 500) &&
        (x.totalPages === null || index(x.totalPages)) &&
        index(x.pagesProcessed) &&
        index(x.pagesWithText) &&
        str(x.createdAt, 40)
    ) &&
    Array.isArray(v.pages) &&
    v.pages.length <= 400000 &&
    v.pages.every(
      (x: unknown) =>
        record(x) &&
        exact(x, ['versionId', 'index', 'label', 'state', 'characters', 'textHash', 'error']) &&
        isId(x.versionId) &&
        index(x.index) &&
        (x.label === null || str(x.label, 100)) &&
        ['text', 'no_text', 'failed'].includes(String(x.state)) &&
        position(x.characters) &&
        hash(x.textHash) &&
        (x.error === null || str(x.error, 500))
    ) &&
    Array.isArray(v.excerpts) &&
    v.excerpts.length <= 20000 &&
    v.excerpts.every(
      (x: unknown) =>
        record(x) &&
        exact(x, [
          'id',
          'versionId',
          'pageIndex',
          'pageLabel',
          'representationHash',
          'startOffset',
          'endOffset',
          'quote',
          'contextBefore',
          'contextAfter',
          'kind',
          'label',
          'supersedesId',
          'createdAt'
        ]) &&
        isId(x.id) &&
        isId(x.versionId) &&
        (x.pageIndex === null || index(x.pageIndex)) &&
        (x.pageLabel === null || str(x.pageLabel, 100)) &&
        (x.representationHash === null || hash(x.representationHash)) &&
        (x.startOffset === null || position(x.startOffset)) &&
        (x.endOffset === null || position(x.endOffset)) &&
        str(x.quote, 10000) &&
        str(x.contextBefore, 200) &&
        str(x.contextAfter, 200) &&
        ['extracted', 'transcription', 'correction'].includes(String(x.kind)) &&
        str(x.label, 200) &&
        (x.supersedesId === null || isId(x.supersedesId)) &&
        str(x.createdAt, 40)
    )
  )
}
export function isInspectionPageText(v: unknown): v is InspectionPageText {
  return (
    record(v) &&
    exact(v, ['versionId', 'pageIndex', 'text', 'textHash']) &&
    isId(v.versionId) &&
    index(v.pageIndex) &&
    str(v.text, 100000) &&
    hash(v.textHash)
  )
}
export function isInspectionAsset(v: unknown): v is InspectionAsset {
  return (
    record(v) &&
    exact(v, ['url', 'bytes', 'mediaType', 'sha256']) &&
    typeof v.url === 'string' &&
    /^collie-source:\/\/asset\/[a-f0-9-]{36}$/.test(v.url) &&
    Number.isSafeInteger(v.bytes) &&
    Number(v.bytes) > 0 &&
    Number(v.bytes) <= PDF_INSPECTION_LIMIT &&
    ['application/pdf', 'text/plain'].includes(String(v.mediaType)) &&
    hash(v.sha256)
  )
}
