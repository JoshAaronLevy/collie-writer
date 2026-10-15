import PresentationBoundary from '../../components/PresentationBoundary'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton, TextareaField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { useSourceInspection, type SourceInspectionProps } from './useSourceInspection'
import './SourceInspector.css'

export default function SourceInspector(
  props: SourceInspectionProps & { close: () => void }
): React.JSX.Element {
  const { sourceId, disabled, readOnly, close } = props
  const {
    session,
    research,
    sourceTitle,
    view,
    attachments,
    selected,
    active,
    loadedValue,
    loadedVersionId,
    page,
    pageIndex,
    setPageIndex,
    pageText,
    busy,
    extracting,
    progress,
    message,
    error,
    setError,
    reimportBytes,
    pendingExcerptValue,
    reimportPendingValue,
    manualQuote,
    setManualQuote,
    manualLabel,
    setManualLabel,
    correctionFor,
    setCorrectionFor,
    correctionQuote,
    setCorrectionQuote,
    correctionLabel,
    setCorrectionLabel,
    excerptNote,
    setExcerptNote,
    excerptQuery,
    setExcerptQuery,
    excerptId,
    setExcerptId,
    chosenExcerpt,
    excerptLinks,
    showTranscription,
    setShowTranscription,
    loading,
    draftPending,
    draftBinding,
    panel,
    selection,
    canvas,
    setReadRevision,
    versionName,
    retryExcerpt,
    reimport,
    ensure,
    openVersion,
    chooseActive,
    allowInspectionTargetChange,
    cancelExtraction,
    extract,
    excerpt,
    transcribe,
    correct,
    navigateExcerpt
  } = useSourceInspection(props)
  return (
    <section
      tabIndex={-1}
      {...draftBinding}
      ref={panel}
      className="source-inspector"
      aria-label="Source original and excerpts"
    >
      <ResearchHeader title={sourceTitle}>
        Read the original, keep exact excerpts, and return to your argument.
      </ResearchHeader>
      <div className="research-actions">
        <AppButton variant="subtle" onClick={close}>
          Return to context
        </AppButton>
        <AppButton
          variant="subtle"
          onClick={() => session.research({ kind: 'sources', sourceId, page: 'usage' })}
        >
          Where this source is used
        </AppButton>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {progress ? <p role="status">{progress}</p> : null}
      {reimportBytes ? (
        <p role="status">
          Copying new original:{' '}
          {Math.round((100 * reimportBytes.current) / Math.max(1, reimportBytes.total))}%
        </p>
      ) : null}
      {pendingExcerptValue ? (
        <AppButton
          disabled={busy || extracting || disabled || readOnly}
          onClick={() => void retryExcerpt()}
        >
          Retry pending excerpt
        </AppButton>
      ) : null}
      {reimportPendingValue ? (
        <AppButton
          disabled={busy || extracting || disabled || readOnly}
          onClick={() => void reimport(true)}
        >
          Retry original copy
        </AppButton>
      ) : null}
      {draftPending ? (
        <p role="status">
          Save or discard your form edits before leaving.{' '}
          <AppButton
            variant="subtle"
            disabled={loading}
            onClick={() => {
              setExcerptNote('')
              setManualQuote('')
              setManualLabel('Manual transcription')
              setCorrectionFor(null)
              setCorrectionQuote('')
              setCorrectionLabel('Human correction')
              setShowTranscription(false)
            }}
          >
            Discard form edits
          </AppButton>
        </p>
      ) : null}
      {!view ? (
        <EmptyState title="Original reader">
          <AppButton
            variant="default"
            disabled={loading}
            onClick={() => setReadRevision((value) => value + 1)}
          >
            Reload original
          </AppButton>
        </EmptyState>
      ) : null}
      <details className="research-disclosure">
        <summary>Originals and version history ({view?.versions.length ?? 0})</summary>
        <p>Originals stay local. Reimporting retains earlier versions and their excerpts.</p>
        <AppButton variant="default" disabled={loading || readOnly} onClick={() => void reimport()}>
          Attach newer original…
        </AppButton>
        {attachments
          .filter(
            (item) =>
              ['application/pdf', 'text/plain'].includes(item.mediaType) &&
              !view?.versions.some((version) => version.attachmentId === item.id)
          )
          .map((item) => (
            <p key={item.id}>
              <AppButton variant="light" disabled={loading} onClick={() => void ensure(item.id)}>
                Read {item.name}
              </AppButton>
            </p>
          ))}
        <ul className="inspector-version-list">
          {view?.versions.map((version) => (
            <li key={version.id}>
              <strong>{versionName(version.id)}</strong>
              <p>
                {view.activeVersionId === version.id ? 'Active version · ' : ''}
                {version.status === 'partial' || version.status === 'failed'
                  ? 'Some text is unavailable.'
                  : ''}
              </p>
              <div className="research-actions">
                <AppButton
                  variant="default"
                  disabled={loading}
                  onClick={() => {
                    if (allowInspectionTargetChange()) {
                      setExcerptId(null)
                      void openVersion(version)
                    }
                  }}
                >
                  Read original
                </AppButton>
                {view.activeVersionId !== version.id ? (
                  <AppButton
                    variant="subtle"
                    disabled={loading || readOnly || draftPending}
                    onClick={() => void chooseActive(version)}
                  >
                    Use as active version
                  </AppButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </details>
      <ResearchLayout
        sidebar={
          <>
            <h2>Retained excerpts</h2>
            <TextInput
              label="Find an excerpt"
              type="search"
              value={excerptQuery}
              onChange={(event) => setExcerptQuery(event.currentTarget.value)}
            />
            <ul className="research-item-list">
              {view?.excerpts
                .filter((item) =>
                  `${item.quote} ${item.label}`
                    .toLocaleLowerCase()
                    .includes(excerptQuery.toLocaleLowerCase())
                )
                .map((item) => (
                  <li key={item.id}>
                    <AppButton
                      variant="subtle"
                      className="research-item-button"
                      classNames={{ label: 'research-item-label', inner: 'research-item-inner' }}
                      aria-current={excerptId === item.id ? 'true' : undefined}
                      disabled={loading}
                      onClick={() => void navigateExcerpt(item)}
                    >
                      <span>{item.quote.slice(0, 140)}</span>
                      <small>
                        {item.kind} ·{' '}
                        {item.pageIndex === 0
                          ? 'plain text'
                          : item.pageIndex === null
                            ? 'no page anchor'
                            : `PDF page ${item.pageIndex}`}{' '}
                        ·{' '}
                        {view.activeVersionId === item.versionId
                          ? 'active original'
                          : 'earlier original'}
                      </small>
                    </AppButton>
                  </li>
                ))}
            </ul>
            {!view?.excerpts.length ? (
              <p>Read an original, then select a passage to save an excerpt.</p>
            ) : null}
          </>
        }
      >
        <PresentationBoundary
          label="Excerpt details"
          render={() => (
            <>
              {chosenExcerpt ? (
                <section className="inspector-excerpt" aria-label="Selected exact excerpt">
                  <h2>{chosenExcerpt.label}</h2>
                  <blockquote className="research-quote">{chosenExcerpt.quote}</blockquote>
                  <p>
                    {chosenExcerpt.kind} · {versionName(chosenExcerpt.versionId)} ·{' '}
                    {chosenExcerpt.pageIndex === 0
                      ? 'plain text'
                      : chosenExcerpt.pageIndex === null
                        ? 'page unavailable'
                        : `PDF page ${chosenExcerpt.pageIndex}${chosenExcerpt.pageLabel ? ` (label ${chosenExcerpt.pageLabel})` : ''}`}
                  </p>
                  {view?.activeVersionId !== chosenExcerpt.versionId ? (
                    <p role="status">
                      This excerpt belongs to an earlier original. Its quote and original anchor
                      have been retained.
                    </p>
                  ) : null}
                  <div className="research-actions">
                    <AppButton
                      disabled={loading || readOnly || draftPending}
                      onClick={() =>
                        void session.navigate({
                          kind: 'workspace',
                          scope: {
                            projectId: props.project.projectId,
                            workspaceId: props.project.workspaceId
                          },
                          view: 'plan',
                          material: { kind: 'excerpt', id: chosenExcerpt.id }
                        })
                      }
                    >
                      Use excerpt
                    </AppButton>
                    <AppButton
                      variant="light"
                      disabled={loading || readOnly}
                      onClick={() => {
                        if (!allowInspectionTargetChange()) return
                        setCorrectionFor(chosenExcerpt)
                        setCorrectionQuote(chosenExcerpt.quote)
                        setCorrectionLabel('Human correction')
                      }}
                    >
                      Correct as a new record
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={loading || draftPending}
                      onClick={() => setExcerptId(null)}
                    >
                      Hide excerpt detail
                    </AppButton>
                  </div>
                  <details className="research-disclosure">
                    <summary>Exact context and provenance</summary>
                    <p className="inspector-context">
                      {chosenExcerpt.contextBefore}
                      <strong>{chosenExcerpt.quote}</strong>
                      {chosenExcerpt.contextAfter}
                    </p>
                    <p>
                      {chosenExcerpt.startOffset !== null
                        ? `Saved text offsets ${chosenExcerpt.startOffset}–${chosenExcerpt.endOffset}.`
                        : 'Human-authored text without extracted offsets.'}
                    </p>
                    <p>
                      Original SHA-256:{' '}
                      <code>
                        {view?.versions.find((item) => item.id === chosenExcerpt.versionId)
                          ?.sha256 ?? 'unavailable'}
                      </code>
                    </p>
                    {chosenExcerpt.supersedesId ? (
                      <AppButton
                        variant="subtle"
                        disabled={loading}
                        onClick={() => {
                          const original = view?.excerpts.find(
                            (item) => item.id === chosenExcerpt.supersedesId
                          )
                          if (original) void navigateExcerpt(original)
                          else setError('The earlier excerpt is unavailable.')
                        }}
                      >
                        Open the unchanged earlier excerpt
                      </AppButton>
                    ) : null}
                  </details>
                  {excerptLinks.length ? (
                    <div>
                      <h3>Used as evidence</h3>
                      {excerptLinks.map((link) => (
                        <AppButton
                          key={link.id}
                          variant="subtle"
                          onClick={() =>
                            session.research({
                              kind: 'evidence',
                              item: { kind: 'link', id: link.id }
                            })
                          }
                        >
                          {link.role.replace('_', ' ')} ·{' '}
                          {link.claimId
                            ? (research.view?.claims.find((item) => item.id === link.claimId)
                                ?.text ?? 'Missing claim')
                            : (research.view?.sections.find((item) => item.id === link.documentId)
                                ?.title ?? 'Missing section')}{' '}
                          · {link.state}
                        </AppButton>
                      ))}
                    </div>
                  ) : (
                    <p>No manual evidence links use this excerpt yet.</p>
                  )}
                </section>
              ) : null}
              {correctionFor ? (
                <form
                  className="research-form inspector-transcription"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void correct()
                  }}
                >
                  <h3>Correction to retained excerpt</h3>
                  <p>The original remains unchanged.</p>
                  <TextareaField
                    label="Corrected passage"
                    disabled={readOnly || loading}
                    value={correctionQuote}
                    maxLength={10000}
                    onChange={(event) => setCorrectionQuote(event.currentTarget.value)}
                    rows={4}
                  />
                  <TextInput
                    label="Required correction label"
                    disabled={readOnly || loading}
                    value={correctionLabel}
                    maxLength={200}
                    onChange={(event) => setCorrectionLabel(event.currentTarget.value)}
                  />
                  <div className="research-actions">
                    <AppButton
                      type="submit"
                      disabled={
                        loading || readOnly || !correctionQuote.trim() || !correctionLabel.trim()
                      }
                    >
                      Save correction
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={loading}
                      onClick={() => setCorrectionFor(null)}
                    >
                      Cancel correction
                    </AppButton>
                  </div>
                </form>
              ) : null}
            </>
          )}
        />
        {selected ? (
          <section aria-label="Original reader">
            <h2>{versionName(selected.id)}</h2>
            {active && active.id !== selected.id ? (
              <p role="status">
                Viewing an earlier original (
                {active.sha256 === selected.sha256 ? 'same file bytes' : 'different file bytes'}{' '}
                from the active version).
              </p>
            ) : null}
            <details className="research-disclosure">
              <summary>Version metadata and extraction details</summary>
              <p>
                Title at import: {selected.metadata.title}. Active title at import:{' '}
                {active?.metadata.title ?? 'none'}.
              </p>
              <p>
                PDF metadata: {selected.documentTitle || 'no title'};{' '}
                {selected.documentAuthor || 'no author'}. Active PDF:{' '}
                {active?.documentTitle || 'no title'}; {active?.documentAuthor || 'no author'}.
              </p>
              <p>
                Original SHA-256: <code>{selected.sha256}</code>. Extractor:{' '}
                {selected.extractorVersion ?? 'not run'}.
              </p>
              <p>
                PDF pages are inert images. Extracted text may be incomplete or out of reading
                order. Scanned pages need manual transcription; OCR is not included.
              </p>
            </details>
            {loadedVersionId === selected.id ? (
              <>
                {extracting ? (
                  <AppButton variant="default" onClick={cancelExtraction}>
                    Stop preparing text
                  </AppButton>
                ) : ['partial', 'failed', 'extracting'].includes(selected.status) ? (
                  <AppButton variant="default" disabled={loading} onClick={() => void extract()}>
                    Continue preparing text
                  </AppButton>
                ) : null}
                {loadedValue?.pdf ? (
                  <div className="research-actions">
                    <AppButton
                      variant="default"
                      disabled={busy || disabled || draftPending || pageIndex <= 1}
                      onClick={() => {
                        setExcerptId(null)
                        setPageIndex((value) => value - 1)
                      }}
                    >
                      Previous page
                    </AppButton>
                    <span>
                      PDF page {pageIndex} of {loadedValue.pdf.numPages}
                      {loadedValue.labels?.[pageIndex - 1]
                        ? ` · label ${loadedValue.labels[pageIndex - 1]}`
                        : ''}
                    </span>
                    <AppButton
                      variant="default"
                      disabled={
                        busy || disabled || draftPending || pageIndex >= loadedValue.pdf.numPages
                      }
                      onClick={() => {
                        setExcerptId(null)
                        setPageIndex((value) => value + 1)
                      }}
                    >
                      Next page
                    </AppButton>
                  </div>
                ) : (
                  <p>Plain text original; no PDF page number.</p>
                )}
                {loadedValue?.pdf ? (
                  <canvas
                    ref={canvas}
                    className="inspected-pdf-canvas"
                    role="img"
                    aria-label={`Rendered PDF page ${pageIndex}`}
                  />
                ) : null}
                <Textarea label="Source text" ref={selection} value={pageText} readOnly rows={9} />
                {page?.error ? <p role="alert">{page.error}</p> : null}
                {page?.state === 'failed' ? (
                  <p role="alert">
                    This page could not yield reliable text. The original is retained.
                  </p>
                ) : !pageText ? (
                  <p>
                    {extracting
                      ? 'Preparing source text…'
                      : 'No selectable text on this page. You can transcribe a passage manually; OCR is not included.'}
                  </p>
                ) : (
                  <div className="research-form">
                    <TextInput
                      label="Note (optional)"
                      maxLength={200}
                      value={excerptNote}
                      disabled={loading || readOnly}
                      onChange={(event) => setExcerptNote(event.currentTarget.value)}
                    />
                    <AppButton disabled={loading || readOnly} onClick={() => void excerpt()}>
                      Save excerpt
                    </AppButton>
                  </div>
                )}
                <div className="research-actions">
                  <AppButton
                    variant="subtle"
                    disabled={loading || readOnly}
                    aria-expanded={showTranscription}
                    onClick={() => setShowTranscription(true)}
                  >
                    Write a manual transcription
                  </AppButton>
                </div>
                <form
                  className="research-form inspector-transcription"
                  hidden={!showTranscription}
                  inert={!showTranscription}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void transcribe()
                  }}
                >
                  <TextareaField
                    label="Manual transcription or reading note"
                    disabled={readOnly || loading}
                    value={manualQuote}
                    maxLength={10000}
                    onChange={(event) => setManualQuote(event.currentTarget.value)}
                    rows={4}
                  />
                  <TextInput
                    label="Required transcription label"
                    disabled={readOnly || loading}
                    value={manualLabel}
                    maxLength={200}
                    onChange={(event) => setManualLabel(event.currentTarget.value)}
                  />
                  <div className="research-actions">
                    <AppButton
                      type="submit"
                      disabled={loading || readOnly || !manualQuote.trim() || !manualLabel.trim()}
                    >
                      Save labeled transcription
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={loading}
                      onClick={() => {
                        setManualQuote('')
                        setManualLabel('Manual transcription')
                        setShowTranscription(false)
                      }}
                    >
                      Cancel transcription
                    </AppButton>
                  </div>
                </form>
              </>
            ) : (
              <AppButton
                variant="default"
                disabled={loading}
                onClick={() => void openVersion(selected)}
              >
                Read original
              </AppButton>
            )}
          </section>
        ) : (
          <EmptyState title="Attach an original to start reading">
            Attach a PDF or text file from the source’s Details, or choose a retained original
            above.
          </EmptyState>
        )}
      </ResearchLayout>
    </section>
  )
}
