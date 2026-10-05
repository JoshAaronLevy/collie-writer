import { hasControlCharacters } from './control-characters'
import {
  isProofreadWorkerInput,
  isProofreadValue,
  type ProofreadWorkerInput,
  type ProofreadValue
} from './proofreading'
import {
  isConversationWorkerInput,
  isConversationValue,
  type ConversationWorkerInput,
  type ConversationValue
} from './conversations'
import {
  projectText,
  requiredProjectName,
  storedProjectTitle,
  type ProjectDetails
} from '../domain/projects/details'
import {
  isCitationStyleInput,
  isCitationsView,
  type CitationStyleInput,
  type CitationsView
} from './citations'
import {
  isOutlineInput,
  isOutlineDocument,
  isHistoryInput,
  isHistoryView,
  type OutlineDocument,
  type OutlineInput,
  type HistoryInput,
  type HistoryView
} from './outline'
import {
  isRenameInput,
  isArchiveInput,
  isDataLocations,
  isResetInput,
  type RenameInput,
  type ArchiveInput,
  type DataLocations,
  type ResetInput
} from './project-lifecycle'
import { isId, readDocument, type DocumentPayload } from '../domain/editor/schema'
import { isNoteChangeInput, isNotesView, type NoteChangeInput, type NotesView } from './notes'
import {
  isProjectKind,
  kindForTemplate,
  isProjectTemplate,
  type ProjectKind,
  type ProjectTemplate
} from '../domain/projects/templates'
import {
  isSourceChangeInput,
  isSourcePreviewInput,
  isSourceImportInput,
  isSourceAttachmentInput,
  isSourceExportInput,
  isSourceAttachmentExportInput,
  isSourcesView,
  isSourcePreview,
  type SourceChangeInput,
  type SourcesView,
  type SourcePick,
  type SourcePreviewInput,
  type SourceImportInput,
  type SourceImportPreview,
  type SourceAttachmentInput,
  type SourceExportInput,
  type SourceExportReceipt,
  type SourceAttachmentExportInput,
  type SourceProgress,
  type WorkerSourcePreview,
  type WorkerSourceImport,
  type WorkerSourceAttachment,
  type WorkerSourceExport,
  type WorkerSourceAttachmentExport
} from './sources'
import {
  isInspectionScope,
  isInspectionPageInput,
  isInspectionAssetInput,
  isInspectionChangeInput,
  isInspectionView,
  isInspectionPageText,
  type InspectionScope,
  type InspectionPageInput,
  type InspectionAssetInput,
  type InspectionChangeInput,
  type InspectionView,
  type InspectionPageText,
  type InspectionAsset,
  type WorkerInspectionAsset
} from './inspection'
import {
  isEvidenceChangeInput,
  isEvidenceView,
  type EvidenceChangeInput,
  type EvidenceView
} from './evidence'
import {
  isSearchActionInput,
  isSearchInput,
  isSearchView,
  isSearchActivity,
  type SearchInput,
  type SearchActionInput,
  type SearchView,
  type SearchActivity
} from './search'
import {
  isExportOptions,
  isWorkerExportStart,
  isWorkerExportBatchStart,
  isExportJobInput,
  isExportPreview,
  isExportJob,
  type ExportOptions,
  type ExportStartInput,
  type WorkerExportStart,
  type ExportBatchStartInput,
  type WorkerExportBatchStart,
  type ExportJobInput,
  type ExportPreview,
  type ExportJob
} from './exports'
import {
  isRecipeChange,
  isRecipesView,
  isWorkerImportPreview,
  isWorkerImportCommit,
  isImportPreview,
  type RecipeChangeInput,
  type RecipesView,
  type ImportPick,
  type ImportPreviewInput,
  type ImportCommitInput,
  type WorkerImportPreview,
  type WorkerImportCommit,
  type ImportPreview
} from './interchange'

export const PROJECT_CHANNELS = {
  exportPreview: 'export.docx.preview',
  exportStart: 'export.docx.start',
  exportStatus: 'export.docx.status',
  exportCancel: 'export.docx.cancel',
  exportBatchStart: 'export.batch.start',
  recipes: 'compilation.recipes',
  recipeChange: 'compilation.recipeChange',
  interchangePick: 'interchange.pick',
  interchangePreview: 'interchange.preview',
  interchangeCommit: 'interchange.commit',
  citations: 'citations.read',
  citationStyle: 'citations.style',
  outline: 'outline.change',
  history: 'history.read',
  notes: 'notes.read',
  noteChange: 'notes.change',
  location: 'projects.location',
  chooseLocation: 'projects.chooseLocation',
  rename: 'projects.rename',
  archive: 'projects.archive',
  data: 'projects.data',
  reset: 'projects.reset',
  recoverReset: 'projects.recoverReset',
  cleanup: 'projects.cleanup',
  list: 'projects.list',
  create: 'projects.create',
  open: 'projects.open',
  section: 'projects.section',
  details: 'projects.details',
  meta: 'projects.sectionMeta',
  commit: 'document.commit',
  plainClipboard: 'document.plainClipboard',
  pickImage: 'images.pick',
  importImage: 'images.import',
  readImage: 'images.read',
  sources: 'sources.read',
  sourceChange: 'sources.change',
  sourcePickImport: 'sources.pickImport',
  sourcePreview: 'sources.preview',
  sourceImport: 'sources.import',
  sourcePickAttachment: 'sources.pickAttachment',
  sourcePickVersion: 'sources.pickVersion',
  sourceAttach: 'sources.attach',
  sourceExport: 'sources.export',
  sourceExportAttachment: 'sources.exportAttachment',
  inspection: 'inspection.read',
  inspectionPage: 'inspection.page',
  inspectionAsset: 'inspection.asset',
  inspectionChange: 'inspection.change',
  evidence: 'evidence.read',
  evidenceChange: 'evidence.change',
  search: 'search.query',
  searchActivity: 'search.activity',
  searchAction: 'search.action'
} as const
export type ProjectCode =
  | 'VALIDATION'
  | 'DENIED'
  | 'UNAVAILABLE'
  | 'STORAGE_LOCATION_REQUIRED'
  | 'PROJECT_LOCKED'
  | 'STALE_REVISION'
  | 'OPERATION_CONFLICT'
  | 'DISK_FULL'
  | 'FORMAT_TOO_NEW'
  | 'CORRUPT_PROJECT'
  | 'MIGRATION_FAILED'
  | 'NOT_FOUND'
  | 'CANCELLED'
  | 'EXTERNAL_CHANGE'
  | 'DESTINATION_UNAVAILABLE'
  | 'UNSAFE_DESTINATION'
  | 'JOB_INTERRUPTED'
  | 'INVALID_ARCHIVE'
  | 'LIMIT_EXCEEDED'
  | 'DESTINATION_EXISTS'
  | 'READ_ONLY_PROJECT'
  | 'PAID_CAPABILITY'
  | 'ACCESS_TRANSITION'
  | 'ACCESS_BUSY'
  | 'ACCESS_SETTINGS'
  | 'INVALID_GRANT'
  | 'STALE_GRANT'
  | 'ISSUER_UNCONFIGURED'
export const projectMessages: Record<ProjectCode, string> = {
  READ_ONLY_PROJECT:
    'This project is available for reading, export and backup. Choose it as your free editable project to make changes.',
  PAID_CAPABILITY:
    'Creating or editing named recipes and exporting several formats together require paid access. Individual formats and existing recipes remain available.',
  ACCESS_TRANSITION:
    'Protect pending input and finish the access change before switching projects. All stored work remains available.',
  ACCESS_BUSY: 'Finish protecting pending input and wait for current work before changing access.',
  ACCESS_SETTINGS:
    'Access settings could not be read safely. Their original files were kept. Reading, export and recovery remain available; contact support to restore access settings.',
  INVALID_GRANT:
    'This access document could not be authenticated for this edition. Existing access and projects were kept.',
  STALE_GRANT:
    'A newer signed access decision is already stored. This older document cannot replace it.',
  ISSUER_UNCONFIGURED:
    'Signed access is not configured in this build. Free access has no time limit.',
  VALIDATION: 'This document or request is not supported. Your current text has been kept.',
  DENIED: 'Access to local storage was denied. Your current text has been kept.',
  UNAVAILABLE: 'Local storage is unavailable. Keep this window open and copy any unprotected text.',
  STORAGE_LOCATION_REQUIRED:
    'Choose a device-local working folder outside cloud sync and network storage.',
  PROJECT_LOCKED:
    'This project is already owned by another process. Close that copy before reopening.',
  STALE_REVISION:
    'The document changed since it was opened. Your text is kept; copy it before reopening the stored version.',
  OPERATION_CONFLICT:
    'This operation ID was already used for different content. Your text has been kept.',
  DISK_FULL:
    'The disk is full. Free space, then retry the same local commit; your text is still here.',
  FORMAT_TOO_NEW: 'This project needs a newer Collie Writer. Its files have not been migrated.',
  CORRUPT_PROJECT:
    'This local project could not be read safely. Its original files have been retained.',
  MIGRATION_FAILED:
    'The migration could not finish. The original and any migration copies have been retained.',
  NOT_FOUND: 'This local project could not be found. Its files have not been removed.',
  CANCELLED:
    'The file operation was cancelled. Local writing and existing destinations have been kept.',
  EXTERNAL_CHANGE:
    'The selected file differs from the saved version or changed during the file operation. Your local writing is kept. Save writes your local version; you can also inspect the file.',
  DESTINATION_UNAVAILABLE:
    'The selected file cannot be reached. Retry, locate the moved file, or use Save As. Local recovery remains here.',
  UNSAFE_DESTINATION:
    'This location cannot support the selected-file save safely. Choose a local APFS/HFS+ or fixed NTFS/ReFS folder, including a local cloud-sync folder.',
  JOB_INTERRUPTED:
    'An interrupted file operation needs inspection. Retained candidates and previous files have not been removed. Use Save As to preserve another copy.',
  INVALID_ARCHIVE:
    'This file is not a supported, intact Collie Writer project. The original has been kept.',
  DESTINATION_EXISTS:
    'Backup and Move need a new, unused filename. The existing file and current save location have been kept.',
  LIMIT_EXCEEDED:
    'This file exceeds the supported size or resource limits. The original and local work have been kept.'
}
export type ProjectResult<T> =
  | { ok: true; requestId: string; value: T }
  | {
      ok: false
      requestId: string
      error: { code: ProjectCode; message: string; retryable: boolean }
    }
export type LocationStatus = { state: 'ready' | 'required'; path: string | null; message: string }
export type DestinationView = {
  path: string
  snapshotId: string
  headCommitId: string
  generationId: string
}
export type ProjectSummary = {
  projectId: string
  workspaceId: string
  title: string
  projectKind: ProjectKind
  headCommitId: string
  updatedAt: string
  archived: boolean
  destination: DestinationView | null
}
export type ProjectList = {
  projects: ProjectSummary[]
  issues: { projectId: string; code: ProjectCode }[]
}
export type DocumentSummary = OutlineDocument
export type OpenProject = ProjectSummary & {
  byline: string
  description: string
  detailsRevisionId: string
  template: ProjectTemplate
  documents: DocumentSummary[]
  documentId: string
  revisionId: string
  payload: DocumentPayload
}
export type CreateInput = {
  operationId: string
  template: ProjectTemplate
  title: string
  byline: string
  description: string
}
export type ProjectDetailsInput = OpenInput &
  ProjectDetails & { operationId: string; expectedHead: string; expectedRevisionId: string }
export type OpenInput = { projectId: string; workspaceId: string }
export type SectionInput = OpenInput & { documentId: string }
export type SectionMetaInput = SectionInput & {
  operationId: string
  expectedHead: string
  title: string
  status: 'draft' | 'review' | 'complete'
  synopsis: string
}
export type CommitInput = OpenInput & {
  operationId: string
  documentId: string
  expectedRevisionId: string
  payload: DocumentPayload
}
export type CommitReceipt = {
  projectId: string
  documentId: string
  revisionId: string
  headCommitId: string
}
export type ImagePick = { token: string; name: string }
export type ImageImportInput = OpenInput & { operationId: string; token: string }
export type WorkerImageImport = OpenInput & {
  operationId: string
  sourcePath: string
  originalName: string
}
export type ImageReadInput = OpenInput & { assetId: string }
export type ImageAsset = {
  assetId: string
  mediaType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}
export type ImageData = { mediaType: ImageAsset['mediaType']; base64: string }
export type ProjectCommand =
  | { kind: 'proofreading'; input: ProofreadWorkerInput }
  | { kind: 'conversation'; input: ConversationWorkerInput }
  | { kind: 'details'; input: ProjectDetailsInput }
  | { kind: 'exportPreview'; input: ExportOptions }
  | { kind: 'exportStart'; input: WorkerExportStart }
  | { kind: 'exportBatchStart'; input: WorkerExportBatchStart }
  | { kind: 'exportStatus' | 'exportCancel'; input: ExportJobInput }
  | { kind: 'recipes'; input: OpenInput }
  | { kind: 'recipeChange'; input: RecipeChangeInput }
  | { kind: 'interchangePreview'; input: WorkerImportPreview }
  | { kind: 'interchangeCommit'; input: WorkerImportCommit }
  | { kind: 'citationStyle'; input: CitationStyleInput }
  | { kind: 'notes' | 'sources' | 'evidence' | 'searchActivity' | 'citations'; input: OpenInput }
  | { kind: 'search'; input: SearchInput }
  | { kind: 'searchAction'; input: SearchActionInput }
  | { kind: 'evidenceChange'; input: EvidenceChangeInput }
  | { kind: 'inspection'; input: InspectionScope }
  | { kind: 'inspectionPage'; input: InspectionPageInput }
  | { kind: 'inspectionAsset'; input: InspectionAssetInput }
  | { kind: 'inspectionChange'; input: InspectionChangeInput }
  | { kind: 'noteChange'; input: NoteChangeInput }
  | { kind: 'sourceChange'; input: SourceChangeInput }
  | { kind: 'sourcePreview'; input: WorkerSourcePreview }
  | { kind: 'sourceImport'; input: WorkerSourceImport }
  | { kind: 'sourceAttach'; input: WorkerSourceAttachment }
  | { kind: 'sourceExport'; input: WorkerSourceExport }
  | { kind: 'sourceExportAttachment'; input: WorkerSourceAttachmentExport }
  | { kind: 'outline'; input: OutlineInput }
  | { kind: 'history'; input: HistoryInput }
  | { kind: 'rename'; input: RenameInput }
  | { kind: 'archive'; input: ArchiveInput }
  | { kind: 'data' | 'cleanup' }
  | { kind: 'reset'; input: ResetInput }
  | { kind: 'recoverReset'; input: string }
  | { kind: 'list' }
  | { kind: 'create'; input: CreateInput }
  | { kind: 'open'; input: OpenInput }
  | { kind: 'section'; input: SectionInput }
  | { kind: 'meta'; input: SectionMetaInput }
  | { kind: 'commit'; input: CommitInput }
  | { kind: 'importImage'; input: WorkerImageImport }
  | { kind: 'readImage'; input: ImageReadInput }
export type ProjectValue =
  | ProofreadValue
  | ConversationValue
  | CitationsView
  | ProjectList
  | OpenProject
  | CommitReceipt
  | DataLocations
  | ImageAsset
  | ImageData
  | HistoryView
  | NotesView
  | SourcesView
  | SourceImportPreview
  | SourceExportReceipt
  | InspectionView
  | InspectionPageText
  | WorkerInspectionAsset
  | EvidenceView
  | SearchView
  | SearchActivity
  | ExportPreview
  | ExportJob
  | RecipesView
  | ImportPreview
export type ProjectAPI = {
  updateProjectDetails: (input: ProjectDetailsInput) => Promise<ProjectResult<OpenProject>>
  previewDocx: (input: ExportOptions) => Promise<ProjectResult<ExportPreview>>
  startDocx: (input: ExportStartInput) => Promise<ProjectResult<ExportJob>>
  docxStatus: (input: ExportJobInput) => Promise<ProjectResult<ExportJob>>
  cancelDocx: (input: ExportJobInput) => Promise<ProjectResult<ExportJob>>
  startCompilation: (input: ExportBatchStartInput) => Promise<ProjectResult<ExportJob>>
  readRecipes: (input: OpenInput) => Promise<ProjectResult<RecipesView>>
  changeRecipe: (input: RecipeChangeInput) => Promise<ProjectResult<RecipesView>>
  pickInterchange: (input: OpenInput) => Promise<ProjectResult<ImportPick | null>>
  previewInterchange: (input: ImportPreviewInput) => Promise<ProjectResult<ImportPreview>>
  importInterchange: (input: ImportCommitInput) => Promise<ProjectResult<OpenProject>>
  readCitations: (input: OpenInput) => Promise<ProjectResult<CitationsView>>
  changeCitationStyle: (input: CitationStyleInput) => Promise<ProjectResult<CitationsView>>
  search: (input: SearchInput) => Promise<ProjectResult<SearchView>>
  readSearchActivity: (input: OpenInput) => Promise<ProjectResult<SearchActivity>>
  changeSearch: (input: SearchActionInput) => Promise<ProjectResult<SearchActivity>>
  readEvidence: (input: OpenInput) => Promise<ProjectResult<EvidenceView>>
  changeEvidence: (input: EvidenceChangeInput) => Promise<ProjectResult<EvidenceView>>
  readInspection: (input: InspectionScope) => Promise<ProjectResult<InspectionView>>
  readInspectedPage: (input: InspectionPageInput) => Promise<ProjectResult<InspectionPageText>>
  openInspectedAsset: (input: InspectionAssetInput) => Promise<ProjectResult<InspectionAsset>>
  changeInspection: (input: InspectionChangeInput) => Promise<ProjectResult<InspectionView>>
  readSources: (input: OpenInput) => Promise<ProjectResult<SourcesView>>
  changeSource: (input: SourceChangeInput) => Promise<ProjectResult<SourcesView>>
  pickSourceImport: (input: OpenInput) => Promise<ProjectResult<SourcePick | null>>
  previewSourceImport: (input: SourcePreviewInput) => Promise<ProjectResult<SourceImportPreview>>
  commitSourceImport: (input: SourceImportInput) => Promise<ProjectResult<SourcesView>>
  pickSourceAttachment: (input: OpenInput) => Promise<ProjectResult<SourcePick | null>>
  pickSourceVersion: (input: OpenInput) => Promise<ProjectResult<SourcePick | null>>
  attachSourceFile: (input: SourceAttachmentInput) => Promise<ProjectResult<SourcesView>>
  exportSources: (input: SourceExportInput) => Promise<ProjectResult<SourceExportReceipt>>
  exportSourceAttachment: (
    input: SourceAttachmentExportInput
  ) => Promise<ProjectResult<SourceExportReceipt>>
  onSourceProgress: (callback: (progress: SourceProgress) => void) => () => void
  readNotes: (input: OpenInput) => Promise<ProjectResult<NotesView>>
  changeNote: (input: NoteChangeInput) => Promise<ProjectResult<NotesView>>
  changeOutline: (input: OutlineInput) => Promise<ProjectResult<OpenProject>>
  readHistory: (input: HistoryInput) => Promise<ProjectResult<HistoryView>>
  getWorkingLocation: () => Promise<ProjectResult<LocationStatus>>
  chooseWorkingLocation: () => Promise<ProjectResult<LocationStatus>>
  listProjects: () => Promise<ProjectResult<ProjectList>>
  createProject: (input: CreateInput) => Promise<ProjectResult<OpenProject>>
  openProject: (input: OpenInput) => Promise<ProjectResult<OpenProject>>
  openSection: (input: SectionInput) => Promise<ProjectResult<OpenProject>>
  updateSectionMeta: (input: SectionMetaInput) => Promise<ProjectResult<OpenProject>>
  commitDocument: (input: CommitInput) => Promise<ProjectResult<CommitReceipt>>
  pickImage: (scope: OpenInput) => Promise<ProjectResult<ImagePick | null>>
  importImage: (input: ImageImportInput) => Promise<ProjectResult<ImageAsset>>
  readImage: (input: ImageReadInput) => Promise<ProjectResult<ImageData>>
  readPlainClipboard: () => Promise<ProjectResult<string>>
  setUnprotectedChanges: (dirty: boolean) => void
}
export const DIRTY_CHANGED = 'document.unprotectedChanges'
export function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
export function exact(v: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k))
}
export function isProjectCode(v: unknown): v is ProjectCode {
  return typeof v === 'string' && Object.hasOwn(projectMessages, v)
}
export function projectFailure(requestId: string, code: ProjectCode): ProjectResult<never> {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message: projectMessages[code],
      retryable: ['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(code)
    }
  }
}
export function isOpenInput(v: unknown): v is OpenInput {
  return (
    record(v) && exact(v, ['projectId', 'workspaceId']) && isId(v.projectId) && isId(v.workspaceId)
  )
}
export function isCreateInput(v: unknown): v is CreateInput {
  return (
    record(v) &&
    exact(v, ['operationId', 'template', 'title', 'byline', 'description']) &&
    isId(v.operationId) &&
    isProjectTemplate(v.template) &&
    requiredProjectName(v.title) &&
    requiredProjectName(v.byline) &&
    projectText(v.description, 10000)
  )
}
export function isProjectDetailsInput(v: unknown): v is ProjectDetailsInput {
  return (
    record(v) &&
    exact(v, [
      'projectId',
      'workspaceId',
      'operationId',
      'expectedHead',
      'expectedRevisionId',
      'title',
      'byline',
      'description',
      'projectKind'
    ]) &&
    [v.projectId, v.workspaceId, v.operationId, v.expectedHead, v.expectedRevisionId].every(isId) &&
    storedProjectTitle(v.title) &&
    (v.byline === '' || requiredProjectName(v.byline)) &&
    projectText(v.description, 10000) &&
    isProjectKind(v.projectKind)
  )
}
export function isSectionInput(v: unknown): v is SectionInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'documentId']) &&
    [v.projectId, v.workspaceId, v.documentId].every(isId)
  )
}
export function isSectionMetaInput(v: unknown): v is SectionMetaInput {
  return (
    record(v) &&
    exact(v, [
      'projectId',
      'workspaceId',
      'documentId',
      'operationId',
      'expectedHead',
      'title',
      'status',
      'synopsis'
    ]) &&
    [v.projectId, v.workspaceId, v.documentId, v.operationId, v.expectedHead].every(isId) &&
    typeof v.title === 'string' &&
    v.title.trim().length > 0 &&
    v.title.length <= 500 &&
    !hasControlCharacters(v.title, true) &&
    ['draft', 'review', 'complete'].includes(String(v.status)) &&
    typeof v.synopsis === 'string' &&
    v.synopsis.length <= 10000 &&
    !hasControlCharacters(v.synopsis, true)
  )
}
export function isImageImportInput(v: unknown): v is ImageImportInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'operationId', 'token']) &&
    [v.projectId, v.workspaceId, v.operationId, v.token].every(isId)
  )
}
export function isWorkerImageImport(v: unknown): v is WorkerImageImport {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'operationId', 'sourcePath', 'originalName']) &&
    [v.projectId, v.workspaceId, v.operationId].every(isId) &&
    typeof v.sourcePath === 'string' &&
    v.sourcePath.length > 0 &&
    v.sourcePath.length <= 4096 &&
    typeof v.originalName === 'string' &&
    v.originalName.length <= 255 &&
    !(hasControlCharacters(v.originalName) || /[\\/:]/u.test(v.originalName))
  )
}
export function isImageReadInput(v: unknown): v is ImageReadInput {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'assetId']) &&
    [v.projectId, v.workspaceId, v.assetId].every(isId)
  )
}
export function isCommitInput(v: unknown): v is CommitInput {
  if (
    !record(v) ||
    !exact(v, [
      'projectId',
      'workspaceId',
      'operationId',
      'documentId',
      'expectedRevisionId',
      'payload'
    ]) ||
    ![v.projectId, v.workspaceId, v.operationId, v.documentId, v.expectedRevisionId].every(isId)
  )
    return false
  try {
    readDocument(v.payload)
    return true
  } catch {
    return false
  }
}
export function isProjectCommand(v: unknown): v is ProjectCommand {
  if (!record(v)) return false
  if (['list', 'data', 'cleanup'].includes(String(v.kind))) return exact(v, ['kind'])
  if (!exact(v, ['kind', 'input'])) return false
  if (v.kind === 'proofreading') return isProofreadWorkerInput(v.input)
  if (v.kind === 'conversation') return isConversationWorkerInput(v.input)
  if (v.kind === 'exportPreview') return isExportOptions(v.input)
  if (v.kind === 'exportStart') return isWorkerExportStart(v.input)
  if (v.kind === 'exportBatchStart') return isWorkerExportBatchStart(v.input)
  if (v.kind === 'exportStatus' || v.kind === 'exportCancel') return isExportJobInput(v.input)
  if (v.kind === 'recipes') return isOpenInput(v.input)
  if (v.kind === 'recipeChange') return isRecipeChange(v.input)
  if (v.kind === 'interchangePreview') return isWorkerImportPreview(v.input)
  if (v.kind === 'interchangeCommit') return isWorkerImportCommit(v.input)
  if (v.kind === 'citations') return isOpenInput(v.input)
  if (v.kind === 'citationStyle') return isCitationStyleInput(v.input)
  if (v.kind === 'outline') return isOutlineInput(v.input)
  if (v.kind === 'history') return isHistoryInput(v.input)
  if (v.kind === 'notes') return isOpenInput(v.input)
  if (v.kind === 'sources' || v.kind === 'evidence' || v.kind === 'searchActivity')
    return isOpenInput(v.input)
  if (v.kind === 'search') return isSearchInput(v.input)
  if (v.kind === 'searchAction') return isSearchActionInput(v.input)
  if (v.kind === 'evidenceChange') return isEvidenceChangeInput(v.input)
  if (v.kind === 'inspection') return isInspectionScope(v.input)
  if (v.kind === 'inspectionPage') return isInspectionPageInput(v.input)
  if (v.kind === 'inspectionAsset') return isInspectionAssetInput(v.input)
  if (v.kind === 'inspectionChange') return isInspectionChangeInput(v.input)
  if (v.kind === 'sourceChange') return isSourceChangeInput(v.input)
  if (v.kind === 'sourcePreview')
    return (
      record(v.input) &&
      isSourcePreviewInput({
        projectId: v.input.projectId,
        workspaceId: v.input.workspaceId,
        token: v.input.token
      }) &&
      ['csl-json', 'bibtex', 'ris'].includes(String(v.input.format)) &&
      typeof v.input.sourcePath === 'string' &&
      v.input.sourcePath.length <= 4096
    )
  if (v.kind === 'sourceImport')
    return (
      record(v.input) &&
      isSourceImportInput({
        projectId: v.input.projectId,
        workspaceId: v.input.workspaceId,
        operationId: v.input.operationId,
        token: v.input.token,
        digest: v.input.digest,
        choices: v.input.choices
      }) &&
      ['csl-json', 'bibtex', 'ris'].includes(String(v.input.format)) &&
      typeof v.input.sourcePath === 'string' &&
      v.input.sourcePath.length <= 4096
    )
  if (v.kind === 'sourceAttach')
    return (
      record(v.input) &&
      isSourceAttachmentInput({
        projectId: v.input.projectId,
        workspaceId: v.input.workspaceId,
        operationId: v.input.operationId,
        token: v.input.token,
        sourceId: v.input.sourceId
      }) &&
      typeof v.input.sourcePath === 'string' &&
      v.input.sourcePath.length <= 4096 &&
      typeof v.input.originalName === 'string' &&
      v.input.originalName.length <= 255
    )
  if (v.kind === 'sourceExport')
    return (
      record(v.input) &&
      isSourceExportInput({
        projectId: v.input.projectId,
        workspaceId: v.input.workspaceId,
        operationId: v.input.operationId,
        format: v.input.format,
        sourceIds: v.input.sourceIds
      }) &&
      typeof v.input.destinationPath === 'string' &&
      v.input.destinationPath.length <= 4096
    )
  if (v.kind === 'sourceExportAttachment')
    return (
      record(v.input) &&
      isSourceAttachmentExportInput({
        projectId: v.input.projectId,
        workspaceId: v.input.workspaceId,
        attachmentId: v.input.attachmentId,
        suggestedName: v.input.suggestedName
      }) &&
      typeof v.input.destinationPath === 'string' &&
      v.input.destinationPath.length <= 4096
    )
  if (v.kind === 'noteChange') return isNoteChangeInput(v.input)
  if (v.kind === 'details') return isProjectDetailsInput(v.input)
  if (v.kind === 'rename') return isRenameInput(v.input)
  if (v.kind === 'archive') return isArchiveInput(v.input)
  if (v.kind === 'reset') return isResetInput(v.input)
  if (v.kind === 'recoverReset') return isId(v.input)
  return v.kind === 'create'
    ? isCreateInput(v.input)
    : v.kind === 'open'
      ? isOpenInput(v.input)
      : v.kind === 'section'
        ? isSectionInput(v.input)
        : v.kind === 'meta'
          ? isSectionMetaInput(v.input)
          : v.kind === 'commit'
            ? isCommitInput(v.input)
            : v.kind === 'importImage'
              ? isWorkerImageImport(v.input)
              : v.kind === 'readImage' && isImageReadInput(v.input)
}
export function isDestination(v: unknown): v is DestinationView {
  return (
    record(v) &&
    exact(v, ['path', 'snapshotId', 'headCommitId', 'generationId']) &&
    typeof v.path === 'string' &&
    v.path.length > 0 &&
    v.path.length <= 4096 &&
    [v.snapshotId, v.headCommitId, v.generationId].every(isId)
  )
}
function summary(v: unknown): v is ProjectSummary & Record<string, unknown> {
  return (
    record(v) &&
    [v.projectId, v.workspaceId, v.headCommitId].every(isId) &&
    typeof v.archived === 'boolean' &&
    storedProjectTitle(v.title) &&
    isProjectKind(v.projectKind) &&
    typeof v.updatedAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.updatedAt) &&
    (v.destination === null || isDestination(v.destination))
  )
}
export function isProjectValue(kind: ProjectCommand['kind'], v: unknown): v is ProjectValue {
  if (kind === 'proofreading') return isProofreadValue(v)
  if (kind === 'conversation') return isConversationValue(v)
  if (kind === 'exportPreview') return isExportPreview(v)
  if (
    kind === 'exportStart' ||
    kind === 'exportBatchStart' ||
    kind === 'exportStatus' ||
    kind === 'exportCancel'
  )
    return isExportJob(v)
  if (kind === 'recipes' || kind === 'recipeChange') return isRecipesView(v)
  if (kind === 'interchangePreview') return isImportPreview(v)
  if (kind === 'interchangeCommit') return isProjectValue('open', v)
  if (kind === 'citations' || kind === 'citationStyle') return isCitationsView(v)
  if (!record(v)) return false
  if (kind === 'history') return isHistoryView(v)
  if (kind === 'notes' || kind === 'noteChange') return isNotesView(v)
  if (kind === 'evidence' || kind === 'evidenceChange') return isEvidenceView(v)
  if (kind === 'search') return isSearchView(v)
  if (kind === 'searchActivity' || kind === 'searchAction') return isSearchActivity(v)
  if (
    kind === 'sources' ||
    kind === 'sourceChange' ||
    kind === 'sourceImport' ||
    kind === 'sourceAttach'
  )
    return isSourcesView(v)
  if (kind === 'inspection' || kind === 'inspectionChange') return isInspectionView(v)
  if (kind === 'inspectionPage') return isInspectionPageText(v)
  if (kind === 'inspectionAsset')
    return (
      exact(v, ['path', 'bytes', 'mediaType', 'sha256']) &&
      typeof v.path === 'string' &&
      v.path.length <= 4096 &&
      Number.isSafeInteger(v.bytes) &&
      Number(v.bytes) > 0 &&
      Number(v.bytes) <= 32 * 1024 * 1024 &&
      ['application/pdf', 'text/plain'].includes(String(v.mediaType)) &&
      typeof v.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(v.sha256)
    )
  if (kind === 'sourcePreview') return isSourcePreview(v)
  if (kind === 'sourceExport' || kind === 'sourceExportAttachment')
    return (
      exact(v, ['path', 'count', 'losses']) &&
      typeof v.path === 'string' &&
      v.path.length <= 4096 &&
      Number.isSafeInteger(v.count) &&
      Number(v.count) >= 0 &&
      Array.isArray(v.losses) &&
      v.losses.length <= 100000 &&
      v.losses.every((x: unknown) => typeof x === 'string' && x.length <= 2000)
    )
  if (['data', 'cleanup', 'reset', 'recoverReset'].includes(kind)) return isDataLocations(v)
  if (kind === 'list')
    return (
      exact(v, ['projects', 'issues']) &&
      Array.isArray(v.projects) &&
      v.projects.length <= 10000 &&
      v.projects.every(
        (p) =>
          summary(p) &&
          exact(p, [
            'projectId',
            'workspaceId',
            'title',
            'projectKind',
            'headCommitId',
            'updatedAt',
            'archived',
            'destination'
          ])
      ) &&
      Array.isArray(v.issues) &&
      v.issues.length <= 10000 &&
      v.issues.every(
        (p) =>
          record(p) && exact(p, ['projectId', 'code']) && isId(p.projectId) && isProjectCode(p.code)
      )
    )
  if (kind === 'commit')
    return (
      exact(v, ['projectId', 'documentId', 'revisionId', 'headCommitId']) &&
      Object.values(v).every(isId)
    )
  if (kind === 'importImage')
    return (
      exact(v, ['assetId', 'mediaType', 'width', 'height']) &&
      isId(v.assetId) &&
      ['image/png', 'image/jpeg'].includes(String(v.mediaType)) &&
      [v.width, v.height].every(
        (n) => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 12000
      )
    )
  if (kind === 'readImage')
    return (
      exact(v, ['mediaType', 'base64']) &&
      ['image/png', 'image/jpeg'].includes(String(v.mediaType)) &&
      typeof v.base64 === 'string' &&
      v.base64.length <= 36_000_000 &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(v.base64)
    )
  if (
    !summary(v) ||
    !exact(v, [
      'projectId',
      'workspaceId',
      'title',
      'projectKind',
      'headCommitId',
      'updatedAt',
      'archived',
      'destination',
      'template',
      'byline',
      'description',
      'detailsRevisionId',
      'documents',
      'documentId',
      'revisionId',
      'payload'
    ]) ||
    !isProjectTemplate(v.template) ||
    kindForTemplate(v.template) !== v.projectKind ||
    !(v.byline === '' || requiredProjectName(v.byline)) ||
    !projectText(v.description, 10000) ||
    !isId(v.detailsRevisionId) ||
    !Array.isArray(v.documents) ||
    v.documents.length < 1 ||
    v.documents.length > 10000 ||
    !v.documents.every(isOutlineDocument) ||
    !isId(v.documentId) ||
    !isId(v.revisionId) ||
    !v.documents.some((d) => d.id === v.documentId)
  )
    return false
  try {
    readDocument(v.payload)
    return true
  } catch {
    return false
  }
}
export function isProjectResult<T>(
  v: unknown,
  requestId: string,
  valid: (value: unknown) => boolean
): v is ProjectResult<T> {
  if (!record(v) || v.requestId !== requestId) return false
  if (v.ok === true) return exact(v, ['ok', 'requestId', 'value']) && valid(v.value)
  return (
    v.ok === false &&
    exact(v, ['ok', 'requestId', 'error']) &&
    record(v.error) &&
    exact(v.error, ['code', 'message', 'retryable']) &&
    isProjectCode(v.error.code) &&
    v.error.message === projectMessages[v.error.code] &&
    typeof v.error.retryable === 'boolean'
  )
}
export function isLocation(v: unknown): v is LocationStatus {
  return (
    record(v) &&
    exact(v, ['state', 'path', 'message']) &&
    ['ready', 'required'].includes(String(v.state)) &&
    (v.path === null || (typeof v.path === 'string' && v.path.length <= 4096)) &&
    typeof v.message === 'string' &&
    v.message.length <= 500
  )
}
