import { proofreadingCommand, interruptUnboundProofreading, validatePortableProofreading } from './proofreading'
import type { ProofreadWorkerInput, ProofreadValue } from '../../shared/proofreading'
import { conversationCommand, interruptUnboundConversations, validatePortableConversations } from './conversations'
import type { ConversationWorkerInput, ConversationValue } from '../../shared/conversations'
import { readProjectDetails } from './details'
import { kindForTemplate, templateForKind } from '../../domain/projects/templates'
import { requiredProjectName, storedProjectTitle } from '../../domain/projects/details'
import type { ProjectDetailsInput } from '../../shared/projects'
import { readCitations, changeCitationStyle } from './citations'
import type { CitationStyleInput, CitationsView } from '../../shared/citations'
import { projectCitations } from './citation-occurrences'
import { changeOutline, readHistory } from './outline'
import { changeNote, mapDocumentAnnotations, readNotes, reconcileAnnotationAnchors } from './notes'
import type { NoteChangeInput, NotesView } from '../../shared/notes'
import { seedOutline, automaticCheckpoint, updateDocumentAnchors, manuscript } from './manuscript'
import { effectiveState, isOutlineDocument, type OutlineDocument, type OutlineInput, type HistoryInput, type HistoryView } from '../../shared/outline'
import Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readdir, lstat, readFile, rename, open, writeFile, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isId, readDocument, type DocumentPayload } from '../../domain/editor/schema'
import { emptyDocument, templateSections } from '../../domain/projects/templates'
import { requestDigest } from '../storage/digest'
import { ProjectError, projectError } from '../../domain/projects/errors'
import { exact, record } from '../../shared/projects'
import type { RenameInput, ArchiveInput } from '../../shared/project-lifecycle'
import type { CommitInput, CommitReceipt, CreateInput, OpenInput, OpenProject, ProjectList, ProjectSummary, SectionInput, SectionMetaInput, WorkerImageImport, ImageReadInput, ImageAsset, ImageData } from '../../shared/projects'
import { backupStorageDatabase, inWriteTransaction, openStorageDatabase } from '../storage/driver'
import { contained, directory, syncDirectory, syncFile, writeJson } from '../storage/files'
import { createProjectSchema, validateProjectSchema, inspectVersion } from '../storage/schema'
import { openProjectDatabase } from '../storage/migrations'
import { SnapshotJobs, type SnapshotRequest, type SnapshotJob } from './snapshot-jobs'
import { SnapshotError, isHash } from './manifest'
import { destinationView, readDestination, writeDestination, type SavedLocation } from './file-state'
import { stageBlob } from './blobs'
import { fileHash } from './streams'
import { readSources, changeSource, previewImport, commitImport, attachSourceFile, exportSources, exportSourceAttachment } from './sources'
import type { SourceChangeInput, SourcesView, SourceImportPreview, SourceExportReceipt, WorkerSourcePreview, WorkerSourceImport, WorkerSourceAttachment, WorkerSourceExport, WorkerSourceAttachmentExport } from '../../shared/sources'
import { readInspection, readInspectionPage, inspectionAsset, changeInspection } from './inspection'
import type { InspectionScope, InspectionPageInput, InspectionAssetInput, InspectionChangeInput, InspectionView, InspectionPageText, WorkerInspectionAsset } from '../../shared/inspection'
import { readEvidence, changeEvidence } from './evidence'
import type { EvidenceChangeInput, EvidenceView } from '../../shared/evidence'
import { LocalSearch } from './search'
import type { SearchInput, SearchActionInput, SearchView, SearchActivity } from '../../shared/search'
import { prepareExport } from '../exports/prepare'
import { ExportJobs } from '../exports/jobs'
import type { ExportOptions, ExportPreview, ExportJob, ExportJobInput, WorkerExportStart, WorkerExportBatchStart } from '../../shared/exports'
import type { RecipeChangeInput, RecipesView, WorkerImportPreview, WorkerImportCommit, ImportPreview } from '../../shared/interchange'
import { readRecipes, changeRecipe, previewInterchange, commitInterchange } from './interchange'
import type { PrintDocument } from '../exports/html'

const catalogSchema = [
  'CREATE TABLE creation_intents (operation_id TEXT PRIMARY KEY, digest TEXT NOT NULL, project_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL UNIQUE) STRICT',
  'CREATE TABLE destinations (project_id TEXT PRIMARY KEY, selected_path TEXT, base_snapshot_id TEXT, base_snapshot_head TEXT) STRICT'
]
const operationsSchema = [
  'CREATE TABLE jobs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT) STRICT',
  'CREATE TABLE delivery (operation_id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT',
  'CREATE INDEX ai_binding_capacity ON jobs (kind,state,created_at,id)'
]
type Owned = { projectId: string; workspaceId: string; workspace: string; db: Database.Database; operations: Database.Database; lock: Database.Database; search: LocalSearch | null; destination: SavedLocation | null; archived: boolean; snapshots?: SnapshotJobs }
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true } catch (e) { if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return false; throw e } }
const IMAGE_LIMIT = 25 * 1024 * 1024
function imageInfo(bytes: Buffer): Omit<ImageAsset, 'assetId'> {
  let mediaType: ImageAsset['mediaType'], width: number, height: number
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    mediaType = 'image/png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    mediaType = 'image/jpeg'; width = 0; height = 0
    let pos = 2
    while (pos + 4 < bytes.length) {
      if (bytes[pos] !== 0xff) break
      while (bytes[pos] === 0xff) pos++
      const marker = bytes[pos++]
      if (marker === 0xd9 || marker === 0xda) break
      if ([0x01,0xd0,0xd1,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7].includes(marker)) continue
      if (pos + 2 > bytes.length) break
      const length = bytes.readUInt16BE(pos)
      if (length < 2 || pos + length > bytes.length) break
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) { height = bytes.readUInt16BE(pos + 3); width = bytes.readUInt16BE(pos + 5); break }
      pos += length
    }
  } else throw new ProjectError('VALIDATION')
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000 || width * height > 40_000_000) throw new ProjectError('LIMIT_EXCEEDED')
  return { mediaType, width, height }
}
async function selectedImage(path: string): Promise<Buffer> {
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > IMAGE_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new ProjectError('VALIDATION')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (bytes.length !== before.size || bytes.length > IMAGE_LIMIT || after.size !== before.size || after.mtimeMs !== opened.mtimeMs) throw new ProjectError('VALIDATION')
    return bytes
  } finally { await handle.close() }
}

export class ProjectRepository {
  private readonly exports: ExportJobs
  proofreading(input:ProofreadWorkerInput):Promise<ProofreadValue>{return this.serial(async()=>{
    this.fileContext(input)
    const mutating=['append','bind','settle','decide','handoff','retire'].includes(input.action)
    if(mutating&&this.fileBusy)throw new ProjectError('PROJECT_LOCKED')
    const owned=this.active!,value=await proofreadingCommand(owned,input)
    if(mutating)await this.discovery(owned)
    return value
  })}
  conversation(input:ConversationWorkerInput):Promise<ConversationValue>{return this.serial(async()=>{
    this.fileContext(input)
    const mutating=['change','append','bind','settle','handoff','retire'].includes(input.action)
    if(mutating&&this.fileBusy)throw new ProjectError('PROJECT_LOCKED')
    const owned=this.active!,value=await conversationCommand(owned,input)
    if(mutating)await this.discovery(owned)
    return value
  })}
  exportPreview(input:ExportOptions):Promise<ExportPreview>{return this.serial(async()=>{this.fileContext(input);return (await prepareExport(this.active!.db,this.active!.workspace,this.resources,input)).preview})}
  exportStart(input:WorkerExportStart):Promise<ExportJob>{return this.serial(async()=>{this.fileContext(input);const owned=this.active!,prepared=await prepareExport(owned.db,owned.workspace,this.resources,input);return this.exports.start(owned.workspace,input,prepared)})}
  exportBatchStart(input:WorkerExportBatchStart):Promise<ExportJob>{return this.serial(async()=>{this.fileContext(input);const owned=this.active!,prepared=await prepareExport(owned.db,owned.workspace,this.resources,input);return this.exports.startBatch(owned.workspace,input,prepared)})}
  exportStatus(input:ExportJobInput):Promise<ExportJob>{return this.serial(async()=>{const workspace=await this.exportWorkspace(input);return this.exports.status(workspace,input.jobId)})}
  exportCancel(input:ExportJobInput):Promise<ExportJob>{return this.serial(async()=>{const workspace=await this.exportWorkspace(input);return this.exports.cancel(workspace,input.jobId)})}
  private async exportWorkspace(input:OpenInput):Promise<string>{
    // Completed/running exports outlive active-project navigation. IDs remain validated by IPC.
    const workspace=join(this.root,'workspaces',input.projectId,input.workspaceId)
    await contained(this.root,workspace,true)
    return workspace
  }
  recipes(input:OpenInput):Promise<RecipesView>{return this.serial(async()=>{this.fileContext(input);return readRecipes(this.active!.db,input)})}
  recipeChange(input:RecipeChangeInput):Promise<RecipesView>{return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,view=changeRecipe(owned.db,input);await this.discovery(owned);return view})}
  interchangePreview(input:WorkerImportPreview):Promise<ImportPreview>{return this.serial(async()=>{this.fileContext(input);return previewInterchange(input)})}
  interchangeCommit(input:WorkerImportCommit):Promise<OpenProject>{return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,id=await commitInterchange(owned.db,input);await this.discovery(owned);return this.read(owned,id)})}
  citations(input:OpenInput):Promise<CitationsView>{return this.serial(async()=>{this.fileContext(input);return readCitations(this.active!.db,input,this.active!.workspace,this.resources)})}
  citationStyle(input:CitationStyleInput):Promise<CitationsView>{return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!;changeCitationStyle(owned.db,input);await this.discovery(owned);return readCitations(owned.db,input,owned.workspace,this.resources)})}
  private searchScheduled = new WeakSet<Owned>()
  private searchOwner(input:OpenInput):Owned {const owned=this.active;if(!owned||owned.projectId!==input.projectId||owned.workspaceId!==input.workspaceId)throw new ProjectError('DENIED');return owned}
  private availableSearch(owned:Owned):LocalSearch {if(!owned.search)throw new ProjectError('UNAVAILABLE');return owned.search}
  private scheduleSearch(owned:Owned):void {
    if(this.searchScheduled.has(owned)||!owned.search?.needsWork())return
    this.searchScheduled.add(owned)
    setImmediate(()=>{this.searchScheduled.delete(owned);void this.serial(async()=>{
      if(this.active!==owned)return
      const more=owned.search?.batch(owned.db,owned.operations)
      if(more)this.scheduleSearch(owned)
    }).catch(()=>{})})
  }
  searchQuery(input:SearchInput):Promise<SearchView>{return this.serial(async()=>{const owned=this.searchOwner(input),search=this.availableSearch(owned);search.ensure(owned.db,owned.operations);this.scheduleSearch(owned);return search.search(owned.db,input)})}
  searchActivity(input:OpenInput):Promise<SearchActivity>{return this.serial(async()=>{const owned=this.searchOwner(input),search=this.availableSearch(owned);search.ensure(owned.db,owned.operations);this.scheduleSearch(owned);return search.activity(owned.db)})}
  searchAction(input:SearchActionInput):Promise<SearchActivity>{return this.serial(async()=>{const owned=this.searchOwner(input);if(!owned.search&&input.action==='rebuild'){
    const old=join(owned.workspace,'search.sqlite'),suffix=`.retained-${randomUUID()}`
    for(const extension of ['', '-wal', '-shm', '-journal'])if(await exists(old+extension)){await contained(this.root,old+extension,false);await rename(old+extension,old+suffix+extension)}
    owned.search=new LocalSearch(old,this.nativeBinding)
  }
    const search=this.availableSearch(owned)
    if(input.action==='cancel')search.cancel(owned.operations);else {if(search.needsWork())throw new ProjectError('PROJECT_LOCKED');search.start(owned.db,owned.operations,input.action==='rebuild')}
    this.scheduleSearch(owned);return search.activity(owned.db)})}
  evidence(input:OpenInput):Promise<EvidenceView>{return this.serial(async()=>{this.fileContext(input);return readEvidence(this.active!.db,input)})}
  evidenceChange(input:EvidenceChangeInput):Promise<EvidenceView>{return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,view=changeEvidence(owned.db,input);await this.discovery(owned);return view})}
  inspection(input:InspectionScope):Promise<InspectionView>{return this.serial(async()=>{this.fileContext(input);return readInspection(this.active!.db,input)})}
  inspectionPage(input:InspectionPageInput):Promise<InspectionPageText>{return this.serial(async()=>{this.fileContext(input);return readInspectionPage(this.active!.db,input)})}
  inspectionAsset(input:InspectionAssetInput):Promise<WorkerInspectionAsset>{return this.serial(async()=>{this.fileContext(input);const owned=this.active!;return inspectionAsset({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input)})}
  inspectionChange(input:InspectionChangeInput):Promise<InspectionView>{return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,view=changeInspection({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input);await this.discovery(owned);return view})}
  private catalog!: Database.Database
  private active: Owned | undefined
  private boundary: Promise<unknown> = Promise.resolve()
  private fileBusy = false
  sources(input: OpenInput): Promise<SourcesView> { return this.serial(async()=>{this.fileContext(input);return readSources(this.active!.db,input.projectId)}) }
  sourceChange(input: SourceChangeInput): Promise<SourcesView> { return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,view=changeSource({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input);await this.discovery(owned);return view}) }
  sourcePreview(input: WorkerSourcePreview): Promise<SourceImportPreview> { return this.serial(async()=>{this.fileContext(input);const owned=this.active!;return previewImport({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input)}) }
  sourceImport(input: WorkerSourceImport): Promise<SourcesView> { return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,view=await commitImport({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input);await this.discovery(owned);return view}) }
  sourceAttach(input: WorkerSourceAttachment,progress?:(transferred:number,total:number)=>void): Promise<SourcesView> { return this.serial(async()=>{this.fileContext(input);if(this.fileBusy)throw new ProjectError('PROJECT_LOCKED');const owned=this.active!,view=await attachSourceFile({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input,progress);await this.discovery(owned);return view}) }
  sourceExport(input: WorkerSourceExport): Promise<SourceExportReceipt> { return this.serial(async()=>{this.fileContext(input);const owned=this.active!;return exportSources({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input)}) }
  sourceExportAttachment(input: WorkerSourceAttachmentExport): Promise<SourceExportReceipt> { return this.serial(async()=>{this.fileContext(input);const owned=this.active!;return exportSourceAttachment({root:this.root,workspace:owned.workspace,projectId:input.projectId,db:owned.db},input.attachmentId,input.destinationPath)}) }
  constructor(private readonly root: string, private readonly resources: string, private readonly nativeBinding?: string, renderPdf?: (document:PrintDocument,signal:AbortSignal)=>Promise<{bytes:Buffer;pages:number;capturedHead:string}>) { this.exports=new ExportJobs(root,resources,renderPdf) }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.boundary.then(work)
    this.boundary = task.catch(() => {})
    return task
  }
  open(input: OpenInput): Promise<OpenProject> { return this.serial(() => this.openUnlocked(input)) }
  section(input: SectionInput): Promise<OpenProject> { return this.serial(async () => { this.fileContext(input); return this.read(this.active!, input.documentId) }) }
  details(input: ProjectDetailsInput): Promise<OpenProject> {
    return this.serial(async () => {
      if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
      this.fileContext(input)
      const owned = this.active!, digest = requestDigest({ kind: 'projectDetails', ...input })
      inWriteTransaction(owned.db, () => {
        const prior = owned.db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(input.projectId,input.operationId) as { digest: string } | undefined
        if (prior) { if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT'); return }
        const before = this.read(owned)
        if (before.headCommitId !== input.expectedHead || before.detailsRevisionId !== input.expectedRevisionId) throw new ProjectError('STALE_REVISION')
        // Preserve a legacy title verbatim when changing another field.
        if (input.title !== before.title && !requiredProjectName(input.title)) throw new ProjectError('VALIDATION')
        const head = randomUUID(), time = new Date().toISOString()
        owned.db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(input.projectId,head,before.headCommitId,time)
        owned.db.prepare('UPDATE projects SET title=?,template=?,head_commit_id=?,updated_at=? WHERE id=?').run(input.title,templateForKind(input.projectKind),head,time,input.projectId)
        owned.db.prepare('UPDATE project_details SET byline=?,description=?,kind=?,revision_id=? WHERE project_id=?').run(input.byline,input.description,input.projectKind,head,input.projectId)
        owned.db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(input.projectId,input.operationId,digest,JSON.stringify({projectId:input.projectId,documentId:before.documentId,revisionId:head,headCommitId:head}))
      })
      await this.discovery(owned)
      return this.read(owned)
    })
  }
  meta(input: SectionMetaInput): Promise<OpenProject> {
    return this.serial(async () => {
      if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
      this.fileContext(input)
      const owned = this.active!, digest = requestDigest({ kind: 'sectionMeta', ...input })
      inWriteTransaction(owned.db, () => {
        const prior = owned.db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(input.projectId, input.operationId) as { digest: string } | undefined
        if (prior) { if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT'); return }
        const before = this.read(owned, input.documentId)
        if (before.headCommitId !== input.expectedHead) throw new ProjectError('STALE_REVISION')
        const selected = before.documents.find(d => d.id === input.documentId)!
        if (effectiveState(selected,before.documents) !== 'active') throw new ProjectError('VALIDATION')
        const head = randomUUID(), revision = randomUUID(), time = new Date().toISOString()
        owned.db.prepare('UPDATE documents SET title=?,status=?,synopsis=?,revision_id=? WHERE project_id=? AND id=?').run(input.title, input.status, input.synopsis, revision, input.projectId, input.documentId)
        owned.db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(input.projectId, head, before.headCommitId, time)
        owned.db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(head, time, input.projectId)
        automaticCheckpoint(owned.db,input.projectId)
        owned.db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(input.projectId, input.operationId, digest, JSON.stringify({ projectId: input.projectId, documentId: input.documentId, revisionId: revision, headCommitId: head }))
      })
      await this.discovery(owned)
      return this.read(owned, input.documentId)
    })
  }
  outline(input: OutlineInput): Promise<OpenProject> {
    return this.serial(async () => {
      if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
      this.fileContext(input)
      const selected = changeOutline(this.active!.db,input)
      await this.discovery(this.active!)
      return this.read(this.active!,selected)
    })
  }
  history(input: HistoryInput): Promise<HistoryView> {
    return this.serial(async () => { this.fileContext(input); return readHistory(this.active!.db,input) })
  }
  notes(input: OpenInput): Promise<NotesView> { return this.serial(async () => { this.fileContext(input); return readNotes(this.active!.db,input.projectId) }) }
  noteChange(input: NoteChangeInput): Promise<NotesView> { return this.serial(async () => {
    if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
    this.fileContext(input)
    const view = changeNote(this.active!.db,input)
    await this.discovery(this.active!)
    return view
  }) }
  create(input: CreateInput): Promise<OpenProject> { return this.serial(() => this.createUnlocked(input)) }
  list(): Promise<ProjectList> { return this.serial(() => this.listUnlocked()) }
  commit(input: CommitInput): Promise<CommitReceipt> { return this.serial(() => this.commitUnlocked(input)) }
  importImage(input: WorkerImageImport): Promise<ImageAsset> { return this.serial(() => this.importImageUnlocked(input)) }
  readImage(input: ImageReadInput): Promise<ImageData> { return this.serial(() => this.readImageUnlocked(input)) }
  holdFiles(value: boolean): void { this.fileBusy = value }
  fileContext(input: OpenInput): { workspace: string; destination: SavedLocation | null; head: string } {
    const owned = this.active
    if (!owned || owned.projectId !== input.projectId || owned.workspaceId !== input.workspaceId) throw new ProjectError('DENIED')
    return { workspace: owned.workspace, destination: owned.destination, head: this.read(owned).headCommitId }
  }
  acknowledgeFile(input: OpenInput, destination: SavedLocation): Promise<void> {
    return this.serial(async () => {
      const context = this.fileContext(input)
      await writeDestination(context.workspace, destination)
      this.active!.destination = destination
    })
  }
  async knownProject(projectId: string): Promise<OpenInput | null> {
    if (!isId(projectId)) throw new ProjectError('VALIDATION')
    const folder = join(this.root, 'workspaces', projectId)
    if (!await exists(folder)) return null
    await contained(this.root, folder, true)
    const workspaces = (await readdir(folder)).filter(isId)
    if (workspaces.length !== 1) throw new ProjectError('CORRUPT_PROJECT')
    return { projectId, workspaceId: workspaces[0] }
  }
  /** Trusted worker services only; the renderer cannot supply paths. */
  queueSnapshot(input: OpenInput, request: SnapshotRequest): Promise<SnapshotJob> {
    return this.serial(async () => {
      const jobs = this.snapshotJobs(input)
      const destination = this.fileContext(input).destination
      if (request.parentSnapshotId !== (destination?.snapshotId ?? null)) throw new SnapshotError('STALE_REVISION')
      return jobs.enqueue(request)
    })
  }
  snapshotJobs(input: OpenInput): SnapshotJobs {
    if (this.active?.projectId !== input.projectId || this.active.workspaceId !== input.workspaceId || !this.active.snapshots) throw new ProjectError('DENIED')
    return this.active.snapshots
  }
  private async readArchived(workspace: string): Promise<boolean> {
    const path = join(workspace, 'organization-v1.json')
    if (!await exists(path)) return false
    await contained(this.root, path, false)
    if ((await lstat(path)).size > 1024) throw new ProjectError('CORRUPT_PROJECT')
    const v: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!record(v) || !exact(v, ['version','archived']) || v.version !== 1 || typeof v.archived !== 'boolean') throw new ProjectError('CORRUPT_PROJECT')
    return v.archived
  }
  archive(input: ArchiveInput): Promise<OpenProject> {
    return this.serial(async () => {
      if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
      const context = this.fileContext(input.scope)
      await writeJson(join(context.workspace, 'organization-v1.json'), { version: 1, archived: input.archived })
      this.active!.archived = input.archived
      return this.read(this.active!)
    })
  }
  rename(input: RenameInput): Promise<OpenProject> {
    return this.serial(async () => {
      if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
      this.fileContext(input.scope)
      const owned = this.active!, digest = requestDigest({ kind: 'rename', ...input })
      inWriteTransaction(owned.db, () => {
        const prior = owned.db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(owned.projectId, input.operationId) as { digest: string } | undefined
        if (prior) { if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT'); return }
        const before = this.read(owned)
        if (before.headCommitId !== input.expectedHead) throw new ProjectError('STALE_REVISION')
        const headCommitId = randomUUID(), time = new Date().toISOString()
        owned.db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(owned.projectId, headCommitId, before.headCommitId, time)
        owned.db.prepare('UPDATE projects SET title=?,head_commit_id=?,updated_at=? WHERE id=?').run(input.title, headCommitId, time, owned.projectId)
        owned.db.prepare('UPDATE project_details SET revision_id=? WHERE project_id=?').run(headCommitId,owned.projectId)
        // Existing portable ID-only receipt contract; document content/revision is unchanged.
        owned.db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(owned.projectId, input.operationId, digest, JSON.stringify({ projectId: owned.projectId, documentId: before.documentId, revisionId: before.revisionId, headCommitId }))
      })
      await this.discovery(owned)
      return this.read(owned)
    })
  }
  resetWorkspaces(expected: string): Promise<void> {
    return this.serial(async () => {
      if (this.fileBusy || this.active?.snapshots?.busy()) throw new ProjectError('PROJECT_LOCKED')
      const list = await this.listUnlocked()
      if (list.issues.length || requestDigest(list) !== expected) throw new ProjectError('STALE_REVISION')
      const parent = join(this.root, 'reset-recovery')
      await directory(this.root, parent)
      const batch = join(parent, randomUUID())
      await directory(this.root, batch)
      // One same-volume rename retains every SQLite file and sidecar together. No deletion.
      if (this.active) { this.release(this.active); this.active = undefined }
      await rename(join(this.root, 'workspaces'), join(batch, 'workspaces'))
      await syncDirectory(batch); await syncDirectory(this.root)
      await directory(this.root, join(this.root, 'workspaces'))
    })
  }
  recoverReset(id: string): Promise<void> {
    return this.serial(async () => {
      if (!isId(id) || this.fileBusy || this.active?.snapshots?.busy()) throw new ProjectError('PROJECT_LOCKED')
      const source = join(this.root, 'reset-recovery', id, 'workspaces')
      await contained(this.root, source, true)
      const names = await readdir(source)
      if (names.length > 10000 || names.some(name => !isId(name))) throw new ProjectError('CORRUPT_PROJECT')
      for (const name of names) {
        await contained(source, join(source, name), true)
        if (await exists(join(this.root, 'workspaces', name))) throw new ProjectError('OPERATION_CONFLICT')
      }
      // Each project moves atomically. A stopped restore leaves remaining projects in the batch.
      for (const name of names) {
        await rename(join(source, name), join(this.root, 'workspaces', name))
        await syncDirectory(source); await syncDirectory(join(this.root, 'workspaces'))
      }
    })
  }
  private async safeDatabase(path: string): Promise<void> {
    for (const suffix of ['', '-wal', '-shm', '-journal']) if (await exists(path + suffix)) await contained(this.root, path + suffix, false)
  }
  private async localDatabase(path: string, statements: readonly string[], version=1): Promise<Database.Database> {
    await this.safeDatabase(path)
    const db = openStorageDatabase(path, this.nativeBinding)
    try {
      const objects = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all() as { sql: string }[]
      if (!objects.length && db.pragma('user_version', { simple: true }) === 0) inWriteTransaction(db, () => {
        statements.forEach(sql => db.exec(sql)); db.pragma(`user_version=${version}`)
      })
      else if(version===2&&db.pragma('user_version',{simple:true})===1&&objects.length===2&&objects.every(row=>statements.slice(0,2).includes(row.sql))){
        // Device-local upgrade only. Keep a complete prior database before the
        // index/version change; portable project and old binding bytes stay exact.
        const retained=`${path}.before-handoff-${randomUUID()}.sqlite`
        await backupStorageDatabase(db,retained,this.nativeBinding)
        await syncFile(retained);await syncDirectory(dirname(retained))
        inWriteTransaction(db,()=>{db.exec(statements[2]);db.pragma('user_version=2')})
      }
      else if (db.pragma('user_version', { simple: true }) !== version || objects.length !== statements.length || objects.some(row => !statements.includes(row.sql))) throw new ProjectError('CORRUPT_PROJECT')
      return db
    } catch (error) { db.close(); throw error }
  }
  async initialize(): Promise<void> {
    await contained(this.root, this.root, true)
    await directory(this.root, join(this.root, 'settings'))
    await directory(this.root, join(this.root, 'workspaces'))
    this.catalog = await this.localDatabase(join(this.root, 'settings/local.sqlite'), catalogSchema)
    await syncDirectory(join(this.root, 'settings'))
    await syncDirectory(this.root)
  }
  private async lock(project: string): Promise<Database.Database> {
    const path = join(project, 'owner.sqlite')
    await this.safeDatabase(path)
    const lock = new Database(path, { nativeBinding: this.nativeBinding, timeout: 0 })
    try {
      lock.pragma('trusted_schema=OFF')
      lock.pragma('journal_mode=DELETE')
      lock.exec('BEGIN EXCLUSIVE')
      return lock
    } catch (error) { lock.close(); throw error }
  }
  private release(owned: Owned): void {
    try { owned.db.close() } finally {
      try { owned.search?.close() } finally { try { owned.operations.close() } finally { owned.lock.close() } }
    } // OS/SQLite releases ownership on normal close or process death.
  }
  async close(): Promise<void> {
    await this.active?.snapshots?.stop()
    await this.boundary
    await this.exports.stop()
    if (this.active) { this.release(this.active); this.active = undefined }
    if (this.catalog?.open) this.catalog.close()
  }
  private read(owned: Owned, selectedId?: string): OpenProject {
    const project = owned.db.prepare('SELECT * FROM projects').all() as { id: string; template: OpenProject['template']; title: string; head_commit_id: string; updated_at: string }[]
    const documents = owned.db.prepare(`SELECT d.id,d.revision_id AS revisionId,d.title,d.status,d.synopsis,d.position,d.parent_id AS parentId,d.kind,s.state,s.replacement_id AS replacementId FROM documents d JOIN outline_state s ON d.project_id=s.project_id AND d.id=s.document_id WHERE d.project_id=? ORDER BY d.parent_id,d.position`).all(owned.projectId) as OutlineDocument[]
    let selected = selectedId ? documents.find(doc => doc.id === selectedId) : undefined
    if (selectedId && !selected) throw new ProjectError('NOT_FOUND')
    const visited = new Set<string>()
    while (selected?.replacementId) {
      if (visited.has(selected.id)) throw new ProjectError('CORRUPT_PROJECT')
      visited.add(selected.id); const replacementId = selected.replacementId; selected = documents.find(doc => doc.id === replacementId)
      if (!selected) throw new ProjectError('CORRUPT_PROJECT')
    }
    selected ??= documents.find(doc => doc.kind === 'text' && effectiveState(doc,documents) === 'active')
    if (project.length !== 1 || project[0].id !== owned.projectId || !Object.hasOwn(templateSections, project[0].template) || documents.length < 1 || documents.length > 10000 || !selected || selected.kind !== 'text' || !isId(project[0].head_commit_id) || !documents.every(isOutlineDocument)) throw new ProjectError('CORRUPT_PROJECT')
    if (!storedProjectTitle(project[0].title) || !Number.isFinite(Date.parse(project[0].updated_at))) throw new ProjectError('CORRUPT_PROJECT')
    let payload: DocumentPayload
    try {
      const row = owned.db.prepare('SELECT payload FROM documents WHERE project_id=? AND id=?').get(owned.projectId, selected.id) as { payload: string }
      payload = readDocument(JSON.parse(row.payload))
    } catch { throw new ProjectError('CORRUPT_PROJECT') }
    return { ...readProjectDetails(owned.db,owned.projectId), projectId: owned.projectId, workspaceId: owned.workspaceId, title: project[0].title, headCommitId: project[0].head_commit_id, updatedAt: project[0].updated_at, archived: owned.archived, destination: destinationView(owned.destination), template: project[0].template, documents, documentId: selected.id, revisionId: selected.revisionId, payload }
  }
  private async discovery(owned: Owned): Promise<void> {
    const p = this.read(owned)
    // Derived discovery is never a mutation acknowledgment. A failed refresh is repairable on reopen.
    await writeJson(join(owned.workspace, 'recovery.json'), { version: 1, projectId: p.projectId, workspaceId: p.workspaceId, headCommitId: p.headCommitId, title: p.title, updatedAt: p.updatedAt }).catch(() => {})
  }
  private async acquire(input: OpenInput): Promise<Owned> {
    const project = join(this.root, 'workspaces', input.projectId)
    const workspace = join(project, input.workspaceId)
    await contained(this.root, project, true)
    await contained(this.root, workspace, true)
    const lock = await this.lock(project)
    let db: Database.Database | undefined
    let operations: Database.Database | undefined
    let search: LocalSearch | undefined
    try {
      db = await openProjectDatabase(this.root, workspace, this.nativeBinding)
      operations = await this.localDatabase(join(workspace, 'operations.sqlite'), operationsSchema,2)
      await this.safeDatabase(join(workspace,'search.sqlite'))
      try {search = new LocalSearch(join(workspace,'search.sqlite'),this.nativeBinding)} catch {search=undefined}
      // No job is silently replayed after interruption.
      operations.prepare("UPDATE jobs SET state='interrupted' WHERE state IN ('queued','running','cancelling')").run()
      const owned: Owned = { ...input, workspace, db, operations, search:search??null, lock, archived: await this.readArchived(workspace), destination: await readDestination(this.root, workspace) }
      manuscript(db,input.projectId)
      validatePortableProofreading(db,input.projectId)
      interruptUnboundProofreading(db,operations,input.projectId)
      validatePortableConversations(db,input.projectId)
      interruptUnboundConversations(db,operations,input.projectId)
      this.read(owned)
      this.catalog.prepare('INSERT OR IGNORE INTO destinations VALUES (?,NULL,NULL,NULL)').run(input.projectId)
      await this.discovery(owned)
      owned.snapshots = new SnapshotJobs({ ...owned, root: this.root, nativeBinding: this.nativeBinding }, this.resources, task => this.serial(task))
      await owned.snapshots.initialize()
      return owned
    } catch (error) { db?.close(); search?.close(); operations?.close(); lock.close(); throw error }
  }
  private async openUnlocked(input: OpenInput): Promise<OpenProject> {
    if (this.active?.projectId === input.projectId && this.active.workspaceId === input.workspaceId) return this.read(this.active)
    if (this.fileBusy || this.active?.snapshots?.busy()) throw new ProjectError('PROJECT_LOCKED')
    const next = await this.acquire(input)
    if (this.active) this.release(this.active)
    this.active = next
    return this.read(next)
  }
  private async listUnlocked(): Promise<ProjectList> {
    const result: ProjectList = { projects: [], issues: [] }
    const folders = await readdir(join(this.root, 'workspaces'))
    if (folders.length > 10000) throw new ProjectError('UNAVAILABLE')
    for (const projectId of folders.filter(isId)) {
      try {
        const project = join(this.root, 'workspaces', projectId)
        await contained(this.root, project, true)
        const workspaces = (await readdir(project)).filter(isId)
        if (workspaces.length !== 1) throw new ProjectError('CORRUPT_PROJECT')
        let owned: Owned
        const active = this.active?.projectId === projectId && this.active.workspaceId === workspaces[0]
        if (active) owned = this.active!
        else owned = await this.acquire({ projectId, workspaceId: workspaces[0] })
        try {
          const p = this.read(owned)
          const summary: ProjectSummary = { projectId, workspaceId: p.workspaceId, title: p.title, projectKind: p.projectKind, headCommitId: p.headCommitId, updatedAt: p.updatedAt, archived: p.archived, destination: p.destination }
          result.projects.push(summary)
        } finally { if (!active) this.release(owned) }
      } catch (error) { result.issues.push({ projectId, code: projectError(error) }) }
    }
    result.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.projectId.localeCompare(b.projectId))
    return result
  }
  private async createUnlocked(input: CreateInput): Promise<OpenProject> {
    if (this.fileBusy || this.active?.snapshots?.busy()) throw new ProjectError('PROJECT_LOCKED')
    const digest = requestDigest(input)
    // Commit a local intent before touching the workspace. Retrying the same request uses the same IDs.
    const intent = inWriteTransaction(this.catalog, () => {
      const previous = this.catalog.prepare('SELECT * FROM creation_intents WHERE operation_id=?').get(input.operationId) as { digest: string; project_id: string; workspace_id: string } | undefined
      if (previous) {
        if (previous.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
        return previous
      }
      const next = { digest, project_id: randomUUID(), workspace_id: randomUUID() }
      this.catalog.prepare('INSERT INTO creation_intents VALUES (?,?,?,?)').run(input.operationId, digest, next.project_id, next.workspace_id)
      this.catalog.prepare('INSERT INTO destinations VALUES (?,NULL,NULL,NULL)').run(next.project_id)
      return next
    })
    if (this.active?.projectId === intent.project_id && this.active.workspaceId === intent.workspace_id) {
      const prior = this.active.db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(intent.project_id, input.operationId) as { digest: string } | undefined
      if (prior?.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
      return this.read(this.active)
    }
    const project = join(this.root, 'workspaces', intent.project_id)
    await directory(this.root, project)
    const lock = await this.lock(project)
    try {
      const workspace = join(project, intent.workspace_id)
      await directory(this.root, workspace)
      await directory(this.root, join(workspace, 'blobs'))
      const path = join(workspace, 'working.sqlite')
      await this.safeDatabase(path)
      let initialized = false
      // Existing formats must be inspected read-only before enabling WAL or opening a writer.
      if (await exists(path)) {
        const existing = new Database(path, { nativeBinding: this.nativeBinding, readonly: true, fileMustExist: true })
        try {
          existing.pragma('trusted_schema=OFF')
          if (existing.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().length) {
            validateProjectSchema(existing, inspectVersion(existing)); initialized = true
          }
          else if (existing.pragma('user_version', { simple: true }) !== 0) throw new ProjectError('CORRUPT_PROJECT')
        } finally { existing.close() }
      }
      const db = initialized ? await openProjectDatabase(this.root, workspace, this.nativeBinding) : openStorageDatabase(path, this.nativeBinding)
      try {
        const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all()
        if (!objects.length && db.pragma('user_version', { simple: true }) === 0) {
          const projectId = intent.project_id, head = randomUUID(), time = new Date().toISOString()
          const sections = templateSections[input.template].map((title, position) => ({ title, position, documentId: randomUUID(), revision: randomUUID(), payload: emptyDocument(randomUUID) }))
          inWriteTransaction(db, () => {
            createProjectSchema(db)
            db.prepare('INSERT INTO commits VALUES (?,?,NULL,?)').run(projectId, head, time)
            db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?)').run(projectId, input.template, input.title, 'en-US', head, time, time)
            db.prepare('INSERT INTO project_details VALUES (?,?,?,?,?)').run(projectId,input.byline,input.description,kindForTemplate(input.template),head)
            for (const section of sections) {
              db.prepare('INSERT INTO documents VALUES (?,?,NULL,?,?,?,?,?,?,?,?)').run(projectId, section.documentId, section.position, 'text', section.title, 'draft', '', section.revision, 1, JSON.stringify(section.payload))
              this.indexIds(db, projectId, section.documentId, section.payload)
            }
            seedOutline(db,'Initial manuscript')
            db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(projectId, input.operationId, digest, JSON.stringify({ projectId, documentId: sections[0].documentId, revisionId: sections[0].revision, headCommitId: head }))
          })
        }
        validateProjectSchema(db)
        const operation = db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(intent.project_id, input.operationId) as { digest: string } | undefined
        if (operation?.digest !== digest) throw new ProjectError('CORRUPT_PROJECT')
      } finally { db.close() }
      await syncDirectory(workspace)
      await syncDirectory(project)
      await syncDirectory(join(this.root, 'workspaces'))
    } finally { lock.close() }
    return this.openUnlocked({ projectId: intent.project_id, workspaceId: intent.workspace_id })
  }
  private indexIds(db: Database.Database, projectId: string, documentId: string, payload: DocumentPayload): void {
    const insert = db.prepare('INSERT INTO editor_ids VALUES (?,?,?,?)')
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (['blockId', 'citationId', 'footnoteId'].includes(key)) {
          const prior = db.prepare('SELECT document_id FROM editor_ids WHERE project_id=? AND id=?').get(projectId, child)
          if (prior) throw new ProjectError('VALIDATION')
          insert.run(projectId, child, documentId, key)
        } else visit(child)
      }
    }
    visit(payload)
  }
  private async commitUnlocked(input: CommitInput): Promise<CommitReceipt> {
    const owned = this.active
    if (!owned || owned.projectId !== input.projectId || owned.workspaceId !== input.workspaceId) throw new ProjectError('DENIED')
    const payload = readDocument(input.payload)
    // References must resolve within this project, including retained source aliases after a merge.
    const references = (v: unknown): boolean => !!v && typeof v === 'object' && Object.entries(v).some(([key, child]) => key === 'sourceId' && (!isId(child) || !owned.db.prepare('SELECT 1 FROM sources WHERE project_id=? AND id=? UNION SELECT 1 FROM source_aliases WHERE project_id=? AND alias=?').get(input.projectId,child,input.projectId,child)) || (key === 'assetId' && !owned.db.prepare('SELECT id FROM managed_assets WHERE project_id=? AND id=?').get(input.projectId, child)) || references(child))
    if (references(payload)) throw new ProjectError('VALIDATION')
    const digest = requestDigest(input)
    const result = inWriteTransaction(owned.db, () => {
      const prior = owned.db.prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?').get(input.projectId, input.operationId) as { digest: string; result: string } | undefined
      if (prior) {
        if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
        return JSON.parse(prior.result) as CommitReceipt
      }
      const document = owned.db.prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?').get(input.projectId, input.documentId) as { revision_id: string } | undefined
      if (!document) throw new ProjectError('NOT_FOUND')
      if (document.revision_id !== input.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      const selected = this.read(owned,input.documentId)
      const summary = selected.documents.find(d => d.id === input.documentId)!
      if (!summary || summary.kind !== 'text' || effectiveState(summary,selected.documents) !== 'active') throw new ProjectError('VALIDATION')
      const project = owned.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(input.projectId) as { head_commit_id: string }
      const revisionId = randomUUID(), headCommitId = randomUUID(), time = new Date().toISOString()
      owned.db.prepare('DELETE FROM editor_ids WHERE project_id=? AND document_id=?').run(input.projectId, input.documentId)
      this.indexIds(owned.db, input.projectId, input.documentId, payload)
      const previousPayload = readDocument(JSON.parse((owned.db.prepare('SELECT payload FROM documents WHERE project_id=? AND id=?').get(input.projectId,input.documentId) as { payload: string }).payload))
      mapDocumentAnnotations(owned.db,input.projectId,input.documentId,previousPayload,payload)
      updateDocumentAnchors(owned.db,input.projectId,input.documentId,payload)
      projectCitations(owned.db,input.projectId,input.documentId,payload)
      reconcileAnnotationAnchors(owned.db,input.projectId)
      owned.db.prepare('UPDATE documents SET revision_id=?,payload=? WHERE project_id=? AND id=?').run(revisionId, JSON.stringify(payload), input.projectId, input.documentId)
      owned.db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(input.projectId, headCommitId, project.head_commit_id, time)
      owned.db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(headCommitId, time, input.projectId)
      automaticCheckpoint(owned.db,input.projectId)
      const receipt = { projectId: input.projectId, documentId: input.documentId, revisionId, headCommitId }
      owned.db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(input.projectId, input.operationId, digest, JSON.stringify(receipt))
      return receipt
    })
    await this.discovery(owned)
    return result
  }
  private async importImageUnlocked(input: WorkerImageImport): Promise<ImageAsset> {
    const owned = this.active
    if (!owned || owned.projectId !== input.projectId || owned.workspaceId !== input.workspaceId) throw new ProjectError('DENIED')
    if (this.fileBusy) throw new ProjectError('PROJECT_LOCKED')
    const prior = owned.db.prepare('SELECT media_type,sha256,byte_size FROM managed_assets WHERE project_id=? AND id=?').get(input.projectId, input.operationId) as { media_type: ImageAsset['mediaType']; sha256: string; byte_size: number } | undefined
    if (prior) {
      if (!isHash(prior.sha256) || prior.byte_size > IMAGE_LIMIT || !['image/png','image/jpeg'].includes(prior.media_type)) throw new ProjectError('OPERATION_CONFLICT')
      const path = join(owned.workspace, 'blobs', prior.sha256)
      await contained(this.root, path, false)
      const ref = await fileHash(path, IMAGE_LIMIT)
      if (ref.sha256 !== prior.sha256 || ref.bytes !== prior.byte_size) throw new ProjectError('CORRUPT_PROJECT')
      const bytes = await readFile(path)
      if (bytes.length !== prior.byte_size || createHash('sha256').update(bytes).digest('hex') !== prior.sha256) throw new ProjectError('CORRUPT_PROJECT')
      return { assetId: input.operationId, ...imageInfo(bytes) }
    }
    const bytes = await selectedImage(input.sourcePath)
    const info = imageInfo(bytes)
    const temporary = join(owned.workspace, 'blobs', `.image-${randomUUID()}`)
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
      const blob = await stageBlob(this.root, owned.workspace, temporary)
      inWriteTransaction(owned.db, () => {
        const project = owned.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(input.projectId) as { head_commit_id: string }
        const head = randomUUID(), time = new Date().toISOString()
        owned.db.prepare('INSERT INTO managed_assets VALUES (?,?,?,?,?,?)').run(input.projectId, input.operationId, input.originalName, info.mediaType, blob.bytes, blob.sha256)
        owned.db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(input.projectId, head, project.head_commit_id, time)
        owned.db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(head, time, input.projectId)
        const section = this.read(owned)
        owned.db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(input.projectId, input.operationId, requestDigest({ kind: 'image', id: input.operationId, sha256: blob.sha256 }), JSON.stringify({ projectId: input.projectId, documentId: section.documentId, revisionId: section.revisionId, headCommitId: head }))
      })
      await this.discovery(owned)
      return { assetId: input.operationId, ...info }
    } finally { await unlink(temporary).catch(() => {}) }
  }
  private async readImageUnlocked(input: ImageReadInput): Promise<ImageData> {
    const owned = this.active
    if (!owned || owned.projectId !== input.projectId || owned.workspaceId !== input.workspaceId) throw new ProjectError('DENIED')
    const row = owned.db.prepare('SELECT sha256,byte_size,media_type FROM managed_assets WHERE project_id=? AND id=?').get(input.projectId, input.assetId) as { sha256: string; byte_size: number; media_type: ImageAsset['mediaType'] } | undefined
    if (!row || !['image/png','image/jpeg'].includes(row.media_type)) throw new ProjectError('NOT_FOUND')
    if (!isHash(row.sha256)) throw new ProjectError('CORRUPT_PROJECT')
    if (row.byte_size > IMAGE_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
    const path = join(owned.workspace, 'blobs', row.sha256)
    await contained(this.root, path, false)
    const ref = await fileHash(path, IMAGE_LIMIT)
    if (ref.bytes !== row.byte_size || ref.sha256 !== row.sha256) throw new ProjectError('CORRUPT_PROJECT')
    const bytes = await readFile(path)
    if (bytes.length !== row.byte_size || imageInfo(bytes).mediaType !== row.media_type) throw new ProjectError('CORRUPT_PROJECT')
    return { mediaType: row.media_type, base64: bytes.toString('base64') }
  }
}
