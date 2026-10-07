import { IconPlus, IconDots, IconChevronRight, IconChevronDown } from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import { isEditableKind } from '../../../../shared/outline'
import PresentationBoundary from '../../components/PresentationBoundary'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { ActionMenu, type MenuAction } from '../../components/ui/ActionMenu'
import { AppDialog } from '../../components/ui/AppDialog'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { scopeOf } from '../workspace/useWorkspaceController'
import './OutlinePanel.css'
import { useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import {
  placementPolicy,
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
  const [formTarget, setFormTarget] = useState<OutlineDocument | null>(null)
  const [mode, setMode] = useState<'create' | 'move' | 'split' | 'merge' | 'details' | null>(null)
  const [submittingValue, setSubmittingValue, submitting] = useSynchronousState(false),
    composing = useRef(false)
  const [failed, setFailed] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const composition = useRetainedDraft('outline-form', {
    read: () => ({
      scope: scopeOf(project),
      kind: 'outline-form',
      entityId: formTarget?.id ?? null,
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
    focused = formTarget ?? docs.find((d) => d.id === project.documentId)!
  const targetAvailable =
    mode === 'create' ||
    (!!formTarget && docs.some((d) => d.id === formTarget.id && d.state !== 'merged'))
  const [lastDocumentId, setLastDocumentId] = useState(project.documentId)
  if (lastDocumentId !== project.documentId) {
    setLastDocumentId(project.documentId)
    setFocusId(project.documentId)
    const next = new Set(collapsed)
    let item = docs.find((d) => d.id === project.documentId)
    while (item?.parentId) {
      next.delete(item.parentId)
      item = docs.find((d) => d.id === item?.parentId)
    }
    setCollapsed(next)
  }
  function open(next: typeof mode, doc = docs.find((d) => d.id === project.documentId)!): void {
    if (disabled || readOnly || mode !== null || composing.current) return
    setFormTarget({ ...doc })
    setFailed(false)
    setMode(next)
    setTitle(next === 'details' ? doc.title : '')
    setParentId(doc.parentId ?? '')
    setPosition(doc.position)
    setTargetId('')
    setBoundary('')
    setStatus(doc.status as typeof status)
    setSynopsis(doc.synopsis)
  }
  function closeForm(): void {
    if (!submitting.current && !composing.current) setMode(null)
  }
  function firstSection(parent: string): string | null {
    for (const child of docs
      .filter((d) => d.parentId === parent && effectiveState(d, docs) === 'active')
      .sort((a, b) => a.position - b.position)) {
      if (isEditableKind(child.kind)) return child.id
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
  function rowActions(doc: OutlineDocument): MenuAction[] {
    if (doc.state === 'merged')
      return [
        {
          id: 'replacement',
          label: 'Open replacement',
          disabled: disabled || mode !== null,
          onSelect: () => select(doc.replacementId!)
        }
      ]
    const state = effectiveState(doc, docs)
    const siblings = docs.filter((d) => d.parentId === doc.parentId)
    return [
      ...(!isEditableKind(doc.kind)
        ? [
            {
              id: 'first',
              label: 'Open first writing item',
              disabled: disabled || !firstSection(doc.id),
              onSelect: () => {
                const id = firstSection(doc.id)
                if (id) select(id)
              }
            }
          ]
        : []),

      {
        id: 'up',
        label: 'Move up',
        disabled: disabled || readOnly || doc.position === 0,
        onSelect: () =>
          change({
            type: 'move',
            documentId: doc.id,
            parentId: doc.parentId,
            position: doc.position - 1
          })
      },
      {
        id: 'down',
        label: 'Move down',
        disabled: disabled || readOnly || doc.position === siblings.length - 1,
        onSelect: () =>
          change({
            type: 'move',
            documentId: doc.id,
            parentId: doc.parentId,
            position: doc.position + 1
          })
      },
      {
        id: 'move',
        label: 'Move to…',
        disabled: disabled || readOnly,
        onSelect: () => open('move', doc)
      },
      {
        id: 'details',
        label: 'Item details…',
        disabled: disabled || readOnly,
        onSelect: () => open('details', doc)
      },
      {
        id: 'split',
        label:
          doc.id === project.documentId
            ? 'Split writing item…'
            : 'Split unavailable: open this item first',
        disabled:
          disabled ||
          readOnly ||
          state !== 'active' ||
          !isEditableKind(doc.kind) ||
          doc.id !== project.documentId,
        onSelect: () => open('split', doc)
      },
      {
        id: 'merge',
        label: docs.some((d) => d.parentId === doc.id)
          ? 'Merge unavailable: item has children'
          : 'Merge into…',
        disabled:
          disabled ||
          readOnly ||
          state !== 'active' ||
          !isEditableKind(doc.kind) ||
          docs.some((d) => d.parentId === doc.id),
        onSelect: () => open('merge', doc)
      },
      {
        id: 'archive',
        label: 'Archive item',
        disabled: disabled || readOnly || doc.state === 'archived',
        onSelect: () => change({ type: 'state', documentId: doc.id, state: 'archived' })
      },
      {
        id: 'trash',
        label: 'Move to trash',
        disabled: disabled || readOnly || doc.state === 'trashed',
        onSelect: () => change({ type: 'state', documentId: doc.id, state: 'trashed' })
      },
      {
        id: 'restore',
        label: 'Restore item',
        disabled: disabled || readOnly || doc.state === 'active',
        onSelect: () => change({ type: 'state', documentId: doc.id, state: 'active' })
      }
    ]
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
                  aria-pressed={
                    isEditableKind(d.kind) ? project.documentId === d.id : focusId === d.id
                  }
                  disabled={disabled || mode !== null}
                  onClick={() => {
                    setMode(null)
                    if (isEditableKind(d.kind) && d.state !== 'merged') select(d.id)
                    else setFocusId(d.id)
                  }}
                >
                  <span>{d.title}</span>{' '}
                  <small>
                    {d.kind === 'text' ? 'Section' : d.kind} · {d.status}
                    {effectiveState(d, docs) !== 'active' ? ` · ${effectiveState(d, docs)}` : ''}
                  </small>
                </AppButton>
                {docs.some((child) => child.parentId === d.id) ? (
                  <IconButton
                    variant="subtle"
                    className="outline-branch-toggle"
                    label={`${collapsed.has(d.id) ? 'Expand' : 'Collapse'} ${d.title}`}
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
                    {collapsed.has(d.id) ? (
                      <IconChevronRight aria-hidden="true" />
                    ) : (
                      <IconChevronDown aria-hidden="true" />
                    )}
                  </IconButton>
                ) : null}
                <ActionMenu
                  label={`Actions for ${d.title}`}
                  icon={<IconDots aria-hidden="true" />}
                  triggerClassName="outline-row-menu"
                  disabled={disabled || mode !== null}
                  actions={rowActions(d)}
                />
              </div>
              {docs.some((child) => child.parentId === d.id) && !collapsed.has(d.id)
                ? branch(d.id)
                : null}
            </li>
          ))}
      </ol>
    )
  }
  const canChooseParent = placementPolicy(
    docs,
    mode === 'create' ? kind : focused.kind,
    mode === 'create' ? undefined : focused.id
  )
  const parentOptions = docs.filter((d) => canChooseParent(d.id))
  return (
    <PresentationBoundary
      label="Manuscript outline"
      render={() => (
        <section className="outline-panel" aria-label="Manuscript outline">
          <h3>Outline</h3>
          <div className="outline-heading-actions">
            <IconButton
              label="Add item"
              description={
                readOnly ? 'Add item is unavailable while this project is read-only.' : undefined
              }
              variant="default"
              disabled={disabled || readOnly || mode !== null}
              onClick={() => {
                open('create')
                setParentId('')
              }}
            >
              <IconPlus aria-hidden="true" />
            </IconButton>
            <ActionMenu
              label="Outline view"
              disabled={mode !== null}
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
                    setCollapsed(
                      new Set(
                        docs
                          .filter((d) => docs.some((child) => child.parentId === d.id))
                          .map((d) => d.id)
                      )
                    )
                }
              ]}
            />
          </div>
          {branch(null)}
          <AppDialog
            opened={mode !== null}
            title={
              mode === 'merge'
                ? 'Merge writing items'
                : mode === 'split'
                  ? 'Split writing item'
                  : mode === 'move'
                    ? 'Move outline item'
                    : mode === 'create'
                      ? 'Add outline item'
                      : 'Outline details'
            }
            onClose={closeForm}
            dismissible={!submittingValue}
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
                  if (
                    readOnly ||
                    disabled ||
                    !targetAvailable ||
                    submitting.current ||
                    composing.current
                  )
                    return
                  if (mode === 'split' && formTarget?.id !== project.documentId) {
                    setFailed(true)
                    return
                  }
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
                  else if (mode === 'merge')
                    input = { type: 'merge', documentId: focused.id, targetId }
                  else input = { type: 'details', documentId: focused.id, title, status, synopsis }
                  setSubmittingValue(true)
                  change(input, (success) => {
                    setSubmittingValue(false)
                    setFailed(!success)
                    if (success) setMode(null)
                  })
                }}
              >
                {failed ? (
                  <p role="alert">
                    {issue || 'The outline action could not finish. Your entries are retained.'}{' '}
                    Close this dialog to review any pending operation; closing it does not discard
                    an operation already submitted.
                  </p>
                ) : null}
                {!targetAvailable ? (
                  <p role="alert">
                    This item is no longer available. Cancel and choose an existing row; no other
                    item will be edited.
                  </p>
                ) : null}
                {mode !== 'create' ? <p>Editing: {focused.title}</p> : null}
                <fieldset disabled={disabled || readOnly || !targetAvailable}>
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
                  {mode === 'create' || mode === 'move' ? (
                    <p>
                      Only parents that keep the whole branch within eight levels are offered. An
                      item cannot contain itself or its ancestors.
                    </p>
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
                            docs.filter(
                              (d) => d.parentId === (parentId || null) && d.id !== focused.id
                            ).length + 1
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
                        Split only this item’s own body between complete top-level blocks. Its
                        children stay with the original item. A table or list stays together.
                        Pending edits are protected before the change; a changed boundary is
                        rejected.
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
                        The target’s writing comes first, followed by this section. The source
                        becomes a tombstone linking to the target; a checkpoint preserves its title
                        and synopsis.
                      </p>
                      <SelectField
                        label="Append to"
                        required
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                      >
                        <option value="">Choose a leaf Chapter or Section</option>
                        {docs
                          .filter(
                            (d) =>
                              isEditableKind(d.kind) &&
                              d.id !== focused.id &&
                              !docs.some((child) => child.parentId === d.id) &&
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
                  disabled={submittingValue}
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
              Drag a row before another row, or use a row’s actions menu for Move up, Move down or
              Move to. Chapters and Sections each have their own writing and can contain either
              kind. Parts group writing at the root. The outline supports eight levels including the
              root; moves cannot place an item inside itself or its descendants.
            </p>
            <p>
              Archive and trash keep content. At least one active Chapter or Section must remain.
              Restore a containing item to make its children active again.
            </p>
          </details>
        </section>
      )}
    />
  )
}
