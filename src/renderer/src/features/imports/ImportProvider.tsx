import { useMultipartAnalysis } from './useMultipartAnalysis'
import { useImportAnalysis } from './useImportAnalysis'
import { ImportGraphPreview } from './ImportGraphPreview'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  busy: boolean
  issue: string
  revision: ImportRevision | null
  files: ImportFile[]
  batches: ImportBatchSummary[]
  nextOffset: number | null
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
  busy: false,
  issue: '',
  revision: null,
  files: [],
  batches: [],
  nextOffset: null,
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
  chats: 'AI chats',
  sources: 'Sources & research',
  notes: 'Notes'
}

/** One retained owner: presentation may close, but exact choices and mutations stay here. */
export function ImportProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const session = useWorkspaceSession(),
    connections = useAiConnections()
  const latestSession = useRef(session)
  useLayoutEffect(() => {
    latestSession.current = session
  })
  const [state, render] = useState<State>(initial)
  const owned = useRef(state),
    trigger = useRef<HTMLElement | null>(null),
    origin = useRef(''),
    manage = useRef(false),
    composing = useRef(false)
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
  const analysis = useImportAnalysis({
    scope: state.scope,
    revision: state.revision,
    disabled: blocked || dirty(state),
    intakeOpen: state.opened,
    closeIntake: () => patch({ opened: false }),
    returnFocus: restoreFocus
  })
  const completed = state.batches.some(
    (b) => b.id === state.revision?.batchId && b.phase === 'completed'
  )
  const multipart = useMultipartAnalysis({
    completed,
    scope: state.scope,
    revision: state.revision,
    disabled: blocked || dirty(state),
    intakeOpen: state.opened,
    closeIntake: () => patch({ opened: false }),
    returnFocus: restoreFocus
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
  async function loadList(offset = 0): Promise<ImportBatchSummary[]> {
    const value = await request({ ...scope(), action: 'list', offset })
    if (value.type !== 'batches') throw new Error('Saved import selections could not be read.')
    patch({
      batches: offset === 0 ? value.batches : [...owned.current.batches, ...value.batches],
      nextOffset: value.nextOffset
    })
    return value.batches
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
            'This exact change was not saved. Retry local protection, or abandon the failed file / restore saved choices. No request will retry automatically.'
        })
      }
    } else if (owned.current.revision && !dirty(owned.current))
      await loadBatch(owned.current.revision.batchId)
  }
  function open(element: HTMLElement): void {
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
      if (dirty(owned.current) || owned.current.pending || owned.current.uncertainPicker) return
      owned.current = { ...initial(), scope: captured, title: session.project.title }
    }
    trigger.current = element
    origin.current = JSON.stringify(session.destination)
    manage.current = false
    patch({ opened: true, title: session.project.title })
    void run(async () => {
      await recover()
      const batches = await loadList()
      if (!owned.current.revision && !owned.current.pending) {
        const latest = batches.find((b) => b.phase === 'preparing')
        if (latest) await loadBatch(latest.id)
      }
    })
  }
  async function close(toManage = false): Promise<void> {
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
    if (multipart.afterIntakeExit() || analysis.afterIntakeExit()) return
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
      label: 'Import selection (Keep for later)',
      dirty: dirty(owned.current),
      composing: false,
      busy: owned.current.busy,
      pendingOperation:
        owned.current.pending ?? (owned.current.uncertainPicker ? { kind: 'file-intake' } : null),
      policy: 'retain',
      explicitSave: true,
      target: {
        kind: 'workspace',
        scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
        view: 'details'
      },
      issue: owned.current.issue
    }),
    focus: () => patch({ opened: true })
  })
  async function addFiles(): Promise<void> {
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
        issue: result.cancelled
          ? 'File selection cancelled. The existing selection is unchanged.'
          : ''
      })
      await recover()
      await loadBatch(revision.batchId)
      await session.refreshConversationHead(scope())
      await loadList()
    })
  }
  async function inspectFiles(): Promise<void> {
    if (!(await protect())) return
    const revision = owned.current.revision
    if (!revision || !revision.selectedFileIds.length) return
    await run(() =>
      write({
        version: 2,
        action: 'prepare-graph',
        operationId: crypto.randomUUID(),
        batchId: revision.batchId,
        expectedRevision: revision.id
      })
    )
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
  const selectedBytes = state.files
    .filter((f) => state.selected.includes(f.id))
    .reduce((n, f) => n + f.bytes, 0)
  return (
    <ImportContext.Provider
      value={{
        open,
        showAnalysis: analysis.show,
        // Presentation remains reachable while an exact analysis/commit needs recovery.
        busy: state.busy
      }}
    >
      {children}
      {analysis.progress}
      {multipart.progress}
      <AppDialog
        title="Import into project"
        opened={state.opened}
        onClose={() => {
          void close()
        }}
        dismissible={!state.busy}
        returnFocus={false}
        onExited={exited}
      >
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
          <p>
            Destination: <strong>{state.title}</strong>
          </p>
          <details>
            <summary>Project details and original retention</summary>
            <p>
              Project: {state.scope?.projectId}
              <br />
              Working copy: {state.scope?.workspaceId}
            </p>
            <p>
              Removing a file from the selection or discarding a selection keeps its original. Save
              includes retained originals in the portable .collie file.
            </p>
          </details>
          <p>
            Entire original files are retained in the project, including private or excluded
            records. Choose only files you want to keep here.
          </p>
          <p>
            JSON (including CSL-JSON), UTF-8 text / Markdown, BibTeX and RIS. Up to 100 retained
            files, 25 MiB each and 100 MiB per selection. Add files again to select from another
            folder.
          </p>
          {!writable ? (
            <p role="status">
              Open a writable project to change this selection. Retained files can still be
              reviewed.
            </p>
          ) : null}
          {state.busy ? <p role="status">Reading or protecting local import work…</p> : null}
          {state.issue ? <p role="alert">{state.issue}</p> : null}
          {state.uncertainPicker || state.pending ? (
            <section aria-label="Local import recovery">
              <AppButton
                variant="default"
                pending={state.busy}
                onClick={() => {
                  void run(recover)
                }}
              >
                Check saved outcome
              </AppButton>
              {state.pending ? (
                <>
                  <AppButton
                    variant="default"
                    disabled={state.busy || !writable}
                    onClick={() => {
                      void resolve('retry')
                    }}
                  >
                    Retry local protection
                  </AppButton>
                  <AppButton
                    variant="subtle"
                    disabled={state.busy}
                    onClick={() => {
                      void resolve('abandon')
                    }}
                  >
                    {state.pending.action === 'add-file'
                      ? 'Abandon failed file'
                      : 'Restore saved choices'}
                  </AppButton>
                </>
              ) : null}
            </section>
          ) : null}
          {state.batches.length ? (
            <SelectField
              label="Saved selections"
              value={state.revision?.batchId ?? ''}
              disabled={
                state.busy ||
                analysis.busy ||
                multipart.locked ||
                dirty(state) ||
                !!state.pending ||
                state.uncertainPicker
              }
              data={[
                { value: '', label: 'Choose a saved selection' },
                ...(state.revision && !state.batches.some((b) => b.id === state.revision!.batchId)
                  ? [
                      {
                        value: state.revision.batchId,
                        label: `Current selection · ${state.selected.length} selected · ${state.revision.batchId.slice(0, 8)}`
                      }
                    ]
                  : []),
                ...state.batches.map((b) => ({
                  value: b.id,
                  label: `${new Date(b.createdAt).toLocaleString()} · ${b.selectedFiles} selected · ${b.phase} · ${b.id.slice(0, 8)}`
                }))
              ]}
              onChange={(event) => {
                const id = event.currentTarget.value
                if (id)
                  void run(async () => {
                    patch({ results: [] })
                    await loadBatch(id)
                  })
              }}
            />
          ) : null}
          {state.nextOffset !== null ? (
            <AppButton
              variant="subtle"
              disabled={state.busy}
              onClick={() => {
                void run(async () => {
                  await loadList(owned.current.nextOffset!)
                })
              }}
            >
              More saved selections
            </AppButton>
          ) : null}
          <div className={styles.actions}>
            <AppButton
              variant="default"
              disabled={blocked || analysis.busy || multipart.locked}
              onClick={() => {
                void addFiles()
              }}
            >
              {state.files.length ? 'Add files…' : 'Select files…'}
            </AppButton>
            {state.revision ? (
              <AppButton
                variant="subtle"
                disabled={
                  state.busy ||
                  analysis.busy ||
                  multipart.locked ||
                  !!state.pending ||
                  state.uncertainPicker ||
                  dirty(state) ||
                  !writable
                }
                onClick={() => {
                  void run(() =>
                    write({
                      version: 1,
                      action: 'create',
                      operationId: crypto.randomUUID(),
                      batchId: crypto.randomUUID(),
                      settings: { categories: [], instructions: '' }
                    })
                  )
                }}
              >
                New selection
              </AppButton>
            ) : null}
          </div>
          {state.revision ? (
            <p>
              {state.selected.length} selected · {bytesLabel(selectedBytes)} · {state.files.length}{' '}
              originals retained
              {completed
                ? ' · Import completed. Open its report below.'
                : state.revision.phase === 'discarded'
                  ? ' · This selection is discarded.'
                  : ''}
            </p>
          ) : null}
          {state.files.length ? (
            <ul className={styles.files} aria-label="Retained import files">
              {state.files.map((file) => (
                <li key={file.id}>
                  <ChoiceField
                    label={file.originalName}
                    checked={state.selected.includes(file.id)}
                    disabled={blocked || analysis.busy || multipart.locked}
                    onChange={(event) => {
                      const selectedFileIds = event.currentTarget.checked
                        ? [...owned.current.selected, file.id]
                        : owned.current.selected.filter((id) => id !== file.id)
                      void run(() =>
                        write({
                          version: 1,
                          action: 'configure',
                          operationId: crypto.randomUUID(),
                          batchId: state.revision!.batchId,
                          expectedRevision: state.revision!.id,
                          settings: structuredClone(owned.current.settings),
                          selectedFileIds
                        })
                      )
                    }}
                  />
                  <span>
                    {bytesLabel(file.bytes)} · {file.mediaType} · Protected original
                    {state.revision?.graphId
                      ? ' · Local inventory available'
                      : ' · Not yet inspected'}
                    {!state.selected.includes(file.id) ? ' · Removed from selection' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {state.results.length ? (
            <ul aria-label="Last file selection results">
              {state.results.map((result, i) => (
                <li key={i}>
                  {result.name}: {pickMessage(result)}
                  {result.bytes !== null ? ` (${bytesLabel(result.bytes)})` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          <fieldset disabled={blocked || analysis.busy || multipart.locked}>
            <legend>What do these files contain?</legend>
            {(['chats', 'sources', 'notes'] as const).map((category) => (
              <ChoiceField
                key={category}
                label={categoryLabels[category]}
                checked={state.settings.categories.includes(category)}
                onChange={(event) => {
                  const categories = event.currentTarget.checked
                    ? [...owned.current.settings.categories, category].sort()
                    : owned.current.settings.categories.filter((c) => c !== category)
                  patch({ settings: { ...owned.current.settings, categories } })
                }}
              />
            ))}
          </fieldset>
          <TextareaField
            label="Instructions (optional)"
            description="Guidance for later analysis; it cannot grant access to other files."
            maxLength={IMPORT_LIMITS.instructions}
            value={state.settings.instructions}
            disabled={blocked || analysis.busy || multipart.locked}
            autosize
            minRows={2}
            maxRows={6}
            onChange={(event) =>
              patch({
                settings: { ...owned.current.settings, instructions: event.currentTarget.value }
              })
            }
          />
          <div className={styles.actions}>
            <AppButton
              variant="default"
              disabled={state.busy || !!state.pending || state.uncertainPicker}
              onClick={() => {
                void close()
              }}
            >
              Keep for later
            </AppButton>
            {dirty(state) && !state.pending && state.revision ? (
              <AppButton
                variant="subtle"
                disabled={state.busy}
                onClick={() =>
                  patch({
                    settings: structuredClone(state.revision!.settings),
                    selected: [...state.revision!.selectedFileIds],
                    issue: ''
                  })
                }
              >
                Restore saved choices
              </AppButton>
            ) : null}
            {state.revision?.phase === 'preparing' ? (
              <AppButton
                variant="subtle"
                disabled={blocked || analysis.busy || multipart.locked || dirty(state)}
                onClick={() => {
                  void run(() =>
                    write({
                      version: 1,
                      action: 'discard',
                      operationId: crypto.randomUUID(),
                      batchId: state.revision!.batchId,
                      expectedRevision: state.revision!.id
                    })
                  )
                }}
              >
                Discard selection (keep originals)
              </AppButton>
            ) : null}
          </div>
          <AppButton
            variant="default"
            disabled={blocked || analysis.busy || multipart.locked || state.selected.length === 0}
            onClick={() => {
              void inspectFiles()
            }}
          >
            Inspect selected files locally
          </AppButton>
          <p>
            Inspect structure and original text locally before reviewing what to share with ChatGPT.
          </p>
          {state.revision?.graphId && state.scope ? (
            <ImportGraphPreview
              key={state.revision.graphId}
              scope={state.scope}
              batchId={state.revision.batchId}
              graphId={state.revision.graphId}
              files={state.files}
              disabled={blocked || analysis.busy || multipart.locked || dirty(state)}
            />
          ) : null}
          <details>
            <summary>ChatGPT and analysis availability</summary>
            <p>
              Use your own ChatGPT account for analysis. Review and final import remain separate
              steps; no analysis result automatically adds content to the project.
            </p>
            <AppButton
              variant="subtle"
              disabled={state.busy || !!state.pending || state.uncertainPicker}
              onClick={() => {
                void close(true)
              }}
            >
              Manage ChatGPT
            </AppButton>
            <p>
              Use your own account and choose a model in the shared connection dialog. Connecting or
              choosing a model does not analyze these files.
            </p>
          </details>
          {multipart.controls}
          <details>
            <summary>Earlier single-request analysis</summary>
            {analysis.controls}
          </details>
        </div>
      </AppDialog>
    </ImportContext.Provider>
  )
}
function pickMessage(result: ImportPickResult): string {
  if (result.status === 'staged') return 'readable UTF-8 original protected locally'
  if (result.status === 'duplicate')
    return 'identical bytes already retained; no second copy added. Reselect its retained entry if removed'
  if (result.status === 'unsupported')
    return 'unsupported format; choose JSON, text, Markdown, BibTeX or RIS'
  if (result.status === 'not-staged')
    return 'not staged after an earlier interruption; select this file again after recovery'
  if (result.code === 'VALIDATION')
    return 'not a supported readable UTF-8 regular file (or its name is unsupported)'
  const failure = projectFailure('', result.code ?? 'UNAVAILABLE')
  return failure.ok ? 'The file could not be staged.' : failure.error.message
}
