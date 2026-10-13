/** Map a visible Markdown selection back to exact retained answer text.
 * Only rendered text spans carry offsets; generated badges/images confer no provenance. */
export function selectedReference(
  host: HTMLElement | null,
  answer: string
): { text: string; title: string } | null {
  const selection = window.getSelection()
  if (!host || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const fragment = range.cloneContents()
  fragment.querySelectorAll('[data-chat-generated]').forEach((node) => node.remove())
  fragment.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  const title = fragment.textContent?.trim() ?? ''
  if (!host.contains(range.commonAncestorContainer) || !title || title.length > 2000) return null
  let start = -1,
    end = -1,
    displayed = ''
  for (const span of host.querySelectorAll<HTMLElement>('[data-chat-start][data-chat-end]')) {
    if (!range.intersectsNode(span) || span.closest('[data-chat-generated]')) continue
    const part = document.createRange()
    part.selectNodeContents(span)
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0)
      part.setStart(range.startContainer, range.startOffset)
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0)
      part.setEnd(range.endContainer, range.endOffset)
    const text = part.toString()
    if (!text) continue
    const prefix = document.createRange()
    prefix.selectNodeContents(span)
    prefix.setEnd(part.startContainer, part.startOffset)
    const from = Number(span.dataset.chatStart),
      to = Number(span.dataset.chatEnd)
    const visible = span.textContent ?? ''
    const prefixLength = prefix.toString().length
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to <= from ||
      to > answer.length
    )
      return null
    const direct = answer.slice(from, to) === visible
    // Decoded entities/escapes and normalized whitespace map to their entire parser token.
    if (!direct && (prefixLength !== 0 || text.length !== visible.length)) return null
    const offset = direct ? from + prefixLength : from
    const limit = direct ? offset + text.length : to
    if (start < 0) start = offset
    const splitsSurrogate = (at: number): boolean =>
      at > 0 &&
      at < answer.length &&
      /[\uD800-\uDBFF]/.test(answer[at - 1]) &&
      /[\uDC00-\uDFFF]/.test(answer[at])
    if (end > offset || splitsSurrogate(offset) || splitsSurrogate(limit)) return null
    end = limit
    displayed += text
  }
  if (
    start < 0 ||
    end <= start ||
    end - start > 2000 ||
    displayed.replace(/\s/gu, '') !== title.replace(/\s/gu, '')
  )
    return null
  return { text: answer.slice(start, end), title }
}
