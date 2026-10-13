import { parse, postprocess, preprocess } from 'micromark'
import { gfm } from 'micromark-extension-gfm'
import { decodeString } from 'micromark-util-decode-string'
import type { Element, Root, RootContent, Text } from 'hast'
import type { WebCitation } from '../../../../../shared/conversation-research'

type Piece = { start: number; end: number; text: string; code: boolean; ending: boolean }
const plainTokens = new Set([
  'data',
  'autolinkProtocol',
  'autolinkEmail',
  'literalAutolinkHttp',
  'literalAutolinkWww',
  'literalAutolinkEmail'
])

/** Parser-token ranges, not substring searches, associate displayed text with canonical UTF-16. */
export function markdownProvenance(options: {
  text: string
  citations: WebCitation[]
  footnotePrefix: string
}): (tree: Root) => void {
  return (tree) => {
    const { text, citations } = options
    const pieces: Piece[] = []
    const fencedStarts = new Set<number>()
    for (const [event, token, context] of postprocess(
      parse({ extensions: [gfm()] })
        .document()
        .write(preprocess()(text, undefined, true))
    )) {
      if (event !== 'exit') continue
      const type = token.type
      if (type === 'codeFenced') fencedStarts.add(token.start.offset)
      const code = type === 'codeTextData' || type === 'codeFlowValue'
      const ending = type === 'lineEnding' || type === 'lineEndingBlank'
      if (
        !code &&
        !ending &&
        !plainTokens.has(type) &&
        type !== 'characterEscape' &&
        type !== 'characterReference'
      )
        continue
      const raw = text.slice(token.start.offset, token.end.offset)
      pieces.push({
        start: token.start.offset,
        end: token.end.offset,
        code,
        ending,
        text:
          type === 'characterEscape' || type === 'characterReference'
            ? decodeString(raw)
            : context.sliceSerialize(token)
      })
    }
    pieces.sort((a, b) => a.start - b.start || b.end - a.end)
    const placed = new Set<number>()
    const badge = (citation: WebCitation, index: number): Element => ({
      type: 'element',
      tagName: 'a',
      properties: {
        href: citation.url,
        title: `${citation.title || citation.url} · ${text.slice(citation.start, citation.end).slice(0, 500)}`,
        'data-chat-generated': true
      },
      children: [{ type: 'text', value: `[${index + 1}]` }]
    })
    function mapped(node: Text, parent: Root | Element, inTable: boolean): RootContent[] {
      const position =
        node.position ??
        (parent.type === 'element' && parent.tagName === 'code' ? parent.position : undefined)
      const start = position?.start.offset,
        end = position?.end.offset
      if (start === undefined || end === undefined) return [node]
      const isCode = parent.type === 'element' && parent.tagName === 'code'
      const fenced = isCode && !node.position
      let low = 0,
        high = pieces.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if (pieces[middle].start < start) low = middle + 1
        else high = middle
      }
      let tokens: Piece[] = []
      for (let index = low; index < pieces.length && pieces[index].start < end; index++) {
        const piece = pieces[index]
        if (piece.end <= end && (isCode ? piece.code || piece.ending : !piece.code))
          tokens.push(piece)
      }
      if (fenced) {
        // mdast removes the opening-fence newline and one final code newline.
        if (fencedStarts.has(start) && tokens[0]?.ending) tokens.shift()
        if (tokens.at(-1)?.ending) tokens.pop()
      }
      // Token streams can contain enclosing autolink events; take each exact range once.
      let last = start
      tokens = tokens.filter((p) => {
        if (p.start < last) return false
        last = p.end
        return true
      })
      if (isCode && !fenced) tokens = tokens.map((p) => (p.ending ? { ...p, text: ' ' } : p))
      if (isCode && inTable)
        tokens = tokens.flatMap((piece) => {
          if (piece.text !== text.slice(piece.start, piece.end)) return [piece]
          const parts: Piece[] = []
          let from = 0
          for (const match of piece.text.matchAll(/\\([\\|])/g)) {
            if (match[1] !== '|') continue
            const at = match.index
            if (at > from)
              parts.push({
                ...piece,
                start: piece.start + from,
                end: piece.start + at,
                text: piece.text.slice(from, at)
              })
            parts.push({ ...piece, start: piece.start + at, end: piece.start + at + 2, text: '|' })
            from = at + 2
          }
          if (from < piece.text.length)
            parts.push({ ...piece, start: piece.start + from, text: piece.text.slice(from) })
          return parts
        })
      const decoded = tokens.map((p) => p.text).join('')
      const suffix = fenced && node.value === decoded + '\n' ? '\n' : ''
      if (decoded + suffix !== node.value) return [node] // Unproven transformations never acquire a quote anchor.
      const result: RootContent[] = tokens.map((p) => ({
        type: 'element',
        tagName: 'span',
        properties: { 'data-chat-start': p.start, 'data-chat-end': p.end },
        children: [{ type: 'text', value: p.text }]
      }))
      if (suffix) result.push({ type: 'text', value: suffix })
      return result
    }
    function visit(parent: Root | Element, inTable = false): void {
      inTable = inTable || (parent.type === 'element' && ['td', 'th'].includes(parent.tagName))
      if (parent.type === 'element') {
        if (parent.properties.id === 'footnote-label')
          parent.properties.id = `${options.footnotePrefix}footnote-label`
        if (parent.properties.dataFootnoteRef)
          parent.properties.ariaDescribedBy = [`${options.footnotePrefix}footnote-label`]
        if (
          parent.properties.dataFootnoteRef ||
          parent.properties.dataFootnoteBackref !== undefined
        )
          return
      }
      const children: RootContent[] = []
      for (const child of parent.children) {
        if (child.type === 'element') {
          visit(child, inTable)
          children.push(child)
          // Attach each citation to the first enclosing textual block containing its canonical end.
          if (
            ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'td', 'th'].includes(
              child.tagName
            )
          ) {
            for (const [index, citation] of citations.entries()) {
              if (
                !placed.has(index) &&
                citation.end <= (child.position?.end.offset ?? -1) &&
                citation.end > (child.position?.start.offset ?? -1)
              ) {
                child.children.push(badge(citation, index))
                placed.add(index)
              }
            }
          }
        } else if (child.type === 'text') children.push(...mapped(child, parent, inTable))
        else children.push(child)
      }
      parent.children = children as typeof parent.children
    }
    visit(tree)
    const remaining = citations.flatMap((c, i) => (placed.has(i) ? [] : [badge(c, i)]))
    if (remaining.length)
      tree.children.push({
        type: 'element',
        tagName: 'p',
        properties: { 'data-chat-generated': true },
        children: remaining
      })
  }
}
