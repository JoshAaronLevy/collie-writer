import { exact, record } from './projects'

export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage'
export const IMPORT_TASK_ATTEMPTS = 3

/** Settled tasks have a result or a non-retryable omission, not necessarily a successful request. */
export function processedImportTasks(tasks: ReadonlyArray<{ state: string }>): number {
  return tasks.filter((task) =>
    ['valid', 'invalid', 'interrupted', 'retry-exhausted'].includes(task.state)
  ).length
}
/** Only structured, terminal refusals carry retry eligibility. No account-window estimate. */
export type ImportRefusal = {
  version: 1
  kind: 'usage-limit' | 'temporary-rate-limit'
  code: string | null
  httpStatus: number
  retryNotBefore: number | null
}
export function isImportRefusal(v: unknown): v is ImportRefusal {
  return (
    record(v) &&
    exact(v, ['version', 'kind', 'code', 'httpStatus', 'retryNotBefore']) &&
    v.version === 1 &&
    typeof v.httpStatus === 'number' &&
    [200, 429].includes(Number(v.httpStatus)) &&
    (v.retryNotBefore === null ||
      (Number.isSafeInteger(v.retryNotBefore) &&
        Number(v.retryNotBefore) > 0 &&
        Number(v.retryNotBefore) <= 8640000000000000)) &&
    (v.kind === 'usage-limit'
      ? v.code === 'subscription_sharing_usage_limit_exceeded' && v.retryNotBefore === null
      : v.kind === 'temporary-rate-limit' &&
        v.code !== 'subscription_sharing_usage_limit_exceeded' &&
        (v.httpStatus === 429 || v.code === 'rate_limit_exceeded' || v.code === 'slow_down') &&
        (v.code === null ||
          (typeof v.code === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(v.code))))
  )
}
export function importRefusalMessage(f: ImportRefusal): string {
  return f.kind === 'usage-limit'
    ? 'ChatGPT refused this request because a plan or app usage limit was reached. Saved findings are kept. Manage usage to check availability, then Continue explicitly. Collie cannot determine the allowance or reset time.'
    : `ChatGPT temporarily limited requests. Saved findings are kept. ${f.retryNotBefore ? 'Wait until ' + new Date(f.retryNotBefore).toLocaleString() + ' before continuing.' : 'Wait, then Continue explicitly.'} This does not establish a five-hour or weekly usage limit.`
}
export type RecoverableImportTask = { state: string }
export function retryableImportTask(t: RecoverableImportTask): boolean {
  return ['unread', 'quota-paused', 'rate-limited'].includes(t.state)
}
