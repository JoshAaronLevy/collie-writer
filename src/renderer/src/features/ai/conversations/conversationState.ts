import type { ConversationContextPolicy } from '../../../../../shared/conversation-context'
import { effectiveState, isEditableKind } from '../../../../../shared/outline'
import { selectedChat, rememberChat } from './selected-chat'
import type { AiActionAvailability } from '../../../../../shared/ai-route'
import { useCallback, useMemo } from 'react'
type ConversationControllerState = {
  items: Conversation[]
  total: number
  currentItems: Conversation[]
  currentTotal: number
  currentLabel: string | null
  currentOffset: number
  setCurrentOffset: React.Dispatch<React.SetStateAction<number>>
  listOpen: boolean
  backToList: () => void
  listLoading: boolean
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
  view: 'active' | 'archived'
  setView: React.Dispatch<React.SetStateAction<'active' | 'archived'>>
  offset: number
  setOffset: React.Dispatch<React.SetStateAction<number>>
  selected: string | null
  page: {
    type: 'page'
    conversation: Conversation
    turns: ConversationTurn[]
    olderThan: number | null
    totalMessages: number
  } | null
  before: number | null
  setBefore: React.Dispatch<React.SetStateAction<number | null>>
  draft: Draft
  update: (patch: Partial<Draft>) => void
  drafts: Record<string, Draft>
  rename: string
  setRename: React.Dispatch<React.SetStateAction<string>>
  issue: string
  notice: string
  busy: boolean
  loading: boolean
  pending: ConversationRequest | null
  readOnly: boolean
  active: boolean
  run: ConversationEvent | null
  canSend: boolean
  capability: AiActionAvailability | undefined
  scope: OpenInput | null
  scroll: React.RefObject<Map<string, number>>
  composerRef: React.RefObject<HTMLTextAreaElement | null>
  choose: (id: string) => void
  change: (kind: 'create' | 'rename' | 'archive' | 'restore') => void
  send: () => Promise<void>
  retryAsNew: (t: ConversationTurn) => void
  show: (attemptId?: string) => void
  request: (input: ConversationRequest) => Promise<void>
  refresh: (captured: OpenInput) => Promise<void>
  composingRef: React.RefObject<boolean>
  draftEvents: { onCompositionStartCapture: () => void; onCompositionEndCapture: () => void }
  retry: () => undefined
  clear: () => void
  recover: () => undefined
  cancel: (attemptId: string) => undefined
  protect: (attemptId: string) => undefined
  exportTranscript: (includeContext: boolean) => undefined
  capacity: 64
}
import { useLayoutEffect } from 'react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AI_LIMITS } from '../../../../../shared/ai'
import {
  type Conversation,
  type ConversationEvent,
  type ConversationRequest,
  type ConversationReview,
  type ConversationTurn,
  type ConversationValue
} from '../../../../../shared/conversations'
import type { OpenInput } from '../../../../../shared/projects'
import { sameScope } from '../../../../../shared/project-files'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { scopeOf } from '../../workspace/useWorkspaceController'
import { useRetainedDraft } from '../../workspace/DraftOwner'
import { useAiConnections } from '../../ai-connections/connectionState'
import { editorIsComposing } from '../../../editor/adapter'
import { reviewConnection, sameReviewConnection } from '../review-connection'

type Draft = { text: string; contextPolicy: ConversationContextPolicy }
const sizeMessage =
  'This chat or writing is too long to send in full. In Context, choose This chat only to leave out writing, or Message only to explicitly leave out earlier messages. You can also start a new chat. Your draft and full history are kept.'
const emptyDraft = (): Draft => ({ text: '', contextPolicy: 'project' })
function originOf(project: ReturnType<typeof useWorkspaceSession>['project']): string | null {
  const doc = project?.documents.find((d) => d.id === project.documentId)
  return project &&
    doc &&
    isEditableKind(doc.kind) &&
    effectiveState(doc, project.documents) === 'active'
    ? doc.id
    : null
}
const activeStates = ['preparing', 'running', 'stopping']
export function useConversationController(): ConversationControllerState {
  const session = useWorkspaceSession(),
    connections = useAiConnections()
  const [items, setItems] = useState<Conversation[]>([]),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(''),
    [view, setView] = useState<'active' | 'archived'>('active'),
    [offset, setOffset] = useState(0)
  const [currentItems, setCurrentItems] = useState<Conversation[]>([]),
    [currentTotal, setCurrentTotal] = useState(0),
    [currentOffset, setCurrentOffset] = useState(0),
    [listOpen, setListOpen] = useState(true),
    [listLoading, setListLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null),
    [page, setPage] = useState<Extract<ConversationValue, { type: 'page' }> | null>(null),
    [before, setBefore] = useState<number | null>(null)
  const [readRevision, setReadRevision] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [rename, setRename] = useState('')
  const [issue, setIssue] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [run, setRun] = useState<ConversationEvent | null>(null)
  const [pending, setPending] = useState<ConversationRequest | null>(null)
  const connectionRef = useRef(connections)
  useLayoutEffect(() => {
    connectionRef.current = connections
  })
  const current = useRef(session),
    state = useRef({ selected, query, view, offset, currentOffset, before, rename }),
    locked = useRef(false),
    pendingRef = useRef<ConversationRequest | null>(null)
  const readSequence = useRef(0),
    listSequence = useRef(0),
    groupGeneration = useRef(0),
    refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newChatFocus = useRef<string | null>(null)
  const scroll = useRef(new Map<string, number>()),
    composer = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false)
  useLayoutEffect(() => {
    current.current = session
  })
  useLayoutEffect(() => {
    state.current = { selected, query, view, offset, currentOffset, before, rename }
  })
  useLayoutEffect(() => {
    pendingRef.current = pending
  })
  const project = session.project,
    projectId = project?.projectId,
    workspaceId = project?.workspaceId,
    scope = useMemo(
      () => (projectId && workspaceId ? { projectId, workspaceId } : null),
      [projectId, workspaceId]
    ),
    draft = selected ? (drafts[selected] ?? emptyDraft()) : emptyDraft()
  const readOnly = session.accessReadOnly || session.accessTransition,
    active = !!page?.turns.some((t) => activeStates.includes(t.attempt.state))
  const belongs = useCallback((captured: OpenInput): boolean => {
    return sameScope(current.current.project, captured)
  }, [])
  function show(attemptId?: string): void {
    const s = current.current
    if (!s.project || composing.current || s.composition.current) return
    const captured = scopeOf(s.project)
    void (async () => {
      if (
        !(await s.navigate({
          kind: 'workspace',
          scope: captured,
          view: 'write',
          documentId: s.project!.documentId
        }))
      )
        return
      if (!belongs(captured)) return
      s.writingView.revealPanel('ai')
      if (state.current.selected) {
        setListOpen(false)
        if (page?.conversation.state === 'active') rememberChat(captured, state.current.selected)
        setReadRevision((revision) => revision + 1)
      }
      if (rename || pendingRef.current || locked.current) return
      const target = attemptId ?? (run?.pending || run?.issue ? run.attemptId : null)
      if (target) {
        const origin = state.current.selected
        const result = await window.collie.conversation({
          ...captured,
          action: 'attempt',
          attemptId: target
        })
        if (
          belongs(captured) &&
          state.current.selected === origin &&
          !state.current.rename &&
          !composing.current &&
          !locked.current &&
          !pendingRef.current &&
          result.ok &&
          result.value.type === 'turn'
        )
          choose(result.value.turn.attempt.conversationId)
      } else if (!drafts[selected ?? '']?.text) {
        const unsent = Object.entries(drafts).find(([, d]) => !!d.text)
        if (unsent) choose(unsent[0])
      }
    })()
  }
  const dirty = Object.values(drafts).some((d) => !!d.text) || !!rename
  const draftEvents = useRetainedDraft('conversations', {
    read: () => ({
      scope: scope ?? { projectId: '', workspaceId: '' },
      kind: 'conversation',
      entityId: selected,
      label: 'conversation drafts and requests',
      dirty,
      composing: composing.current,
      busy,
      pendingOperation: pending ?? (run?.pending ? run : null),
      policy: 'retain',
      issue: issue || undefined,
      target: project
        ? {
            kind: 'workspace',
            scope: scopeOf(project),
            view: 'write',
            documentId: project.documentId
          }
        : { kind: 'library' }
    }),
    focus: () => {
      show()
      requestAnimationFrame(() => {
        if (composer.current && !composer.current.closest('[hidden],[inert]'))
          composer.current.focus()
      })
    }
  })
  const list = useCallback(
    async (captured: OpenInput): Promise<void> => {
      const seq = ++listSequence.current,
        s = state.current,
        context = originOf(current.current.project),
        generation = groupGeneration.current
      let result: Awaited<ReturnType<typeof window.collie.conversation>>
      try {
        result = await window.collie.conversation({
          ...captured,
          action: 'grouped-list',
          state: s.view,
          query: s.query,
          currentDocumentId: originOf(current.current.project),
          currentOffset: s.currentOffset,
          otherOffset: s.offset
        })
      } catch {
        if (
          belongs(captured) &&
          seq === listSequence.current &&
          generation === groupGeneration.current
        ) {
          setListLoading(false)
          setIssue('Conversation list could not be read. Try local recovery.')
        }
        return
      }
      if (
        !belongs(captured) ||
        seq !== listSequence.current ||
        generation !== groupGeneration.current ||
        context !== originOf(current.current.project) ||
        s.query !== state.current.query ||
        s.view !== state.current.view ||
        s.offset !== state.current.offset ||
        s.currentOffset !== state.current.currentOffset
      )
        return
      setListLoading(false)
      if (result.ok && result.value.type === 'grouped-list') {
        setCurrentItems(result.value.current.items)
        setCurrentTotal(result.value.current.total)
        setItems(result.value.other.items)
        setTotal(result.value.other.total)
      } else if (!result.ok) setIssue(result.error.message)
    },
    [belongs]
  )
  const read = useCallback(
    async (captured: OpenInput, id: string, cursor: number | null): Promise<void> => {
      const seq = ++readSequence.current
      try {
        const result = await window.collie
          .conversation({
            ...captured,
            action: 'read',
            conversationId: id,
            before: cursor
          })
          .catch(() => null)
        if (
          !belongs(captured) ||
          seq !== readSequence.current ||
          state.current.selected !== id ||
          state.current.before !== cursor
        )
          return
        if (!result)
          setIssue('This conversation could not be read. Try local recovery or return to the list.')
        else if (result.ok && result.value.type === 'page') setPage(result.value)
        else if (!result.ok) setIssue(result.error.message)
      } finally {
        if (seq === readSequence.current) setLoading(false)
      }
    },
    [belongs]
  )
  const refresh = useCallback(
    async (captured: OpenInput): Promise<void> => {
      await current.current.refreshConversationHead(captured)
      if (!belongs(captured)) return
      await list(captured)
      const s = state.current
      if (s.selected) await read(captured, s.selected, s.before)
    },
    [belongs, list, read]
  )
  const [lastScope, setLastScope] = useState(scope)
  if (lastScope !== scope) {
    setLastScope(scope)
    setItems([])
    setTotal(0)
    setCurrentItems([])
    setCurrentTotal(0)
    setCurrentOffset(0)
    setOffset(0)
    setListOpen(true)
    setSelected(null)
    setPage(null)
    setBefore(null)
    setDrafts({})
    setRename('')
    setIssue('')
    setNotice('')
    setPending(null)
    setRun(null)
  }
  useEffect(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
    }
    newChatFocus.current = null
    readSequence.current++
    listSequence.current++
    scroll.current.clear()
    if (!scope) return
    const captured = scope
    let alive = true
    void (async () => {
      // Local retained records only. This never prepares, starts, renews or logs in to a provider.
      const result = await window.collie.conversation({ ...captured, action: 'reconcile' })
      if (!alive || !belongs(captured)) return
      if (!result.ok)
        setIssue(
          'Conversation recovery could not finish. Stored history is still readable; use Retry local recovery.'
        )
      await refresh(captured)
      const hint = selectedChat(captured)
      if (!hint || !alive || !belongs(captured) || state.current.selected) return
      const seq = ++readSequence.current
      const saved = await window.collie.conversation({
        ...captured,
        action: 'read',
        conversationId: hint,
        before: null
      })
      if (!alive || !belongs(captured) || state.current.selected || seq !== readSequence.current)
        return
      if (saved.ok && saved.value.type === 'page' && saved.value.conversation.state === 'active') {
        state.current.selected = hint
        setSelected(hint)
        setPage(saved.value)
        setListOpen(false)
      } else {
        rememberChat(captured, null)
        setNotice(
          'The previously selected chat is unavailable or archived. Choose a conversation from the list.'
        )
      }
    })().catch(() => {
      if (alive && belongs(captured))
        setIssue(
          'Conversation recovery could not finish. Use Retry local recovery; saved history is kept.'
        )
    })
    return () => {
      alive = false
    }
  }, [scope, refresh, belongs])
  const currentDocumentId = originOf(project)
  const currentLabel = currentDocumentId
    ? project?.documents.find((d) => d.id === currentDocumentId)?.kind === 'chapter'
      ? 'This chapter'
      : 'This section'
    : null
  const groupKey = `${scope?.projectId}:${scope?.workspaceId}:${currentDocumentId}:${query}:${view}`
  const [lastGroupKey, setLastGroupKey] = useState(groupKey)
  if (lastGroupKey !== groupKey) {
    setLastGroupKey(groupKey)
    setOffset(0)
    setCurrentOffset(0)
    setItems([])
    setCurrentItems([])
    setTotal(0)
    setCurrentTotal(0)
    setListLoading(true)
  }
  const listPageKey = `${groupKey}:${offset}:${currentOffset}`
  const [lastListPageKey, setLastListPageKey] = useState(listPageKey)
  if (lastListPageKey !== listPageKey) {
    setLastListPageKey(listPageKey)
    setListLoading(true)
    setItems([])
    setCurrentItems([])
  }
  useLayoutEffect(() => {
    groupGeneration.current++
  }, [listPageKey])
  useEffect(() => {
    if (scope) void list(scope)
  }, [scope, list, query, view, offset, currentOffset, currentDocumentId])
  const readKey = `${scope?.projectId ?? ''}:${scope?.workspaceId ?? ''}:${selected ?? ''}:${before ?? ''}:${readRevision}`
  const [lastReadKey, setLastReadKey] = useState(readKey)
  if (lastReadKey !== readKey) {
    setLastReadKey(readKey)
    setLoading(!!selected)
  }
  useEffect(() => {
    if (scope && selected) void read(scope, selected, before)
  }, [scope, read, selected, before, readRevision])
  useEffect(
    () =>
      window.collie.onConversationChanged((event) => {
        if (!belongs(event)) return
        setRun(event)
        if (event.issue) setIssue(event.issue)
        if (!refreshTimer.current)
          refreshTimer.current = setTimeout(() => {
            refreshTimer.current = null
            void refresh({ projectId: event.projectId, workspaceId: event.workspaceId })
          }, 300)
      }),
    [belongs, refresh]
  )
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    []
  )
  const work = scope
    ? connections.status?.work.find(
        (item) =>
          item.feature === 'conversation' &&
          sameScope(item.scope, scope) &&
          !['retained-outcome', 'handoff-required', 'record-unavailable'].includes(item.state)
      )
    : undefined
  const workKey = `${scope?.projectId ?? ''}:${scope?.workspaceId ?? ''}:${connections.status?.sequence ?? -1}`
  const [lastWorkKey, setLastWorkKey] = useState(workKey)
  if (lastWorkKey !== workKey) {
    setLastWorkKey(workKey)
    if (work && scope)
      setRun({
        ...scope,
        attemptId: work.attemptId,
        pending: true,
        issue: work.state === 'protection-required' ? 'AI output needs local protection.' : null
      })
    else setRun((previous) => (previous ? { ...previous, pending: false } : previous))
  }
  const hadWork = useRef(false)
  useEffect(() => {
    if (!scope) return

    const refreshNeeded = !!work || hadWork.current || active
    hadWork.current = !!work
    if (refreshNeeded && !refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        void refresh(scope)
      }, 300)
  }, [scope, work, active, refresh])
  const selectedConnection = reviewConnection(connections.status)
  function update(patch: Partial<Draft>): void {
    if (!selected || pendingRef.current || locked.current) return
    if (!drafts[selected]?.text && Object.values(drafts).filter((d) => !!d.text).length >= 20) {
      setIssue(
        'Save or clear an existing conversation draft before keeping another. Up to 20 unsent drafts can be retained in this session.'
      )
      return
    }
    setDrafts((previous) => ({
      ...previous,
      [selected]: { ...(previous[selected] ?? emptyDraft()), ...patch }
    }))
  }
  function choose(id: string): void {
    if (composing.current || locked.current || pendingRef.current) return
    if (rename) {
      setIssue('Save or clear the rename draft before opening another conversation.')
      return
    }
    const samePage = state.current.selected === id && state.current.before === null
    newChatFocus.current = null
    setListOpen(false)
    setSelected(id)
    state.current.selected = id
    state.current.before = null
    setBefore(null)
    if (samePage && scope) setReadRevision((revision) => revision + 1)
    else setPage(null)
    setRename('')
    setIssue('')
    setNotice(
      scope && !rememberChat(scope, id)
        ? 'This chat is open, but its selection could not be remembered on this device.'
        : ''
    )
  }
  async function request(input: ConversationRequest, prepared = false): Promise<void> {
    if (
      (!prepared && locked.current) ||
      composing.current ||
      (pendingRef.current && pendingRef.current !== input)
    )
      return
    locked.current = true
    setBusy(true)
    setIssue('')
    setNotice('')
    setPending(input)
    pendingRef.current = input
    try {
      const result = await window.collie.conversation(input)
      if (!belongs(input)) return
      if (!result.ok) {
        if (!['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(result.error.code)) {
          setPending(null)
          pendingRef.current = null
        }
        setIssue(
          result.error.code === 'LIMIT_EXCEEDED'
            ? sizeMessage
            : result.error.code === 'STALE_REVISION'
              ? 'The writing, conversation or connection changed. Your draft is kept; press Send again when ready.'
              : result.error.code === 'DESTINATION_EXISTS'
                ? 'That file already exists. Export again using a new filename. The existing file was kept.'
                : result.error.message
        )
        return
      }
      setPending(null)
      pendingRef.current = null
      if (input.action === 'change' && result.value.type === 'changed') {
        setRename('')
        if (input.expectedRevision === null) newChatFocus.current = input.conversationId
        setListOpen(false)
        if (
          !rememberChat(
            input,
            result.value.conversation.state === 'active' ? input.conversationId : null
          )
        )
          setNotice('The chat is saved, but its selection could not be remembered on this device.')
        setSelected(input.conversationId)
        state.current.selected = input.conversationId
        setPage(null)
        setBefore(null)
        state.current.before = null
      }
      if (input.action === 'submit') {
        setDrafts((previous) => {
          const d = previous[input.review.conversationId]
          return d &&
            d.text === input.review.prompt &&
            (input.review.version !== 2 || d.contextPolicy === input.review.contextPolicy)
            ? { ...previous, [input.review.conversationId]: { ...d, text: '' } }
            : previous
        })
        setBefore(null)
        state.current.before = null
        const outcome = result.value.type === 'turn' ? result.value.turn.attempt.state : null
        setNotice(
          outcome === 'not-sent'
            ? 'Sending was refused. Your message is saved below; use its menu to copy it into a fresh draft.'
            : ''
        )
      }
      if (result.value.type === 'exported') setNotice(`Transcript exported to ${result.value.path}`)
      await refresh({ projectId: input.projectId, workspaceId: input.workspaceId })
    } catch {
      setIssue(
        'The local action is not confirmed. Keep this window open and retry the same action.'
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  function change(kind: 'create' | 'rename' | 'archive' | 'restore'): void {
    if (!scope || readOnly || !project || composing.current || pendingRef.current) return
    if (kind === 'create' && state.current.rename) {
      setIssue('Save or clear the rename draft before starting a new chat.')
      return
    }
    const c = page?.conversation,
      title = (
        kind === 'create' ? 'New chat' : kind === 'rename' ? rename : (c?.title ?? '')
      ).trim()
    if (!title) {
      setIssue('Enter a conversation title.')
      return
    }
    if (kind !== 'create' && !c) return
    const input: ConversationRequest = {
      ...scope,
      action: 'change',
      ...(kind === 'create' ? { version: 2 as const, originDocumentId: originOf(project) } : {}),
      operationId: crypto.randomUUID(),
      conversationId: kind === 'create' ? crypto.randomUUID() : c!.id,
      expectedRevision: kind === 'create' ? null : c!.revisionId,
      title,
      state: kind === 'archive' ? 'archived' : kind === 'rename' ? c!.state : 'active'
    }
    void request(input)
  }
  async function send(): Promise<void> {
    if (
      !scope ||
      !selected ||
      !canSend ||
      locked.current ||
      pendingRef.current ||
      composing.current ||
      !draft.text.trim()
    )
      return
    const s = current.current,
      original = s.project,
      editor = s.editorRef.current,
      document = editor && !editor.isDestroyed ? editor.state.doc : null,
      id = selected,
      submitted = { ...draft },
      account = reviewConnection(connectionRef.current.status)
    if (!original || s.composition.current || (editor && editorIsComposing(editor))) {
      setIssue('Finish composing in the manuscript first.')
      return
    }
    locked.current = true
    setBusy(true)
    setIssue('')
    setNotice('')
    const stillCurrent = (): boolean =>
      belongs(scope) &&
      state.current.selected === id &&
      current.current.project?.documentId === original.documentId &&
      (submitted.contextPolicy !== 'project' ||
        !originOf(original) ||
        (!!editor &&
          !editor.isDestroyed &&
          current.current.editorRef.current === editor &&
          !!document &&
          editor.state.doc.eq(document) &&
          !editorIsComposing(editor)))
    try {
      const saved = await s.flush(false, 'save', ['conversations'])
      if (!saved || !stillCurrent() || saved.documentId !== original.documentId) {
        setIssue(
          'The writing could not be captured at the selected revision. Your draft is kept; press Send again when ready.'
        )
        return
      }
      const latest = await window.collie.conversation({
        ...scope,
        action: 'read',
        conversationId: id,
        before: null
      })
      if (!latest.ok || latest.value.type !== 'page' || !stillCurrent()) {
        setIssue(
          'The conversation changed during preparation. Your draft is kept; press Send again.'
        )
        return
      }
      const input: ConversationReview = {
        ...scope,
        action: 'review',
        version: 2,
        contextPolicy: submitted.contextPolicy,
        conversationId: id,
        expectedRevision: latest.value.conversation.revisionId,
        expectedHead: saved.headCommitId,
        captureId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        prompt: submitted.text,
        historyIds: [],
        source:
          submitted.contextPolicy === 'project' && originOf(original)
            ? { kind: 'section', documentId: saved.documentId, revisionId: saved.revisionId }
            : { kind: 'none' }
      }
      const result = await window.collie.conversation(input)
      if (
        !stillCurrent() ||
        !sameReviewConnection(account, reviewConnection(connectionRef.current.status))
      ) {
        setIssue(
          'The writing, account or model changed during preparation. Your draft is kept; press Send again.'
        )
        return
      }
      if (!result.ok || result.value.type !== 'review') {
        setIssue(
          !result.ok && result.error.code === 'LIMIT_EXCEEDED'
            ? sizeMessage
            : !result.ok
              ? result.error.message
              : 'Your message could not be prepared. Nothing was sent.'
        )
        return
      }
      await request(
        {
          ...scope,
          action: 'submit',
          attemptId: crypto.randomUUID(),
          review: input,
          digest: result.value.capture.digest,
          send: true,
          connectionId: account.connectionId,
          model: account.model
        },
        true
      )
    } catch {
      setIssue('Your message could not be prepared. Your draft is kept; nothing was queued.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  function retryAsNew(t: ConversationTurn): void {
    if (!selected || draft.text || readOnly || busy || pending) return
    // Context and old account authority are never silently carried into another attempt.
    update({ text: t.capture.prompt })
    setNotice(
      'Prompt copied into a new draft. Send starts a new request with your current context choice.'
    )
  }
  useEffect(() => {
    if (busy || listOpen || page?.conversation.id !== selected || !selected) return
    const id = selected
    const frame = requestAnimationFrame(() => {
      const s = current.current,
        target = composer.current
      if (
        newChatFocus.current !== id ||
        state.current.selected !== id ||
        s.closing ||
        s.navigating ||
        s.composition.current ||
        composing.current ||
        !document.hasFocus() ||
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        !target ||
        target.closest('[hidden],[inert]')
      )
        return
      newChatFocus.current = null
      target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [busy, listOpen, page?.conversation.id, selected])
  const capability = connections.status?.features.conversation
  const canSend =
    capability?.state === 'available' &&
    capability.connectionId === selectedConnection.connectionId &&
    capability.model === selectedConnection.model &&
    !connections.busy &&
    connections.issue !== 'outcome-unknown' &&
    !readOnly &&
    !busy &&
    !pending &&
    !active &&
    page?.conversation.state === 'active' &&
    session.available &&
    !session.closing &&
    !session.navigating
  return {
    items,
    total,
    currentItems,
    currentTotal,
    currentLabel,
    currentOffset,
    setCurrentOffset,
    listOpen,
    listLoading,
    backToList: () => {
      if (!composing.current && !locked.current && !pendingRef.current) {
        if (state.current.rename) {
          setIssue('Save or clear the rename draft before returning to the list.')
          return
        }
        newChatFocus.current = null
        readSequence.current++
        setLoading(false)
        setListOpen(true)
        if (scope) rememberChat(scope, null)
      }
    },
    query,
    setQuery,
    view,
    setView,
    offset,
    setOffset,
    selected,
    page,
    before,
    setBefore,
    draft,
    update,
    drafts,
    rename,
    setRename,
    issue,
    notice,
    busy,
    loading,
    pending,
    readOnly,
    active,
    run,
    canSend,
    capability,
    scope,
    scroll,
    composerRef: composer,
    choose,
    change,
    send,
    retryAsNew,
    show,
    request,
    refresh,
    composingRef: composing,
    draftEvents,
    retry: () =>
      pendingRef.current
        ? void request(pendingRef.current)
        : scope
          ? void request({ ...scope, action: 'reconcile' })
          : undefined,
    clear: () => {
      if (selected && !pending && !busy) {
        setDrafts((previous) => ({ ...previous, [selected]: emptyDraft() }))
        setIssue('')
        setNotice('Unsent draft cleared. Saved history was kept.')
      }
    },
    recover: () => (scope ? void request({ ...scope, action: 'reconcile' }) : undefined),
    cancel: (attemptId: string) =>
      scope ? void request({ ...scope, action: 'cancel', attemptId }) : undefined,
    protect: (attemptId: string) =>
      scope ? void request({ ...scope, action: 'protect', attemptId }) : undefined,
    exportTranscript: (includeContext: boolean) =>
      scope && page
        ? void request({
            ...scope,
            action: 'export',
            conversationId: page.conversation.id,
            expectedRevision: page.conversation.revisionId,
            includeContext
          })
        : undefined,
    capacity: AI_LIMITS.jobs
  }
}
type Conversations = ReturnType<typeof useConversationController>
export const Context = createContext<Conversations | null>(null)
export function useConversations(): Conversations {
  const value = useContext(Context)
  if (!value) throw new Error('Conversation owner is missing')
  return value
}
