import { useEffect, useState } from 'react'
import { AppButton } from '../../../components/ui/Controls'
import { useProofreading } from './ProofreadingProvider'
import { useAiConnections } from '../../ai-connections/AiConnectionsProvider'
import { connectionReason, featureDescription } from '../../ai-connections/connection-copy'
import type { CoverageKind, ProofreadCapture } from '../../../../../shared/proofreading'
import { AiRequestConnection } from '../../ai-connections/AiRequestConnection'
import type { AiReason } from '../../../../../shared/ai'
import styles from './Proofreading.module.css'

const exclusions: Record<CoverageKind, string> = {
  table: 'tables',
  image: 'images',
  quotation: 'quotation blocks',
  citation: 'citation references',
  footnote: 'footnote references',
  'footnote-body': 'footnote bodies',
  break: 'breaks and separators',
  'unsupported-boundary': 'unsupported text or grapheme boundaries'
}
const outcomes: Record<string, string> = {
  'not-sent': 'Saved locally · not sent',
  preparing: 'Preparing review',
  running: 'Review in progress',
  stopping: 'Stop requested',
  completed: 'Review completed',
  cancelled: 'Review cancelled',
  failed: 'Review failed',
  unknown: 'Outcome unknown / interrupted'
}
function proofreadReason(reason: AiReason): string {
  if (reason === 'auth-failed' || reason === 'signed-out' || reason === 'session-expired')
    return 'Codex could not authorize this review. Open connection settings to explicitly resume or reconnect. Running again requires a new captured and reviewed request.'
  if (reason === 'model-unavailable')
    return 'Codex refused the selected model. Refresh models and explicitly select one before reviewing a new request. No model was substituted.'
  if (reason === 'invalid-request')
    return 'Codex could not accept this request or result contract. The retained outcome is unchanged. A new request requires another explicit review; there is no automatic fallback or repair.'
  if (reason === 'cancelled')
    return 'Codex reported cancellation. Any actual partial output remains readable and cannot authorize corrections; restored usage is not guaranteed.'
  if (reason === 'outcome-unknown')
    return 'This review’s outcome is uncertain. Actual retained output stays readable. A missing local execution record or an independent project copy cannot resume the original request. Reopening never resends it; a new reviewed request may consume additional usage.'
  if (reason === 'storage-unavailable')
    return 'Review output needs local protection. Keep Collie open and use Retry local output protection; it saves the same work without sending again.'
  return connectionReason[reason]
}
function CaptureDetails({ capture }: { capture: ProofreadCapture }): React.JSX.Element {
  return (
    <div className={styles['proofreading-capture']}>
      <p>
        <strong>{capture.context[0].label}</strong> ·{' '}
        {capture.source.kind === 'passage' ? 'Selected passage' : 'Current text section'}
      </p>
      <p>
        {capture.targets.length} included text runs ·{' '}
        {capture.coverage.includedCharacters.toLocaleString()} text characters. Formatting
        boundaries separate runs.
      </p>
      {capture.coverage.excluded.length ? (
        <>
          <p>Excluded from review:</p>
          <ul>
            {capture.coverage.excluded.map((item) => (
              <li key={item.kind}>
                {item.count} {exclusions[item.kind]}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No unsupported content in this scope.</p>
      )}
      <p>
        Only the text below is shared. No other manuscript sections, research, project description
        or conversation history is attached.
      </p>
      <details>
        <summary>Included text</summary>
        {capture.targets.map((target, i) => (
          <div className={styles['proofreading-text-run']} key={target.id}>
            <h5>Text run {i + 1}</h5>
            <div className={styles['proofreading-exact-text']}>{target.text}</div>
          </div>
        ))}
      </details>
      <details>
        <summary>Exact instructions and request context</summary>
        <p className={styles['proofreading-exact-text']}>{capture.prompt}</p>
        <pre className={styles['proofreading-exact-text']}>{capture.context[0].text}</pre>
        <p>
          The provider receives these instructions and context with the section label, document
          identity and saved revision. Template: {capture.template}. Text lengths and positions use
          UTF-16 offsets.
        </p>
      </details>
    </div>
  )
}
export function ProofreadingPanel(): React.JSX.Element {
  const p = useProofreading(),
    connections = useAiConnections()
  const [findingId, setFindingId] = useState<string | null>(null),
    [page, setPage] = useState(0)
  useEffect(() => {
    setFindingId(null)
    setPage(0)
  }, [p.selected])
  const b = p.bundle,
    f = b?.findings.find((item) => item.id === findingId),
    active = !!b && ['preparing', 'running', 'stopping'].includes(b.attempt.state)
  return (
    <section
      className={styles['proofreading-panel']}
      aria-label="Proofreading"
      ref={p.panel}
      tabIndex={-1}
    >
      <header className={styles['proofreading-heading']}>
        <h3>Spelling, grammar & punctuation</h3>
        <p>
          A conservative en-US mechanics review. Running a review never changes your writing; you
          decide which corrections to apply.
        </p>
      </header>
      {p.issue ? (
        <p className={styles['proofreading-error']} role="alert">
          {p.issue}
        </p>
      ) : null}
      {p.notice ? <p role="status">{p.notice}</p> : null}
      {p.pending ? (
        <AppButton disabled={p.busy || p.proofreadingLocked} onClick={p.retry}>
          Retry the same local action
        </AppButton>
      ) : null}
      {p.proofreadingLocked ? (
        <div className={styles['proofreading-recovery']} role="status">
          <p>
            A correction needs its acknowledgment reconciled. Editing is paused and the exact local
            operation is retained.
          </p>
          <AppButton disabled={p.busy} onClick={() => void p.retryApply()}>
            Reconcile correction
          </AppButton>
        </div>
      ) : null}
      {p.readOnly ? (
        <p>
          Saved review history remains readable. New reviews and decisions need editing access to
          this project.
        </p>
      ) : null}
      <section className={styles['proofreading-scope']} aria-label="Choose review scope">
        <h4>Choose what to review</h4>
        <div className={styles['proofreading-actions']}>
          <AppButton
            variant="default"
            disabled={p.blocked || p.readOnly}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void p.prepare('passage')}
          >
            Review selected passage
          </AppButton>
          <AppButton
            variant="default"
            disabled={p.blocked || p.readOnly}
            onClick={() => void p.prepare('section')}
          >
            Review current section
          </AppButton>
        </div>
        <p>
          Paragraphs, headings and list text only. Citations, footnotes, images, tables and
          quotation blocks are excluded. A long section needs a smaller selection; it is never split
          automatically.
        </p>
      </section>
      <AiRequestConnection action="proofread" disabled={p.blocked} />
      {p.reviewed ? (
        <section
          className={styles['proofreading-review']}
          aria-label="Review outgoing proofreading request"
        >
          <h4>Review what will be shared</h4>
          <CaptureDetails capture={p.reviewed.capture} />
          {!p.reviewCurrent ? (
            <p role="status">
              This capture needs a fresh review after a connection change or expired approval. Its
              original text is kept.
            </p>
          ) : null}
          {p.capability?.state === 'unavailable' ? <p>{featureDescription(p.capability)}</p> : null}
          <p>
            Provider: Codex. Account:{' '}
            {connections.status?.connections.find((a) => a.id === p.reviewed?.connectionId)
              ?.label ?? 'None'}
            . Model: {p.reviewed.model ?? 'Not selected'}.
          </p>
          <div className={styles['proofreading-actions']}>
            <AppButton
              disabled={p.blocked || p.readOnly || !p.reviewCurrent}
              onClick={() => void p.submit(false)}
            >
              Save review locally
            </AppButton>
            <AppButton
              variant="default"
              disabled={p.blocked || !p.canSend || active}
              onClick={() => void p.submit(true)}
            >
              Run reviewed request
            </AppButton>
            <AppButton
              variant="default"
              disabled={p.blocked || p.readOnly}
              onClick={() => void p.reviewAgain()}
            >
              Review this capture again
            </AppButton>
            <AppButton variant="subtle" disabled={p.blocked} onClick={p.clear}>
              Clear capture
            </AppButton>
          </div>
          <p>
            Saving locally does not send or queue a review. A saved unsent review will never run
            automatically.
          </p>
        </section>
      ) : null}
      <details className={styles['proofreading-history']} open={!b}>
        <summary>Saved reviews ({p.total})</summary>
        <ul className={styles['proofreading-list']}>
          {p.items.map((item) => (
            <li key={item.id}>
              <AppButton
                className={styles['proofreading-list-item']}
                variant={p.selected === item.id ? 'default' : 'subtle'}
                disabled={p.blocked}
                aria-current={p.selected === item.id ? 'true' : undefined}
                onClick={() => p.choose(item.id)}
              >
                {item.label} · {new Date(item.createdAt).toLocaleString()}
              </AppButton>
              <span>
                {outcomes[item.state]}
                {item.validation === 'valid' ? ` · ${item.findings} findings` : ''}
              </span>
            </li>
          ))}
        </ul>
        {!p.items.length ? (
          <p>No saved reviews on this page. Choose a small writing scope to begin.</p>
        ) : null}
        <div className={styles['proofreading-actions']}>
          <AppButton
            variant="subtle"
            disabled={p.blocked || p.offset === 0}
            onClick={() => p.setOffset(Math.max(0, p.offset - 20))}
          >
            Previous reviews
          </AppButton>
          <AppButton
            variant="subtle"
            disabled={p.blocked || p.offset + 20 >= p.total}
            onClick={() => p.setOffset(p.offset + 20)}
          >
            More reviews
          </AppButton>
        </div>
      </details>
      {b ? (
        <section className={styles['proofreading-results']} aria-label="Saved review results">
          <h4>{b.capture.context[0].label}</h4>
          <p className={styles['proofreading-outcome']}>{outcomes[b.attempt.state]}</p>
          <p>
            {new Date(b.attempt.createdAt).toLocaleString()} ·{' '}
            {b.attempt.provider ?? 'Provider not established'} ·{' '}
            {b.attempt.model ?? 'Model not established'}
          </p>
          {b.attempt.reason ? <p>{proofreadReason(b.attempt.reason)}</p> : null}
          {active ? (
            <AppButton
              variant="default"
              disabled={p.blocked || b.attempt.state === 'stopping'}
              onClick={p.stop}
            >
              Stop review
            </AppButton>
          ) : null}
          {b.attempt.state === 'stopping' ? (
            <p>A stop request is not yet a confirmed cancellation or restored usage.</p>
          ) : null}
          {b.attempt.validation === 'invalid' ? (
            <p role="status">
              The returned text did not match the supported result format or exact targets. No
              applicable findings were created.
            </p>
          ) : null}
          {b.attempt.validation === 'not-completed' ? (
            <p>
              Incomplete output cannot authorize corrections. You can choose the current scope again
              for a separate, explicitly reviewed request.
            </p>
          ) : null}
          {b.attempt.validation === 'valid' && !b.findings.length ? (
            <p>
              No corrections were suggested for the included runs. This is not a guarantee that the
              writing is error-free.
            </p>
          ) : null}
          {b.findings.length ? (
            <>
              <p>
                {b.findings.length} findings · target {p.validity}. Accepting one makes the other
                findings from that document revision stale.
              </p>
              <ul className={styles['proofreading-list']}>
                {b.findings.slice(page * 10, page * 10 + 10).map((item) => (
                  <li key={item.id}>
                    <AppButton
                      className={styles['proofreading-list-item']}
                      variant={f?.id === item.id ? 'default' : 'subtle'}
                      aria-pressed={f?.id === item.id}
                      onClick={() => setFindingId(item.id)}
                    >
                      {item.kind} ·{' '}
                      {item.decision === 'pending' && p.validity !== 'current'
                        ? 'stale'
                        : item.decision}{' '}
                      — {item.before.slice(0, 90)}
                      {item.before.length > 90 ? '…' : ''}
                    </AppButton>
                  </li>
                ))}
              </ul>
              <div className={styles['proofreading-actions']}>
                <AppButton variant="subtle" disabled={!page} onClick={() => setPage(page - 1)}>
                  Previous findings
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={(page + 1) * 10 >= b.findings.length}
                  onClick={() => setPage(page + 1)}
                >
                  More findings
                </AppButton>
              </div>
            </>
          ) : null}
          {f ? (
            <article className={styles['proofreading-finding']} aria-label="Selected finding">
              <h5>
                {f.kind} · {f.decision}
              </h5>
              <p>Captured original</p>
              <div className={styles['proofreading-original']}>{f.before}</div>
              <p>Suggested replacement</p>
              <div className={styles['proofreading-replacement']}>
                {f.replacement || '(Remove this text)'}
              </div>
              <p>{f.reason}</p>
              <div className={styles['proofreading-actions']}>
                <AppButton
                  variant="subtle"
                  disabled={p.blocked || p.validity !== 'current'}
                  onClick={() => void p.original(f)}
                >
                  Show original passage
                </AppButton>
                {f.decision === 'pending' ? (
                  <>
                    <AppButton
                      disabled={
                        p.blocked || p.readOnly || p.validity !== 'current' || !p.targetSectionOpen
                      }
                      onClick={() => void p.decide(f, 'apply')}
                    >
                      Apply this correction
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={p.blocked || p.readOnly}
                      onClick={() => void p.decide(f, 'ignore')}
                    >
                      Ignore this finding
                    </AppButton>
                  </>
                ) : f.decision === 'ignored' ? (
                  <AppButton
                    variant="default"
                    disabled={p.blocked || p.readOnly}
                    onClick={() => void p.decide(f, 'undo-ignore')}
                  >
                    Undo ignore
                  </AppButton>
                ) : null}
              </div>
              {f.checkpointId ? (
                <>
                  <AppButton
                    variant="default"
                    disabled={p.blocked}
                    onClick={() => void p.history(f)}
                  >
                    Compare pre-correction history
                  </AppButton>
                  <p>
                    Editor Undo can reverse the recent edit. History retains the full pre-correction
                    manuscript; restoring it is a separate reviewed action that also preserves later
                    work.
                  </p>
                </>
              ) : null}
              {!p.targetSectionOpen && p.validity === 'current' ? (
                <p>Open the original passage before applying this correction.</p>
              ) : null}
              {p.validity !== 'current' ? (
                <p>
                  This captured document revision is no longer current. Its quotes and decisions
                  remain readable; Apply and exact-passage navigation are unavailable.
                </p>
              ) : null}
            </article>
          ) : null}
          <details>
            <summary>Saved context and coverage</summary>
            <CaptureDetails capture={b.capture} />
          </details>
          {b.attempt.output ? (
            <details>
              <summary>Actual provider output</summary>
              <pre className={styles['proofreading-exact-text']}>{b.attempt.output}</pre>
            </details>
          ) : null}
          {b.attempt.provider ? (
            <AppButton variant="subtle" disabled={p.blocked} onClick={p.protect}>
              Retry local output protection
            </AppButton>
          ) : null}
        </section>
      ) : null}
      <AppButton variant="subtle" disabled={p.blocked} onClick={p.recover}>
        Retry local recovery
      </AppButton>
      <p className={styles['proofreading-caption']}>
        Reviewed requests use your own supported account and its spending settings. Conversations
        and proofreading share 64 active slots. Saved outcomes release capacity through local
        handoff; retained history remains available.
      </p>
    </section>
  )
}
export function ProofreadingNotice(): React.JSX.Element | null {
  const p = useProofreading()
  if (
    !p.scope ||
    (!p.reviewed && !p.pending && !p.event?.pending && !p.event?.issue && !p.proofreadingLocked)
  )
    return null
  return (
    <aside className={styles['proofreading-notice']} aria-label="Proofreading work">
      <span>
        {p.proofreadingLocked
          ? 'A proofreading correction needs reconciliation.'
          : (p.event?.issue ??
            (p.pending
              ? 'A proofreading action needs acknowledgment.'
              : p.event?.pending
                ? 'Protecting proofreading work…'
                : 'A proofreading capture is awaiting your decision.'))}
      </span>
      <AppButton variant="subtle" onClick={() => p.show()}>
        Return to proofreading
      </AppButton>
    </aside>
  )
}
