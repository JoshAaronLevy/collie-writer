import { hasControlCharacters } from './control-characters'
import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'

export type ExportOptions = OpenInput & {
  documentIds: string[]
  paper: 'Letter' | 'A4'
  titlePage: boolean
  includeDescription: boolean
}
export type ExportIssue = {
  kind: 'reference' | 'metadata' | 'asset' | 'content'
  documentId: string
  message: string
}
export type ExportPreview = {
  headCommitId: string
  digest: string
  style: 'apa' | 'chicago'
  paper: 'Letter' | 'A4'
  sections: { documentId: string; title: string; blocks: number }[]
  counts: {
    paragraphs: number
    tables: number
    images: number
    footnotes: number
    citations: number
    bibliography: number
  }
  issues: ExportIssue[]
  losses: string[]
}
export type ExportStartInput = ExportOptions & {
  expectedHead: string
  previewDigest: string
  acknowledgeMetadata: boolean
}
export type DestinationFingerprint = {
  dev: number
  ino: number
  size: number
  mtimeMs: number
  sha256: string
}
export type WorkerExportStart = ExportStartInput & {
  destinationPath: string
  destinationFingerprint: DestinationFingerprint | null
}
export type ExportFormat = 'docx' | 'pdf' | 'markdown' | 'text'
export type ExportFile = {
  format: ExportFormat
  path: string
  state: 'pending' | 'complete' | 'failed' | 'cancelled'
  error: string | null
  bytes: number | null
  pages: number | null
  losses: string[]
}
export type ExportBatchStartInput = ExportStartInput & { formats: ExportFormat[]; baseName: string }
export type WorkerExportBatchStart = ExportBatchStartInput & {
  destinations: { format: ExportFormat; path: string; fingerprint: DestinationFingerprint | null }[]
}
export type ExportJob = {
  id: string
  state: 'rendering' | 'publishing' | 'complete' | 'cancelled' | 'failed' | 'interrupted'
  headCommitId: string
  destinationPath: string
  phase: string
  error: string | null
  reportPath: string | null
  counts: ExportPreview['counts']
  losses: string[]
  files?: ExportFile[]
}
export type ExportJobInput = OpenInput & { jobId: string }

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]): boolean =>
  Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k))
export function isExportOptions(v: unknown): v is ExportOptions {
  return (
    object(v) &&
    keys(v, [
      'projectId',
      'workspaceId',
      'documentIds',
      'paper',
      'titlePage',
      'includeDescription'
    ]) &&
    isId(v.projectId) &&
    isId(v.workspaceId) &&
    typeof v.titlePage === 'boolean' &&
    typeof v.includeDescription === 'boolean' &&
    (v.paper === 'Letter' || v.paper === 'A4') &&
    Array.isArray(v.documentIds) &&
    v.documentIds.length > 0 &&
    v.documentIds.length <= 10000 &&
    v.documentIds.every(isId) &&
    new Set(v.documentIds).size === v.documentIds.length
  )
}
export function isExportStart(v: unknown): v is ExportStartInput {
  return (
    object(v) &&
    keys(v, [
      'projectId',
      'workspaceId',
      'documentIds',
      'paper',
      'titlePage',
      'includeDescription',
      'expectedHead',
      'previewDigest',
      'acknowledgeMetadata'
    ]) &&
    isExportOptions({
      projectId: v.projectId,
      workspaceId: v.workspaceId,
      documentIds: v.documentIds,
      paper: v.paper,
      titlePage: v.titlePage,
      includeDescription: v.includeDescription
    }) &&
    isId(v.expectedHead) &&
    typeof v.previewDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(v.previewDigest) &&
    typeof v.acknowledgeMetadata === 'boolean'
  )
}
export function isExportJobInput(v: unknown): v is ExportJobInput {
  return (
    object(v) &&
    keys(v, ['projectId', 'workspaceId', 'jobId']) &&
    [v.projectId, v.workspaceId, v.jobId].every(isId)
  )
}
export function isExportFormat(v: unknown): v is ExportFormat {
  return v === 'docx' || v === 'pdf' || v === 'markdown' || v === 'text'
}
export function isExportBatchStart(v: unknown): v is ExportBatchStartInput {
  if (
    !object(v) ||
    !keys(v, [
      'projectId',
      'workspaceId',
      'documentIds',
      'paper',
      'titlePage',
      'includeDescription',
      'expectedHead',
      'previewDigest',
      'acknowledgeMetadata',
      'formats',
      'baseName'
    ])
  )
    return false
  if (
    !isExportStart({
      projectId: v.projectId,
      workspaceId: v.workspaceId,
      documentIds: v.documentIds,
      paper: v.paper,
      titlePage: v.titlePage,
      includeDescription: v.includeDescription,
      expectedHead: v.expectedHead,
      previewDigest: v.previewDigest,
      acknowledgeMetadata: v.acknowledgeMetadata
    })
  )
    return false
  return (
    Array.isArray(v.formats) &&
    v.formats.length > 0 &&
    v.formats.length <= 4 &&
    v.formats.every(isExportFormat) &&
    new Set(v.formats).size === v.formats.length &&
    typeof v.baseName === 'string' &&
    v.baseName.length > 0 &&
    v.baseName.length <= 100 &&
    !hasControlCharacters(v.baseName) &&
    /^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/.test(v.baseName) &&
    !/[. ]$/.test(v.baseName) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(v.baseName)
  )
}
export function isWorkerExportBatchStart(v: unknown): v is WorkerExportBatchStart {
  if (
    !object(v) ||
    !keys(v, [
      'projectId',
      'workspaceId',
      'documentIds',
      'paper',
      'titlePage',
      'includeDescription',
      'expectedHead',
      'previewDigest',
      'acknowledgeMetadata',
      'formats',
      'baseName',
      'destinations'
    ]) ||
    !isExportBatchStart({
      projectId: v.projectId,
      workspaceId: v.workspaceId,
      documentIds: v.documentIds,
      paper: v.paper,
      titlePage: v.titlePage,
      includeDescription: v.includeDescription,
      expectedHead: v.expectedHead,
      previewDigest: v.previewDigest,
      acknowledgeMetadata: v.acknowledgeMetadata,
      formats: v.formats,
      baseName: v.baseName
    }) ||
    !Array.isArray(v.formats) ||
    !Array.isArray(v.destinations) ||
    v.destinations.length !== v.formats.length
  )
    return false
  const formats = v.formats
  return v.destinations.every(
    (d, i) =>
      object(d) &&
      keys(d, ['format', 'path', 'fingerprint']) &&
      d.format === formats[i] &&
      typeof d.path === 'string' &&
      d.path.length > 0 &&
      d.path.length <= 4096 &&
      isWorkerExportStart({
        projectId: v.projectId,
        workspaceId: v.workspaceId,
        documentIds: v.documentIds,
        paper: v.paper,
        titlePage: v.titlePage,
        includeDescription: v.includeDescription,
        expectedHead: v.expectedHead,
        previewDigest: v.previewDigest,
        acknowledgeMetadata: v.acknowledgeMetadata,
        destinationPath: d.path,
        destinationFingerprint: d.fingerprint
      })
  )
}
export function isWorkerExportStart(v: unknown): v is WorkerExportStart {
  if (
    !object(v) ||
    !keys(v, [
      'projectId',
      'workspaceId',
      'documentIds',
      'paper',
      'titlePage',
      'includeDescription',
      'expectedHead',
      'previewDigest',
      'acknowledgeMetadata',
      'destinationPath',
      'destinationFingerprint'
    ]) ||
    !isExportStart({
      projectId: v.projectId,
      workspaceId: v.workspaceId,
      documentIds: v.documentIds,
      paper: v.paper,
      titlePage: v.titlePage,
      includeDescription: v.includeDescription,
      expectedHead: v.expectedHead,
      previewDigest: v.previewDigest,
      acknowledgeMetadata: v.acknowledgeMetadata
    }) ||
    typeof v.destinationPath !== 'string' ||
    v.destinationPath.length > 4096
  )
    return false
  const f = v.destinationFingerprint
  return (
    f === null ||
    (object(f) &&
      keys(f, ['dev', 'ino', 'size', 'mtimeMs', 'sha256']) &&
      [f.dev, f.ino, f.size, f.mtimeMs].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0
      ) &&
      typeof f.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(f.sha256))
  )
}
export function isExportPreview(v: unknown): v is ExportPreview {
  return (
    object(v) &&
    keys(v, [
      'headCommitId',
      'digest',
      'style',
      'paper',
      'sections',
      'counts',
      'issues',
      'losses'
    ]) &&
    isId(v.headCommitId) &&
    typeof v.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(v.digest) &&
    ['apa', 'chicago'].includes(String(v.style)) &&
    ['Letter', 'A4'].includes(String(v.paper)) &&
    Array.isArray(v.sections) &&
    v.sections.length > 0 &&
    v.sections.length <= 10000 &&
    v.sections.every(
      (s) =>
        object(s) &&
        keys(s, ['documentId', 'title', 'blocks']) &&
        isId(s.documentId) &&
        typeof s.title === 'string' &&
        s.title.length <= 500 &&
        typeof s.blocks === 'number' &&
        Number.isSafeInteger(s.blocks) &&
        s.blocks >= 0
    ) &&
    isExportCounts(v.counts) &&
    Array.isArray(v.issues) &&
    v.issues.length <= 100000 &&
    v.issues.every(
      (i) =>
        object(i) &&
        keys(i, ['kind', 'documentId', 'message']) &&
        ['reference', 'metadata', 'asset', 'content'].includes(String(i.kind)) &&
        isId(i.documentId) &&
        typeof i.message === 'string' &&
        i.message.length <= 2000
    ) &&
    Array.isArray(v.losses) &&
    v.losses.length <= 10000 &&
    v.losses.every((x) => typeof x === 'string' && x.length <= 2000)
  )
}
function isExportCounts(v: unknown): v is ExportPreview['counts'] {
  return (
    object(v) &&
    keys(v, ['paragraphs', 'tables', 'images', 'footnotes', 'citations', 'bibliography']) &&
    Object.values(v).every((n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 1000000)
  )
}
export function isExportJob(v: unknown): v is ExportJob {
  return (
    object(v) &&
    (keys(v, [
      'id',
      'state',
      'headCommitId',
      'destinationPath',
      'phase',
      'error',
      'reportPath',
      'counts',
      'losses'
    ]) ||
      keys(v, [
        'id',
        'state',
        'headCommitId',
        'destinationPath',
        'phase',
        'error',
        'reportPath',
        'counts',
        'losses',
        'files'
      ])) &&
    isId(v.id) &&
    isId(v.headCommitId) &&
    ['rendering', 'publishing', 'complete', 'cancelled', 'failed', 'interrupted'].includes(
      String(v.state)
    ) &&
    typeof v.destinationPath === 'string' &&
    v.destinationPath.length <= 4096 &&
    typeof v.phase === 'string' &&
    v.phase.length <= 200 &&
    (v.error === null || (typeof v.error === 'string' && v.error.length <= 2000)) &&
    (v.reportPath === null || (typeof v.reportPath === 'string' && v.reportPath.length <= 4096)) &&
    isExportCounts(v.counts) &&
    Array.isArray(v.losses) &&
    v.losses.length <= 10000 &&
    v.losses.every((x) => typeof x === 'string' && x.length <= 2000) &&
    (v.files === undefined ||
      (Array.isArray(v.files) &&
        v.files.length <= 4 &&
        v.files.every(
          (f) =>
            object(f) &&
            keys(f, ['format', 'path', 'state', 'error', 'bytes', 'pages', 'losses']) &&
            isExportFormat(f.format) &&
            typeof f.path === 'string' &&
            f.path.length <= 4096 &&
            ['pending', 'complete', 'failed', 'cancelled'].includes(String(f.state)) &&
            (f.error === null || (typeof f.error === 'string' && f.error.length <= 2000)) &&
            (f.bytes === null || (Number.isSafeInteger(f.bytes) && Number(f.bytes) >= 0)) &&
            (f.pages === null || (Number.isSafeInteger(f.pages) && Number(f.pages) >= 0)) &&
            Array.isArray(f.losses) &&
            f.losses.every((l) => typeof l === 'string' && l.length <= 2000)
        )))
  )
}
