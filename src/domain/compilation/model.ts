import {
  projectSubtitle,
  projectText,
  storedProjectTitle,
  requiredProjectName
} from '../projects/details'
import {
  ContentError,
  isId,
  readDocument,
  type Block,
  type CitationItem,
  type DocumentPayload,
  type Inline,
  type Mark
} from '../editor/schema'

export type Run =
  | {
      kind: 'text'
      text: string
      marks: Mark[]
      superscript?: boolean
      subscript?: boolean
      smallCaps?: boolean
    }
  | { kind: 'break' }
  | { kind: 'note'; number: number }
export type Paragraph = {
  kind: 'paragraph'
  blockId: string
  runs: Run[]
  style: 'body' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'caption' | 'bibliography'
  list?: { id: string; ordered: boolean; start: number; first: boolean; marker: boolean }
}
export type CompileBlock =
  | Paragraph
  | { kind: 'pageBreak' | 'rule'; blockId: string }
  | {
      kind: 'image'
      blockId: string
      assetId: string
      alt: string
      caption: string
      width: number
      height: number
    }
  | { kind: 'table'; blockId: string; header: boolean; rows: Paragraph[][][] }
export type CitationRequest = { id: string; items: CitationItem[]; noteIndex: number }
export type CitationOutput = {
  citations: Record<string, Run[]>
  bibliography: Run[][]
  hangingIndent: boolean
  lineSpacing: number
  entrySpacing: number
}
export type CitationFormatter = (requests: CitationRequest[]) => CitationOutput
export type CompilationMetadata = {
  title: string
  subtitle: string
  byline: string
  description: string | null
}
export type CompileInput = {
  metadata: CompilationMetadata
  titlePage: boolean
  capturedHead: string
  style: 'apa' | 'chicago'
  paper: 'Letter' | 'A4'
  sections: {
    documentId: string
    title: string
    includeTitle: boolean
    pageBreakBefore: boolean
    payload: DocumentPayload
    headings?: { id: string; title: string; level: 1 | 2 | 3 }[]
    titleLevel?: 1 | 2 | 3
  }[]
}
export type Compilation = {
  version: 5
  metadata: CompilationMetadata
  titlePage: boolean
  capturedHead: string
  style: 'apa' | 'chicago'
  paper: 'Letter' | 'A4'
  sections: { documentId: string; blocks: CompileBlock[] }[]
  footnotes: { number: number; originId: string; paragraphs: Paragraph[] }[]
  bibliography: CitationOutput
  sourceMap: { documentId: string; blockId: string; kind: CompileBlock['kind'] | 'footnote' }[]
}
export type Frozen<T> = T extends readonly (infer U)[]
  ? readonly Frozen<U>[]
  : T extends object
    ? { readonly [K in keyof T]: Frozen<T[K]> }
    : T
function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value as Frozen<T>
}

/** Compile order determines author notes, automatic Chicago notes and citeproc noteIndex together. */
export function compileManuscript(
  input: CompileInput,
  format: CitationFormatter
): Frozen<Compilation> {
  if (
    !isId(input.capturedHead) ||
    !['apa', 'chicago'].includes(input.style) ||
    !['Letter', 'A4'].includes(input.paper) ||
    !input.sections.length ||
    input.sections.length > 10000
  )
    throw new ContentError('INVALID_COMPILATION', 'options')
  if (
    !input.metadata ||
    !storedProjectTitle(input.metadata.title) ||
    !projectSubtitle(input.metadata.subtitle) ||
    !(input.metadata.byline === '' || requiredProjectName(input.metadata.byline)) ||
    !(input.metadata.description === null || projectText(input.metadata.description, 10000)) ||
    typeof input.titlePage !== 'boolean'
  )
    throw new ContentError('INVALID_COMPILATION', 'metadata')
  const requests: CitationRequest[] = []
  const pendingCitations = new WeakMap<Run, string>()
  const footnotes: Compilation['footnotes'] = []
  const identities = new Set<string>()
  const originDocuments = new Map<string, string>()
  const claim = (id: string): void => {
    if (identities.has(id)) throw new ContentError('DUPLICATE_ID', id)
    identities.add(id)
  }
  let nextNote = 1
  const sections = input.sections.map((section) => {
    if (
      !isId(section.documentId) ||
      typeof section.title !== 'string' ||
      section.title.length > 10000
    )
      throw new ContentError('INVALID_SECTION', 'section')
    claim(section.documentId)
    const payload = readDocument(section.payload)
    const visitIds = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (['blockId', 'citationId', 'footnoteId'].includes(key)) {
          claim(child as string)
          originDocuments.set(child as string, section.documentId)
        } else visitIds(child)
      }
    }
    visitIds(payload)
    function inline(content: Inline[] = [], noteIndex = 0): Run[] {
      return content.flatMap((node): Run[] => {
        if (node.type === 'text')
          return [{ kind: 'text', text: node.text, marks: node.marks ?? [] }]
        if (node.type === 'hardBreak') return [{ kind: 'break' }]
        if (node.type === 'footnote') {
          const number = nextNote++
          const body = payload.footnotesById[node.attrs.footnoteId]
          const note = {
            number,
            originId: node.attrs.footnoteId,
            paragraphs: body.content.map((p) => paragraph(p, number))
          }
          footnotes.push(note)
          return [{ kind: 'note', number }]
        }
        const automaticNote = input.style === 'chicago' && noteIndex === 0
        const number = automaticNote ? nextNote++ : noteIndex
        requests.push({ id: node.attrs.citationId, items: node.attrs.items, noteIndex: number })
        // Resolve only after all citations have been registered, including later disambiguation.
        const placeholder: Run = { kind: 'text', text: '', marks: [] }
        pendingCitations.set(placeholder, node.attrs.citationId)
        if (automaticNote) {
          footnotes.push({
            number,
            originId: node.attrs.citationId,
            paragraphs: [
              {
                kind: 'paragraph',
                blockId: node.attrs.citationId,
                runs: [placeholder],
                style: 'body'
              }
            ]
          })
          return [{ kind: 'note', number }]
        }
        return [placeholder]
      })
    }
    function paragraph(
      node: Extract<Block, { type: 'paragraph' | 'heading' }>,
      noteIndex = 0
    ): Paragraph {
      return {
        kind: 'paragraph',
        blockId: node.attrs.blockId,
        style: node.type === 'heading' ? `heading${node.attrs.level}` : 'body',
        runs: inline(node.content, noteIndex)
      }
    }
    function block(node: Block): CompileBlock[] {
      switch (node.type) {
        case 'paragraph':
        case 'heading':
          return [paragraph(node)]
        case 'blockquote':
          return node.content.map((p) => ({ ...paragraph(p), style: 'quote' }))
        case 'bulletList':
        case 'orderedList':
          return node.content.flatMap((item, i) =>
            item.content.map((p, j) => ({
              ...paragraph(p),
              list: {
                id: node.attrs.blockId,
                ordered: node.type === 'orderedList',
                start: node.attrs.start ?? 1,
                first: i === 0 && j === 0,
                marker: j === 0
              }
            }))
          )
        case 'table':
          return [
            {
              kind: 'table',
              blockId: node.attrs.blockId,
              header: node.content[0].content[0].type === 'tableHeader',
              rows: node.content.map((r) =>
                r.content.map((c) => c.content.map((p) => paragraph(p)))
              )
            }
          ]
        case 'image':
          return [{ kind: 'image', ...node.attrs }]
        case 'horizontalRule':
          return [{ kind: 'rule', blockId: node.attrs.blockId }]
        case 'pageBreak':
          return [{ kind: 'pageBreak', blockId: node.attrs.blockId }]
      }
    }
    const blocks: CompileBlock[] = []
    if (section.pageBreakBefore) blocks.push({ kind: 'pageBreak', blockId: section.documentId })
    for (const heading of section.headings ?? []) {
      if (
        !isId(heading.id) ||
        typeof heading.title !== 'string' ||
        heading.title.length > 500 ||
        ![1, 2, 3].includes(heading.level)
      )
        throw new ContentError('INVALID_SECTION', 'heading')
      blocks.push({
        kind: 'paragraph',
        blockId: heading.id,
        style: heading.level === 1 ? 'heading1' : heading.level === 2 ? 'heading2' : 'heading3',
        runs: [{ kind: 'text', text: heading.title, marks: [] }]
      })
    }
    if (section.includeTitle)
      blocks.push({
        kind: 'paragraph',
        blockId: section.documentId,
        style:
          section.titleLevel === 3
            ? 'heading3'
            : section.titleLevel === 2
              ? 'heading2'
              : 'heading1',
        runs: [{ kind: 'text', text: section.title, marks: [] }]
      })
    blocks.push(...payload.ast.content.flatMap(block))
    return { documentId: section.documentId, blocks }
  })
  const bibliography = format(requests)
  const rendered = (id: string): Run[] => {
    if (!Object.hasOwn(bibliography.citations, id))
      throw new ContentError('UNRESOLVED_CITATION', id)
    return structuredClone(bibliography.citations[id])
  }
  const resolveParagraph = (p: Paragraph): void => {
    p.runs = p.runs.flatMap((run) => {
      const id = pendingCitations.get(run)
      return id ? rendered(id) : [run]
    })
  }
  for (const section of sections)
    for (const block of section.blocks) {
      if (block.kind === 'paragraph') resolveParagraph(block)
      else if (block.kind === 'table') block.rows.flat(2).forEach(resolveParagraph)
    }
  footnotes.forEach((note) => note.paragraphs.forEach(resolveParagraph))
  footnotes.sort((a, b) => a.number - b.number)
  const sourceMap: Compilation['sourceMap'] = []
  for (const section of sections)
    for (const block of section.blocks) {
      sourceMap.push({ documentId: section.documentId, blockId: block.blockId, kind: block.kind })
      if (block.kind === 'table')
        for (const paragraph of block.rows.flat(2))
          sourceMap.push({
            documentId: section.documentId,
            blockId: paragraph.blockId,
            kind: 'paragraph'
          })
    }
  for (const note of footnotes) {
    const documentId = originDocuments.get(note.originId)
    if (documentId) sourceMap.push({ documentId, blockId: note.originId, kind: 'footnote' })
  }
  return freeze({
    version: 5,
    metadata: { ...input.metadata },
    titlePage: input.titlePage,
    capturedHead: input.capturedHead,
    style: input.style,
    paper: input.paper,
    sections,
    footnotes,
    bibliography,
    sourceMap
  })
}
