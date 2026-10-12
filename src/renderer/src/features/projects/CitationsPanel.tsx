import PresentationBoundary from '../../components/PresentationBoundary'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { useRetainedDraft } from '../workspace/DraftOwner'
import styles from '../export/CitationsPanel.module.css'
import type { OpenProject } from '../../../../shared/projects'
import type { CitationStyle, CitationStyleInput, CitationsView } from '../../../../shared/citations'
import type { SourceRecord } from '../../../../shared/sources'
import type { Run } from '../../../../domain/compilation/model'

export function CitationRuns({ runs }: { runs: Run[] }): React.JSX.Element {
  return (
    <>
      {runs.map((run, index) =>
        run.kind === 'break' ? (
          <br key={index} />
        ) : run.kind === 'note' ? (
          <sup key={index}>{run.number}</sup>
        ) : (
          <span
            key={index}
            style={{
              fontWeight: run.marks.some((m) => m.type === 'bold') ? 'bold' : undefined,
              fontStyle: run.marks.some((m) => m.type === 'italic') ? 'italic' : undefined,
              textDecoration:
                [
                  run.marks.some((m) => m.type === 'underline') ? 'underline' : '',
                  run.marks.some((m) => m.type === 'strike') ? 'line-through' : ''
                ]
                  .filter(Boolean)
                  .join(' ') || undefined,
              fontVariant: run.smallCaps ? 'small-caps' : undefined,
              verticalAlign: run.superscript ? 'super' : run.subscript ? 'sub' : undefined
            }}
          >
            {run.text}
          </span>
        )
      )}
    </>
  )
}
type Props = {
  readOnly: boolean
  project: OpenProject
  dirty: boolean
  disabled: boolean
  flush: () => Promise<OpenProject | null>
  onCommitted: () => Promise<void>
  onContext: (sources: SourceRecord[], view: CitationsView | null) => void
  navigate: (documentId: string, anchorId: string) => Promise<void>
  source: (id: string) => void
}
export default function CitationsPanel(props: Props): React.JSX.Element {
  const { project, dirty, disabled } = props,
    scope = { projectId: project.projectId, workspaceId: project.workspaceId }
  const [view, setView] = useState<CitationsView | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const current = useRef(props),
    [pendingValue, setPendingValue, pending] = useSynchronousState<CitationStyleInput | null>(null),
    generation = useRef(0)
  const panel = useRef<HTMLElement>(null),
    [changingValue, setChangingValue, changing] = useSynchronousState(false)
  useEffect(() => {
    if (error || pendingValue) panel.current?.closest('details')?.setAttribute('open', '')
  }, [error, pendingValue])
  useLayoutEffect(() => {
    current.current = props
  })
  async function load(protect = false): Promise<void> {
    const epoch = ++generation.current
    setLoading(true)
    if (!pending.current && !changing.current) setError('')
    try {
      if (protect) {
        const saved = await current.current.flush()
        if (epoch !== generation.current) return
        if (!saved) {
          setError('Finish saving the pending edits before refreshing the preview.')
          return
        }
      }
      if (current.current.dirty && !protect) {
        const sources = await window.collie.readSources(scope)
        if (epoch === generation.current) {
          if (sources.ok) current.current.onContext(sources.value.sources, null)
          else setError(sources.error.message)
        }
        return
      }
      const [sources, citations] = await Promise.all([
        window.collie.readSources(scope),
        window.collie.readCitations(scope)
      ])
      if (epoch !== generation.current) return
      if (!sources.ok || !citations.ok) {
        setError(!sources.ok ? sources.error.message : !citations.ok ? citations.error.message : '')
        setView(null)
        current.current.onContext(sources.ok ? sources.value.sources : [], null)
        return
      }
      if (
        sources.value.headCommitId !== citations.value.headCommitId ||
        citations.value.headCommitId !== current.current.project.headCommitId ||
        current.current.dirty
      ) {
        current.current.onContext(sources.value.sources, null)
        return
      }
      setView(citations.value)
      if (!pending.current && !changing.current) setError('')
      current.current.onContext(sources.value.sources, citations.value)
    } catch {
      if (epoch === generation.current) {
        setView(null)
        current.current.onContext([], null)
        setError('Citation preview is unavailable. Your manuscript is kept.')
      }
    } finally {
      if (epoch === generation.current) setLoading(false)
    }
  }
  const onPreviewTimer = useEffectEvent(() => {
    void load()
  })
  useEffect(() => {
    const timer = setTimeout(() => {
      onPreviewTimer()
    }, 350)
    const requestGeneration = generation
    return () => {
      clearTimeout(timer)
      requestGeneration.current++
    }
  }, [project.headCommitId, dirty])
  async function changeStyle(style: CitationStyle): Promise<void> {
    if (changing.current) return
    setChangingValue(true)
    setLoading(true)
    setError('')
    try {
      const saved = await current.current.flush()
      if (!saved) {
        setError('Finish saving the pending edits before changing the citation style.')
        return
      }
      setPendingValue(
        pending.current ?? {
          ...scope,
          operationId: crypto.randomUUID(),
          expectedHead: saved.headCommitId,
          style
        }
      )
      const input = pending.current
      if (!input) throw new Error('Citation change was not retained')
      const result = await window.collie.changeCitationStyle(input)
      if (!result.ok) {
        if (!['UNAVAILABLE', 'DISK_FULL'].includes(result.error.code)) setPendingValue(null)
        setError(result.error.message)
        return
      }
      setPendingValue(null)
      setView(result.value)
      await current.current.onCommitted()
      // The head change drives a fresh context; never attach old strings to newer edits.
    } catch {
      setError(
        pending.current
          ? 'The style change could not be confirmed. Retry keeps the same change.'
          : 'Citation style could not be refreshed. Refresh preview to check the current style.'
      )
    } finally {
      setChangingValue(false)
      setLoading(false)
    }
  }
  useRetainedDraft('citation-style', {
    read: () => ({
      scope,
      kind: 'citation-style',
      entityId: null,
      label: 'citation style change',
      dirty: false,
      composing: false,
      busy: changing.current,
      pendingOperation: pending.current,
      policy: 'operation',
      issue: error || undefined,
      target: { kind: 'workspace', scope, view: 'export' }
    }),
    focus: () => {
      panel.current?.closest('details')?.setAttribute('open', '')
      panel.current?.focus()
    }
  })
  const preview = !dirty && view?.headCommitId === project.headCommitId ? view : null
  return (
    <PresentationBoundary
      label="Citation preview"
      render={() => (
        <section
          ref={panel}
          className={styles['citations-panel']}
          aria-labelledby="citations-heading"
          tabIndex={-1}
        >
          <h2 id="citations-heading">Citations and bibliography</h2>
          <div className={styles['citation-controls']}>
            <SelectField
              label="Citation style"
              value={pendingValue?.style ?? view?.style ?? ''}
              disabled={
                props.readOnly || disabled || loading || changingValue || !!pendingValue || !view
              }
              onChange={(event) => {
                void changeStyle(event.currentTarget.value as CitationStyle)
              }}
            >
              {!view ? (
                <option value="">{loading ? 'Loading style…' : 'Style unavailable'}</option>
              ) : null}
              <option value="apa">APA 7</option>
              <option value="chicago">Chicago 18 — notes and bibliography</option>
            </SelectField>
            {pendingValue && !changingValue ? (
              <AppButton
                variant="default"
                type="button"
                disabled={props.readOnly || disabled || loading || changingValue}
                onClick={() => {
                  void changeStyle(pendingValue.style)
                }}
              >
                Retry style change
              </AppButton>
            ) : null}
            <AppButton
              variant="default"
              type="button"
              disabled={disabled || loading || changingValue || !!pendingValue}
              onClick={() => {
                void load(true)
              }}
            >
              Refresh preview
            </AppButton>
          </div>
          {changingValue || loading || dirty ? (
            <p role="status">
              {changingValue
                ? 'Saving citation style…'
                : loading
                  ? 'Updating preview…'
                  : 'Refresh preview to include your latest edits.'}
            </p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          {preview ? (
            <div
              className={styles['citation-preview']}
              role="region"
              aria-label="Citation preview"
              tabIndex={0}
            >
              <p>Active manuscript in outline order.</p>
              {preview.error ? <p role="alert">{preview.error}</p> : null}
              {preview.issues.length ? (
                <ul>
                  {preview.issues.map((issue, index) => (
                    <li key={`${issue.citationId}-${issue.sourceId}-${index}`}>
                      <strong>
                        {issue.kind === 'reference' ? 'Citation needs repair' : 'Source details'}:
                      </strong>{' '}
                      {issue.message}{' '}
                      <AppButton
                        variant="default"
                        type="button"
                        disabled={disabled || changingValue || !!pendingValue}
                        onClick={() => {
                          void current.current.navigate(issue.documentId, issue.citationId)
                        }}
                      >
                        Open citation
                      </AppButton>
                      <AppButton
                        variant="default"
                        type="button"
                        disabled={disabled || changingValue || !!pendingValue}
                        onClick={() => current.current.source(issue.sourceId)}
                      >
                        Open source
                      </AppButton>
                    </li>
                  ))}
                </ul>
              ) : null}
              <h3>Bibliography</h3>
              {preview.bibliography.length ? (
                <div
                  className={styles['bibliography-preview']}
                  data-hanging={preview.hangingIndent}
                >
                  {preview.bibliography.map((runs, index) => (
                    <p key={index}>
                      <CitationRuns runs={runs} />
                    </p>
                  ))}
                </div>
              ) : (
                <p>
                  {preview.error
                    ? 'Bibliography is unavailable until the preview is repaired.'
                    : 'No cited sources in the active manuscript.'}
                </p>
              )}
              {preview.notes.length ? (
                <details>
                  <summary>Notes in manuscript order</summary>
                  <ol className={styles['citation-note-preview']}>
                    {preview.notes.map((note) => (
                      <li key={note.id} value={note.number}>
                        {note.paragraphs.map((runs, index) => (
                          <p key={index}>
                            <CitationRuns runs={runs} />
                          </p>
                        ))}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>
      )}
    />
  )
}
