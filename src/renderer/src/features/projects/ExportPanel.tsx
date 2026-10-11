import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Radio, TextInput } from '@mantine/core'
import { isEditableKind, effectiveState, type OutlineDocument } from '../../../../shared/outline'
import { hasControlCharacters } from '../../../../shared/control-characters'
import type { OpenProject } from '../../../../shared/projects'
import type { ExportFormat, ExportJob, ExportPreview } from '../../../../shared/exports'
import type {
  CompilationRecipe,
  RecipesView,
  RecipeChangeInput
} from '../../../../shared/interchange'
import PresentationBoundary from '../../components/PresentationBoundary'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton, SelectField, ChoiceField } from '../../components/ui/Controls'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import ExportResults from '../export/ExportResults'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import styles from '../export/ExportWorkspace.module.css'

type Props = {
  project: OpenProject
  disabled: boolean
  paid: boolean
  flush: () => Promise<OpenProject | null>
  onProject: (project: OpenProject) => void
}
function outline(documents: OutlineDocument[]): (OutlineDocument & { depth: number })[] {
  const result: (OutlineDocument & { depth: number })[] = []
  function walk(parent: string | null, depth: number): void {
    for (const document of documents
      .filter((d) => d.parentId === parent)
      .sort((a, b) => a.position - b.position)) {
      if (effectiveState(document, documents) !== 'active') continue
      result.push({ ...document, depth })
      walk(document.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}
const formatChoices: { value: ExportFormat; label: string }[] = [
  { value: 'docx', label: 'Word (DOCX)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Plain text' }
]
export default function ExportPanel(props: Props): React.JSX.Element {
  const {
    exports,
    trackExport,
    research,
    navigate,
    destination,
    focusRevision,
    composition,
    closing,
    navigating
  } = useWorkspaceSession()
  const scope = { projectId: props.project.projectId, workspaceId: props.project.workspaceId }
  const operations = exports
    .filter(
      (item) =>
        item.scope.projectId === scope.projectId && item.scope.workspaceId === scope.workspaceId
    )
    .slice()
    .reverse()
  const running = operations.some((item) => ['rendering', 'publishing'].includes(item.job.state))
  const current = useRef(props)
  useLayoutEffect(() => {
    current.current = props
  })
  const orderedOutline = outline(props.project.documents)
  const texts = orderedOutline.filter((d) => isEditableKind(d.kind))
  // Null follows the full active outline, including sections added after this view opened.
  const [selection, setSelection] = useState<string[] | null>(null)
  const selected = selection ?? texts.map((d) => d.id)
  const [paper, setPaper] = useState<'Letter' | 'A4'>('Letter')
  const [titlePage, setTitlePage] = useState(false)
  const [includeDescription, setIncludeDescription] = useState(false)
  const [formats, setFormats] = useState<ExportFormat[]>(['docx'])
  const [baseName, setBaseName] = useState('Collie Writer manuscript')
  const [resultsShown, setShowResults] = useState(!!operations.length)
  const [capture, setCapture] = useState<{ value: ExportPreview; options: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recipes, setRecipes] = useState<RecipesView | null>(null)
  const [recipeId, setRecipeId] = useState<string | null>(null)
  const [recipeName, setRecipeName] = useState('')
  const [pendingRecipeValue, setPendingRecipeValue, pendingRecipe] = useSynchronousState<{
    input: RecipeChangeInput
  } | null>(null)
  const root = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  if (!props.paid && formats.length > 1) setFormats([formats[0]])
  const optionsKey = JSON.stringify({
    paper,
    selected,
    titlePage,
    includeDescription,
    formats,
    baseName
  })
  const preview =
    capture?.options === optionsKey && capture.value.headCommitId === props.project.headCommitId
      ? capture.value
      : null
  const blocking = preview?.issues.filter((issue) => issue.kind !== 'metadata') ?? []
  const metadata = preview?.issues.filter((issue) => issue.kind === 'metadata') ?? []
  const decision = !!preview && !!metadata.length && !blocking.length && !preview.losses.length
  const locked = props.disabled || busy || !!pendingRecipeValue
  const validBaseName =
    baseName.trim().length <= 100 &&
    !hasControlCharacters(baseName.trim()) &&
    /^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/.test(baseName.trim()) &&
    !/[. ]$/.test(baseName.trim()) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName.trim())
  const missing = selected.some((id) => !texts.some((text) => text.id === id))
  const canExport = selected.length > 0 && formats.length > 0 && validBaseName && !missing
  const visible =
    destination.kind === 'workspace' &&
    destination.view === 'export' &&
    destination.scope.projectId === scope.projectId &&
    destination.scope.workspaceId === scope.workspaceId
  const resultId = visible ? destination.exportResultId : undefined
  const showResults = resultsShown || !!resultId
  useEffect(() => {
    if (
      !showResults ||
      destination.kind !== 'workspace' ||
      destination.view !== 'export' ||
      destination.scope.projectId !== scope.projectId ||
      destination.scope.workspaceId !== scope.workspaceId
    )
      return
    const focused = document.activeElement
    const frame = requestAnimationFrame(() => {
      if (
        !root.current ||
        root.current.closest('[hidden], [inert]') ||
        composition.current ||
        closing ||
        navigating ||
        document.hidden ||
        !document.hasFocus() ||
        (document.activeElement !== focused && document.activeElement !== heading.current) ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return
      const target =
        (resultId ? root.current.querySelector<HTMLElement>(`#export-result-${resultId}`) : null) ??
        heading.current
      target?.focus()
      if (resultId) target?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [
    showResults,
    resultId,
    focusRevision,
    destination,
    scope.projectId,
    scope.workspaceId,
    composition,
    closing,
    navigating
  ])
  useEffect(() => {
    let active = true
    void window.collie
      .readRecipes({ projectId: scope.projectId, workspaceId: scope.workspaceId })
      .then((result) => {
        if (active) {
          if (result.ok) setRecipes(result.value)
          else setError(result.error.message)
        }
      })
      .catch(() => {
        if (active)
          setError('Saved recipes could not be loaded. Your export choices remain available.')
      })
    return () => {
      active = false
    }
  }, [scope.projectId, scope.workspaceId, props.project.headCommitId])
  function belongsTo(documentId: string, ancestorId: string): boolean {
    let cursor = props.project.documents.find((d) => d.id === documentId)
    while (cursor?.parentId) {
      if (cursor.parentId === ancestorId) return true
      cursor = props.project.documents.find((d) => d.id === cursor!.parentId)
    }
    return false
  }
  function toggle(id: string): void {
    const node = orderedOutline.find((d) => d.id === id)
    if (!node) return
    const ids = isEditableKind(node.kind)
      ? [id]
      : texts.filter((d) => belongsTo(d.id, id)).map((d) => d.id)
    const remove = ids.every((item) => selected.includes(item))
    // Ordinary section choices use outline order; custom order is an explicit secondary task.
    setSelection(
      texts
        .filter((d) =>
          remove
            ? selected.includes(d.id) && !ids.includes(d.id)
            : selected.includes(d.id) || ids.includes(d.id)
        )
        .map((d) => d.id)
    )
  }
  function move(id: string, direction: -1 | 1): void {
    const next = [...selected],
      index = next.indexOf(id),
      other = index + direction
    if (index < 0 || other < 0 || other >= next.length) return
    ;[next[index], next[other]] = [next[other], next[index]]
    setSelection(next)
  }
  async function exportWriting(accepted?: ExportPreview): Promise<void> {
    if (locked || running || !canExport) return
    setBusy(true)
    setError('')
    if (!accepted) setCapture(null)
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError(
          'Your latest writing could not be saved locally. Keep this window open and try again.'
        )
        return
      }
      let prepared = accepted
      if (!prepared) {
        const result = await window.collie.previewDocx({
          ...scope,
          documentIds: selected,
          paper,
          titlePage,
          includeDescription
        })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        prepared = result.value
      }
      if (
        prepared.headCommitId !== saved.headCommitId ||
        current.current.project.projectId !== scope.projectId ||
        current.current.project.workspaceId !== scope.workspaceId
      ) {
        setCapture(null)
        setError(
          'The writing changed while preparing this export. Export again to include the latest changes.'
        )
        return
      }
      if (
        prepared.issues.some((issue) => issue.kind !== 'metadata') ||
        prepared.losses.length ||
        (!accepted && prepared.issues.some((issue) => issue.kind === 'metadata'))
      ) {
        setCapture({ value: prepared, options: optionsKey })
        return
      }
      const result = await window.collie.startCompilation({
        ...scope,
        documentIds: selected,
        paper,
        titlePage,
        includeDescription,
        expectedHead: prepared.headCommitId,
        previewDigest: prepared.digest,
        acknowledgeMetadata: !!accepted,
        formats,
        baseName: baseName.trim()
      })
      if (result.ok) {
        trackExport(scope, result.value)
        setCapture(null)
        setShowResults(true)
      } else if (result.error.code !== 'CANCELLED')
        setError(
          result.error.code === 'UNAVAILABLE'
            ? 'Collie could not confirm that export started. Inspect the destination before retrying; any retained output and report are kept.'
            : result.error.message
        )
    } catch {
      setError(
        'Collie could not confirm that export started. Existing files and any retained export report are kept; inspect the destination before retrying.'
      )
    } finally {
      setBusy(false)
    }
  }
  function selectRecipe(recipe: CompilationRecipe): void {
    setTitlePage(false)
    setIncludeDescription(false)
    setRecipeId(recipe.id)
    setRecipeName(recipe.name)
    setSelection(recipe.documentIds)
    setPaper(recipe.paper)
    setFormats(props.paid ? recipe.formats : [recipe.formats[0]])
    setCapture(null)
  }
  async function saveRecipe(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError(
          'Your latest writing could not be saved locally. Keep this window open and try again.'
        )
        return
      }
      const existing = recipes?.recipes.find((r) => r.id === recipeId)
      if (!pendingRecipe.current)
        setPendingRecipeValue({
          input: {
            ...scope,
            operationId: crypto.randomUUID(),
            expectedHead: saved.headCommitId,
            id: existing?.id ?? null,
            expectedRevisionId: existing?.revisionId ?? null,
            name: recipeName.trim(),
            documentIds: selected,
            paper,
            formats
          }
        })
      const operation = pendingRecipe.current
      if (!operation) throw new Error('Recipe change was not retained')
      const result = await window.collie.changeRecipe(operation.input)
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') setPendingRecipeValue(null)
        setError(
          result.error.code === 'UNAVAILABLE'
            ? 'The recipe result is unknown. Retry the same save; a completed change will not be repeated.'
            : result.error.message
        )
        return
      }
      setPendingRecipeValue(null)
      setRecipes(result.value)
      setCapture(null)
      setRecipeId(
        result.value.recipes.find(
          (r) => r.name.toLocaleLowerCase() === recipeName.trim().toLocaleLowerCase()
        )?.id ?? null
      )
      const updated = await window.collie.openSection({ ...scope, documentId: saved.documentId })
      if (updated.ok) current.current.onProject(updated.value)
      else
        setError(
          'The recipe was saved. Reopen this project to refresh its revision before exporting.'
        )
    } catch {
      setError(
        'The recipe result is unknown. Retry the same save; a completed change will not be repeated.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function cancel(target: ExportJob): Promise<void> {
    try {
      const result = await window.collie.cancelDocx({ ...scope, jobId: target.id })
      if (result.ok) trackExport(scope, result.value)
      else setError(result.error.message)
    } catch {
      setError(
        'Cancellation could not be confirmed. Completed files and retained reports remain available.'
      )
    }
  }
  useRetainedDraft('export-preparation', {
    read: () => ({
      scope,
      kind: 'export-preparation',
      entityId: recipeId,
      label: 'export preparation',
      dirty: false,
      composing: false,
      busy,
      pendingOperation: pendingRecipe.current?.input ?? null,
      policy: 'operation',
      issue: error || undefined,
      status: busy ? 'Preparing export…' : undefined,
      target: { kind: 'workspace', scope, view: 'export' }
    })
  })
  return (
    <PresentationBoundary
      label="Export"
      render={() => (
        <>
          <section
            ref={root}
            className={styles['export-workspace']}
            aria-labelledby="export-heading"
          >
            <header>
              <h1 ref={heading} tabIndex={-1} id="export-heading">
                {showResults ? 'Export results' : 'Export'}
              </h1>
              {!showResults ? <p>Make a reading copy of your active manuscript.</p> : null}
            </header>
            <div className={styles['export-body']}>
              {showResults ? (
                operations.map((item) => (
                  <ExportResults
                    key={item.job.id}
                    operation={item}
                    cancel={() => void cancel(item.job)}
                  />
                ))
              ) : (
                <>
                  <fieldset className={styles['export-format-options']} disabled={locked}>
                    <legend>Format{props.paid ? 's' : ''}</legend>
                    {formatChoices.map(({ value, label }) =>
                      props.paid ? (
                        <ChoiceField
                          key={value}
                          label={label}
                          checked={formats.includes(value)}
                          onChange={() =>
                            setFormats((old) =>
                              old.includes(value) ? old.filter((f) => f !== value) : [...old, value]
                            )
                          }
                        />
                      ) : (
                        <Radio
                          key={value}
                          name="export-format"
                          label={label}
                          checked={formats.includes(value)}
                          onChange={() => setFormats([value])}
                        />
                      )
                    )}
                  </fieldset>
                  {formats.includes('text') ? (
                    <p>
                      Plain text omits image pixels and layout. Citations and footnotes remain
                      readable text.
                    </p>
                  ) : null}
                  {formats.includes('markdown') ? (
                    <p>
                      Markdown copies images to an adjacent folder and simplifies page layout. Keep
                      the files together.
                    </p>
                  ) : null}
                  <TextInput
                    label="File name"
                    value={baseName}
                    disabled={locked}
                    maxLength={100}
                    error={
                      !validBaseName
                        ? 'Use a filename without reserved characters, path separators or a trailing dot.'
                        : undefined
                    }
                    onChange={(event) => setBaseName(event.currentTarget.value)}
                  />
                  {!texts.length ? (
                    <p>No active writing sections. Add a section in Write before exporting.</p>
                  ) : null}
                  <details className={styles['export-disclosure']}>
                    <summary>Sections and order · {selected.length} selected</summary>
                    <AppButton
                      variant="subtle"
                      disabled={locked}
                      onClick={() => setSelection(null)}
                    >
                      Use full manuscript in outline order
                    </AppButton>
                    <fieldset className={styles['export-section-list']} disabled={locked}>
                      <legend>Include writing</legend>
                      {orderedOutline.map((d) => (
                        <div key={d.id} style={{ paddingInlineStart: `${d.depth * 1.25}rem` }}>
                          <ChoiceField
                            label={`${d.kind === 'text' ? 'Section' : d.kind === 'chapter' ? 'Chapter' : 'Part (all writing)'}: ${d.title}`}
                            checked={
                              isEditableKind(d.kind)
                                ? selected.includes(d.id)
                                : texts.some((text) => belongsTo(text.id, d.id)) &&
                                  texts
                                    .filter((text) => belongsTo(text.id, d.id))
                                    .every((text) => selected.includes(text.id))
                            }
                            onChange={() => toggle(d.id)}
                          />
                        </div>
                      ))}
                    </fieldset>
                    <details>
                      <summary>Custom order</summary>
                      <p>Changing the section selection returns to outline order.</p>
                      <ol className={styles['export-order']}>
                        {selected.map((id, index) => (
                          <li key={id}>
                            <span>
                              {props.project.documents.find((d) => d.id === id)?.title ??
                                'Missing section'}
                            </span>
                            <div className={styles['export-actions']}>
                              <AppButton
                                variant="subtle"
                                disabled={locked || index === 0}
                                aria-label={`Move section ${index + 1} up`}
                                onClick={() => move(id, -1)}
                              >
                                Move up
                              </AppButton>
                              <AppButton
                                variant="subtle"
                                disabled={locked || index === selected.length - 1}
                                aria-label={`Move section ${index + 1} down`}
                                onClick={() => move(id, 1)}
                              >
                                Move down
                              </AppButton>
                              <AppButton
                                variant="subtle"
                                disabled={locked}
                                onClick={() => setSelection(selected.filter((item) => item !== id))}
                              >
                                Remove
                              </AppButton>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </details>
                  {missing ? (
                    <p role="alert">
                      This selection contains missing or inactive sections. Remove them from Custom
                      order or use the full manuscript.
                    </p>
                  ) : null}
                  <details className={styles['export-disclosure']}>
                    <summary>Layout and document details</summary>
                    <SelectField
                      label="Page size"
                      value={paper}
                      disabled={locked}
                      onChange={(event) => setPaper(event.currentTarget.value as 'Letter' | 'A4')}
                      data={[
                        { value: 'Letter', label: 'US Letter' },
                        { value: 'A4', label: 'A4' }
                      ]}
                    />
                    <ChoiceField
                      label="Include a title page"
                      disabled={locked}
                      checked={titlePage}
                      onChange={(event) => setTitlePage(event.currentTarget.checked)}
                    />
                    <p>
                      DOCX/PDF properties include “{props.project.title}” and{' '}
                      {props.project.byline || 'an empty author field'}. Title pages include the
                      title, subtitle and byline.
                    </p>
                    <ChoiceField
                      label="Include the project description in DOCX/PDF properties"
                      disabled={locked}
                      checked={includeDescription}
                      onChange={(event) => setIncludeDescription(event.currentTarget.checked)}
                    />
                    <p>
                      Descriptions stay out of printed pages. Markdown/text have no guaranteed page
                      breaks.
                    </p>
                  </details>
                  <details
                    className={styles['export-disclosure']}
                    open={!!pendingRecipeValue || undefined}
                  >
                    <summary>Saved recipes</summary>
                    <p>
                      Recipes remember sections, order, page size and formats. Loading resets
                      title-page and description choices.
                    </p>
                    {!props.paid ? (
                      <p>
                        Load existing recipes and export one format at a time. Saving recipes
                        requires paid Collie access.
                      </p>
                    ) : null}
                    <SelectField
                      label="Recipe"
                      disabled={locked}
                      value={recipeId ?? ''}
                      onChange={(event) => {
                        const found = recipes?.recipes.find(
                          (r) => r.id === event.currentTarget.value
                        )
                        if (found) selectRecipe(found)
                        else {
                          setRecipeId(null)
                          setRecipeName('')
                        }
                      }}
                    >
                      <option value="">New recipe</option>
                      {recipes?.recipes.map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name}
                          {r.missingIds.length ? ' — missing sections' : ''}
                        </option>
                      ))}
                    </SelectField>
                    <TextInput
                      label="Recipe name"
                      disabled={!props.paid || locked}
                      value={recipeName}
                      maxLength={120}
                      onChange={(event) => setRecipeName(event.currentTarget.value)}
                    />
                    <AppButton
                      variant="default"
                      disabled={
                        !props.paid ||
                        props.disabled ||
                        busy ||
                        (!pendingRecipeValue && (!recipeName.trim() || !canExport))
                      }
                      onClick={() => void saveRecipe()}
                    >
                      {pendingRecipeValue
                        ? 'Retry same recipe save'
                        : recipeId
                          ? 'Update recipe'
                          : 'Save new recipe'}
                    </AppButton>
                  </details>
                  {blocking.length || preview?.losses.length ? (
                    <div role="alert">
                      <h2>This export needs a correction</h2>
                      <ul>
                        {blocking.map((issue, index) => (
                          <li key={index}>{issue.message}</li>
                        ))}
                        {preview?.losses.map((loss, index) => (
                          <li key={`loss-${index}`}>{loss}</li>
                        ))}
                      </ul>
                      {blocking.some((issue) => issue.kind === 'reference') ? (
                        <AppButton
                          variant="default"
                          disabled={locked}
                          onClick={() => research({ kind: 'sources' })}
                        >
                          Review sources
                        </AppButton>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              {busy ? (
                <p role="status">Preparing export or waiting for the destination dialog…</p>
              ) : null}
              {error ? <p role="alert">{error}</p> : null}
            </div>
            <footer className={styles['export-actions']}>
              {showResults ? (
                <>
                  <AppButton
                    disabled={locked}
                    onClick={() => void navigate({ kind: 'workspace', scope, view: 'write' })}
                  >
                    {running ? 'Back to writing' : 'Done'}
                  </AppButton>
                  <AppButton
                    variant="default"
                    disabled={locked || running}
                    onClick={() => {
                      setCapture(null)
                      setError('')
                      setShowResults(false)
                    }}
                  >
                    Export again
                  </AppButton>
                </>
              ) : (
                <>
                  <AppButton
                    disabled={locked || running || !canExport}
                    onClick={() => void exportWriting()}
                  >
                    Export…
                  </AppButton>
                  {operations.length ? (
                    <AppButton
                      variant="default"
                      disabled={busy}
                      onClick={() => setShowResults(true)}
                    >
                      View results
                    </AppButton>
                  ) : null}
                </>
              )}
            </footer>
          </section>
          <AppDialog
            opened={decision && visible}
            onClose={() => {
              if (!busy) setCapture(null)
            }}
            title="Export with incomplete source details?"
            dismissible={!busy}
            onExited={() => {
              if (
                !visible ||
                !showResults ||
                closing ||
                navigating ||
                composition.current ||
                document.hidden ||
                !document.hasFocus() ||
                root.current?.closest('[hidden], [inert]') ||
                document.querySelector('[role="dialog"], [role="alertdialog"]') ||
                (document.activeElement !== document.body &&
                  document.activeElement !== heading.current)
              )
                return
              heading.current?.focus({ preventScroll: true })
            }}
            classNames={{ content: styles['export-dialog'], body: styles['export-dialog-body'] }}
          >
            <div className={styles['export-dialog-scroll']}>
              <p>
                The following source details need review. Fix them or export with the listed
                omissions.
              </p>
              <ul>
                {metadata.map((issue, index) => (
                  <li key={index}>{issue.message}</li>
                ))}
              </ul>
              {error ? <p role="alert">{error}</p> : null}
            </div>
            <div className={styles['export-actions']}>
              <AppButton variant="default" disabled={busy} onClick={() => setCapture(null)}>
                Cancel
              </AppButton>
              <AppButton
                variant="default"
                disabled={locked}
                onClick={() => {
                  setCapture(null)
                  research({ kind: 'sources' })
                }}
              >
                Review sources
              </AppButton>
              <AppButton
                disabled={locked || !preview}
                onClick={() => {
                  if (preview) void exportWriting(preview)
                }}
              >
                Export with omissions…
              </AppButton>
            </div>
          </AppDialog>
        </>
      )}
    />
  )
}
