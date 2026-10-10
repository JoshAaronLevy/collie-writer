import { useImportFlow } from './useImportFlow'
import { ImportResults } from './ImportResults'
import type { ReviewCounts } from '../../../../shared/import-review'
import { Loader, VisuallyHidden } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useVisualPreferences } from '../../theme/visualPreferencesContext'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton, ChoiceField, SelectField, TextareaField } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useAiConnections } from '../ai-connections/connectionState'
import { sameScope } from '../../../../shared/project-files'
import { projectFailure, type OpenInput } from '../../../../shared/projects'
import {
  IMPORT_LIMITS,
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
import { ImportContext } from './importContext'
import styles from './ImportProvider.module.css'

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
const bytesLabel = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MiB`
const categoryLabels: Record<ImportCategory, string> = {
  chats: 'AI conversations',
  sources: 'Sources',
  notes: 'Notes'
}

/** One retained owner: presentation may close, but exact choices and mutations stay here. */
export function ImportProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const session = useWorkspaceSession(),
    connections = useAiConnections(),
    { reducedMotion } = useVisualPreferences()
  const latestSession = useRef(session)
  useLayoutEffect(() => {
    latestSession.current = session
  })
  const [state, render] = useState<State>(initial),
    [success, setSuccess] = useState<{ id: string; text: string } | null>(null)
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
  const multipart = useImportFlow({
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
      setSuccess({ id: crypto.randomUUID(), text: importNotice(counts) })
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
  function open(element: HTMLElement, attemptId?: string): void {
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
    if (!owned.current.scope || !sameScope(owned.current.scope, captured)) {
      if (
        dirty(owned.current) ||
        owned.current.pending ||
        owned.current.uncertainPicker ||
        multipart.pendingCommit ||
        multipart.pendingAutomatic ||
        multipart.pendingStart ||
        multipart.busy
      )
        return
      owned.current = { ...initial(), scope: captured, title: session.project.title }
    }
    if (
      !dirty(owned.current) &&
      !owned.current.pending &&
      !owned.current.uncertainPicker &&
      !multipart.pendingCommit &&
      !multipart.pendingAutomatic &&
      !multipart.pendingStart &&
      !multipart.busy &&
      ((multipart.phase === 'complete' &&
        sameScope(multipart.scope, captured) &&
        (!owned.current.revision ||
          owned.current.revision.batchId === multipart.summary?.manifest.batchId)) ||
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
      ...(multipart.pendingCommit ? { screen: 'results' as const } : {})
    })
    void run(async () => {
      await recover()
      const batches = await loadList()
      if (attemptId && !owned.current.pending && !dirty(owned.current)) {
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
        await multipart.restore(captured, revision, formIntent())
    })
  }
  async function close(toManage = false): Promise<void> {
    if (!multipart.canDismiss()) return
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
      multipart.phase === 'complete' &&
      sameScope(multipart.scope, owned.current.scope) &&
      (!owned.current.revision ||
        owned.current.revision.batchId === multipart.summary?.manifest.batchId)
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
    if (manage.current) {
      manage.current = false
      const captured = trigger.current,
        destination = origin.current,
        capturedScope = owned.current.scope
      // Mantine invokes the exit callback before unmounting its dialog content.
      requestAnimationFrame(() => {
        const live = latestSession.current
        if (
          owned.current.opened ||
          live.closing ||
          live.navigating ||
          live.composition.current ||
          JSON.stringify(live.destination) !== destination ||
          !capturedScope ||
          !live.current.current ||
          !sameScope(capturedScope, live.current.current) ||
          !document.hasFocus() ||
          document.visibilityState !== 'visible'
        )
          return
        connections.openDialog(captured)
      })
      return
    }
    restoreFocus()
  }
  function restoreFocus(): void {
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
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        JSON.stringify(live.destination) !== destination ||
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
    if (!multipart.canEdit()) return
    if (!(await protect())) return
    await run(async () => {
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
      const result = await request({
        ...scope(),
        action: 'pick-files',
        batchId: revision.batchId,
        expectedRevision: revision.id
      })
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
    })
  }
  async function submit(continueAnalysis = false): Promise<void> {
    const current = owned.current,
      status = connections.status,
      catalog = status?.catalog
    if (
      current.busy ||
      current.pending ||
      current.uncertainPicker ||
      blocked ||
      multipart.locked ||
      composing.current ||
      !current.revision ||
      !current.selected.length ||
      !current.settings.categories.length ||
      !status?.activeConnectionId ||
      catalog?.state !== 'loaded' ||
      !catalog.selectedModelId
    )
      return
    const capturedScope = scope(),
      binding = {
        connectionId: status.activeConnectionId,
        model: catalog.selectedModelId,
        catalogRevision: catalog.revision,
        reviewRevision: status.reviewRevision
      }
    await multipart.submit({
      scope: capturedScope,
      binding,
      intent: formIntent(),
      continueAnalysis,
      prepare: async (fresh) => {
        if (!(await protect()))
          throw new Error('Your import choices could not be saved. Try saving again.')
        const saved = owned.current.revision
        if (!saved || !sameScope(capturedScope, scope()))
          throw new Error('Reopen the original project to continue.')
        if (!saved.graphId || fresh) {
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
        patch({ pending: null })
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
  function edit(value: Partial<State>): void {
    if (
      !owned.current.busy &&
      !owned.current.pending &&
      !owned.current.uncertainPicker &&
      multipart.canEdit()
    )
      patch({ ...value, issue: '' })
  }
  async function startNew(): Promise<void> {
    if (blocked || !multipart.canEdit() || composing.current) return
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
      multipart.reset()
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
  const sameFindings =
    multipart.intent === JSON.stringify([state.scope, state.selected, state.settings])
  const needsFindingsRecovery =
    !!multipart.pendingStart ||
    !!multipart.pendingAutomatic ||
    !!multipart.pendingCommit ||
    !!(multipart.summary && !multipart.summary.current) ||
    !!(multipart.summary && multipart.conversations.length !== multipart.summary.total)
  const catalog = connections.status?.catalog,
    selectedFiles = state.files.filter((f) => state.selected.includes(f.id)),
    modelId = catalog?.state === 'loaded' ? catalog.selectedModelId : null,
    modelReady =
      catalog?.state === 'loaded' && !!modelId && catalog.models.some((m) => m.id === modelId),
    connected =
      connections.status?.state === 'signed-in' && !!connections.status.activeConnectionId,
    ready =
      connected &&
      modelReady &&
      !connections.statusUnavailable &&
      connections.issue !== 'outcome-unknown' &&
      !connections.busy &&
      connections.status?.route.kind === 'local-chatgpt-plan' &&
      connections.status.execution?.state === 'available',
    formBlocked = blocked || multipart.locked,
    notice = state.issue || multipart.issue,
    processingText =
      multipart.phase === 'stopping'
        ? 'Stopping…'
        : multipart.phase === 'checking'
          ? 'Checking import status…'
          : multipart.phase === 'analyzing'
            ? 'Analyzing with ChatGPT…'
            : multipart.phase === 'saving'
              ? 'Preparing your import…'
              : 'Preparing files…'
  const resultStatus =
    multipart.phase === 'checking'
      ? 'Checking import status…'
      : multipart.phase === 'saving'
        ? 'Refreshing your summary…'
        : 'Importing…'
  const savedChoices = !dirty(state) && sameFindings,
    checkFindings = multipart.phase === 'paused' || needsFindingsRecovery || !!notice,
    viewFindings =
      savedChoices &&
      (multipart.phase !== 'ready' || needsFindingsRecovery || !ready) &&
      !!(multipart.summary || multipart.page?.completed || multipart.legacyValid),
    continueFindings =
      savedChoices &&
      multipart.phase === 'ready' &&
      !!multipart.page?.remaining &&
      !multipart.legacyAttemptId,
    startNewVisible =
      savedChoices &&
      (multipart.phase === 'paused' || multipart.summary?.outcome !== 'ready') &&
      !!(
        multipart.legacyAttemptId ||
        !multipart.page?.remaining ||
        multipart.summary?.outcome !== 'ready'
      ),
    retainedOutcome = !!connections.status?.work.some(
      (work) =>
        work.feature === 'import' &&
        sameScope(work.scope, multipart.scope) &&
        work.state === 'retained-outcome'
    ),
    localProtection = !!connections.status?.work.some(
      (work) =>
        work.feature === 'import' &&
        sameScope(work.scope, multipart.scope) &&
        ['protection-required', 'handoff-required', 'record-unavailable'].includes(work.state)
    ),
    showFindingsRecovery =
      !state.pending &&
      !state.uncertainPicker &&
      (multipart.phase === 'paused' || multipart.phase === 'ready' || needsFindingsRecovery) &&
      (checkFindings ||
        viewFindings ||
        continueFindings ||
        startNewVisible ||
        retainedOutcome ||
        localProtection)
  const announcement = !state.opened
    ? ''
    : state.screen === 'results' && multipart.summary
      ? multipart.busy
        ? resultStatus
        : multipart.summary.outcome === 'already-present'
          ? 'This content is already in your project. Nothing new to import.'
          : multipart.summary.outcome === 'empty'
            ? 'No importable content was found for your selection.'
            : `Ready to import. ${state.settings.categories
                .map((category) => {
                  const count = multipart.summary!.manifest.counts[category]
                  const noun =
                    category === 'chats'
                      ? 'conversation'
                      : category === 'sources'
                        ? 'source'
                        : 'note'
                  return `${count} ${noun}${count === 1 ? '' : 's'}`
                })
                .join(', ')}.`
      : multipart.busy
        ? processingText
        : state.busy
          ? 'Updating your selection…'
          : ''
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
  }, [state.opened, state.screen, state.busy, state.selected, multipart.busy, multipart.phase])
  return (
    <ImportContext.Provider value={{ open, showAnalysis, busy: state.busy }}>
      {children}
      {success ? (
        <div className={styles.success} role="status">
          <p>{success.text}</p>
          <IconButton
            label="Dismiss import notice"
            variant="subtle"
            size="sm"
            onClick={() => setSuccess(null)}
          >
            <IconX size={16} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      <AppDialog
        title={state.screen === 'results' ? 'Ready to import' : 'Import into project'}
        opened={state.opened}
        size="38rem"
        classNames={{
          content: styles.dialogContent,
          header: styles.dialogHeader,
          title: styles.dialogTitle,
          body: styles.dialogBody
        }}
        onClose={() => {
          if (state.screen === 'results') {
            if (multipart.canDismiss()) patch({ screen: 'setup' })
          } else if (multipart.busy) void multipart.cancel()
          else void close()
        }}
        dismissible={
          state.screen === 'results'
            ? !multipart.busy
            : (multipart.busy || !state.busy) && multipart.phase !== 'stopping'
        }
        returnFocus={false}
        onExited={exited}
      >
        <VisuallyHidden role="status" aria-atomic="true">
          {announcement}
        </VisuallyHidden>
        <div
          ref={presentation}
          className={styles.presentation}
          tabIndex={-1}
          onFocusCapture={(event) => {
            if (event.target instanceof HTMLElement)
              focusedControl.current = {
                element: event.target,
                scope: owned.current.scope,
                destination: JSON.stringify(latestSession.current.destination)
              }
          }}
        >
          {state.screen === 'results' && multipart.summary ? (
            <ImportResults
              key={multipart.summary.manifest.id}
              summary={multipart.summary}
              conversations={multipart.conversations}
              categories={state.settings.categories}
              issue={multipart.issue}
              busy={multipart.busy || multipart.phase === 'complete'}
              status={resultStatus}
              blocked={!writable}
              needsRecovery={needsFindingsRecovery}
              onCancel={() => {
                if (multipart.canDismiss()) patch({ screen: 'setup' })
              }}
              onAccept={() => void multipart.accept()}
              onCheck={() => void multipart.check()}
            />
          ) : (
            <div
              className={styles.intake}
              onCompositionStartCapture={() => {
                composing.current = true
                composition.onCompositionStartCapture()
              }}
              onCompositionEndCapture={() => {
                composing.current = false
                composition.onCompositionEndCapture()
              }}
            >
              <div className={styles.body}>
                <p className={styles.subtitle}>{state.title}</p>
                {multipart.busy ? (
                  <div
                    className={styles.processing}
                    tabIndex={-1}
                    data-import-focus
                    aria-label={processingText}
                  >
                    {reducedMotion ? null : <Loader size="sm" aria-hidden="true" />}
                    <p>{processingText}</p>
                  </div>
                ) : (
                  <>
                    <section aria-label="Files">
                      <div className={styles.fileHeading}>
                        <strong>Files</strong>
                        <AppButton
                          data-autofocus
                          data-import-focus
                          variant="light"
                          size="sm"
                          disabled={formBlocked}
                          onClick={() => void addFiles()}
                        >
                          Add files
                        </AppButton>
                      </div>
                      <p className={styles.helper}>
                        JSON, text/Markdown, CSL-JSON, BibTeX and RIS.
                      </p>
                      <p className={styles.helper}>
                        Selected originals are kept in this project, including content you
                        don&apos;t import.
                      </p>
                      {selectedFiles.length ? (
                        <ul className={styles.files} aria-label="Selected files">
                          {selectedFiles.map((file) => (
                            <li key={file.id}>
                              <div>
                                <span>{file.originalName}</span>
                                <small>{bytesLabel(file.bytes)}</small>
                              </div>
                              <IconButton
                                label={`Remove ${file.originalName}`}
                                variant="subtle"
                                size="sm"
                                disabled={formBlocked}
                                onClick={() =>
                                  edit({
                                    selected: owned.current.selected.filter((id) => id !== file.id),
                                    issue: ''
                                  })
                                }
                              >
                                <IconX size={16} aria-hidden="true" />
                              </IconButton>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.empty}>Choose one or more files to import.</p>
                      )}
                    </section>
                    {state.results.some((r) => !['staged', 'duplicate'].includes(r.status)) ? (
                      <ul className={styles.fileIssues} role="alert">
                        {state.results
                          .filter((r) => !['staged', 'duplicate'].includes(r.status))
                          .map((result, i) => (
                            <li key={i}>
                              {result.name}: {pickMessage(result)}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                    <fieldset disabled={formBlocked}>
                      <legend>Import</legend>
                      <div className={styles.categories}>
                        {(['chats', 'sources', 'notes'] as const).map((category) => (
                          <ChoiceField
                            key={category}
                            label={categoryLabels[category]}
                            checked={state.settings.categories.includes(category)}
                            onChange={(event) => {
                              const categories = event.currentTarget.checked
                                ? [...owned.current.settings.categories, category].sort()
                                : owned.current.settings.categories.filter((c) => c !== category)
                              edit({
                                settings: { ...owned.current.settings, categories },
                                issue: ''
                              })
                            }}
                          />
                        ))}
                      </div>
                      {!state.settings.categories.length && selectedFiles.length ? (
                        <p className={styles.helper}>Choose at least one type of content.</p>
                      ) : null}
                    </fieldset>
                    <TextareaField
                      label="Additional instructions (optional)"
                      placeholder="Anything Collie should focus on or leave out?"
                      maxLength={IMPORT_LIMITS.instructions}
                      value={state.settings.instructions}
                      disabled={formBlocked}
                      autosize
                      minRows={2}
                      maxRows={5}
                      onChange={(event) =>
                        edit({
                          settings: {
                            ...owned.current.settings,
                            instructions: event.currentTarget.value
                          },
                          issue: ''
                        })
                      }
                    />
                    <SelectField
                      label="Model"
                      value={modelId ?? ''}
                      disabled={
                        formBlocked ||
                        connections.busy ||
                        connections.statusUnavailable ||
                        !connections.status?.actions.selectModel
                      }
                      data={[
                        {
                          value: '',
                          label:
                            catalog?.state === 'loading' ? 'Loading models…' : 'Choose a model',
                          disabled: true
                        },
                        ...(catalog?.state === 'loaded'
                          ? catalog.models.map((m) => ({ value: m.id, label: m.label }))
                          : [])
                      ]}
                      onChange={(event) => {
                        const connectionId = connections.status?.activeConnectionId
                        if (
                          !owned.current.busy &&
                          !owned.current.pending &&
                          !owned.current.uncertainPicker &&
                          multipart.canEdit() &&
                          connectionId &&
                          catalog?.state === 'loaded'
                        )
                          void connections.selectModel(
                            {
                              connectionId,
                              catalogRevision: catalog.revision,
                              modelId: event.currentTarget.value
                            },
                            event.currentTarget
                          )
                      }}
                    />
                    {!ready ? (
                      <div className={styles.connection}>
                        <p className={styles.helper} role="status">
                          {connections.busy || catalog?.state === 'loading'
                            ? 'Setting up ChatGPT…'
                            : !connected
                              ? 'Connect ChatGPT to import these files.'
                              : !modelReady
                                ? 'Choose an available model to continue.'
                                : 'ChatGPT needs attention before importing.'}
                        </p>
                        <AppButton
                          variant="subtle"
                          size="sm"
                          disabled={
                            state.busy ||
                            !!state.pending ||
                            state.uncertainPicker ||
                            multipart.locked
                          }
                          onClick={() => void close(true)}
                        >
                          {connected ? 'Manage ChatGPT' : 'Connect ChatGPT'}
                        </AppButton>
                      </div>
                    ) : null}
                    {showFindingsRecovery ? (
                      <div className={styles.recovery}>
                        {checkFindings ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={state.busy || multipart.busy}
                            onClick={() => void multipart.check()}
                          >
                            Check status
                          </AppButton>
                        ) : null}
                        {viewFindings ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={state.busy || !multipart.canEdit()}
                            onClick={() => void multipart.viewResults()}
                          >
                            View available results
                          </AppButton>
                        ) : null}
                        {continueFindings ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={formBlocked || !ready}
                            onClick={() => void submit(true)}
                          >
                            Continue analysis
                          </AppButton>
                        ) : null}
                        {startNewVisible ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={blocked || !multipart.canEdit()}
                            onClick={() => void startNew()}
                          >
                            Start new import
                          </AppButton>
                        ) : null}
                        {retainedOutcome ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy || multipart.busy}
                            onClick={() => void multipart.protect(true)}
                          >
                            Finish recovery
                          </AppButton>
                        ) : null}
                        {localProtection ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy || multipart.busy}
                            onClick={() => void multipart.protect()}
                          >
                            Try saving again
                          </AppButton>
                        ) : null}
                      </div>
                    ) : null}
                    {state.pending || state.uncertainPicker ? (
                      <div className={styles.recovery}>
                        <AppButton
                          variant="light"
                          size="sm"
                          pending={state.busy}
                          onClick={() => void run(recover)}
                        >
                          Check status
                        </AppButton>
                        {state.pending ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy || !writable}
                            onClick={() => void resolve('retry')}
                          >
                            Try saving again
                          </AppButton>
                        ) : null}
                        {state.pending ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy}
                            onClick={() => void resolve('abandon')}
                          >
                            {state.pending.action === 'add-file'
                              ? 'Remove failed file'
                              : 'Restore saved choices'}
                          </AppButton>
                        ) : null}
                      </div>
                    ) : null}
                    <p className={styles.helper}>
                      Submit sends the selected file content and your instructions to your connected
                      ChatGPT account. Large selections may use several requests.
                    </p>
                  </>
                )}
                {state.busy ? <p className={styles.helper}>Updating your selection…</p> : null}
                {!writable ? (
                  <p role="status">Open a writable project to continue importing.</p>
                ) : null}
                {notice ? (
                  <p role="alert" className={styles.issue}>
                    {notice}
                  </p>
                ) : null}
              </div>
              <footer className={styles.footer}>
                <div className={styles.footerActions}>
                  <AppButton
                    variant="default"
                    disabled={(!multipart.busy && state.busy) || multipart.phase === 'stopping'}
                    onClick={() => {
                      if (multipart.busy) void multipart.cancel()
                      else void close()
                    }}
                  >
                    {multipart.phase === 'stopping' ? 'Stopping…' : 'Cancel'}
                  </AppButton>
                  {!multipart.busy ? (
                    <AppButton
                      disabled={
                        formBlocked ||
                        !ready ||
                        !selectedFiles.length ||
                        !state.settings.categories.length
                      }
                      onClick={() =>
                        void submit(
                          !dirty(state) &&
                            sameFindings &&
                            !multipart.legacyAttemptId &&
                            !!multipart.page?.remaining &&
                            multipart.phase === 'paused'
                        )
                      }
                    >
                      {!dirty(state) &&
                      sameFindings &&
                      !multipart.legacyAttemptId &&
                      multipart.page?.remaining &&
                      multipart.phase === 'paused'
                        ? 'Continue analysis'
                        : 'Submit'}
                    </AppButton>
                  ) : null}
                </div>
              </footer>
            </div>
          )}
        </div>
      </AppDialog>
    </ImportContext.Provider>
  )
}
function pickMessage(result: ImportPickResult): string {
  if (result.status === 'unsupported') return 'Choose JSON, text, Markdown, BibTeX or RIS.'
  if (result.status === 'not-staged') return 'Choose this file again after checking import status.'
  if (result.code === 'VALIDATION') return 'This file could not be read as supported UTF-8 text.'
  const failure = projectFailure('', result.code ?? 'UNAVAILABLE')
  return failure.ok ? 'The file could not be added.' : failure.error.message
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
