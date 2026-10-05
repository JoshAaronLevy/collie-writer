import { closeHistory } from '@tiptap/pm/history'
import { replaceMechanicsFinding } from '../../../../domain/ai/proofreading'
import type {
  ProofreadCapture,
  ProofreadFinding,
  ProofreadDecision
} from '../../../../shared/proofreading'
import { manuscriptAnchor, payloadHasAnchor } from '../../editor/anchors'
import { useWritingPreferences } from './useWritingPreferences'
import { captureSelection, restoreSelection } from '../../editor/selection'
import { useExportOperations } from './useExportOperations'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  effectiveState,
  type OutlineInput,
  type OutlineChange,
  type HistoryView
} from '../../../../shared/outline'
import type { DataLocations, RenameInput } from '../../../../shared/project-lifecycle'
import type { StorageStatus } from '../../../../shared/storage'
import {
  projectMessages,
  type CommitInput,
  type CreateInput,
  type LocationStatus,
  type OpenInput,
  type OpenProject,
  type ProjectList,
  type ProjectResult,
  type SectionMetaInput
} from '../../../../shared/projects'
import {
  fileBusy,
  sameScope,
  type FileAction,
  type FileJobView,
  type FileStatus,
  type SaveInput
} from '../../../../shared/project-files'
import type { DocumentPayload } from '../../../../domain/editor/schema'
import type { Editor } from '@tiptap/core'
import { hasResumableSetup } from '../onboarding/setup-draft'
import { forgetLastProject, readLastProject, rememberLastProject } from '../library/last-project'
import type { AnnotationCapture } from '../projects/NotesPanel'
import type { CitationsView } from '../../../../shared/citations'
import type { SourceRecord } from '../../../../shared/sources'
import type { SearchHit } from '../../../../shared/search'
import {
  editorIsComposing,
  serializeEditor,
  hydrateDocument,
  lockEditorMutation,
  dispatchProtectedCorrection
} from '../../editor/adapter'
import { canEditProject, sameProject, type AccessView } from '../../../../shared/access'
import { writingDestination, type AppDestination, type ResearchTarget } from '../../app/navigation'
import { DraftRegistry, type DraftBlocker, type DraftHandle, type FlushMode } from './drafts'
export function scopeOf(project: OpenInput): OpenInput {
  return { projectId: project.projectId, workspaceId: project.workspaceId }
}
const emptyFiles: FileStatus = { scope: null, destination: null, state: 'unsaved', job: null }

export function useWorkspaceController(storage: StorageStatus) {
  const exportOperations = useExportOperations()
  const writingView = useWritingPreferences()
  const composition = useRef(false)
  const [proofreadingLocked, setProofreadingLocked] = useState(false)
  const proofreadingBusy = useRef(false)
  const proofreadingApplication = useRef<{
    input: ProofreadDecision
    capture: ProofreadCapture
    finding: ProofreadFinding
    before: Editor['state']['doc']
    after: DocumentPayload
  } | null>(null)
  const [drafts] = useState(() => new DraftRegistry())
  const draftRevision = useSyncExternalStore(drafts.subscribe, drafts.version)
  const [destination, setDestination] = useState<AppDestination>({ kind: 'setup' })
  const destinationRef = useRef(destination)
  destinationRef.current = destination
  const initialDestinationResolved = useRef(false)
  const [startupPending, setStartupPending] = useState(true)
  const [libraryIssue, setLibraryIssue] = useState<string | null>(null)
  const [libraryView, setLibraryView] = useState<'recent' | 'active' | 'archived'>('recent')
  const [focusRevision, setFocusRevision] = useState(0)
  const [navigating, setNavigating] = useState(false)
  const navigationTask = useRef<Promise<boolean> | null>(null)
  const [blocker, setBlocker] = useState<DraftBlocker | null>(null)
  const focusRequest = useRef<(() => void) | null>(null)
  const origin = useRef<AppDestination | null>(null)
  const [backTrail, setBackTrail] = useState<AppDestination[]>([])
  const [referenceAnchor, setReferenceAnchor] = useState<{
    id: string
    documentId: string
    request: number
  } | null>(null)
  const [location, setLocation] = useState<LocationStatus | null>(null)
  const [list, setList] = useState<ProjectList>({ projects: [], issues: [] })
  const [project, setProject] = useState<OpenProject | null>(null)
  const [access, setAccess] = useState<AccessView | null>(null)
  function applyAccess(next: AccessView): void {
    setAccess(next)
  }
  const [editVersion, setEditVersion] = useState(0),
    [protectedVersion, setProtectedVersion] = useState(0),
    [editorEpoch, setEditorEpoch] = useState(0)
  const [sectionTitle, setSectionTitle] = useState(''),
    [sectionStatus, setSectionStatus] = useState<'draft' | 'review' | 'complete'>('draft'),
    [sectionSynopsis, setSectionSynopsis] = useState('')
  const sectionFields = useRef({
    title: '',
    status: 'draft' as 'draft' | 'review' | 'complete',
    synopsis: ''
  })
  const [busy, setBusy] = useState(false),
    [working, setActing] = useState(false),
    [closing, setClosing] = useState(false)
  const [committing, setCommitting] = useState(false),
    [retry, setRetry] = useState<CommitInput | null>(null)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [history, setHistory] = useState<HistoryView | null>(null)
  const [annotationCapture, setAnnotationCapture] = useState<AnnotationCapture | null>(null)
  const [inspectionTarget, setInspectionTarget] = useState<{
    sourceId: string
    excerptId: string | null
    versionId: string | null
    pageIndex: number | null
  } | null>(null)
  const [citationContext, setCitationContext] = useState<{
    projectId: string
    sources: SourceRecord[]
    view: CitationsView | null
  } | null>(null)

  const [outlineRetry, setOutlineRetry] = useState(false)
  const outlinePending = useRef<OutlineInput | null>(null)
  const anchorToFocus = useRef<string | null>(null)
  const acting = working || outlineRetry
  const [conflict, setConflict] = useState<OpenProject | null>(null)
  const [files, setFiles] = useState<FileStatus>(emptyFiles)
  const [data, setData] = useState<DataLocations | null>(null)
  const renamePending = useRef<RenameInput | null>(null)
  const metaPending = useRef<SectionMetaInput | null>(null)
  const current = useRef<OpenProject | null>(null),
    editorRef = useRef<Editor | null>(null)
  const imageUrls = useRef(new Map<string, string>())
  const editVersionRef = useRef(0),
    protectedVersionRef = useRef(0),
    retryVersion = useRef(0)
  const retryCommit = useRef<CommitInput | null>(null),
    committingTask = useRef<Promise<OpenProject | null> | null>(null)
  const pendingSave = useRef<SaveInput | null>(null)
  const pendingImage = useRef<{
    projectId: string
    workspaceId: string
    documentId: string
    operationId: string
    token: string
    alt: string
    caption: string
  } | null>(null)
  const actionTask = useRef<Promise<unknown> | null>(null),
    closingRef = useRef(false)
  const fileState = useRef<FileStatus>(emptyFiles),
    alive = useRef(true)
  const jobWaiters = useRef(new Map<string, Set<(job: FileJobView | null) => void>>())
  const finishedJobs = useRef(new Map<string, FileJobView>())
  const handlers = useRef<{ action: (action: FileAction) => Promise<void> }>({
    action: async () => {}
  })
  const noteDirty = drafts
    .states()
    .some((s) => s.id === 'notes' && (s.dirty || !!s.pendingOperation))
  const sourceDirty = drafts
    .states()
    .some((s) => s.id === 'sources' && (s.dirty || !!s.pendingOperation))
  const selectedSection = project?.documents.find((doc) => doc.id === project.documentId)
  const sectionReadOnly =
    !!selectedSection && effectiveState(selectedSection, project!.documents) !== 'active'
  const sectionDirty =
    !!selectedSection &&
    (sectionTitle !== selectedSection.title ||
      sectionStatus !== selectedSection.status ||
      sectionSynopsis !== selectedSection.synopsis)
  const dirty =
    editVersion !== protectedVersion ||
    sectionDirty ||
    retry !== null ||
    committing ||
    noteDirty ||
    sourceDirty ||
    drafts.hasUnprotected()
  const fileActive = fileBusy(files.job)
  const accessReadOnly = !!project && !canEditProject(access, project)
  const accessTransition = !!access?.transition
  function updateProject(next: OpenProject | null): void {
    current.current = next
    setProject(next)
  }
  function updateHead(next: OpenProject): void {
    updateProject(next)
    if (
      sameScope(scopeOf(next), fileState.current.scope) &&
      ['saved', 'pending'].includes(fileState.current.state)
    )
      applyFiles({
        ...fileState.current,
        state:
          next.headCommitId === fileState.current.destination?.headCommitId ? 'saved' : 'pending'
      })
  }
  function acceptProjectDetails(next: OpenProject): void {
    const p = current.current
    if (!p || !sameScope(p, next)) return
    // Details never replace the retained editor payload, document ID, selection or undo history.
    updateHead({
      ...p,
      title: next.title,
      byline: next.byline,
      description: next.description,
      projectKind: next.projectKind,
      template: next.template,
      detailsRevisionId: next.detailsRevisionId,
      headCommitId: next.headCommitId,
      updatedAt: next.updatedAt
    })
  }
  function applyFiles(next: FileStatus): void {
    fileState.current = next
    setFiles(next)
    if (
      next.job?.kind === 'backup' &&
      next.job.capturedHead &&
      ['archive', 'staging', 'replacing', 'verifying'].includes(next.job.phase)
    )
      setBusy(false)
    if (current.current && sameScope(scopeOf(current.current), next.scope))
      updateProject({ ...current.current, destination: next.destination })
    if (next.job && !fileBusy(next.job)) {
      finishedJobs.current.set(next.job.id, next.job)
      if (finishedJobs.current.size > 64)
        finishedJobs.current.delete(finishedJobs.current.keys().next().value!)
      for (const resolve of jobWaiters.current.get(next.job.id) ?? []) resolve(next.job)
      jobWaiters.current.delete(next.job.id)
    }
  }
  function isMetaDirty(): boolean {
    const doc = current.current?.documents.find((item) => item.id === current.current?.documentId),
      fields = sectionFields.current
    return (
      !!doc &&
      (fields.title !== doc.title ||
        fields.status !== doc.status ||
        fields.synopsis !== doc.synopsis)
    )
  }
  function isDirty(): boolean {
    return (
      editVersionRef.current !== protectedVersionRef.current ||
      isMetaDirty() ||
      !!retryCommit.current ||
      !!committingTask.current ||
      drafts.hasUnprotected()
    )
  }
  function changed(): void {
    editVersionRef.current += 1
    setEditVersion(editVersionRef.current)
    window.collie.setUnprotectedChanges(true)
    setNotice('Writing changed. Waiting for a local commit…')
  }
  useEffect(() => {
    alive.current = true
    void window.collie.getWorkingLocation().then((result) => {
      if (alive.current) {
        if (result.ok) setLocation(result.value)
        else setError(result.error.message)
      }
    })
    const offFiles = window.collie.onFileStatus(applyFiles)
    const offAccess = window.collie.onAccessChanged(applyAccess)
    void window.collie.readAccess().then((result) => {
      if (alive.current) {
        if (result.ok) applyAccess(result.value)
        else setError(result.error.message)
      }
    })
    const offActions = window.collie.onFileAction((action) => {
      void handlers.current.action(action).catch(() => {
        setError(
          'The action could not finish. Keep this window open and copy any unprotected writing.'
        )
      })
    })
    return () => {
      alive.current = false
      offFiles()
      offActions()
      offAccess()
      for (const url of imageUrls.current.values()) URL.revokeObjectURL(url)
      imageUrls.current.clear()
      for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null)
      jobWaiters.current.clear()
    }
  }, [])
  useEffect(() => {
    window.collie.setUnprotectedChanges(isDirty())
  }, [dirty, draftRevision])
  useEffect(() => {
    if (destination.kind !== 'workspace' || !project || !sameScope(destination.scope, project))
      return
    const selected = project.documents.find((item) => item.id === project.documentId)
    if (selected?.kind === 'text' && effectiveState(selected, project.documents) === 'active')
      rememberLastProject({ ...scopeOf(project), documentId: project.documentId })
  }, [
    destination,
    project?.projectId,
    project?.workspaceId,
    project?.documentId,
    project?.archived
  ])
  useEffect(() => {
    if (storage.state === 'ready') {
      void refreshData()
      return
    }
    if (storage.state === 'unavailable') {
      for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null)
      jobWaiters.current.clear()
    }
  }, [storage.state])
  useEffect(() => {
    if (!project || !dirty || closing || storage.state !== 'ready') return
    const timer = setTimeout(() => {
      if (!actionTask.current && !retryCommit.current && !metaPending.current)
        void flushManuscript()
    }, 900)
    return () => clearTimeout(timer)
  }, [
    editVersion,
    sectionTitle,
    sectionStatus,
    sectionSynopsis,
    project?.documentId,
    closing,
    storage.state
  ])
  useEffect(() => {
    if (!project || storage.state !== 'ready') return
    const timer = setInterval(() => {
      if (
        isDirty() &&
        !retryCommit.current &&
        !metaPending.current &&
        !actionTask.current &&
        !closingRef.current
      )
        void flushManuscript()
    }, 5000)
    return () => clearInterval(timer)
  }, [project?.documentId, storage.state])
  async function resolveInitialDestination(projects: ProjectList): Promise<void> {
    if (initialDestinationResolved.current) return
    initialDestinationResolved.current = true
    try {
      if (destinationRef.current.kind !== 'setup' || hasResumableSetup()) return
      if (projects.projects.length === 0) {
        if (projects.issues.length) {
          setLibraryIssue(
            'Local project records need attention. Review recovery before creating more work.'
          )
          showDestination({ kind: 'library' })
        }
        return
      }
      const saved = readLastProject()
      if (saved.issue) setLibraryIssue(saved.issue)
      const last = saved.value
      if (last) {
        const summary = projects.projects.find((item) => sameScope(item, last))
        if (!summary)
          setLibraryIssue(
            'The previous project is not in this local library. Choose a project or review recovery.'
          )
        else if (summary.archived) {
          setLibraryView('archived')
          setLibraryIssue(
            'The previous project is archived. Open it from Archived when you are ready.'
          )
        } else {
          const opened = await window.collie.openProject(last)
          if (opened.ok) {
            let selected = opened.value
            const preferred = opened.value.documents.find((item) => item.id === last.documentId)
            if (
              preferred?.kind === 'text' &&
              effectiveState(preferred, opened.value.documents) === 'active' &&
              opened.value.documentId !== preferred.id
            ) {
              const section = await window.collie.openSection({ ...last, documentId: preferred.id })
              if (!section.ok) {
                setLibraryIssue(
                  'The previous section could not be opened safely. Choose a project from this library.'
                )
                if (destinationRef.current.kind === 'setup') showDestination({ kind: 'library' })
                return
              }
              selected = section.value
            }
            if (destinationRef.current.kind === 'setup') {
              await select(selected)
              return
            }
          } else
            setLibraryIssue(
              `The previous project could not be reopened: ${opened.error.message}. Choose it from Projects or review recovery.`
            )
        }
      }
      if (destinationRef.current.kind === 'setup') showDestination({ kind: 'library' })
    } catch {
      setLibraryIssue(
        'The previous project could not be reopened safely. Choose it from Projects or review recovery.'
      )
      if (destinationRef.current.kind === 'setup') showDestination({ kind: 'library' })
    } finally {
      setStartupPending(false)
    }
  }
  async function refresh(): Promise<void> {
    const result = await window.collie.listProjects()
    if (!alive.current) return
    if (result.ok) {
      setList(result.value)
      void resolveInitialDestination(result.value)
    } else {
      setError(result.error.message)
      if (
        !initialDestinationResolved.current &&
        destinationRef.current.kind === 'setup' &&
        !hasResumableSetup()
      ) {
        setLibraryIssue(
          'The local project list could not be read. Review recovery or refresh Projects before creating more work.'
        )
        showDestination({ kind: 'library' })
      }
      setStartupPending(false)
    }
  }
  async function refreshData(): Promise<void> {
    const result = await window.collie.getDataLocations()
    if (!alive.current) return
    if (result.ok) {
      setData(result.value)
      setList(result.value.projects)
      void resolveInitialDestination(result.value.projects)
    } else {
      setError(result.error.message)
      await refresh()
    }
  }
  async function refreshFiles(recheck = false): Promise<void> {
    const result = await window.collie.getProjectFileStatus(
      current.current ? scopeOf(current.current) : null,
      recheck
    )
    if (result.ok) applyFiles(result.value)
    else setError(result.error.message)
  }
  async function select(
    next: OpenProject,
    after: 'write' | 'setup' | 'details' = 'write'
  ): Promise<void> {
    if (!sameScope(current.current, next)) {
      setBackTrail([])
      setReferenceAnchor(null)
    }
    const referenced = new Set<string>()
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (key === 'assetId' && typeof value === 'string') referenced.add(value)
        else visit(value)
      }
    }
    visit(next.payload.ast)
    const loaded = new Map<string, string>()
    let imageIssue = '',
      imageBytes = 0
    for (const assetId of referenced) {
      const result = await window.collie.readImage({ ...scopeOf(next), assetId })
      if (!result.ok) {
        imageIssue = `Image ${assetId.slice(0, 8)} could not be loaded: ${result.error.message}`
        continue
      }
      imageBytes += (result.value.base64.length * 3) / 4
      if (imageBytes > 256 * 1024 * 1024) {
        imageIssue =
          'This section has more than 256 MiB of image data. Some images were left as placeholders to keep editing available.'
        break
      }
      const binary = atob(result.value.base64),
        bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      loaded.set(assetId, URL.createObjectURL(new Blob([bytes], { type: result.value.mediaType })))
    }
    for (const url of imageUrls.current.values()) URL.revokeObjectURL(url)
    imageUrls.current = loaded
    if (current.current?.projectId !== next.projectId) {
      setHistory(null)
      setInspectionTarget(null)
    }
    setAnnotationCapture(null)
    updateProject(next)
    setConflict(null)
    setEditorEpoch((value) => value + 1)
    const selected = next.documents.find((doc) => doc.id === next.documentId)!
    setSectionTitle(selected.title)
    setSectionStatus(selected.status as 'draft' | 'review' | 'complete')
    setSectionSynopsis(selected.synopsis)
    metaPending.current = null
    sectionFields.current = {
      title: selected.title,
      status: selected.status as 'draft' | 'review' | 'complete',
      synopsis: selected.synopsis
    }
    editVersionRef.current = 0
    protectedVersionRef.current = 0
    setEditVersion(0)
    setProtectedVersion(0)
    retryCommit.current = null
    setRetry(null)
    pendingSave.current = null
    window.collie.setUnprotectedChanges(drafts.hasUnprotected())
    setError(imageIssue)
    setNotice('Draft protected locally.')
    showDestination(
      after === 'setup'
        ? { kind: 'setup' }
        : after === 'details'
          ? { kind: 'workspace', scope: scopeOf(next), view: 'details' }
          : writingDestination(next, next.documentId)
    )
    await refreshFiles()
  }
  async function importImage(details: { alt: string; caption: string }): Promise<void> {
    const captured = captureSelection(editorRef.current)
    if (!captured) {
      setError('Finish composing and select the image location again.')
      return
    }
    setBusy(true)
    const p = await flush()
    if (!p) return
    if (pendingImage.current && !sameScope(scopeOf(p), pendingImage.current)) {
      setError('Reopen the project with the pending image import before retrying it.')
      return
    }
    if (!pendingImage.current) {
      const chosen = await window.collie.pickImage(scopeOf(p))
      if (!chosen.ok) {
        setError(chosen.error.message)
        return
      }
      if (!chosen.value) return
      const { alt, caption } = details
      if (alt.length > 2000 || caption.length > 10000) {
        setError('Image description or caption is too long. The image was not imported.')
        return
      }
      pendingImage.current = {
        ...scopeOf(p),
        documentId: p.documentId,
        operationId: crypto.randomUUID(),
        token: chosen.value.token,
        alt,
        caption
      }
    }
    const input = pendingImage.current
    const imported = await window.collie.importImage({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      operationId: input.operationId,
      token: input.token
    })
    if (!imported.ok) {
      if (imported.error.code !== 'UNAVAILABLE') pendingImage.current = null
      setError(imported.error.message)
      return
    }
    pendingImage.current = null
    const data = await window.collie.readImage({ ...scopeOf(p), assetId: imported.value.assetId })
    if (!data.ok) {
      setError(data.error.message)
      return
    }
    const binary = atob(data.value.base64),
      bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    imageUrls.current.set(
      imported.value.assetId,
      URL.createObjectURL(new Blob([bytes], { type: data.value.mediaType }))
    )
    const latest = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
    if (latest.ok) updateHead(latest.value)
    const scale = Math.min(1, 800 / imported.value.width, 1600 / imported.value.height)
    if (
      !restoreSelection(captured, editorRef.current) ||
      !current.current ||
      !sameScope(p, current.current) ||
      current.current.documentId !== p.documentId
    ) {
      setError(
        'The image is retained in the project, but its writing location changed. Select the intended location and insert it again.'
      )
      return
    }
    editorRef.current?.commands.insertContent({
      type: 'image',
      attrs: {
        blockId: crypto.randomUUID(),
        assetId: imported.value.assetId,
        alt: input.alt,
        caption: input.caption,
        width: Math.max(1, Math.round(imported.value.width * scale)),
        height: Math.max(1, Math.round(imported.value.height * scale))
      }
    })
    setNotice(
      'Image copied into the project. Its placement is waiting for a local document commit.'
    )
  }
  async function navigateSection(documentId: string, anchorId?: string): Promise<void> {
    const p = current.current
    if (p)
      await navigate({ kind: 'workspace', scope: scopeOf(p), view: 'write', documentId, anchorId })
  }
  function navigateSearch(hit: SearchHit): void {
    const p = current.current
    if (!p) return
    if (hit.kind === 'draft' && hit.documentId) {
      void navigateSection(hit.documentId, hit.anchorId ?? undefined)
      return
    }
    let target: ResearchTarget | null = null
    if (hit.kind === 'note') target = { kind: 'notes', noteId: hit.entityId }
    if (hit.kind === 'source') target = { kind: 'sources', sourceId: hit.entityId }
    if (hit.kind === 'question' || hit.kind === 'claim')
      target = { kind: 'evidence', item: { kind: hit.kind, id: hit.entityId } }
    if (hit.kind === 'page' && hit.sourceId && hit.versionId)
      target = {
        kind: 'inspector',
        sourceId: hit.sourceId,
        versionId: hit.versionId,
        pageIndex: hit.pageIndex ?? undefined
      }
    if (target) void navigate({ kind: 'workspace', scope: scopeOf(p), view: 'research', target })
  }
  async function loadHistory(checkpointId: string | null): Promise<void> {
    setBusy(true)
    const p = await flush()
    if (!p) return
    const result = await window.collie.readHistory({ ...scopeOf(p), checkpointId })
    if (result.ok) setHistory(result.value)
    else setError(result.error.message)
  }
  async function performOutline(change?: OutlineChange): Promise<boolean> {
    if (!(await waitActive())) return false
    setBusy(true)
    if (!outlinePending.current) {
      const p = await flush()
      if (!p || !change) return false
      // Refresh revisions after the editor/metadata flush; no buffered content is overwritten.
      const latest = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
      if (!latest.ok) {
        setError(latest.error.message)
        return false
      }
      if (latest.value.headCommitId !== p.headCommitId) {
        setError(
          'The project changed. Refresh its stored version before reorganizing; your current buffer is retained.'
        )
        return false
      }
      if (change.type === 'restore' && history?.checkpointId !== change.checkpointId) {
        setError('Select and review that checkpoint before restoring it.')
        return false
      }
      if (
        ['restore', 'prune', 'repair'].includes(change.type) &&
        history?.headCommitId !== p.headCommitId
      ) {
        setError(
          'Refresh history after protecting your latest edits, then review this action again.'
        )
        return false
      }
      outlinePending.current = {
        ...scopeOf(p),
        operationId: crypto.randomUUID(),
        expectedHead: p.headCommitId,
        expectedRevisions: Object.fromEntries(
          latest.value.documents.map((d) => [d.id, d.revisionId])
        ),
        selectedId: p.documentId,
        change
      }
    }
    setOutlineRetry(true)
    const result = await window.collie.changeOutline(outlinePending.current)
    if (!result.ok) {
      if (result.error.code === 'UNAVAILABLE') setOutlineRetry(true)
      else {
        outlinePending.current = null
        setOutlineRetry(false)
      }
      setError(
        result.error.code === 'VALIDATION'
          ? 'This outline change is not valid. Keep at least one active section, use a valid parent, and split between existing blocks. The whole change was left unapplied.'
          : result.error.message
      )
      return false
    }
    outlinePending.current = null
    setOutlineRetry(false)
    await select(result.value)
    setHistory(null)
    setNotice('Outline/history change protected locally. The chosen file may still need Save.')
    await refresh()
    return true
  }
  async function saveSectionMeta(): Promise<void> {
    if (await flush()) await refresh()
  }
  async function protectText(
    value: DocumentPayload,
    version: number,
    prior?: CommitInput
  ): Promise<OpenProject | null> {
    const p = current.current
    if (!p) return null
    const input = prior ?? {
      ...scopeOf(p),
      documentId: p.documentId,
      operationId: crypto.randomUUID(),
      expectedRevisionId: p.revisionId,
      payload: value
    }
    setCommitting(true)
    setError('')
    setNotice('Protecting edits locally…')
    window.collie.setUnprotectedChanges(true)
    retryCommit.current = input
    retryVersion.current = version
    setRetry(input)
    const result = await window.collie
      .commitDocument(input)
      .catch(() => ({
        ok: false as const,
        requestId: input.operationId,
        error: {
          code: 'UNAVAILABLE' as const,
          message:
            'The local acknowledgment is unavailable. Retry keeps this exact draft operation.'
        }
      }))
    if (!alive.current) return null
    if (result.ok) {
      const next = {
        ...current.current!,
        documents: current.current!.documents.map((d) =>
          d.id === input.documentId ? { ...d, revisionId: result.value.revisionId } : d
        ),
        payload: input.payload,
        revisionId: result.value.revisionId,
        headCommitId: result.value.headCommitId
      }
      updateHead(next)
      protectedVersionRef.current = version
      setProtectedVersion(version)
      retryCommit.current = null
      setRetry(null)
      setNotice(
        editVersionRef.current === protectedVersionRef.current
          ? 'Draft protected locally.'
          : 'The submitted draft is protected locally. Newer typing still needs protection.'
      )
      setCommitting(false)
      return next
    }
    retryCommit.current = input
    retryVersion.current = version
    setRetry(input)
    setError(result.error.message)
    if (result.error.code === 'STALE_REVISION') {
      const stored = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
      if (stored.ok) setConflict(stored.value)
    }
    setNotice(
      'Local acknowledgment failed. Your current writing is still visible and selectable; Retry keeps the same operation.'
    )
    setCommitting(false)
    return null
  }
  async function flush(
    forAccess = false,
    mode: FlushMode = 'save',
    exclude: string[] = []
  ): Promise<OpenProject | null> {
    if (composition.current) {
      setError('Finish composing the current text before continuing.')
      return null
    }
    const issue = await drafts.protect(forAccess ? 'access' : mode, [
      'manuscript',
      'section-metadata',
      ...exclude
    ])
    if (issue) {
      setBlocker(issue)
      setError(issue.message)
      return null
    }
    const saved = await flushManuscript()
    if (saved) setBlocker(null)
    return saved
  }
  async function flushManuscript(): Promise<OpenProject | null> {
    if (proofreadingApplication.current) {
      setError(
        'Reconcile the proofreading correction before saving or navigating. Its exact operation is retained.'
      )
      return null
    }
    if (!current.current) return null
    const editor = editorRef.current
    if (!editor) {
      setError('This document could not be opened safely for editing. Its stored copy is retained.')
      return null
    }
    if (composition.current || editorIsComposing(editor)) {
      setError('Finish composing the current text before saving or closing.')
      return null
    }
    let requested: DocumentPayload
    try {
      requested = serializeEditor(editor)
    } catch {
      setError(
        'This edit cannot be protected yet. Keep the window open and copy the visible writing; unsupported content was not discarded.'
      )
      return null
    }
    const version = editVersionRef.current
    const previous = committingTask.current
    const task = (previous ?? Promise.resolve(current.current)).then(async (result) => {
      if (previous && !result) return null
      if (
        retryCommit.current &&
        !(await protectText(retryCommit.current.payload, retryVersion.current, retryCommit.current))
      )
        return null
      const written =
        version !== protectedVersionRef.current
          ? await protectText(requested, version)
          : current.current
      if (!written || !isMetaDirty()) return written
      const fields = { ...sectionFields.current }
      metaPending.current ??= {
        ...scopeOf(written),
        documentId: written.documentId,
        operationId: crypto.randomUUID(),
        expectedHead: written.headCommitId,
        title: fields.title.trim(),
        status: fields.status,
        synopsis: fields.synopsis
      }
      const meta = await window.collie
        .updateSectionMeta(metaPending.current)
        .catch(() => ({
          ok: false as const,
          requestId: metaPending.current!.operationId,
          error: {
            code: 'UNAVAILABLE' as const,
            message:
              'The section-details outcome is unknown. Retry the same details before changing them.'
          }
        }))
      if (!meta.ok) {
        if (meta.error.code !== 'UNAVAILABLE') metaPending.current = null
        setError(meta.error.message)
        if (meta.error.code === 'STALE_REVISION') {
          const stored = await window.collie.openSection({
            ...scopeOf(written),
            documentId: written.documentId
          })
          if (stored.ok) setConflict(stored.value)
        }
        return null
      }
      metaPending.current = null
      updateHead(meta.value)
      if (
        fields.title === sectionFields.current.title &&
        fields.status === sectionFields.current.status &&
        fields.synopsis === sectionFields.current.synopsis
      ) {
        const saved = meta.value.documents.find((doc) => doc.id === meta.value.documentId)!
        sectionFields.current = {
          title: saved.title,
          status: saved.status as 'draft' | 'review' | 'complete',
          synopsis: saved.synopsis
        }
        setSectionTitle(saved.title)
        setSectionStatus(saved.status as 'draft' | 'review' | 'complete')
        setSectionSynopsis(saved.synopsis)
      }
      setNotice('Section details protected locally. The selected file may still need Save.')
      return meta.value
    })
    committingTask.current = task
    try {
      return await task
    } finally {
      if (committingTask.current === task) committingTask.current = null
      window.collie.setUnprotectedChanges(isDirty())
    }
  }
  function waitJob(id: string): Promise<FileJobView | null> {
    const finished = finishedJobs.current.get(id)
    if (finished) return Promise.resolve(finished)
    const job = fileState.current.job
    if (job?.id === id && !fileBusy(job)) return Promise.resolve(job)
    return new Promise((resolve) => {
      const group = jobWaiters.current.get(id) ?? new Set()
      group.add(resolve)
      jobWaiters.current.set(id, group)
    })
  }
  async function finishJob(
    result: ProjectResult<FileStatus>,
    id: string
  ): Promise<FileJobView | null> {
    if (result.ok) applyFiles(result.value)
    else {
      setError(result.error.message)
      if (fileState.current.job?.id !== id) return null
    }
    const job = await waitJob(id)
    if (job?.error) setError(projectMessages[job.error])
    return job
  }
  function run(work: () => Promise<unknown>): void {
    if (actionTask.current || closingRef.current) return
    setActing(true)
    const task = work()
      .catch(() => {
        setError(
          'The operation could not finish. Keep this window open; your current writing is still here.'
        )
      })
      .finally(() => {
        actionTask.current = null
        setActing(false)
        setBusy(false)
      })
    actionTask.current = task
  }
  async function waitActive(): Promise<boolean> {
    const job = fileState.current.job
    if (!fileBusy(job) || !job) return true
    return !!(await waitJob(job.id))
  }
  async function save(as: boolean): Promise<boolean> {
    if (!(await waitActive())) return false
    setBusy(true)
    const p = await flush()
    if (!p) {
      setBusy(false)
      return false
    }
    await refreshFiles()
    if (!(await waitActive())) {
      setBusy(false)
      return false
    }
    let token: string | null = null
    const destination = fileState.current.destination
    if ((as || !destination) && !(pendingSave.current && !as)) {
      const choice = await window.collie.pickProjectFile({ purpose: 'save', scope: scopeOf(p) })
      if (!choice.ok || !choice.value) {
        if (!choice.ok) setError(choice.error.message)
        setBusy(false)
        return false
      }
      token = choice.value.token
    }
    const retrying = !!pendingSave.current && !as
    const input: SaveInput = retrying
      ? pendingSave.current!
      : {
          scope: scopeOf(p),
          operationId: crypto.randomUUID(),
          minimumHead: p.headCommitId,
          expectedGeneration: destination?.generationId ?? null,
          token
        }
    pendingSave.current = input
    setBusy(false)
    setError('')
    const result = await window.collie.saveProjectFile(input)
    const job = await finishJob(result, input.operationId)
    if (job || (!result.ok && result.error.code !== 'UNAVAILABLE')) pendingSave.current = null
    if (job?.state === 'completed') {
      // Reconcile the old request before capturing any newer edits submitted with this explicit Save.
      if (retrying && fileState.current.destination?.headCommitId !== p.headCommitId)
        return save(false)
      await refresh()
      return true
    }
    return false
  }
  async function openLocal(scope: OpenInput, after: 'write' | 'details' = 'write'): Promise<void> {
    const result = await window.collie.openProject(scope)
    if (result.ok) {
      await select(result.value, after)
      setLibraryIssue(null)
    } else setError(result.error.message)
  }
  async function openFile(inspect = false, locate = false, shell = false): Promise<void> {
    if (!(await waitActive())) return
    setBusy(true)
    if (current.current && !(await flush(false, 'replace'))) return
    const p = current.current,
      operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (inspect && p)
      result = await window.collie.inspectProjectFile({ scope: scopeOf(p), operationId })
    else {
      const choice = shell
        ? await window.collie.claimShellProjectFile()
        : await window.collie.pickProjectFile({
            purpose: locate ? 'locate' : 'open',
            scope: locate && p ? scopeOf(p) : null
          })
      if (!choice.ok || !choice.value) {
        if (!choice.ok) setError(choice.error.message)
        return
      }
      result =
        locate && p
          ? await window.collie.locateProjectFile({
              scope: scopeOf(p),
              operationId,
              token: choice.value.token
            })
          : await window.collie.openProjectFile({ operationId, token: choice.value.token })
    }
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed' && job.opened) await openLocal(job.opened)
    await refresh()
  }
  async function lifecycleFile(
    kind: 'backup' | 'move' | 'duplicate' | 'restore' | 'recover',
    artifactId?: string
  ): Promise<void> {
    if (!(await waitActive())) return
    setBusy(true)
    const p = current.current
      ? await flush(false, ['duplicate', 'restore', 'recover'].includes(kind) ? 'replace' : 'save')
      : null
    if (current.current && !p) return
    const operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (kind === 'recover' && artifactId)
      result = await window.collie.recoverProjectVersion({ operationId, artifactId })
    else if (kind === 'restore') {
      const selection = await window.collie.pickProjectFile({ purpose: 'restore', scope: null })
      if (!selection.ok || !selection.value) {
        if (!selection.ok) setError(selection.error.message)
        return
      }
      result = await window.collie.restoreProject({ operationId, token: selection.value.token })
    } else if (p && kind === 'duplicate')
      result = await window.collie.duplicateProject({
        operationId,
        scope: scopeOf(p),
        expectedHead: p.headCommitId
      })
    else if (p && (kind === 'backup' || kind === 'move')) {
      await refreshFiles()
      if (!(await waitActive())) return
      const selection = await window.collie.pickProjectFile({ purpose: kind, scope: scopeOf(p) })
      if (!selection.ok || !selection.value) {
        if (!selection.ok) setError(selection.error.message)
        return
      }
      const input: SaveInput = {
        operationId,
        scope: scopeOf(p),
        minimumHead: p.headCommitId,
        expectedGeneration: fileState.current.destination?.generationId ?? null,
        token: selection.value.token
      }
      result =
        kind === 'backup'
          ? await window.collie.backupProject(input)
          : await window.collie.moveProject(input)
    } else return
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed') {
      if (job.opened) await openLocal(job.opened)
      setNotice(
        kind === 'backup'
          ? `Backup written and reopened at revision ${job.capturedHead?.slice(0, 8) ?? ''}. The save location is unchanged; later typing may still need protection.`
          : kind === 'move'
            ? 'New location written and reopened. The old file is retained.'
            : 'Independent project opened. The original work is retained.'
      )
    }
    if (!(await waitActive())) return
    await refreshData()
  }
  async function manage(title?: string): Promise<void> {
    if (!(await waitActive())) return
    setBusy(true)
    const p = await flush(false, 'save', ['project-title'])
    if (!p) return
    if (renamePending.current && !sameScope(renamePending.current.scope, scopeOf(p))) {
      setError('Reopen the project with the pending rename before retrying it.')
      return
    }
    if (title !== undefined) {
      renamePending.current ??= {
        scope: scopeOf(p),
        operationId: crypto.randomUUID(),
        expectedHead: p.headCommitId,
        title
      }
      const result = await window.collie.renameProject(renamePending.current)
      if (result.ok) {
        renamePending.current = null
        const selected = await window.collie.openSection({
          ...scopeOf(result.value),
          documentId: p.documentId
        })
        await select(selected.ok ? selected.value : result.value)
      } else {
        if (result.error.code !== 'UNAVAILABLE') renamePending.current = null
        setError(result.error.message)
        return
      }
    } else {
      const result = await window.collie.archiveProject({
        scope: scopeOf(p),
        archived: !p.archived
      })
      if (result.ok) {
        const selected = await window.collie.openSection({
          ...scopeOf(result.value),
          documentId: p.documentId
        })
        await select(selected.ok ? selected.value : result.value)
        setNotice(
          result.value.archived
            ? 'Archived locally. Find it under Projects → Archived.'
            : 'Project returned to the active list.'
        )
      } else {
        setError(result.error.message)
        return
      }
    }
    await waitActive()
    await refreshData()
  }
  async function resetLocal(review: string): Promise<void> {
    if (!(await waitActive())) return
    setBusy(true)
    const wasDirty = isDirty()
    if (current.current && !(await flush(false, 'replace'))) return
    if (wasDirty) {
      await refreshData()
      setError(
        'Writing was protected. Review the updated project list before confirming reset again.'
      )
      return
    }
    const result = await window.collie.resetLocalWork({ review, confirmation: 'RESET LOCAL WORK' })
    if (!result.ok) {
      setError(result.error.message)
      // A lost response is not proof that reset rolled back. Keep the buffer visible for copying.
      if (result.error.code === 'UNAVAILABLE')
        setNotice(
          'Reset outcome is unknown. Refresh recovery before opening or creating another project. Your visible writing remains available for copying.'
        )
      return
    }
    showDestination({ kind: 'library' })
    updateProject(null)
    editVersionRef.current = 0
    protectedVersionRef.current = 0
    setEditVersion(0)
    setProtectedVersion(0)
    retryCommit.current = null
    setRetry(null)
    pendingSave.current = null
    renamePending.current = null
    applyFiles(emptyFiles)
    window.collie.setUnprotectedChanges(false)
    forgetLastProject()
    setData(result.value)
    setList(result.value.projects)
    setNotice('Local list reset. Recover the retained projects in Reset recovery.')
  }
  async function handleAction(action: FileAction): Promise<void> {
    if (action.kind === 'close-cancelled') {
      closingRef.current = false
      setClosing(false)
      return
    }
    if (action.kind === 'resume') {
      await refreshFiles()
      return
    }
    if (action.kind === 'suspend') {
      if (!closingRef.current && !outlinePending.current) await flush()
      return
    }
    if (action.kind !== 'close') {
      if (outlinePending.current) {
        setError('Reconcile the pending outline/history operation before opening or saving.')
        return
      }
      if (
        action.kind === 'save' &&
        actionTask.current &&
        fileState.current.job?.kind === 'save' &&
        !closingRef.current
      ) {
        const pending = actionTask.current
        const requested = await flush()
        if (!requested) return
        await pending
        if (current.current && sameScope(scopeOf(requested), scopeOf(current.current)))
          run(() => save(false))
        return
      }
      if (action.kind === 'open') run(() => openFile())
      else if (action.kind === 'open-shell') run(() => openFile(false, false, true))
      else run(() => save(action.kind === 'save-as'))
      return
    }
    if (closingRef.current) {
      window.collie.finishClose(action.id, 'cancel')
      return
    }
    closingRef.current = true
    setClosing(true)
    let outcome: 'saved' | 'local' | 'failed' | 'cancel' = 'failed'
    try {
      await navigationTask.current
      await actionTask.current
      // Closing protects the local workspace; it does not need an external-file read.
      const job = fileState.current.job
      if (job?.kind === 'check' && fileBusy(job)) {
        const cancelled = await window.collie.cancelFileJob(job.id)
        if (cancelled.ok) applyFiles(cancelled.value)
      }
      if (!(await waitActive())) return
      if (outlinePending.current && !(await performOutline())) return
      if (!current.current) {
        outcome = 'saved'
        return
      }
      if (!(await flush(false, 'close'))) return
      // Leave the selected file and its saved head unchanged until an explicit Save.
      outcome = isDirty() ? 'failed' : 'local'
    } finally {
      // Keep typing locked until main either closes the window or explicitly releases this handshake.
      setBusy(false)
      window.collie.setUnprotectedChanges(isDirty())
      window.collie.finishClose(action.id, outcome)
    }
  }
  handlers.current = { action: handleAction }
  async function captureAnnotation(): Promise<void> {
    const p = current.current,
      e = editorRef.current
    if (!p || !e) return
    const captured = captureSelection(e)
    if (!captured) {
      setError('Finish composing text before annotating a passage.')
      return
    }
    const selection = e.state.selection
    if (
      selection.empty ||
      !selection.$from.sameParent(selection.$to) ||
      !['paragraph', 'heading'].includes(selection.$from.parent.type.name)
    ) {
      setError('Select text within one paragraph or heading to annotate.')
      return
    }
    const blockId = selection.$from.parent.attrs.blockId as string | undefined
    const startOffset = selection.$from.parentOffset,
      endOffset = selection.$to.parentOffset
    const quote = selection.$from.parent.textBetween(startOffset, endOffset, '\n', '\ufffc')
    if (!blockId || !quote || quote.length !== endOffset - startOffset || quote.length > 10000) {
      setError('Select plain text within one paragraph or heading.')
      return
    }
    const saved = await flush()
    if (!saved) return
    if (
      !sameScope(p, saved) ||
      saved.documentId !== p.documentId ||
      !restoreSelection(captured, editorRef.current)
    ) {
      setError(
        'The passage changed while protecting your writing. Select it again before annotating.'
      )
      return
    }
    setAnnotationCapture({
      documentId: saved.documentId,
      expectedRevisionId: saved.revisionId,
      blockId,
      startOffset,
      endOffset,
      quote
    })
    rememberOrigin(captureOrigin(destinationRef.current))
    showDestination({
      kind: 'workspace',
      scope: scopeOf(saved),
      view: 'research',
      target: { kind: 'notes' }
    })
    setNotice('Selected passage ready in Passage annotations.')
  }
  async function applyProofreading(
    capture?: ProofreadCapture,
    finding?: ProofreadFinding
  ): Promise<boolean> {
    if (proofreadingBusy.current || closingRef.current || composition.current) return false
    proofreadingBusy.current = true
    setBusy(true)
    try {
      if (!proofreadingApplication.current) {
        if (
          !capture ||
          !finding ||
          finding.decision !== 'pending' ||
          accessReadOnly ||
          accessTransition
        )
          return false
        const saved = await flush(false, 'save', ['proofreading'])
        const editor = editorRef.current
        if (
          !saved ||
          !editor ||
          editorIsComposing(editor) ||
          saved.documentId !== capture.source.documentId ||
          saved.revisionId !== capture.source.revisionId ||
          !editor.state.doc.eq(editor.schema.nodeFromJSON(hydrateDocument(saved.payload)))
        ) {
          setError(
            'This finding no longer matches the protected writing. Review the current passage again.'
          )
          return false
        }
        const suggestion = {
          targetId: finding.targetId,
          from: finding.from,
          to: finding.to,
          before: finding.before,
          replacement: finding.replacement,
          reason: finding.reason,
          kind: finding.kind
        }
        const after = replaceMechanicsFinding(saved.payload, capture, suggestion)
        proofreadingApplication.current = {
          input: {
            ...scopeOf(saved),
            action: 'decide',
            operationId: crypto.randomUUID(),
            attemptId: finding.runId,
            findingId: finding.id,
            expectedRevision: finding.revisionId,
            expectedHead: saved.headCommitId,
            decision: 'apply'
          },
          capture,
          finding,
          before: editor.state.doc,
          after
        }
        lockEditorMutation(editor, true)
        editor.setEditable(false)
        setProofreadingLocked(true)
        drafts.changed()
      }
      const pending = proofreadingApplication.current
      if (!pending) return false
      const result = await window.collie.proofreading(pending.input)
      if (!result.ok) {
        if (!['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(result.error.code)) {
          if (editorRef.current) lockEditorMutation(editorRef.current, false)
          proofreadingApplication.current = null
          setProofreadingLocked(false)
        }
        setError(
          result.error.code === 'STALE_REVISION'
            ? 'The protected target changed. This correction was refused; review the current passage again.'
            : result.error.message
        )
        return false
      }
      if (result.value.type !== 'decision') {
        setError('The correction acknowledgment could not be read. Retry the exact correction.')
        return false
      }
      const stored = await window.collie.openSection({
        ...scopeOf(pending.input),
        documentId: pending.capture.source.documentId
      })
      const editor = editorRef.current,
        p = current.current
      if (
        !stored.ok ||
        !p ||
        !sameScope(p, pending.input) ||
        p.documentId !== pending.capture.source.documentId ||
        !editor ||
        editorIsComposing(editor) ||
        (!editor.state.doc.eq(pending.before) &&
          !editor.state.doc.eq(editor.schema.nodeFromJSON(hydrateDocument(pending.after)))) ||
        stored.value.revisionId !== result.value.revisionId ||
        !editor.schema
          .nodeFromJSON(hydrateDocument(stored.value.payload))
          .eq(editor.schema.nodeFromJSON(hydrateDocument(pending.after)))
      ) {
        setError(
          'The correction is retained, but the editor could not safely adopt its acknowledgment. Keep this window open and retry the same correction.'
        )
        return false
      }
      if (editor.state.doc.eq(pending.before)) {
        const target = pending.capture.targets.find((t) => t.id === pending.finding.targetId)!
        let position: number | null = null
        editor.state.doc.descendants((node, pos) => {
          if (node.attrs.blockId === target.blockId) position = pos + 1
        })
        if (position === null) {
          setError('The exact correction target is unavailable. Retry local reconciliation.')
          return false
        }
        const start = position + target.from + pending.finding.from,
          end = position + target.from + pending.finding.to
        const marks = target.marks.map((mark) =>
          editor.schema.marks[mark.type].create(mark.type === 'link' ? mark.attrs : undefined)
        )
        const transaction = pending.finding.replacement
          ? editor.state.tr.replaceWith(
              start,
              end,
              editor.schema.text(pending.finding.replacement, marks)
            )
          : editor.state.tr.delete(start, end)
        if (!transaction.doc.eq(editor.schema.nodeFromJSON(hydrateDocument(pending.after)))) {
          setError(
            'The editor cannot apply this exact correction without changing other content. The stored checkpoint is retained.'
          )
          return false
        }
        // One normal ProseMirror history event; preserve the mounted editor, selection mapping and older undo.
        dispatchProtectedCorrection(editor, closeHistory(transaction))
        editor.view.dispatch(closeHistory(editor.state.tr))
      }
      updateHead(stored.value)
      protectedVersionRef.current = editVersionRef.current
      setProtectedVersion(editVersionRef.current)
      lockEditorMutation(editor, false)
      proofreadingApplication.current = null
      setProofreadingLocked(false)
      setHistory(null)
      setError('')
      setNotice(
        'Correction protected locally. Other findings for the previous revision are stale. The pre-correction manuscript is retained in History.'
      )
      return true
    } catch {
      setError(
        'The correction could not be confirmed. Your writing and exact pending operation are retained.'
      )
      return false
    } finally {
      proofreadingBusy.current = false
      setBusy(false)
      drafts.changed()
    }
  }
  async function refreshConversationHead(scope: OpenInput): Promise<void> {
    // Transcript commits advance the project head, never the retained manuscript buffer or selection.
    for (let tries = 0; tries < 3; tries++) {
      const before = current.current
      if (!before || !sameScope(before, scope)) return
      const result = await window.collie.openSection({ ...scope, documentId: before.documentId })
      const live = current.current
      if (!live || !sameScope(live, scope)) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (live.headCommitId !== before.headCommitId || live.documentId !== before.documentId)
        continue
      updateHead({
        ...live,
        headCommitId: result.value.headCommitId,
        updatedAt: result.value.updatedAt
      })
      return
    }
  }
  async function afterNoteCommit(): Promise<void> {
    const p = current.current
    if (!p) return
    const result = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
    if (result.ok) updateHead(result.value)
    else setError(result.error.message)
    await refresh()
  }
  async function changeAccess(kind: 'designate' | 'finish' | 'import'): Promise<void> {
    setBusy(true)
    const keepActive =
      kind === 'designate' &&
      !!access?.transition &&
      sameProject(current.current, access.transition.scope)
    if (!keepActive && current.current && !(await flush(true))) return
    window.collie.setUnprotectedChanges(isDirty())
    if (!keepActive && isDirty()) {
      setError('Protect every pending draft before changing access.')
      return
    }
    const latest = await window.collie.readAccess()
    if (!latest.ok) {
      setError(latest.error.message)
      return
    }
    applyAccess(latest.value)
    const result =
      kind === 'designate' && current.current
        ? await window.collie.designateFreeProject({
            scope: scopeOf(current.current),
            expectedRevision: latest.value.revision
          })
        : kind === 'finish' && latest.value.transition
          ? await window.collie.finishAccessTransition({ transitionId: latest.value.transition.id })
          : kind === 'import'
            ? await window.collie.importAccessGrant()
            : null
    if (result) {
      if (result.ok) {
        applyAccess(result.value)
        setNotice('Access settings updated. Existing writing and saved files were kept.')
      } else setError(result.error.message)
    }
  }
  async function openTutorial(reset: boolean): Promise<void> {
    setBusy(true)
    if (current.current && !(await flush(false, 'replace'))) return
    window.collie.setUnprotectedChanges(isDirty())
    if (isDirty()) {
      setError('Protect pending drafts before opening or resetting the sample.')
      return
    }
    const result = await window.collie.openTutorial({ reset })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    await select(result.value)
    await refresh()
    await refreshData()
    const updated = await window.collie.readAccess()
    if (updated.ok) applyAccess(updated.value)
    setNotice(
      reset
        ? 'Fresh sample opened. The previous sample remains a local project.'
        : 'Tutorial sample opened. The fictional source and cited draft are ready.'
    )
  }
  const available = storage.state === 'ready' && location?.state === 'ready'

  function showDestination(next: AppDestination, focus?: () => void): void {
    if (destinationRef.current.kind === 'workspace' && next.kind !== 'workspace')
      origin.current = destinationRef.current
    destinationRef.current = next
    setDestination(next)
    focusRequest.current = focus ?? null
    setFocusRevision((value) => value + 1)
  }
  function returnToDraft(): void {
    if (blocker) showDestination(blocker.target, blocker.focus)
  }
  function showAccess(): void {
    // Resolution-only navigation retains every instance and permits free designation during access drain.
    showDestination({ kind: 'settings', page: 'access' })
  }
  async function resolveResearch(target: ResearchTarget, p: OpenProject): Promise<boolean> {
    const missing = (): false => {
      setError('The requested research item is unavailable. No different item was selected.')
      return false
    }
    if (target.kind === 'notes' && (target.noteId || target.annotationId)) {
      const result = await window.collie.readNotes(scopeOf(p))
      if (
        !result.ok ||
        (target.noteId && !result.value.notes.some((n) => n.id === target.noteId)) ||
        (target.annotationId && !result.value.annotations.some((a) => a.id === target.annotationId))
      )
        return missing()
    } else if (target.kind === 'sources' && target.sourceId) {
      const result = await window.collie.readSources(scopeOf(p))
      if (!result.ok || !result.value.sources.some((s) => s.id === target.sourceId))
        return missing()
    } else if (target.kind === 'evidence' && target.item) {
      const result = await window.collie.readEvidence(scopeOf(p))
      if (
        !result.ok ||
        (target.sourceId &&
          !result.value.sources.some((source) => source.id === target.sourceId)) ||
        !(
          target.item.kind === 'question'
            ? result.value.questions
            : target.item.kind === 'claim'
              ? result.value.claims
              : result.value.links
        ).some((item) => item.id === target.item!.id)
      )
        return missing()
    } else if (target.kind === 'inspector') {
      const result = await window.collie.readInspection({
        ...scopeOf(p),
        sourceId: target.sourceId
      })
      if (
        !result.ok ||
        (target.excerptId &&
          !result.value.excerpts.some(
            (e) =>
              e.id === target.excerptId && (!target.versionId || e.versionId === target.versionId)
          )) ||
        (target.versionId && !result.value.versions.some((v) => v.id === target.versionId))
      )
        return missing()
      setInspectionTarget({
        sourceId: target.sourceId,
        excerptId: target.excerptId ?? null,
        versionId: target.versionId ?? null,
        pageIndex: target.pageIndex ?? null
      })
    }
    return true
  }
  function captureOrigin(previous: AppDestination): AppDestination {
    if (previous.kind === 'workspace' && previous.view === 'write' && editorRef.current) {
      const selection = editorRef.current.state.selection
      const node = (selection as { node?: { attrs: Record<string, unknown> } }).node
      const selectedAnchor =
        node?.attrs.footnoteId ?? node?.attrs.citationId ?? selection.$from.parent.attrs.blockId
      previous = {
        ...previous,
        documentId: current.current?.documentId,
        anchorId: typeof selectedAnchor === 'string' ? selectedAnchor : previous.anchorId
      }
    }
    if (previous.kind === 'workspace' && previous.view === 'research') {
      const owner = {
        sources: 'sources',
        notes: 'notes',
        evidence: 'research',
        inspector: 'transcription'
      }[previous.target.kind]
      const target = drafts.states().find((state) => state.id === owner)?.target
      if (target?.kind === 'workspace' && sameScope(target.scope, previous.scope)) previous = target
    }
    return previous
  }
  function rememberOrigin(previous: AppDestination): void {
    setBackTrail((trail) => [...trail.slice(-19), previous])
  }
  const backDestination = backTrail.at(-1) ?? null
  const backLabel =
    backDestination?.kind === 'workspace'
      ? backDestination.view === 'write'
        ? 'writing'
        : backDestination.view === 'research'
          ? 'research'
          : backDestination.view
      : backDestination?.kind === 'library'
        ? 'Projects'
        : 'previous view'
  async function goBack(): Promise<boolean> {
    if (!backDestination) return false
    if (!(await navigate(backDestination, false))) return false
    setBackTrail((trail) => trail.slice(0, -1))
    return true
  }
  function navigate(next: AppDestination, remember = true): Promise<boolean> {
    if (
      navigationTask.current ||
      closingRef.current ||
      proofreadingBusy.current ||
      proofreadingApplication.current
    )
      return Promise.resolve(false)
    const task = (async (): Promise<boolean> => {
      if (outlinePending.current) {
        setError('Reconcile the pending outline/history operation before navigating.')
        return false
      }
      if (busy && !fileBusy(fileState.current.job)) {
        setError('Wait for the current project action before navigating.')
        return false
      }
      // Input is frozen only for this bounded transition; retained jobs continue independently.
      setNavigating(true)
      const previous = captureOrigin(destinationRef.current)
      const p = current.current
      if (p && !(await flush(false, 'navigate'))) return false
      if (next.kind === 'library' && storage.state === 'ready') await refresh()
      if (
        pendingImage.current &&
        next.kind === 'workspace' &&
        next.view === 'write' &&
        next.documentId &&
        next.documentId !== pendingImage.current.documentId
      ) {
        setError(
          'Retry the pending image import in its original section before choosing another section.'
        )
        return false
      }
      if (next.kind === 'workspace') {
        const active = current.current
        if (!active || !sameScope(next.scope, active)) {
          setError('Open this project from Projects before navigating to its contents.')
          return false
        }
        if (next.view === 'research') {
          if (
            next.target.kind === 'inspector' &&
            inspectionTarget?.sourceId !== next.target.sourceId
          ) {
            const issue = await drafts.protect('replace', ['manuscript'])
            if (issue) {
              setBlocker(issue)
              setError(issue.message)
              return false
            }
          }
          if (!(await resolveResearch(next.target, active))) return false
        } else if (
          next.view === 'write' &&
          next.documentId &&
          next.documentId !== active.documentId
        ) {
          const requested = active.documents.find((document) => document.id === next.documentId)
          if (!requested || requested.state === 'merged' || requested.kind !== 'text') {
            setError(
              `The requested section is ${requested?.state ?? 'missing'}. Restore it in the outline, or explicitly open its replacement. No different section was selected.`
            )
            return false
          }
          const result = await window.collie.openSection({
            ...scopeOf(active),
            documentId: next.documentId
          })
          if (!result.ok) {
            setError(result.error.message)
            return false
          }
          if (result.value.documentId !== next.documentId) {
            setError(
              'The section was merged. Open its replacement explicitly; no different section was selected.'
            )
            return false
          }
          if (next.anchorId && !payloadHasAnchor(result.value.payload, next.anchorId)) {
            setError('The exact passage is no longer present. Your current section is retained.')
            return false
          }
          anchorToFocus.current = next.anchorId ?? null
          await select(result.value)
        } else if (next.view === 'write' && next.anchorId) {
          const editor = editorRef.current
          const anchor = editor ? manuscriptAnchor(editor, next.anchorId) : null
          if (!anchor || !editor) {
            setError('The exact passage is no longer present. Your current section is retained.')
            return false
          }
          if (anchor.footnote) editor.commands.setNodeSelection(anchor.position)
          else
            editor.commands.setTextSelection(
              Math.min(anchor.position + 1, editor.state.doc.content.size)
            )
        }
      }
      if (next.kind === 'workspace' && next.view === 'write' && next.anchorId)
        setReferenceAnchor({
          id: next.anchorId,
          documentId: next.documentId ?? current.current!.documentId,
          request: Date.now()
        })
      if (remember && JSON.stringify(previous) !== JSON.stringify(next)) rememberOrigin(previous)
      setBlocker(null)
      setError('')
      showDestination(
        next,
        next.kind === 'workspace' && next.view === 'write'
          ? () => editorRef.current?.commands.focus()
          : undefined
      )
      return true
    })()
      .catch(() => {
        setError(
          'Navigation could not finish. Your current drafts and pending operations are retained.'
        )
        return false
      })
      .finally(() => {
        navigationTask.current = null
        setNavigating(false)
      })
    navigationTask.current = task
    return task
  }
  function workspace(
    view: 'write' | 'search' | 'export' | 'history' | 'details'
  ): AppDestination | null {
    const p = current.current
    return p ? { kind: 'workspace', scope: scopeOf(p), view, documentId: p.documentId } : null
  }
  function research(target: ResearchTarget): void {
    const p = current.current
    if (p) void navigate({ kind: 'workspace', scope: scopeOf(p), view: 'research', target })
  }
  function returnToWork(): void {
    const target =
      origin.current?.kind === 'workspace' && sameScope(origin.current.scope, current.current)
        ? origin.current
        : workspace('write')
    if (target) void navigate(target)
  }
  const manuscriptHandle = useRef<DraftHandle | null>(null)
  if (project)
    manuscriptHandle.current = {
      read: () => ({
        scope: scopeOf(current.current ?? project!),
        kind: 'manuscript',
        entityId: (current.current ?? project!).documentId,
        label: 'manuscript and section details',
        dirty: editVersionRef.current !== protectedVersionRef.current || isMetaDirty(),
        composing:
          composition.current || (!!editorRef.current && editorIsComposing(editorRef.current)),
        busy: !!committingTask.current,
        pendingOperation: retryCommit.current ?? metaPending.current,
        policy: 'flush',
        target: writingDestination(
          current.current ?? project!,
          (current.current ?? project!).documentId
        )
      }),
      flush: async () => !!(await flushManuscript()),
      focus: () => editorRef.current?.commands.focus()
    }
  useLayoutEffect(() => {
    if (!project) return
    return drafts.register('manuscript', {
      read: () => manuscriptHandle.current!.read(),
      flush: (mode) => manuscriptHandle.current!.flush!(mode),
      focus: () => manuscriptHandle.current!.focus?.()
    })
  }, [drafts, project?.projectId, project?.workspaceId])
  useLayoutEffect(() => {
    if (!project) return
    const owner = project
    return drafts.register('image-import', {
      read: () => ({
        scope: scopeOf(owner),
        kind: 'image-import',
        entityId: pendingImage.current?.documentId ?? owner.documentId,
        label: 'image import',
        dirty: false,
        composing: false,
        busy: false,
        pendingOperation: pendingImage.current,
        policy: 'operation',
        target: writingDestination(owner, pendingImage.current?.documentId ?? owner.documentId)
      })
    })
  }, [drafts, project?.projectId, project?.workspaceId])
  useLayoutEffect(() => {
    if (!project) return
    const owner = project
    return drafts.register('proofreading-application', {
      read: () => ({
        scope: scopeOf(owner),
        kind: 'proofreading-application',
        entityId: proofreadingApplication.current?.input.findingId ?? null,
        label: 'proofreading correction',
        dirty: !!proofreadingApplication.current,
        composing: false,
        busy: proofreadingBusy.current,
        pendingOperation: proofreadingApplication.current?.input ?? null,
        policy: 'explicit',
        target: writingDestination(owner, owner.documentId)
      })
    })
  }, [drafts, project?.projectId, project?.workspaceId])
  useLayoutEffect(() => {
    drafts.changed()
  })
  async function prepareSetupCreation(): Promise<boolean> {
    if (!available || closingRef.current) {
      setError('Choose a safe local working folder before creating a project.')
      return false
    }
    if (!(await waitActive())) return false
    setBusy(true)
    return !current.current || !!(await flush(false, 'replace'))
  }
  async function createSetupProject(input: CreateInput): Promise<ProjectResult<OpenProject>> {
    const result = await window.collie.createProject(input)
    if (result.ok) {
      await select(result.value, 'setup')
      await refresh()
    } else setError(result.error.message)
    return result
  }
  async function resumeSetupProject(
    receipt: { projectId: string; workspaceId: string; documentId: string },
    target: 'write' | 'details' | 'setup'
  ): Promise<boolean> {
    const scope = scopeOf(receipt)
    if (current.current && !sameScope(current.current, scope) && !(await flush(false, 'replace')))
      return false
    if (!sameScope(current.current, scope)) {
      const result = await window.collie.openSection({ ...scope, documentId: receipt.documentId })
      if (!result.ok) {
        setError(result.error.message)
        return false
      }
      await select(result.value, target === 'setup' ? 'setup' : 'write')
      if (target === 'details') showDestination({ kind: 'workspace', scope, view: 'details' })
      return true
    }
    if (target === 'details') return await navigate({ kind: 'workspace', scope, view: 'details' })
    else if (target === 'write')
      return await navigate(writingDestination(scope, receipt.documentId))
    else showDestination({ kind: 'setup' })
    return true
  }
  async function chooseProject(
    scope: OpenInput,
    after: 'write' | 'details' = 'write'
  ): Promise<void> {
    if (current.current && !(await flush(false, 'replace'))) return
    if (current.current && sameScope(current.current, scope)) {
      await refreshFiles(true)
      showDestination(
        after === 'details'
          ? { kind: 'workspace', scope, view: 'details' }
          : writingDestination(current.current, current.current.documentId)
      )
      setLibraryIssue(null)
      return
    }
    setBusy(true)
    await openLocal(scope, after)
  }

  return {
    manuscriptDirty:
      editVersion !== protectedVersion || sectionDirty || retry !== null || committing,
    applyProofreading,
    proofreadingLocked,
    refreshConversationHead,
    backDestination,
    backLabel,
    goBack,
    referenceAnchor,
    writingView,
    ...exportOperations,
    acceptProjectDetails,
    composition,
    actionTask,
    renamePending,
    storage,
    drafts,
    destination,
    focusRevision,
    focusRequest,
    navigating,
    blocker,
    navigate,
    returnToDraft,
    showAccess,
    workspace,
    research,
    returnToWork,
    startupPending,
    libraryIssue,
    setLibraryIssue,
    libraryView,
    setLibraryView,
    editorEpoch,
    setData,
    setList,
    location,
    setLocation,
    list,
    project,
    access,
    sectionTitle,
    setSectionTitle,
    sectionStatus,
    setSectionStatus,
    sectionSynopsis,
    setSectionSynopsis,
    sectionFields,
    busy: busy || proofreadingLocked,
    setBusy,
    acting,
    working,
    closing,
    committing,
    retry,
    error,
    setError,
    notice,
    setNotice,
    history,
    annotationCapture,
    noteDirty,
    sourceDirty,
    inspectionTarget,
    setInspectionTarget,
    citationContext,
    setCitationContext,
    outlineRetry,
    conflict,
    files,
    data,
    metaPending,
    current,
    editorRef,
    imageUrls,
    anchorToFocus,
    selectedSection,
    sectionReadOnly,
    sectionDirty,
    dirty,
    fileActive,
    accessReadOnly,
    accessTransition,
    available,
    updateProject,
    isDirty,
    changed,
    refresh,
    refreshData,
    importImage,
    navigateSection,
    navigateSearch,
    loadHistory,
    performOutline,
    saveSectionMeta,
    flush,
    flushManuscript,
    run,
    waitActive,
    save,
    openLocal,
    openFile,
    lifecycleFile,
    manage,
    resetLocal,
    captureAnnotation,
    afterNoteCommit,
    changeAccess,
    openTutorial,
    prepareSetupCreation,
    createSetupProject,
    resumeSetupProject,
    chooseProject
  }
}
