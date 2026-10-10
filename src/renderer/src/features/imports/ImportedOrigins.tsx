import { useEffect, useRef, useState } from 'react'
import type { ImportContentValue } from '../../../../shared/import-content'
import type { ImportedLinks } from '../../../../shared/imported-links'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { ImportTranscriptPreview } from './ImportTranscriptPreview'
type Origins = Extract<ImportContentValue, { type: 'content-origins' }>
export function ImportedOrigins({
  kind,
  id
}: {
  kind: 'source' | 'note'
  id: string
}): React.JSX.Element {
  const session = useWorkspaceSession(),
    p = session.project
  const [value, setValue] = useState<Origins | null>(null),
    [offset, setOffset] = useState(0),
    [target, setTarget] = useState<ImportedLinks | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState('')
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  async function read(next: number): Promise<void> {
    if (!p || busy) return
    const g = ++generation.current
    setBusy(true)
    setIssue('')
    try {
      const r = await window.collie.projectImport({
        projectId: p.projectId,
        workspaceId: p.workspaceId,
        action: 'content-origins',
        kind,
        id,
        offset: next
      })
      if (g !== generation.current) return
      if (r.ok && r.value.type === 'content-origins') {
        setValue(r.value)
        setOffset(next)
        setTarget(null)
      } else setIssue('Imported origins could not be read.')
    } catch {
      if (g === generation.current) setIssue('Imported origins could not be read.')
    } finally {
      if (g === generation.current) setBusy(false)
    }
  }
  async function open(messageId: string): Promise<void> {
    if (!p || busy) return
    const g = ++generation.current
    setBusy(true)
    setIssue('')
    try {
      const r = await window.collie.conversation({
        projectId: p.projectId,
        workspaceId: p.workspaceId,
        action: 'imported-links',
        messageId,
        offset: 0
      })
      if (g !== generation.current) return
      if (r.ok && r.value.type === 'imported-links') setTarget(r.value)
      else setIssue('The original message could not be opened.')
    } catch {
      if (g === generation.current) setIssue('The original message could not be opened.')
    } finally {
      if (g === generation.current) setBusy(false)
    }
  }
  return (
    <details>
      <summary>Imported origins</summary>
      <AppButton variant="subtle" disabled={busy} onClick={() => void read(0)}>
        Read imported origins
      </AppButton>
      {issue ? <p role="status">{issue}</p> : null}
      {value?.origins.length === 0 ? <p>No imported origin is recorded.</p> : null}
      {value?.origins.map((o) => (
        <section key={o.id}>
          <p>
            Imported {new Date(o.importedAt).toLocaleString()} · {o.record.locator.pointer}
          </p>
          <p>
            Original {o.record.label || o.record.kind} · {o.authorship}. Original metadata is
            historical evidence; it does not mark a source as verified.
          </p>
          {o.relation ? (
            <p>
              Original relationship: {o.relation.decision ?? 'unspecified'}
              {o.relation.grade ? ` · original grade ${o.relation.grade}` : ''}
            </p>
          ) : null}
          {o.labels.length ? (
            <p>Original labels: {o.labels.map((l) => l.name).join(', ')}</p>
          ) : null}
          {o.losses.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          {o.messageId ? (
            <AppButton variant="subtle" disabled={busy} onClick={() => void open(o.messageId!)}>
              Open original message
            </AppButton>
          ) : (
            <p>The retained original locator has no accepted chat-message link.</p>
          )}
        </section>
      ))}
      {offset > 0 ? (
        <AppButton
          variant="subtle"
          disabled={busy}
          onClick={() => void read(Math.max(0, offset - 10))}
        >
          Previous origins
        </AppButton>
      ) : null}
      {value?.nextOffset != null ? (
        <AppButton variant="subtle" disabled={busy} onClick={() => void read(value.nextOffset!)}>
          More origins
        </AppButton>
      ) : null}
      {target && p ? (
        <ImportTranscriptPreview
          key={`${target.conversationId}:${target.target.messageId}:${target.revisionId}`}
          scope={{ projectId: p.projectId, workspaceId: p.workspaceId }}
          batchId=""
          graphId=""
          recordId=""
          files={[]}
          accepted={{ conversationId: target.conversationId, revisionId: target.revisionId }}
          initialTarget={target.target}
          disabled={busy || session.navigating || session.accessTransition}
          onClose={() => setTarget(null)}
          onSource={(sourceId) =>
            void session.research({ kind: 'sources', sourceId, page: 'details' })
          }
        />
      ) : null}
    </details>
  )
}
