import { app, safeStorage } from 'electron'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isId } from '../../../domain/editor/schema'
import { exact, record } from '../../../shared/projects'
import { isDirectAction, type DirectAction } from '../../../shared/direct-access'
import { contained, directory, writeJson } from '../../../worker/storage/files'

export type PendingConnection = { id: string; claim: string; browser: string; credential: string; kind: DirectAction; expiresAt: number }
export type Vault = { version: 1; origin: string; issuer: string; credential: string | null; pending: PendingConnection | null; hasSubscription: boolean }
const secret = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
export function secureStorageAvailable(): boolean { return ['darwin', 'win32'].includes(process.platform) && safeStorage.isEncryptionAvailable() }
function valid(value: unknown): value is Vault {
  if (!record(value) || !exact(value, ['version', 'origin', 'issuer', 'credential', 'pending', 'hasSubscription']) || value.version !== 1 || typeof value.origin !== 'string' || typeof value.issuer !== 'string' || typeof value.hasSubscription !== 'boolean' || !(value.credential === null || secret(value.credential))) return false
  const pending = value.pending
  return pending === null || record(pending) && exact(pending, ['id', 'claim', 'browser', 'credential', 'kind', 'expiresAt']) && isId(pending.id) &&
    [pending.claim, pending.browser, pending.credential].every(secret) && isDirectAction(pending.kind) && Number.isSafeInteger(pending.expiresAt) && Number(pending.expiresAt) > 0
}
async function vaultPath(): Promise<string> {
  const profile = app.getPath('userData'), root = join(profile, 'purchase-credentials')
  await directory(profile, root)
  return join(root, 'connection-v1.json')
}
export async function readVault(): Promise<Vault | null> {
  const path = await vaultPath()
  try {
    await contained(app.getPath('userData'), path, false)
    if ((await lstat(path)).size > 65536) throw new Error('VAULT_INVALID')
    const envelope: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!record(envelope) || !exact(envelope, ['version', 'encrypted']) || envelope.version !== 1 || !(envelope.encrypted === null || typeof envelope.encrypted === 'string')) throw new Error('VAULT_INVALID')
    if (envelope.encrypted === null) return null
    if (!secureStorageAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE')
    const value: unknown = JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64')))
    if (!valid(value)) throw new Error('VAULT_INVALID')
    return value
  } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null; throw error }
}
export async function saveVault(value: Vault | null): Promise<void> {
  if (value && (!valid(value) || !secureStorageAvailable())) throw new Error('SECURE_STORAGE_UNAVAILABLE')
  await writeJson(await vaultPath(), { version: 1, encrypted: value ? safeStorage.encryptString(JSON.stringify(value)).toString('base64') : null })
}
