import { useEffect, useRef, useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import type { OpenInput } from '../../../../shared/projects'
import type { ImportFile } from '../../../../shared/project-import'
import type { ImportContentValue } from '../../../../shared/import-content'
import styles from './ImportProvider.module.css'

type Preview = Extract<ImportContentValue, { type: 'content-preview' }>
export function ImportContentPreview({
  scope,
  batchId,
  graphId,
  files,
  disabled,
  onRecord
}: {
  scope: OpenInput
  batchId: string
  graphId: string
  files: ImportFile[]
  disabled: boolean
  onRecord: (id: string) => void
}): React.JSX.Element {
  const [page, setPage] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(''),
    [offset, setOffset] = useState(0)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  async function load(next = 0): Promise<void> {
    const current = ++generation.current
    setBusy(true)
    setIssue('')
    try {
      const result = await window.collie.projectImport({
        ...scope,
        action: 'content-preview',
        batchId,
        graphId,
        offset: next
      })
      if (current !== generation.current) return
      if (!result.ok) setIssue(result.error.message)
      else if (result.value.type === 'content-preview') {
        setPage(result.value)
        setOffset(next)
      } else setIssue('The source and note preview could not be read.')
    } catch {
      if (current === generation.current)
        setIssue('The protected preview could not be read. Try again when storage is available.')
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  return (
    <section className={styles.preview} aria-label="Source and note destinations">
      <h3>Sources and notes</h3>
      <p>
        Preview possible destinations and their original context before ChatGPT analysis and final
        review.
      </p>
      <AppButton
        variant="default"
        disabled={disabled || busy}
        onClick={() => {
          void load()
        }}
      >
        Preview sources and notes
      </AppButton>
      {busy ? <p role="status">Preparing local source and note preview…</p> : null}
      {issue ? <p role="alert">{issue}</p> : null}
      {page && !disabled ? (
        <>
          <p>
            {page.counts.chats} candidate chats · {page.counts.sources} source destination groups ·{' '}
            {page.counts.notes} usable notes
          </p>
          <p>
            {page.counts.occurrences} reference occurrences · {page.counts.retained} records without
            a destination · {page.counts.needsReview} unresolved mappings or conflicts
          </p>
          <p>
            Groups are proposals, not new Research records. Existing matches and conflicting
            metadata need your later review. Kept, rejected and search occurrences remain
            independent. Grades, snippets and references are not verified evidence.
          </p>
          <p>
            Sources can retain a message’s file location without creating a visible chat. Notes do
            not implicitly create sources or manuscript links.
          </p>
          <ul className={styles.records}>
            {page.rows.map((row) => (
              <li key={row.recordId}>
                <details>
                  <summary>
                    {row.title} · {row.kind} ·{' '}
                    {row.eligible ? 'candidate destination' : 'retained without destination'}
                  </summary>
                  <p>
                    {files.find((f) => f.id === row.locator.fileId)?.originalName ??
                      row.locator.fileId}{' '}
                    · {row.locator.pointer || '(whole file)'}
                  </p>
                  {row.kind === 'source' ? (
                    <>
                      <p>
                        Original decision: {row.decision ?? 'not supplied'}
                        {row.grade ? ` · Original grade: ${row.grade} (imported annotation)` : ''}
                      </p>
                      {row.group ? (
                        <p>
                          Destination group: {row.group.slice(0, 16)}. Repeated group identifiers
                          share one proposed destination.
                        </p>
                      ) : null}
                      {row.metadata ? (
                        <dl>
                          <dt>Work type</dt>
                          <dd>{row.metadata.type}</dd>
                          <dt>Author</dt>
                          <dd>
                            {row.metadata.author
                              .map((a) => a.literal || `${a.given} ${a.family}`.trim())
                              .join('; ') || 'Not supplied'}
                          </dd>
                          <dt>Publication date</dt>
                          <dd>{row.metadata.issued || 'Not supplied'}</dd>
                          <dt>Identifiers</dt>
                          <dd>
                            {[row.metadata.DOI, row.metadata.ISBN, row.metadata.URL]
                              .filter(Boolean)
                              .join(' · ') || 'Not supplied'}
                          </dd>
                        </dl>
                      ) : (
                        <p>
                          Bibliographic metadata needs review before a destination can be proposed.
                        </p>
                      )}
                      {row.candidates.length ? (
                        <ul>
                          {row.candidates.map((c) => (
                            <li key={c.id}>
                              {c.reason} ·{' '}
                              {c.state === 'trashed'
                                ? 'Removed; will not be restored'
                                : 'Existing source; no metadata changes'}{' '}
                              · {c.id}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No existing candidate match identified.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        Imported note ·{' '}
                        {row.authorship === 'declared-human'
                          ? 'Human authorship declared in the file, unverified'
                          : row.authorship === 'declared-ai'
                            ? 'AI authorship declared in the file'
                            : 'Authorship unspecified; not assumed to be human'}
                      </p>
                      {row.labels.length ? (
                        <p>
                          Proposed labels:{' '}
                          {row.labels.map((l) => `${l.kind}: ${l.name}`).join(' · ')}
                        </p>
                      ) : null}
                      <pre className={styles.original}>{row.preview}</pre>
                      <p>
                        {row.preview.length} of {row.textUnits} original text units shown. Open the
                        original record to read further slices.
                      </p>
                    </>
                  )}
                  <ul>
                    {row.losses.map((loss, i) => (
                      <li key={i}>{loss}</li>
                    ))}
                  </ul>
                  <div className={styles.actions}>
                    <AppButton
                      variant="subtle"
                      disabled={busy || disabled}
                      onClick={() => onRecord(row.recordId)}
                    >
                      Open original record
                    </AppButton>
                    {row.originatingRecordId ? (
                      <AppButton
                        variant="subtle"
                        disabled={busy || disabled}
                        onClick={() => onRecord(row.originatingRecordId!)}
                      >
                        Open originating message
                      </AppButton>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <AppButton
              variant="subtle"
              disabled={disabled || busy || offset === 0}
              onClick={() => {
                void load()
              }}
            >
              First page
            </AppButton>
            {page.nextOffset !== null ? (
              <AppButton
                variant="default"
                disabled={disabled || busy}
                onClick={() => {
                  void load(page.nextOffset!)
                }}
              >
                Next page
              </AppButton>
            ) : null}
          </div>
          <p>No accepted sources or notes have been created by this preview.</p>
        </>
      ) : null}
    </section>
  )
}
