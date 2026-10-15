import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Checkbox, Select, TextInput, Textarea } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconDots, IconPlus } from '@tabler/icons-react'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { IconButton } from '../../components/ui/IconButton'
import { AppDialog } from '../../components/ui/AppDialog'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import {
  scopeOf,
  record,
  exact,
  type OpenProject,
  type CommitReceipt
} from '../../../../shared/projects'
import { sameScope } from '../../../../shared/project-files'
import {
  effectiveState,
  type OutlineChange,
  type OutlineDocument
} from '../../../../shared/outline'
import { isId, safeLink } from '../../../../domain/editor/schema'
import {
  MATERIAL_PAGE_SIZE,
  isMaterialTarget,
  type MaterialTarget
} from '../../../../shared/chapter-material'
import {
  isPlanningDestination,
  PLANNING_SELECTION_LIMIT,
  type PlanningLocation,
  type PlanningDestination,
  type PlanningChangeInput,
  type PlanningEdit,
  type PlanningItem
} from '../../../../shared/planning'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { WorkspaceModeSwitch } from '../workspace/WorkspaceModeSwitch'
import SaveMenu from '../workspace/SaveMenu'
import { useProjectImport } from '../imports/importContext'
import { useConversations } from '../ai/conversations/conversationState'
import { usePlanningPreferences } from './usePlanningPreferences'
import { usePlanningPage } from './usePlanningPage'
import { MaterialCard, PlanningPager } from './PlanningCards'
import { itemKey, materialLabel } from './planning-presentation'
import styles from './PlanWorkspace.module.css'

type Form = {
  type:
    'topic-create' | 'topic-rename' | 'document-create' | 'document-edit' | 'development' | 'paste'
  id: string
  title: string
  synopsis: string
  reason: string
  revisionId: string | null
  targets: MaterialTarget[]
}
const targetOf = (item: PlanningItem): MaterialTarget => ({
  kind: item.material.kind,
  id: item.material.id
})
const dragType = 'application/x-collie-plan'
type Drag =
  | { type: 'material'; targets: MaterialTarget[]; from: PlanningDestination | null }
  | { type: 'document' | 'topic'; id: string }

export function PlanWorkspace({ project }: { project: OpenProject }): React.JSX.Element {
  const session = useWorkspaceSession(),
    imports = useProjectImport(),
    conversations = useConversations()
  const scope = scopeOf(project)
  const { preferences: prefs, update, issue: preferenceIssue } = usePlanningPreferences(scope)
  const [revision, setRevision] = useState(0)
  const [issue, setIssue] = useState(''),
    [notice, setNotice] = useState('')
  const [selection, setSelection] = useState<PlanningItem[]>([])
  const [selectionFrom, setSelectionFrom] = useState<PlanningDestination | null>(null)
  const [relationOffset, setRelationOffset] = useState(0)
  const [destination, setDestination] = useState<string | null>(null)
  const [detail, setDetail] = useState<PlanningItem | null>(null)
  const [showAside, setShowAside] = useState(false)
  const [form, setForm, formRef] = useSynchronousState<Form | null>(null)
  const [busy, setBusy, busyRef] = useSynchronousState(false)
  const [pending, setPending, pendingRef] = useSynchronousState<PlanningChangeInput | null>(null)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 78rem)').matches)
  const root = useRef<HTMLElement>(null),
    materialPane = useRef<HTMLElement>(null),
    structurePane = useRef<HTMLElement>(null),
    detailPane = useRef<HTMLElement>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  const focusAfter = useRef<string | null>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRestored = useRef(false)
  const visible = session.destination.kind === 'workspace' && session.destination.view === 'plan'
  const requestedMaterial =
    visible && session.destination.kind === 'workspace' && session.destination.view === 'plan'
      ? session.destination.material
      : undefined
  const requestKey = requestedMaterial
    ? `${requestedMaterial.kind}:${requestedMaterial.id}:${session.focusRevision}`
    : ''
  const [dismissedTarget, setDismissedTarget] = useState('')
  const focusedMaterial = requestKey !== dismissedTarget ? requestedMaterial : undefined
  const [selectedRequest, setSelectedRequest] = useState('')
  const acceptedImport = useRef('')
  useEffect(() => {
    if (
      !visible ||
      !imports.accepted ||
      acceptedImport.current === imports.accepted.id ||
      !sameScope(project, imports.accepted.scope)
    )
      return
    acceptedImport.current = imports.accepted.id
    update({
      filter: 'unplaced',
      kind: 'all',
      status: 'all',
      query: '',
      poolOffset: 0,
      pane: 'material'
    })
    setDismissedTarget(requestKey)
    setRevision((n) => n + 1)
  }, [visible, imports.accepted, project, requestKey, update])
  const pool = usePlanningPage(
    {
      ...scope,
      location: { kind: 'pool' },
      filter: focusedMaterial ? 'all' : prefs.filter,
      kind: focusedMaterial ? 'all' : prefs.kind,
      status: focusedMaterial ? 'all' : prefs.status,
      query: focusedMaterial ? '' : prefs.query,
      offset: focusedMaterial ? 0 : prefs.poolOffset,
      ...(focusedMaterial ? { target: focusedMaterial } : {})
    },
    visible,
    `${project.headCommitId}:${revision}`
  )
  const preferredLocation = prefs.location
  const location =
    (preferredLocation.kind === 'chapter' &&
      !project.documents.some((d) => d.id === preferredLocation.id)) ||
    (preferredLocation.kind === 'topic' &&
      pool.view &&
      !pool.view.topics.some((t) => t.id === preferredLocation.id))
      ? { kind: 'pool' as const }
      : preferredLocation
  const contents = usePlanningPage(
    {
      ...scope,
      location,
      filter: showAside ? 'aside' : 'all',
      kind: 'all',
      status: 'all',
      query: '',
      offset: prefs.detailOffset
    },
    visible && location.kind !== 'pool',
    `${project.headCommitId}:${revision}`
  )
  const overview = pool.view
  const topics = overview?.topics ?? []
  const docs = project.documents.filter((d) => effectiveState(d, project.documents) === 'active')
  const parentId = docs.some((d) => d.id === prefs.parentId) ? prefs.parentId : null
  const siblings = docs
    .filter((d) => d.parentId === parentId)
    .sort((a, b) => a.position - b.position)
  const selectedDocument =
    location.kind === 'chapter' ? project.documents.find((d) => d.id === location.id) : null
  const selectedTopic = location.kind === 'topic' ? topics.find((t) => t.id === location.id) : null
  const unit = project.template === 'book' ? 'chapter' : 'section'
  const kind = project.template === 'book' ? ('chapter' as const) : ('text' as const)
  const unavailable =
    session.accessReadOnly ||
    session.accessTransition ||
    session.busy ||
    session.acting ||
    session.closing ||
    session.navigating ||
    session.fileActive ||
    session.storage.state !== 'ready'
  const locked =
    unavailable ||
    busy ||
    !!pending ||
    session.outlineRetry ||
    !!pool.issue ||
    !!contents.issue ||
    pool.loading ||
    (location.kind !== 'pool' && contents.loading)
  const selectionKey = `${project.projectId}:${project.workspaceId}:${JSON.stringify(location)}:${prefs.filter}:${prefs.kind}:${prefs.status}:${prefs.query}:${showAside}:${focusedMaterial ? requestKey : ''}`
  const [lastSelection, setLastSelection] = useState(selectionKey)
  if (lastSelection !== selectionKey) {
    setLastSelection(selectionKey)
    setSelection([])
  }
  if (focusedMaterial && !pool.loading && pool.view && selectedRequest !== requestKey) {
    setSelectedRequest(requestKey)
    const item = pool.view.items.find(
      (item) =>
        item.material.kind === focusedMaterial.kind && item.material.id === focusedMaterial.id
    )
    if (!item) {
      setIssue('This material is unavailable in the active library.')
    } else {
      setSelection([item])
      setSelectionFrom(null)
      setDetail(item)
      setNotice('Choose a chapter or topic, then Add to place this material.')
    }
  }
  useEffect(() => {
    const media = window.matchMedia('(max-width: 78rem)')
    const changed = (): void => setNarrow(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useLayoutEffect(() => {
    if (
      !visible ||
      busy ||
      pool.loading ||
      contents.loading ||
      !focusAfter.current ||
      document.hidden ||
      !document.hasFocus() ||
      !!document.querySelector('[role="dialog"], [role="alertdialog"]') ||
      session.composition.current
    )
      return
    const key = focusAfter.current
    focusAfter.current = null
    const card = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[data-material-key], [data-structure-key]') ?? []
    ).find((element) => element.dataset.materialKey === key || element.dataset.structureKey === key)
    const target =
      card?.querySelector<HTMLElement>('button') ??
      (prefs.pane === 'detail' ? detailPane.current : structurePane.current)
    if (target && !target.closest('[hidden],[inert]')) target.focus({ preventScroll: true })
  }, [
    visible,
    busy,
    pool.loading,
    contents.loading,
    prefs.pane,
    project.headCommitId,
    session.composition,
    focusRevision
  ])
  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    },
    []
  )
  useLayoutEffect(() => {
    if (!visible) {
      scrollRestored.current = false
      return
    }
    if (scrollRestored.current || pool.loading || contents.loading) return
    scrollRestored.current = true
    if (materialPane.current) materialPane.current.scrollTop = prefs.materialScroll
    if (structurePane.current) structurePane.current.scrollTop = prefs.structureScroll
    if (detailPane.current) detailPane.current.scrollTop = prefs.detailScroll
  }, [visible, pool.loading, contents.loading, prefs])
  function rememberScroll(
    field: 'materialScroll' | 'structureScroll' | 'detailScroll',
    position: number
  ): void {
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(
      () => update({ [field]: Math.max(0, Math.round(position)) }),
      160
    )
  }
  function choosePane(pane: 'material' | 'structure' | 'detail'): void {
    update({ pane })
    requestAnimationFrame(() =>
      (pane === 'material'
        ? materialPane.current
        : pane === 'structure'
          ? structurePane.current
          : detailPane.current
      )?.focus({ preventScroll: true })
    )
  }
  function chooseLocation(next: PlanningLocation): void {
    update({ location: next, detailOffset: 0, pane: 'structure' })
    setShowAside(false)
    setDetail(null)
    setIssue('')
  }
  function showItem(item: PlanningItem): void {
    setRelationOffset(0)
    setDetail(item)
    choosePane('detail')
  }
  function toggle(item: PlanningItem, origin: PlanningDestination | null): void {
    if (JSON.stringify(origin) !== JSON.stringify(selectionFrom)) {
      setSelectionFrom(origin)
      setSelection([item])
      return
    }
    setSelection((items) =>
      items.some((i) => itemKey(i) === itemKey(item))
        ? items.filter((i) => itemKey(i) !== itemKey(item))
        : items.length < PLANNING_SELECTION_LIMIT
          ? [...items, item]
          : items
    )
    if (
      !selection.some((i) => itemKey(i) === itemKey(item)) &&
      selection.length >= PLANNING_SELECTION_LIMIT
    )
      setIssue(`Choose up to ${PLANNING_SELECTION_LIMIT} items at a time.`)
  }
  function from(
    item: PlanningItem,
    origin: PlanningDestination | null
  ): PlanningDestination | null {
    if (!origin) return null
    return origin.kind === 'topic'
      ? origin
      : origin.kind === 'chapter' && item.material.documentIds.includes(origin.id)
        ? origin
        : null
  }
  const canMove =
    !!selectionFrom &&
    selection.length > 0 &&
    selection.every((item) => !!from(item, selectionFrom))
  const targets = selection.map(targetOf)
  function revealGroup(target: PlanningDestination): void {
    const currentDocs = session.current.current?.documents ?? project.documents
    if (target.kind === 'chapter') {
      const doc = currentDocs.find((d) => d.id === target.id)
      if (doc) {
        const level = currentDocs
          .filter((d) => d.parentId === doc.parentId && effectiveState(d, currentDocs) === 'active')
          .sort((a, b) => a.position - b.position)
        update({
          parentId: doc.parentId,
          chapterOffset:
            Math.floor(
              Math.max(
                0,
                level.findIndex((d) => d.id === doc.id)
              ) / MATERIAL_PAGE_SIZE
            ) * MATERIAL_PAGE_SIZE
        })
      }
    } else {
      const index = topics.findIndex((t) => t.id === target.id)
      update({
        topicOffset:
          Math.floor(Math.max(0, index < 0 ? topics.length : index) / MATERIAL_PAGE_SIZE) *
          MATERIAL_PAGE_SIZE
      })
    }
    update({ location: target, detailOffset: 0, pane: 'structure' })
    setShowAside(false)
    focusAfter.current = target.id
  }
  function finished(change: PlanningEdit, receipt: CommitReceipt): void {
    setForm(null)
    setSelection([])
    if (change.type === 'topic-chapter') {
      revealGroup({ kind: 'chapter', id: receipt.documentId })
      setShowAside(false)
      setNotice(`Created ${unit} with the topic’s material.`)
      focusAfter.current = receipt.documentId
    } else if (change.type === 'assign') {
      const destination = change.to ?? change.from!
      const title =
        destination.kind === 'chapter'
          ? project.documents.find((d) => d.id === destination.id)?.title
          : topics.find((t) => t.id === destination.id)?.title
      setNotice(
        `${change.to ? (change.from ? 'Moved' : 'Added') : 'Removed'} ${change.targets.length} material ${change.targets.length === 1 ? 'reference' : 'references'} ${change.to ? 'to' : 'from'} ${title ?? 'the selected group'}.`
      )
      if (change.to) revealGroup(change.to)
      else focusAfter.current = 'structure'
    } else if (change.type === 'topic-remove') {
      chooseLocation({ kind: 'pool' })
      setNotice('Topic removed. Its material is kept.')
    } else {
      setNotice(
        change.type === 'disposition'
          ? change.state === 'aside'
            ? 'Material set aside. Its originals and links are kept.'
            : change.state === 'develop'
              ? 'Material marked Needs development.'
              : 'Material restored to Keep.'
          : 'Topic updated.'
      )
      focusAfter.current =
        change.type === 'topic-create' ||
        change.type === 'topic-rename' ||
        change.type === 'topic-move'
          ? change.id
          : selection[0]
            ? itemKey(selection[0])
            : 'structure'
    }
    if (change.type === 'topic-create') revealGroup({ kind: 'topic', id: change.id })
    if (change.type === 'topic-move')
      update({ topicOffset: Math.floor(change.position / MATERIAL_PAGE_SIZE) * MATERIAL_PAGE_SIZE })
    setDetail(null)
  }
  async function refreshSaved(): Promise<void> {
    try {
      await session.afterNoteCommit()
    } catch {
      setIssue(
        'Plan could not refresh. Existing changes are retained; choose Refresh to try again.'
      )
    }
    setRevision((n) => n + 1)
  }
  async function refreshPlan(): Promise<void> {
    if (busyRef.current || pendingRef.current || session.navigating || session.closing) return
    setBusy(true)
    try {
      if (await session.flush(false, 'save', ['planning'])) await refreshSaved()
    } finally {
      setBusy(false)
    }
  }
  async function reconcile(): Promise<boolean> {
    const request = pendingRef.current
    if (busyRef.current) return false
    if (!request) return !formRef.current
    setBusy(true)
    try {
      const result = await window.collie.changePlanning({ ...request, action: 'status' })
      if (!result.ok) {
        setIssue(result.error.message)
        return false
      }
      setPending(null)
      await refreshSaved()
      if (result.value.receipt) {
        finished(request.change, result.value.receipt)
        setIssue('')
      } else setIssue('The change was not saved. You can try the action again.')
      return !formRef.current
    } catch {
      setIssue('The change could not be confirmed. Keep this project open and choose Check change.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const draftEvents = useRetainedDraft('planning', {
    read: () => ({
      scope: scopeOf(pendingRef.current ?? session.current.current ?? project),
      kind: 'planning',
      entityId: formRef.current?.id ?? null,
      label: 'Plan',
      dirty: !!formRef.current || busyRef.current,
      composing: false,
      busy: busyRef.current,
      pendingOperation: pendingRef.current,
      policy: formRef.current ? 'explicit' : 'flush',
      issue,
      target: {
        kind: 'workspace',
        scope: scopeOf(pendingRef.current ?? session.current.current ?? project),
        view: 'plan'
      }
    }),
    flush: reconcile,
    focus: () => {
      focusAfter.current = 'structure'
    }
  })
  async function apply(change: PlanningEdit): Promise<void> {
    if (locked || busyRef.current || pendingRef.current || session.composition.current) return
    setBusy(true)
    setIssue('')
    setNotice('')
    try {
      const saved = await session.flush(false, 'save', ['planning'])
      if (!saved || !sameScope(saved, project)) return
      const request: PlanningChangeInput = {
        ...scopeOf(saved),
        action: 'set',
        operationId: crypto.randomUUID(),
        expectedHead: saved.headCommitId,
        documentId: saved.documentId,
        change
      }
      setPending(request)
      const result = await window.collie.changePlanning(request)
      if (!result.ok) {
        setIssue(`${result.error.message} Choose Check change before trying again.`)
        return
      }
      if (!result.value.receipt) {
        setIssue('The change could not be confirmed. Choose Check change.')
        return
      }
      setPending(null)
      await refreshSaved()
      finished(change, result.value.receipt)
    } catch {
      setIssue(
        pendingRef.current
          ? 'The change could not be confirmed. Choose Check change.'
          : 'Current edits could not be protected. Resolve them before organizing material.'
      )
    } finally {
      setBusy(false)
    }
  }
  function outline(change?: OutlineChange, focusId = 'structure'): void {
    if ((locked && !session.outlineRetry) || busyRef.current || pendingRef.current) return
    setBusy(true)
    setIssue('')
    session.run(async () => {
      try {
        if (await session.performOutline(change, ['planning'])) {
          setForm(null)
          setNotice('Outline updated.')
          const currentDocs = session.current.current?.documents ?? []
          const changedId =
            change?.type === 'create'
              ? currentDocs.find((d) => !project.documents.some((prior) => prior.id === d.id))?.id
              : focusId
          if (changedId && changedId !== 'structure')
            revealGroup({ kind: 'chapter', id: changedId })
          else focusAfter.current = focusId
          setRevision((n) => n + 1)
        }
      } finally {
        setBusy(false)
      }
    })
  }
  function openOriginal(item: PlanningItem): void {
    const material = item.material
    if (material.kind === 'chat')
      void conversations
        .openConversation(material.id)
        .then((opened) => {
          if (!opened) setIssue('Finish the current chat action before opening this conversation.')
        })
        .catch(() => setIssue('The conversation could not be opened. Try again.'))
    else if (material.kind === 'note') session.research({ kind: 'notes', noteId: material.id })
    else
      session.research({
        kind: 'inspector',
        sourceId: material.sourceId ?? material.id,
        ...(material.kind === 'excerpt'
          ? { excerptId: material.id, versionId: material.versionId! }
          : {})
      })
  }
  function edit(
    type: Form['type'],
    doc?: OutlineDocument,
    topic?: { id: string; title: string },
    items = selection
  ): void {
    if (locked || formRef.current) return
    setForm({
      type,
      id: doc?.id ?? topic?.id ?? crypto.randomUUID(),
      title: doc?.title ?? topic?.title ?? '',
      synopsis: doc?.synopsis ?? '',
      reason: items.length === 1 ? items[0].reason : '',
      revisionId: doc?.revisionId ?? null,
      targets: items.map(targetOf)
    })
  }
  function submitForm(): void {
    const value = formRef.current
    if (!value || busyRef.current) return
    if (value.type === 'paste') {
      void collectText(value.synopsis)
      return
    }
    if (session.outlineRetry) {
      outline(undefined)
      return
    }
    if (value.type === 'development') {
      void apply({
        type: 'disposition',
        targets: value.targets,
        state: 'develop',
        reason: value.reason
      })
      return
    }
    if (!value.title.trim()) return
    if (value.type === 'topic-create' || value.type === 'topic-rename') {
      void apply({ type: value.type, id: value.id, title: value.title })
      return
    }
    if (value.type === 'document-create') {
      outline({ type: 'create', title: value.title, kind, parentId })
      return
    }
    const doc = project.documents.find((d) => d.id === value.id)
    if (!doc || doc.revisionId !== value.revisionId) {
      setIssue(
        'This outline item changed. Keep your draft, then cancel and reopen its current details before saving.'
      )
      return
    }
    outline(
      {
        type: 'details',
        documentId: doc.id,
        title: value.title,
        synopsis: value.synopsis,
        status: doc.status as 'draft' | 'review' | 'complete'
      },
      doc.id
    )
  }
  async function collectText(text: string): Promise<void> {
    if (locked || !text.trim()) return
    if (text.length > 100_000) {
      setIssue('Paste up to 100,000 characters, or import a text file.')
      return
    }
    const trimmed = text.trim()
    const url = trimmed.length <= 2000 && safeLink(trimmed) ? trimmed : undefined
    const retained = formRef.current ?? {
      type: 'paste' as const,
      id: crypto.randomUUID(),
      title: '',
      synopsis: text,
      reason: '',
      revisionId: null,
      targets: []
    }
    setForm(null)
    try {
      const opened = await session.navigate({
        kind: 'workspace',
        scope,
        view: 'research',
        target: url
          ? { kind: 'sources', create: { id: retained.id, url } }
          : { kind: 'notes', create: retained.id, text }
      })
      if (!opened) setForm(retained)
    } catch {
      setForm(retained)
      setIssue('Material could not be opened. Your pasted text is kept here; try again.')
    }
  }
  const destinations = [
    ...docs.map((d) => ({
      value: `chapter:${d.id}`,
      label: `${d.kind === 'part' ? 'Part' : d.kind === 'chapter' ? 'Chapter' : 'Section'} · ${d.title}`
    })),
    ...topics.map((t) => ({ value: `topic:${t.id}`, label: `Topic · ${t.title}` }))
  ]
  function chosenDestination(): PlanningDestination | null {
    if (!destination) return null
    const [kind, id] = destination.split(':')
    const result = { kind, id }
    return isPlanningDestination(result) ? result : null
  }
  function assign(move: boolean): void {
    const to = chosenDestination()
    if (to && targets.length)
      void apply({ type: 'assign', targets, to, from: move ? selectionFrom : null })
  }
  function startDrag(event: React.DragEvent, drag: Drag): void {
    if (locked) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(dragType, JSON.stringify({ ...scope, ...drag }))
    event.dataTransfer.effectAllowed = 'copyMove'
  }
  function acceptDrag(event: React.DragEvent): void {
    if (!locked && event.dataTransfer.types.includes(dragType)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }
  function drop(event: React.DragEvent, to: PlanningDestination): void {
    if (locked) return
    event.preventDefault()
    event.stopPropagation()
    try {
      const raw = event.dataTransfer.getData(dragType)
      if (raw.length > 20000) return
      const value: unknown = JSON.parse(raw)
      if (
        !record(value) ||
        value.projectId !== project.projectId ||
        value.workspaceId !== project.workspaceId
      )
        return
      if (
        value.type === 'material' &&
        exact(value, ['projectId', 'workspaceId', 'type', 'targets', 'from']) &&
        Array.isArray(value.targets) &&
        value.targets.length &&
        value.targets.length <= PLANNING_SELECTION_LIMIT &&
        value.targets.every(isMaterialTarget) &&
        (value.from === null || isPlanningDestination(value.from))
      ) {
        if (value.from?.kind === to.kind && value.from.id === to.id) return
        void apply({ type: 'assign', targets: value.targets, to, from: value.from })
        return
      }
      if (!exact(value, ['projectId', 'workspaceId', 'type', 'id']) || !isId(value.id)) return
      if (value.type === 'document' && to.kind === 'chapter') {
        const source = docs.find((d) => d.id === value.id),
          target = docs.find((d) => d.id === to.id)
        if (source && target && source.id !== target.id && source.parentId === target.parentId)
          outline(
            {
              type: 'move',
              documentId: source.id,
              parentId: source.parentId,
              position: target.position - (source.position < target.position ? 1 : 0)
            },
            source.id
          )
      } else if (value.type === 'topic' && to.kind === 'topic') {
        const source = topics.find((t) => t.id === value.id),
          target = topics.find((t) => t.id === to.id)
        if (source && target && source.id !== target.id)
          void apply({
            type: 'topic-move',
            id: source.id,
            position: target.position - (source.position < target.position ? 1 : 0)
          })
      }
    } catch {
      setIssue('That card could not be placed. Use Add to or Move to instead.')
    }
  }
  function cards(
    items: PlanningItem[],
    origin: PlanningDestination | null = null
  ): React.JSX.Element {
    return (
      <ul className={styles['material-list']}>
        {items.map((item) => (
          <MaterialCard
            key={itemKey(item)}
            item={item}
            selected={selection.some((i) => itemKey(i) === itemKey(item))}
            disabled={locked}
            toggle={() => toggle(item, origin)}
            association={
              origin?.kind === 'chapter'
                ? item.material.documentIds.includes(origin.id)
                  ? 'Directly linked here'
                  : `Inherited from ${
                      contents.view?.scopes
                        .filter((s) => item.material.documentIds.includes(s.id))
                        .map((s) => s.title)
                        .join(' / ') ?? 'parent'
                    }`
                : undefined
            }
            open={() => showItem(item)}
            drag={(event) => {
              const items =
                selection.some((i) => itemKey(i) === itemKey(item)) &&
                JSON.stringify(selectionFrom) === JSON.stringify(origin)
                  ? selection
                  : [item]
              const source = items.every((i) => !!from(i, origin)) ? origin : null
              startDrag(event, { type: 'material', targets: items.map(targetOf), from: source })
            }}
            actions={[
              { id: 'open', label: 'Open original', onSelect: () => openOriginal(item) },
              {
                id: 'use',
                label: 'Add to chapter or topic…',
                onSelect: () => {
                  setSelectionFrom(origin)
                  setSelection([item])
                  choosePane('structure')
                }
              },
              {
                id: 'develop',
                label: 'Needs development…',
                onSelect: () => edit('development', undefined, undefined, [item])
              },
              {
                id: 'aside',
                label: item.disposition === 'aside' ? 'Restore to Keep' : 'Set aside',
                onSelect: () =>
                  void apply({
                    type: 'disposition',
                    targets: [targetOf(item)],
                    state: item.disposition === 'aside' ? 'keep' : 'aside',
                    reason: ''
                  })
              }
            ]}
          />
        ))}
      </ul>
    )
  }
  const breadcrumbs: OutlineDocument[] = []
  let ancestor = project.documents.find((d) => d.id === parentId)
  while (ancestor && breadcrumbs.length < 8) {
    breadcrumbs.unshift(ancestor)
    ancestor = project.documents.find((d) => d.id === ancestor!.parentId)
  }
  return (
    <section
      ref={root}
      tabIndex={-1}
      aria-label="Project plan"
      className={styles['plan-workspace']}
      {...draftEvents}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = locked || imports.busy ? 'none' : 'copy'
        }
      }}
      onDropCapture={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        if (!locked && !imports.busy)
          imports.dropFiles(root.current!, Array.from(event.dataTransfer.files))
      }}
      onPaste={(event) => {
        if (
          locked ||
          form ||
          (event.target instanceof Element &&
            event.target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))
        )
          return
        const text = event.clipboardData.getData('text/plain')
        if (text.trim()) {
          event.preventDefault()
          void collectText(text)
        }
      }}
    >
      <header className={styles['plan-header']}>
        <div>
          <h1>{project.title}</h1>
          <p>Plan your structure</p>
        </div>
        <div className={styles['plan-actions']}>
          <WorkspaceModeSwitch />
          <SaveMenu />
          <AppButton variant="subtle" onClick={() => session.research({ kind: 'sources' })}>
            Research
          </AppButton>
        </div>
      </header>
      <div className={styles['plan-actions']}>
        <AppButton
          variant="default"
          disabled={locked || imports.busy}
          onClick={(event) => imports.open(event.currentTarget)}
        >
          Import material
        </AppButton>
        <AppButton
          variant="subtle"
          disabled={locked}
          onClick={() => session.research({ kind: 'notes', create: crypto.randomUUID() })}
        >
          Add note
        </AppButton>
        <AppButton variant="subtle" disabled={locked} onClick={() => edit('paste')}>
          Paste as note
        </AppButton>
        <AppButton
          variant="subtle"
          disabled={locked}
          onClick={() => session.research({ kind: 'sources', create: { id: crypto.randomUUID() } })}
        >
          Add source
        </AppButton>
        <AppButton variant="subtle" disabled={busy || !!pending} onClick={() => void refreshPlan()}>
          Refresh
        </AppButton>
      </div>
      <p className={styles['collection-hint']}>
        Drop files here to import, or paste an idea. A pasted URL opens source details.
      </p>
      {focusedMaterial ? (
        <p role="status">
          Showing chosen material.{' '}
          <AppButton
            variant="subtle"
            size="compact-sm"
            onClick={() => setDismissedTarget(requestKey)}
          >
            Show all material
          </AppButton>
        </p>
      ) : null}
      {issue || pool.issue || contents.issue ? (
        <p role="alert">{issue || pool.issue || contents.issue}</p>
      ) : null}
      {preferenceIssue ? <p role="status">{preferenceIssue}</p> : null}
      <p className={styles['plan-announcement']} role="status" aria-live="polite">
        {busy ? 'Saving Plan…' : notice}
      </p>
      {pending ? (
        <AppButton disabled={busy} variant="default" onClick={() => void reconcile()}>
          Check change
        </AppButton>
      ) : null}
      {overview?.libraryTotal === 0 ? (
        <p>Start with a note or import material. Your existing chapters are ready below.</p>
      ) : null}
      {narrow ? (
        <nav className={styles['plan-actions']} aria-label="Planning panes">
          {(['material', 'structure', 'detail'] as const).map((pane) => (
            <AppButton
              key={pane}
              variant={prefs.pane === pane ? 'default' : 'subtle'}
              aria-pressed={prefs.pane === pane}
              onClick={() => choosePane(pane)}
            >
              {pane === 'material' ? 'Material' : pane === 'structure' ? 'Structure' : 'Details'}
            </AppButton>
          ))}
        </nav>
      ) : null}
      {selection.length ? (
        <section className={styles['selection-actions']} aria-label="Selected material">
          <strong>{selection.length} selected</strong>
          <Select
            label="Destination"
            searchable
            limit={20}
            data={destinations}
            value={destination}
            onChange={setDestination}
            clearable
            disabled={locked}
          />
          <div className={styles['plan-actions']}>
            <AppButton disabled={locked || !chosenDestination()} onClick={() => assign(false)}>
              Add to
            </AppButton>
            {canMove ? (
              <>
                <AppButton
                  variant="default"
                  disabled={locked || !chosenDestination()}
                  onClick={() => assign(true)}
                >
                  Move to
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={locked}
                  onClick={() =>
                    void apply({ type: 'assign', targets, to: null, from: selectionFrom })
                  }
                >
                  Remove from {selectionFrom?.kind === 'topic' ? 'topic' : 'chapter'}
                </AppButton>
              </>
            ) : null}
            <ActionMenu
              label="Editorial status"
              disabled={locked}
              actions={[
                {
                  id: 'keep',
                  label: 'Keep',
                  onSelect: () =>
                    void apply({ type: 'disposition', targets, state: 'keep', reason: '' })
                },
                { id: 'develop', label: 'Needs development…', onSelect: () => edit('development') },
                {
                  id: 'aside',
                  label: 'Set aside',
                  onSelect: () =>
                    void apply({ type: 'disposition', targets, state: 'aside', reason: '' })
                }
              ]}
            />
            <AppButton variant="subtle" disabled={busy} onClick={() => setSelection([])}>
              Clear selection
            </AppButton>
          </div>
        </section>
      ) : null}
      <div className={styles['plan-layout']} data-detail={!!detail}>
        <section
          ref={materialPane}
          className={styles['material-pane']}
          onScroll={(event) => rememberScroll('materialScroll', event.currentTarget.scrollTop)}
          tabIndex={-1}
          aria-label="Project material"
          hidden={narrow && prefs.pane !== 'material'}
          inert={narrow && prefs.pane !== 'material'}
        >
          <h2>Material</h2>
          <TextInput
            label="Find by title"
            disabled={!!focusedMaterial}
            value={prefs.query}
            maxLength={200}
            onChange={(event) => update({ query: event.currentTarget.value, poolOffset: 0 })}
          />
          <SelectField
            label="Show material"
            disabled={!!focusedMaterial}
            value={prefs.filter}
            onChange={(event) =>
              update({ filter: event.currentTarget.value as typeof prefs.filter, poolOffset: 0 })
            }
          >
            <option value="unplaced">Unplaced</option>
            <option value="all">All</option>
            <option value="aside">Set aside</option>
          </SelectField>
          <div className={styles['material-filters']}>
            <SelectField
              label="Type"
              disabled={!!focusedMaterial}
              value={prefs.kind}
              onChange={(event) =>
                update({ kind: event.currentTarget.value as typeof prefs.kind, poolOffset: 0 })
              }
            >
              <option value="all">All types</option>
              {Object.entries(materialLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Status"
              disabled={!!focusedMaterial}
              value={prefs.status}
              onChange={(event) =>
                update({ status: event.currentTarget.value as typeof prefs.status, poolOffset: 0 })
              }
            >
              <option value="all">Any status</option>
              <option value="develop">Needs development</option>
            </SelectField>
          </div>
          {pool.loading ? <p role="status">Loading material…</p> : null}
          {overview ? (
            <>
              {!overview.total ? (
                <p>
                  {prefs.filter === 'unplaced'
                    ? 'No matching unplaced material. Choose All to see assigned items.'
                    : 'No matching material.'}
                </p>
              ) : null}
              {cards(overview.items)}
              <PlanningPager
                label="Material"
                offset={focusedMaterial ? 0 : prefs.poolOffset}
                total={overview.total}
                change={(poolOffset) => update({ poolOffset })}
              />
            </>
          ) : null}
        </section>
        <section
          ref={structurePane}
          className={styles['structure-pane']}
          onScroll={(event) => rememberScroll('structureScroll', event.currentTarget.scrollTop)}
          tabIndex={-1}
          aria-label="Structure"
          hidden={narrow && prefs.pane !== 'structure'}
          inert={narrow && prefs.pane !== 'structure'}
        >
          <div className={styles['plan-actions']}>
            <h2>Structure</h2>
            <AppButton
              leftSection={<IconPlus size={16} aria-hidden="true" />}
              variant="subtle"
              disabled={locked}
              onClick={() => edit('topic-create')}
            >
              Topic
            </AppButton>
            <AppButton
              leftSection={<IconPlus size={16} aria-hidden="true" />}
              variant="subtle"
              disabled={locked}
              onClick={() => edit('document-create')}
            >
              {unit === 'chapter' ? 'Chapter' : 'Section'}
            </AppButton>
          </div>
          {topics.length ? (
            <details open>
              <summary>Topics ({topics.length})</summary>
              <div className={styles['chapter-grid']}>
                {topics
                  .slice(prefs.topicOffset, prefs.topicOffset + MATERIAL_PAGE_SIZE)
                  .map((topic) => (
                    <article
                      key={topic.id}
                      className={styles['structure-card']}
                      data-structure-key={topic.id}
                      data-selected={location.kind === 'topic' && location.id === topic.id}
                      draggable={!locked}
                      onDragStart={(event) => startDrag(event, { type: 'topic', id: topic.id })}
                      onDragOver={acceptDrag}
                      onDrop={(event) => drop(event, { kind: 'topic', id: topic.id })}
                    >
                      <div className={styles['card-heading']}>
                        <AppButton
                          className={styles['card-title']}
                          variant="subtle"
                          onClick={() => chooseLocation({ kind: 'topic', id: topic.id })}
                        >
                          {topic.title}
                        </AppButton>
                        <ActionMenu
                          label="Topic actions"
                          accessibleLabel={`Actions for topic ${topic.title}`}
                          icon={<IconDots aria-hidden="true" />}
                          disabled={locked}
                          actions={[
                            {
                              id: 'rename',
                              label: 'Rename topic',
                              onSelect: () => edit('topic-rename', undefined, topic)
                            },
                            {
                              id: 'chapter',
                              label: `Make ${unit}`,
                              onSelect: () =>
                                void apply({ type: 'topic-chapter', id: topic.id, parentId, kind })
                            },
                            {
                              id: 'remove',
                              label: 'Remove topic (keep material)',
                              onSelect: () => void apply({ type: 'topic-remove', id: topic.id })
                            }
                          ]}
                        />
                      </div>
                      <p>
                        {topic.count} items
                        {topic.developCount ? ` · ${topic.developCount} need development` : ''}
                        {topic.asideCount ? ` · ${topic.asideCount} set aside` : ''}
                      </p>
                      <div className={styles['plan-actions']}>
                        <IconButton
                          label={`Move ${topic.title} earlier`}
                          variant="subtle"
                          disabled={locked || !topic.position}
                          onClick={() =>
                            void apply({
                              type: 'topic-move',
                              id: topic.id,
                              position: topic.position - 1
                            })
                          }
                        >
                          <IconArrowUp aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Move ${topic.title} later`}
                          variant="subtle"
                          disabled={locked || topic.position === topics.length - 1}
                          onClick={() =>
                            void apply({
                              type: 'topic-move',
                              id: topic.id,
                              position: topic.position + 1
                            })
                          }
                        >
                          <IconArrowDown aria-hidden="true" />
                        </IconButton>
                      </div>
                    </article>
                  ))}
              </div>
              <PlanningPager
                label="Topics"
                total={topics.length}
                offset={prefs.topicOffset}
                change={(topicOffset) => update({ topicOffset })}
              />
            </details>
          ) : null}
          <nav className={styles['plan-actions']} aria-label="Outline level">
            <AppButton
              variant="subtle"
              onClick={() => update({ parentId: null, chapterOffset: 0 })}
            >
              All {unit === 'chapter' ? 'chapters' : 'sections'}
            </AppButton>
            {breadcrumbs.map((d) => (
              <AppButton
                variant="subtle"
                key={d.id}
                onClick={() => update({ parentId: d.id, chapterOffset: 0 })}
              >
                {d.title}
              </AppButton>
            ))}
          </nav>
          <div className={styles['chapter-grid']}>
            {siblings
              .slice(prefs.chapterOffset, prefs.chapterOffset + MATERIAL_PAGE_SIZE)
              .map((doc, index) => {
                const position = prefs.chapterOffset + index,
                  count = overview?.chapters.find((c) => c.id === doc.id)
                return (
                  <article
                    key={doc.id}
                    className={styles['structure-card']}
                    data-structure-key={doc.id}
                    data-selected={location.kind === 'chapter' && location.id === doc.id}
                    draggable={!locked}
                    onDragStart={(event) => startDrag(event, { type: 'document', id: doc.id })}
                    onDragOver={acceptDrag}
                    onDrop={(event) => drop(event, { kind: 'chapter', id: doc.id })}
                  >
                    <div className={styles['card-heading']}>
                      <AppButton
                        variant="subtle"
                        className={styles['card-title']}
                        onClick={() => chooseLocation({ kind: 'chapter', id: doc.id })}
                      >
                        {position + 1}. {doc.title}
                      </AppButton>
                      <ActionMenu
                        label="Outline item actions"
                        accessibleLabel={`Actions for ${doc.title}`}
                        icon={<IconDots aria-hidden="true" />}
                        disabled={locked}
                        actions={[
                          {
                            id: 'details',
                            label: 'Edit title and purpose',
                            onSelect: () => edit('document-edit', doc)
                          },
                          ...(doc.kind !== 'part'
                            ? [
                                {
                                  id: 'write',
                                  label: 'Write here',
                                  onSelect: () => void session.navigateSection(doc.id)
                                }
                              ]
                            : [])
                        ]}
                      />
                    </div>
                    <p className={styles['card-state']}>
                      {doc.kind === 'part'
                        ? 'Part'
                        : doc.kind === 'chapter'
                          ? 'Chapter'
                          : 'Section'}{' '}
                      · {count?.count ?? 0} items
                      {count?.developCount ? ` · ${count.developCount} need development` : ''}
                    </p>
                    {doc.synopsis ? <p className={styles['card-preview']}>{doc.synopsis}</p> : null}
                    <div className={styles['plan-actions']}>
                      <IconButton
                        label={`Move ${doc.title} earlier`}
                        variant="subtle"
                        disabled={locked || position === 0}
                        onClick={() =>
                          outline(
                            {
                              type: 'move',
                              documentId: doc.id,
                              parentId: doc.parentId,
                              position: siblings[position - 1].position
                            },
                            doc.id
                          )
                        }
                      >
                        <IconArrowUp aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Move ${doc.title} later`}
                        variant="subtle"
                        disabled={locked || position === siblings.length - 1}
                        onClick={() =>
                          outline(
                            {
                              type: 'move',
                              documentId: doc.id,
                              parentId: doc.parentId,
                              position: siblings[position + 1].position
                            },
                            doc.id
                          )
                        }
                      >
                        <IconArrowDown aria-hidden="true" />
                      </IconButton>
                      {docs.some((d) => d.parentId === doc.id) || doc.kind === 'part' ? (
                        <AppButton
                          variant="subtle"
                          onClick={() => update({ parentId: doc.id, chapterOffset: 0 })}
                        >
                          Show sections
                        </AppButton>
                      ) : null}
                    </div>
                  </article>
                )
              })}
          </div>
          {!siblings.length ? <p>No outline items at this level. Add a {unit} to begin.</p> : null}
          <PlanningPager
            label="Outline"
            total={siblings.length}
            offset={prefs.chapterOffset}
            change={(chapterOffset) => update({ chapterOffset })}
          />
          {location.kind !== 'pool' ? (
            <section className={styles['chapter-contents']} aria-label="Selected group material">
              <div className={styles['plan-actions']}>
                <h3>{selectedDocument?.title ?? selectedTopic?.title ?? 'Selected group'}</h3>
                <AppButton variant="subtle" onClick={() => chooseLocation({ kind: 'pool' })}>
                  Close material
                </AppButton>
              </div>
              {contents.view?.scopes.length ? (
                <p>
                  {contents.view.scopes.map((s) => s.title).join(' / ')} · Direct material first,
                  then inherited parent material.
                </p>
              ) : null}
              <Checkbox
                label="Show set-aside material"
                checked={showAside}
                onChange={(event) => {
                  setShowAside(event.currentTarget.checked)
                  update({ detailOffset: 0 })
                }}
              />
              {contents.loading ? <p role="status">Loading linked material…</p> : null}
              {contents.view ? (
                <>
                  {!contents.view.total ? (
                    <p>
                      {showAside
                        ? 'No set-aside material here.'
                        : 'No material linked here yet. Select items and use Add to, or drag cards here.'}
                    </p>
                  ) : null}
                  {cards(contents.view.items, location)}
                  <PlanningPager
                    label="Linked material"
                    total={contents.view.total}
                    offset={prefs.detailOffset}
                    change={(detailOffset) => update({ detailOffset })}
                  />
                </>
              ) : null}
            </section>
          ) : null}
        </section>
        <section
          ref={detailPane}
          className={styles['detail-pane']}
          onScroll={(event) => rememberScroll('detailScroll', event.currentTarget.scrollTop)}
          tabIndex={-1}
          aria-label="Material detail"
          hidden={narrow ? prefs.pane !== 'detail' : !detail}
          inert={narrow ? prefs.pane !== 'detail' : !detail}
        >
          {detail ? (
            <>
              <h2>{detail.material.title || 'Material'}</h2>
              <p>
                {materialLabel[detail.material.kind]}
                {detail.material.state !== 'active' ? ` · ${detail.material.state}` : ''}
              </p>
              <p className={styles['detail-preview']}>
                {detail.material.preview || 'Open the original to read this material.'}
              </p>
              {detail.disposition !== 'keep' ? (
                <p>
                  {detail.disposition === 'develop' ? 'Needs development' : 'Set aside'}
                  {detail.reason ? ` · ${detail.reason}` : ''}
                </p>
              ) : null}
              {detail.material.originDocumentId ? (
                <p>
                  Chat started in{' '}
                  {project.documents.find((d) => d.id === detail.material.originDocumentId)
                    ?.title ?? 'a retained outline item'}
                  .
                </p>
              ) : null}
              <h3>Used in</h3>
              <ul>
                {[
                  ...detail.material.documentIds.map((id) => ({
                    id: `document:${id}`,
                    title: `${project.documents.find((d) => d.id === id)?.title ?? 'Retained outline item'}${location.kind === 'chapter' && id !== location.id && contents.view?.scopes.some((s) => s.id === id) ? ' · Inherited' : ''}`
                  })),
                  ...detail.topicIds.map((id) => ({
                    id: `topic:${id}`,
                    title: `Topic · ${topics.find((t) => t.id === id)?.title ?? 'Retained topic'}`
                  }))
                ]
                  .slice(relationOffset, relationOffset + MATERIAL_PAGE_SIZE)
                  .map((entry) => (
                    <li key={entry.id}>{entry.title}</li>
                  ))}
              </ul>
              <PlanningPager
                label="Material uses"
                total={detail.material.documentIds.length + detail.topicIds.length}
                offset={relationOffset}
                change={setRelationOffset}
              />
              <AppButton variant="default" onClick={() => openOriginal(detail)}>
                Open original
              </AppButton>
              <AppButton
                variant="subtle"
                disabled={locked}
                onClick={() => {
                  setSelectionFrom(null)
                  setSelection([detail])
                  choosePane('structure')
                }}
              >
                Also use in…
              </AppButton>
              <AppButton
                variant="subtle"
                onClick={() => {
                  setDetail(null)
                  choosePane('structure')
                }}
              >
                Return to structure
              </AppButton>
            </>
          ) : (
            <p>Select material to see its preview and original references.</p>
          )}
        </section>
      </div>
      <AppDialog
        onExited={() => setFocusRevision((n) => n + 1)}
        opened={!!form}
        onClose={() => {
          if (!busy && !pending && !session.outlineRetry) setForm(null)
        }}
        dismissible={!busy && !pending && !session.outlineRetry}
        title={
          form?.type === 'paste'
            ? 'Paste as note'
            : form?.type === 'development'
              ? 'Needs development'
              : form?.type === 'document-edit'
                ? 'Edit title and purpose'
                : form?.type === 'document-create'
                  ? `Add ${unit}`
                  : form?.type === 'topic-rename'
                    ? 'Rename topic'
                    : 'Add topic'
        }
      >
        {form ? (
          <form
            className={styles['plan-form']}
            onSubmit={(event) => {
              event.preventDefault()
              submitForm()
            }}
          >
            {form.type === 'paste' ? (
              <Textarea
                label="Idea or URL"
                description="Text becomes a note. A URL opens source details."
                value={form.synopsis}
                maxLength={100000}
                minRows={6}
                autosize
                data-autofocus
                onChange={(event) => setForm({ ...form, synopsis: event.currentTarget.value })}
              />
            ) : form.type === 'development' ? (
              <Textarea
                label="What needs work? (optional)"
                maxLength={1000}
                value={form.reason}
                disabled={busy || !!pending}
                onChange={(event) => setForm({ ...form, reason: event.currentTarget.value })}
                data-autofocus
              />
            ) : (
              <TextInput
                label="Title"
                required
                maxLength={500}
                value={form.title}
                disabled={busy || !!pending}
                onChange={(event) => setForm({ ...form, title: event.currentTarget.value })}
                data-autofocus
              />
            )}
            {form.type === 'document-edit' ? (
              <Textarea
                label="Purpose"
                maxLength={10000}
                autosize
                minRows={3}
                value={form.synopsis}
                disabled={busy || !!pending}
                onChange={(event) => setForm({ ...form, synopsis: event.currentTarget.value })}
              />
            ) : null}
            {issue ? <p role="alert">{issue}</p> : null}
            {pending ? (
              <AppButton disabled={busy} variant="default" onClick={() => void reconcile()}>
                Check change
              </AppButton>
            ) : (
              <AppButton type="submit" disabled={busy || unavailable}>
                {form.type === 'paste'
                  ? 'Add material'
                  : session.outlineRetry
                    ? 'Retry outline change'
                    : 'Save'}
              </AppButton>
            )}
            <AppButton
              variant="subtle"
              disabled={busy || !!pending || session.outlineRetry}
              onClick={() => setForm(null)}
            >
              Cancel
            </AppButton>
          </form>
        ) : null}
      </AppDialog>
    </section>
  )
}
