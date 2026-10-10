import { ImportContentPreview } from './ImportContentPreview'
import { ImportTranscriptPreview } from './ImportTranscriptPreview'
import { useEffect, useRef, useState } from 'react'
import { AppButton, SelectField } from '../../components/ui/Controls'
import type { ImportFile } from '../../../../shared/project-import'
import type { OpenInput } from '../../../../shared/projects'
import {
  graphKinds,
  type GraphValue,
  type GraphReadRequest,
  type GraphRecord
} from '../../../../shared/import-graph'
import styles from './ImportProvider.module.css'

type Page = Extract<GraphValue, { type: 'graph' }>
type Slice = Extract<GraphValue, { type: 'graph-text' }>
/** Read-only presentation of protected candidates; no draft, mutation or provider authority. */
export function ImportGraphPreview({
  scope,
  batchId,
  graphId,
  files,
  disabled
}: {
  scope: OpenInput
  batchId: string
  graphId: string
  files: ImportFile[]
  disabled: boolean
}): React.JSX.Element {
  const [page, setPage] = useState<Page | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(''),
    [slice, setSlice] = useState<Slice | null>(null)
  const [view, setView] = useState<'records' | 'relations'>('records'),
    [filter, setFilter] = useState<GraphReadRequest['filter']>('all'),
    [offset, setOffset] = useState(0)
  const [transcript, setTranscript] = useState<string | null>(null)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  async function load(
    nextOffset = 0,
    nextView = view,
    nextFilter = filter,
    recordId: string | null = null
  ): Promise<void> {
    const current = ++generation.current
    setBusy(true)
    setIssue('')
    setSlice(null)
    setTranscript(null)
    try {
      const result = await window.collie.projectImport({
        ...scope,
        action: 'graph-read',
        batchId,
        graphId,
        view: nextView,
        filter: nextFilter,
        offset: nextOffset,
        recordId
      })
      if (generation.current !== current) return
      if (!result.ok) {
        setIssue(result.error.message)
        return
      }
      if (result.value.type !== 'graph') {
        setIssue('The local preview could not be read.')
        return
      }
      setPage(result.value)
      setView(nextView)
      setFilter(nextFilter)
      setOffset(nextOffset)
    } catch {
      if (generation.current === current)
        setIssue('The protected preview could not be read. Try again when storage is available.')
    } finally {
      if (generation.current === current) setBusy(false)
    }
  }
  async function text(r: GraphRecord, textId: string, offset = 0): Promise<void> {
    const current = ++generation.current
    setBusy(true)
    setIssue('')
    try {
      const result = await window.collie.projectImport({
        ...scope,
        action: 'graph-text',
        batchId,
        graphId,
        recordId: r.id,
        textId,
        offset
      })
      if (generation.current !== current) return
      if (!result.ok) setIssue(result.error.message)
      else if (result.value.type === 'graph-text') setSlice(result.value)
      else setIssue('The original text slice could not be read.')
    } catch {
      if (generation.current === current)
        setIssue('The protected preview could not be read. Try again when storage is available.')
    } finally {
      if (generation.current === current) setBusy(false)
    }
  }
  return (
    <section className={styles.preview} aria-label="Local import preview">
      <h2>Local inventory</h2>
      <ImportContentPreview
        key={`${scope.projectId}:${scope.workspaceId}:${batchId}:${graphId}:${disabled}`}
        scope={scope}
        batchId={batchId}
        graphId={graphId}
        files={files}
        disabled={disabled}
        onRecord={(id) => {
          void load(0, 'records', 'all', id)
        }}
      />
      {disabled ? (
        <p>Save the current choices and inspect again to refresh this inventory.</p>
      ) : null}
      <p>Candidate records only. Local inspection has not analyzed or imported this content.</p>
      <AppButton
        variant="default"
        disabled={disabled || busy}
        onClick={() => {
          void load()
        }}
      >
        View local preview
      </AppButton>
      {busy ? <p role="status">Reading protected preview…</p> : null}
      {issue ? <p role="alert">{issue}</p> : null}
      {page ? (
        <>
          <p>
            {page.graph.files.length} files · {page.graph.conversations} distinct conversation
            identities · {page.graph.messages} distinct candidate messages on selected/observed
            paths · {page.graph.sources} reference occurrences · {page.graph.notes} note records
          </p>
          <p>
            {page.graph.excluded} excluded/unsupported records · {page.graph.unresolved} records
            needing interpretation · {page.graph.fragments} planned text fragments. Raw and curated
            occurrences remain separate variants.
          </p>
          <details>
            <summary>File coverage</summary>
            <ul>
              {page.graph.files.map((file) => (
                <li key={file.fileId}>
                  {files.find((f) => f.id === file.fileId)?.originalName ?? file.fileId} ·{' '}
                  {file.status} · {file.reader} · {file.records} records
                  {file.bom ? ' · UTF-8 BOM retained' : ''}
                  {file.issues.map((i) => (
                    <p key={i}>{i}</p>
                  ))}
                </li>
              ))}
            </ul>
          </details>
          <div className={styles.actions}>
            <AppButton
              variant={view === 'records' ? 'default' : 'subtle'}
              disabled={busy || disabled}
              onClick={() => {
                void load(0, 'records', filter)
              }}
            >
              Records
            </AppButton>
            <AppButton
              variant={view === 'relations' ? 'default' : 'subtle'}
              disabled={busy || disabled}
              onClick={() => {
                void load(0, 'relations', 'all')
              }}
            >
              Relationships
            </AppButton>
          </div>
          {view === 'records' ? (
            <SelectField
              label="Record kind"
              value={filter}
              disabled={busy || disabled}
              data={['all', ...graphKinds].map((kind) => ({
                value: kind,
                label: kind === 'source' ? 'Reference occurrences' : kind
              }))}
              onChange={(e) => {
                void load(0, 'records', e.currentTarget.value as GraphReadRequest['filter'])
              }}
            />
          ) : null}
          <p>
            {page.total
              ? `Showing ${offset + 1}–${offset + page.records.length + page.relations.length} of ${page.total}`
              : 'No matching records.'}
          </p>
          <ul className={styles.records}>
            {page.records.map((r) => (
              <li key={r.id}>
                <details>
                  <summary>
                    {r.label} · {r.disposition}
                    {r.path !== 'none' ? ` · ${r.path}` : ''}
                  </summary>
                  <p>
                    {r.kind} ·{' '}
                    {r.eligible
                      ? 'Candidate for later scoped analysis'
                      : 'Excluded from analysis by current scope/interpretation'}{' '}
                    · origin {r.originNamespace}
                  </p>
                  <p>
                    Record {r.id}
                    <br />
                    Identity group {r.identityId}
                    <br />
                    Conversation {r.externalConversationId ?? 'unresolved / not applicable'}
                    <br />
                    Message/external ID {r.externalId ?? 'not supplied'}
                    {r.nodeId ? (
                      <>
                        <br />
                        Mapping node {r.nodeId}
                      </>
                    ) : null}
                  </p>
                  <p>
                    Source:{' '}
                    {files.find((f) => f.id === r.locator.fileId)?.originalName ?? r.locator.fileId}{' '}
                    · JSON pointer {r.locator.pointer || '(root / whole text field)'}
                  </p>
                  {r.kind === 'conversation' ? (
                    <AppButton
                      variant="default"
                      disabled={busy || disabled}
                      onClick={() => setTranscript(r.id)}
                    >
                      Preview ordered transcript
                    </AppButton>
                  ) : null}
                  {transcript === r.id ? (
                    <ImportTranscriptPreview
                      key={transcript}
                      scope={scope}
                      batchId={batchId}
                      graphId={graphId}
                      recordId={r.id}
                      files={files}
                      disabled={disabled}
                      onClose={() => setTranscript(null)}
                    />
                  ) : null}
                  {r.issues.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                  {r.facts.length ? (
                    <dl>
                      {r.facts.map((f, i) => (
                        <div key={i}>
                          <dt>{f.name}</dt>
                          <dd>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {r.unknownFields.length ? (
                    <p>Other original fields retained: {r.unknownFields.join(', ')}</p>
                  ) : null}
                  {r.texts.map((t, i) => (
                    <div key={t.id}>
                      <AppButton
                        variant="subtle"
                        disabled={busy || disabled}
                        onClick={() => {
                          void text(r, t.id)
                        }}
                      >
                        Read text part {i + 1}
                      </AppButton>
                      <span>
                        {t.units.toLocaleString()} UTF-16 units · {t.fragments.length} fragments ·
                        exact span {t.start}–{t.end}
                      </span>
                      {slice?.recordId === r.id && slice.textId === t.id ? (
                        <>
                          <pre className={styles.original}>{slice.text}</pre>
                          <p>
                            Original text slice {slice.offset}–{slice.offset + slice.text.length} of{' '}
                            {slice.total} units; other text is retained.
                          </p>
                          <div className={styles.actions}>
                            <AppButton
                              variant="subtle"
                              disabled={busy || disabled || slice.offset === 0}
                              onClick={() => {
                                void text(r, t.id)
                              }}
                            >
                              Start of text
                            </AppButton>
                            {slice.nextOffset !== null ? (
                              <AppButton
                                variant="default"
                                disabled={busy || disabled}
                                onClick={() => {
                                  void text(r, t.id, slice.nextOffset!)
                                }}
                              >
                                Next text slice
                              </AppButton>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))}
                  {r.disposition === 'internal' ? (
                    <p>
                      Internal reasoning stays in the retained original; its body is excluded from
                      this preview and analysis.
                    </p>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
          <ul className={styles.records}>
            {page.relations.map((r) => (
              <li key={r.id}>
                <details>
                  <summary>
                    {r.kind}
                    {r.decision ? ` · ${r.decision}` : ''}
                    {r.grade ? ` · grade ${r.grade} (imported annotation)` : ''}
                  </summary>
                  <p>{r.issue}</p>
                  <p>
                    Evidence:{' '}
                    {files.find((f) => f.id === r.evidence.fileId)?.originalName ??
                      r.evidence.fileId}{' '}
                    · {r.evidence.pointer || '(root)'}
                  </p>
                  <div className={styles.actions}>
                    <AppButton
                      variant="subtle"
                      disabled={busy || disabled}
                      onClick={() => {
                        void load(0, 'records', 'all', r.from)
                      }}
                    >
                      Open originating record
                    </AppButton>
                    {r.to ? (
                      <AppButton
                        variant="subtle"
                        disabled={busy || disabled}
                        onClick={() => {
                          void load(0, 'records', 'all', r.to)
                        }}
                      >
                        Open related record
                      </AppButton>
                    ) : (
                      <span>Target unresolved; no relationship invented.</span>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <AppButton
              variant="subtle"
              disabled={busy || disabled || offset === 0}
              onClick={() => {
                void load(0)
              }}
            >
              First page
            </AppButton>
            {page.nextOffset !== null ? (
              <AppButton
                variant="default"
                disabled={busy || disabled}
                onClick={() => {
                  void load(page.nextOffset!)
                }}
              >
                Next page
              </AppButton>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
