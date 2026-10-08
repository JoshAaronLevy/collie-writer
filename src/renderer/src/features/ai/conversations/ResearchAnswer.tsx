import { selectedReference } from './chat-selection'
import { useEffect, useState, useRef } from 'react'
import type { ConversationTurn, ConversationValue } from '../../../../../shared/conversations'
import type { WebReference } from '../../../../../shared/conversation-research'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useConversations } from './conversationState'
import { AppButton } from '../../../components/ui/Controls'
import { ChatMarkdown, ChatLink } from './ChatMarkdown'
import styles from './Conversations.module.css'

export function ResearchAnswer({ turn }: { turn: ConversationTurn }): React.JSX.Element {
  const c = useConversations(),
    session = useWorkspaceSession()
  const [result, setResult] = useState<{
    key: string
    value: Extract<ConversationValue, { type: 'web-matches' }> | null
  } | null>(null)
  const [retry, setRetry] = useState(0)
  const scope = c.scope,
    head = session.project?.headCommitId,
    id = turn.attempt.id
  const key = `${scope?.projectId}:${scope?.workspaceId}:${id}:${turn.assistant?.revisionId}`
  useEffect(() => {
    if (!scope || !turn.research) return
    let current = true
    void window.collie
      .conversation({ ...scope, action: 'web-matches', attemptId: id })
      .then((r) => {
        if (current)
          setResult({ key, value: r.ok && r.value.type === 'web-matches' ? r.value : null })
      })
      .catch(() => {
        if (current) setResult({ key, value: null })
      })
    return () => {
      current = false
    }
  }, [scope, head, id, key, retry, turn.research])
  const answer = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<ReturnType<typeof selectedReference>>(null)
  function selectionChanged(): void {
    setSelection(selectedReference(answer.current, turn.assistant?.text ?? ''))
  }
  const answerText = (
    <>
      <div ref={answer} onMouseUp={selectionChanged} onKeyUp={selectionChanged}>
        <ChatMarkdown
          text={turn.assistant?.text ?? ''}
          citations={result?.key === key ? turn.research?.citations : []}
        />
      </div>
      {selection && turn.attempt.state === 'completed' ? (
        <AppButton
          variant="subtle"
          size="compact-sm"
          disabled={c.readOnly}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            c.references.begin(turn, { kind: 'text', text: selection.text }, selection.title)
          }
        >
          Save reference
        </AppButton>
      ) : null}
    </>
  )
  const research = turn.research,
    checked = result?.key === key ? result : null
  if (!research) return answerText
  const references = [...new Map(research.citations.map((ref) => [ref.url, ref])).values()]
  const extras = research.sources.filter(
    (ref) => !references.some((cited) => cited.url === ref.url)
  )
  const reference = (ref: WebReference): React.JSX.Element => {
    const matches = checked?.value?.items.find((item) => item.url === ref.url)?.matches ?? []
    return (
      <li key={ref.url}>
        <ChatLink label={ref.title || ref.url} url={ref.url} />
        {!matches.some((m) => m.status === 'exact') ? (
          <AppButton
            size="compact-sm"
            variant="subtle"
            disabled={c.readOnly}
            onClick={() =>
              c.references.begin(turn, { kind: 'web', url: ref.url }, ref.title || ref.url)
            }
          >
            Add to Research
          </AppButton>
        ) : null}
        {matches.map((match) => (
          <span key={match.id} className={styles['research-match']}>
            {match.status === 'exact'
              ? 'In Research'
              : match.status === 'trashed'
                ? 'Removed from Research'
                : 'Possible existing source'}
            <AppButton
              variant="subtle"
              size="compact-sm"
              onClick={() => session.research({ kind: 'sources', sourceId: match.id })}
            >
              {match.status === 'possible' ? 'Review match' : 'Open source'}
            </AppButton>
            {match.status === 'exact' ? (
              <AppButton
                size="compact-sm"
                variant="subtle"
                disabled={c.readOnly}
                onClick={() => void c.references.cite(match.id)}
              >
                Cite
              </AppButton>
            ) : null}
          </span>
        ))}
      </li>
    )
  }
  return (
    <>
      {answerText}
      {!checked ? (
        <p className={styles['conversation-caption']} role="status">
          Checking project Research…
        </p>
      ) : (
        <>
          {!checked.value ? (
            <p role="status" className={styles['conversation-caption']}>
              Could not check project Research. These references may already be saved.{' '}
              <AppButton variant="subtle" size="compact-sm" onClick={() => setRetry((n) => n + 1)}>
                Check again
              </AppButton>
            </p>
          ) : null}
          {references.length ? (
            <div className={styles['research-references']} aria-label="Cited sources">
              <strong>Sources</strong>
              <ul>{references.map(reference)}</ul>
            </div>
          ) : null}
          {extras.length ? (
            <details className={styles['research-references']}>
              <summary>Other pages retrieved · {extras.length}</summary>
              <ul>{extras.map(reference)}</ul>
            </details>
          ) : null}
        </>
      )}
      {!research.searched ? (
        <p className={styles['conversation-caption']}>
          ChatGPT returned an answer without a confirmed web search.
        </p>
      ) : null}
      {research.warning ? (
        <p className={styles['conversation-caption']}>
          Some source details were missing or could not be displayed. The answer is kept; review its
          sources before citing it.
        </p>
      ) : null}
    </>
  )
}
