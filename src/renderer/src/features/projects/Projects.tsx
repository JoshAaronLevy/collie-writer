import './Projects.css'
import OutlinePanel from '../outline/OutlinePanel'
import HistoryPanel from '../outline/HistoryPanel'
import { effectiveState, type OutlineInput, type OutlineChange, type HistoryView } from '../../../../shared/outline'
import type { DataLocations, RenameInput } from '../../../../shared/project-lifecycle'
import { ProjectManagement, RecoveryPanel } from './LifecyclePanel'
import { useEffect, useRef, useState } from 'react'
import type { StorageStatus } from '../../../../shared/storage'
import { projectMessages, type CommitInput, type CreateInput, type LocationStatus, type OpenInput, type OpenProject, type ProjectList, type ProjectResult, type SectionMetaInput } from '../../../../shared/projects'
import { fileBusy, sameScope, type FileAction, type FileJobView, type FileStatus, type SaveInput } from '../../../../shared/project-files'
import type { DocumentPayload } from '../../../../domain/editor/schema'
import type { Editor } from '@tiptap/core'
import { templateNames, type ProjectTemplate } from '../../../../domain/projects/templates'
import RichDraft from '../../editor/RichDraft'
import NotesPanel, { type AnnotationCapture } from './NotesPanel'
import SourcesPanel from './SourcesPanel'
import SourceInspector from './SourceInspector'
import EvidencePanel from './EvidencePanel'
import SearchPanel from './SearchPanel'
import CitationsPanel from './CitationsPanel'
import DocxExportPanel from './DocxExportPanel'
import InterchangeImportPanel from './InterchangeImportPanel'
import type { CitationsView } from '../../../../shared/citations'
import type { SourceRecord } from '../../../../shared/sources'
import type { SearchHit } from '../../../../shared/search'
import { editorIsComposing, serializeEditor } from '../../editor/adapter'
import FilePanel from './FilePanel'
import AccessPanel from './AccessPanel'
import TutorialPanel from './TutorialPanel'
import { canEditProject, sameProject, type AccessView } from '../../../../shared/access'
function scopeOf(project: OpenInput): OpenInput { return { projectId: project.projectId, workspaceId: project.workspaceId } }
const emptyFiles: FileStatus = { scope: null, destination: null, state: 'unsaved', job: null }
function readableDocument(payload: DocumentPayload): string {
  const pieces: string[] = []
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if ('type' in value && value.type === 'text' && 'text' in value && typeof value.text === 'string') { pieces.push(value.text); return }
    if ('type' in value && value.type === 'hardBreak') { pieces.push('\n'); return }
    if ('content' in value && Array.isArray(value.content)) { for (const child of value.content) visit(child); if ('type' in value && ['paragraph','heading','tableRow'].includes(String(value.type))) pieces.push('\n') }
  }
  visit(payload.ast)
  return pieces.join('')
}

export default function Projects({ storage }: { storage: StorageStatus }): React.JSX.Element {
  const [location, setLocation] = useState<LocationStatus | null>(null)
  const [list, setList] = useState<ProjectList>({ projects: [], issues: [] })
  const [project, setProject] = useState<OpenProject | null>(null)
  const [access,setAccess]=useState<AccessView|null>(null)
  function applyAccess(next:AccessView):void { setAccess(next) }
  const [editVersion, setEditVersion] = useState(0), [protectedVersion, setProtectedVersion] = useState(0), [editorEpoch, setEditorEpoch] = useState(0)
  const [newTemplate, setNewTemplate] = useState<ProjectTemplate>('blank')
  const [sectionTitle, setSectionTitle] = useState(''), [sectionStatus, setSectionStatus] = useState<'draft' | 'review' | 'complete'>('draft'), [sectionSynopsis, setSectionSynopsis] = useState('')
  const sectionFields = useRef({ title: '', status: 'draft' as 'draft' | 'review' | 'complete', synopsis: '' })
  const [busy, setBusy] = useState(false), [working, setActing] = useState(false), [closing, setClosing] = useState(false)
  const [committing, setCommitting] = useState(false), [retry, setRetry] = useState<CommitInput | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [history, setHistory] = useState<HistoryView | null>(null)
  const [annotationCapture, setAnnotationCapture] = useState<AnnotationCapture | null>(null)
  const [noteDirty, setNoteDirty] = useState(false)
  const noteDirtyRef = useRef(false), noteFlush = useRef<(() => Promise<boolean>) | null>(null)
  const noteAccessFlush=useRef<(()=>Promise<boolean>)|null>(null)
  const [sourceDirty,setSourceDirty]=useState(false)
  const [researchDirty,setResearchDirty]=useState(false),[inspectorDirty,setInspectorDirty]=useState(false)
  const researchDirtyRef=useRef(false),inspectorDirtyRef=useRef(false)
  const [inspectionTarget,setInspectionTarget]=useState<{sourceId:string;excerptId:string|null;versionId:string|null;pageIndex:number|null}|null>(null)
  const [focusNoteId,setFocusNoteId]=useState<string|null>(null),[focusSourceId,setFocusSourceId]=useState<string|null>(null),[focusEvidence,setFocusEvidence]=useState<{kind:'question'|'claim';id:string}|null>(null)
  const [citationContext,setCitationContext]=useState<{projectId:string;sources:SourceRecord[];view:CitationsView|null}|null>(null)
  const sourceDirtyRef=useRef(false),sourceFlush=useRef<(() => Promise<boolean>)|null>(null)
  const [outlineRetry, setOutlineRetry] = useState(false)
  const outlinePending = useRef<OutlineInput | null>(null)
  const anchorToFocus = useRef<string | null>(null)
  const acting = working || outlineRetry
  const [conflict, setConflict] = useState<OpenProject | null>(null)
  const [files, setFiles] = useState<FileStatus>(emptyFiles)
  const [data, setData] = useState<DataLocations | null>(null), [showArchived, setShowArchived] = useState(false)
  const renamePending = useRef<RenameInput | null>(null)
  const metaPending = useRef<SectionMetaInput | null>(null)
  const current = useRef<OpenProject | null>(null), editorRef = useRef<Editor | null>(null)
  const imageUrls = useRef(new Map<string, string>())
  const editVersionRef = useRef(0), protectedVersionRef = useRef(0), retryVersion = useRef(0)
  const retryCommit = useRef<CommitInput | null>(null), committingTask = useRef<Promise<OpenProject | null> | null>(null)
  const pendingCreate = useRef<CreateInput | null>(null), pendingSave = useRef<SaveInput | null>(null)
  const pendingImage = useRef<{ projectId: string; workspaceId: string; operationId: string; token: string; alt: string; caption: string } | null>(null)
  const actionTask = useRef<Promise<unknown> | null>(null), closingRef = useRef(false)
  const fileState = useRef<FileStatus>(emptyFiles), alive = useRef(true)
  const jobWaiters = useRef(new Map<string, Set<(job: FileJobView | null) => void>>())
  const finishedJobs = useRef(new Map<string, FileJobView>())
  const handlers = useRef<{ action: (action: FileAction) => Promise<void>; save: () => void }>({ action: async () => {}, save: () => {} })
  const selectedSection = project?.documents.find(doc => doc.id === project.documentId)
  const sectionReadOnly = !!selectedSection && effectiveState(selectedSection,project!.documents) !== 'active'
  const sectionDirty = !!selectedSection && (sectionTitle !== selectedSection.title || sectionStatus !== selectedSection.status || sectionSynopsis !== selectedSection.synopsis)
  const dirty = editVersion !== protectedVersion || sectionDirty || retry !== null || committing || noteDirty || sourceDirty || researchDirty || inspectorDirty
  const fileActive = fileBusy(files.job)
  const accessReadOnly=!!project&&!canEditProject(access,project)
  const accessTransition=!!access?.transition
  function updateProject(next: OpenProject | null): void { current.current = next; setProject(next) }
  function updateHead(next: OpenProject): void {
    updateProject(next)
    if (sameScope(scopeOf(next), fileState.current.scope) && ['saved','pending'].includes(fileState.current.state)) applyFiles({ ...fileState.current, state: next.headCommitId === fileState.current.destination?.headCommitId ? 'saved' : 'pending' })
  }
  function applyFiles(next: FileStatus): void {
    fileState.current = next; setFiles(next)
    if (next.job?.kind === 'backup' && next.job.capturedHead && ['archive','staging','replacing','verifying'].includes(next.job.phase)) setBusy(false)
    if (current.current && sameScope(scopeOf(current.current), next.scope)) updateProject({ ...current.current, destination: next.destination })
    if (next.job && !fileBusy(next.job)) {
      finishedJobs.current.set(next.job.id, next.job)
      if (finishedJobs.current.size > 64) finishedJobs.current.delete(finishedJobs.current.keys().next().value!)
      for (const resolve of jobWaiters.current.get(next.job.id) ?? []) resolve(next.job)
      jobWaiters.current.delete(next.job.id)
    }
  }
  function isMetaDirty(): boolean {
    const doc = current.current?.documents.find(item => item.id === current.current?.documentId), fields = sectionFields.current
    return !!doc && (fields.title !== doc.title || fields.status !== doc.status || fields.synopsis !== doc.synopsis)
  }
  function isDirty(): boolean { return editVersionRef.current !== protectedVersionRef.current || isMetaDirty() || !!retryCommit.current || !!committingTask.current || noteDirtyRef.current || sourceDirtyRef.current || researchDirtyRef.current || inspectorDirtyRef.current }
  function changed(): void {
    editVersionRef.current += 1; setEditVersion(editVersionRef.current)
    window.collie.setUnprotectedChanges(true)
    setNotice('Writing changed. Waiting for a local commit…')
  }
  useEffect(() => {
    alive.current = true
    void window.collie.getWorkingLocation().then(result => { if (alive.current) { if (result.ok) setLocation(result.value); else setError(result.error.message) } })
    const offFiles = window.collie.onFileStatus(applyFiles)
    const offAccess=window.collie.onAccessChanged(applyAccess)
    void window.collie.readAccess().then(result=>{if(alive.current){if(result.ok)applyAccess(result.value);else setError(result.error.message)}})
    const offActions = window.collie.onFileAction(action => { void handlers.current.action(action).catch(() => { setError('The action could not finish. Keep this window open and copy any unprotected writing.') }) })
    return () => { alive.current = false; offFiles(); offActions(); offAccess(); for (const url of imageUrls.current.values()) URL.revokeObjectURL(url); imageUrls.current.clear(); for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null); jobWaiters.current.clear() }
  }, [])
  useEffect(() => { window.collie.setUnprotectedChanges(dirty) }, [dirty])
  useEffect(() => {
    if (storage.state === 'ready') { void refreshData(); return }
    if (storage.state === 'unavailable') { for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null); jobWaiters.current.clear() }
  }, [storage.state])
  useEffect(() => {
    if (!project?.destination || fileActive || acting || closing || storage.state !== 'ready' || ['external-change','unavailable','interrupted','checking'].includes(files.state)) return
    if (!dirty && project.headCommitId === project.destination.headCommitId) return
    const timer = setTimeout(() => handlers.current.save(), 30000)
    return () => clearTimeout(timer)
  }, [editVersion, project?.headCommitId, project?.destination?.headCommitId, files.state, dirty, fileActive, acting, closing, storage.state])
  useEffect(() => {
    if (!project || !dirty || closing || storage.state !== 'ready') return
    const timer = setTimeout(() => { if (!actionTask.current && !retryCommit.current && !metaPending.current) void flushManuscript() }, 900)
    return () => clearTimeout(timer)
  }, [editVersion, sectionTitle, sectionStatus, sectionSynopsis, project?.documentId, closing, storage.state])
  useEffect(() => {
    if (!project || storage.state !== 'ready') return
    const timer = setInterval(() => { if (isDirty() && !retryCommit.current && !metaPending.current && !actionTask.current && !closingRef.current) void flushManuscript() }, 5000)
    return () => clearInterval(timer)
  }, [project?.documentId, storage.state])
  async function refresh(): Promise<void> {
    const result = await window.collie.listProjects()
    if (!alive.current) return
    if (result.ok) setList(result.value); else setError(result.error.message)
  }
  async function refreshData(): Promise<void> {
    const result = await window.collie.getDataLocations()
    if (!alive.current) return
    if (result.ok) { setData(result.value); setList(result.value.projects) } else { setError(result.error.message); await refresh() }
  }
  async function refreshFiles(): Promise<void> {
    const result = await window.collie.getProjectFileStatus(current.current ? scopeOf(current.current) : null)
    if (result.ok) applyFiles(result.value); else setError(result.error.message)
  }
  async function select(next: OpenProject): Promise<void> {
    const referenced = new Set<string>()
    const visit = (node: unknown): void => { if (!node || typeof node !== 'object') return; for (const [key, value] of Object.entries(node)) { if (key === 'assetId' && typeof value === 'string') referenced.add(value); else visit(value) } }
    visit(next.payload.ast)
    const loaded = new Map<string, string>()
    let imageIssue = '', imageBytes = 0
    for (const assetId of referenced) {
      const result = await window.collie.readImage({ ...scopeOf(next), assetId })
      if (!result.ok) { imageIssue = `Image ${assetId.slice(0, 8)} could not be loaded: ${result.error.message}`; continue }
      imageBytes += result.value.base64.length * 3 / 4
      if (imageBytes > 256 * 1024 * 1024) { imageIssue = 'This section has more than 256 MiB of image data. Some images were left as placeholders to keep editing available.'; break }
      const binary = atob(result.value.base64), bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      loaded.set(assetId, URL.createObjectURL(new Blob([bytes], { type: result.value.mediaType })))
    }
    for (const url of imageUrls.current.values()) URL.revokeObjectURL(url)
    imageUrls.current = loaded
    if (current.current?.projectId !== next.projectId) { setHistory(null);setInspectionTarget(null);setFocusNoteId(null);setFocusSourceId(null);setFocusEvidence(null) }
    setAnnotationCapture(null)
    updateProject(next); setConflict(null); setEditorEpoch(value => value + 1)
    const selected = next.documents.find(doc => doc.id === next.documentId)!
    setSectionTitle(selected.title); setSectionStatus(selected.status as 'draft' | 'review' | 'complete'); setSectionSynopsis(selected.synopsis); metaPending.current = null
    sectionFields.current = { title: selected.title, status: selected.status as 'draft' | 'review' | 'complete', synopsis: selected.synopsis }
    editVersionRef.current = 0; protectedVersionRef.current = 0; setEditVersion(0); setProtectedVersion(0)
    retryCommit.current = null; setRetry(null); pendingSave.current = null
    window.collie.setUnprotectedChanges(noteDirtyRef.current || sourceDirtyRef.current); setError(imageIssue); setNotice('Draft protected locally.')
    await refreshFiles()
  }
  async function importImage(): Promise<void> {
    const p = await flush()
    if (!p) return
    if (pendingImage.current && !sameScope(scopeOf(p), pendingImage.current)) { setError('Reopen the project with the pending image import before retrying it.'); return }
    if (!pendingImage.current) {
      const chosen = await window.collie.pickImage(scopeOf(p))
      if (!chosen.ok) { setError(chosen.error.message); return }
      if (!chosen.value) return
      const alt = window.prompt('Describe the image for readers using assistive technology. Leave empty only for a decorative image.', '')
      if (alt === null) return
      const caption = window.prompt('Caption (optional)', '')
      if (caption === null) return
      if (alt.length > 2000 || caption.length > 10000) { setError('Image description or caption is too long. The image was not imported.'); return }
      pendingImage.current = { ...scopeOf(p), operationId: crypto.randomUUID(), token: chosen.value.token, alt, caption }
    }
    const input = pendingImage.current
    const imported = await window.collie.importImage(input)
    if (!imported.ok) { if (imported.error.code !== 'UNAVAILABLE') pendingImage.current = null; setError(imported.error.message); return }
    pendingImage.current = null
    const data = await window.collie.readImage({ ...scopeOf(p), assetId: imported.value.assetId })
    if (!data.ok) { setError(data.error.message); return }
    const binary = atob(data.value.base64), bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    imageUrls.current.set(imported.value.assetId, URL.createObjectURL(new Blob([bytes], { type: data.value.mediaType })))
    const latest = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
    if (latest.ok) updateHead(latest.value)
    const scale = Math.min(1, 800 / imported.value.width, 1600 / imported.value.height)
    editorRef.current?.commands.insertContent({ type: 'image', attrs: { blockId: crypto.randomUUID(), assetId: imported.value.assetId, alt: input.alt, caption: input.caption, width: Math.max(1, Math.round(imported.value.width * scale)), height: Math.max(1, Math.round(imported.value.height * scale)) } })
    setNotice('Image copied into the project. Its placement is waiting for a local document commit.')
  }
  async function navigateSection(documentId: string, anchor?: string): Promise<void> {
    setBusy(true)
    try {
      const p = await flush(); if (!p) return
      const result = await window.collie.openSection({ ...scopeOf(p),documentId })
      if (!result.ok) { setError(result.error.message); return }
      anchorToFocus.current = anchor ?? null
      await select(result.value)
    } finally { setBusy(false) }
  }
  function navigateSearch(hit:SearchHit):void {
    if(hit.kind==='page'&&inspectorDirtyRef.current){setError('Save or clear the pending transcription before switching sources.');return}
    if((hit.kind==='question'||hit.kind==='claim')&&researchDirtyRef.current){setError('Save or discard pending research form edits before selecting another result.');return}
    if(hit.kind==='draft'&&hit.documentId)void navigateSection(hit.documentId,hit.anchorId??undefined).then(()=>{document.querySelector('.draft-panel')?.scrollIntoView({block:'start'})})
    else if(hit.kind==='note')setFocusNoteId(hit.entityId)
    else if(hit.kind==='source')setFocusSourceId(hit.entityId)
    else if(hit.kind==='question'||hit.kind==='claim')setFocusEvidence({kind:hit.kind,id:hit.entityId})
    else if(hit.kind==='page'&&hit.sourceId&&hit.versionId)setInspectionTarget({sourceId:hit.sourceId,excerptId:null,versionId:hit.versionId,pageIndex:hit.pageIndex})
  }
  async function loadHistory(checkpointId: string | null): Promise<void> {
    setBusy(true)
    const p = await flush(); if (!p) return
    const result = await window.collie.readHistory({ ...scopeOf(p),checkpointId })
    if (result.ok) setHistory(result.value); else setError(result.error.message)
  }
  async function performOutline(change?: OutlineChange): Promise<boolean> {
    if (!await waitActive()) return false
    setBusy(true)
    if (!outlinePending.current) {
      const p = await flush(); if (!p || !change) return false
      // Refresh revisions after the editor/metadata flush; no buffered content is overwritten.
      const latest = await window.collie.openSection({ ...scopeOf(p),documentId:p.documentId })
      if (!latest.ok) { setError(latest.error.message); return false }
      if (latest.value.headCommitId !== p.headCommitId) { setError('The project changed. Refresh its stored version before reorganizing; your current buffer is retained.'); return false }
      if (change.type === 'restore' && history?.checkpointId !== change.checkpointId) { setError('Select and review that checkpoint before restoring it.'); return false }
      if (['restore','prune','repair'].includes(change.type) && history?.headCommitId !== p.headCommitId) { setError('Refresh history after protecting your latest edits, then review this action again.'); return false }
      outlinePending.current = { ...scopeOf(p),operationId:crypto.randomUUID(),expectedHead:p.headCommitId,expectedRevisions:Object.fromEntries(latest.value.documents.map(d => [d.id,d.revisionId])),selectedId:p.documentId,change }
    }
    setOutlineRetry(true)
    const result = await window.collie.changeOutline(outlinePending.current)
    if (!result.ok) {
      if (result.error.code === 'UNAVAILABLE') setOutlineRetry(true)
      else { outlinePending.current = null; setOutlineRetry(false) }
      setError(result.error.code === 'VALIDATION' ? 'This outline change is not valid. Keep at least one active section, use a valid parent, and split between existing blocks. The whole change was left unapplied.' : result.error.message)
      return false
    }
    outlinePending.current = null; setOutlineRetry(false)
    await select(result.value)
    setHistory(null)
    setNotice('Outline/history change protected locally. The chosen file may still need Save.')
    await refresh()
    return true
  }
  async function saveSectionMeta(): Promise<void> {
    if (await flush()) await refresh()
  }
  async function protectText(value: DocumentPayload, version: number, prior?: CommitInput): Promise<OpenProject | null> {
    const p = current.current
    if (!p) return null
    const input = prior ?? { ...scopeOf(p), documentId: p.documentId, operationId: crypto.randomUUID(), expectedRevisionId: p.revisionId, payload: value }
    setCommitting(true); setError(''); setNotice('Protecting edits locally…'); window.collie.setUnprotectedChanges(true)
    const result = await window.collie.commitDocument(input)
    if (!alive.current) return null
    if (result.ok) {
      const next = { ...current.current!, documents: current.current!.documents.map(d => d.id === input.documentId ? { ...d, revisionId: result.value.revisionId } : d), payload: input.payload, revisionId: result.value.revisionId, headCommitId: result.value.headCommitId }
      updateHead(next); protectedVersionRef.current = version; setProtectedVersion(version)
      retryCommit.current = null; setRetry(null)
      setNotice(editVersionRef.current === protectedVersionRef.current ? 'Draft protected locally.' : 'The submitted draft is protected locally. Newer typing still needs protection.')
      setCommitting(false); return next
    }
    retryCommit.current = input; retryVersion.current = version; setRetry(input); setError(result.error.message)
    if (result.error.code === 'STALE_REVISION') {
      const stored = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
      if (stored.ok) setConflict(stored.value)
    }
    setNotice('Local acknowledgment failed. Your current writing is still visible and selectable; Retry keeps the same operation.')
    setCommitting(false); return null
  }
  async function flush(forAccess=false): Promise<OpenProject | null> {
    if(researchDirtyRef.current||inspectorDirtyRef.current){setError('Save or explicitly clear the pending question, claim, decision or transcription first. During an access change, use this project for free editing to finish those drafts.');return null}
    if (sourceFlush.current && !await sourceFlush.current()) return null
    const protectNotes=forAccess?noteAccessFlush.current:noteFlush.current
    if (protectNotes && !await protectNotes()) return null
    return flushManuscript()
  }
  async function flushManuscript(): Promise<OpenProject | null> {
    if (!current.current) return null
    const editor = editorRef.current
    if (!editor) { setError('This document could not be opened safely for editing. Its stored copy is retained.'); return null }
    if (editorIsComposing(editor)) { setError('Finish composing the current text before saving or closing.'); return null }
    let requested: DocumentPayload
    try { requested = serializeEditor(editor) }
    catch { setError('This edit cannot be protected yet. Keep the window open and copy the visible writing; unsupported content was not discarded.'); return null }
    const version = editVersionRef.current
    const previous = committingTask.current
    const task = (previous ?? Promise.resolve(current.current)).then(async result => {
      if (previous && !result) return null
      if (retryCommit.current && !await protectText(retryCommit.current.payload, retryVersion.current, retryCommit.current)) return null
      const written = version !== protectedVersionRef.current ? await protectText(requested, version) : current.current
      if (!written || !isMetaDirty()) return written
      const fields = { ...sectionFields.current }
      metaPending.current ??= { ...scopeOf(written), documentId: written.documentId, operationId: crypto.randomUUID(), expectedHead: written.headCommitId, title: fields.title.trim(), status: fields.status, synopsis: fields.synopsis }
      const meta = await window.collie.updateSectionMeta(metaPending.current)
      if (!meta.ok) {
        if (meta.error.code !== 'UNAVAILABLE') metaPending.current = null
        setError(meta.error.message)
        if (meta.error.code === 'STALE_REVISION') {
          const stored = await window.collie.openSection({ ...scopeOf(written), documentId: written.documentId })
          if (stored.ok) setConflict(stored.value)
        }
        return null
      }
      metaPending.current = null; updateHead(meta.value)
      if (fields.title === sectionFields.current.title && fields.status === sectionFields.current.status && fields.synopsis === sectionFields.current.synopsis) {
        const saved = meta.value.documents.find(doc => doc.id === meta.value.documentId)!
        sectionFields.current = { title: saved.title, status: saved.status as 'draft' | 'review' | 'complete', synopsis: saved.synopsis }
        setSectionTitle(saved.title); setSectionStatus(saved.status as 'draft' | 'review' | 'complete'); setSectionSynopsis(saved.synopsis)
      }
      setNotice('Section details protected locally. The selected file may still need Save.')
      return meta.value
    })
    committingTask.current = task
    try { return await task } finally { if (committingTask.current === task) committingTask.current = null; window.collie.setUnprotectedChanges(isDirty()) }
  }
  function waitJob(id: string): Promise<FileJobView | null> {
    const finished = finishedJobs.current.get(id)
    if (finished) return Promise.resolve(finished)
    const job = fileState.current.job
    if (job?.id === id && !fileBusy(job)) return Promise.resolve(job)
    return new Promise(resolve => { const group = jobWaiters.current.get(id) ?? new Set(); group.add(resolve); jobWaiters.current.set(id, group) })
  }
  async function finishJob(result: ProjectResult<FileStatus>, id: string): Promise<FileJobView | null> {
    if (result.ok) applyFiles(result.value)
    else { setError(result.error.message); if (fileState.current.job?.id !== id) return null }
    const job = await waitJob(id)
    if (job?.error) setError(projectMessages[job.error])
    return job
  }
  function run(work: () => Promise<unknown>): void {
    if (actionTask.current || closingRef.current) return
    setActing(true)
    const task = work().catch(() => { setError('The operation could not finish. Keep this window open; your current writing is still here.') }).finally(() => { actionTask.current = null; setActing(false); setBusy(false) })
    actionTask.current = task
  }
  async function waitActive(): Promise<boolean> {
    const job = fileState.current.job
    if (!fileBusy(job) || !job) return true
    return !!await waitJob(job.id)
  }
  async function save(as: boolean, automatic = false): Promise<boolean> {
    if (!await waitActive()) return false
    setBusy(true)
    const p = await flush()
    if (!p) { setBusy(false); return false }
    await refreshFiles()
    if (!await waitActive()) { setBusy(false); return false }
    let token: string | null = null
    const destination = fileState.current.destination
    if (automatic && (!destination || ['external-change','unavailable','interrupted'].includes(fileState.current.state))) { setBusy(false); return false }
    if ((as || !destination) && !(pendingSave.current && !as)) {
      const choice = await window.collie.pickProjectFile({ purpose: 'save', scope: scopeOf(p) })
      if (!choice.ok || !choice.value) { if (!choice.ok) setError(choice.error.message); setBusy(false); return false }
      token = choice.value.token
    }
    const retrying = !!pendingSave.current && !as
    const input: SaveInput = retrying ? pendingSave.current! : { scope: scopeOf(p), operationId: crypto.randomUUID(), minimumHead: p.headCommitId, expectedGeneration: destination?.generationId ?? null, token }
    pendingSave.current = input; setBusy(false); setError('')
    const result = await window.collie.saveProjectFile(input)
    const job = await finishJob(result, input.operationId)
    if (job || !result.ok && result.error.code !== 'UNAVAILABLE') pendingSave.current = null
    if (job?.state === 'completed') {
      // Reconcile the old request before capturing any newer edits submitted with this explicit Save.
      if (retrying && fileState.current.destination?.headCommitId !== p.headCommitId) return save(false, automatic)
      await refresh(); return true
    }
    return false
  }
  async function openLocal(scope: OpenInput): Promise<void> {
    const result = await window.collie.openProject(scope)
    if (result.ok) await select(result.value); else setError(result.error.message)
  }
  async function openFile(inspect = false, locate = false, shell = false): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    if (current.current && !await flush()) return
    const p = current.current, operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (inspect && p) result = await window.collie.inspectProjectFile({ scope: scopeOf(p), operationId })
    else {
      const choice = shell ? await window.collie.claimShellProjectFile() : await window.collie.pickProjectFile({ purpose: locate ? 'locate' : 'open', scope: locate && p ? scopeOf(p) : null })
      if (!choice.ok || !choice.value) { if (!choice.ok) setError(choice.error.message); return }
      result = locate && p ? await window.collie.locateProjectFile({ scope: scopeOf(p), operationId, token: choice.value.token }) : await window.collie.openProjectFile({ operationId, token: choice.value.token })
    }
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed' && job.opened) await openLocal(job.opened)
    await refresh()
  }
  async function lifecycleFile(kind: 'backup' | 'move' | 'duplicate' | 'restore' | 'recover', artifactId?: string): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    const p = current.current ? await flush() : null
    if (current.current && !p) return
    const operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (kind === 'recover' && artifactId) result = await window.collie.recoverProjectVersion({ operationId, artifactId })
    else if (kind === 'restore') {
      const selection = await window.collie.pickProjectFile({ purpose: 'restore', scope: null })
      if (!selection.ok || !selection.value) { if (!selection.ok) setError(selection.error.message); return }
      result = await window.collie.restoreProject({ operationId, token: selection.value.token })
    } else if (p && kind === 'duplicate') result = await window.collie.duplicateProject({ operationId, scope: scopeOf(p), expectedHead: p.headCommitId })
    else if (p && (kind === 'backup' || kind === 'move')) {
      await refreshFiles(); if (!await waitActive()) return
      const selection = await window.collie.pickProjectFile({ purpose: kind, scope: scopeOf(p) })
      if (!selection.ok || !selection.value) { if (!selection.ok) setError(selection.error.message); return }
      const input: SaveInput = { operationId, scope: scopeOf(p), minimumHead: p.headCommitId, expectedGeneration: fileState.current.destination?.generationId ?? null, token: selection.value.token }
      result = kind === 'backup' ? await window.collie.backupProject(input) : await window.collie.moveProject(input)
    } else return
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed') {
      if (job.opened) await openLocal(job.opened)
      setNotice(kind === 'backup' ? `Backup written and reopened at revision ${job.capturedHead?.slice(0, 8) ?? ''}. The save location is unchanged; later typing may still need protection.` : kind === 'move' ? 'New location written and reopened. The old file is retained.' : 'Independent project opened. The original work is retained.')
    }
    if (!await waitActive()) return
    await refreshData()
  }
  async function manage(title?: string): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    const p = await flush()
    if (!p) return
    if (renamePending.current && !sameScope(renamePending.current.scope, scopeOf(p))) { setError('Reopen the project with the pending rename before retrying it.'); return }
    if (title !== undefined) {
      renamePending.current ??= { scope: scopeOf(p), operationId: crypto.randomUUID(), expectedHead: p.headCommitId, title }
      const result = await window.collie.renameProject(renamePending.current)
      if (result.ok) {
        renamePending.current = null
        const selected = await window.collie.openSection({ ...scopeOf(result.value), documentId: p.documentId })
        await select(selected.ok ? selected.value : result.value)
      }
      else { if (result.error.code !== 'UNAVAILABLE') renamePending.current = null; setError(result.error.message); return }
    } else {
      const result = await window.collie.archiveProject({ scope: scopeOf(p), archived: !p.archived })
      if (result.ok) {
        const selected = await window.collie.openSection({ ...scopeOf(result.value), documentId: p.documentId })
        await select(selected.ok ? selected.value : result.value)
        setNotice(result.value.archived ? 'Archived locally. Enable Show archived projects to find it again.' : 'Project returned to the active list.')
      }
      else { setError(result.error.message); return }
    }
    await waitActive(); await refreshData()
  }
  async function resetLocal(review: string): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    const wasDirty = isDirty()
    if (current.current && !await flush()) return
    if (wasDirty) { await refreshData(); setError('Writing was protected. Review the updated project list before confirming reset again.'); return }
    const result = await window.collie.resetLocalWork({ review, confirmation: 'RESET LOCAL WORK' })
    if (!result.ok) {
      setError(result.error.message)
      // A lost response is not proof that reset rolled back. Keep the buffer visible for copying.
      if (result.error.code === 'UNAVAILABLE') setNotice('Reset outcome is unknown. Refresh recovery before opening or creating another project. Your visible writing remains available for copying.')
      return
    }
    updateProject(null); editVersionRef.current = 0; protectedVersionRef.current = 0; setEditVersion(0); setProtectedVersion(0)
    retryCommit.current = null; setRetry(null); pendingSave.current = null; pendingCreate.current = null; renamePending.current = null
    applyFiles(emptyFiles); window.collie.setUnprotectedChanges(false)
    setData(result.value); setList(result.value.projects); setNotice('Local list reset. Recover the retained projects in Reset recovery.')
  }
  async function handleAction(action: FileAction): Promise<void> {
    if (action.kind === 'close-cancelled') { closingRef.current = false; setClosing(false); return }
    if (action.kind === 'resume') { await refreshFiles(); return }
    if (action.kind === 'suspend') { if (!closingRef.current && !outlinePending.current) await flush(); return }
    if (action.kind !== 'close') {
      if (outlinePending.current) { setError('Reconcile the pending outline/history operation before opening or saving.'); return }
      if (action.kind === 'save' && actionTask.current && fileState.current.job?.kind === 'save' && !closingRef.current) {
        const pending = actionTask.current
        const requested = await flush()
        if (!requested) return
        await pending
        if (current.current && sameScope(scopeOf(requested), scopeOf(current.current))) run(() => save(false))
        return
      }
      if (action.kind === 'open') run(() => openFile())
      else if (action.kind === 'open-shell') run(() => openFile(false, false, true))
      else run(() => save(action.kind === 'save-as'))
      return
    }
    if (closingRef.current) { window.collie.finishClose(action.id, 'cancel'); return }
    closingRef.current = true; setClosing(true)
    let outcome: 'saved' | 'local' | 'failed' | 'cancel' = 'failed'
    try {
      await actionTask.current
      if (!await waitActive()) return
      if (outlinePending.current && !await performOutline()) return
      if (!current.current) { outcome = 'saved'; return }
      if (!await flush()) return
      await refreshFiles(); if (!await waitActive()) return
      if (current.current.destination && (fileState.current.state !== 'saved' || current.current.headCommitId !== fileState.current.destination?.headCommitId)) {
        const succeeded = await save(false)
        outcome = succeeded && !isDirty() ? 'saved' : !isDirty() ? 'local' : 'failed'
      } else outcome = current.current.destination ? 'saved' : 'local'
    } finally {
      // Keep typing locked until main either closes the window or explicitly releases this handshake.
      setBusy(false)
      window.collie.setUnprotectedChanges(isDirty()); window.collie.finishClose(action.id, outcome)
    }
  }
  handlers.current = { action: handleAction, save: () => run(() => save(false, true)) }
  async function captureAnnotation(): Promise<void> {
    const p = current.current, e = editorRef.current
    if (!p || !e) return
    const selection = e.state.selection
    if (selection.empty || !selection.$from.sameParent(selection.$to) || !['paragraph','heading'].includes(selection.$from.parent.type.name)) { setError('Select text within one paragraph or heading to annotate.'); return }
    const blockId = selection.$from.parent.attrs.blockId as string | undefined
    const startOffset = selection.$from.parentOffset, endOffset = selection.$to.parentOffset
    const quote = selection.$from.parent.textBetween(startOffset,endOffset,'\n','\ufffc')
    if (!blockId || !quote || quote.length !== endOffset-startOffset || quote.length > 10000) { setError('Select plain text within one paragraph or heading.'); return }
    const saved = await flush()
    if (!saved) return
    setAnnotationCapture({ documentId:saved.documentId,expectedRevisionId:saved.revisionId,blockId,startOffset,endOffset,quote })
    setNotice('Selected passage ready in Passage annotations below.')
  }
  async function afterNoteCommit(): Promise<void> {
    const p = current.current
    if (!p) return
    const result = await window.collie.openSection({ ...scopeOf(p),documentId:p.documentId })
    if (result.ok) updateHead(result.value); else setError(result.error.message)
    await refresh()
  }
  async function changeAccess(kind:'designate'|'finish'|'import'):Promise<void>{
    setBusy(true)
    const keepActive=kind==='designate'&&!!access?.transition&&sameProject(current.current,access.transition.scope)
    if(!keepActive&&current.current&&!await flush(true))return
    window.collie.setUnprotectedChanges(isDirty())
    if(!keepActive&&isDirty()){setError('Protect every pending draft before changing access.');return}
    const latest=await window.collie.readAccess()
    if(!latest.ok){setError(latest.error.message);return}
    applyAccess(latest.value)
    const result=kind==='designate'&&current.current
      ?await window.collie.designateFreeProject({scope:scopeOf(current.current),expectedRevision:latest.value.revision})
      :kind==='finish'&&latest.value.transition
        ?await window.collie.finishAccessTransition({transitionId:latest.value.transition.id})
        :kind==='import'?await window.collie.importAccessGrant():null
    if(result){if(result.ok){applyAccess(result.value);setNotice('Access settings updated. Existing writing and saved files were kept.')}else setError(result.error.message)}
  }
  async function openTutorial(reset:boolean):Promise<void>{
    setBusy(true)
    if(current.current&&!await flush())return
    window.collie.setUnprotectedChanges(isDirty())
    if(isDirty()){setError('Protect pending drafts before opening or resetting the sample.');return}
    const result=await window.collie.openTutorial({reset})
    if(!result.ok){setError(result.error.message);return}
    await select(result.value)
    await refresh()
    await refreshData()
    const updated=await window.collie.readAccess()
    if(updated.ok)applyAccess(updated.value)
    setNotice(reset?'Fresh sample opened. The previous sample remains a local project.':'Tutorial sample opened. The fictional source and cited draft are ready.')
  }
  const available = storage.state === 'ready' && location?.state === 'ready'
  return <section className="projects" aria-labelledby="projects-title">
    <h1 id="projects-title">Your projects</h1>
    <p>Write locally and choose a separate save location for each project.</p>
    <TutorialPanel ready={!!access?.sampleProject&&list.projects.some(p=>sameProject(p,access?.sampleProject??null))} active={!!project&&sameProject(project,access?.sampleProject??null)} disabled={!available||busy||acting||fileActive||closing} start={()=>run(()=>openTutorial(false))} reset={()=>run(()=>openTutorial(true))}/>
    <AccessPanel access={access} project={project} list={list} disabled={!available||busy||acting||fileActive||closing} designate={()=>run(()=>changeAccess('designate'))} finish={()=>run(()=>changeAccess('finish'))} importGrant={()=>run(()=>changeAccess('import'))}/>
    {!location ? <p role="status">Finding the local working folder…</p> : <details className="working-location" open={location.state === 'required'}>
      <summary>Working-data location</summary><p>{location.message}</p>
      {location.path ? <p className="location-path">{location.path}</p> : <button disabled={acting} onClick={() => run(async () => { const result = await window.collie.chooseWorkingLocation(); if (result.ok) setLocation(result.value); else setError(result.error.message) })}>Choose local working folder…</button>}
      <p>Keep this folder outside sync or mirroring tools. Portable files can go in your chosen local cloud folders.</p>
    </details>}
    {storage.state === 'unavailable' ? <p role="alert">The storage process is unavailable. Keep this window open and copy any unprotected text before quitting.</p> : null}
    <div className="project-actions" id="new-project" tabIndex={-1}>
      <label>Template <select value={newTemplate} disabled={!available || acting || fileActive || closing} onChange={event => { setNewTemplate(event.target.value as ProjectTemplate); pendingCreate.current = null }}>{(Object.keys(templateNames) as ProjectTemplate[]).map(template => <option key={template} value={template}>{templateNames[template]}</option>)}</select></label>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(async () => {
        setBusy(true); if (current.current && !await flush()) return
        pendingCreate.current ??= { operationId: crypto.randomUUID(), template: newTemplate }
        const result = await window.collie.createProject(pendingCreate.current)
        if (result.ok) { pendingCreate.current = null; await select(result.value); await refresh() } else setError(result.error.message)
      })}>{pendingCreate.current ? 'Retry project creation' : 'Create project'}</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(() => openFile())}>Open project file…</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(() => lifecycleFile('restore'))}>Restore backup…</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(refreshData)}>Refresh projects</button>
    </div>
    <h2>Recent and recovered local projects</h2>
    <p>Each entry shows its last local commit. Open it to check the selected file and reconcile an interrupted save.</p>
    <label><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Show archived projects</label>
    <ul className="project-list">{list.projects.filter(p => showArchived || !p.archived).map(p => <li key={p.projectId}>
      <button aria-current={project?.projectId === p.projectId ? 'true' : undefined} disabled={!available || acting || fileActive || closing} onClick={() => run(async () => { setBusy(true); if (current.current && !await flush()) return; await openLocal(scopeOf(p)) })}>
        {p.title}{sameProject(p,access?.sampleProject??null)?' · tutorial sample':''}{p.archived ? ' · archived' : ''} <span className="project-id">{p.projectId.slice(0, 8)}</span>
        <small>{p.destination ? `${p.destination.path} · availability checked on open${p.headCommitId !== p.destination.headCommitId ? ' · newer edits protected locally' : ''}` : 'Local recovery · no file destination'} · {new Date(p.updatedAt).toLocaleString()}</small>
      </button>
    </li>)}</ul>
    {list.issues.map(issue => <p role="alert" key={issue.projectId}>Project {issue.projectId.slice(0, 8)}: {projectMessages[issue.code]}</p>)}
    {project ? <div className="writing-inspection-layout"><div className="draft-panel">
      <h2>{project.title} · {project.projectId.slice(0, 8)}</h2>
      <OutlinePanel key={project.projectId} project={project} readOnly={accessReadOnly||accessTransition} disabled={busy || acting || closing || committing || fileActive} change={change => run(() => performOutline(change))} select={id => run(() => navigateSection(id))} />
      {sectionReadOnly ? <p role="status">This section is archived or in trash. Restore its outline item and any removed parent to edit it.</p> : null}
      <form className="section-details" onSubmit={event => { event.preventDefault(); run(saveSectionMeta) }}>
        <label>Section title <input value={sectionTitle} maxLength={500} required disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition} onChange={event => { sectionFields.current.title = event.target.value; setSectionTitle(event.target.value); metaPending.current = null }} /></label>
        <label>Status <select value={sectionStatus} disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition} onChange={event => { sectionFields.current.status = event.target.value as 'draft' | 'review' | 'complete'; setSectionStatus(sectionFields.current.status); metaPending.current = null }}><option value="draft">Draft</option><option value="review">Review</option><option value="complete">Complete</option></select></label>
        <label>Synopsis <textarea value={sectionSynopsis} maxLength={10000} disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition} onChange={event => { sectionFields.current.synopsis = event.target.value; setSectionSynopsis(event.target.value); metaPending.current = null }} /></label>
        <button type="submit" disabled={busy || acting || closing || sectionReadOnly || accessReadOnly || accessTransition}>{metaPending.current ? 'Retry section details' : 'Save section details'}</button>
      </form>
      <RichDraft key={`${project.projectId}-${project.documentId}-${editorEpoch}`} payload={project.payload} references={{focusAnchor:anchorToFocus.current,projectId:project.projectId,sources:citationContext?.projectId===project.projectId?citationContext.sources:[],labels:new Map(!dirty&&citationContext?.projectId===project.projectId&&citationContext.view?.headCommitId===project.headCommitId?citationContext.view.labels.map(label=>[label.id,label.text]):[])}} disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition || storage.state !== 'ready'} onReady={editor => { editorRef.current = editor; if (editor && anchorToFocus.current) { const id = anchorToFocus.current; anchorToFocus.current = null; let target: number | null = null; editor.state.doc.descendants((node,position) => { if (node.attrs.blockId === id || node.attrs.citationId === id || node.attrs.footnoteId === id) { target = position; return false }; return true }); if (target !== null) { editor.commands.setTextSelection(Math.min(target+1,editor.state.doc.content.size)); editor.commands.focus(); editor.view.dispatch(editor.state.tr.scrollIntoView()) } } }} onChange={changed} onIssue={setError} onBlur={() => { if (isDirty() && !actionTask.current) void flushManuscript() }} imageUrl={assetId => imageUrls.current.get(assetId)} importImage={() => run(importImage)} />
        <button type="button" disabled={busy || closing || sectionReadOnly || accessReadOnly || accessTransition} onMouseDown={event => event.preventDefault()} onClick={() => { void captureAnnotation() }}>Annotate selection</button>
        <div className="project-actions"><button disabled={busy || committing || closing || outlineRetry || sectionReadOnly || (!accessTransition && accessReadOnly) || !dirty || storage.state !== 'ready'} onClick={() => { void flush().then(() => refresh()) }}>{committing ? 'Protecting…' : retry ? 'Retry local commit' : 'Protect locally'}</button>
        <button onClick={() => { editorRef.current?.commands.focus(); editorRef.current?.commands.selectAll() }}>Select all for copying</button></div>
        <p>For an emergency copy, select this section and use your system Copy command, then paste into another local document.</p>
      <p role="status">{notice}</p>
      {conflict ? <details className="conflict-panel" open><summary>Stored version differs from this visible draft</summary><p>Keep this draft open for copying. The stored section below is a separate read-only copy; Collie Writer has not overwritten either version.</p><textarea readOnly aria-label="Stored section text for copying" value={readableDocument(conflict.payload)} /></details> : null}
    </div>{inspectionTarget?<SourceInspector dirtyChanged={value=>{inspectorDirtyRef.current=value;setInspectorDirty(value);window.collie.setUnprotectedChanges(isDirty())}} readOnly={accessReadOnly||accessTransition} key={`${project.projectId}-${inspectionTarget.sourceId}`} project={project} sourceId={inspectionTarget.sourceId} focusExcerptId={inspectionTarget.excerptId} focusVersionId={inspectionTarget.versionId} focusPageIndex={inspectionTarget.pageIndex} disabled={busy||closing||outlineRetry||sourceDirty||storage.state!=='ready'} onCommitted={afterNoteCommit} close={()=>{if(inspectorDirtyRef.current){setError('Save or clear the pending transcription before closing the inspector.');return}setInspectionTarget(null)}} />:null}</div> : <p>Select a local project, open a file or create a blank project to begin.</p>}
    {project ? <CitationsPanel readOnly={accessReadOnly||accessTransition} key={project.projectId} project={project} dirty={dirty} disabled={busy||closing||acting||fileActive||storage.state!=='ready'} flush={flush} onCommitted={afterNoteCommit} onContext={(sources,view)=>setCitationContext({projectId:project.projectId,sources,view})} navigate={navigateSection} source={id=>setFocusSourceId(id)} /> : null}
    {project ? <DocxExportPanel paid={access?.paid??false} key={project.projectId} project={project} disabled={busy||closing||acting||fileActive||storage.state!=='ready'} flush={flush} onProject={updateProject} /> : null}
    {project ? <InterchangeImportPanel key={`import-${project.projectId}`} project={project} disabled={busy||closing||acting||fileActive||accessReadOnly||accessTransition||storage.state!=='ready'} flush={flush} onProject={updateProject} /> : null}
    {project ? <NotesPanel key={project.projectId} project={project} capture={annotationCapture} focusNoteId={focusNoteId} disabled={accessReadOnly || accessTransition || busy || closing || outlineRetry || storage.state !== 'ready'} registerFlush={fn => { noteFlush.current = fn }} registerAccessFlush={fn=>{noteAccessFlush.current=fn}} dirtyChanged={value => { noteDirtyRef.current = value; setNoteDirty(value); window.collie.setUnprotectedChanges(isDirty()) }} onCommitted={afterNoteCommit} navigate={(id,anchor) => navigateSection(id,anchor)} /> : null}
    {project ? <SourcesPanel readOnly={accessReadOnly||accessTransition} key={project.projectId} project={project} focusSourceId={focusSourceId} disabled={busy || closing || outlineRetry || storage.state !== 'ready'} registerFlush={fn=>{sourceFlush.current=fn}} dirtyChanged={value=>{sourceDirtyRef.current=value;setSourceDirty(value);window.collie.setUnprotectedChanges(isDirty())}} onCommitted={afterNoteCommit} onInspect={sourceId=>{if(inspectorDirtyRef.current){setError('Save or clear the pending transcription before switching sources.');return}setInspectionTarget({sourceId,excerptId:null,versionId:null,pageIndex:null})}} /> : null}
    {project ? <EvidencePanel dirtyChanged={value=>{researchDirtyRef.current=value;setResearchDirty(value);window.collie.setUnprotectedChanges(isDirty())}} readOnly={accessReadOnly||accessTransition} key={project.projectId} project={project} focusItem={focusEvidence} disabled={busy || closing || outlineRetry || noteDirty || sourceDirty || storage.state !== 'ready'} onCommitted={afterNoteCommit} navigate={(id,anchor)=>navigateSection(id,anchor)} inspect={(sourceId,excerptId)=>{if(inspectorDirtyRef.current){setError('Save or clear the pending transcription before switching sources.');return}setInspectionTarget({sourceId,excerptId,versionId:null,pageIndex:null})}} /> : null}
    {project ? <SearchPanel key={project.projectId} project={project} navigate={navigateSearch} /> : null}
    {outlineRetry ? <p role="alert">The outline/history operation has an unknown outcome. Editing is paused until the same operation is reconciled. <button disabled={working || closing} onClick={() => run(() => performOutline())}>Retry pending outline/history operation</button></p> : null}
    {project ? <HistoryPanel key={project.projectId} project={project} readOnly={accessReadOnly||accessTransition} history={history} disabled={busy || acting || closing || committing || fileActive} change={change => run(() => performOutline(change))} read={id => run(() => loadHistory(id))} navigate={(doc,anchor) => run(() => navigateSection(doc,anchor))} /> : null}
    {project || fileActive ? <FilePanel status={files} dirty={dirty} disabled={!project || !available || acting || closing} save={as => run(() => save(as))} reveal={()=>run(async()=>{if(!current.current)return;const result=await window.collie.revealProjectFile(scopeOf(current.current));if(!result.ok)setError(result.error.message)})} locate={() => run(() => openFile(false, true))} inspect={() => run(() => openFile(true))} answer={(id, choice) => { void window.collie.answerFileJob({ id, choice }).then(result => { if (!result.ok) setError(result.error.message) }) }} cancel={id => { void window.collie.cancelFileJob(id).then(result => { if (!result.ok) setError(result.error.message) }) }} consent={id => { void window.collie.confirmFileOverwrite(id).then(result => { if (!result.ok) setError(result.error.message) }) }} /> : null}
    {project ? <ProjectManagement readOnly={accessReadOnly||accessTransition} key={`${project.projectId}-${project.title}`} project={project} disabled={!available || acting || fileActive || closing} rename={title => run(() => manage(title))} archive={() => run(() => manage())} backup={() => run(() => lifecycleFile('backup'))} move={() => run(() => lifecycleFile('move'))} duplicate={() => run(() => lifecycleFile('duplicate'))} /> : null}
    <RecoveryPanel data={data} openProject={scope => run(async () => { setBusy(true); if (current.current && !await flush()) return; await openLocal(scope); await waitActive(); await refreshData() })} disabled={!available || acting || fileActive || closing} refresh={() => run(refreshData)} reveal={()=>run(async()=>{const result=await window.collie.revealWorkingData();if(!result.ok)setError(result.error.message)})} inspect={id => run(() => lifecycleFile('recover', id))} reset={review => run(() => resetLocal(review))} recoverReset={id => run(async () => {
      setBusy(true); if (current.current && !await flush()) return
      const result = await window.collie.recoverReset(id)
      if (result.ok) { setData(result.value); setList(result.value.projects) } else setError(result.error.message)
    })} cleanup={() => run(async () => {
      const result = await window.collie.clearPickerHistory()
      if (result.ok) { setData(result.value); setList(result.value.projects); setNotice('Picker history cleared. All work and retained recovery were kept.') } else setError(result.error.message)
    })} />
    {closing ? <p role="status">Protecting writing and finishing file work before closing…</p> : null}
    {error ? <p className="project-error" role="alert">{error}</p> : null}
  </section>
}
