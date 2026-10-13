import type { HistoricalTime } from '../../../../../shared/conversation-transcript'

export function messageTime(
  value: string | HistoricalTime | null,
  now: number
): { label: string; exact: string; machine: string } | null {
  if (!value) return null
  const raw = typeof value === 'string' ? value : value.raw
  if (
    typeof value !== 'string' &&
    (value.precision === 'date' ||
      value.precision === 'day' ||
      /^\d{4}-\d{2}-\d{2}$/.test(raw ?? ''))
  ) {
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const date = new Date(`${raw}T12:00:00`)
    if (
      !Number.isFinite(date.getTime()) ||
      date.getFullYear() !== Number(raw.slice(0, 4)) ||
      date.getMonth() + 1 !== Number(raw.slice(5, 7)) ||
      date.getDate() !== Number(raw.slice(8, 10))
    )
      return null
    const label = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    return { label, exact: label, machine: raw }
  }
  if (typeof value !== 'string' && value.zoneKnown !== true) {
    // A local/unknown-zone historical time cannot be converted to the user's timezone.
    if (!raw || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw)) return null
    const date = new Date(`${raw.replace(' ', 'T')}Z`)
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 16) !== raw.replace(' ', 'T').slice(0, 16)
    )
      return null
    const label = date.toLocaleString(undefined, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
    return { label, exact: `${raw} (timezone not recorded)`, machine: raw.replace(' ', 'T') }
  }
  const machine = typeof value === 'string' ? value : value.normalizedUtc
  if (!machine) return null
  const date = new Date(machine)
  if (!Number.isFinite(date.getTime())) return null
  const elapsed = now - date.getTime()
  let label: string
  if (elapsed >= 0 && elapsed < 60_000) label = 'Just now'
  else if (elapsed >= 60_000 && elapsed < 3_600_000)
    label = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
      -Math.floor(elapsed / 60_000),
      'minute'
    )
  else {
    const today = new Date(now),
      yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const clock = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    label =
      date.toDateString() === today.toDateString()
        ? clock
        : date.toDateString() === yesterday.toDateString()
          ? `Yesterday at ${clock}`
          : date.toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })
  }
  return { label, exact: date.toLocaleString(), machine }
}
