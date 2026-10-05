import { hasControlCharacters } from '../../shared/control-characters'
import { randomUUID } from 'node:crypto'
import { isId } from '../../domain/editor/schema'
import { aiText } from '../../shared/ai'
import { exact, record } from '../../shared/projects'

export const DIRECT_CREDENTIAL_FILE = 'chatgpt-plan-credentials-v1.json'
export type PlanTokens = {
  access: string
  refresh: string | null
  expiresAt: number
  earliestRefreshAt: number
  scopes: string[]
}
/** A registration without a subject is an interrupted first code exchange,
 * never a verified account. Keep its issued client ID for fresh authorization. */
export type PlanAccount = {
  id: string
  clientId: string
  subject: string | null
  label: string
  hint: string | null
  tokens: PlanTokens | null
  pending: 'refresh' | 'sign-out' | null
}
export type PlanCredentials = {
  version: 1
  hostId: string
  activeId: string | null
  accounts: PlanAccount[]
}
export const issuedClient = (v: unknown): v is string =>
  typeof v === 'string' && /^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(v)
const secret = (v: unknown): v is string =>
  aiText(v, 32768) && v.length > 0 && !(hasControlCharacters(v) || /\s/u.test(v))
const time = (v: unknown): boolean => Number.isSafeInteger(v) && Number(v) >= 0
export function emptyPlanCredentials(): PlanCredentials {
  return { version: 1, hostId: randomUUID(), activeId: null, accounts: [] }
}
export function isPlanTokens(v: unknown): v is PlanTokens {
  return (
    record(v) &&
    exact(v, ['access', 'refresh', 'expiresAt', 'earliestRefreshAt', 'scopes']) &&
    secret(v.access) &&
    (v.refresh === null || secret(v.refresh)) &&
    time(v.expiresAt) &&
    time(v.earliestRefreshAt) &&
    Array.isArray(v.scopes) &&
    v.scopes.length <= 32 &&
    v.scopes.every((s) => typeof s === 'string' && /^[A-Za-z0-9.:_-]{1,100}$/.test(s)) &&
    new Set(v.scopes).size === v.scopes.length
  )
}
export function isPlanCredentials(v: unknown): v is PlanCredentials {
  return (
    record(v) &&
    exact(v, ['version', 'hostId', 'activeId', 'accounts']) &&
    v.version === 1 &&
    isId(v.hostId) &&
    (v.activeId === null || isId(v.activeId)) &&
    Array.isArray(v.accounts) &&
    v.accounts.length <= 8 &&
    v.accounts.every(
      (a) =>
        record(a) &&
        exact(a, ['id', 'clientId', 'subject', 'label', 'hint', 'tokens', 'pending']) &&
        isId(a.id) &&
        issuedClient(a.clientId) &&
        (a.subject === null || (aiText(a.subject, 500) && a.subject.length > 0)) &&
        aiText(a.label, 200) &&
        a.label.length > 0 &&
        (a.hint === null || secret(a.hint)) &&
        (a.tokens === null || (a.subject !== null && isPlanTokens(a.tokens))) &&
        (a.pending === null || a.pending === 'refresh' || a.pending === 'sign-out')
    ) &&
    new Set(v.accounts.map((a) => a.id)).size === v.accounts.length &&
    new Set(v.accounts.map((a) => a.clientId)).size === v.accounts.length &&
    (v.activeId === null || v.accounts.some((a) => a.id === v.activeId && a.subject !== null))
  )
}
export const planAuthorized = (a: PlanAccount | undefined): boolean =>
  !!a?.tokens &&
  ['resource.invoke', 'chatgpt.tokens.use.direct'].every((s) => a.tokens!.scopes.includes(s))
