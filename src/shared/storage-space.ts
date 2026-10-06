/** User-visible, transient operation context. Never a grant or a disk-space guarantee. */
export type SpaceIssue = {
  operation: string
  path: string
  required: number | null
  available: number | null
  reserved: number
  reason: 'insufficient' | 'unknown' | 'write-failed'
}
const bytes = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
export function isSpaceIssue(v: unknown): v is SpaceIssue {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const x = v as Record<string, unknown>
  return (
    Object.keys(x).length === 6 &&
    typeof x.operation === 'string' &&
    x.operation.length > 0 &&
    x.operation.length <= 100 &&
    typeof x.path === 'string' &&
    x.path.length > 0 &&
    x.path.length <= 4096 &&
    (x.required === null || bytes(x.required)) &&
    (x.available === null || bytes(x.available)) &&
    bytes(x.reserved) &&
    ['insufficient', 'unknown', 'write-failed'].includes(String(x.reason))
  )
}
export function storageBytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GiB`
    : bytes >= 1024 ** 2
      ? `${(bytes / 1024 ** 2).toFixed(1)} MiB`
      : bytes >= 1024
        ? `${(bytes / 1024).toFixed(1)} KiB`
        : `${bytes} B`
}
export function spaceMessage(issue: SpaceIssue): string {
  const need =
    issue.required === null
      ? 'Additional space needed is unknown.'
      : `Estimated additional space including the safety margin: ${storageBytes(issue.required)}.`
  const free =
    issue.available === null
      ? 'Available space could not be measured.'
      : `Available at the check: ${storageBytes(issue.available)}.`
  const location =
    issue.reason === 'write-failed'
      ? `${issue.operation} reported a storage write failure. Location to review: ${issue.path}. The failing volume is unconfirmed when the write supplied no path.`
      : issue.reason === 'unknown'
        ? `${issue.operation} could not measure capacity at ${issue.path}.`
        : `${issue.operation} needs more space at ${issue.path}.`
  return (
    `${location} ${need} ${free} ` +
    (issue.reserved
      ? `${storageBytes(issue.reserved)} was reserved by other Collie jobs; wait for those jobs to finish before retrying. `
      : '') +
    'Review Data and recovery and free space on this volume, then retry the retained operation. Save As or Backup can use another destination, but still need working-folder space. Keep this window open if writing needs protection. Space estimates cannot reserve space against other applications.'
  )
}
