import type { Editor } from '@tiptap/core'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { isId } from '../../../../domain/editor/schema'
import { exact, record, type OpenInput } from '../../../../shared/projects'

const key = 'collie.writing-positions.v1'
const maxEntries = 256
const maxBytes = 256 * 1024
const maxPosition = 100_000_000

type Point = { blockId: string; offset: number }
type Position = OpenInput & {
  documentId: string
  revisionId: string | null
  anchor: number
  head: number
  node: boolean
  anchorBlock: Point | null
  headBlock: Point | null
  scrollBlock: string | null
  scrollOffset: number
  scrollTop: number
  updatedAt: number
}
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maxPosition
const point = (value: unknown): boolean =>
  value === null ||
  (record(value) &&
    exact(value, ['blockId', 'offset']) &&
    isId(value.blockId) &&
    integer(value.offset))
function valid(value: unknown): value is Position {
  return (
    record(value) &&
    exact(value, [
      'projectId',
      'workspaceId',
      'documentId',
      'revisionId',
      'anchor',
      'head',
      'node',
      'anchorBlock',
      'headBlock',
      'scrollBlock',
      'scrollOffset',
      'scrollTop',
      'updatedAt'
    ]) &&
    isId(value.projectId) &&
    isId(value.workspaceId) &&
    isId(value.documentId) &&
    (value.revisionId === null || isId(value.revisionId)) &&
    integer(value.anchor) &&
    integer(value.head) &&
    typeof value.node === 'boolean' &&
    point(value.anchorBlock) &&
    point(value.headBlock) &&
    (value.scrollBlock === null || isId(value.scrollBlock)) &&
    typeof value.scrollOffset === 'number' &&
    Number.isFinite(value.scrollOffset) &&
    Math.abs(value.scrollOffset) <= maxPosition &&
    typeof value.scrollTop === 'number' &&
    Number.isFinite(value.scrollTop) &&
    value.scrollTop >= 0 &&
    value.scrollTop <= maxPosition &&
    Number.isSafeInteger(value.updatedAt) &&
    Number(value.updatedAt) >= 0
  )
}
function same(a: OpenInput, b: OpenInput): boolean {
  return a.projectId === b.projectId && a.workspaceId === b.workspaceId
}

/** Non-authoritative profile hints. Failed storage never prevents project access. */
export class WritingPositions {
  private entries: Position[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  constructor() {
    try {
      const raw = localStorage.getItem(key)
      if (!raw || new TextEncoder().encode(raw).length > maxBytes) return
      const value: unknown = JSON.parse(raw)
      if (
        record(value) &&
        exact(value, ['version', 'entries']) &&
        value.version === 1 &&
        Array.isArray(value.entries) &&
        value.entries.length <= maxEntries &&
        value.entries.every(valid)
      )
        this.entries = value.entries.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch {
      /* Ignore unreadable presentation hints. */
    }
  }
  selected(scope: OpenInput): string | undefined {
    return this.entries.find((entry) => same(entry, scope))?.documentId
  }
  get(scope: OpenInput, documentId: string): Position | undefined {
    return this.entries.find((entry) => same(entry, scope) && entry.documentId === documentId)
  }
  remember(scope: OpenInput, documentId: string): void {
    this.put({
      ...scope,
      documentId,
      revisionId: null,
      anchor: 0,
      head: 0,
      node: false,
      anchorBlock: null,
      headBlock: null,
      scrollBlock: null,
      scrollOffset: 0,
      scrollTop: 0,
      ...this.get(scope, documentId),
      updatedAt: Date.now()
    })
  }
  put(value: Position): void {
    if (!valid(value)) return
    this.entries = [
      value,
      ...this.entries.filter(
        (entry) => !same(entry, value) || entry.documentId !== value.documentId
      )
    ].slice(0, maxEntries)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 350)
  }
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      let raw = JSON.stringify({ version: 1, entries: this.entries })
      while (new TextEncoder().encode(raw).length > maxBytes && this.entries.length) {
        this.entries.pop()
        raw = JSON.stringify({ version: 1, entries: this.entries })
      }
      localStorage.setItem(key, raw)
    } catch {
      /* The current session retains these hints; writing has separate protection. */
    }
  }
}
function blockPoint(editor: Editor, position: number): Point | null {
  const resolved = editor.state.doc.resolve(position)
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth)
    if (isId(node.attrs.blockId))
      return { blockId: node.attrs.blockId, offset: position - resolved.start(depth) }
  }
  return null
}
function resolvePoint(editor: Editor, value: Point | null): number | null {
  if (!value) return null
  let result: number | null = null
  editor.state.doc.descendants((node, position) => {
    if (result !== null) return false
    if (node.attrs.blockId === value.blockId) {
      result = node.isLeaf ? position : position + 1 + Math.min(value.offset, node.content.size)
      return false
    }
    return true
  })
  return result
}
function scroller(editor: Editor): HTMLElement {
  let element = editor.view.dom.parentElement
  while (element && element !== document.body) {
    if (
      /(auto|scroll)/.test(getComputedStyle(element).overflowY) &&
      element.scrollHeight > element.clientHeight
    )
      return element
    element = element.parentElement
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement
}
function top(element: HTMLElement): number {
  return element === document.scrollingElement ? 0 : element.getBoundingClientRect().top
}
function visible(editor: Editor): boolean {
  return (
    !editor.isDestroyed &&
    editor.view.dom.isConnected &&
    !editor.view.dom.closest('[hidden], [inert]')
  )
}
export type PositionBinding = {
  capture: () => void
  dispose: () => void
  resumeScroll: () => void
  cancelScroll: () => void
  cancelRestore: () => void
}

/** Separate from exact-target dialog bookmarks: a stale hint may safely fall back. */
export function bindWritingPosition(
  owner: WritingPositions,
  editor: Editor,
  scope: OpenInput,
  documentId: string,
  revision: () => string | null,
  explicitAnchor: boolean,
  shouldRestoreScroll: () => boolean
): PositionBinding {
  const hint = owner.get(scope, documentId)
  let pending = !explicitAnchor,
    disposed = false,
    frame = 0,
    scrollFrame = 0
  let lastScroll = hint
  const capture = (): void => {
    if (
      disposed ||
      pending ||
      !visible(editor) ||
      editor.view.composing ||
      document.querySelector('[role="dialog"], [role="alertdialog"]')
    )
      return
    const container = scroller(editor),
      edge = top(container)
    let scrollBlock: string | null = null,
      scrollOffset = 0
    editor.state.doc.descendants((node, position) => {
      if (scrollBlock) return false
      if (isId(node.attrs.blockId)) {
        const dom = editor.view.nodeDOM(position)
        if (dom instanceof HTMLElement) {
          const rect = dom.getBoundingClientRect()
          if (rect.bottom >= edge) {
            scrollBlock = node.attrs.blockId
            scrollOffset = rect.top - edge
            return false
          }
        }
      }
      return true
    })
    const selection = editor.state.selection
    lastScroll = {
      ...scope,
      documentId,
      revisionId: revision(),
      anchor: selection.anchor,
      head: selection.head,
      node: selection instanceof NodeSelection,
      anchorBlock: blockPoint(editor, selection.anchor),
      headBlock: blockPoint(editor, selection.head),
      scrollBlock,
      scrollOffset,
      scrollTop: Math.max(0, container.scrollTop),
      updatedAt: Date.now()
    }
    owner.put(lastScroll)
  }
  const restoreScroll = (value: Position | undefined): void => {
    const container = scroller(editor)
    const position = value?.scrollBlock
      ? resolvePoint(editor, { blockId: value.scrollBlock, offset: 0 })
      : null
    let adjusted = false
    if (position !== null) {
      const resolved = editor.state.doc.resolve(position)
      const nodePosition = resolved.depth ? resolved.before(resolved.depth) : position
      const dom = editor.view.nodeDOM(nodePosition)
      if (dom instanceof HTMLElement) {
        container.scrollTop +=
          dom.getBoundingClientRect().top - top(container) - value!.scrollOffset
        adjusted = true
      }
    }
    if (!adjusted && value?.revisionId && value.revisionId === revision())
      container.scrollTop = value.scrollTop
    else if (!adjusted) {
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      container.scrollTop += coords.top - top(container) - container.clientHeight / 2
    }
  }
  const safe = (): boolean =>
    visible(editor) &&
    !editor.view.composing &&
    !document.hidden &&
    document.hasFocus() &&
    !document.querySelector('[role="dialog"], [role="alertdialog"]')
  const restore = (): void => {
    if (!pending || disposed || !safe()) return
    const size = editor.state.doc.content.size
    let selection = Selection.atEnd(editor.state.doc)
    const exactRevision = !!hint?.revisionId && hint.revisionId === revision()
    const anchor = exactRevision ? hint!.anchor : resolvePoint(editor, hint?.anchorBlock ?? null)
    const head = exactRevision ? hint!.head : resolvePoint(editor, hint?.headBlock ?? null)
    if (anchor !== null && head !== null && anchor <= size && head <= size) {
      if (
        exactRevision &&
        hint?.node &&
        editor.state.doc.nodeAt(anchor) &&
        NodeSelection.isSelectable(editor.state.doc.nodeAt(anchor)!)
      )
        selection = NodeSelection.create(editor.state.doc, anchor)
      else
        selection = TextSelection.between(
          editor.state.doc.resolve(anchor),
          editor.state.doc.resolve(head)
        )
    }
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    if (shouldRestoreScroll()) restoreScroll(hint)
    pending = false
    observer.disconnect()
    capture()
  }
  const schedule = (): void => {
    if (!pending || disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0
        restore()
      })
    })
  }
  const cancelScroll = (): void => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame)
    scrollFrame = 0
  }
  const interrupt = (): void => {
    pending = false
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    cancelScroll()
  }
  const onScroll = (): void => {
    if (visible(editor)) capture()
  }
  const observer = new MutationObserver(schedule)
  if (pending)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['hidden', 'inert'],
      childList: true,
      subtree: true
    })
  editor.on('selectionUpdate', capture)
  editor.on('update', capture)
  document.addEventListener('scroll', onScroll, true)
  document.addEventListener('pointerdown', interrupt, true)
  document.addEventListener('keydown', interrupt, true)
  document.addEventListener('wheel', interrupt, true)
  document.addEventListener('visibilitychange', schedule)
  window.addEventListener('focus', schedule)
  schedule()
  return {
    capture,
    cancelScroll,
    cancelRestore: interrupt,
    resumeScroll: () => {
      // Initial selection restoration owns its own scroll after visible layout.
      if (pending) {
        schedule()
        return
      }
      cancelScroll()
      const value = lastScroll
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0
        if (!disposed && safe() && shouldRestoreScroll()) restoreScroll(value)
      })
    },
    dispose: () => {
      disposed = true
      interrupt()
      observer.disconnect()
      editor.off('selectionUpdate', capture)
      editor.off('update', capture)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointerdown', interrupt, true)
      document.removeEventListener('keydown', interrupt, true)
      document.removeEventListener('wheel', interrupt, true)
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('focus', schedule)
    }
  }
}
