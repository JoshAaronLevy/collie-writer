import { memo, useState, type ReactNode } from 'react'
import styles from './Conversations.module.css'

/** Deliberately small Markdown subset. React escapes every string; no HTML or embeds. */
function Link({ label, url }: { label: string; url: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button
        type="button"
        className={styles['chat-link']}
        title={url}
        onClick={() => {
          void window.collie.conversationPresentation('open-link', url).then((ok) => setFailed(!ok))
        }}
      >
        {label}
      </button>
      {failed ? <span role="status"> (Link unavailable)</span> : null}
    </>
  )
}
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Bounded tokens avoid interpreting arbitrary HTML, images or untrusted schemes.
  const pattern =
    /!\[([^\]\n]{0,300})\]\([^\s)]{1,2048}\)|\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]{1,2048})\)|\*\*([^*\n]{1,4000})\*\*|`([^`\n]{1,4000})`|\*([^*\n]{1,4000})\*/g
  let start = 0
  for (const match of text.matchAll(pattern)) {
    const i = match.index!
    if (i > start) nodes.push(text.slice(start, i))
    nodes.push(
      match[1] !== undefined ? (
        <span key={i}>[Image omitted{match[1] ? `: ${match[1]}` : ''}]</span>
      ) : match[2] ? (
        <Link key={i} label={match[2]} url={match[3]} />
      ) : match[4] ? (
        <strong key={i}>{match[4]}</strong>
      ) : match[5] ? (
        <code key={i}>{match[5]}</code>
      ) : (
        <em key={i}>{match[6]}</em>
      )
    )
    start = i + match[0].length
  }
  if (start < text.length) nodes.push(text.slice(start))
  return nodes
}
export const ChatMarkdown = memo(function ChatMarkdown({
  text
}: {
  text: string
}): React.JSX.Element {
  const lines = text.split('\n'),
    blocks: ReactNode[] = []
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
          <code>{code.join('\n')}</code>
        </pre>
      )
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h4 key={key}>{inline(line.replace(/^#{1,6}\s+/, ''))}</h4>)
      i++
    } else if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\. /.test(line),
        items: ReactNode[] = []
      const pattern = ordered ? /^\s*\d+\. / : /^\s*[-*+] /
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(pattern, ''))}</li>)
        i++
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>)
    } else if (/^>\s?/.test(line)) {
      blocks.push(<blockquote key={key}>{inline(line.replace(/^>\s?/, ''))}</blockquote>)
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
      blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>)
    }
  }
  return <div className={styles['chat-markdown']}>{blocks}</div>
})
