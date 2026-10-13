import { useContext, useState, type ReactNode } from 'react'
import { ChatMediaContext, useChatMedia } from './useChatMedia'
import type { MediaTarget } from '../../../../../shared/chat-media'
import styles from './Conversations.module.css'

export function ChatMediaProvider({
  target,
  children
}: {
  target?: MediaTarget
  children: ReactNode
}): React.JSX.Element {
  const media = useChatMedia(target)
  return <ChatMediaContext.Provider value={media}>{children}</ChatMediaContext.Provider>
}
export function ChatMedia({
  start,
  end,
  index,
  alt,
  image = false
}: {
  start?: number
  end?: number
  index?: number
  alt?: string
  image?: boolean
}): React.JSX.Element | null {
  const state = useContext(ChatMediaContext)
  const item =
    index === undefined
      ? state.items.find((i) => i.start !== null && i.start === start && i.end === end)
      : state.items[index]
  const asset = item ? state.assets[item.index] : undefined
  const [failedUrl, setFailedUrl] = useState('')
  if (!item && !image) return null
  const label = alt || item?.label || 'Image'
  const failed = asset === null || state.failed || (!!asset && failedUrl === asset.url)
  return (
    <span className={styles['chat-media']} data-chat-generated data-chat-media>
      {asset && !failed ? (
        asset.kind === 'image' ? (
          <img src={asset.url} alt={label} onError={() => setFailedUrl(asset.url)} />
        ) : asset.kind === 'audio' ? (
          <audio
            src={asset.url}
            controls
            preload="metadata"
            aria-label={label}
            onError={() => setFailedUrl(asset.url)}
          />
        ) : (
          <video
            src={asset.url}
            controls
            preload="metadata"
            playsInline
            aria-label={label}
            onError={() => setFailedUrl(asset.url)}
          />
        )
      ) : (
        <span role="status">
          {failed || (!item && state.key)
            ? `${label} unavailable`
            : `Loading ${item?.kind ?? 'image'}…`}
        </span>
      )}
    </span>
  )
}
export function ChatAttachments(): React.JSX.Element {
  const state = useContext(ChatMediaContext)
  return (
    <>
      {state.items
        .filter((i) => i.start === null)
        .map((i) => (
          <ChatMedia key={i.index} index={i.index} />
        ))}
      {state.more ? (
        <span data-chat-generated>Additional media is unavailable in this message.</span>
      ) : null}
      {state.failed ? (
        <span data-chat-generated role="status">
          Message media could not be read.
        </span>
      ) : null}
    </>
  )
}
