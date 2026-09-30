/** Application-owned JSON schema. No editor-library types or derived citation strings. */
export const EDITOR_SCHEMA_VERSION = 1 as const
export type Mark = { type: 'bold' | 'italic' | 'underline' | 'strike' } | {
  type: 'link'; attrs: { href: string }
}
export type CitationItem = {
  sourceId: string
  locator?: string
  label?: 'page' | 'chapter' | 'section' | 'paragraph' | 'volume'
  prefix?: string
  suffix?: string
}
export type Inline =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'hardBreak' }
  | { type: 'citation'; attrs: { citationId: string; items: CitationItem[] } }
  | { type: 'footnote'; attrs: { footnoteId: string } }
export type Paragraph = { type: 'paragraph'; attrs: { blockId: string }; content?: Inline[] }
export type Block = Paragraph
  | { type: 'heading'; attrs: { blockId: string; level: 1 | 2 | 3 }; content?: Inline[] }
  | { type: 'blockquote'; attrs: { blockId: string }; content: Paragraph[] }
  | { type: 'bulletList' | 'orderedList'; attrs: { blockId: string; start?: number }; content: ListItem[] }
  | { type: 'horizontalRule' | 'pageBreak'; attrs: { blockId: string } }
  | { type: 'image'; attrs: { blockId: string; assetId: string; alt: string; caption: string; width: number; height: number } }
  | { type: 'table'; attrs: { blockId: string }; content: TableRow[] }
export type ListItem = { type: 'listItem'; attrs: { blockId: string }; content: Paragraph[] }
export type TableRow = { type: 'tableRow'; attrs: { blockId: string }; content: TableCell[] }
export type TableCell = { type: 'tableCell' | 'tableHeader'; attrs: { blockId: string }; content: Paragraph[] }
export type EditorNode = Block | Inline | ListItem | TableRow | TableCell
export type DocumentPayload = {
  schemaVersion: typeof EDITOR_SCHEMA_VERSION
  ast: { type: 'doc'; content: Block[] }
  footnotesById: Record<string, { type: 'doc'; content: Paragraph[] }>
}
export class ContentError extends Error {
  constructor(readonly code: string, readonly location: string) {
    super(`${code} at ${location}`)
  }
}
export const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function safeLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f]/u.test(value)) return false
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch { return false }
}

/** Reject before editor loading/commit/export. Never repair unknown persisted content by dropping it. */
export function readDocument(input: unknown): DocumentPayload {
  let count = 0
  let characters = 0
  const ids = new Set<string>()
  const notes = new Set<string>()
  const fail = (path: string): never => { throw new ContentError('INVALID_EDITOR_CONTENT', path) }
  const object = (x: unknown, keys: string[], path: string): Record<string, unknown> => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !keys.includes(k))) fail(path)
    return x as Record<string, unknown>
  }
  const string = (x: unknown, path: string, max = 1_000_000): void => {
    if (typeof x !== 'string' || x.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x)) fail(path)
    characters += (x as string).length
    if (characters > 20_000_000) fail(path)
  }
  const unique = (x: unknown, path: string): void => {
    if (!isId(x) || ids.has(x)) fail(path)
    ids.add(x as string)
  }
  const list = (x: unknown, path: string, min = 1, max = 200_000): unknown[] => {
    if (!Array.isArray(x) || x.length < min || x.length > max) fail(path)
    return x as unknown[]
  }
  function node(x: unknown, path: string, allowed: string[], inNote = false, cell = false): void {
    if (++count > 200_000) fail(path)
    const n = object(x, ['type', 'attrs', 'content', 'text', 'marks'], path)
    if (typeof n.type !== 'string' || !allowed.includes(n.type)) fail(path)
    const type = n.type as string
    if (type === 'text') {
      if (n.attrs !== undefined || n.content !== undefined || n.text === '') fail(path)
      string(n.text, path)
      if (n.marks !== undefined) {
        const seen = new Set<string>()
        for (const raw of list(n.marks, path, 0, 5)) {
          const mark = object(raw, ['type', 'attrs'], path)
          if (!['bold', 'italic', 'underline', 'strike', 'link'].includes(String(mark.type)) || seen.has(String(mark.type)) || cell) fail(path)
          seen.add(String(mark.type))
          if (mark.type === 'link') {
            if (!safeLink(object(mark.attrs, ['href'], path).href)) fail(path)
          } else if (mark.attrs !== undefined) fail(path)
        }
      }
      return
    }
    if (n.text !== undefined || n.marks !== undefined) fail(path)
    if (type === 'hardBreak') {
      if (n.attrs !== undefined || n.content !== undefined) fail(path)
      return
    }
    if (type === 'citation') {
      const a = object(n.attrs, ['citationId', 'items'], path)
      unique(a.citationId, path)
      if (n.content !== undefined) fail(path)
      for (const item of list(a.items, path, 1, 100)) {
        const i = object(item, ['sourceId', 'locator', 'label', 'prefix', 'suffix'], path)
        if (!isId(i.sourceId)) fail(path)
        for (const key of ['locator', 'prefix', 'suffix']) if (i[key] !== undefined) string(i[key], path, 2000)
        if (i.label !== undefined && !['page', 'chapter', 'section', 'paragraph', 'volume'].includes(String(i.label))) fail(path)
      }
      return
    }
    if (type === 'footnote') {
      if (inNote || n.content !== undefined) fail(path)
      const a = object(n.attrs, ['footnoteId'], path)
      unique(a.footnoteId, path)
      notes.add(a.footnoteId as string)
      return
    }
    const extras: Record<string, string[]> = {
      heading: ['level'], orderedList: ['start'], image: ['assetId', 'alt', 'caption', 'width', 'height']
    }
    const a = object(n.attrs, ['blockId', ...(extras[type] ?? [])], path)
    unique(a.blockId, path)
    if (type === 'heading' && (typeof a.level !== 'number' || ![1, 2, 3].includes(a.level))) fail(path)
    if (type === 'orderedList' && (!Number.isInteger(a.start) || Number(a.start) < 1 || Number(a.start) > 999999)) fail(path)
    if (['image', 'horizontalRule', 'pageBreak'].includes(type)) {
      if (n.content !== undefined) fail(path)
      if (type === 'image') {
        if (!isId(a.assetId)) fail(path)
        string(a.alt, path, 2000); string(a.caption, path, 10000)
        for (const key of ['width', 'height']) if (typeof a[key] !== 'number' || !Number.isFinite(a[key]) || Number(a[key]) < 1 || Number(a[key]) > 1600) fail(path)
      }
      return
    }
    let children: string[]
    if (['paragraph', 'heading'].includes(type)) children = cell ? ['text', 'hardBreak'] : ['text', 'hardBreak', 'citation', ...(inNote ? [] : ['footnote'])]
    else if (['bulletList', 'orderedList'].includes(type)) children = ['listItem']
    else if (type === 'table') children = ['tableRow']
    else if (type === 'tableRow') children = ['tableCell', 'tableHeader']
    else children = ['paragraph']
    const content = list(n.content ?? [], path, ['paragraph', 'heading'].includes(type) ? 0 : 1)
    content.forEach((child, index) => node(child, `${path}/${index}`, children, inNote, cell || type === 'tableCell' || type === 'tableHeader'))
    if (type === 'table') {
      const rows = content as TableRow[]
      const width = rows[0].content.length
      if (width > 20 || rows.length > 10000 || rows.some((r, i) => r.content.length !== width || r.content.some(c => c.type !== (i === 0 && rows[0].content[0].type === 'tableHeader' ? 'tableHeader' : 'tableCell')))) fail(path)
    }
  }
  const p = object(input, ['schemaVersion', 'ast', 'footnotesById'], 'document')
  if (p.schemaVersion !== EDITOR_SCHEMA_VERSION) throw new ContentError('UNSUPPORTED_EDITOR_VERSION', 'schemaVersion')
  const ast = object(p.ast, ['type', 'content'], 'ast')
  if (ast.type !== 'doc') fail('ast')
  list(ast.content, 'ast').forEach((n, i) => node(n, `ast/${i}`, ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'horizontalRule', 'pageBreak', 'image', 'table']))
  if (!p.footnotesById || typeof p.footnotesById !== 'object' || Array.isArray(p.footnotesById)) fail('footnotesById')
  const bodies = p.footnotesById as Record<string, unknown>
  if (Object.keys(bodies).length !== notes.size) fail('footnotesById')
  for (const [id, body] of Object.entries(bodies)) {
    if (!notes.has(id)) fail('footnotesById')
    const b = object(body, ['type', 'content'], `note/${id}`)
    if (b.type !== 'doc') fail(`note/${id}`)
    list(b.content, `note/${id}`).forEach((n, i) => node(n, `note/${id}/${i}`, ['paragraph'], true))
  }
  return structuredClone(input) as DocumentPayload
}

/** Copy duplicates the owned note bodies too; move uses the original payload unchanged. */
export function copyDocument(input: DocumentPayload, newId: () => string): DocumentPayload {
  const payload = readDocument(input)
  const mapping = new Map<string, string>()
  const remap = (id: string): string => {
    if (!mapping.has(id)) mapping.set(id, newId())
    return mapping.get(id)!
  }
  const visit = (n: EditorNode): void => {
    if ('attrs' in n) {
      if ('blockId' in n.attrs) n.attrs.blockId = remap(n.attrs.blockId)
      if ('citationId' in n.attrs) n.attrs.citationId = remap(n.attrs.citationId)
      if ('footnoteId' in n.attrs) n.attrs.footnoteId = remap(n.attrs.footnoteId)
    }
    if ('content' in n) n.content?.forEach(visit)
  }
  payload.ast.content.forEach(visit)
  payload.footnotesById = Object.fromEntries(Object.entries(payload.footnotesById).map(([id, body]) => {
    body.content.forEach(visit)
    return [remap(id), body]
  }))
  return readDocument(payload)
}
