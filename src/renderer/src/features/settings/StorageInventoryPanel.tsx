import RetentionReviewPanel from './RetentionReviewPanel'
import SearchCachePanel from './SearchCachePanel'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import {
  INVENTORY_PAGE_SIZE,
  type InventoryCount,
  type InventoryReport,
  type InventoryCommand
} from '../../../../shared/storage-inventory'
import styles from './StorageInventoryPanel.module.css'
import { useStorageNotices } from './storageNoticeContext'
import StorageAdvicePanel from './StorageAdvicePanel'
import { storageBytes } from '../../../../shared/storage-space'
import { useWorkspaceSession } from '../workspace/workspaceContext'

function size(count: InventoryCount, partial: boolean): string {
  if (!count.files && (count.unknown || partial)) return 'Unknown'
  return `${storageBytes(count.bytes)}${partial || count.unknown ? ' measured · incomplete' : ''}`
}
export default function StorageInventoryPanel({
  active,
  disabled
}: {
  active: boolean
  disabled: boolean
}): React.JSX.Element {
  const { publish, review, report: retainedReport } = useStorageNotices()
  const {
    composition,
    refreshData,
    busy: workspaceBusy,
    acting,
    fileActive
  } = useWorkspaceSession()
  const maintenanceDisabled = disabled || workspaceBusy || acting || fileActive
  const [report, setReport] = useState<InventoryReport | null>(retainedReport)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [recoveryRefreshRequested, setRecoveryRefreshRequested] = useState(false)
  const [refreshRequested, setRefreshRequested] = useState(false)
  const offset = report?.offset ?? 0
  const generation = useRef(0)
  const scanId = useRef<string | null>(retainedReport?.id ?? null)
  async function request(command: InventoryCommand): Promise<void> {
    const token = ++generation.current
    if (command.kind === 'start') scanId.current = command.id
    setBusy(true)
    setError('')
    setUncertain(false)
    try {
      const result = await window.collie.storageInventory(command)
      if (generation.current !== token) {
        if (command.kind === 'start')
          void window.collie.storageInventory({ kind: 'cancel', id: command.id })
        return
      }
      if (result.ok) {
        publish(result.value)
        setReport(result.value)
      } else {
        setError(result.error.message)
        setUncertain(true)
      }
    } catch {
      if (generation.current === token) {
        setError('Storage measurements are unavailable. Refresh to try again.')
        setUncertain(true)
      }
    } finally {
      if (generation.current === token) setBusy(false)
    }
  }
  const refreshRecovery = useEffectEvent(() => {
    setRecoveryRefreshRequested(false)
    void refreshData()
  })
  useEffect(() => {
    if (!active || disabled || !recoveryRefreshRequested) return
    const frame = requestAnimationFrame(() => refreshRecovery())
    return () => cancelAnimationFrame(frame)
  }, [active, disabled, recoveryRefreshRequested])
  const refreshAfterClearing = useEffectEvent(() => {
    setRefreshRequested(false)
    void request({ kind: 'start', id: crypto.randomUUID() })
  })
  useEffect(() => {
    if (!active || disabled || scanId.current) return
    const frame = requestAnimationFrame(() => refreshAfterClearing())
    return () => cancelAnimationFrame(frame)
  }, [active, disabled])
  useEffect(() => {
    if (!active || disabled || !refreshRequested) return
    const frame = requestAnimationFrame(() => refreshAfterClearing())
    return () => cancelAnimationFrame(frame)
  }, [active, disabled, refreshRequested])
  useEffect(() => {
    if (active || !scanId.current) return
    const token = ++generation.current,
      id = scanId.current
    void window.collie.storageInventory({ kind: 'cancel', id }).then((result) => {
      if (token !== generation.current) return
      setBusy(false)
      if (result.ok) {
        publish(result.value)
        setReport(result.value)
        setUncertain(false)
      } else {
        setError('The last inventory could not be refreshed. Its measurements may be incomplete.')
        setUncertain(true)
      }
    })
  }, [active, publish])
  useEffect(() => {
    if (!active || report?.state !== 'running') return
    const token = generation.current,
      id = report.id
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async (): Promise<void> => {
      const result = await window.collie.storageInventory({ kind: 'page', id, offset })
      if (disposed || token !== generation.current) return
      if (result.ok) {
        publish(result.value)
        setReport(result.value)
        if (result.value.state === 'running') timer = setTimeout(() => void poll(), 500)
      } else {
        setError(
          'Storage reporting is unavailable. Retained measurements may be incomplete; refresh to retry.'
        )
        setUncertain(true)
      }
    }
    timer = setTimeout(() => void poll(), 500)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [active, report?.id, report?.state, offset, publish])
  useEffect(
    () => () => {
      generation.current++
      if (scanId.current)
        void window.collie.storageInventory({ kind: 'cancel', id: scanId.current })
    },
    []
  )
  const partial = report?.state !== 'complete' || uncertain || busy
  const reviewed = useRef<string | null>(null)
  const requestReviewPage = useEffectEvent((page: number) => {
    if (report) void request({ kind: 'page', id: report.id, offset: page })
  })
  useEffect(() => {
    if (
      !active ||
      disabled ||
      busy ||
      !review ||
      !report ||
      report.state === 'running' ||
      review.scanId !== report.id ||
      reviewed.current === review.id
    )
      return
    if (report.offset !== review.condition.offset) {
      // Wait for the visible Data region to commit before following the requested page.
      const frame = requestAnimationFrame(() => requestReviewPage(review.condition.offset))
      return () => cancelAnimationFrame(frame)
    }
    const target = review.condition.groupId
      ? `storage-group-${review.condition.groupId}`
      : review.condition.volume
        ? `storage-volume-${review.condition.volume.replace(' ', '-')}`
        : 'storage-cache-breakdown'
    const element = document.getElementById(target)
    if (!element) return
    const focus = (): boolean => {
      if (reviewed.current === review.id) return true
      if (
        document.visibilityState !== 'visible' ||
        composition.current ||
        element.closest('[inert], [hidden]') ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return false
      reviewed.current = review.id
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'nearest' })
      return true
    }
    if (focus()) return
    const observer = new MutationObserver(() => {
      if (focus()) observer.disconnect()
    })
    const retryFocus = (): void => {
      if (focus()) observer.disconnect()
    }
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['inert', 'hidden']
    })
    document.addEventListener('visibilitychange', retryFocus)
    document.addEventListener('compositionend', retryFocus)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', retryFocus)
      document.removeEventListener('compositionend', retryFocus)
    }
  }, [active, disabled, busy, review, report, composition])
  const refreshMaintenance = (): void => {
    setRefreshRequested(true)
    setRecoveryRefreshRequested(true)
  }
  return (
    <section
      className={styles['storage-inventory-panel']}
      aria-labelledby="storage-inventory-heading"
    >
      <h2 id="storage-inventory-heading">Space on this computer</h2>
      {error ? <p role="alert">{error}</p> : null}
      <dl className={styles['storage-inventory-totals']}>
        <div>
          <dt>Local project data</dt>
          <dd>{report ? size(report.totals.working, partial) : 'Not measured yet'}</dd>
        </div>
        <div>
          <dt>Application data</dt>
          <dd>{report ? size(report.totals.application, partial) : 'Not measured yet'}</dd>
        </div>
        {report?.volumes.map((v) => (
          <div key={v.key} id={`storage-volume-${v.label.replace(' ', '-')}`} tabIndex={-1}>
            <dt>Free disk space · {v.label}</dt>
            <dd>{v.available === null ? 'Unknown' : storageBytes(v.available)}</dd>
            <dd className={styles['storage-inventory-path']}>{v.path}</dd>
          </div>
        ))}
      </dl>
      {!report?.volumes.length ? <p>Free disk space: unknown.</p> : null}
      <p role="status">
        {report?.state === 'running'
          ? 'Measuring storage…'
          : report
            ? `Measured ${new Date(report.asOf).toLocaleString()}.${partial ? ' Measurements are incomplete.' : ''}`
            : 'Preparing measurements…'}
      </p>
      <p>
        Sizes are measured file lengths; free disk space can change. Unknown space is not a
        guarantee that Save will fit.
      </p>
      <div className={styles['storage-inventory-actions']}>
        <AppButton
          variant="subtle"
          disabled={disabled || busy}
          onClick={() => void request({ kind: 'start', id: crypto.randomUUID() })}
        >
          Refresh space information
        </AppButton>
        {report?.state === 'running' ? (
          <AppButton
            variant="subtle"
            disabled={disabled}
            onClick={() => scanId.current && void request({ kind: 'cancel', id: scanId.current })}
          >
            Stop measuring
          </AppButton>
        ) : null}
      </div>
      <StorageAdvicePanel disabled={disabled || busy || report?.state === 'running'} />
      {report && report.groups.some((g) => g.scope && g.region === 'working') ? (
        <>
          <h3>Local project sizes</h3>
          {report.groups
            .filter((g) => g.scope && g.region === 'working')
            .map((group) => (
              <div
                key={group.id}
                id={`storage-group-${group.id}`}
                tabIndex={-1}
                className={styles['storage-inventory-group']}
              >
                <strong>{group.title}</strong>
                <span>
                  {size(
                    group.categories.reduce(
                      (n, c) => ({
                        bytes: n.bytes + c.bytes,
                        files: n.files + c.files,
                        unknown: n.unknown + c.unknown
                      }),
                      { bytes: 0, files: 0, unknown: 0 }
                    ),
                    partial
                  )}
                </span>
              </div>
            ))}
        </>
      ) : null}
      {report && report.totalGroups > INVENTORY_PAGE_SIZE ? (
        <div className={styles['storage-inventory-actions']}>
          <AppButton
            variant="subtle"
            disabled={busy || disabled || offset === 0}
            onClick={() =>
              void request({ kind: 'page', id: report.id, offset: offset - INVENTORY_PAGE_SIZE })
            }
          >
            Previous projects
          </AppButton>
          <AppButton
            variant="subtle"
            disabled={busy || disabled || offset + INVENTORY_PAGE_SIZE >= report.totalGroups}
            onClick={() =>
              void request({ kind: 'page', id: report.id, offset: offset + INVENTORY_PAGE_SIZE })
            }
          >
            More projects
          </AppButton>
        </div>
      ) : null}
      <SearchCachePanel
        active={active}
        disabled={maintenanceDisabled}
        refresh={() => setRefreshRequested(true)}
      />
      <RetentionReviewPanel
        kind="previous"
        active={active}
        disabled={maintenanceDisabled}
        refresh={refreshMaintenance}
      />
      <RetentionReviewPanel
        kind="local"
        active={active}
        disabled={maintenanceDisabled}
        refresh={refreshMaintenance}
      />
    </section>
  )
}
