import { useState } from 'react'
import { Checkbox, Popover } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { useConversations } from '../ai/conversations/conversationState'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import {
  planningCoverageLabel,
  type PlanningOrigin
} from '../../../../shared/planning-conversation'
import { usePlanningPage } from './usePlanningPage'
import styles from './PlanWorkspace.module.css'

export function PlanningChatControls({ blocked }: { blocked: boolean }): React.JSX.Element | null {
  const c = useConversations(),
    s = useWorkspaceSession(),
    p = c.planning
  const [opened, setOpened] = useState(false)
  const page = usePlanningPage(
    {
      ...c.scope!,
      location: { kind: 'pool' },
      filter: 'all',
      kind: 'all',
      status: 'all',
      query: '',
      offset: 0
    },
    opened && !!c.scope,
    s.project?.headCommitId ?? ''
  )
  if (!p) return null
  const value =
    p.scope.kind === 'project'
      ? 'project'
      : p.scope.kind === 'selection'
        ? 'selection'
        : `${p.scope.kind}:${p.scope.id}`
  const topicId = p.scope.kind === 'topic' ? p.scope.id : null
  const label =
    p.scope.kind === 'project'
      ? 'Project material'
      : p.scope.kind === 'selection'
        ? `${p.scope.items.length} selected items`
        : p.scope.kind === 'topic'
          ? 'This topic'
          : `Chapter: ${s.project?.documents.find((d) => d.id === (p.scope.kind === 'chapter' ? p.scope.id : ''))?.title ?? 'Unavailable'}`
  return (
    <div className={styles['planning-chat-controls']}>
      <Popover opened={opened} onChange={setOpened} position="top-start" width={300} withinPortal>
        <Popover.Target>
          <AppButton
            variant="subtle"
            size="compact-sm"
            disabled={blocked}
            onClick={() => setOpened(!opened)}
          >
            Using: {label} · Change
          </AppButton>
        </Popover.Target>
        <Popover.Dropdown>
          <SelectField
            label="Material scope"
            value={value}
            disabled={blocked}
            onChange={(event) => {
              const v = event.currentTarget.value
              if (v === 'project') c.setPlanningScope({ kind: 'project' })
              else if (v !== 'selection') {
                const [kind, id] = v.split(':')
                if (kind === 'topic' || kind === 'chapter') c.setPlanningScope({ kind, id })
              }
              setOpened(false)
            }}
          >
            <option value="project">Project material</option>
            {p.scope.kind === 'selection' ? (
              <option value="selection">Selected items</option>
            ) : null}
            {p.scope.kind === 'topic' && !page.view?.topics.some((t) => t.id === topicId) ? (
              <option value={value}>Selected topic</option>
            ) : null}
            {page.view?.topics.map((t) => (
              <option key={t.id} value={`topic:${t.id}`}>
                {t.title}
              </option>
            ))}
            {s.project?.documents
              .filter((d) => d.state === 'active')
              .map((d) => (
                <option key={d.id} value={`chapter:${d.id}`}>
                  {d.title}
                </option>
              ))}
          </SelectField>
          <p>
            Choose cards on the board and Discuss to use a selection. Set-aside and excluded
            material stays out.
          </p>
        </Popover.Dropdown>
      </Popover>
      {p.version !== 3 ? (
        <>
          <Checkbox
            label="Analyze the collection"
            checked={p.mode === 'collection'}
            disabled={blocked || p.version === 2}
            onChange={(event) =>
              c.setPlanningMode(event.currentTarget.checked ? 'collection' : 'question')
            }
          />
          <Checkbox
            label="Create editable outline"
            checked={p.version === 2}
            disabled={blocked}
            onChange={(event) => c.setOutlineProposal(event.currentTarget.checked)}
          />
        </>
      ) : (
        <p className={styles['chat-caption']}>
          Writing preview · nearby prose captured at Send. Material scope stays as shown when you
          change chapters.
        </p>
      )}
      <p className={styles['chat-caption']}>
        {p.mode === 'collection'
          ? 'Send may use up to 10 preparation requests, then one response. Stop keeps completed progress.'
          : p.version === 3
            ? 'Uses a relevant selection of material; the full chapter collection may not be included.'
            : 'Uses relevant passages. Turn on collection analysis for themes or an outline across all available material.'}
      </p>
      {!c.draft.text && p.version !== 3 ? (
        <div className={styles['plan-actions']}>
          {['Find themes', 'What needs development?', 'Suggest an outline'].map((text) => (
            <AppButton
              key={text}
              variant="subtle"
              size="compact-sm"
              disabled={blocked}
              onClick={() => {
                c.update({ text })
                c.setPlanningMode('collection')
                if (text === 'Suggest an outline') c.setOutlineProposal(true)
              }}
            >
              {text}
            </AppButton>
          ))}
        </div>
      ) : null}
      {p.version === 3 && s.destination.kind === 'workspace' && s.destination.view === 'plan' ? (
        <AppButton
          variant="subtle"
          size="compact-sm"
          disabled={blocked}
          onClick={() => c.setWriting(false)}
        >
          Discuss without insertion
        </AppButton>
      ) : null}
    </div>
  )
}

export function PlanningProgress(): React.JSX.Element | null {
  const c = useConversations(),
    a = c.analysis
  if (!a || a.mode === 'question') return null
  return (
    <div className={styles['planning-progress']}>
      <p role="status">
        {a.label} · {planningCoverageLabel(a)}
      </p>
      {!a.current ? (
        <p>
          Material has changed. Send again for current analysis; earlier results remain readable.
        </p>
      ) : null}
      {a.mode === 'collection' && (a.done < a.chunks || !a.answered) ? (
        <AppButton
          variant="subtle"
          size="compact-sm"
          disabled={!a.current || !c.canSend || c.busy || !!c.pending || c.active}
          onClick={() => void c.continuePlanning()}
        >
          Continue analysis
        </AppButton>
      ) : null}
      <PlanningOrigins key={a.runId} runId={a.runId} done={a.done} />
    </div>
  )
}

export function PlanningOrigins({
  runId,
  origins,
  done = 0
}: {
  runId: string
  origins?: PlanningOrigin[]
  done?: number
}): React.JSX.Element {
  const c = useConversations(),
    [items, setItems] = useState(origins ?? []),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [issue, setIssue] = useState(''),
    [busy, setBusy] = useState(false)
  async function read(next: number): Promise<void> {
    if (!c.scope || busy) return
    setBusy(true)
    try {
      const r = await window.collie.conversation({
        ...c.scope,
        action: 'planning-origins',
        runId,
        offset: next,
        done
      })
      if (!r.ok) {
        setIssue(r.error.message)
        return
      }
      if (r.value.type === 'planning-origins') {
        setItems(r.value.items)
        setMore(r.value.more)
        setOffset(next)
        setIssue('')
      }
    } catch {
      setIssue('Material references could not be read.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !origins && !items.length) void read(0)
      }}
    >
      <summary>{origins ? 'Original passages used' : 'Material covered by this analysis'}</summary>
      <p className={styles['chat-caption']}>
        Saved ranges identify the original input. Summaries are AI derivatives, not quotations or
        verified evidence.
      </p>
      {issue ? <p role="alert">{issue}</p> : null}
      <ul>
        {items.map((item, i) => (
          <li key={`${item.kind}:${item.id}:${item.partId}:${item.start}:${i}`}>
            <AppButton
              variant="subtle"
              size="compact-sm"
              onClick={() => void c.openPlanningOrigin(item)}
            >
              {item.title || item.kind}
            </AppButton>
            <span>
              {' '}
              · {item.role} · {item.start}–{item.end}
              {item.page === null ? '' : ` · page ${item.page + 1}`}
            </span>
          </li>
        ))}
      </ul>
      {!origins ? (
        <div className={styles['plan-actions']}>
          <AppButton
            variant="subtle"
            size="compact-sm"
            disabled={busy || offset === 0}
            onClick={() => void read(Math.max(0, offset - 20))}
          >
            Previous
          </AppButton>
          <AppButton
            variant="subtle"
            size="compact-sm"
            disabled={busy || !more}
            onClick={() => void read(offset + 20)}
          >
            More
          </AppButton>
        </div>
      ) : null}
    </details>
  )
}
