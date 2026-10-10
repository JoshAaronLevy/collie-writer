import { ImportedMessageLinks } from './ImportedMessageLinks'
import { useEffect, useRef, useState } from 'react'
import { TextInput } from '@mantine/core'
import { AppButton } from '../../components/ui/Controls'
import type { ImportFile } from '../../../../shared/project-import'
import type { OpenInput } from '../../../../shared/projects'
import type {
  TranscriptValue,
  TranscriptKey,
  TranscriptCursor,
  TranscriptInput,
  TranscriptFindRequest
} from '../../../../shared/conversation-transcript'
import styles from './ImportProvider.module.css'
type Page = Extract<TranscriptValue, { type: 'transcript' }>
type Slice = Extract<TranscriptValue, { type: 'transcript-text' }>
type Matches = Extract<TranscriptValue, { type: 'transcript-matches' }>
export function ImportTranscriptPreview({
  scope,
  batchId,
  graphId,
  recordId,
  files,
  accepted,
  initialTarget,
  onSource,
  disabled,
  onClose
}: {
  scope: OpenInput
  batchId: string
  graphId: string
  recordId: string
  files: ImportFile[]
  accepted?: { conversationId: string; revisionId: string }
  initialTarget?: TranscriptKey
  onSource?: (id: string) => void
  disabled: boolean
  onClose: () => void
}): React.JSX.Element {
  const [page, setPage] = useState<Page | null>(null),
    [slice, setSlice] = useState<Slice | null>(null),
    [matches, setMatches] = useState<Matches | null>(null),
    [query, setQuery] = useState(''),
    [issue, setIssue] = useState(''),
    [busy, setBusy] = useState(false)
  const generation = useRef(0),
    composing = useRef(false)
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  const source = accepted
    ? { kind: 'accepted' as const, ...accepted }
    : { kind: 'staged' as const, batchId, graphId, recordId }
  async function request(input: TranscriptInput): Promise<void> {
    if (disabled || busy) return
    const current = ++generation.current
    setBusy(true)
    setIssue('')
    try {
      const result = await (accepted
        ? window.collie.conversation(input)
        : window.collie.projectImport(input))
      if (current !== generation.current) return
      if (!result.ok) {
        setIssue(result.error.message)
        return
      }
      if (result.value.type === 'transcript') {
        setPage(result.value)
        setSlice(null)
      } else if (result.value.type === 'transcript-text') setSlice(result.value)
      else if (result.value.type === 'transcript-matches') setMatches(result.value)
      else setIssue('The protected transcript could not be read.')
    } catch {
      if (current === generation.current)
        setIssue('The protected transcript could not be read. Try again.')
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  function load(
    cursor: TranscriptCursor | null = null,
    direction: 'forward' | 'backward' = 'forward',
    target: TranscriptKey | null = initialTarget ?? null
  ): void {
    void request({ ...scope, action: 'transcript-read', source, cursor, direction, target })
  }
  function read(target: TranscriptKey, offset = 0): void {
    void request({ ...scope, action: 'transcript-text', source, target, offset })
  }
  function find(after: TranscriptFindRequest['after'] = null): void {
    if (query.trim() && !composing.current)
      void request({ ...scope, action: 'transcript-find', source, query, after })
  }
  const locked = busy || disabled
  return (
    <section
      className={styles.preview}
      aria-label={accepted ? 'Imported transcript' : 'Staged transcript'}
    >
      <h3 tabIndex={-1}>
        {accepted ? 'Imported transcript' : 'Staged transcript'}
        {page ? ` · ${page.title}` : ''}
      </h3>
      <p>
        Original ordered messages from this conversation representation. Other raw/curated variants
        remain linked.{' '}
        {accepted
          ? 'This is protected imported history; opening it sends no request.'
          : 'This preview has no live request status and has not imported a chat.'}
      </p>
      <div className={styles.actions}>
        <AppButton variant="default" disabled={locked} onClick={() => load()}>
          Read transcript
        </AppButton>
        <AppButton variant="subtle" onClick={onClose}>
          Close transcript preview
        </AppButton>
      </div>
      {busy ? <p role="status">Reading protected transcript…</p> : null}
      {issue ? <p role="alert">{issue}</p> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          find()
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
      >
        <TextInput
          label="Find in visible transcript"
          value={query}
          maxLength={160}
          disabled={disabled}
          onChange={(e) => {
            generation.current++
            setBusy(false)
            setQuery(e.currentTarget.value)
            setMatches(null)
          }}
        />
        <AppButton variant="subtle" type="submit" disabled={locked || !query.trim()}>
          Find
        </AppButton>
      </form>
      {matches ? (
        <div>
          <p role="status">
            {matches.items.length} matching messages in this batch.
            {matches.next ? ' Continue to search the remaining text.' : ' Search reached the end.'}
          </p>
          <ul className={styles.records}>
            {matches.items.map((m) => (
              <li key={m.key.messageId}>
                <AppButton
                  variant="subtle"
                  disabled={locked}
                  onClick={() => load(null, 'forward', m.key)}
                >
                  {m.role}: {m.preview}
                </AppButton>
                <span>Original display offset {m.offset}</span>
              </li>
            ))}
          </ul>
          {matches.next ? (
            <AppButton variant="subtle" disabled={locked} onClick={() => find(matches.next)}>
              Continue search
            </AppButton>
          ) : null}
        </div>
      ) : null}
      {page ? (
        <>
          <p>
            {page.total} ordered messages · {page.omittedInternal} internal records excluded from
            this transcript. Repeated roles are separate messages; missing historical dates stay
            unknown.
          </p>
          <ol className={styles.records}>
            {page.entries.map((entry) => (
              <li key={entry.key.messageId}>
                <article>
                  <h4>
                    {entry.key.sequence + 1}. {entry.originalRole ?? entry.role} ·{' '}
                    {entry.visibility === 'excluded'
                      ? 'excluded external material'
                      : entry.external
                        ? 'imported message'
                        : `Collie message · ${entry.native?.state ?? ''}`}
                  </h4>
                  <p>
                    Historical time: {entry.historicalTime.raw ?? 'not supplied'}
                    {entry.historicalTime.zoneKnown === false ? ' · time zone unknown' : ''}
                  </p>
                  <pre className={styles.original}>{entry.text}</pre>
                  {entry.text.length < entry.textUnits ? (
                    <p>
                      Showing the first {entry.text.length} of {entry.textUnits} units; read the
                      remaining original text below.
                    </p>
                  ) : null}
                  <AppButton
                    variant="subtle"
                    disabled={locked || entry.textUnits === 0}
                    onClick={() => read(entry.key)}
                  >
                    Read original text
                  </AppButton>
                  {slice?.target.messageId === entry.key.messageId ? (
                    <div>
                      <pre className={styles.original}>{slice.text}</pre>
                      <p>
                        Original text {slice.offset}–{slice.offset + slice.text.length} of{' '}
                        {slice.total} units. Display text preserves original characters.
                      </p>
                      <div className={styles.actions}>
                        <AppButton
                          variant="subtle"
                          disabled={locked || slice.offset === 0}
                          onClick={() => read(entry.key)}
                        >
                          Start of text
                        </AppButton>
                        {slice.nextOffset !== null ? (
                          <AppButton
                            variant="subtle"
                            disabled={locked}
                            onClick={() => read(entry.key, slice.nextOffset!)}
                          >
                            Next text slice
                          </AppButton>
                        ) : null}
                      </div>
                      <details>
                        <summary>Original text mapping</summary>
                        <ul>
                          {slice.mapping.map((m, i) => (
                            <li key={i}>
                              Display {m.from}–{m.to} → text {m.textId ?? 'native'} at{' '}
                              {m.originalFrom}–{m.originalTo}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  ) : null}
                  {entry.external && onSource ? (
                    <ImportedMessageLinks
                      key={entry.key.messageId}
                      scope={scope}
                      messageId={entry.key.messageId}
                      onSource={onSource}
                    />
                  ) : null}
                  {entry.external ? (
                    <details>
                      <summary>Origin and variants</summary>
                      <p>
                        {files.find((f) => f.id === entry.external!.record.locator.fileId)
                          ?.originalName ?? 'Retained original'}{' '}
                        · {entry.external.record.locator.pointer}
                      </p>
                      <p>
                        External message {entry.external.record.externalId ?? 'not supplied'} ·
                        mapping node {entry.external.record.nodeId ?? 'not supplied'} ·{' '}
                        {entry.external.record.path}
                      </p>
                      <p>
                        {entry.external.variants.length} retained representation(s). Candidate graph
                        record IDs: {entry.external.variants.join(', ')}
                      </p>
                      {entry.external.record.issues.map((i) => (
                        <p key={i}>{i}</p>
                      ))}
                      <dl>
                        {entry.external.record.facts.map((f, i) => (
                          <div key={i}>
                            <dt>{f.name}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
          <div className={styles.actions}>
            <AppButton
              variant="subtle"
              disabled={locked || !page.before}
              onClick={() => load(page.before, 'backward')}
            >
              Earlier messages
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={locked || !page.after}
              onClick={() => load(page.after)}
            >
              Later messages
            </AppButton>
          </div>
        </>
      ) : null}
    </section>
  )
}
