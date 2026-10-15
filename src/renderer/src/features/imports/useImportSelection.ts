import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { MappingSelection } from '../../../../shared/import-graph'
import type { SemanticSelection } from '../../../../shared/import-semantic'
import type { ReviewCounts } from '../../../../shared/import-review'
import { sameScope } from '../../../../shared/project-files'
import type { OpenInput } from '../../../../shared/projects'
import {
  isImportSettings,
  type ImportBatchSummary,
  type ImportCategory,
  type ImportFile,
  type ImportMutation,
  type ImportPickResult,
  type ImportRevision,
  type ImportServiceRequest,
  type ImportSettings,
  type ImportValue
} from '../../../../shared/project-import'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useAiConnections } from '../ai-connections/connectionState'
import { importAvailability } from './import-availability'
import { useImportFlow } from './useImportFlow'

type State = {
  scope: OpenInput | null
  title: string
  opened: boolean
  screen: 'setup' | 'results'
  busy: boolean
  issue: string
  revision: ImportRevision | null
  files: ImportFile[]
  batches: ImportBatchSummary[]
  settings: ImportSettings
  selected: string[]
  pending: ImportMutation | null
  uncertainPicker: boolean
  results: ImportPickResult[]
}
const initial = (): State => ({
  scope: null,
  title: '',
  opened: false,
  screen: 'setup',
  busy: false,
  issue: '',
  revision: null,
  files: [],
  batches: [],
  settings: { categories: [], instructions: '' },
  selected: [],
  pending: null,
  uncertainPicker: false,
  results: []
})
const dirty = (s: State): boolean =>
  s.revision
    ? JSON.stringify(s.settings) !== JSON.stringify(s.revision.settings) ||
      JSON.stringify(s.selected) !== JSON.stringify(s.revision.selectedFileIds)
    : s.settings.categories.length > 0 || s.settings.instructions.length > 0
type ImportSelection = {
  state: State
  flow: ReturnType<typeof useImportFlow>
  writable: boolean
  blocked: boolean
  dirty: boolean
  success: { id: string; text: string; scope: OpenInput } | null
  dismissSuccess: () => void
  open: (trigger: HTMLElement, category?: ImportCategory) => void
  dropFiles: (trigger: HTMLElement, files: File[]) => void
  showAnalysis: (attemptId: string) => void
  close: (manage?: boolean) => Promise<void>
  exited: () => void
  showSetup: () => void
  addFiles: () => Promise<void>
  removeFile: (id: string) => void
  setCategory: (category: ImportCategory, checked: boolean) => void
  setInstructions: (instructions: string) => void
  selectModel: (modelId: string, trigger: HTMLElement) => void
  submit: (continueAnalysis?: boolean, viewAvailable?: boolean) => Promise<void>
  transitionHybrid: () => Promise<void>
  startNew: () => Promise<void>
  check: () => Promise<boolean>
  resolve: (decision: 'retry' | 'abandon') => Promise<void>
  presentation: React.RefObject<HTMLDivElement | null>
  trackFocus: (event: React.FocusEvent<HTMLDivElement>) => void
  composition: ReturnType<typeof useRetainedDraft>
}

/** Retained selection, exact intake recovery and dialog lifecycle; rendering owns no mutations. */
export function useImportSelection(): ImportSelection {
  const session = useWorkspaceSession(),
    connections = useAiConnections()
  const latestSession = useRef(session)
  useLayoutEffect(() => {
    latestSession.current = session
  })
  const [state, render] = useState<State>(initial),
    [success, setSuccess] = useState<{ id: string; text: string; scope: OpenInput } | null>(null)
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 8000)
    return () => clearTimeout(timer)
  }, [success])
  const owned = useRef(state),
    trigger = useRef<HTMLElement | null>(null),
    origin = useRef(''),
    manage = useRef(false),
    composing = useRef(false),
    presentation = useRef<HTMLDivElement | null>(null),
    focusedControl = useRef<{
      element: HTMLElement
      scope: OpenInput | null
      destination: string
    } | null>(null)
  const patch = (value: Partial<State>): void => {
    owned.current = { ...owned.current, ...value }
    render(owned.current)
    session.drafts.changed()
  }
  const projectId = session.project?.projectId,
    workspaceId = session.project?.workspaceId
  const onAnalysisRecovery = useEffectEvent(async (captured: OpenInput, issue: string | null) => {
    if (!sameScope(session.project, captured)) return
    if (issue) patch({ issue })
    else await session.refreshConversationHead(captured)
  })
  useEffect(() => {
    if (!projectId || !workspaceId) return
    const captured = { projectId, workspaceId }
    let live = true
    // Finish only retained output and exact receipts. No grant, analysis or Accept.
    void window.collie
      .importAnalysis({ ...captured, action: 'reconcile' })
      .then(async (result) => {
        if (live) await onAnalysisRecovery(captured, result.ok ? null : result.error.message)
      })
      .catch(() => {
        if (live)
          void onAnalysisRecovery(
            captured,
            'Saved import responses could not be recovered. Open Import to try local recovery; nothing was sent.'
          )
      })
    return () => {
      live = false
    }
  }, [projectId, workspaceId])
  const writable =
    !session.accessReadOnly &&
    !session.accessTransition &&
    session.available &&
    !session.closing &&
    !session.navigating &&
    !session.fileActive &&
    !!session.project &&
    !!state.scope &&
    sameScope(session.project, state.scope)
  const blocked =
    state.busy ||
    !!state.pending ||
    state.uncertainPicker ||
    !writable ||
    state.revision?.phase === 'discarded' ||
    state.batches.some((b) => b.id === state.revision?.batchId && b.phase === 'completed')
  const flow = useImportFlow({
    focus: () => patch({ opened: true }),
    ready: (scope) => {
      const live = latestSession.current
      if (
        owned.current.opened &&
        sameScope(owned.current.scope, scope) &&
        sameScope(live.current.current, scope) &&
        JSON.stringify(live.destination) === origin.current &&
        !live.closing &&
        !live.navigating &&
        !live.composition.current
      )
        patch({ screen: 'results' })
    },
    committed: (scope, counts) => {
      if (
        !sameScope(owned.current.scope, scope) ||
        !sameScope(latestSession.current.current.current, scope)
      )
        return
      patch({ opened: false, issue: '' })
      setSuccess({ id: crypto.randomUUID(), text: importNotice(counts), scope })
    }
  })
  async function request(input: ImportServiceRequest): Promise<ImportValue> {
    const result = await window.collie.projectImport(input)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  function scope(): OpenInput {
    const current = owned.current.scope
    if (!current || !session.current.current || !sameScope(current, session.current.current))
      throw new Error('Reopen the original project to continue this selection.')
    return current
  }
  async function loadBatch(batchId: string): Promise<void> {
    const captured = scope()
    const value = await request({
      ...captured,
      action: 'read',
      batchId,
      revisionId: null,
      offset: 0
    })
    if (value.type !== 'batch') throw new Error('The saved import selection could not be read.')
    const files = [...value.files]
    if (value.nextOffset !== null) {
      const next = await request({
        ...captured,
        action: 'read',
        batchId,
        revisionId: value.revision.id,
        offset: value.nextOffset
      })
      if (
        next.type !== 'batch' ||
        next.revision.id !== value.revision.id ||
        next.nextOffset !== null
      )
        throw new Error('The saved file list could not be read completely.')
      files.push(...next.files)
    }
    if (!owned.current.scope || !sameScope(captured, owned.current.scope)) return
    patch({
      revision: value.revision,
      files,
      selected: [...value.revision.selectedFileIds],
      settings: structuredClone(value.revision.settings)
    })
  }
  async function loadList(): Promise<ImportBatchSummary[]> {
    const captured = scope(),
      batches: ImportBatchSummary[] = []
    let offset: number | null = 0
    while (offset !== null) {
      const value = await request({ ...captured, action: 'list', offset })
      if (value.type !== 'batches' || (value.nextOffset !== null && value.nextOffset <= offset))
        throw new Error('Saved imports could not be read.')
      if (!sameScope(captured, owned.current.scope)) return []
      batches.push(...value.batches)
      offset = value.nextOffset
    }
    patch({ batches })
    return batches
  }
  function formIntent(): string {
    return JSON.stringify([owned.current.scope, owned.current.selected, owned.current.settings])
  }
  async function run(work: () => Promise<void>): Promise<boolean> {
    if (owned.current.busy) return false
    if (composing.current) {
      patch({ issue: 'Finish composing instructions before continuing.' })
      return false
    }
    patch({ busy: true, issue: '' })
    try {
      await work()
      return true
    } catch (error) {
      patch({
        issue:
          error instanceof Error
            ? error.message
            : 'The local change could not be confirmed. Your selection is retained.'
      })
      return false
    } finally {
      patch({ busy: false })
    }
  }
  async function write(mutation: Exclude<ImportMutation, { action: 'add-file' }>): Promise<void> {
    patch({ pending: structuredClone(mutation) })
    const result = await request({ ...scope(), action: 'mutate', mutation })
    if (result.type !== 'receipt' || !result.receipt || result.operationId !== mutation.operationId)
      throw new Error(
        'Local protection could not be confirmed. Reconcile this exact change before continuing.'
      )
    await loadBatch(mutation.batchId)
    await session.refreshConversationHead(scope())
    await loadList()
    patch({ pending: null })
  }
  async function protect(): Promise<boolean> {
    if (owned.current.pending || owned.current.uncertainPicker || owned.current.busy) return false
    if (composing.current) {
      patch({ issue: 'Finish composing instructions before keeping this selection.' })
      return false
    }
    if (!dirty(owned.current)) return true
    if (!writable || !isImportSettings(owned.current.settings)) {
      patch({
        issue:
          'Choose valid settings in the writable destination project before keeping this selection.'
      })
      return false
    }
    const current = owned.current
    return run(() =>
      write(
        current.revision
          ? {
              version: 1,
              action: 'configure',
              operationId: crypto.randomUUID(),
              batchId: current.revision.batchId,
              expectedRevision: current.revision.id,
              settings: structuredClone(current.settings),
              selectedFileIds: [...current.selected]
            }
          : {
              version: 1,
              action: 'create',
              operationId: crypto.randomUUID(),
              batchId: crypto.randomUUID(),
              settings: structuredClone(current.settings)
            }
      )
    )
  }
  async function recover(): Promise<void> {
    const value = await request({ ...scope(), action: 'recovery' })
    if (value.type !== 'recovery') throw new Error('Local import recovery is unavailable.')
    if (value.busy) {
      patch({ uncertainPicker: true })
      throw new Error(
        'Local file intake is still finishing. Check its saved outcome again before continuing.'
      )
    }
    const pending = value.pending ?? owned.current.pending
    patch({ pending, uncertainPicker: false })
    if (pending) {
      const known = await request({ ...scope(), action: 'lookup', mutation: pending })
      if (known.type !== 'receipt') throw new Error('The saved outcome could not be confirmed.')
      if (known.receipt) {
        await loadBatch(pending.batchId)
        await session.refreshConversationHead(scope())
        patch({ pending: null })
      } else {
        if (pending.action !== 'create') await loadBatch(pending.batchId)
        if (pending.action === 'create' || pending.action === 'configure')
          patch({
            settings: structuredClone(pending.settings),
            ...(pending.action === 'configure' ? { selected: [...pending.selectedFileIds] } : {})
          })
        patch({
          issue:
            pending.action === 'add-file'
              ? 'This file was not saved. Try saving again or remove the failed file.'
              : 'This change was not saved. Try saving again or restore saved choices.'
        })
      }
    } else if (owned.current.revision && !dirty(owned.current))
      await loadBatch(owned.current.revision.batchId)
  }
  function open(
    element: HTMLElement,
    attemptId?: string,
    category?: ImportCategory,
    files?: File[]
  ): void {
    if (
      !session.project ||
      session.closing ||
      session.navigating ||
      session.composition.current ||
      document.querySelector('[role="dialog"], [role="alertdialog"]') ||
      owned.current.busy
    )
      return
    const captured = {
      projectId: session.project.projectId,
      workspaceId: session.project.workspaceId
    }
    const unsettled =
      dirty(owned.current) ||
      owned.current.pending ||
      owned.current.uncertainPicker ||
      flow.pendingCommit ||
      flow.pendingAutomatic ||
      flow.pendingLocal ||
      flow.busy
    if (!owned.current.scope || !sameScope(owned.current.scope, captured)) {
      if (unsettled) return
      owned.current = { ...initial(), scope: captured, title: session.project.title }
    }
    if (
      !unsettled &&
      ((flow.phase === 'complete' &&
        sameScope(flow.scope, captured) &&
        (!owned.current.revision ||
          owned.current.revision.batchId === flow.summary?.manifest.batchId)) ||
        owned.current.revision?.phase === 'discarded' ||
        owned.current.batches.some(
          (b) => b.id === owned.current.revision?.batchId && b.phase === 'completed'
        ))
    )
      owned.current = { ...initial(), scope: captured, title: session.project.title }
    trigger.current = element
    setSuccess(null)
    origin.current = JSON.stringify(session.destination)
    manage.current = false
    patch({
      opened: true,
      title: session.project.title,
      ...(flow.pendingCommit ? { screen: 'results' as const } : {})
    })
    void run(async () => {
      await recover()
      const batches = await loadList()
      if (attemptId && !owned.current.pending && !flow.pendingLocal && !dirty(owned.current)) {
        const attempt = await window.collie.importAnalysis({
          ...captured,
          action: 'attempt',
          attemptId
        })
        if (!attempt.ok) throw new Error(attempt.error.message)
        if (attempt.value.type === 'turn' && sameScope(captured, owned.current.scope))
          await loadBatch(attempt.value.turn.capture.packet.batchId)
      }
      if (!owned.current.revision && !owned.current.pending) {
        const latest = batches.find((b) => b.phase === 'preparing')
        if (latest) await loadBatch(latest.id)
      }
      const revision = owned.current.revision
      if (revision && !owned.current.pending && !dirty(owned.current))
        await flow.restore(captured, revision, formIntent())
      if (
        category &&
        !owned.current.revision &&
        !owned.current.selected.length &&
        !dirty(owned.current)
      )
        patch({ settings: { ...owned.current.settings, categories: [category] } })
      if (files) await selectFiles(files)
    })
  }
  async function close(toManage = false): Promise<void> {
    if (!flow.canDismiss()) return
    if (!(await protect())) {
      patch({
        issue:
          owned.current.issue ||
          'Finish or reconcile the local change before keeping this selection.'
      })
      return
    }
    manage.current = toManage
    patch({ opened: false })
  }
  function exited(): void {
    if (owned.current.opened) return
    if (
      flow.phase === 'complete' &&
      sameScope(flow.scope, owned.current.scope) &&
      (!owned.current.revision || owned.current.revision.batchId === flow.summary?.manifest.batchId)
    )
      patch({
        screen: 'setup',
        revision: null,
        selected: [],
        files: [],
        settings: { categories: [], instructions: '' },
        results: [],
        batches: [],
        issue: ''
      })
    const toManage = manage.current
    manage.current = false
    restoreFocus(toManage)
  }
  function restoreFocus(toManage: boolean): void {
    const captured = trigger.current,
      destination = origin.current,
      capturedScope = owned.current.scope
    requestAnimationFrame(() => {
      const live = latestSession.current
      if (
        owned.current.opened ||
        !capturedScope ||
        !sameScope(capturedScope, live.current.current) ||
        live.closing ||
        live.navigating ||
        live.composition.current ||
        !document.hasFocus() ||
        document.visibilityState !== 'visible' ||
        JSON.stringify(live.destination) !== destination
      )
        return
      if (toManage) {
        connections.openDialog(captured)
        return
      }
      if (
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        (document.activeElement !== document.body &&
          document.activeElement instanceof HTMLElement &&
          !document.activeElement.closest('[hidden], [inert]'))
      )
        return
      if (
        captured?.isConnected &&
        !captured.closest('[hidden], [inert]') &&
        !captured.matches(':disabled, [aria-disabled="true"]') &&
        captured.getClientRects().length
      )
        captured.focus({ preventScroll: true })
    })
  }
  const composition = useRetainedDraft('project-import-intake', {
    read: () => ({
      scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
      kind: 'project-import',
      entityId: owned.current.revision?.batchId ?? owned.current.pending?.batchId ?? null,
      label: 'Import form',
      dirty: dirty(owned.current),
      composing: false,
      busy: owned.current.busy,
      pendingOperation:
        owned.current.pending ?? (owned.current.uncertainPicker ? { kind: 'file-intake' } : null),
      policy: 'flush',
      target: {
        kind: 'workspace',
        scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
        view: 'details'
      },
      issue: owned.current.issue
    }),
    flush: protect,
    focus: () => patch({ opened: true })
  })
  async function addFiles(): Promise<void> {
    if (!flow.canEdit()) return
    if (!(await protect())) return
    await run(() => selectFiles())
  }
  async function selectFiles(files?: File[]): Promise<void> {
    const live = latestSession.current
    if (
      !flow.canEdit() ||
      owned.current.pending ||
      owned.current.uncertainPicker ||
      live.accessReadOnly ||
      live.accessTransition ||
      live.fileActive ||
      !live.available
    )
      throw new Error('Finish the current import action, then add your files again.')
    if (!isImportSettings(owned.current.settings))
      throw new Error('Choose valid import settings before adding files.')
    if (owned.current.revision && dirty(owned.current))
      await write({
        version: 1,
        action: 'configure',
        operationId: crypto.randomUUID(),
        batchId: owned.current.revision.batchId,
        expectedRevision: owned.current.revision.id,
        settings: structuredClone(owned.current.settings),
        selectedFileIds: [...owned.current.selected]
      })
    if (!owned.current.revision)
      await write({
        version: 1,
        action: 'create',
        operationId: crypto.randomUUID(),
        batchId: crypto.randomUUID(),
        settings: structuredClone(owned.current.settings)
      })
    const revision = owned.current.revision!
    patch({ uncertainPicker: true, results: [] })
    const input = {
      ...scope(),
      action: 'pick-files' as const,
      batchId: revision.batchId,
      expectedRevision: revision.id
    }
    const response = files ? await window.collie.dropImportFiles(input, files) : null
    if (response && !response.ok) throw new Error(response.error.message)
    const result = response?.ok ? response.value : await request(input)
    if (result.type !== 'picked')
      throw new Error(
        'File intake acknowledgment was lost. Check the saved outcome before adding more files.'
      )
    patch({
      uncertainPicker: false,
      results: result.results,
      issue: ''
    })
    await recover()
    await loadBatch(revision.batchId)
    const selected = new Set(owned.current.selected)
    for (const file of result.results) if (file.fileId) selected.add(file.fileId)
    patch({ selected: [...selected] })
    await session.refreshConversationHead(scope())
    await loadList()
  }
  async function submit(continueAnalysis = false, viewAvailable = false): Promise<void> {
    const current = owned.current,
      status = connections.status,
      catalog = status?.catalog,
      availability = importAvailability(connections)
    if (
      current.busy ||
      current.pending ||
      current.uncertainPicker ||
      blocked ||
      flow.locked ||
      composing.current ||
      !current.revision ||
      !current.selected.length ||
      !current.settings.categories.length ||
      (continueAnalysis && !availability.ready)
    )
      return
    const capturedScope = scope(),
      binding =
        availability.ready &&
        status?.activeConnectionId &&
        catalog?.state === 'loaded' &&
        catalog.selectedModelId
          ? {
              connectionId: status.activeConnectionId,
              model: catalog.selectedModelId,
              catalogRevision: catalog.revision,
              reviewRevision: status.reviewRevision
            }
          : undefined
    async function prepareEvidence(
      revision: ImportRevision,
      sourceGraphId: string,
      evidence: SemanticSelection | MappingSelection[]
    ): Promise<ImportRevision> {
      if (!sameScope(capturedScope, scope()) || owned.current.revision?.id !== revision.id)
        throw new Error('Import selection changed. Reopen its saved findings.')
      const ok = await run(() =>
        write({
          ...(Array.isArray(evidence)
            ? { version: 7 as const, action: 'prepare-mapped' as const, mappings: evidence }
            : { version: 6 as const, action: 'prepare-semantic' as const, semantic: evidence }),
          sourceGraphId,
          operationId: crypto.randomUUID(),
          batchId: revision.batchId,
          expectedRevision: revision.id
        })
      )
      if (!ok)
        throw new Error(
          owned.current.issue ||
            (Array.isArray(evidence)
              ? 'The extracted findings could not be saved. Check status.'
              : 'The interpreted findings could not be saved. Check status.')
        )
      return owned.current.revision!
    }
    await flow.submit({
      scope: capturedScope,
      binding,
      readinessMessage: availability.message,
      intent: formIntent(),
      continueAnalysis,
      viewAvailable,
      interpreted: (revision, semantic, sourceGraphId) =>
        prepareEvidence(revision, sourceGraphId, semantic),
      mapped: (revision, mappings, sourceGraphId) =>
        prepareEvidence(revision, sourceGraphId, mappings),
      prepare: async (isCancelled) => {
        if (!(await protect()))
          throw new Error('Your import choices could not be saved. Try saving again.')
        const saved = owned.current.revision
        if (!saved || !sameScope(capturedScope, scope()))
          throw new Error('Reopen the original project to continue.')
        if (isCancelled()) return saved
        if (!saved.graphId) {
          const ok = await run(() =>
            write({
              version: 2,
              action: 'prepare-graph',
              operationId: crypto.randomUUID(),
              batchId: saved.batchId,
              expectedRevision: saved.id
            })
          )
          if (!ok) throw new Error(owned.current.issue || 'The selected files could not be read.')
        }
        return owned.current.revision!
      }
    })
  }
  async function transitionHybrid(): Promise<void> {
    if (blocked || !flow.canEdit() || !owned.current.revision || dirty(owned.current)) return
    const saved = owned.current.revision
    const ok = await run(() =>
      write({
        version: 5,
        action: 'transition-hybrid',
        operationId: crypto.randomUUID(),
        batchId: saved.batchId,
        expectedRevision: saved.id
      })
    )
    if (ok) {
      flow.reset()
      await submit()
    }
  }
  async function resolve(decision: 'retry' | 'abandon'): Promise<void> {
    await run(async () => {
      const pending = owned.current.pending
      if (!pending) return
      if (pending.action === 'add-file') {
        const result = await request({
          ...scope(),
          action: 'resolve-file',
          mutation: pending,
          decision
        })
        if (result.type !== 'receipt')
          throw new Error('The exact file outcome could not be confirmed.')
        patch({ pending: null })
        await loadBatch(pending.batchId)
        await session.refreshConversationHead(scope())
        await loadList()
      } else if (decision === 'retry') await write(pending)
      else {
        const known = await request({ ...scope(), action: 'lookup', mutation: pending })
        if (known.type !== 'receipt') throw new Error('The saved outcome could not be confirmed.')
        if (known.receipt || pending.action !== 'create') await loadBatch(pending.batchId)
        else
          patch({
            revision: null,
            files: [],
            selected: [],
            settings: { categories: [], instructions: '' }
          })
        await session.refreshConversationHead(scope())
        await loadList()
        patch({ pending: null })
      }
    })
  }
  function canEdit(): boolean {
    const current = owned.current
    return !current.busy && !current.pending && !current.uncertainPicker && flow.canEdit()
  }
  function edit(value: Partial<Pick<State, 'selected' | 'settings'>>): void {
    if (canEdit()) patch({ ...value, issue: '' })
  }
  async function startNew(): Promise<void> {
    if (blocked || !flow.canEdit() || composing.current) return
    await run(async () => {
      const revision = owned.current.revision
      if (revision)
        await write({
          version: 1,
          action: 'discard',
          operationId: crypto.randomUUID(),
          batchId: revision.batchId,
          expectedRevision: revision.id
        })
      flow.reset()
      patch({
        revision: null,
        files: [],
        selected: [],
        settings: { categories: [], instructions: '' },
        screen: 'setup',
        issue: '',
        results: []
      })
    })
  }
  function showAnalysis(attemptId: string): void {
    const element =
      document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current
    if (element) open(element, attemptId)
  }
  // Move focus only when the control in this presentation was removed or disabled.
  // A newer focus, destination, scope or composition always keeps its ownership.
  useLayoutEffect(() => {
    if (!state.opened) return
    const focus = focusedControl.current
    if (!focus) return
    const frame = requestAnimationFrame(() => {
      const live = latestSession.current,
        root = presentation.current,
        active = document.activeElement,
        dialog = root?.closest('[role="dialog"]'),
        target = root?.querySelector<HTMLElement>('[data-import-focus]') ?? root
      const unavailable =
        !focus.element.isConnected || focus.element.matches(':disabled, [aria-disabled="true"]')
      if (
        focusedControl.current !== focus ||
        !unavailable ||
        (active !== document.body && active !== focus.element) ||
        !owned.current.opened ||
        !focus.scope ||
        !sameScope(focus.scope, live.current.current) ||
        !sameScope(focus.scope, owned.current.scope) ||
        JSON.stringify(live.destination) !== focus.destination ||
        live.closing ||
        live.navigating ||
        live.composition.current ||
        composing.current ||
        !document.hasFocus() ||
        document.visibilityState !== 'visible' ||
        !dialog ||
        Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
          (other) => other !== dialog
        ) ||
        !target?.isConnected ||
        target.closest('[hidden], [inert]')
      )
        return
      if (target.matches(':disabled, [aria-disabled="true"]')) root?.focus({ preventScroll: true })
      else target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [state.opened, state.screen, state.busy, state.selected, flow.busy, flow.phase])
  function selectModel(modelId: string, trigger: HTMLElement): void {
    const catalog = connections.status?.catalog,
      connectionId = connections.status?.activeConnectionId
    if (canEdit() && connectionId && catalog?.state === 'loaded')
      void connections.selectModel(
        { connectionId, catalogRevision: catalog.revision, modelId },
        trigger
      )
  }
  return {
    state,
    flow,
    writable,
    blocked,
    dirty: dirty(state),
    success,
    dismissSuccess: () => setSuccess(null),
    open: (trigger, category) => open(trigger, undefined, category),
    dropFiles: (trigger, files) => open(trigger, undefined, undefined, files),
    showAnalysis,
    close,
    exited,
    showSetup: () => {
      if (flow.canDismiss()) patch({ screen: 'setup' })
    },
    addFiles,
    removeFile: (id) =>
      edit({ selected: owned.current.selected.filter((fileId) => fileId !== id) }),
    setCategory: (category, checked) =>
      edit({
        settings: {
          ...owned.current.settings,
          categories: checked
            ? [...owned.current.settings.categories, category].sort()
            : owned.current.settings.categories.filter((c) => c !== category)
        }
      }),
    setInstructions: (instructions) =>
      edit({ settings: { ...owned.current.settings, instructions } }),
    selectModel,
    submit,
    transitionHybrid,
    startNew,
    check: () => run(recover),
    resolve,
    presentation,
    trackFocus: (event) => {
      if (event.target instanceof HTMLElement)
        focusedControl.current = {
          element: event.target,
          scope: owned.current.scope,
          destination: JSON.stringify(latestSession.current.destination)
        }
    },
    composition: {
      onCompositionStartCapture: () => {
        composing.current = true
        composition.onCompositionStartCapture()
      },
      onCompositionEndCapture: () => {
        composing.current = false
        composition.onCompositionEndCapture()
      }
    }
  }
}

function importNotice(counts: ReviewCounts): string {
  const label = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`
  const added = [
    counts.chats ? label(counts.chats, 'conversation') : '',
    counts.newSources ? label(counts.newSources, 'new source') : '',
    counts.notes ? label(counts.notes, 'note') : ''
  ].filter(Boolean)
  const imported = added.length ? `Imported ${added.join(', ')}.` : ''
  const reused = counts.reusedSources
    ? `Linked ${label(counts.reusedSources, 'source')} already in Research.`
    : ''
  return [imported, reused].filter(Boolean).join(' ')
}
