import {
  IconWand,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconArrowBackUp,
  IconArrowForwardUp
} from '@tabler/icons-react'
import { IconButton } from '../components/ui/IconButton'
import PresentationBoundary from '../components/PresentationBoundary'
import { useEffectEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton } from '../components/ui/Controls'
import { ActionMenu } from '../components/ui/ActionMenu'
import { AppDialog } from '../components/ui/AppDialog'
import { captureSelection, restoreSelection, type CapturedSelection } from './selection'
import { useEditorFormDraft } from './useEditorFormDraft'
import './RichDraft.css'
import type { Editor } from '@tiptap/core'
import { setBlockType } from '@tiptap/pm/commands'
import { wrapInList } from '@tiptap/pm/schema-list'
import { undo, redo } from '@tiptap/pm/history'
import { safeLink, type DocumentPayload } from '../../../domain/editor/schema'
import { manuscriptAnchor } from './anchors'
import ReferenceTools, { type ReferenceContext } from './ReferenceTools'
import {
  createManuscriptEditor,
  editorIsComposing,
  focusedManuscriptEditor,
  refreshCitationLabels
} from './adapter'

type TableCellJson = {
  type: 'tableCell' | 'tableHeader'
  attrs: { blockId: string }
  content: { type: 'paragraph'; attrs: { blockId: string } }[]
}
type TableRowJson = { type: 'tableRow'; attrs: { blockId: string }; content: TableCellJson[] }
const newCell = (type: TableCellJson['type']): TableCellJson => ({
  type,
  attrs: { blockId: crypto.randomUUID() },
  content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }]
})

type Props = {
  onReviewOptions?: () => void
  noteMode?: boolean
  references?: ReferenceContext
  payload: DocumentPayload
  disabled: boolean
  onReady: (editor: Editor | null) => void
  onChange: () => void
  onIssue: (message: string) => void
  onBlur: () => void
  imageUrl: (assetId: string) => string | undefined
  importImage: (details: { alt: string; caption: string }) => void
}

export default function RichDraft({
  payload,
  onReviewOptions,
  disabled,
  onReady,
  onChange,
  onIssue,
  onBlur,
  imageUrl,
  importImage,
  noteMode = false,
  references
}: Props): React.JSX.Element {
  const referenceRef = useRef(references)
  useLayoutEffect(() => {
    referenceRef.current = references
  })
  const host = useRef<HTMLDivElement>(null)
  const findField = useRef<HTMLInputElement>(null)
  const editor = useRef<Editor | null>(null)
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disabledRef = useRef(disabled)
  useLayoutEffect(() => {
    disabledRef.current = disabled
  })
  const [, setRevision] = useState(0)
  const [words, setWords] = useState(0)
  const [editorReady, setEditorReady] = useState(false)
  const [query, setQuery] = useState(''),
    [replacement, setReplacement] = useState('')
  const [match, setMatch] = useState('')
  const [findOpen, setFindOpen] = useState(false),
    [referencesOpen, setReferencesOpen] = useState(false)
  const [dialog, setDialog] = useState<'link' | 'image' | 'image-details' | null>(null)
  const [href, setHref] = useState(''),
    [alt, setAlt] = useState(''),
    [caption, setCaption] = useState(''),
    [dialogIssue, setDialogIssue] = useState('')
  const toolsSelection = useRef<CapturedSelection | null>(null),
    dialogSelection = useRef<CapturedSelection | null>(null)
  const afterDialog = useRef<(() => void) | null>(null)
  const formDraft = useEditorFormDraft('Link or image details', dialog !== null, noteMode)
  useEffect(() => {
    if (findOpen) findField.current?.focus()
  }, [findOpen])
  useEffect(() => {
    if (
      references?.focusAnchor &&
      editor.current &&
      manuscriptAnchor(editor.current, references.focusAnchor)?.reference
    )
      setReferencesOpen(true)
  }, [references?.focusAnchor, references?.focusRequest, editorReady])
  function openFind(): void {
    setFindOpen(true)
    findField.current?.focus()
  }
  function captureTools(): void {
    toolsSelection.current = captureSelection(editor.current)
  }
  function menuAction(action: () => void): void {
    if (!restoreSelection(toolsSelection.current, editor.current)) {
      onIssue('Select the current writing again before using this action.')
      return
    }
    action()
  }
  function openDialog(kind: 'link' | 'image' | 'image-details'): void {
    const saved = captureSelection(editor.current)
    if (!saved || disabled) {
      onIssue('Finish composing text before opening this dialog.')
      return
    }
    dialogSelection.current = saved
    setDialogIssue('')
    setDialog(kind)
  }
  function closeDialog(): void {
    if (!formDraft.canClose()) return
    restoreSelection(dialogSelection.current, editor.current)
    setDialog(null)
  }
  function applyDialog(): void {
    if (disabled || !formDraft.canClose()) return
    if (dialog === 'link' && !safeLink(href.trim())) {
      setDialogIssue('Enter an http or https address without account credentials.')
      return
    }
    if (alt.length > 2000 || caption.length > 10000) {
      setDialogIssue('Shorten the image description or caption.')
      return
    }
    if (!restoreSelection(dialogSelection.current, editor.current)) {
      setDialogIssue(
        'The writing changed while this dialog was open. Cancel and select the current passage again.'
      )
      return
    }
    if (dialog === 'link')
      command((e) => {
        e.chain().setMark('link', { href: href.trim() }).run()
      })
    else if (dialog === 'image-details')
      command((e) => {
        e.commands.updateAttributes('image', { alt, caption })
      })
    else
      afterDialog.current = () => {
        if (!restoreSelection(dialogSelection.current, editor.current)) {
          onIssue('Select the image location again. The writing changed.')
          return
        }
        importImage({ alt, caption })
      }
    setDialog(null)
  }
  // The keyed owner supplies the initial document; later renders must not recreate its editor.
  const [initialEditor] = useState(() => ({
    payload,
    projectId: references?.projectId,
    noteMode,
    onReady
  }))
  const callbacks = useRef({ onChange, onIssue, imageUrl })
  useLayoutEffect(() => {
    callbacks.current = { onChange, onIssue, imageUrl }
  })
  const mountEditor = useCallback(
    (element: HTMLDivElement | null) => {
      host.current = element
      if (!element) return
      try {
        const next = createManuscriptEditor({
          element,
          payload: initialEditor.payload,
          imageUrl: (id) => callbacks.current.imageUrl(id),
          projectId: initialEditor.projectId,
          ariaLabel: initialEditor.noteMode ? 'Note body' : 'Manuscript',
          citationLabel: (id) => referenceRef.current?.labels.get(id) ?? '[citation]',
          onChange: () => {
            setRevision((value) => value + 1)
            callbacks.current.onChange()
            if (editor.current) refreshCitationLabels(editor.current, new Map())
            if (countTimer.current) clearTimeout(countTimer.current)
            countTimer.current = setTimeout(() => {
              if (editor.current)
                setWords((editor.current.state.doc.textContent.match(/\S+/gu) ?? []).length)
            }, 450)
          },
          onIssue: (message) => callbacks.current.onIssue(message)
        })
        const updateSelection = (): void => setRevision((value) => value + 1)
        next.on('selectionUpdate', updateSelection)
        editor.current = next
        setEditorReady(true)
        initialEditor.onReady(next)
        setWords((next.state.doc.textContent.match(/\S+/gu) ?? []).length)
        setRevision((value) => value + 1)
        return () => {
          if (countTimer.current) clearTimeout(countTimer.current)
          next.off('selectionUpdate', updateSelection)
          initialEditor.onReady(null)
          editor.current = null
          next.destroy()
        }
      } catch {
        callbacks.current.onIssue(
          'The stored document cannot be opened for editing without loss. Keep its original file and local recovery for repair.'
        )
      }
      return undefined
    },
    [initialEditor]
  )
  useEffect(() => {
    editor.current?.setEditable(!disabled, false)
  }, [disabled])
  const onNativeEditorAction = useEffectEvent(
    (action: Parameters<Parameters<typeof window.collie.onEditorAction>[0]>[0]) => {
      if (
        noteMode ||
        !host.current ||
        host.current.closest('[hidden], [inert]') ||
        host.current.closest('[data-writing-dialog-open="true"]')
      )
        return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        (active.closest('[role="dialog"]') ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
      )
        return
      const instance = editor.current ? focusedManuscriptEditor(editor.current) : null
      if (!instance) return
      if (action === 'find') {
        openFind()
        return
      }
      if (disabledRef.current || editorIsComposing(instance)) return
      if (action === 'undo') undo(instance.state, (tr) => instance.view.dispatch(tr))
      else if (action === 'redo') redo(instance.state, (tr) => instance.view.dispatch(tr))
      else void pastePlain(instance)
    }
  )
  useEffect(() => window.collie.onEditorAction(onNativeEditorAction), [])
  useEffect(() => {
    if (editor.current) refreshCitationLabels(editor.current, references?.labels ?? new Map())
  }, [references?.labels])
  const current = editor.current
  function command(run: (editor: Editor) => void): void {
    if (editor.current && !disabledRef.current && !editorIsComposing(editor.current)) {
      run(editor.current)
      editor.current.commands.focus()
      setRevision((value) => value + 1)
    }
  }
  function inCell(instance: Editor): boolean {
    for (const edge of [instance.state.selection.$from, instance.state.selection.$to])
      for (let depth = edge.depth; depth > 0; depth--)
        if (['tableCell', 'tableHeader'].includes(edge.node(depth).type.name)) return true
    return false
  }
  function mark(name: 'bold' | 'italic' | 'underline' | 'strike'): void {
    if (editor.current && inCell(editor.current)) {
      onIssue('Table cells accept plain text only.')
      return
    }
    command((e) => {
      e.chain().focus().toggleMark(name).run()
    })
  }
  function find(from = current?.state.selection.to ?? 0): { from: number; to: number } | null {
    const instance = editor.current
    if (!instance || !query) return null
    const needle = query
    const doc = instance.state.doc
    const candidates: { from: number; to: number }[] = []
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const haystack = node.text
      for (
        let index = haystack.indexOf(needle);
        index >= 0;
        index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
      )
        candidates.push({ from: pos + index, to: pos + index + query.length })
    })
    return candidates.find((candidate) => candidate.from >= from) ?? candidates[0] ?? null
  }
  function selectFound(): void {
    const instance = editor.current,
      found = find()
    if (instance && editorIsComposing(instance)) return
    if (!instance || !found) {
      setMatch('No match in this section.')
      return
    }
    instance.chain().focus().setTextSelection(found).run()
    setMatch('Match selected in this section.')
  }
  function replace(all: boolean): void {
    const instance = editor.current
    if (!instance || disabled || !query || editorIsComposing(instance)) return
    const doc = instance.state.doc,
      hits: { from: number; to: number }[] = []
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const haystack = node.text,
        needle = query
      for (
        let index = haystack.indexOf(needle);
        index >= 0;
        index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
      )
        hits.push({ from: pos + index, to: pos + index + query.length })
    })
    const selected = all
      ? hits
      : [
          hits.find(
            (hit) =>
              hit.from === instance.state.selection.from && hit.to === instance.state.selection.to
          ) ?? find()
        ].filter((value): value is { from: number; to: number } => !!value)
    if (!selected.length) {
      setMatch('No match in this section.')
      return
    }
    let transaction = instance.state.tr
    for (const hit of selected.reverse())
      transaction = transaction.insertText(replacement, hit.from, hit.to)
    instance.view.dispatch(transaction)
    setMatch(`${selected.length} replacement${selected.length === 1 ? '' : 's'} in this section.`)
  }
  function link(): void {
    const instance = editor.current
    if (!instance || disabled || instance.state.selection.empty) {
      onIssue('Select text before adding a link.')
      return
    }
    if (inCell(instance)) {
      onIssue('Table cells accept plain text only.')
      return
    }
    setHref(String(instance.getAttributes('link').href ?? ''))
    openDialog('link')
  }
  function table(): void {
    command((e) => {
      const row = (heading: boolean): TableRowJson => ({
        type: 'tableRow',
        attrs: { blockId: crypto.randomUUID() },
        content: [
          newCell(heading ? 'tableHeader' : 'tableCell'),
          newCell(heading ? 'tableHeader' : 'tableCell')
        ]
      })
      e.commands.insertContent({
        type: 'table',
        attrs: { blockId: crypto.randomUUID() },
        content: [row(true), row(false)]
      })
    })
  }
  function growTable(direction: 'row' | 'column'): void {
    command((e) => {
      const selection = e.state.selection.$from
      let depth = selection.depth
      while (depth > 0 && selection.node(depth).type.name !== 'table') depth--
      if (!depth) {
        onIssue('Place the cursor in a table first.')
        return
      }
      const tableNode = selection.node(depth),
        position = selection.before(depth)
      const json = tableNode.toJSON()
      const rows = json.content as TableRowJson[]
      if (direction === 'row') {
        if (rows.length >= 10000) {
          onIssue('This table has reached its row limit.')
          return
        }
        rows.push({
          type: 'tableRow',
          attrs: { blockId: crypto.randomUUID() },
          content: rows[0].content.map(() => newCell('tableCell'))
        })
      } else {
        if (rows[0].content.length >= 20) {
          onIssue('This table has reached its column limit.')
          return
        }
        rows.forEach((row, index) =>
          row.content.push(
            newCell(
              index === 0 && row.content[0].type === 'tableHeader' ? 'tableHeader' : 'tableCell'
            )
          )
        )
      }
      e.commands.insertContentAt({ from: position, to: position + tableNode.nodeSize }, json)
    })
  }
  function imageDetails(): void {
    const instance = editor.current
    const selected = instance?.state.selection as
      { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined
    if (!instance || selected?.node?.type.name !== 'image') {
      onIssue('Select an image first.')
      return
    }
    setAlt(String(selected.node.attrs.alt ?? ''))
    setCaption(String(selected.node.attrs.caption ?? ''))
    openDialog('image-details')
  }
  async function pastePlain(target?: Editor): Promise<void> {
    if (disabledRef.current) return
    const original = target ?? editor.current,
      saved = captureSelection(original)
    const result = await window.collie.readPlainClipboard()
    if (!result.ok) {
      onIssue(result.error.message)
      return
    }
    const instance = target ?? editor.current
    if (!instance || disabledRef.current || !result.value || !restoreSelection(saved, instance))
      return
    instance.view.dispatch(instance.state.tr.insertText(result.value.replace(/\r\n?/g, '\n')))
    instance.commands.focus()
  }
  function insertBlock(type: 'horizontalRule' | 'pageBreak'): void {
    command((e) => {
      e.commands.insertContent({ type, attrs: { blockId: crypto.randomUUID() } })
    })
  }
  const imageSelected = current?.isActive('image') ?? false
  const tableSelected = !!current && inCell(current)
  return (
    <div className="rich-draft" data-writing-dialog-open={dialog !== null}>
      <PresentationBoundary
        label="Writing tools"
        render={() => (
          <>
            <div className="editor-toolbar" role="group" aria-label="Writing tools">
              {(['bold', 'italic', 'underline', 'strike'] as const).map((name) => (
                <IconButton
                  key={name}
                  variant="subtle"
                  disabled={disabled}
                  label={name[0].toUpperCase() + name.slice(1)}
                  description={
                    disabled
                      ? 'Editing is currently unavailable. Review the writing status.'
                      : undefined
                  }
                  aria-pressed={!!current?.isActive(name)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => mark(name)}
                >
                  {name === 'bold' ? (
                    <IconBold aria-hidden="true" />
                  ) : name === 'italic' ? (
                    <IconItalic aria-hidden="true" />
                  ) : name === 'underline' ? (
                    <IconUnderline aria-hidden="true" />
                  ) : (
                    <IconStrikethrough aria-hidden="true" />
                  )}
                </IconButton>
              ))}
              <ActionMenu
                label="Style"
                onOpen={captureTools}
                actions={[
                  {
                    id: 'paragraph',
                    label: 'Paragraph',
                    disabled,
                    onSelect: () =>
                      menuAction(() =>
                        command((e) => {
                          setBlockType(e.state.schema.nodes.paragraph)(e.state, (tr) =>
                            e.view.dispatch(tr)
                          )
                        })
                      )
                  },
                  ...([1, 2, 3] as const).map((level) => ({
                    id: `heading-${level}`,
                    label: `Heading ${level}`,
                    disabled: disabled || tableSelected,
                    onSelect: () =>
                      menuAction(() =>
                        command((e) => {
                          setBlockType(e.state.schema.nodes.heading, { level })(e.state, (tr) =>
                            e.view.dispatch(tr)
                          )
                        })
                      )
                  })),
                  {
                    id: 'quote',
                    label: 'Block quotation',
                    disabled: disabled || tableSelected,
                    onSelect: () =>
                      menuAction(() =>
                        command((e) => {
                          e.chain().toggleWrap('blockquote').run()
                        })
                      )
                  },
                  {
                    id: 'bullets',
                    label: 'Bulleted list',
                    disabled: disabled || tableSelected,
                    onSelect: () =>
                      menuAction(() =>
                        command((e) => {
                          wrapInList(e.state.schema.nodes.bulletList)(e.state, (tr) =>
                            e.view.dispatch(tr)
                          )
                        })
                      )
                  },
                  {
                    id: 'numbers',
                    label: 'Numbered list',
                    disabled: disabled || tableSelected,
                    onSelect: () =>
                      menuAction(() =>
                        command((e) => {
                          wrapInList(e.state.schema.nodes.orderedList, { start: 1 })(
                            e.state,
                            (tr) => e.view.dispatch(tr)
                          )
                        })
                      )
                  }
                ]}
              />
              <ActionMenu
                label="Insert"
                onOpen={captureTools}
                actions={[
                  {
                    id: 'link',
                    label: 'Link…',
                    disabled: disabled || tableSelected,
                    onSelect: () => menuAction(link)
                  },
                  {
                    id: 'unlink',
                    label: 'Remove link',
                    disabled: disabled || !current?.isActive('link'),
                    onSelect: () =>
                      menuAction(() =>
                        command((e) => {
                          e.commands.unsetMark('link')
                        })
                      )
                  },
                  {
                    id: 'rule',
                    label: 'Horizontal rule',
                    disabled: disabled || tableSelected,
                    onSelect: () => menuAction(() => insertBlock('horizontalRule'))
                  },
                  ...(!noteMode
                    ? [
                        {
                          id: 'page',
                          label: 'Page break',
                          disabled: disabled || tableSelected,
                          onSelect: () => menuAction(() => insertBlock('pageBreak'))
                        },
                        {
                          id: 'table',
                          label: 'Table (2 × 2)',
                          disabled: disabled || tableSelected,
                          onSelect: () => menuAction(table)
                        },
                        {
                          id: 'image',
                          label: 'Image…',
                          disabled: disabled || tableSelected,
                          onSelect: () =>
                            menuAction(() => {
                              setAlt('')
                              setCaption('')
                              openDialog('image')
                            })
                        }
                      ]
                    : []),
                  ...(references
                    ? [
                        {
                          id: 'references',
                          label: 'Citations and footnotes',
                          disabled: false,
                          onSelect: () => menuAction(() => setReferencesOpen(true))
                        }
                      ]
                    : [])
                ]}
              />
              <IconButton
                label="Undo"
                variant="subtle"
                disabled={disabled}
                description={
                  disabled ? 'Undo is currently unavailable. Review the writing status.' : undefined
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  command((e) => {
                    undo(e.state, (tr) => e.view.dispatch(tr))
                  })
                }
              >
                <IconArrowBackUp aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Redo"
                variant="subtle"
                disabled={disabled}
                description={
                  disabled ? 'Redo is currently unavailable. Review the writing status.' : undefined
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  command((e) => {
                    redo(e.state, (tr) => e.view.dispatch(tr))
                  })
                }
              >
                <IconArrowForwardUp aria-hidden="true" />
              </IconButton>
              <ActionMenu
                label="More tools"
                onOpen={captureTools}
                actions={[
                  { id: 'find', label: 'Find and replace…', onSelect: openFind },
                  {
                    id: 'paste',
                    label: 'Paste plain text',
                    disabled,
                    onSelect: () =>
                      menuAction(() => {
                        void pastePlain()
                      })
                  },
                  {
                    id: 'copy',
                    label: 'Select all for copying',
                    onSelect: () => {
                      if (current && !editorIsComposing(current)) {
                        current.commands.selectAll()
                        current.commands.focus()
                      }
                    }
                  }
                ]}
              />
              {!noteMode && onReviewOptions ? (
                <IconButton
                  label="AI review options"
                  variant="subtle"
                  disabled={!current || editorIsComposing(current)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onReviewOptions}
                >
                  <IconWand aria-hidden="true" />
                </IconButton>
              ) : null}
            </div>
            {tableSelected && !noteMode ? (
              <div className="editor-context-tools" role="group" aria-label="Table actions">
                <span>Table</span>
                <AppButton
                  variant="subtle"
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => growTable('row')}
                >
                  Add row
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => growTable('column')}
                >
                  Add column
                </AppButton>
              </div>
            ) : null}
            {imageSelected && !noteMode ? (
              <div className="editor-context-tools">
                <span>Selected image</span>
                <AppButton
                  variant="subtle"
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={imageDetails}
                >
                  Image details…
                </AppButton>
              </div>
            ) : null}
          </>
        )}
      />
      <div className="editor-reference-region" hidden={!referencesOpen} inert={!referencesOpen}>
        <AppButton
          variant="subtle"
          onClick={() => {
            if (current && !editorIsComposing(current)) {
              setReferencesOpen(false)
              current.commands.focus()
            }
          }}
        >
          Close reference tools
        </AppButton>
        {current && references ? (
          <ReferenceTools
            editor={current}
            context={references}
            disabled={disabled}
            issue={onIssue}
          />
        ) : null}
      </div>
      <div
        ref={mountEditor}
        className="editor-host"
        onCompositionEnd={() => {
          setTimeout(onBlur, 0)
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault()
            openFind()
          }
          if (
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === 'v'
          ) {
            event.preventDefault()
            void pastePlain()
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onBlur()
        }}
      />
      <PresentationBoundary
        label="Find and writing dialogs"
        render={() => (
          <>
            <p className="word-count" aria-live="off">
              {words.toLocaleString()} words in this section
            </p>
            <div
              className="editor-find"
              hidden={!findOpen}
              inert={!findOpen}
              role="search"
              aria-label="Case-sensitive find and replace in this section"
            >
              <TextInput
                label="Find (case-sensitive)"
                ref={findField}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setMatch('')
                }}
              />
              <TextInput
                label="Replace with"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
              />
              <div className="editor-dialog-actions">
                <AppButton variant="default" onClick={selectFound}>
                  Find next
                </AppButton>
                <AppButton variant="default" disabled={disabled} onClick={() => replace(false)}>
                  Replace
                </AppButton>
                <AppButton variant="default" disabled={disabled} onClick={() => replace(true)}>
                  Replace all
                </AppButton>
                <AppButton
                  variant="subtle"
                  onClick={() => {
                    setFindOpen(false)
                    current?.commands.focus()
                  }}
                >
                  Close find
                </AppButton>
              </div>
              {match ? <p role="status">{match}</p> : null}
            </div>
            <AppDialog
              opened={dialog !== null}
              title={
                dialog === 'link'
                  ? 'Link'
                  : dialog === 'image-details'
                    ? 'Image details'
                    : 'Insert image'
              }
              onClose={closeDialog}
              returnFocus={false}
              onExited={() => {
                const action = afterDialog.current
                afterDialog.current = null
                if (action) action()
                else if (editor.current && !editor.current.isDestroyed)
                  editor.current.commands.focus()
              }}
            >
              <form
                className="editor-dialog-form"
                {...formDraft.events}
                onSubmit={(event) => {
                  event.preventDefault()
                  applyDialog()
                }}
              >
                {dialog === 'link' ? (
                  <TextInput
                    label="Web address"
                    description="Use an http or https address."
                    value={href}
                    onChange={(event) => setHref(event.currentTarget.value)}
                    required
                    data-autofocus
                  />
                ) : (
                  <>
                    <Textarea
                      label="Image description"
                      description="Describe the image for assistive technology. Leave empty only for a decorative image."
                      value={alt}
                      maxLength={2000}
                      onChange={(event) => setAlt(event.currentTarget.value)}
                      data-autofocus
                    />
                    <Textarea
                      label="Caption (optional)"
                      value={caption}
                      maxLength={10000}
                      onChange={(event) => setCaption(event.currentTarget.value)}
                    />
                  </>
                )}
                {dialogIssue ? <p role="alert">{dialogIssue}</p> : null}
                <div className="editor-dialog-actions">
                  <AppButton type="submit" disabled={disabled}>
                    {dialog === 'image' ? 'Choose image file…' : 'Apply'}
                  </AppButton>
                  <AppButton variant="default" onClick={closeDialog}>
                    Cancel
                  </AppButton>
                </div>
              </form>
            </AppDialog>
          </>
        )}
      />
    </div>
  )
}
