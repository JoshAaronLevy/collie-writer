/** Map a visible Markdown selection back to exact retained answer text.
 * Only rendered text spans carry offsets; generated badges/images confer no provenance. */
export function selectedReference(
  host: HTMLElement | null,
  answer: string
): { text: string; title: string } | null {
  const selection = window.getSelection()
  if (!host || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0),
    title = selection.toString().trim()
  if (!host.contains(range.commonAncestorContainer) || !title || title.length > 2000) return null
  let start = -1,
    end = -1,
    displayed = ''
  for (const span of host.querySelectorAll<HTMLElement>('[data-chat-offset]')) {
    if (!range.intersectsNode(span)) continue
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
    const offset = Number(span.dataset.chatOffset) + prefix.toString().length
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      answer.slice(offset, offset + text.length) !== text
    )
      return null
    if (start < 0) start = offset
    end = offset + text.length
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
