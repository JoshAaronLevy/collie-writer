import { useEffect, useRef, useState } from 'react'
import { AppButton, SelectField } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useConversations } from './conversationState'
import {
  KNOWLEDGE_KINDS,
  knowledgeKey,
  type KnowledgeTarget,
  type KnowledgeItem,
  type KnowledgeSettings,
  type KnowledgeChange,
  type SourceMatch
} from '../../../../../shared/conversation-knowledge'
import type { ConversationTurn, ConversationValue } from '../../../../../shared/conversations'

export function KnowledgeLink({ item }: { item: KnowledgeItem }): React.JSX.Element {
  const c = useConversations(),
    s = useWorkspaceSession()
  const open = (): void => {
    if (!c.scope || s.closing || s.navigating || c.composingRef.current) return
    if (item.kind === 'chat') c.choose(item.id)
    else if (item.kind === 'source')
      s.research(
        item.versionId
          ? { kind: 'inspector', sourceId: item.id, versionId: item.versionId }
          : { kind: 'sources', sourceId: item.id }
      )
    else if (item.kind === 'excerpt' && item.sourceId && item.versionId)
      s.research({
        kind: 'inspector',
        sourceId: item.sourceId,
        versionId: item.versionId,
        excerptId: item.id
      })
    else if (item.kind === 'note') s.research({ kind: 'notes', noteId: item.id })
    else if (item.kind === 'document')
      void s.navigate({ kind: 'workspace', scope: c.scope, view: 'write', documentId: item.id })
  }
  return (
    <AppButton variant="subtle" size="compact-sm" onClick={open}>
      Open {item.kind === 'document' ? 'writing' : item.kind}
    </AppButton>
  )
}
export function ConversationKnowledge(): React.JSX.Element {
  const c = useConversations(),
    s = useWorkspaceSession(),
    [settings, setSettings] = useState<KnowledgeSettings | null>(null),
    [excludedTitles, setExcludedTitles] = useState<string[]>([]),
    [kind, setKind] = useState<KnowledgeTarget['kind']>('source'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState<Extract<ConversationValue, { type: 'context-candidates' }> | null>(
      null
    ),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState('')
  const sequence = useRef(0)
  useEffect(
    () => () => {
      sequence.current++
    },
    []
  )
  const blocked =
    busy || c.busy || !!c.pending || !!c.run?.pending || c.readOnly || s.closing || s.navigating
  async function read(): Promise<void> {
    if (!c.scope || !c.selected) return
    const seq = ++sequence.current
    setBusy(true)
    setIssue('')
    try {
      const r = await window.collie.conversation({
        ...c.scope,
        action: 'context-read',
        conversationId: c.selected
      })
      if (seq !== sequence.current) return
      if (r.ok && r.value.type === 'context-settings') {
        setSettings(r.value.settings)
        setExcludedTitles(r.value.excludedTitles)
      } else setIssue(r.ok ? 'Context could not be read.' : r.error.message)
    } catch {
      if (seq === sequence.current) setIssue('Context could not be read. Try again.')
    } finally {
      if (seq === sequence.current) setBusy(false)
    }
  }
  async function find(next = 0): Promise<void> {
    if (!c.scope) return
    const seq = ++sequence.current
    setBusy(true)
    setIssue('')
    try {
      const r = await window.collie.conversation({
        ...c.scope,
        action: 'context-candidates',
        kind,
        query,
        offset: next
      })
      if (seq !== sequence.current) return
      if (r.ok && r.value.type === 'context-candidates') {
        setPage(r.value)
        setOffset(next)
      } else setIssue(r.ok ? 'No context list was returned.' : r.error.message)
    } catch {
      if (seq === sequence.current) setIssue('Context items could not be read.')
    } finally {
      if (seq === sequence.current) setBusy(false)
    }
  }
  async function change(target: KnowledgeTarget, mode: KnowledgeChange['mode']): Promise<void> {
    if (!c.scope || !c.selected || !settings || blocked || c.composingRef.current) return
    const seq = sequence.current
    await c.request({
      ...c.scope,
      action: 'context-change',
      conversationId: c.selected,
      operationId: crypto.randomUUID(),
      expectedRevision: settings.revision,
      change: { target: { kind: target.kind, id: target.id }, mode }
    })
    if (seq === sequence.current) await read()
  }
  const last = c.page
    ? [...c.page.turns].reverse().find((t) => t.capture.version === 4 && t.capture.knowledge)
        ?.capture
    : undefined
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) void read()
      }}
    >
      <summary>Project material</summary>
      <p>
        Project context refreshes automatic selection on Send. Pins are excluded in This chat only
        and Message only. Pins keep a fixed passage or metadata snapshot until refreshed. Archived
        chats are included only by deliberately pinning them.
      </p>
      <AppButton variant="subtle" size="compact-sm" disabled={busy} onClick={() => void read()}>
        Refresh selections
      </AppButton>
      {busy ? <p role="status">Reading project material…</p> : null}
      {issue ? <p role="alert">{issue}</p> : null}
      {settings?.pins.map((pin) => (
        <details key={knowledgeKey(pin)}>
          <summary>Pinned · {pin.title}</summary>
          <p>{pin.text}</p>
          <p>
            Snapshot {pin.revision}. {pin.text.length < pin.total ? 'Partial passage.' : ''} Removed
            or superseded items are excluded on Send.
          </p>
          <KnowledgeLink item={pin} />
          <AppButton
            size="compact-sm"
            variant="subtle"
            disabled={blocked}
            onClick={() => void change(pin, 'refresh')}
          >
            Refresh snapshot
          </AppButton>
          <AppButton
            size="compact-sm"
            variant="subtle"
            disabled={blocked}
            onClick={() => void change(pin, 'unpin')}
          >
            Unpin
          </AppButton>
        </details>
      ))}
      {settings?.excluded.map((target, index) => (
        <p key={knowledgeKey(target)}>
          Excluded {target.kind} · {excludedTitles[index] || target.id}{' '}
          <AppButton
            variant="subtle"
            size="compact-sm"
            disabled={blocked}
            onClick={() => void change(target, 'include')}
          >
            Allow again
          </AppButton>
        </p>
      ))}
      <SelectField
        label="Find project material"
        value={kind}
        disabled={busy}
        onChange={(e) => {
          setKind(e.currentTarget.value as KnowledgeTarget['kind'])
          setPage(null)
        }}
      >
        {KNOWLEDGE_KINDS.map((k) => (
          <option key={k} value={k}>
            {k === 'document' ? 'Writing' : k === 'chat' ? 'Chats (including archived)' : k}
          </option>
        ))}
      </SelectField>
      <label>
        Title{' '}
        <input
          value={query}
          disabled={busy}
          maxLength={160}
          onChange={(e) => {
            setQuery(e.currentTarget.value)
            setPage(null)
          }}
        />
      </label>
      <AppButton
        size="compact-sm"
        disabled={busy || !settings}
        onClick={() => {
          if (!c.composingRef.current) void find()
        }}
      >
        Find
      </AppButton>
      {page?.items.map((target, i) => (
        <p key={knowledgeKey(target)}>
          {page.titles[i]}{' '}
          <AppButton
            variant="subtle"
            size="compact-sm"
            disabled={blocked || target.id === c.selected}
            onClick={() => void change(target, 'pin')}
          >
            Pin snapshot
          </AppButton>
          <AppButton
            variant="subtle"
            size="compact-sm"
            disabled={blocked || target.id === c.selected}
            onClick={() => void change(target, 'exclude')}
          >
            Exclude
          </AppButton>
        </p>
      ))}
      {page?.more ? (
        <AppButton
          variant="subtle"
          size="compact-sm"
          disabled={busy}
          onClick={() => void find(offset + 20)}
        >
          More items
        </AppButton>
      ) : null}
      {last?.version === 4 && last.knowledge ? (
        <details>
          <summary>Last sent coverage</summary>
          <p>{last.knowledge.coverage}</p>
          {last.knowledge.items.map((item) => (
            <details key={knowledgeKey(item)}>
              <summary>
                {item.title} · {item.kind}
                {item.pinned ? ' · pinned' : ''}
              </summary>
              <p>{item.text}</p>
              <KnowledgeLink item={item} />
            </details>
          ))}
        </details>
      ) : null}
    </details>
  )
}
export function ConversationReferences({
  turn
}: {
  turn: ConversationTurn
}): React.JSX.Element | null {
  const c = useConversations(),
    s = useWorkspaceSession(),
    [matches, setMatches] = useState<SourceMatch[]>([]),
    [issue, setIssue] = useState(''),
    [revision, setRevision] = useState(0)
  const scope = c.scope,
    attemptId = turn.attempt.id,
    head = s.project?.headCommitId
  useEffect(() => {
    if (!scope) return
    let current = true
    void window.collie
      .conversation({ ...scope, action: 'source-matches', attemptId })
      .then((r) => {
        if (!current) return
        if (r.ok && r.value.type === 'source-matches') {
          setMatches(r.value.items)
          setIssue('')
        } else setIssue('Saved-source matches could not be checked.')
      })
      .catch(() => {
        if (current) setIssue('Saved-source matches could not be checked.')
      })
    return () => {
      current = false
    }
  }, [scope, attemptId, revision, head])
  const related =
    turn.capture.version === 4 || turn.capture.version === 5
      ? (turn.capture.knowledge?.items.filter(
          (i) => turn.assistant?.text.includes(i.id) && i.kind !== 'source'
        ) ?? [])
      : []
  if (!matches.length && !related.length && !issue) return null
  return (
    <details>
      <summary>
        Project references{matches.length ? ` · ${matches.length} source matches` : ''}
      </summary>
      {issue ? (
        <p role="status">
          {issue}{' '}
          <AppButton size="compact-sm" variant="subtle" onClick={() => setRevision((r) => r + 1)}>
            Check again
          </AppButton>
        </p>
      ) : null}
      {matches.map((m) => (
        <p key={m.id}>
          <strong>
            {m.status === 'exact'
              ? 'In Research'
              : m.status === 'trashed'
                ? 'Removed source'
                : 'Possible existing source'}
          </strong>{' '}
          · {m.title}
          <br />
          {m.reason}
          <AppButton
            size="compact-sm"
            variant="subtle"
            onClick={() => s.research({ kind: 'sources', sourceId: m.id })}
          >
            {m.status === 'possible' ? 'Review match' : 'Open source'}
          </AppButton>
          {m.status === 'exact' ? (
            <AppButton
              size="compact-sm"
              variant="subtle"
              disabled={c.readOnly}
              onClick={() => void c.references.cite(m.id)}
            >
              Cite
            </AppButton>
          ) : null}
        </p>
      ))}
      {related.map((item) => (
        <p key={knowledgeKey(item)}>
          {item.title} <KnowledgeLink item={item} />
        </p>
      ))}
      <p>
        Matches refer to saved project records, not verification of the answer. No match does not
        prove a reference is new.
      </p>
    </details>
  )
}
