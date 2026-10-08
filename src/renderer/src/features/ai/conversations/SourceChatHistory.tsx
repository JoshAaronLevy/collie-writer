import { useEffect, useState } from 'react'
import type { ConversationValue } from '../../../../../shared/conversations'
import { AppButton } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useConversations } from './conversationState'
import { ChatLink } from './ChatMarkdown'

export function SourceChatHistory({ sourceId }: { sourceId: string }): React.JSX.Element {
  const session = useWorkspaceSession(),
    c = useConversations(),
    p = session.project
  const [offset, setOffset] = useState(0),
    [value, setValue] = useState<Extract<ConversationValue, { type: 'reference-history' }> | null>(
      null
    ),
    [issue, setIssue] = useState('')
  const projectId = p?.projectId,
    workspaceId = p?.workspaceId,
    head = p?.headCommitId
  useEffect(() => {
    if (!projectId || !workspaceId) return
    let current = true
    void window.collie
      .conversation({
        projectId,
        workspaceId,
        action: 'reference-history',
        sourceId,
        offset
      })
      .then((r) => {
        if (!current) return
        if (r.ok && r.value.type === 'reference-history') {
          setValue(r.value)
          setIssue('')
        } else setIssue('Chat provenance could not be loaded.')
      })
      .catch(() => {
        if (current) setIssue('Chat provenance could not be loaded.')
      })
    return () => {
      current = false
    }
  }, [projectId, workspaceId, head, sourceId, offset])
  if (!value?.items.length && !issue) return <></>
  return (
    <details>
      <summary>Saved from conversations</summary>
      {issue ? <p role="status">{issue}</p> : null}
      <ul>
        {value?.items.map((r) => (
          <li key={r.operationId}>
            <p>
              {new Date(r.createdAt).toLocaleString()} ·{' '}
              {r.existingSourceId ? 'Linked to this source' : 'Added to Research'}
            </p>
            {r.origin.reference.kind === 'web' ? (
              <ChatLink url={r.origin.reference.url} label={r.origin.reference.url} />
            ) : (
              <blockquote>{r.origin.reference.text}</blockquote>
            )}
            <p>
              {r.verified
                ? 'Details marked as checked during review.'
                : 'Details were not marked as checked during review.'}{' '}
              The saved chat text is not a verified quotation from an original.
            </p>
            <AppButton
              variant="subtle"
              size="compact-sm"
              onClick={() => {
                c.show(r.origin.attemptId)
              }}
            >
              Open conversation
            </AppButton>
          </li>
        ))}
      </ul>
      {offset > 0 ? (
        <AppButton variant="subtle" onClick={() => setOffset((n) => Math.max(0, n - 20))}>
          Previous
        </AppButton>
      ) : null}
      {value?.more ? (
        <AppButton variant="subtle" onClick={() => setOffset((n) => n + 20)}>
          More
        </AppButton>
      ) : null}
    </details>
  )
}
