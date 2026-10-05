import { TextInput, Textarea } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { AppDialog } from '../../components/ui/AppDialog'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { scopeOf } from '../workspace/useWorkspaceController'
import './OutlinePanel.css'
import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import {
  canParent,
  effectiveState,
  type OutlineChange,
  type OutlineDocument,
  type OutlineKind
} from '../../../../shared/outline'

export default function OutlinePanel({
  project,
  disabled,
  readOnly,
  issue,
  change,
  select
}: {
  issue: string
  project: OpenProject
  disabled: boolean
  readOnly: boolean
  change: (value: OutlineChange, done?: (success: boolean) => void) => void
  select: (id: string) => void
}): React.JSX.Element {
  const [focusId, setFocusId] = useState(project.documentId),
    [showRemoved, setShowRemoved] = useState(false)
  const [mode, setMode] = useState<'create' | 'move' | 'split' | 'merge' | 'details' | null>(null)
  const submitting = useRef(false),
    composing = useRef(false)
  const [failed, setFailed] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const composition = useRetainedDraft('outline-form', {
    read: () => ({
      scope: scopeOf(project),
      kind: 'outline-form',
      entityId: focusId,
      label: 'Outline details',
      dirty: mode !== null && !submitting.current,
      composing: false,
      busy: false,
      pendingOperation: null,
      policy: 'explicit',
      target: {
        kind: 'workspace',
        scope: scopeOf(project),
        view: 'write',
        documentId: project.documentId
      }
    })
  })
  const [kind, setKind] = useState<OutlineKind>('text'),
    [title, setTitle] = useState(''),
    [parentId, setParentId] = useState(''),
    [position, setPosition] = useState(0)
  const [targetId, setTargetId] = useState(''),
    [boundary, setBoundary] = useState(''),
    [status, setStatus] = useState<'draft' | 'review' | 'complete'>('draft'),
    [synopsis, setSynopsis] = useState('')
  const docs = project.documents,
    focused = docs.find((d) => d.id === focusId) ?? docs.find((d) => d.id === project.documentId)!
  useEffect(() => {
    setFocusId(project.documentId)
  }, [project.documentId])
  const state = effectiveState(focused, docs)
  const siblings = docs
    .filter((d) => d.parentId === focused.parentId)
    .sort((a, b) => a.position - b.position)
  function open(next: typeof mode): void {
    setFailed(false)
    setMode(next)
    setTitle(next === 'details' ? focused.title : '')
    setParentId(focused.parentId ?? '')
    setPosition(focused.position)
    setTargetId('')
    setBoundary('')
    setStatus(focused.status as typeof status)
    setSynopsis(focused.synopsis)
  }
  function closeForm(): void {
    if (!submitting.current && !composing.current) setMode(null)
  }
  function firstSection(parent: string): string | null {
    for (const child of docs
      .filter((d) => d.parentId === parent && effectiveState(d, docs) === 'active')
      .sort((a, b) => a.position - b.position)) {
      if (child.kind === 'text') return child.id
      const found = firstSection(child.id)
      if (found) return found
    }
    return null
  }
  function move(doc: OutlineDocument, destination: OutlineDocument): void {
    if (doc.id === destination.id || doc.state === 'merged') return
    const others = docs
      .filter((d) => d.parentId === destination.parentId && d.id !== doc.id)
      .sort((a, b) => a.position - b.position)
    change({
      type: 'move',
      documentId: doc.id,
      parentId: destination.parentId,
      position: others.findIndex((d) => d.id === destination.id)
    })
  }
  function branch(parent: string | null): React.JSX.Element {
    return (
      <ol className="outline-tree">
        {docs
          .filter((d) => d.parentId === parent)
          .sort((a, b) => a.position - b.position)
          .filter((d) => showRemoved || effectiveState(d, docs) === 'active')
          .map((d) => (
            <li key={d.id}>
              <div className="outline-row">
                <AppButton
                  variant="subtle"
                  className="outline-row-title"
                  classNames={{ label: 'outline-row-label', inner: 'outline-row-inner' }}
                  type="button"
                  draggable={!disabled && !readOnly && mode === null && d.state !== 'merged'}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-collie-outline', d.id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    if (
                      !disabled &&
                      !readOnly &&
                      event.dataTransfer.types.includes('application/x-collie-outline')
                    )
                      event.preventDefault()
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (disabled || readOnly) return
                    const source = docs.find(
                      (x) => x.id === event.dataTransfer.getData('application/x-collie-outline')
                    )
                    if (source) move(source, d)
                  }}
                  aria-pressed={focused.id === d.id}
                  disabled={disabled || mode !== null}
                  onClick={() => {
                    setFocusId(d.id)
                    setMode(null)
                    if (d.kind === 'text') select(d.id)
                  }}
                >
                  <span>{d.title}</span>{' '}
                  <small>
                    {d.kind === 'text' ? 'Section' : d.kind} · {d.status}
                    {effectiveState(d, docs) !== 'active' ? ` · ${effectiveState(d, docs)}` : ''}
                  </small>
                </AppButton>
                {docs.some((child) => child.parentId === d.id) ? (
                  <AppButton
                    variant="subtle"
                    className="outline-branch-toggle"
                    aria-label={`${collapsed.has(d.id) ? 'Expand' : 'Collapse'} ${d.title}`}
                    aria-expanded={!collapsed.has(d.id)}
                    onClick={() =>
                      setCollapsed((previous) => {
                        const next = new Set(previous)
                        if (next.has(d.id)) next.delete(d.id)
                        else next.add(d.id)
                        return next
                      })
                    }
                  >
                    {collapsed.has(d.id) ? '+' : '−'}
                  </AppButton>
                ) : null}
              </div>
              {docs.some((child) => child.parentId === d.id) && !collapsed.has(d.id)
                ? branch(d.id)
                : null}
            </li>
          ))}
      </ol>
    )
  }
  const parentOptions = docs.filter(
    (d) =>
      (mode === 'create' || d.id !== focused.id) &&
      canParent(mode === 'create' ? kind : focused.kind, d) &&
      effectiveState(d, docs) === 'active'
  )
  return (
    <section className="outline-panel" aria-label="Manuscript outline">
      <h3>Outline</h3>
      <div className="outline-heading-actions">
        <AppButton
          variant="default"
          disabled={disabled || readOnly || mode !== null}
          onClick={() => {
            open('create')
            setParentId('')
          }}
        >
          Add item…
        </AppButton>
        <ActionMenu
          label="Outline view"
          actions={[
            {
              id: 'removed',
              label: showRemoved ? 'Hide removed items' : 'Show archived, trashed and merged',
              onSelect: () => setShowRemoved(!showRemoved)
            },
            { id: 'expand', label: 'Expand all', onSelect: () => setCollapsed(new Set()) },
            {
              id: 'collapse',
              label: 'Collapse all containers',
              onSelect: () =>
                setCollapsed(new Set(docs.filter((d) => d.kind !== 'text').map((d) => d.id)))
            }
          ]}
        />
      </div>
      {branch(null)}
      <p className="outline-selection" aria-live="polite">
        {focused.title} · {state}
      </p>
      {focused.state === 'merged' ? (
        <p>
          This section was merged.{' '}
          <AppButton
            variant="subtle"
            disabled={disabled}
            onClick={() => select(focused.replacementId!)}
          >
            Open replacement
          </AppButton>
        </p>
      ) : (
        <div className="outline-item-actions">
          {focused.kind !== 'text' ? (
            <AppButton
              variant="subtle"
              disabled={disabled || !firstSection(focused.id)}
              onClick={() => {
                const id = firstSection(focused.id)
                if (id) select(id)
              }}
            >
              Open first section
            </AppButton>
          ) : null}
          <ActionMenu
            label="Selected item"
            actions={[
              {
                id: 'up',
                label: 'Move up',
                disabled: disabled || readOnly || focused.position === 0,
                onSelect: () =>
                  change({
                    type: 'move',
                    documentId: focused.id,
                    parentId: focused.parentId,
                    position: focused.position - 1
                  })
              },
              {
                id: 'down',
                label: 'Move down',
                disabled: disabled || readOnly || focused.position === siblings.length - 1,
                onSelect: () =>
                  change({
                    type: 'move',
                    documentId: focused.id,
                    parentId: focused.parentId,
                    position: focused.position + 1
                  })
              },
              {
                id: 'move',
                label: 'Move to…',
                disabled: disabled || readOnly,
                onSelect: () => open('move')
              },
              {
                id: 'details',
                label: 'Item details…',
                disabled: disabled || readOnly,
                onSelect: () => open('details')
              },
              {
                id: 'split',
                label: 'Split section…',
                disabled:
                  disabled ||
                  readOnly ||
                  state !== 'active' ||
                  focused.kind !== 'text' ||
                  focused.id !== project.documentId,
                onSelect: () => open('split')
              },
              {
                id: 'merge',
                label: 'Merge into…',
                disabled: disabled || readOnly || state !== 'active' || focused.kind !== 'text',
                onSelect: () => open('merge')
              },
              {
                id: 'archive',
                label: 'Archive item',
                disabled: disabled || readOnly || focused.state === 'archived',
                onSelect: () => change({ type: 'state', documentId: focused.id, state: 'archived' })
              },
              {
                id: 'trash',
                label: 'Move to trash',
                disabled: disabled || readOnly || focused.state === 'trashed',
                onSelect: () => change({ type: 'state', documentId: focused.id, state: 'trashed' })
              },
              {
                id: 'restore',
                label: 'Restore item',
                disabled: disabled || readOnly || focused.state === 'active',
                onSelect: () => change({ type: 'state', documentId: focused.id, state: 'active' })
              }
            ]}
          />
        </div>
      )}
      <AppDialog
        opened={mode !== null}
        title={
          mode === 'merge'
            ? 'Merge sections'
            : mode === 'split'
              ? 'Split section'
              : mode === 'move'
                ? 'Move outline item'
                : mode === 'create'
                  ? 'Add outline item'
                  : 'Outline details'
        }
        onClose={closeForm}
        dismissible={!submitting.current}
      >
        {mode ? (
          <form
            className="outline-form"
            onCompositionStartCapture={() => {
              composing.current = true
              composition.onCompositionStartCapture()
            }}
            onCompositionEndCapture={() => {
              composing.current = false
              composition.onCompositionEndCapture()
            }}
            onSubmit={(e) => {
              e.preventDefault()
              if (readOnly || disabled || submitting.current || composing.current) return
              let input: OutlineChange
              if (mode === 'create')
                input = { type: 'create', kind, title, parentId: parentId || null }
              else if (mode === 'move')
                input = {
                  type: 'move',
                  documentId: focused.id,
                  parentId: parentId || null,
                  position
                }
              else if (mode === 'split')
                input = { type: 'split', documentId: focused.id, afterBlockId: boundary, title }
              else if (mode === 'merge') input = { type: 'merge', documentId: focused.id, targetId }
              else input = { type: 'details', documentId: focused.id, title, status, synopsis }
              submitting.current = true
              change(input, (success) => {
                submitting.current = false
                setFailed(!success)
                if (success) setMode(null)
              })
            }}
          >
            {failed ? (
              <p role="alert">
                {issue || 'The outline action could not finish. Your entries are retained.'} Close
                this dialog to review any pending operation; closing it does not discard an
                operation already submitted.
              </p>
            ) : null}
            <fieldset disabled={disabled || readOnly}>
              {mode === 'create' ? (
                <SelectField
                  label="Kind"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as OutlineKind)
                    setParentId('')
                  }}
                >
                  <option value="text">Section</option>
                  <option value="chapter">Chapter</option>
                  <option value="part">Part</option>
                </SelectField>
              ) : null}
              {['create', 'split', 'details'].includes(mode) ? (
                <TextInput
                  label="Title"
                  data-autofocus
                  required
                  maxLength={500}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              ) : null}
              {mode === 'move' || mode === 'create' ? (
                <SelectField
                  label="Parent"
                  value={parentId}
                  onChange={(e) => {
                    setParentId(e.target.value)
                    setPosition(0)
                  }}
                >
                  <option value="">Manuscript root</option>
                  {parentOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} · {d.kind}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {mode === 'move' ? (
                <SelectField
                  label="Position"
                  value={position}
                  onChange={(e) => setPosition(Number(e.target.value))}
                >
                  {Array.from(
                    {
                      length:
                        docs.filter((d) => d.parentId === (parentId || null) && d.id !== focused.id)
                          .length + 1
                    },
                    (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    )
                  )}
                </SelectField>
              ) : null}
              {mode === 'split' ? (
                <>
                  <p>
                    Split only between complete top-level blocks. A table or list stays together.
                    Pending edits are protected before the change; a changed boundary is rejected.
                  </p>
                  <SelectField
                    label="Split after"
                    required
                    value={boundary}
                    onChange={(e) => setBoundary(e.target.value)}
                  >
                    <option value="">Choose a boundary</option>
                    {project.payload.ast.content.slice(0, -1).map((b, i) => (
                      <option key={b.attrs.blockId} value={b.attrs.blockId}>
                        Block {i + 1} · {b.type}
                      </option>
                    ))}
                  </SelectField>
                  {project.payload.ast.content.length < 2 ? (
                    <p>Add and protect at least two paragraphs/blocks before splitting.</p>
                  ) : null}
                </>
              ) : null}
              {mode === 'merge' ? (
                <>
                  <p>
                    The target’s writing comes first, followed by this section. The source becomes a
                    tombstone linking to the target; a checkpoint preserves its title and synopsis.
                  </p>
                  <SelectField
                    label="Append to"
                    required
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">Choose a section</option>
                    {docs
                      .filter(
                        (d) =>
                          d.kind === 'text' &&
                          d.id !== focused.id &&
                          effectiveState(d, docs) === 'active'
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                  </SelectField>
                </>
              ) : null}
              {mode === 'details' ? (
                <>
                  <SelectField
                    label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as typeof status)}
                  >
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="complete">Complete</option>
                  </SelectField>
                  <Textarea
                    label="Synopsis"
                    maxLength={10000}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                  />
                </>
              ) : null}
              <AppButton type="submit">Apply {mode}</AppButton>
            </fieldset>
            <AppButton
              variant="default"
              type="button"
              disabled={submitting.current}
              onClick={closeForm}
            >
              Cancel
            </AppButton>
          </form>
        ) : null}
      </AppDialog>
      <details className="outline-help">
        <summary>Organizing your manuscript</summary>
        <p>
          Drag a row before another row, or use Selected item → Move up, Move down or Move to. Parts
          contain chapters or sections; chapters contain sections.
        </p>
        <p>
          Archive and trash keep content. At least one active section must remain. Restore a
          containing part/chapter to make its children active again.
        </p>
      </details>
    </section>
  )
}
