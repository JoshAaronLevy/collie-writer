import { ImportedOrigins } from '../imports/ImportedOrigins'
import { useProjectImport } from '../imports/importContext'
import { SourceChatHistory } from '../ai/conversations/SourceChatHistory'
import { isEditableKind } from '../../../../shared/outline'
import PresentationBoundary from '../../components/PresentationBoundary'
import { Checkbox, TextInput } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { SourceUsage, UsageSummary } from '../research/SourceUsage'
import {
  SOURCE_TYPES,
  type SourceMetadata,
  type BibliographyFormat
} from '../../../../shared/sources'
import { useSources, type SourcesProps } from './useSources'
import './SourcesPanel.css'

export default function SourcesPanel(
  props: SourcesProps & { onInspect: (sourceId: string) => void }
): React.JSX.Element {
  const { project, disabled, readOnly, onInspect } = props
  const imports = useProjectImport()
  const {
    session,
    conversations,
    page,
    creating,
    query,
    setQuery,
    showRemoved,
    setShowRemoved,
    baseRevisionValue,
    attachmentPendingValue,
    mutationValue,
    pendingValue,
    view,
    selected,
    draft,
    creatorText,
    verified,
    setVerified,
    linked,
    setLinked,
    dirty,
    setDirty,
    busy,
    error,
    message,
    exportFormat,
    setExportFormat,
    exportSelection,
    setExportSelection,
    exportLosses,
    mergeTarget,
    setMergeTarget,
    attachmentProgress,
    current,
    locked,
    fieldsLocked,
    panel,
    draftBinding,
    rows,
    change,
    choose,
    save,
    mutate,
    attach,
    selectSource,
    exportLibrary,
    discard,
    saveCopy,
    retryAttachment,
    retryMutation
  } = useSources(props)
  return (
    <PresentationBoundary
      label="Sources"
      render={() => (
        <section
          ref={panel}
          tabIndex={-1}
          {...draftBinding}
          className="sources-panel"
          aria-label="Sources and bibliography"
        >
          <ResearchHeader title="Sources">
            Keep originals, citation details and research connections together.
          </ResearchHeader>
          {error ? <p role="alert">{error}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          {attachmentPendingValue ? (
            <AppButton disabled={disabled || busy || readOnly} onClick={retryAttachment}>
              Retry original copy
            </AppButton>
          ) : null}
          {mutationValue ? (
            <AppButton disabled={disabled || busy || readOnly} onClick={retryMutation}>
              Retry source action
            </AppButton>
          ) : null}
          <div className="research-actions">
            <AppButton disabled={locked || readOnly || dirty} onClick={() => choose(null)}>
              Add source
            </AppButton>
            <AppButton
              variant="default"
              disabled={locked || readOnly || imports.busy}
              onClick={(event) => imports.open(event.currentTarget, 'sources')}
            >
              Import bibliography…
            </AppButton>
          </div>
          <ResearchLayout
            sidebar={
              <>
                <TextInput
                  label="Find a source"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
                <Checkbox
                  label="Include trashed and merged sources"
                  checked={showRemoved}
                  onChange={(event) => setShowRemoved(event.currentTarget.checked)}
                />
                {!view ? (
                  <p role="status">Loading sources…</p>
                ) : !rows.length ? (
                  <p>
                    {query
                      ? 'No matching sources. Change the search.'
                      : 'No sources in this view. Add a source or import your bibliography.'}
                  </p>
                ) : null}
                <ul className="research-item-list">
                  {rows.map((source) => (
                    <li key={source.id}>
                      <AppButton
                        variant="subtle"
                        className="research-item-button"
                        classNames={{ label: 'research-item-label', inner: 'research-item-inner' }}
                        disabled={locked}
                        aria-current={selected === source.id ? 'true' : undefined}
                        onClick={() => void selectSource(source.id)}
                      >
                        <span>{source.metadata.title}</span>
                        <small>
                          {source.state} ·{' '}
                          {source.verified ? 'Metadata reviewed' : 'Metadata needs review'}
                        </small>
                        <UsageSummary sourceId={source.id} />
                      </AppButton>
                    </li>
                  ))}
                </ul>
              </>
            }
          >
            {current && current.state === 'active' ? (
              <AppButton
                variant="subtle"
                size="compact-sm"
                disabled={
                  locked || dirty || readOnly || conversations.busy || !!conversations.pending
                }
                onClick={() => void conversations.discussSource(current.id, current.metadata.title)}
              >
                Discuss in chat
              </AppButton>
            ) : null}
            {current || creating ? (
              <>
                <h2>{current?.metadata.title || 'New source'}</h2>
                {current ? (
                  <div className="research-actions">
                    {current.attachments.some((file) =>
                      ['application/pdf', 'text/plain'].includes(file.mediaType)
                    ) ? (
                      <AppButton
                        variant="default"
                        disabled={locked}
                        onClick={() => onInspect(current.id)}
                      >
                        Read original
                      </AppButton>
                    ) : null}
                    <AppButton
                      variant="default"
                      disabled={locked || readOnly || current.state !== 'active'}
                      onClick={() => void attach(current.id)}
                    >
                      Attach file…
                    </AppButton>
                  </div>
                ) : null}
                {current?.state !== 'active' && current ? (
                  <p role="status">
                    {current.state === 'merged'
                      ? 'This source was merged; its history is kept.'
                      : 'This source is in Trash.'}
                  </p>
                ) : null}
                {current && baseRevisionValue !== current.revisionId ? (
                  <p role="status">
                    Stored details changed. Reload them or resolve the conflict when saving.
                  </p>
                ) : null}
                <h3>Details</h3>
                <form
                  className="research-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!readOnly) void save()
                  }}
                >
                  <fieldset disabled={readOnly || fieldsLocked}>
                    <SelectField
                      label="Work type"
                      value={draft.type}
                      onChange={(event) =>
                        change({ ...draft, type: event.target.value as SourceMetadata['type'] })
                      }
                    >
                      {SOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type === 'article-journal'
                            ? 'Journal article'
                            : type === 'webpage'
                              ? 'Web page'
                              : type[0].toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </SelectField>
                    <TextInput
                      label="Title"
                      required
                      maxLength={2000}
                      value={draft.title}
                      onChange={(event) => change({ ...draft, title: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Authors or organizations"
                      description="Family, Given; separate authors with semicolons. Enter an organization without a comma."
                      value={creatorText}
                      onChange={(event) => change(draft, event.currentTarget.value)}
                    />
                    <TextInput
                      label="Publication date"
                      description="YYYY, YYYY-MM or YYYY-MM-DD"
                      maxLength={2000}
                      value={draft.issued}
                      onChange={(event) => change({ ...draft, issued: event.currentTarget.value })}
                    />
                    <details className="research-disclosure">
                      <summary>Publication details and identifiers</summary>
                      <div className="source-metadata-fields">
                        {(
                          [
                            ['containerTitle', 'Journal / book title'],
                            ['publisher', 'Publisher'],
                            ['edition', 'Edition'],
                            ['volume', 'Volume'],
                            ['issue', 'Issue'],
                            ['page', 'Pages'],
                            ['DOI', 'DOI'],
                            ['URL', 'URL'],
                            ['ISBN', 'ISBN'],
                            ['ISSN', 'ISSN']
                          ] as const
                        ).map(([field, label]) => (
                          <TextInput
                            key={field}
                            label={label}
                            maxLength={2000}
                            value={draft[field]}
                            onChange={(event) =>
                              change({ ...draft, [field]: event.currentTarget.value })
                            }
                          />
                        ))}
                      </div>
                      <p>
                        DOI and URL are saved identifiers. They do not fetch an article or look up
                        metadata.
                      </p>
                    </details>
                    <Checkbox
                      label="I manually reviewed this metadata"
                      checked={verified}
                      onChange={(event) => {
                        setVerified(event.currentTarget.checked)
                        setDirty(true)
                      }}
                    />
                    <details className="research-disclosure">
                      <summary>Manual section associations ({linked.length})</summary>
                      <p>These links organize research; they do not insert manuscript citations.</p>
                      <div className="research-checklist">
                        {project.documents
                          .filter((item) => isEditableKind(item.kind))
                          .map((item) => (
                            <Checkbox
                              key={item.id}
                              label={`${item.title} · ${item.state}`}
                              checked={linked.includes(item.id)}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked
                                setLinked((old) =>
                                  checked ? [...old, item.id] : old.filter((id) => id !== item.id)
                                )
                                setDirty(true)
                              }}
                            />
                          ))}
                      </div>
                    </details>
                  </fieldset>
                  <div className="research-actions">
                    <AppButton type="submit" disabled={locked || readOnly || !dirty}>
                      {pendingValue ? 'Retry source save' : 'Save source'}
                    </AppButton>
                    {!pendingValue ? (
                      <AppButton variant="default" disabled={locked} onClick={discard}>
                        {current ? 'Cancel edits' : 'Cancel new source'}
                      </AppButton>
                    ) : null}
                  </div>
                </form>
                {current ? (
                  <>
                    <details className="research-disclosure" open={page === 'usage'}>
                      <summary>Usage and context</summary>
                      <SourceUsage sourceId={current.id} />
                    </details>
                    <details className="research-disclosure" open={page === 'files'}>
                      <summary>Original files</summary>
                      {!current.attachments.length ? (
                        <p>No originals attached yet.</p>
                      ) : (
                        <ul className="source-attachments">
                          {current.attachments.map((attachment) => (
                            <li key={attachment.id}>
                              <strong>{attachment.name}</strong> ·{' '}
                              {Math.round(attachment.bytes / 1024).toLocaleString()} KiB ·{' '}
                              {attachment.state}
                              <div className="research-actions">
                                <AppButton
                                  variant="subtle"
                                  disabled={locked}
                                  onClick={() => void saveCopy(attachment)}
                                >
                                  Save copy…
                                </AppButton>
                                {attachment.state === 'active' ? (
                                  <AppButton
                                    variant="subtle"
                                    disabled={locked || readOnly || dirty}
                                    onClick={() =>
                                      void mutate({
                                        type: 'removeAttachment',
                                        id: current.id,
                                        attachmentId: attachment.id,
                                        expectedRevisionId: current.revisionId
                                      })
                                    }
                                  >
                                    Remove file link
                                  </AppButton>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                    <details className="research-disclosure">
                      <summary>Provenance and retained import data</summary>
                      <SourceChatHistory key={current.id} sourceId={current.id} />
                      <ImportedOrigins
                        key={`import:${project.projectId}:${project.workspaceId}:${current.id}`}
                        kind="source"
                        id={current.id}
                      />
                      <p>{current.provenance}</p>
                      <p>Source identity: {current.id}</p>
                      {current.aliases.length ? (
                        <p>Retained aliases: {current.aliases.join(', ')}</p>
                      ) : null}
                      {current.rawImport ? <pre>{current.rawImport}</pre> : null}
                      {current.unknownFields.length ? (
                        <p>Retained unknown fields: {current.unknownFields.join(', ')}</p>
                      ) : null}
                    </details>
                    <details className="research-disclosure">
                      <summary>Trash, restore or merge source</summary>
                      <p>
                        Trashing or merging keeps history and does not rewrite existing citations.
                        Review their original source identities in Usage and context.
                      </p>
                      {current.state !== 'merged' ? (
                        <>
                          <AppButton
                            variant="default"
                            disabled={locked || readOnly || dirty}
                            onClick={() =>
                              void mutate({
                                type: 'state',
                                id: current.id,
                                expectedRevisionId: current.revisionId,
                                state: current.state === 'trashed' ? 'active' : 'trashed'
                              })
                            }
                          >
                            {current.state === 'trashed'
                              ? 'Restore source'
                              : 'Move source to trash'}
                          </AppButton>
                          <SelectField
                            label="Merge into source"
                            disabled={locked || dirty}
                            value={mergeTarget}
                            onChange={(event) => setMergeTarget(event.target.value)}
                          >
                            <option value="">Choose source to keep</option>
                            {view?.sources
                              .filter((item) => item.id !== current.id && item.state === 'active')
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.metadata.title}
                                </option>
                              ))}
                          </SelectField>
                          <AppButton
                            variant="default"
                            disabled={locked || readOnly || dirty || !mergeTarget}
                            onClick={() =>
                              void mutate({
                                type: 'merge',
                                id: current.id,
                                targetId: mergeTarget,
                                expectedRevisionId: current.revisionId
                              })
                            }
                          >
                            Merge sources
                          </AppButton>
                        </>
                      ) : current.replacementId ? (
                        <AppButton
                          variant="default"
                          onClick={() =>
                            session.research({ kind: 'sources', sourceId: current.replacementId! })
                          }
                        >
                          Open merge target
                        </AppButton>
                      ) : null}
                    </details>
                  </>
                ) : null}
              </>
            ) : (
              <EmptyState title="Choose a source">
                Select a source to edit its details or read an original.
              </EmptyState>
            )}
          </ResearchLayout>
          <details className="research-disclosure">
            <summary>Export bibliography</summary>
            <SelectField
              label="Export format"
              value={exportFormat}
              disabled={locked}
              onChange={(event) => setExportFormat(event.target.value as BibliographyFormat)}
            >
              <option value="csl-json">CSL JSON</option>
              <option value="bibtex">BibTeX</option>
              <option value="ris">RIS</option>
            </SelectField>
            <p>No selections exports all active sources.</p>
            <div className="research-checklist">
              {view?.sources
                .filter((item) => item.state === 'active')
                .map((item) => (
                  <Checkbox
                    key={item.id}
                    label={item.metadata.title}
                    checked={exportSelection.includes(item.id)}
                    disabled={locked}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked
                      setExportSelection((old) =>
                        checked ? [...old, item.id] : old.filter((id) => id !== item.id)
                      )
                    }}
                  />
                ))}
            </div>
            <AppButton variant="default" disabled={locked} onClick={() => void exportLibrary()}>
              Export {exportSelection.length ? 'selected' : 'all active'} sources…
            </AppButton>
            {exportLosses.length ? (
              <ul>
                {exportLosses.map((loss, index) => (
                  <li key={index}>{loss}</li>
                ))}
              </ul>
            ) : null}
          </details>
          {view?.reports.length ? (
            <details className="research-disclosure">
              <summary>Retained import reports ({view.reports.length})</summary>
              {view.reports.map((report) => (
                <section key={report.id}>
                  <h3>
                    {report.format} · {new Date(report.createdAt).toLocaleString()}
                  </h3>
                  <p>
                    {report.imported} imported or linked; {report.skipped} skipped.
                  </p>
                  {report.errors.map((issue, index) => (
                    <p key={index}>{issue}</p>
                  ))}
                  {report.losses.map((loss, index) => (
                    <p key={index}>{loss}</p>
                  ))}
                </section>
              ))}
            </details>
          ) : null}
          {attachmentProgress ? (
            <p role="status">
              Copying managed original: {Math.round(attachmentProgress.transferred / 1024)} of{' '}
              {Math.round(attachmentProgress.total / 1024)} KiB
            </p>
          ) : null}
        </section>
      )}
    />
  )
}
