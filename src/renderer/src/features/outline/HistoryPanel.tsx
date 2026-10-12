import { withoutKeys } from '../../../../shared/objects'
import { TextInput } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import './HistoryPanel.css'
import { useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import {
  effectiveState,
  type HistoryView,
  type OutlineChange,
  type RetainedDocument,
  type AnchorTarget
} from '../../../../shared/outline'

function readable(value: unknown, notes: string[]): string {
  if (!value || typeof value !== 'object') return ''
  if ('type' in value && value.type === 'text' && 'text' in value) return String(value.text)
  if ('type' in value && value.type === 'hardBreak') return '\n'
  if ('type' in value && 'attrs' in value && value.attrs && typeof value.attrs === 'object') {
    if (value.type === 'citation' && 'citationId' in value.attrs) return '[Citation]'
    if (value.type === 'footnote' && 'footnoteId' in value.attrs)
      return `[Note ${notes.indexOf(String(value.attrs.footnoteId)) + 1}]`
    if (value.type === 'image' && 'alt' in value.attrs && 'caption' in value.attrs)
      return `[Image: ${value.attrs.alt}] ${value.attrs.caption}\n`
    if (value.type === 'pageBreak') return '\n[Page break]\n'
    if (value.type === 'horizontalRule') return '\n[Rule]\n'
  }
  if ('content' in value && Array.isArray(value.content))
    return (
      value.content.map((child) => readable(child, notes)).join('') +
      ('type' in value && ['paragraph', 'heading', 'tableRow'].includes(String(value.type))
        ? '\n'
        : 'type' in value && ['tableCell', 'tableHeader'].includes(String(value.type))
          ? '\t'
          : '')
    )
  return ''
}
function text(doc: RetainedDocument): string {
  const notes = Object.keys(doc.payload.footnotesById)
  return (
    readable(doc.payload.ast, notes) +
    Object.entries(doc.payload.footnotesById)
      .map(([id, body]) => `\nNote ${notes.indexOf(id) + 1}\n${readable(body, notes)}`)
      .join('')
  )
}
function formatting(doc: RetainedDocument): string {
  const marks = new Set<string>()
  function visit(v: unknown): void {
    if (!v || typeof v !== 'object') return
    if ('marks' in v && Array.isArray(v.marks))
      for (const m of v.marks)
        if (m && typeof m === 'object' && 'type' in m) marks.add(String(m.type))
    for (const [key, child] of Object.entries(v)) if (key !== 'marks') visit(child)
  }
  visit(doc.payload)
  return `Text formatting: ${[...marks].join(', ') || 'plain'}`
}
function placement(doc: RetainedDocument, docs: Map<string, RetainedDocument>): string {
  const path = [doc.title]
  let cursor = doc,
    count = 0
  while (cursor.parentId && ++count < 8) {
    const parent = docs.get(cursor.parentId)
    if (!parent) break
    path.unshift(parent.title)
    cursor = parent
  }
  return `${path.join(' / ')} · position ${doc.position + 1} · ${doc.kind === 'text' ? 'section' : doc.kind} · ${effectiveState(doc, docs)} · ${doc.status}`
}
export default function HistoryPanel({
  project,
  history,
  disabled,
  readOnly,
  change,
  read,
  navigate
}: {
  project: OpenProject
  history: HistoryView | null
  disabled: boolean
  readOnly: boolean
  change: (c: OutlineChange) => void
  read: (id: string | null) => void
  navigate: (doc: string, anchor?: string) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(''),
    [cleanup, setCleanup] = useState(false)
  const [repair, setRepair] = useState<AnchorTarget | null>(null),
    [target, setTarget] = useState(''),
    [page, setPage] = useState(0),
    [issuePage, setIssuePage] = useState(0)
  const selected = history?.checkpointId ?? ''
  const comparisonKey = `${history?.headCommitId}:${selected}`
  const [lastComparison, setLastComparison] = useState(comparisonKey)
  if (lastComparison !== comparisonKey) {
    setLastComparison(comparisonKey)
    setCleanup(false)
    setRepair(null)
    setPage(0)
    setIssuePage(0)
  }
  const fresh = history?.headCommitId === project.headCommitId
  const issues = history?.anchors.filter((a) => a.state !== 'active') ?? []
  const oldDocs = new Map(history?.snapshot?.documents.map((d) => [d.id, d])),
    currentDocs = new Map(history?.currentSnapshot.documents.map((d) => [d.id, d]))
  const comparable = (doc: RetainedDocument | undefined): string =>
    doc ? JSON.stringify(withoutKeys(doc, ['revisionId'])) : ''
  const changedIds = [...new Set([...oldDocs.keys(), ...currentDocs.keys()])].filter(
    (id) => comparable(oldDocs.get(id)) !== comparable(currentDocs.get(id))
  )
  return (
    <section className="history-panel" aria-label="Revision history">
      <h1>Manuscript history</h1>
      <p>Choose a dated version to compare with your current manuscript.</p>
      <AppButton
        variant="default"
        disabled={disabled}
        onClick={() => {
          setCleanup(false)
          setPage(0)
          read(selected || null)
        }}
      >
        Refresh history
      </AppButton>
      {history ? (
        <>
          {!fresh ? (
            <p role="status">
              Your writing changed. Refresh history before restoring a version or changing saved
              targets.
            </p>
          ) : null}
          <SelectField
            label="Saved version"
            value={selected}
            disabled={disabled}
            onChange={(e) => {
              setCleanup(false)
              setPage(0)
              read(e.target.value || null)
            }}
          >
            <option value="">Choose a version</option>
            {history.checkpoints.map((c) => (
              <option key={c.id} value={c.id}>
                {new Date(c.createdAt).toLocaleString()} ·{' '}
                {c.reason === 'automatic'
                  ? 'Automatic version'
                  : c.reason === 'restore'
                    ? 'Before restoring'
                    : c.title}
              </option>
            ))}
          </SelectField>
          {history.snapshot && selected ? (
            <div className="history-comparison">
              <p>
                {changedIds.length
                  ? `${changedIds.length} outline items changed. Compare the earlier and current writing below.`
                  : 'No writing or outline changes in this comparison.'}
              </p>
              {changedIds.slice(page * 10, page * 10 + 10).map((id) => {
                const before = oldDocs.get(id),
                  after = currentDocs.get(id)
                return (
                  <details key={id} open={changedIds.length === 1}>
                    <summary>
                      {after?.title ?? before?.title} ·{' '}
                      {before && after ? 'changed' : before ? 'absent now' : 'added later'}
                    </summary>
                    <div className="history-columns">
                      {[
                        { doc: before, docs: oldDocs, label: 'Earlier version' },
                        { doc: after, docs: currentDocs, label: 'Current' }
                      ].map(({ doc, docs, label }) => (
                        <section key={label}>
                          <h4>{label}</h4>
                          {doc ? (
                            <>
                              <p>{placement(doc, docs)}</p>
                              {doc.synopsis ? <p>Synopsis: {doc.synopsis}</p> : null}
                              <p>{formatting(doc)}</p>
                              <pre tabIndex={0} aria-label={`${label}: ${doc.title}`}>
                                {text(doc) || 'No writing in this item.'}
                              </pre>
                            </>
                          ) : (
                            <p>This item is absent.</p>
                          )}
                        </section>
                      ))}
                    </div>
                    {before &&
                    after &&
                    text(before) === text(after) &&
                    JSON.stringify(before.payload) !== JSON.stringify(after.payload) ? (
                      <p>
                        Formatting, references or layout changed. This text preview shows only the
                        words.
                      </p>
                    ) : null}
                  </details>
                )
              })}
              {changedIds.length > 10 ? (
                <div className="history-actions">
                  <AppButton
                    variant="default"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous changes
                  </AppButton>{' '}
                  <AppButton
                    variant="default"
                    disabled={(page + 1) * 10 >= changedIds.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next changes
                  </AppButton>
                </div>
              ) : null}
              <p>
                Restoring replaces the whole manuscript and outline. Your current writing is kept as
                a version first.
              </p>
              <AppButton
                variant="filled"
                disabled={disabled || readOnly || !fresh}
                onClick={() => change({ type: 'restore', checkpointId: selected })}
              >
                Restore this version
              </AppButton>
            </div>
          ) : null}
          <details>
            <summary>Delete older automatic versions</summary>
            <p>
              {history.prunableIds.length} automatic versions older than 30 days can be deleted.
              Named versions, versions before changes and the newest version are kept.
            </p>
            {cleanup ? (
              <ul className="history-deletion-list" tabIndex={0} aria-label="Versions to delete">
                {history.checkpoints
                  .filter((c) => history.prunableIds.includes(c.id))
                  .map((c) => (
                    <li key={c.id}>
                      {new Date(c.createdAt).toLocaleString()} · {c.title}
                    </li>
                  ))}
              </ul>
            ) : null}
            <AppButton
              variant="default"
              disabled={disabled || readOnly || !fresh || !history.prunableIds.length}
              onClick={() => setCleanup(true)}
            >
              Delete older versions…
            </AppButton>
            {cleanup ? (
              <div className="outline-confirm" role="group" aria-label="Confirm history deletion">
                <p>
                  Delete these {history.prunableIds.length} older automatic versions permanently?
                  Your current writing, originals and saved project files are kept. Make a backup
                  first if you want to keep these versions elsewhere.
                </p>
                <AppButton
                  variant="default"
                  disabled={disabled || readOnly || !fresh}
                  onClick={() => {
                    change({ type: 'prune', checkpointIds: history.prunableIds })
                    setCleanup(false)
                  }}
                >
                  Delete these versions
                </AppButton>{' '}
                <AppButton variant="default" onClick={() => setCleanup(false)}>
                  Cancel
                </AppButton>
              </div>
            ) : null}
          </details>
          <details>
            <summary>Keep a named version</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                change({ type: 'checkpoint', title })
                setTitle('')
              }}
            >
              <TextInput
                label="Version name"
                required
                maxLength={500}
                value={title}
                disabled={disabled || readOnly}
                onChange={(e) => setTitle(e.target.value)}
              />
              <AppButton variant="default" type="submit" disabled={disabled || readOnly}>
                Keep this version
              </AppButton>
            </form>
          </details>
          {issues.length ? (
            <details>
              <summary>Unavailable passage targets ({issues.length})</summary>
              <p>
                Restore an archived or trashed section to make its passages available. A deleted
                passage can be linked to a replacement without changing your writing.
              </p>
              <ul>
                {issues.slice(issuePage * 25, issuePage * 25 + 25).map((a) => {
                  const repaired = a.replacementId
                    ? history.anchors.find((x) => x.id === a.replacementId)
                    : undefined
                  return (
                    <li key={a.id}>
                      {a.label || a.kind} · {a.state} · {a.id.slice(0, 8)}
                      {repaired
                        ? ` · manually linked to ${repaired.label || repaired.id.slice(0, 8)} (${repaired.state})`
                        : ''}{' '}
                      <AppButton
                        variant="default"
                        disabled={disabled}
                        onClick={() =>
                          navigate(
                            repaired?.documentId ?? a.documentId,
                            repaired?.id ?? (a.state !== 'deleted' ? a.id : undefined)
                          )
                        }
                      >
                        Open {repaired ? 'chosen target' : 'section'}
                      </AppButton>{' '}
                      {a.state === 'deleted' ? (
                        <AppButton
                          variant="default"
                          disabled={disabled || readOnly || !fresh}
                          onClick={() => {
                            setRepair(a)
                            setTarget('')
                          }}
                        >
                          Repair target…
                        </AppButton>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              <AppButton
                variant="default"
                disabled={issuePage === 0}
                onClick={() => setIssuePage(issuePage - 1)}
              >
                Previous targets
              </AppButton>{' '}
              <AppButton
                variant="default"
                disabled={(issuePage + 1) * 25 >= issues.length}
                onClick={() => setIssuePage(issuePage + 1)}
              >
                Next targets
              </AppButton>
              {repair ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    change({ type: 'repair', anchorId: repair.id, targetId: target })
                    setRepair(null)
                  }}
                >
                  <p>
                    Choose the intended replacement for: {repair.label || repair.id.slice(0, 8)}. No
                    text matching is performed.
                  </p>
                  <SelectField
                    label="Existing target"
                    required
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose explicitly</option>
                    {history.anchors
                      .filter((a) => a.state === 'active' && a.kind === repair.kind)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {currentDocs.get(a.documentId)?.title} · {a.label || a.kind} ·{' '}
                          {a.id.slice(0, 8)}
                        </option>
                      ))}
                  </SelectField>
                  <AppButton
                    variant="default"
                    type="submit"
                    disabled={disabled || readOnly || !fresh}
                  >
                    Confirm target
                  </AppButton>{' '}
                  <AppButton variant="default" type="button" onClick={() => setRepair(null)}>
                    Cancel
                  </AppButton>
                </form>
              ) : null}
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
