import { useState, useRef, useEffect } from 'react'
import type { OpenInput } from '../../../../shared/projects'
import type { ImportedLinks } from '../../../../shared/imported-links'
import { AppButton } from '../../components/ui/Controls'
export function ImportedMessageLinks({
  scope,
  messageId,
  onSource
}: {
  scope: OpenInput
  messageId: string
  onSource: (id: string) => void
}): React.JSX.Element {
  const [value, setValue] = useState<ImportedLinks | null>(null),
    [issue, setIssue] = useState(''),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  async function read(next: number): Promise<void> {
    if (busy) return
    const g = ++generation.current
    setBusy(true)
    setIssue('')
    try {
      const r = await window.collie.conversation({
        ...scope,
        action: 'imported-links',
        messageId,
        offset: next
      })
      if (g !== generation.current) return
      if (r.ok && r.value.type === 'imported-links') {
        setValue(r.value)
        setOffset(next)
      } else setIssue('Linked Research could not be read.')
    } catch {
      if (g === generation.current) setIssue('Linked Research could not be read.')
    } finally {
      if (g === generation.current) setBusy(false)
    }
  }
  return (
    <div>
      <AppButton variant="subtle" disabled={busy} onClick={() => void read(0)}>
        Linked Research
      </AppButton>
      {issue ? <p role="status">{issue}</p> : null}
      {value ? (
        <>
          <p>
            {value.sources.length
              ? 'Accepted sources linked to this original message.'
              : 'No accepted source links for this message.'}
          </p>
          {value.sources.map((s) => (
            <AppButton key={s.id} variant="subtle" onClick={() => onSource(s.id)}>
              {s.title}
              {s.state === 'trashed' ? ' (removed)' : ''}
            </AppButton>
          ))}
          {offset > 0 ? (
            <AppButton
              variant="subtle"
              disabled={busy}
              onClick={() => void read(Math.max(0, offset - 20))}
            >
              Previous sources
            </AppButton>
          ) : null}
          {value.more ? (
            <AppButton variant="subtle" disabled={busy} onClick={() => void read(offset + 20)}>
              More sources
            </AppButton>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
