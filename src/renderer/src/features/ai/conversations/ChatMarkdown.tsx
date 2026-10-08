import type { WebCitation } from '../../../../../shared/conversation-research'
import { Fragment, memo, useState, type ReactNode } from 'react'
import styles from './Conversations.module.css'

/** Deliberately small Markdown subset. React escapes every string; no HTML or embeds. */
export function ChatLink({
  label,
  url,
  description,
  sourceOffset
}: {
  label: string
  url: string
  description?: string
  sourceOffset?: number
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button
        type="button"
        className={styles['chat-link']}
        title={description ?? url}
        onClick={() => {
          void window.collie
            .conversationPresentation('open-link', url)
            .then((ok) => setFailed(!ok))
            .catch(() => setFailed(true))
        }}
      >
        {sourceOffset === undefined ? label : raw(label, sourceOffset)}
      </button>
      {failed ? <span role="status"> (Link unavailable)</span> : null}
    </>
  )
}
function raw(text: string, offset: number): React.JSX.Element {
  return (
    <span key={`text-${offset}`} data-chat-offset={offset}>
      {text}
    </span>
  )
}
function inline(text: string, offset: number): ReactNode[] {
  const nodes: ReactNode[] = []
  // Bounded tokens avoid interpreting arbitrary HTML, images or untrusted schemes.
  const pattern =
    /!\[([^\]\n]{0,300})\]\([^\s)]{1,2048}\)|\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]{1,2048})\)|\*\*([^*\n]{1,4000})\*\*|`([^`\n]{1,4000})`|\*([^*\n]{1,4000})\*/g
  let start = 0
  for (const match of text.matchAll(pattern)) {
    const i = match.index!
    if (i > start) nodes.push(raw(text.slice(start, i), offset + start))
    nodes.push(
      match[1] !== undefined ? (
        <span key={i}>[Image omitted{match[1] ? `: ${match[1]}` : ''}]</span>
      ) : match[2] ? (
        <ChatLink key={i} label={match[2]} url={match[3]} sourceOffset={offset + i + 1} />
      ) : match[4] ? (
        <strong key={i}>{raw(match[4], offset + i + 2)}</strong>
      ) : match[5] ? (
        <code key={i}>{raw(match[5], offset + i + 1)}</code>
      ) : (
        <em key={i}>{raw(match[6], offset + i + 1)}</em>
      )
    )
    start = i + match[0].length
  }
  if (start < text.length) nodes.push(raw(text.slice(start), offset + start))
  return nodes
}
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  citations = []
}: {
  text: string
  citations?: WebCitation[]
}): React.JSX.Element {
  const lines = text.split('\n'),
    blocks: ReactNode[] = []
  const starts: number[] = [0]
  for (const line of lines) starts.push(starts[starts.length - 1] + line.length + 1)
  const placed = new Set<number>()
  // Associate against canonical offsets before Markdown removes delimiters.
  // Badges follow the enclosing paragraph/list item; tooltips retain the exact passage.
  const cite = (lineAfter: number): ReactNode =>
    citations.map((c, n) => {
      if (placed.has(n) || c.end > Math.min(text.length, starts[lineAfter])) return null
      placed.add(n)
      return (
        <Fragment key={n}>
          {' '}
          <ChatLink
            label={`[${n + 1}]`}
            url={c.url}
            description={`${c.title || c.url} · ${text.slice(c.start, c.end).slice(0, 500)}`}
          />
        </Fragment>
      )
    })
  for (let i = 0; i < lines.length;) {
    const key = i,
      line = lines[i]
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
      if (i < lines.length) i++
      blocks.push(
        <pre key={key}>
          <code>{raw(code.join('\n'), starts[key + 1])}</code>
          {cite(i)}
        </pre>
      )
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <h4 key={key}>
          {inline(
            line.replace(/^#{1,6}\s+/, ''),
            starts[i] + (line.match(/^#{1,6}\s+/)?.[0].length ?? 0)
          )}
          {cite(i + 1)}
        </h4>
      )
      i++
    } else if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\. /.test(line),
        items: ReactNode[] = []
      const pattern = ordered ? /^\s*\d+\. / : /^\s*[-*+] /
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(
          <li key={i}>
            {inline(
              lines[i].replace(pattern, ''),
              starts[i] + (lines[i].match(pattern)?.[0].length ?? 0)
            )}
            {cite(i + 1)}
          </li>
        )
        i++
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>)
    } else if (/^>\s?/.test(line)) {
      blocks.push(
        <blockquote key={key}>
          {inline(line.replace(/^>\s?/, ''), starts[i] + (line.match(/^>\s?/)?.[0].length ?? 0))}
          {cite(i + 1)}
        </blockquote>
      )
      i++
    } else if (!line.trim()) i++
    else {
      const paragraph = [line]
      i++
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(?:\s*```|#{1,6}\s|>\s?|\s*(?:[-*+] |\d+\. ))/.test(lines[i])
      )
        paragraph.push(lines[i++])
      blocks.push(
        <p key={key}>
          {inline(paragraph.join('\n'), starts[key])}
          {cite(i)}
        </p>
      )
    }
  }
  return (
    <div className={styles['chat-markdown']}>
      {blocks}
      {cite(lines.length)}
    </div>
  )
})
