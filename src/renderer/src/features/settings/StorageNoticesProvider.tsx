import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { isStorageConditionKey, STORAGE_ADVICE } from '../../../../shared/storage-advice'
import type { InventoryReport } from '../../../../shared/storage-inventory'
import {
  StorageNoticeContext,
  type NoticePreference,
  type StorageReview
} from './storageNoticeContext'

const key = 'collie.storage-notices.v1'
const day = 24 * 60 * 60 * 1000
function read(): { entries: NoticePreference[]; issue: string } {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return { entries: [], issue: '' }
    if (raw.length > 40_000) throw new Error('size')
    const v = JSON.parse(raw)
    const now = Date.now()
    if (
      !v ||
      Object.keys(v).length !== 2 ||
      v.version !== 1 ||
      !Array.isArray(v.entries) ||
      v.entries.length > STORAGE_ADVICE.limit ||
      !v.entries.every(
        (e: NoticePreference) =>
          e &&
          Object.keys(e).length === 5 &&
          isStorageConditionKey(e.key) &&
          typeof e.active === 'boolean' &&
          typeof e.dismissed === 'boolean' &&
          Number.isSafeInteger(e.until) &&
          e.until >= 0 &&
          e.until <= now + day &&
          Number.isSafeInteger(e.seen) &&
          e.seen >= 0 &&
          e.seen <= now + day
      ) ||
      new Set(v.entries.map((e: NoticePreference) => e.key)).size !== v.entries.length
    )
      throw new Error('format')
    return {
      entries: v.entries.filter((e: NoticePreference) => e.seen >= now - 30 * day),
      issue: ''
    }
  } catch {
    return {
      entries: [],
      issue:
        'Saved storage-notice choices could not be read. Notices use fresh measurements; project data is unaffected.'
    }
  }
}
export default function StorageNoticesProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const [initial] = useState(read)
  const [preferences, setPreferences] = useState(initial.entries)
  const entries = useRef(initial.entries)
  const [issue, setIssue] = useState(initial.issue)
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [review, setReview] = useState<StorageReview | null>(null)
  const [now, setNow] = useState(Date.now)
  const commit = useCallback((next: NoticePreference[]) => {
    entries.current = next
    setPreferences(next)
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, entries: next }))
      setIssue('')
    } catch {
      setIssue(
        'Storage-notice choices could not be saved. This session keeps them; they may appear again after reopening. Project data is unaffected.'
      )
    }
  }, [])
  const publish = useCallback(
    (next: InventoryReport) => {
      // Do not announce thresholds or persist preferences on every polling reply.
      if (next.state === 'running') return
      const time = Date.now()
      const map = new Map(
        entries.current.filter((e) => e.seen >= time - 30 * day).map((e) => [e.key, { ...e }])
      )
      for (const c of next.conditions) {
        const e = map.get(c.key) ?? {
          key: c.key,
          active: false,
          dismissed: false,
          until: 0,
          seen: time
        }
        if (c.signal === 'high') e.active = true
        else if (c.signal === 'clear') {
          e.active = false
          e.dismissed = false
          e.until = 0
        }
        e.seen = time
        map.set(c.key, e)
      }
      const values = [...map.values()]
        .sort((a, b) => Number(b.active) - Number(a.active) || b.seen - a.seen)
        .slice(0, STORAGE_ADVICE.limit)
      commit(values)
      setReport(next)
      setNow(time)
    },
    [commit]
  )
  const dismiss = useCallback(
    (condition: string, snooze: boolean) => {
      const time = Date.now()
      commit(
        entries.current.map((e) =>
          e.key === condition
            ? { ...e, dismissed: !snooze, until: snooze ? time + day : 0, seen: time }
            : e
        )
      )
      setNow(time)
    },
    [commit]
  )
  const restore = useCallback(() => {
    commit(entries.current.map((e) => ({ ...e, dismissed: false, until: 0 })))
    setNow(Date.now())
  }, [commit])
  useEffect(() => {
    const next = preferences
      .filter((e) => e.until > now)
      .reduce((n, e) => Math.min(n, e.until), Infinity)
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, next - Date.now()))
    return () => clearTimeout(timer)
  }, [preferences, now])
  const choices = new Map(preferences.map((e) => [e.key, e]))
  const visible =
    report?.conditions.filter((c) => {
      const e = choices.get(c.key)
      return e?.active && !e.dismissed && e.until <= now
    }) ?? []
  return (
    <StorageNoticeContext.Provider
      value={{
        report,
        visible,
        preferences,
        now,
        issue,
        review,
        publish,
        dismiss,
        restore,
        select: (condition) => {
          if (report) setReview({ id: crypto.randomUUID(), scanId: report.id, condition })
        }
      }}
    >
      {children}
    </StorageNoticeContext.Provider>
  )
}
