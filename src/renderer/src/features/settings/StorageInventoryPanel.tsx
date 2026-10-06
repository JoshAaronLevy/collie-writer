import WorkingCopyPanel from './WorkingCopyPanel'
import RetentionReviewPanel from './RetentionReviewPanel'
import SearchCachePanel from './SearchCachePanel'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import {
  INVENTORY_PAGE_SIZE,
  STORAGE_CATEGORIES,
  type InventoryCount,
  type InventoryReport,
  type InventoryCommand
} from '../../../../shared/storage-inventory'
import styles from './StorageInventoryPanel.module.css'
import { useStorageNotices } from './storageNoticeContext'
import StorageAdvicePanel from './StorageAdvicePanel'
import { storageBytes } from '../../../../shared/storage-space'
import { useWorkspaceSession } from '../workspace/workspaceContext'

const regions = {
  working: 'Local working data',
  application: 'Shared application storage',
  external: 'Known external files'
}
function size(count: InventoryCount, partial: boolean): string {
  if (!count.files && count.unknown) return 'Unknown'
  if (!count.files && partial) return 'Not yet fully measured'
  const bytes = count.bytes
  const label =
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(2)} GiB`
      : bytes >= 1024 ** 2
        ? `${(bytes / 1024 ** 2).toFixed(1)} MiB`
        : bytes >= 1024
          ? `${(bytes / 1024).toFixed(1)} KiB`
          : `${bytes} B`
  return `${label}${partial || count.unknown ? ' measured · incomplete' : ''}`
}
export default function StorageInventoryPanel({
  active,
  disabled
}: {
  active: boolean
  disabled: boolean
}): React.JSX.Element {
  const { publish, review } = useStorageNotices()
  const { composition, refreshData } = useWorkspaceSession()
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [recoveryRefreshRequested, setRecoveryRefreshRequested] = useState(false)
  const [refreshRequested, setRefreshRequested] = useState(false)
  const [offset, setOffset] = useState(0)
  const generation = useRef(0)
  const scanId = useRef<string | null>(null)
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
        setOffset(result.value.offset)
      } else {
        setError(result.error.message)
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
        setOffset(result.value.offset)
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
      if (element instanceof HTMLDetailsElement) element.open = true
      const category =
        review.condition.kind === 'cache'
          ? element.querySelector<HTMLElement>('[data-storage-category="search"]')
          : null
      const focusTarget = category ?? element
      focusTarget.focus({ preventScroll: true })
      focusTarget.scrollIntoView({ block: 'nearest' })
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
  const stateLabels = {
    running: 'Measuring storage…',
    complete: 'Metadata scan finished',
    cancelled: 'Cancelled · partial measurements retained',
    limited: 'Scan limit reached · partial measurements retained',
    failed: 'Scan interrupted · partial measurements retained'
  }
  return (
    <section
      className={styles['storage-inventory-panel']}
      aria-labelledby="storage-inventory-heading"
    >
      <h2 id="storage-inventory-heading">Storage inventory</h2>
      <p>
        Measure project files, search data and retained copies without opening or changing projects.
        Sizes are file lengths, not allocated disk space. This is a read-only report; categories do
        not make data eligible for deletion. Use the separate search cache review below to clear
        verified files.
      </p>
      <div className={styles['storage-inventory-actions']}>
        <AppButton
          variant="default"
          disabled={disabled || busy}
          onClick={() => void request({ kind: 'start', id: crypto.randomUUID() })}
        >
          {report ? 'Refresh storage inventory' : 'Measure storage'}
        </AppButton>
        {report?.state === 'running' || busy || uncertain ? (
          <AppButton
            variant="subtle"
            disabled={disabled}
            onClick={() => {
              if (scanId.current) void request({ kind: 'cancel', id: scanId.current })
            }}
          >
            Cancel inventory
          </AppButton>
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <SearchCachePanel
        active={active}
        disabled={disabled}
        refresh={() => setRefreshRequested(true)}
      />
      <RetentionReviewPanel
        kind="previous"
        active={active}
        disabled={disabled}
        refresh={() => {
          setRefreshRequested(true)
          setRecoveryRefreshRequested(true)
        }}
      />
      <RetentionReviewPanel
        kind="local"
        active={active}
        disabled={disabled}
        refresh={() => {
          setRefreshRequested(true)
          setRecoveryRefreshRequested(true)
        }}
      />
      <WorkingCopyPanel
        active={active}
        disabled={disabled}
        refresh={() => {
          setRefreshRequested(true)
          setRecoveryRefreshRequested(true)
        }}
      />
      <StorageAdvicePanel disabled={disabled || busy || report?.state === 'running'} />
      {report ? (
        <>
          <p role="status">
            {uncertain
              ? 'Inventory status unavailable · retained measurements may be incomplete'
              : stateLabels[report.state]}
          </p>
          <p>
            Started {new Date(report.startedAt).toLocaleString()} · measured through{' '}
            {new Date(report.asOf).toLocaleString()}. Files may change during the scan; this is not
            a synchronized snapshot. Titles use the last available local discovery record.
          </p>
          <dl className={styles['storage-inventory-totals']}>
            {(['working', 'application', 'external'] as const).map((region) => (
              <div key={region}>
                <dt>{regions[region]}</dt>
                <dd>{size(report.totals[region], partial)}</dd>
                <dd>
                  {report.totals[region].files} measured files · {report.totals[region].unknown}{' '}
                  unknown entries
                </dd>
              </div>
            ))}
          </dl>
          <p>
            The working total includes shared AI storage and local recovery. Application storage is
            outside that working total; known external files are additional. Duplicate file
            identities are counted once ({report.duplicates} repeated references skipped). Unknown
            entries and incomplete scans are not zero-byte estimates.
          </p>
          <p>
            Writing, research, citations, saved conversations and history share the project
            database. These are physical file totals, including database sidecars; separate logical
            content sizes have not been estimated. Managed originals and images share their asset
            category. Volume labels identify distinct filesystem devices within this scan. AI
            operation files use already validated ownership in memory where available; other
            encrypted records remain shared/unattributed. Measuring storage does not decrypt
            history.
          </p>
          <p id="storage-cache-breakdown" tabIndex={-1}>
            Overall measured search cache:{' '}
            {report.conditions.find((c) => c.key === 'cache:app')?.bytes === undefined
              ? 'not in this bounded summary'
              : storageBytes(report.conditions.find((c) => c.key === 'cache:app')!.bytes!)}
            {partial ? ' · incomplete' : ''}. Search categories below identify its project locations
            and volumes. Unknown files remain outside the cache classification.
          </p>
          <section aria-labelledby="storage-volumes-heading">
            <h3 id="storage-volumes-heading">Available volume space</h3>
            <p>
              Capacity is a separate filesystem estimate taken during this scan, not file-size
              arithmetic or reserved space. It can change immediately. Unknown capacity is never
              enough-space confirmation; external cloud files were not opened or hydrated.
            </p>
            {report.volumes.length ? (
              report.volumes.map((v) => (
                <div
                  key={v.key}
                  id={`storage-volume-${v.label.replace(' ', '-')}`}
                  tabIndex={-1}
                  className={styles['storage-advice-notice']}
                >
                  <h4>{v.label}</h4>
                  <p className={styles['storage-inventory-path']}>{v.path}</p>
                  <p>
                    {v.available === null || v.total === null
                      ? 'Available and total capacity: unknown'
                      : `${storageBytes(v.available)} available of ${storageBytes(v.total)}`}
                    . Measured {new Date(v.asOf).toLocaleString()}.
                  </p>
                  <p>
                    Categories on this volume retain their own locations below. A Save or Backup to
                    another volume still needs space in local working data.
                  </p>
                </div>
              ))
            ) : (
              <p>Volume capacity has not been measured.</p>
            )}
          </section>
          <div className={styles['storage-inventory-groups']}>
            {report.groups.map((group) => (
              <details
                key={group.id}
                id={`storage-group-${group.id}`}
                tabIndex={-1}
                className={styles['storage-inventory-group']}
              >
                <summary>
                  {group.title} · {regions[group.region]} ·{' '}
                  {size(
                    group.categories.reduce(
                      (sum, c) => ({
                        bytes: sum.bytes + c.bytes,
                        files: sum.files + c.files,
                        unknown: sum.unknown + c.unknown
                      }),
                      { bytes: 0, files: 0, unknown: 0 }
                    ),
                    partial || report.totals[group.region].unknown > 0
                  )}
                </summary>
                <p className={styles['storage-inventory-path']}>{group.path}</p>
                {group.note === 'shared-ai' ? (
                  <p>
                    Encrypted records are not decrypted for this report. Project ownership is
                    unavailable from filename metadata, so these bytes remain shared/unattributed.
                  </p>
                ) : group.note === 'known-ai' ? (
                  <p>
                    Ownership comes from already validated AI operation metadata in memory, captured
                    at scan start. Files are measured without decrypting them again; their current
                    contents remain unverified. Other encrypted records stay shared/unattributed.
                  </p>
                ) : group.note === 'recorded-location' ? (
                  <p>
                    This is a recorded location. Only file metadata was inspected; current archive
                    content, ownership and cloud upload/download status are unverified.
                  </p>
                ) : group.note === 'metadata-unavailable' ? (
                  <p>
                    Some project discovery, active-database or destination metadata is unavailable.
                    The folder remains retained; classifications may be incomplete.
                  </p>
                ) : null}
                <div className={styles['storage-inventory-table-container']}>
                  <table>
                    <caption>Measured storage categories</caption>
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col">Volume</th>
                        <th scope="col">Location</th>
                        <th scope="col">File size</th>
                        <th scope="col">Files / unknown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.categories.map((c) => (
                        <tr
                          key={`${c.kind}:${c.volume}:${c.path}`}
                          data-storage-category={c.kind}
                          tabIndex={-1}
                        >
                          <th scope="row">{STORAGE_CATEGORIES[c.kind]}</th>
                          <td>{c.volume ?? 'Unknown'}</td>
                          <td className={styles['storage-inventory-path']}>{c.path}</td>
                          <td>{size(c, partial || report.totals[group.region].unknown > 0)}</td>
                          <td>
                            {c.files} / {c.unknown}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!group.categories.length ? (
                  <p>No files measured in this working copy yet.</p>
                ) : null}
              </details>
            ))}
          </div>
          <div className={styles['storage-inventory-actions']}>
            <AppButton
              variant="subtle"
              disabled={busy || offset === 0 || disabled}
              onClick={() =>
                void request({ kind: 'page', id: report.id, offset: offset - INVENTORY_PAGE_SIZE })
              }
            >
              Previous page
            </AppButton>
            <p>
              {report.totalGroups
                ? `${offset + 1}–${Math.min(offset + INVENTORY_PAGE_SIZE, report.totalGroups)} of ${report.totalGroups} storage groups`
                : 'No storage groups measured yet'}
            </p>
            <AppButton
              variant="subtle"
              disabled={busy || disabled || offset + INVENTORY_PAGE_SIZE >= report.totalGroups}
              onClick={() =>
                void request({ kind: 'page', id: report.id, offset: offset + INVENTORY_PAGE_SIZE })
              }
            >
              Next page
            </AppButton>
          </div>
        </>
      ) : (
        <p>Choose Measure storage to start. Leaving Data and recovery cancels the scan.</p>
      )}
    </section>
  )
}
