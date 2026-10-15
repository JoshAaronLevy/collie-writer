import type { CapturedSelection } from '../../editor/selection'
import { isEditableKind } from '../../../../shared/outline'
import { savePresentation, type SavePresentation } from '../projects/project-file-presentation'
import { spaceMessage } from '../../../../shared/storage-space'
import { useManuscriptProtection, type ManuscriptProtection } from './useManuscriptProtection'
import { useWorkspaceNavigation, type WorkspaceNavigation } from './useWorkspaceNavigation'
type WorkspaceControllerState = ManuscriptProtection &
  WorkspaceNavigation &
  ReturnType<typeof useExportOperations> & {
    localCopyTarget: OpenInput | null
    setLocalCopyTarget: React.Dispatch<React.SetStateAction<OpenInput | null>>
    projectDetailsOpen: boolean
    setProjectDetailsOpen: React.Dispatch<React.SetStateAction<boolean>>
    acceptProjectDetails: (next: OpenProject) => void
    composition: React.RefObject<boolean>
    actionTask: React.RefObject<Promise<unknown> | null>
    storage: StorageStatus
    drafts: DraftRegistry
    navigating: boolean
    blocker: DraftBlocker | null
    navigate: (
      next: AppDestination,
      remember?: boolean,
      presentation?: 'top' | 'resume'
    ) => Promise<boolean>
    returnToDraft: () => void
    showAccess: () => void
    startupPending: boolean
    libraryIssue: string | null
    setLibraryIssue: React.Dispatch<React.SetStateAction<string | null>>
    libraryView: 'active' | 'archived' | 'recent'
    setLibraryView: React.Dispatch<React.SetStateAction<'active' | 'archived' | 'recent'>>
    editorEpoch: number
    setData: React.Dispatch<React.SetStateAction<DataLocations | null>>
    setList: React.Dispatch<React.SetStateAction<ProjectList>>
    location: LocationStatus | null
    chooseWorkingLocation: () => Promise<void>
    list: ProjectList
    project: OpenProject | null
    access: AccessView | null
    busy: boolean
    setBusy: React.Dispatch<React.SetStateAction<boolean>>
    acting: boolean
    working: boolean
    closing: boolean
    error: string
    setError: React.Dispatch<React.SetStateAction<string>>
    history: HistoryView | null
    annotationCapture: AnnotationCapture | null
    noteDirty: boolean
    sourceDirty: boolean
    inspectionTarget: {
      sourceId: string
      excerptId: string | null
      versionId: string | null
      pageIndex: number | null
    } | null
    setInspectionTarget: React.Dispatch<
      React.SetStateAction<{
        sourceId: string
        excerptId: string | null
        versionId: string | null
        pageIndex: number | null
      } | null>
    >
    citationRequest: { sourceId: string; selection: CapturedSelection } | null
    setCitationRequest: React.Dispatch<
      React.SetStateAction<{ sourceId: string; selection: CapturedSelection } | null>
    >
    citationContext: {
      projectId: string
      sources: SourceRecord[]
      view: CitationsView | null
    } | null
    setCitationContext: React.Dispatch<
      React.SetStateAction<{
        projectId: string
        sources: SourceRecord[]
        view: CitationsView | null
      } | null>
    >
    outlineRetry: boolean
    files: FileStatus
    data: DataLocations | null
    current: React.RefObject<OpenProject | null>
    editorRef: React.RefObject<Editor | null>
    imageUrls: React.RefObject<Map<string, string>>
    sectionReadOnly: boolean
    dirty: boolean
    fileActive: boolean
    saveState: SavePresentation
    accessReadOnly: boolean
    accessTransition: boolean
    available: boolean
    updateProject: (next: OpenProject | null) => void
    isDirty: () => boolean
    refresh: () => Promise<void>
    refreshData: () => Promise<void>
    reviewRecovery: () => Promise<ProjectResult<DataLocations> | null>
    importImage: (details: { alt: string; caption: string }) => Promise<void>
    loadHistory: (checkpointId: string | null) => Promise<void>
    performOutline: (change?: OutlineChange, excludeDrafts?: string[]) => Promise<boolean>
    saveSectionMeta: () => Promise<void>
    flush: (
      forAccess?: boolean,
      mode?: FlushMode,
      exclude?: string[]
    ) => Promise<OpenProject | null>
    run: (work: () => Promise<unknown>) => void
    waitActive: () => Promise<boolean>
    save: (as: boolean) => Promise<boolean>
    openFile: (inspect?: boolean, locate?: boolean, shell?: boolean) => Promise<void>
    lifecycleFile: (
      kind: 'backup' | 'duplicate' | 'restore' | 'recover',
      artifactId?: string
    ) => Promise<boolean>
    archive: (input: ArchiveInput) => Promise<boolean>
    captureAnnotation: () => Promise<void>
    afterNoteCommit: () => Promise<void>
    adoptOutlineChange: () => Promise<boolean>
    changeAccess: (kind: 'designate' | 'finish' | 'import') => Promise<void>
    openTutorial: (reset: boolean) => Promise<void>
    prepareSetupCreation: () => Promise<SetupCompletion>
    createSetupProject: (input: CreateInput) => Promise<ProjectResult<OpenProject>>
    readSetupAccess: () => Promise<ProjectResult<AccessView>>
    completeSetupProject: (
      receipt: SetupReceipt,
      intent: SetupEditingIntent | null,
      mode: 'write' | 'read'
    ) => Promise<SetupCompletion>
    chooseProject: (scope: OpenInput, after?: 'write' | 'details') => Promise<void>
    applyProofreading: (capture?: ProofreadCapture, finding?: ProofreadFinding) => Promise<boolean>
    proofreadingLocked: boolean
    refreshConversationHead: (scope: OpenInput) => Promise<void>
    writingView: ReturnType<typeof useWritingPreferences>
  }
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
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import {
  effectiveState,
  type OutlineInput,
  type OutlineChange,
  type HistoryView
} from '../../../../shared/outline'
import type { DataLocations, ArchiveInput } from '../../../../shared/project-lifecycle'
import type { StorageStatus } from '../../../../shared/storage'
import {
  projectMessages,
  scopeOf,
  type CreateInput,
  type LocationStatus,
  type OpenInput,
  type OpenProject,
  type ProjectList,
  type ProjectResult
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
import {
  hasResumableSetup,
  type SetupReceipt,
  type SetupEditingIntent,
  type SetupCompletion
} from '../onboarding/setup-draft'
import { readLastProject, rememberLastProject } from '../library/last-project'
import type { AnnotationCapture } from '../projects/NotesPanel'
import type { CitationsView } from '../../../../shared/citations'
import type { SourceRecord } from '../../../../shared/sources'
import {
  editorIsComposing,
  hydrateDocument,
  lockEditorMutation,
  dispatchProtectedCorrection
} from '../../editor/adapter'
import { canEditProject, sameProject, type AccessView } from '../../../../shared/access'
import {
  pageDestination,
  writingDestination,
  type AppDestination,
  type ResearchTarget
} from '../../app/navigation'
import { DraftRegistry, type DraftBlocker, type FlushMode } from './drafts'
const emptyFiles: FileStatus = { scope: null, destination: null, state: 'unsaved', job: null }

export function useWorkspaceController(storage: StorageStatus): WorkspaceControllerState {
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
  const initialDestinationResolved = useRef(false)
  const [startupPending, setStartupPending] = useState(true)
  const [libraryIssue, setLibraryIssue] = useState<string | null>(null)
  const [libraryView, setLibraryView] = useState<'recent' | 'active' | 'archived'>('recent')
  const [navigating, setNavigating] = useState(false)
  const navigationTask = useRef<Promise<boolean> | null>(null)
  const [blocker, setBlocker] = useState<DraftBlocker | null>(null)
  const [location, setLocation] = useState<LocationStatus | null>(null)
  const [list, setList] = useState<ProjectList>({ projects: [], issues: [] })
  const [project, setProject] = useState<OpenProject | null>(null)
  const [access, setAccess] = useState<AccessView | null>(null)
  function applyAccess(next: AccessView): void {
    setAccess(next)
  }
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [busy, setBusy] = useState(false),
    [working, setActing] = useState(false),
    [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const [localCopyTarget, setLocalCopyTarget] = useState<OpenInput | null>(null)
  const [history, setHistory] = useState<HistoryView | null>(null)
  const [annotationCapture, setAnnotationCapture] = useState<AnnotationCapture | null>(null)
  const [inspectionTarget, setInspectionTarget] = useState<{
    sourceId: string
    excerptId: string | null
    versionId: string | null
    pageIndex: number | null
  } | null>(null)
  const [citationRequest, setCitationRequest] = useState<{
    sourceId: string
    selection: CapturedSelection
  } | null>(null)
  const [citationContext, setCitationContext] = useState<{
    projectId: string
    sources: SourceRecord[]
    view: CitationsView | null
  } | null>(null)

  const [outlineRetry, setOutlineRetry] = useState(false)
  const outlinePending = useRef<OutlineInput | null>(null)
  const acting = working || outlineRetry
  const [files, setFiles] = useState<FileStatus>(emptyFiles)
  const [data, setData] = useState<DataLocations | null>(null)
  const [projectDetailsOpen, setProjectDetailsOpen] = useState(false)
  const current = useRef<OpenProject | null>(null),
    editorRef = useRef<Editor | null>(null)
  const imageUrls = useRef(new Map<string, string>())
  const pendingSave = useRef<SaveInput | null>(null)
  // Presentation mirrors the existing request owner; neither field authorizes a file operation.
  const [pendingSaveScope, setPendingSaveScope] = useState<OpenInput | null>(null)
  const [savingScope, setSavingScope] = useState<OpenInput | null>(null)
  function retainSave(input: SaveInput | null): void {
    pendingSave.current = input
    setPendingSaveScope(input?.scope ?? null)
  }
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
  const manuscript = useManuscriptProtection({
    current,
    editorRef,
    composition,
    drafts,
    alive,
    storage,
    closing,
    canAutoProtect: () => !actionTask.current && !closingRef.current,
    proofreadingPending: () => !!proofreadingApplication.current,
    updateHead,
    setError
  })
  const { flushManuscript } = manuscript
  const navigation = useWorkspaceNavigation({
    current,
    editorRef,
    drafts,
    textProtected: manuscript.textProtected,
    navigate,
    setError
  })
  const {
    destination,
    destinationRef,
    positions,
    positionBinding,
    anchorToFocus,
    showDestination,
    captureOrigin,
    rememberOrigin,
    setReferenceAnchor
  } = navigation
  const dirty = manuscript.manuscriptDirty || drafts.hasUnprotected()
  const fileActive = fileBusy(files.job)
  const saveState = savePresentation(project, files, savingScope, pendingSaveScope)
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
      subtitle: next.subtitle,
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
    // A terminal event can arrive before the original request's running reply.
    // Keep the settled status; finishJob uses this same bounded outcome cache.
    if (next.job && fileBusy(next.job) && finishedJobs.current.has(next.job.id)) return
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
      if (
        next.job.kind === 'save' &&
        next.job.id === pendingSave.current?.operationId &&
        sameScope(next.job.scope, pendingSave.current.scope)
      )
        retainSave(null)
      finishedJobs.current.set(next.job.id, next.job)
      if (finishedJobs.current.size > 64)
        finishedJobs.current.delete(finishedJobs.current.keys().next().value!)
      for (const resolve of jobWaiters.current.get(next.job.id) ?? []) resolve(next.job)
      jobWaiters.current.delete(next.job.id)
    }
  }
  function isDirty(): boolean {
    return manuscript.isManuscriptDirty() || drafts.hasUnprotected()
  }
  const onFileStatus = useEffectEvent((status: FileStatus) => applyFiles(status))
  const onDirtyChanged = useEffectEvent(() => window.collie.setUnprotectedChanges(isDirty()))
  const onStorageReady = useEffectEvent(async () => {
    // The library and intended project become available before the broader recovery/size scan.
    await refresh()
    if (alive.current && !closingRef.current && (await waitActive())) await refreshData()
  })
  useEffect(() => {
    const waiters = jobWaiters.current
    alive.current = true
    void window.collie.getWorkingLocation().then((result) => {
      if (alive.current) {
        if (result.ok) setLocation(result.value)
        else setError(result.error.message)
      }
    })
    const offFiles = window.collie.onFileStatus(onFileStatus)
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
      for (const group of waiters.values()) for (const resolve of group) resolve(null)
      waiters.clear()
    }
  }, [])
  useEffect(() => {
    onDirtyChanged()
  }, [dirty, draftRevision])
  useEffect(() => {
    if (destination.kind !== 'workspace' || !project || !sameScope(destination.scope, project))
      return
    const selected = project.documents.find((item) => item.id === project.documentId)
    if (
      selected &&
      isEditableKind(selected.kind) &&
      effectiveState(selected, project.documents) === 'active'
    )
      rememberLastProject({ ...scopeOf(project), documentId: project.documentId })
  }, [destination, project])
  useEffect(() => {
    if (storage.state === 'ready') {
      void onStorageReady()
      return
    }
    if (storage.state === 'unavailable') {
      for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null)
      jobWaiters.current.clear()
    }
  }, [storage.state])
  async function resolveInitialDestination(projects: ProjectList): Promise<void> {
    if (initialDestinationResolved.current) return
    initialDestinationResolved.current = true
    try {
      if (destinationRef.current.kind !== 'setup' || hasResumableSetup()) return
      if (projects.projects.length === 0 && projects.issues.length === 0) return
      const saved = readLastProject()
      if (saved.issue) setLibraryIssue(saved.issue)
      const last = saved.value
      if (last) {
        const summary = projects.projects.find((item) => sameScope(item, last))
        if (!summary && !projects.issues.some((p) => sameScope(p.scope, last)))
          setLibraryIssue(
            'The previous project is not in this local library. Choose a project or review recovery.'
          )
        else if (summary?.archived) {
          setLibraryView('archived')
          setLibraryIssue(
            'The previous project is archived. Open it from Archived when you are ready.'
          )
        } else {
          const opened = await window.collie.openProject(scopeOf(last))
          if (opened.ok) {
            const selected = await resumeItem(opened.value, last.documentId)
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
      await resolveInitialDestination(result.value)
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
  async function reviewRecovery(): Promise<ProjectResult<DataLocations> | null> {
    const result = await window.collie.reviewRecovery()
    if (!alive.current) return null
    if (!result.ok) return result
    setData(result.value)
    setList(result.value.projects)
    const retained = pendingSave.current
    if (
      retained &&
      result.value.recovery.some(
        (i) =>
          i.kind === 'save' &&
          i.outcome === 'confirmed' &&
          sameScope(i.scope, retained.scope) &&
          i.operationId === retained.operationId
      )
    )
      retainSave(null)
    // Destination changes never replace editor content, selection, or buffered metadata.
    await refreshFiles(true)
    await waitActive()
    return result
  }
  async function refreshFiles(recheck = false): Promise<void> {
    const result = await window.collie.getProjectFileStatus(
      current.current ? scopeOf(current.current) : null,
      recheck
    )
    if (result.ok) applyFiles(result.value)
    else setError(result.error.message)
  }
  async function resumeItem(opened: OpenProject, fallbackId?: string): Promise<OpenProject> {
    const legacy = readLastProject().value
    const preferredId =
      positions.selected(scopeOf(opened)) ??
      (legacy && sameScope(legacy, opened) ? legacy.documentId : fallbackId)
    const preferred = opened.documents.find((item) => item.id === preferredId)
    if (
      !preferred ||
      !isEditableKind(preferred.kind) ||
      effectiveState(preferred, opened.documents) !== 'active' ||
      preferred.id === opened.documentId
    )
      return opened
    const result = await window.collie.openSection({ ...scopeOf(opened), documentId: preferred.id })
    return result.ok && result.value.documentId === preferred.id ? result.value : opened
  }
  async function select(
    next: OpenProject,
    after: 'write' | 'plan' | 'setup' | 'details' = 'write'
  ): Promise<void> {
    positionBinding.current?.capture()
    const retainEditor =
      !!current.current &&
      sameScope(current.current, next) &&
      current.current.documentId === next.documentId &&
      !!editorRef.current &&
      editorRef.current.state.doc.eq(
        editorRef.current.schema.nodeFromJSON(hydrateDocument(next.payload))
      )
    if (!sameScope(current.current, next)) {
      setProjectDetailsOpen(false)
      navigation.resetNavigation()
    }
    let imageIssue = ''
    if (!retainEditor) {
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
      let imageBytes = 0
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
        loaded.set(
          assetId,
          URL.createObjectURL(new Blob([bytes], { type: result.value.mediaType }))
        )
      }
      for (const url of imageUrls.current.values()) URL.revokeObjectURL(url)
      imageUrls.current = loaded
    }
    if (current.current?.projectId !== next.projectId) {
      setHistory(null)
      setInspectionTarget(null)
    }
    setAnnotationCapture(null)
    if (!retainEditor) {
      positionBinding.current?.dispose()
      positionBinding.current = null
    }
    updateProject(next)
    const item = next.documents.find((d) => d.id === next.documentId)
    if (item && effectiveState(item, next.documents) === 'active')
      positions.remember(scopeOf(next), next.documentId)
    if (!retainEditor) setEditorEpoch((value) => value + 1)
    manuscript.resetManuscript(next)
    window.collie.setUnprotectedChanges(drafts.hasUnprotected())
    setError(imageIssue)
    if (!(
      retainEditor &&
      (after === 'write' || after === 'plan') &&
      destinationRef.current.kind === 'workspace' &&
      destinationRef.current.view === after
    ))
      showDestination(
        after === 'setup'
          ? { kind: 'setup' }
          : after === 'details' || after === 'plan'
            ? { kind: 'workspace', scope: scopeOf(next), view: after }
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
  }
  async function loadHistory(checkpointId: string | null): Promise<void> {
    setBusy(true)
    const p = await flush()
    if (!p) return
    const result = await window.collie.readHistory({ ...scopeOf(p), checkpointId })
    if (result.ok) setHistory(result.value)
    else setError(result.error.message)
  }
  async function performOutline(
    change?: OutlineChange,
    excludeDrafts: string[] = []
  ): Promise<boolean> {
    if (!(await waitActive())) return false
    setBusy(true)
    if (!outlinePending.current) {
      const p = await flush(false, 'save', excludeDrafts)
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
        setError('Select that saved version before restoring it.')
        return false
      }
      if (
        ['restore', 'prune', 'repair'].includes(change.type) &&
        history?.headCommitId !== p.headCommitId
      ) {
        setError('Your writing changed. Refresh history before trying this action again.')
        return false
      }
      outlinePending.current = {
        hierarchyVersion: 2,
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
          ? 'This outline change is not valid. Keep at least one active Chapter or Section. Parents must be outside the moved branch and keep the whole outline within eight levels. Split between existing blocks; merge only items without children. The whole change was left unapplied.'
          : result.error.message
      )
      return false
    }
    if (
      destinationRef.current.kind === 'workspace' &&
      destinationRef.current.view === 'plan' &&
      current.current
    ) {
      if (!(await adoptOutlineChange())) return false
    } else await select(result.value)
    outlinePending.current = null
    setOutlineRetry(false)
    setHistory(null)
    await refresh()
    if (destinationRef.current.kind === 'workspace' && destinationRef.current.view === 'history')
      await loadHistory(null)
    return true
  }
  async function saveSectionMeta(): Promise<void> {
    if (await flush()) await refresh()
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
    if (job?.error && job.state !== 'cancelled')
      setError(job.space ? spaceMessage(job.space) : projectMessages[job.error])
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
    const requested = current.current
    if (!requested) return false
    const retained = pendingSave.current
    if (retained && (as || !sameScope(retained.scope, requested))) {
      setError('Retry the pending Save in its original project before choosing another location.')
      return false
    }
    setSavingScope(scopeOf(requested))
    setBusy(true)
    try {
      if (!(await waitActive())) return false
      const p = await flush()
      if (!p || !sameScope(p, requested)) return false
      await refreshFiles()
      if (!(await waitActive())) return false
      let token: string | null = null
      const destination = fileState.current.destination
      if ((as || !destination) && !retained) {
        const choice = await window.collie.pickProjectFile({
          purpose: 'save',
          scope: scopeOf(p),
          suggestedName: p.title
        })
        if (!choice.ok || !choice.value) {
          if (!choice.ok) setError(choice.error.message)
          return false
        }
        token = choice.value.token
      }
      const input: SaveInput = retained ?? {
        scope: scopeOf(p),
        operationId: crypto.randomUUID(),
        minimumHead: p.headCommitId,
        expectedGeneration: destination?.generationId ?? null,
        token
      }
      retainSave(input)
      setBusy(false)
      setError('')
      const result = await window.collie.saveProjectFile(input)
      const job = await finishJob(result, input.operationId)
      if (job || (!result.ok && result.error.code !== 'UNAVAILABLE')) retainSave(null)
      if (job?.state === 'completed') {
        // Reconcile the old request before capturing newer edits from this explicit Save.
        if (retained && fileState.current.destination?.headCommitId !== p.headCommitId)
          return await save(false)
        await refreshConversationHead(scopeOf(p))
        await refreshFiles()
        await refresh()
        return true
      }
      return false
    } finally {
      setSavingScope(null)
      setBusy(false)
    }
  }
  async function openLocal(scope: OpenInput, after: 'write' | 'details' = 'write'): Promise<void> {
    const result = await window.collie.openProject(scope)
    if (result.ok) {
      await select(await resumeItem(result.value), after)
      await refresh()
      setLibraryIssue(null)
    } else {
      const title = list.projects.find((p) => sameScope(p, scope))?.title
      setError(
        `${title ? `Could not open “${title}”` : 'The selected project could not open'}: ${result.error.message}`
      )
    }
  }
  async function openFile(inspect = false, locate = false, shell = false): Promise<void> {
    if (!(await waitActive())) return
    setBusy(true)
    if (current.current && !(await flush(false, 'replace'))) return
    setError('')
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
    kind: 'backup' | 'duplicate' | 'restore' | 'recover',
    artifactId?: string
  ): Promise<boolean> {
    if (pendingSave.current) {
      setError(
        'Collie has not confirmed the pending Save. Finish that Save before creating or opening another copy.'
      )
      return false
    }
    if (!(await waitActive())) return false
    setBusy(true)
    const p = current.current
      ? await flush(false, ['duplicate', 'restore', 'recover'].includes(kind) ? 'replace' : 'save')
      : null
    if (current.current && !p) return false
    setError('')
    const operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (kind === 'recover' && artifactId)
      result = await window.collie.recoverProjectVersion({ operationId, artifactId })
    else if (kind === 'restore') {
      const selection = await window.collie.pickProjectFile({ purpose: 'restore', scope: null })
      if (!selection.ok || !selection.value) {
        if (!selection.ok) setError(selection.error.message)
        return false
      }
      result = await window.collie.restoreProject({ operationId, token: selection.value.token })
    } else if (p && kind === 'duplicate')
      result = await window.collie.duplicateProject({
        operationId,
        scope: scopeOf(p),
        expectedHead: p.headCommitId
      })
    else if (p && kind === 'backup') {
      await refreshFiles()
      if (!(await waitActive())) return false
      const selection = await window.collie.pickProjectFile({
        purpose: 'backup',
        scope: scopeOf(p),
        suggestedName: p.title
      })
      if (!selection.ok || !selection.value) {
        if (!selection.ok) setError(selection.error.message)
        return false
      }
      const input: SaveInput = {
        operationId,
        scope: scopeOf(p),
        minimumHead: p.headCommitId,
        expectedGeneration: fileState.current.destination?.generationId ?? null,
        token: selection.value.token
      }
      result = await window.collie.backupProject(input)
    } else return false
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed') {
      if (job.opened) {
        await openLocal(job.opened)
        if (!sameScope(current.current, job.opened)) return false
      }
    }
    if (!(await waitActive())) return false
    await refreshData()
    return job?.state === 'completed'
  }
  async function archive(input: ArchiveInput): Promise<boolean> {
    if (!(await waitActive())) return false
    setBusy(true)
    const p = await flush()
    if (!p) return false
    if (!sameScope(p, input.scope)) {
      setError('Open the selected project before changing its archive status.')
      return false
    }
    const result = await window.collie.archiveProject(input)
    if (!result.ok) {
      setError(result.error.message)
      return false
    }
    // Organization changes do not replace editor content, selection or undo history.
    updateProject({ ...p, archived: result.value.archived })
    await waitActive()
    await refresh()
    return true
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
      positionBinding.current?.capture()
      positions.flush()
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
      manuscript.markProtected()
      lockEditorMutation(editor, false)
      proofreadingApplication.current = null
      setProofreadingLocked(false)
      setHistory(null)
      setError('')
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
  async function adoptOutlineChange(): Promise<boolean> {
    const p = current.current
    if (!p) return false
    const result = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
    if (!result.ok) {
      setError(result.error.message)
      return false
    }
    await select(result.value, 'plan')
    return true
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
  }
  const available = storage.state === 'ready' && location?.state === 'ready'

  async function chooseWorkingLocation(): Promise<void> {
    if (closingRef.current || location?.state !== 'required') return
    const result = await window.collie.chooseWorkingLocation()
    if (result.ok) setLocation(result.value)
    else setError(result.error.message)
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
  function navigate(
    next: AppDestination,
    remember = true,
    presentation: 'top' | 'resume' = 'top'
  ): Promise<boolean> {
    if (
      navigationTask.current ||
      closingRef.current ||
      proofreadingBusy.current ||
      proofreadingApplication.current
    )
      return Promise.resolve(false)
    if (
      presentation === 'top' &&
      !(next.kind === 'workspace' && next.view === 'write' && next.anchorId) &&
      !(next.kind === 'workspace' && next.view === 'export' && next.exportResultId) &&
      JSON.stringify(pageDestination(destinationRef.current)) ===
        JSON.stringify(pageDestination(next))
    )
      return Promise.resolve(true)
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
      positionBinding.current?.capture()
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
        if (next.view === 'history') {
          const result = await window.collie.readHistory({
            ...scopeOf(active),
            checkpointId: history?.checkpointId ?? null
          })
          if (!result.ok) {
            setError(result.error.message)
            return false
          }
          setHistory(result.value)
        } else if (next.view === 'research') {
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
          if (!requested || requested.state === 'merged' || !isEditableKind(requested.kind)) {
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
          positionBinding.current?.cancelRestore()
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
        next.kind === 'workspace' && next.view === 'write' && next.anchorId
          ? () => {
              const editor = editorRef.current
              if (!editor || editor.isDestroyed) return
              editor.view.focus()
              editor.view.dispatch(editor.state.tr.scrollIntoView())
            }
          : undefined,
        next.kind === 'workspace' && next.view === 'write' && next.anchorId
          ? 'target'
          : presentation
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
  useLayoutEffect(() => {
    if (!project) return
    const owner = project
    return drafts.register('project-file-save', {
      read: () => ({
        scope: pendingSave.current?.scope ?? scopeOf(owner),
        kind: 'project-file-save',
        entityId: pendingSave.current?.operationId ?? null,
        label: 'pending project-file Save',
        dirty: false,
        composing: false,
        busy: !!pendingSave.current && !!actionTask.current,
        pendingOperation: pendingSave.current,
        policy: 'operation',
        target: writingDestination(pendingSave.current?.scope ?? owner, owner.documentId)
      })
    })
  }, [drafts, project])
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
  }, [drafts, project])
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
  }, [drafts, project])
  useLayoutEffect(() => {
    drafts.changed()
  })
  async function prepareSetupCreation(): Promise<SetupCompletion> {
    const blocked = (message: string): SetupCompletion => ({ ok: false, message })
    if (!available || closingRef.current)
      return blocked(
        'Choose a safe local working folder and finish closing before creating a project.'
      )
    if (
      navigationTask.current ||
      composition.current ||
      outlinePending.current ||
      proofreadingBusy.current ||
      proofreadingApplication.current
    )
      return blocked(
        'Finish composing or reconcile the pending navigation, outline, or proofreading action before creating a project.'
      )
    if (!(await waitActive()))
      return blocked('Finish the pending file action before creating a project.')
    setBusy(true)
    if (current.current && !(await flush(false, 'replace')))
      return {
        ok: false,
        message: 'Protect the pending project work shown above, then continue creation.'
      }
    return { ok: true }
  }
  async function createSetupProject(input: CreateInput): Promise<ProjectResult<OpenProject>> {
    // Return the receipt before any renderer opening work can fail. The wizard
    // persists it before designation or selecting a new draft owner.
    return window.collie.createProject(input)
  }
  async function readSetupAccess(): Promise<ProjectResult<AccessView>> {
    const result = await window.collie.readAccess()
    if (result.ok) applyAccess(result.value)
    else setAccess(null)
    return result
  }
  async function completeSetupProject(
    receipt: SetupReceipt,
    intent: SetupEditingIntent | null,
    mode: 'write' | 'read'
  ): Promise<SetupCompletion> {
    const blocked = (message: string): SetupCompletion => ({ ok: false, message })
    if (
      !available ||
      closingRef.current ||
      navigationTask.current ||
      composition.current ||
      outlinePending.current ||
      proofreadingBusy.current ||
      proofreadingApplication.current
    )
      return blocked(
        'Finish the current action and check local storage, then continue with this saved project.'
      )
    if (!(await waitActive()))
      return blocked('Finish the pending file action before opening this project.')
    setBusy(true)
    // This includes explicit form drafts and pending AI outcomes. Do not replace
    // a retained owner or revoke its edit rights before protection succeeds.
    if (current.current && !(await flush(false, 'replace')))
      return blocked('Protect the pending work shown above, then continue with this saved project.')
    window.collie.setUnprotectedChanges(isDirty())
    if (isDirty()) return blocked('Protect every pending draft before continuing.')
    const scope = scopeOf(receipt)
    // Receipts and library hints do not retain worker ownership across restart.
    // Open before reading sections or granting editing access to this saved project.
    if (!sameScope(current.current, scope)) {
      const opened = await window.collie.openProject(scope)
      if (!opened.ok) return blocked(opened.error.message)
      const selected = await resumeItem(opened.value, receipt.documentId)
      await select(selected, 'setup')
    }
    if (current.current?.archived)
      return blocked('This project was archived. Restore it from Projects before continuing.')
    if (mode === 'read') {
      await readSetupAccess()
    }
    if (mode === 'write') {
      const latest = await readSetupAccess()
      if (!latest.ok)
        return blocked(
          'Editing access could not be read. Check access and retry; your project is kept.'
        )
      if (
        latest.value.state === 'unavailable' ||
        latest.value.storageWarning ||
        latest.value.transition
      )
        return blocked(
          'Resolve Collie access in Settings before continuing. Your project is kept and can be opened for reading.'
        )
      if (!canEditProject(latest.value, scope)) {
        const sameFree =
          intent &&
          ((intent.freeProject === null && latest.value.freeProject === null) ||
            sameProject(intent.freeProject, latest.value.freeProject))
        if (
          !intent ||
          intent.mode !== 'designate' ||
          intent.expectedRevision !== latest.value.revision ||
          !sameFree
        )
          return blocked(
            'The editing choice needs confirmation. Review the current choice below, then choose Write in this project, or open for reading.'
          )
        const designated = await window.collie.designateFreeProject({
          scope,
          expectedRevision: intent.expectedRevision
        })
        // Read authoritative access even after an uncertain reply, before another
        // mutation. A confirmed designation can finish without sending it again.
        const confirmed = await readSetupAccess()
        if (!confirmed.ok)
          return blocked(
            'The editing change could not be confirmed. Retry with this saved project; no new project will be created.'
          )
        if (
          confirmed.value.storageWarning ||
          confirmed.value.transition ||
          !canEditProject(confirmed.value, scope)
        )
          return blocked(
            designated.ok
              ? 'Editing access changed. Review the current choice and try again.'
              : designated.error.message
          )
      }
    }
    if (closingRef.current) return blocked('Finish closing or return to setup to continue.')
    if (mode === 'write') {
      const confirmed = await readSetupAccess()
      if (
        !confirmed.ok ||
        confirmed.value.storageWarning ||
        confirmed.value.transition ||
        !canEditProject(confirmed.value, scope)
      )
        return blocked(
          'Editing access could not be confirmed after opening. Your project is kept; check access and continue again.'
        )
    }
    const opened = current.current
    if (closingRef.current || !opened || !sameScope(opened, scope))
      return blocked('Opening could not be confirmed. Continue with this same saved project.')
    showDestination(writingDestination(scope, opened.documentId))
    return { ok: true }
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
    ...manuscript,
    ...navigation,
    applyProofreading,
    proofreadingLocked,
    refreshConversationHead,
    writingView,
    ...exportOperations,
    acceptProjectDetails,
    composition,
    actionTask,
    projectDetailsOpen,
    setProjectDetailsOpen,
    storage,
    drafts,
    navigating,
    blocker,
    navigate,
    returnToDraft,
    showAccess,
    startupPending,
    libraryIssue,
    setLibraryIssue,
    libraryView,
    setLibraryView,
    editorEpoch,
    setData,
    setList,
    location,
    chooseWorkingLocation,
    list,
    project,
    access,
    busy: busy || proofreadingLocked,
    setBusy,
    acting,
    working,
    closing,
    error,
    setError,
    localCopyTarget,
    setLocalCopyTarget,
    history,
    annotationCapture,
    noteDirty,
    sourceDirty,
    inspectionTarget,
    setInspectionTarget,
    citationRequest,
    setCitationRequest,
    citationContext,
    setCitationContext,
    outlineRetry,
    files,
    data,
    current,
    editorRef,
    imageUrls,
    sectionReadOnly,
    dirty,
    fileActive,
    saveState,
    accessReadOnly,
    accessTransition,
    available,
    updateProject,
    isDirty,
    refresh,
    refreshData,
    reviewRecovery,
    importImage,
    loadHistory,
    performOutline,
    saveSectionMeta,
    flush,
    run,
    waitActive,
    save,
    openFile,
    lifecycleFile,
    archive,
    captureAnnotation,
    afterNoteCommit,
    adoptOutlineChange,
    changeAccess,
    openTutorial,
    prepareSetupCreation,
    createSetupProject,
    readSetupAccess,
    completeSetupProject,
    chooseProject
  }
}
