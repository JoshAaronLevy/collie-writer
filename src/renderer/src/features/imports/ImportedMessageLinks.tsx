import { useEffect, useState } from 'react'
import type { OpenInput } from '../../../../shared/projects'
import type { ImportedLinks } from '../../../../shared/imported-links'
import type { TranscriptEntry } from '../../../../shared/conversation-transcript'
import { AppButton } from '../../components/ui/Controls'
import { ChatMessage } from '../ai/conversations/ChatMessage'
import { useConversations } from '../ai/conversations/conversationState'
import { useWorkspaceSession } from '../workspace/workspaceContext'

function SourceLinks({
  value,
  scope
}: {
  value: ImportedLinks
  scope: OpenInput
}): React.JSX.Element {
  const session = useWorkspaceSession(),
    c = useConversations()
  const [page, setPage] = useState(value),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState('')
  const [previous, setPrevious] = useState(value)
  if (previous !== value) {
    setPrevious(value)
    setPage(value)
    setOffset(0)
    setBusy(false)
    setIssue('')
  }
  useEffect(() => {
    let current = true
    if (!offset) return
    void window.collie
      .conversation({
        ...scope,
        action: 'imported-links',
        messageId: value.target.messageId,
        offset
      })
      .then((r) => {
        if (!current) return
        if (r.ok && r.value.type === 'imported-links' && r.value.revisionId === value.revisionId) {
          setPage(r.value)
          setIssue('')
        } else setIssue('These links changed. Close sources and reopen them to refresh.')
      })
      .catch(() => {
        if (current) setIssue('Source links could not be read. Close sources and try again.')
      })
      .finally(() => {
        if (current) setBusy(false)
      })
    return () => {
      current = false
    }
  }, [offset, scope, value])
  return (
    <>
      <strong>Saved in Research</strong>
      <ul>
        {page.sources.map((source) => (
          <li key={source.id}>
            {source.title}
            {source.state === 'trashed' ? ' (removed)' : ''}
            <AppButton
              variant="subtle"
              size="compact-sm"
              onClick={() =>
                void session.research({ kind: 'sources', sourceId: source.id, page: 'details' })
              }
            >
              Open source
            </AppButton>
            {source.state === 'active' ? (
              <AppButton
                variant="subtle"
                size="compact-sm"
                disabled={c.readOnly}
                onClick={() => void c.references.cite(source.id)}
              >
                Cite
              </AppButton>
            ) : null}
          </li>
        ))}
      </ul>
      {issue ? <p role="status">{issue}</p> : null}
      {offset ? (
        <AppButton
          variant="subtle"
          disabled={busy}
          onClick={() => {
            setOffset(0)
            setPage(value)
            setIssue('')
          }}
        >
          First sources
        </AppButton>
      ) : null}
      {page.more ? (
        <AppButton
          variant="subtle"
          disabled={busy || !!issue}
          onClick={() => {
            setBusy(true)
            setOffset((n) => n + 20)
          }}
        >
          More sources
        </AppButton>
      ) : null}
    </>
  )
}
export function ImportedMessageLinks({
  entry,
  value,
  scope,
  now,
  retry,
  textIssue
}: {
  entry: TranscriptEntry
  value: ImportedLinks | null | undefined
  scope: OpenInput
  now: number
  retry: () => void
  textIssue: boolean
}): React.JSX.Element {
  const linked = !!value?.sources.some((source) => source.state === 'active')
  return (
    <ChatMessage
      role={entry.role === 'unknown' ? entry.originalRole || 'Unknown author' : entry.role}
      text={entry.text}
      mediaTarget={{
        ...scope,
        messageId: entry.key.messageId,
        messageRevision: entry.key.messageRevision
      }}
      time={entry.historicalTime}
      now={now}
      linked={linked}
      sources={
        linked && value ? (
          <SourceLinks key={value.revisionId} value={value} scope={scope} />
        ) : undefined
      }
      notice={
        <>
          {entry.text.length < entry.textUnits ? (
            <p role="status">
              {textIssue ? 'The remaining text could not be loaded.' : 'Loading remaining text…'}
            </p>
          ) : null}
          {value === null ? (
            <p role="status">
              Could not check linked Research.{' '}
              <AppButton variant="subtle" size="compact-sm" onClick={retry}>
                Retry
              </AppButton>
            </p>
          ) : null}
        </>
      }
    />
  )
}
