import { WritingPreview } from './WritingPreview'
import { PlanningOrigins } from '../../planning/PlanningChatControls'
import { planningCoverageLabel } from '../../../../../shared/planning-conversation'
import { selectedReference } from './chat-selection'
import { useEffect, useState, useRef } from 'react'
import type { ConversationTurn, ConversationValue } from '../../../../../shared/conversations'
import type { SourceMatch } from '../../../../../shared/conversation-knowledge'
import { knowledgeKey } from '../../../../../shared/conversation-knowledge'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useConversations } from './conversationState'
import { AppButton } from '../../../components/ui/Controls'
import type { MenuAction } from '../../../components/ui/ActionMenu'
import { ChatMarkdown, ChatLink } from './ChatMarkdown'
import { ChatMessage } from './ChatMessage'
import { KnowledgeLink } from './ConversationKnowledge'
import styles from './Conversations.module.css'

type WebMatches = Extract<ConversationValue, { type: 'web-matches' }>['items']
export function ResearchAnswer({
  turn,
  now,
  actions
}: {
  turn: ConversationTurn
  now: number
  actions: MenuAction[]
}): React.JSX.Element {
  const c = useConversations(),
    session = useWorkspaceSession()
  const scope = c.scope,
    head = session.project?.headCommitId,
    id = turn.attempt.id
  const key = `${scope?.projectId}:${scope?.workspaceId}:${head}:${id}:${turn.assistant?.revisionId}`
  const [result, setResult] = useState<{
    key: string
    sources: SourceMatch[]
    web: WebMatches
  } | null>(null)
  const [failed, setFailed] = useState(''),
    [retry, setRetry] = useState(0)
  const proposal =
    turn.capture.version === 7 &&
    turn.capture.planning.version === 2 &&
    turn.capture.purpose === 'chat'
  const completed = turn.attempt.state === 'completed',
    hasResearch = !!turn.research
  useEffect(() => {
    if (!scope || !completed) return
    let current = true
    void (async () => {
      const [sources, web] = await Promise.all([
        window.collie.conversation({ ...scope, action: 'source-matches', attemptId: id }),
        hasResearch
          ? window.collie.conversation({ ...scope, action: 'web-matches', attemptId: id })
          : null
      ])
      if (!current) return
      if (
        !sources.ok ||
        sources.value.type !== 'source-matches' ||
        (web && (!web.ok || web.value.type !== 'web-matches'))
      ) {
        setFailed(key)
        return
      }
      setResult({
        key,
        sources: sources.value.items,
        web: web?.ok && web.value.type === 'web-matches' ? web.value.items : []
      })
      setFailed('')
    })().catch(() => {
      if (current) setFailed(key)
    })
    return () => {
      current = false
    }
  }, [scope, id, key, retry, completed, hasResearch])
  const checked = result?.key === key ? result : null
  const answer = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<ReturnType<typeof selectedReference>>(null)
  const selectionChanged = (): void =>
    setSelection(selectedReference(answer.current, turn.assistant?.text ?? ''))
  const related =
    turn.capture.version === 4 || turn.capture.version === 5 || turn.capture.version === 6
      ? (turn.capture.knowledge?.items.filter(
          (item) => item.kind !== 'source' && turn.assistant?.text.includes(item.id)
        ) ?? [])
      : []
  const references = [
    ...new Map(
      [...(turn.research?.citations ?? []), ...(turn.research?.sources ?? [])].map((ref) => [
        ref.url,
        ref
      ])
    ).values()
  ]
  const matches = new Map<string, SourceMatch>()
  for (const match of [
    ...(checked?.sources ?? []),
    ...(checked?.web.flatMap((item) => item.matches) ?? [])
  ]) {
    if (!matches.has(match.id) || match.status === 'exact') matches.set(match.id, match)
  }
  const issue =
    failed === key ? (
      <p className={styles['conversation-caption']} role="status">
        Could not check linked Research.{' '}
        <AppButton
          variant="subtle"
          size="compact-sm"
          onClick={() => {
            setFailed('')
            setRetry((n) => n + 1)
          }}
        >
          Retry
        </AppButton>
      </p>
    ) : null
  const sources =
    references.length || matches.size || related.length || issue || turn.capture.version === 7 ? (
      <>
        {turn.capture.version === 7 ? (
          <>
            <p>
              {planningCoverageLabel(turn.capture.planning.coverage, turn.capture.planning.mode)}
            </p>
            <PlanningOrigins
              key={turn.attempt.id}
              runId={turn.capture.planning.runId}
              done={turn.capture.planning.coverage.done}
              {...(turn.capture.planning.mode === 'question' && turn.capture.planning.origins.length
                ? { origins: turn.capture.planning.origins }
                : {})}
            />
          </>
        ) : null}
        {references.length ? (
          <>
            <strong>Sources used in this answer</strong>
            <ul>
              {references.map((ref) => (
                <li key={ref.url}>
                  <ChatLink label={ref.title || ref.url} url={ref.url} />
                  {!checked?.web
                    .find((item) => item.url === ref.url)
                    ?.matches.some((match) => match.status === 'exact') ? (
                    <AppButton
                      size="compact-sm"
                      variant="subtle"
                      disabled={c.readOnly || !completed}
                      onClick={() =>
                        c.references.begin(
                          turn,
                          { kind: 'web', url: ref.url },
                          ref.title || ref.url
                        )
                      }
                    >
                      Add to Research
                    </AppButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {matches.size ? (
          <>
            <strong>Project Research</strong>
            <ul>
              {[...matches.values()].map((match) => (
                <li key={match.id}>
                  {match.title} ·{' '}
                  {match.status === 'exact'
                    ? 'Saved in Research'
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
                      variant="subtle"
                      size="compact-sm"
                      disabled={c.readOnly}
                      onClick={() => void c.references.cite(match.id)}
                    >
                      Cite
                    </AppButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {related.map((item) => (
          <p key={knowledgeKey(item)}>
            {item.title} <KnowledgeLink item={item} />
          </p>
        ))}
      </>
    ) : undefined
  return (
    <ChatMessage
      passageTarget={
        turn.assistant &&
        completed &&
        c.page &&
        !(
          (turn.capture.version === 3 ||
            turn.capture.version === 4 ||
            turn.capture.version === 6 ||
            turn.capture.version === 7) &&
          turn.capture.purpose !== 'chat'
        )
          ? {
              conversationId: turn.attempt.conversationId,
              conversationRevisionId: c.page.conversation.revisionId,
              key: {
                segment: 'native',
                sequence: turn.assistant.ordinal,
                messageId: turn.assistant.id,
                messageRevision: turn.assistant.revisionId
              }
            }
          : undefined
      }
      role="assistant"
      text={turn.assistant?.text ?? ''}
      time={turn.assistant?.createdAt ?? null}
      now={now}
      actions={[
        ...actions,
        ...(turn.assistant &&
        completed &&
        c.page &&
        !(turn.capture.version === 7 && turn.capture.purpose === 'planning-summary')
          ? [
              {
                id: 'save-note',
                label: 'Save as note',
                disabled:
                  c.readOnly ||
                  c.passages.unavailable ||
                  c.passages.busy ||
                  !!c.passages.pending ||
                  turn.assistant.text.length > 20000,
                onSelect: () => {
                  if (turn.assistant && c.page)
                    void c.passages.keep({
                      conversationId: turn.attempt.conversationId,
                      conversationRevisionId: c.page.conversation.revisionId,
                      key: {
                        segment: 'native',
                        sequence: turn.assistant.ordinal,
                        messageId: turn.assistant.id,
                        messageRevision: turn.assistant.revisionId
                      },
                      start: 0,
                      end: turn.assistant.text.length,
                      quote: turn.assistant.text
                    })
                }
              }
            ]
          : [])
      ]}
      linked={[...matches.values()].some((m) => m.status === 'exact')}
      sources={sources}
      notice={
        <>
          {issue}
          {turn.research && !turn.research.searched ? (
            <p className={styles['conversation-caption']}>
              No web search was confirmed for this answer.
            </p>
          ) : null}
          {turn.research?.warning ? (
            <p className={styles['conversation-caption']}>
              Some source details are unavailable. Review sources before citing.
            </p>
          ) : null}
        </>
      }
    >
      <div ref={answer} onPointerUp={selectionChanged} onKeyUp={selectionChanged}>
        {proposal && completed && scope ? (
          <>
            <p>Outline suggestion ready to review. Your current outline is unchanged.</p>
            <AppButton
              variant="default"
              onClick={() =>
                session.navigate({
                  kind: 'workspace',
                  scope,
                  view: 'plan',
                  proposalAttemptId: turn.attempt.id
                })
              }
            >
              Review outline
            </AppButton>
            <details>
              <summary>Original response</summary>
              <ChatMarkdown text={turn.assistant?.text ?? ''} />
            </details>
          </>
        ) : (
          <ChatMarkdown
            text={turn.assistant?.text ?? ''}
            citations={turn.research?.citations}
            mediaTarget={
              scope && turn.assistant && completed
                ? {
                    ...scope,
                    messageId: turn.assistant.id,
                    messageRevision: turn.assistant.revisionId
                  }
                : undefined
            }
          />
        )}
      </div>
      <WritingPreview turn={turn} />
      {selection && completed ? (
        <>
          <AppButton
            data-chat-generated
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
          <AppButton
            variant="subtle"
            size="compact-sm"
            data-chat-generated
            disabled={c.readOnly}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              session.research({
                kind: 'evidence',
                create: {
                  id: crypto.randomUUID(),
                  text: selection.text,
                  ...(turn.capture.version === 7 && turn.capture.planning.scope.kind === 'chapter'
                    ? { documentId: turn.capture.planning.scope.id }
                    : {})
                }
              })
            }
          >
            Save as question
          </AppButton>
        </>
      ) : null}
    </ChatMessage>
  )
}
