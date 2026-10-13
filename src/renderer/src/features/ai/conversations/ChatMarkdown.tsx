import type { MediaTarget } from '../../../../../shared/chat-media'
import { ChatMedia, ChatAttachments, ChatMediaProvider } from './ChatMedia'
import type { WebCitation } from '../../../../../shared/conversation-research'
import { memo, useId, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownProvenance } from './markdown-provenance'
import styles from './Conversations.module.css'

export function ChatLink({
  label,
  url,
  description,
  id,
  ariaLabel,
  describedBy,
  children
}: {
  label?: string
  url: string
  description?: string
  id?: string
  ariaLabel?: string
  describedBy?: string
  children?: ReactNode
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <a
        className={styles['chat-link']}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        href={url}
        title={description}
        onClick={(event) => {
          event.preventDefault()
          if (url.startsWith('#')) {
            const target = document.getElementById(url.slice(1))
            if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1
            target?.scrollIntoView({ block: 'nearest' })
            target?.focus({ preventScroll: true })
            return
          }
          void window.collie
            .conversationPresentation('open-link', url)
            .then((ok) => setFailed(!ok))
            .catch(() => setFailed(true))
        }}
      >
        {children ?? label}
      </a>
      {failed ? (
        <span role="status" data-chat-generated>
          {' '}
          (Link unavailable)
        </span>
      ) : null}
    </>
  )
}
const markdownComponents: Components = {
  a: ({
    href,
    title,
    children,
    node,
    id,
    'aria-label': ariaLabel,
    'aria-describedby': describedBy
  }) => (
    <span
      data-chat-generated={
        node?.properties['data-chat-generated'] ||
        node?.properties.dataFootnoteRef ||
        node?.properties.dataFootnoteBackref !== undefined
          ? true
          : undefined
      }
    >
      <ChatLink
        url={href ?? ''}
        description={title}
        id={id}
        ariaLabel={ariaLabel}
        describedBy={describedBy}
      >
        {children}
      </ChatLink>
      <ChatMedia start={node?.position?.start.offset} end={node?.position?.end.offset} />
    </span>
  ),
  img: ({ alt, node }) => (
    <ChatMedia
      image
      alt={alt}
      start={node?.position?.start.offset}
      end={node?.position?.end.offset}
    />
  ),
  table: ({ children }) => (
    <div
      className={styles['message-table-scroll']}
      tabIndex={0}
      role="region"
      aria-label="Message table"
    >
      <table>{children}</table>
    </div>
  )
}
const noCitations: WebCitation[] = []
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  citations = noCitations,
  mediaTarget
}: {
  text: string
  citations?: WebCitation[]
  mediaTarget?: MediaTarget
}): React.JSX.Element {
  const footnotePrefix = `chat-${useId().replace(/:/g, '')}-`
  return (
    <ChatMediaProvider target={mediaTarget}>
      <div className={styles['chat-markdown']}>
        <Markdown
          skipHtml
          remarkRehypeOptions={{ clobberPrefix: footnotePrefix }}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[markdownProvenance, { text, citations, footnotePrefix }]]}
          components={markdownComponents}
        >
          {text}
        </Markdown>
        <ChatAttachments />
      </div>
    </ChatMediaProvider>
  )
})
