import { Radio, TextInput } from '@mantine/core'
import ExportResults from '../export/ExportResults'
import { AppButton, SelectField, ChoiceField } from '../../components/ui/Controls'
import styles from '../export/ExportWorkspace.module.css'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { ExportJob, ExportPreview } from '../../../../shared/exports'
import type { ExportFormat } from '../../../../shared/exports'
import type {
  CompilationRecipe,
  RecipesView,
  RecipeChangeInput
} from '../../../../shared/interchange'
import { effectiveState, type OutlineDocument } from '../../../../shared/outline'

type Props = {
  project: OpenProject
  disabled: boolean
  paid: boolean
  flush: () => Promise<OpenProject | null>
  onProject: (project: OpenProject) => void
}
function outline(
  documents: OutlineDocument[]
): { id: string; title: string; depth: number; kind: OutlineDocument['kind'] }[] {
  const result: { id: string; title: string; depth: number; kind: OutlineDocument['kind'] }[] = []
  function walk(parent: string | null, depth: number): void {
    for (const d of documents
      .filter((x) => x.parentId === parent)
      .sort((a, b) => a.position - b.position)) {
      if (effectiveState(d, documents) !== 'active') continue
      result.push({ id: d.id, title: d.title, depth, kind: d.kind })
      walk(d.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}
export default function DocxExportPanel(props: Props): React.JSX.Element {
  const { exports, trackExport, research, destination, focusRevision } = useWorkspaceSession()
  const operation = exports
    .filter(
      (item) =>
        item.scope.projectId === props.project.projectId &&
        item.scope.workspaceId === props.project.workspaceId
    )
    .at(-1)
  function setJob(next: ExportJob): void {
    trackExport(
      { projectId: props.project.projectId, workspaceId: props.project.workspaceId },
      next
    )
    setStep('result')
  }
  const current = useRef(props)
  current.current = props
  const orderedOutline = outline(props.project.documents)
  const texts = orderedOutline.filter((d) => d.kind === 'text')
  const [selected, setSelected] = useState<string[]>(() =>
    orderedOutline.filter((d) => d.kind === 'text').map((d) => d.id)
  )
  const [paper, setPaper] = useState<'Letter' | 'A4'>('Letter')
  const [capture, setCapture] = useState<{ value: ExportPreview; options: string } | null>(null)
  const [step, setStep] = useState<'options' | 'review' | 'result'>('options')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  const [titlePage, setTitlePage] = useState(false),
    [includeDescription, setIncludeDescription] = useState(false)
  const [ack, setAck] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [formats, setFormats] = useState<ExportFormat[]>(['docx']),
    [baseName, setBaseName] = useState('Collie Writer manuscript')
  const [recipes, setRecipes] = useState<RecipesView | null>(null),
    [recipeId, setRecipeId] = useState<string | null>(null),
    [recipeName, setRecipeName] = useState('')
  const pendingRecipe = useRef<{ signature: string; input: RecipeChangeInput } | null>(null)
  const scope = { projectId: props.project.projectId, workspaceId: props.project.workspaceId }
  useEffect(() => {
    if (!props.paid) setFormats((old) => (old.length > 1 ? [old[0]] : old))
  }, [props.paid])
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
  useEffect(() => {
    setCapture(null)
    setAck(false)
  }, [optionsKey])
  useEffect(() => {
    setAck(false)
  }, [props.project.headCommitId])
  useEffect(() => {
    if (
      destination.kind === 'workspace' &&
      destination.view === 'export' &&
      destination.exportResultId
    )
      setStep('result')
  }, [focusRevision])
  useEffect(() => {
    if (
      step !== 'result' ||
      destination.kind !== 'workspace' ||
      destination.view !== 'export' ||
      !destination.exportResultId
    )
      return
    const frame = requestAnimationFrame(() => {
      const result = document.getElementById(`export-result-${destination.exportResultId}`)
      result?.focus()
      result?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [step, focusRevision])
  useEffect(() => {
    let active = true
    void window.collie
      .readRecipes(scope)
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
  function toggle(id: string): void {
    const node = orderedOutline.find((d) => d.id === id)
    if (!node) return
    const descendants =
      node.kind === 'text' ? [id] : texts.filter((d) => belongsTo(d.id, id)).map((d) => d.id)
    setSelected((old) =>
      descendants.every((x) => old.includes(x))
        ? old.filter((x) => !descendants.includes(x))
        : [...old, ...descendants.filter((x) => !old.includes(x))]
    )
  }
  function belongsTo(documentId: string, ancestorId: string): boolean {
    let cursor = props.project.documents.find((d) => d.id === documentId)
    while (cursor?.parentId) {
      if (cursor.parentId === ancestorId) return true
      cursor = props.project.documents.find((d) => d.id === cursor!.parentId)
    }
    return false
  }
  function move(id: string, direction: -1 | 1): void {
    setSelected((old) => {
      const next = [...old],
        index = next.indexOf(id),
        other = index + direction
      if (index < 0 || other < 0 || other >= next.length) return old
      ;[next[index], next[other]] = [next[other], next[index]]
      return next
    })
  }
  async function refresh(): Promise<void> {
    setBusy(true)
    setError('')
    setCapture(null)
    setAck(false)
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError('Protect pending writing, notes and sources before previewing.')
        return
      }
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
      if (result.value.headCommitId !== saved.headCommitId) {
        setError('The project changed while preparing the preview. Refresh it again.')
        return
      }
      setCapture({ value: result.value, options: optionsKey })
      setStep('review')
    } catch {
      setError('The compilation preview is unavailable. Your writing has been kept.')
    } finally {
      setBusy(false)
    }
  }
  async function start(): Promise<void> {
    if (!preview) return
    setBusy(true)
    setError('')
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError('Protect pending writing, notes and sources before exporting.')
        return
      }
      if (saved.headCommitId !== preview.headCommitId) {
        setCapture(null)
        setError('The project changed. Refresh the compilation preview before exporting.')
        return
      }
      const result = await window.collie.startDocx({
        ...scope,
        documentIds: selected,
        paper,
        titlePage,
        includeDescription,
        expectedHead: preview.headCommitId,
        previewDigest: preview.digest,
        acknowledgeMetadata: ack
      })
      if (!result.ok) {
        if (result.error.code !== 'CANCELLED') setError(result.error.message)
        return
      }
      setJob(result.value)
    } catch {
      setError('Export did not start. Your project and any prior DOCX were kept.')
    } finally {
      setBusy(false)
    }
  }
  async function startCompilation(): Promise<void> {
    if (!preview || !formats.length) return
    setBusy(true)
    setError('')
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError('Protect pending writing before exporting.')
        return
      }
      if (saved.headCommitId !== preview.headCommitId) {
        setCapture(null)
        setError('The project changed. Refresh the compilation preview.')
        return
      }
      const result = await window.collie.startCompilation({
        ...scope,
        documentIds: selected,
        paper,
        titlePage,
        includeDescription,
        expectedHead: preview.headCommitId,
        previewDigest: preview.digest,
        acknowledgeMetadata: ack,
        formats,
        baseName: baseName.trim()
      })
      if (result.ok) setJob(result.value)
      else if (result.error.code !== 'CANCELLED') setError(result.error.message)
    } catch {
      setError('The compilation did not start. Existing files were kept.')
    } finally {
      setBusy(false)
    }
  }
  function useRecipe(recipe: CompilationRecipe): void {
    setTitlePage(false)
    setIncludeDescription(false)
    setRecipeId(recipe.id)
    setRecipeName(recipe.name)
    setSelected(recipe.documentIds)
    setPaper(recipe.paper)
    setFormats(props.paid ? recipe.formats : [recipe.formats[0]])
    setCapture(null)
    setAck(false)
  }
  async function saveRecipe(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError('Protect pending writing before saving a recipe.')
        return
      }
      const existing = recipes?.recipes.find((r) => r.id === recipeId)
      const signature = JSON.stringify({
        id: existing?.id ?? null,
        name: recipeName.trim(),
        documentIds: selected,
        paper,
        formats
      })
      if (!pendingRecipe.current)
        pendingRecipe.current = {
          signature,
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
        }
      const result = await window.collie.changeRecipe(pendingRecipe.current.input)
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') pendingRecipe.current = null
        setError(
          result.error.code === 'UNAVAILABLE'
            ? 'The recipe result is unknown. Retry the same save; a completed change will not be repeated.'
            : result.error.message
        )
        return
      }
      pendingRecipe.current = null
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
  function toggleFormat(format: ExportFormat): void {
    setFormats((old) =>
      !props.paid
        ? [format]
        : old.includes(format)
          ? old.filter((f) => f !== format)
          : [...old, format]
    )
  }
  async function cancel(target: ExportJob): Promise<void> {
    try {
      const result = await window.collie.cancelDocx({ ...scope, jobId: target.id })
      if (!result.ok) setError(result.error.message)
      else trackExport(scope, result.value)
    } catch {
      setError(
        'Cancellation could not be confirmed. Completed files and retained reports remain available.'
      )
    }
  }
  const metadata = preview?.issues.filter((i) => i.kind === 'metadata') ?? [],
    blocking = preview?.issues.filter((i) => i.kind !== 'metadata') ?? []
  const validBaseName =
    /^[^\\/:*?"<>|.\u0000-\u001f][^\\/:*?"<>|\u0000-\u001f]*$/.test(baseName.trim()) &&
    !/[. ]$/.test(baseName.trim()) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName.trim())
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
      status: busy ? 'Preparing…' : undefined,
      target: { kind: 'workspace', scope, view: 'export' }
    })
  })
  const locked = props.disabled || busy || !!pendingRecipe.current
  const canReview =
    selected.length > 0 &&
    formats.length > 0 &&
    validBaseName &&
    !selected.some((id) => !texts.some((t) => t.id === id))
  const canExport =
    !!preview &&
    !locked &&
    !exports.some(
      (item) =>
        item.scope.workspaceId === scope.workspaceId &&
        ['rendering', 'publishing'].includes(item.job.state)
    ) &&
    !blocking.length &&
    !preview.losses.length &&
    (!metadata.length || ack)
  return (
    <section className={styles['export-workspace']} aria-labelledby="docx-export-heading">
      <header>
        <p className={styles['export-eyebrow']}>Share your writing</p>
        <h1 id="docx-export-heading">Export</h1>
        <p>
          Make a reading copy from protected writing. Export is separate from saving your Collie
          project.
        </p>
      </header>
      <nav className={styles['export-steps']} aria-label="Export steps">
        <AppButton
          variant={step === 'options' ? 'filled' : 'subtle'}
          disabled={busy}
          aria-current={step === 'options' ? 'step' : undefined}
          onClick={() => setStep('options')}
        >
          1. Sections and options
        </AppButton>
        <AppButton
          variant={step === 'review' ? 'filled' : 'subtle'}
          disabled={busy}
          aria-current={step === 'review' ? 'step' : undefined}
          onClick={() => setStep('review')}
        >
          2. Review and destination
        </AppButton>
        <AppButton
          variant={step === 'result' ? 'filled' : 'subtle'}
          disabled={busy || !operation}
          aria-current={step === 'result' ? 'step' : undefined}
          onClick={() => setStep('result')}
        >
          3. Export results
        </AppButton>
      </nav>
      <h2 ref={heading} tabIndex={-1}>
        {step === 'options'
          ? 'Choose what to export'
          : step === 'review'
            ? 'Review before choosing a destination'
            : 'Your export results'}
      </h2>
      {step === 'options' ? (
        <div className={styles['export-options']}>
          <fieldset className={styles['export-section-list']} disabled={locked}>
            <legend>Include sections</legend>
            {!texts.length ? (
              <p>No active writing sections. Add a section in Write before exporting.</p>
            ) : null}
            {orderedOutline.map((d) => (
              <div key={d.id} style={{ paddingInlineStart: `${d.depth * 1.25}rem` }}>
                <ChoiceField
                  label={`${d.kind === 'text' ? 'Section' : d.kind === 'chapter' ? 'Chapter' : 'Part'}: ${d.title}`}
                  checked={
                    d.kind === 'text'
                      ? selected.includes(d.id)
                      : texts.some((x) => belongsTo(x.id, d.id)) &&
                        texts
                          .filter((x) => belongsTo(x.id, d.id))
                          .every((x) => selected.includes(x.id))
                  }
                  onChange={() => toggle(d.id)}
                />
              </div>
            ))}
          </fieldset>
          <details className={styles['export-disclosure']}>
            <summary>Selected order · {selected.length} sections</summary>
            <ol className={styles['export-order']}>
              {selected.map((id, index) => (
                <li key={id}>
                  <span>
                    {props.project.documents.find((d) => d.id === id)?.title ??
                      'Missing section — remove or replace this recipe selection'}
                  </span>
                  <div className={styles['export-actions']}>
                    <AppButton
                      variant="subtle"
                      disabled={locked || index === 0}
                      onClick={() => move(id, -1)}
                      aria-label={`Move section ${index + 1} up`}
                    >
                      Move up
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={locked || index === selected.length - 1}
                      onClick={() => move(id, 1)}
                      aria-label={`Move section ${index + 1} down`}
                    >
                      Move down
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={locked}
                      onClick={() => setSelected((old) => old.filter((item) => item !== id))}
                    >
                      Remove from export
                    </AppButton>
                  </div>
                </li>
              ))}
            </ol>
          </details>
          <fieldset className={styles['export-format-options']} disabled={locked}>
            <legend>Output format{props.paid ? 's' : ''}</legend>
            {(['docx', 'pdf', 'markdown', 'text'] as ExportFormat[]).map((format) =>
              props.paid ? (
                <ChoiceField
                  key={format}
                  label={
                    format === 'text'
                      ? 'Plain text'
                      : format === 'markdown'
                        ? 'Markdown'
                        : format.toUpperCase()
                  }
                  checked={formats.includes(format)}
                  onChange={() => toggleFormat(format)}
                />
              ) : (
                <Radio
                  key={format}
                  name="export-format"
                  label={
                    format === 'text'
                      ? 'Plain text'
                      : format === 'markdown'
                        ? 'Markdown'
                        : format.toUpperCase()
                  }
                  checked={formats.includes(format)}
                  onChange={() => toggleFormat(format)}
                />
              )
            )}
            <p>
              {props.paid
                ? 'Choose one format or a batch of formats.'
                : 'Choose one format at a time. Multi-format batches require paid Collie access.'}
            </p>
          </fieldset>
          <div className={styles['export-fields']}>
            <SelectField
              label="Page preset"
              value={paper}
              disabled={locked}
              onChange={(e) => setPaper(e.currentTarget.value as 'Letter' | 'A4')}
              data={[
                { value: 'Letter', label: 'US Letter' },
                { value: 'A4', label: 'A4' }
              ]}
            />
            <TextInput
              label="Output name"
              value={baseName}
              disabled={locked}
              maxLength={100}
              error={
                !validBaseName
                  ? 'Use a filename without path separators, reserved characters or a trailing dot.'
                  : undefined
              }
              onChange={(e) => setBaseName(e.currentTarget.value)}
            />
          </div>
          <ChoiceField
            label="Include a title page with title and byline"
            disabled={locked}
            checked={titlePage}
            onChange={(event) => setTitlePage(event.currentTarget.checked)}
          />
          <details className={styles['export-disclosure']}>
            <summary>Document properties and format limits</summary>
            <p>
              DOCX and PDF properties include “{props.project.title}” and{' '}
              {props.project.byline || 'an empty author field'}. The title page contains only the
              title and byline.
            </p>
            <ChoiceField
              label="Include the project description in DOCX/PDF document properties"
              disabled={locked}
              checked={includeDescription}
              onChange={(event) => setIncludeDescription(event.currentTarget.checked)}
            />
            <p>
              Descriptions are never printed on the title page or added to Markdown/text.
              Markdown/text opening title and byline have no guaranteed page break. Markdown copies
              images into an adjacent asset folder. Plain text omits image pixels and layout; each
              result reports format losses.
            </p>
          </details>
          <details
            className={styles['export-disclosure']}
            open={!!pendingRecipe.current || undefined}
          >
            <summary>Saved compilation recipes</summary>
            <p>
              Recipes remember section IDs, order, paper and formats. They contain no second
              manuscript. Loading resets title-page and description choices.
            </p>
            {!props.paid ? (
              <p>
                Load existing recipes and export one format at a time. Creating or editing recipes
                requires paid Collie access.
              </p>
            ) : null}
            <SelectField
              label="Saved recipes"
              disabled={locked}
              value={recipeId ?? ''}
              onChange={(e) => {
                const found = recipes?.recipes.find((r) => r.id === e.currentTarget.value)
                if (found) useRecipe(found)
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
            {selected.some((id) => !texts.some((t) => t.id === id)) ? (
              <p role="alert">
                This selection contains missing or inactive sections. Remove them from Selected
                order or choose active sections before reviewing.
              </p>
            ) : null}
            <TextInput
              label="Recipe name"
              disabled={!props.paid || locked}
              value={recipeName}
              maxLength={120}
              onChange={(e) => setRecipeName(e.currentTarget.value)}
            />
            <AppButton
              variant="default"
              disabled={
                !props.paid ||
                props.disabled ||
                busy ||
                (!pendingRecipe.current &&
                  (!recipeName.trim() ||
                    !selected.length ||
                    !formats.length ||
                    selected.some((id) => !texts.some((t) => t.id === id))))
              }
              onClick={() => void saveRecipe()}
            >
              {pendingRecipe.current
                ? 'Retry same recipe save'
                : recipeId
                  ? 'Update recipe'
                  : 'Save new recipe'}
            </AppButton>
          </details>
          <AppButton disabled={locked || !canReview} onClick={() => void refresh()}>
            Protect drafts and review export
          </AppButton>
        </div>
      ) : null}
      {step === 'review' ? (
        <div className={styles['export-review']}>
          {!preview ? (
            <>
              <p role="status">
                The writing or export choices changed. Prepare a new review and acknowledge any
                remaining metadata omissions.
              </p>
              <AppButton disabled={locked || !canReview} onClick={() => void refresh()}>
                Prepare fresh review
              </AppButton>
            </>
          ) : (
            <>
              <p>
                {preview.sections.length} sections ·{' '}
                {formats.map((f) => (f === 'text' ? 'Plain text' : f.toUpperCase())).join(', ')} ·{' '}
                {preview.style === 'apa' ? 'APA 7' : 'Chicago 18'} · {preview.paper}
              </p>
              <details>
                <summary>Captured writing details</summary>
                <p>
                  Revision {preview.headCommitId.slice(0, 8)} · {preview.counts.paragraphs}{' '}
                  paragraphs · {preview.counts.tables} tables · {preview.counts.images} images ·{' '}
                  {preview.counts.footnotes} footnotes · {preview.counts.citations} citation
                  clusters · {preview.counts.bibliography} bibliography entries.
                </p>
                <ol>
                  {preview.sections.map((section) => (
                    <li key={section.documentId}>{section.title}</li>
                  ))}
                </ol>
              </details>
              {blocking.map((issue, index) => (
                <p role="alert" key={index}>
                  {issue.message}
                </p>
              ))}
              {metadata.length ? (
                <div>
                  <h3>Source metadata needs review</h3>
                  <ul>
                    {metadata.map((issue, index) => (
                      <li key={index}>{issue.message}</li>
                    ))}
                  </ul>
                  <ChoiceField
                    label="Export this captured revision with these listed metadata omissions"
                    disabled={locked}
                    checked={ack}
                    onChange={(e) => setAck(e.currentTarget.checked)}
                  />
                </div>
              ) : null}
              {preview.issues.length ? (
                <AppButton
                  variant="default"
                  disabled={busy}
                  onClick={() => research({ kind: 'sources' })}
                >
                  Review sources in Research
                </AppButton>
              ) : null}
              {preview.losses.length ? (
                <p role="alert">Unsupported compilation conversions: {preview.losses.join('; ')}</p>
              ) : (
                <p>
                  No compilation-blocking conversion is planned. Format-specific losses appear in
                  each file result.
                </p>
              )}
              <p>
                {formats.length === 1
                  ? 'Next, choose a file in the native Save dialog.'
                  : 'Next, choose a folder for the selected formats.'}{' '}
                Existing outputs are kept; choose a new name to retry a collision. Cancelling the
                picker keeps this review.
              </p>
              <AppButton
                disabled={!canExport || !canReview}
                onClick={() => void startCompilation()}
              >
                Choose {formats.length === 1 ? 'file' : 'folder'} and export…
              </AppButton>
              <details className={styles['export-disclosure']}>
                <summary>Replace an existing DOCX</summary>
                <p>
                  This separate DOCX-only flow asks for explicit replacement confirmation and
                  retains the previous DOCX beside the new output.
                </p>
                <AppButton
                  variant="default"
                  disabled={!canExport || formats.length !== 1 || formats[0] !== 'docx'}
                  onClick={() => void start()}
                >
                  Choose DOCX with replacement option…
                </AppButton>
              </details>
            </>
          )}
        </div>
      ) : null}
      {step === 'result' ? (
        <>
          <p>
            Completed files remain available even when another format fails or cancellation stops
            the remaining work. No project-file Save is implied.
          </p>
          {exports
            .filter(
              (item) =>
                item.scope.projectId === scope.projectId &&
                item.scope.workspaceId === scope.workspaceId
            )
            .slice()
            .reverse()
            .map((item) => (
              <ExportResults
                key={item.job.id}
                operation={item}
                cancel={() => void cancel(item.job)}
              />
            ))}
          <AppButton variant="default" disabled={busy} onClick={() => setStep('options')}>
            Prepare another export
          </AppButton>
        </>
      ) : null}
      {busy ? (
        <p role="status">Preparing export or waiting for the native destination dialog…</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
