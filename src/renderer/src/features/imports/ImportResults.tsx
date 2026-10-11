import { CHATGPT_USAGE_URL } from '../../../../shared/import-recovery'
import { useEffect, useId, useRef, useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import type { ImportSummary } from '../../../../shared/import-review'
import type { ImportCategory } from '../../../../shared/project-import'
import styles from './ImportProvider.module.css'

/** Only the exact prepared totals and conversation titles/counts belong in results. */
export function ImportResults({
  summary,
  conversations,
  categories,
  retainedAttempts,
  issue,
  busy,
  status,
  blocked,
  needsRecovery,
  analysisIncomplete,
  onCancel,
  onAccept,
  onCheck
}: {
  summary: ImportSummary
  conversations: ImportSummary['conversations']
  retainedAttempts: number | null
  categories: ImportCategory[]
  issue: string
  busy: boolean
  status: string
  blocked: boolean
  needsRecovery: boolean
  analysisIncomplete: boolean
  onCancel: () => void
  onAccept: () => void
  onCheck: () => void
}): React.JSX.Element {
  const [visible, setVisible] = useState(50)
  const futureDescription = useId()
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const region = body.current
    if (!region || visible >= conversations.length) return
    const resize = new ResizeObserver(() => {
      if (
        region.isConnected &&
        region.clientHeight > 0 &&
        region.scrollHeight <= region.clientHeight + 1
      )
        setVisible((n) => Math.min(n + 50, conversations.length))
    })
    resize.observe(region)
    return () => resize.disconnect()
  }, [visible, conversations.length])
  const counts = summary.manifest.counts
  const semantic = summary.manifest.version === 5,
    mapped = summary.manifest.version === 4,
    local = summary.manifest.version >= 3
  const label = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`
  return (
    <div className={styles.intake}>
      <div
        ref={body}
        className={styles.body}
        tabIndex={0}
        role="region"
        aria-label="Import summary"
        data-import-focus
        onScroll={(event) => {
          const body = event.currentTarget
          if (body.scrollHeight - body.scrollTop - body.clientHeight < 120)
            setVisible((n) => Math.min(n + 50, conversations.length))
        }}
      >
        {local && retainedAttempts === 0 ? (
          <p className={styles.helper}>Processed locally; no ChatGPT requests.</p>
        ) : retainedAttempts !== null && retainedAttempts > 0 ? (
          <p className={styles.helper}>
            {label(retainedAttempts, 'saved ChatGPT attempt')}. Original content preserved.
          </p>
        ) : semantic || mapped ? (
          <p className={styles.helper}>
            Original content preserved; unresolved content is left out.
          </p>
        ) : null}
        {categories.includes('chats') ? (
          <section aria-label="AI conversations" className={styles.resultGroup}>
            <h2>{label(counts.chats, 'conversation')}</h2>
            {conversations.length ? (
              <ul className={styles.conversations}>
                {conversations.slice(0, visible).map((conversation) => (
                  <li key={conversation.id}>
                    <span>{conversation.title}</span>
                    <span className={styles.messageCount}>
                      {label(conversation.messages, 'message')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {categories.includes('sources') ? (
          <p className={styles.resultTotal}>
            {label(counts.sources, 'source')}
            {counts.reusedSources ? (
              <span className={styles.reused}> · {counts.reusedSources} already in Research</span>
            ) : null}
          </p>
        ) : null}
        {categories.includes('notes') ? (
          <p className={styles.resultTotal}>{label(counts.notes, 'note')}</p>
        ) : null}
        {summary.outcome === 'already-present' ? (
          <p>This content is already in your project. Nothing new to import.</p>
        ) : summary.outcome === 'empty' ? (
          <p>
            {local && summary.manifest.partial
              ? 'Some requested work remains unresolved, so no usable findings are ready. Your originals and saved responses are kept; the reason appears below.'
              : analysisIncomplete
                ? 'Analysis could not produce usable findings. This does not mean your files contain no conversations or sources.'
                : 'No importable content was found for your selection.'}
          </p>
        ) : summary.manifest.partial || summary.omitted || analysisIncomplete ? (
          <p className={styles.helper}>
            {local
              ? 'Some requested content was left out. Accept imports these findings and finishes this selection; omitted material then needs a new import. To continue unfinished analysis later, Cancel and keep this selection paused.'
              : 'Some requested content could not be imported and was left out.'}
          </p>
        ) : null}
        {busy ? <p>{status}</p> : null}
        {issue ? (
          <p role="alert" className={styles.issue}>
            {issue}
          </p>
        ) : null}
        {issue && /usage limit|limited requests/.test(issue) ? (
          <AppButton
            variant="subtle"
            size="sm"
            onClick={() =>
              void window.collie.conversationPresentation('open-link', CHATGPT_USAGE_URL)
            }
          >
            Manage usage
          </AppButton>
        ) : null}
        {blocked ? (
          <p className={styles.helper}>Open a writable project to accept these findings.</p>
        ) : null}
        {needsRecovery && !busy ? (
          <AppButton variant="light" size="sm" onClick={onCheck}>
            Check status
          </AppButton>
        ) : null}
      </div>
      <footer className={styles.footer}>
        <div className={styles.footerActions}>
          <AppButton variant="default" disabled={busy} onClick={onCancel}>
            Cancel
          </AppButton>
          <div className={styles.futureAction}>
            <AppButton variant="default" disabled aria-describedby={futureDescription}>
              Re-Analyze
            </AppButton>
            <small id={futureDescription}>Coming later</small>
          </div>
          <AppButton
            disabled={blocked || needsRecovery || summary.outcome !== 'ready'}
            pending={busy}
            onClick={onAccept}
          >
            {busy ? status : 'Accept'}
          </AppButton>
        </div>
      </footer>
    </div>
  )
}
