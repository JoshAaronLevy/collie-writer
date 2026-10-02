import type { DocumentPayload, Inline } from '../editor/schema'
import type { CaptureSource } from '../../shared/ai-content'

export type TextBlock = { id: string; inline: Inline[] }
/** Stable text projection. Structural objects are labelled, never fetched or expanded remotely. */
export function contextBlocks(payload: DocumentPayload): TextBlock[] {
  const blocks: TextBlock[] = []
  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const n = node as { type: string; attrs?: { blockId?: string }; content?: unknown[] }
    if ((n.type === 'paragraph' || n.type === 'heading') && n.attrs?.blockId) blocks.push({ id: n.attrs.blockId, inline: (n.content ?? []) as Inline[] })
    else n.content?.forEach(visit)
  }
  visit(payload.ast)
  return blocks
}
export function inlineContext(inline: Inline[], from = 0, to = Infinity): string {
  let offset = 0, text = ''
  for (const node of inline) {
    const size = node.type === 'text' ? node.text.length : 1
    const start = Math.max(from - offset, 0), end = Math.min(to - offset, size)
    if (end > start) text += node.type === 'text' ? node.text.slice(start,end) : node.type === 'hardBreak' ? '\n' : node.type === 'citation' ? '[citation reference]' : '[footnote reference]'
    offset += size
  }
  return text
}
export function captureWriting(payload: DocumentPayload, source: Exclude<CaptureSource,{kind:'none'}>): string {
  const blocks = contextBlocks(payload)
  if (source.kind === 'passage') {
    const positions = source.ranges.map(range => blocks.findIndex(block => block.id === range.blockId))
    if (positions.some((position,index) => position < 0 || index > 0 && (position<=positions[index-1]||blocks.slice(positions[index-1]+1,position).some(block=>block.inline.length>0)))) throw new Error('STALE_REVISION')
    const selected = source.ranges.map((range,index) => {
      const inline = blocks[positions[index]].inline, length = inline.reduce((n,item)=>n+(item.type==='text'?item.text.length:1),0)
      if (range.to > length || index > 0 && range.from !== 0 || index < source.ranges.length-1 && range.to !== length) throw new Error('STALE_REVISION')
      return inlineContext(inline,range.from,range.to)
    })
    let text=selected[0]
    for(let index=1;index<selected.length;index++)text+='\n\n'.repeat(positions[index]-positions[index-1])+selected[index]
    return text
  }
  const body = blocks.map(block => inlineContext(block.inline)).join('\n\n')
  const notes = Object.values(payload.footnotesById).map(note => note.content.map(p=>inlineContext(p.content??[])).join('\n\n'))
  return body + (notes.length ? '\n\nFootnotes:\n' + notes.join('\n\n') : '')
}
