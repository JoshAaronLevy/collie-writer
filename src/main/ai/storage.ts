import { opendirSync } from 'node:fs'
import { isDraftFile, type DraftFile } from '../../shared/conversation-drafts'
import { boundedJson, parentStamp, namedStamp } from '../../worker/projects/retention-files'
import { pathPresent, removalMarker } from '../../worker/projects/working-copy-records'
import { sameScope } from '../../shared/project-files'
import type { OpenInput } from '../../shared/projects'
import type { WorkspaceAiEvidence } from '../../shared/working-copy'
import { hasControlCharacters } from '../../shared/control-characters'
import { safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { lstat, readFile, opendir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { aiText, AI_LIMITS } from '../../shared/ai'
import { exact, record } from '../../shared/projects'
import { contained, directory, syncDirectory, writeJson } from '../../worker/storage/files'
import { requestDigest } from '../../worker/storage/digest'
import { isAiHandoffReceipt, type AiHandoffReceipt } from '../../shared/ai-handoff'
import { handoffMatches } from './handoff'
import { AiError } from './errors'
import {
  DIRECT_CREDENTIAL_FILE,
  emptyPlanCredentials,
  isPlanCredentials,
  type PlanCredentials
} from './direct-credentials'
import {
  PLAN_PREFERENCES_FILE,
  emptyPlanPreferences,
  isPlanPreferences,
  type PlanPreferences
} from './direct-preferences'
import { isRetainedOperation, type RetainedOperation } from './local-operation'
export type { RetainedOperation } from './local-operation'
import {
  emptyLocalSession,
  isLocalCodexMetadataV1,
  isLocalCodexSessionV2,
  LOCAL_CODEX_METADATA_FILE,
  LOCAL_CODEX_SESSION_FILE,
  type LocalCodexSessionV2
} from './local-session-metadata'

export type Tokens = {
  access: string
  refresh: string
  id: string
  expiresAt: number
  earliestRefreshAt: number
  scopes: string[]
}
export type Account = {
  id: string
  subject: string
  label: string
  clientId: string
  tokens: Tokens | null
  refreshPending: boolean
}
// Registered OAuth v1 remains exact. Codex-managed auth MUST NOT be represented
// by a fabricated clientId or Tokens value; see local-session-metadata.ts.
export type Credentials = {
  version: 1
  hostId: string
  activeId: string | null
  accounts: Account[]
}
// The bounded hot directory and per-ID encrypted cold index share one owner.
// All original v1/v2/v3 bytes and interrupted write candidates remain retained.
const secret = (v: unknown): v is string =>
  aiText(v, 32768) && v.length > 0 && !(hasControlCharacters(v) || /\s/u.test(v))
const finiteTime = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
export function isTokens(v: unknown): v is Tokens {
  return (
    record(v) &&
    exact(v, ['access', 'refresh', 'id', 'expiresAt', 'earliestRefreshAt', 'scopes']) &&
    [v.access, v.refresh, v.id].every(secret) &&
    finiteTime(v.expiresAt) &&
    finiteTime(v.earliestRefreshAt) &&
    Array.isArray(v.scopes) &&
    v.scopes.length <= 32 &&
    v.scopes.every((s) => typeof s === 'string' && /^[a-zA-Z0-9.:_-]{1,100}$/.test(s))
  )
}
function isCredentials(v: unknown): v is Credentials {
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
        exact(a, ['id', 'subject', 'label', 'clientId', 'tokens', 'refreshPending']) &&
        isId(a.id) &&
        aiText(a.subject, 500) &&
        a.subject.length > 0 &&
        aiText(a.label, 200) &&
        typeof a.clientId === 'string' &&
        /^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(a.clientId) &&
        (a.tokens === null || isTokens(a.tokens)) &&
        typeof a.refreshPending === 'boolean'
    ) &&
    new Set(v.accounts.map((a) => a.id)).size === v.accounts.length &&
    new Set(v.accounts.map((a) => JSON.stringify([a.clientId, a.subject]))).size ===
      v.accounts.length &&
    (v.activeId === null || v.accounts.some((a) => a.id === v.activeId))
  )
}
export function secureAiStorage(): boolean {
  return ['darwin', 'win32'].includes(process.platform) && safeStorage.isEncryptionAvailable()
}

/** This directory is a sibling of workspaces, never a portable project asset.
 * Failed writes retain encrypted candidates; no automatic content cleanup. */
export class AiStorage {
  private root: string | null = null
  private initialized: Promise<void> | null = null
  private retentionLayout: Promise<void> | null = null
  constructor(private readonly workingRoot: () => string | undefined) {}
  workspaceRetired(scope: OpenInput): boolean {
    const root = this.workingRoot()
    if (!root) return true
    try {
      return pathPresent(removalMarker(root, scope))
    } catch {
      return true
    }
  }
  /** Read only, bounded hot AND cold records; no credentials, login, initialization or cleanup. */
  workspaceEvidence(scope: OpenInput): WorkspaceAiEvidence {
    const root = this.workingRoot()
    if (!root) return 'unknown'
    let count = 0,
      bytes = 0
    try {
      const draftsPath = join(root, 'ai', 'conversation-drafts-v1.json')
      if (pathPresent(draftsPath)) {
        const envelope = boundedJson(draftsPath, 8 * 1024 ** 2)
        if (
          !record(envelope) ||
          !exact(envelope, ['version', 'encrypted']) ||
          envelope.version !== 1 ||
          typeof envelope.encrypted !== 'string' ||
          !/^[A-Za-z0-9+/]+=*$/.test(envelope.encrypted) ||
          !secureAiStorage()
        )
          return 'unknown'
        const drafts: unknown = JSON.parse(
          safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))
        )
        if (!isDraftFile(drafts)) return 'unknown'
        if (drafts.entries.some((d) => sameScope(d, scope))) return 'linked'
      }
      for (const folder of ['operations', 'retained-v1/records', 'retained-v1/receipts']) {
        const path = join(root, 'ai', folder)
        let dir: ReturnType<typeof opendirSync>
        try {
          parentStamp(join(path, 'entry'))
          dir = opendirSync(path)
        } catch (error) {
          if (record(error) && error.code === 'ENOENT') continue
          throw error
        }
        try {
          for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
            const marker = folder === 'operations' && entry.name === 'index-v1.json'
            if (
              ++count > 256 ||
              !entry.isFile() ||
              (!marker && (!entry.name.endsWith('.json') || !isId(entry.name.slice(0, -5))))
            )
              return 'unknown'
            const file = join(path, entry.name),
              identity = namedStamp(file)
            if (!identity || (bytes += identity.size) > 32 * 1024 ** 2) return 'unknown'
            const envelope = boundedJson(file, 4 * 1024 ** 2)
            if (
              !record(envelope) ||
              !exact(envelope, ['version', 'encrypted']) ||
              envelope.version !== 1 ||
              typeof envelope.encrypted !== 'string' ||
              !/^[A-Za-z0-9+/]+=*$/.test(envelope.encrypted) ||
              !secureAiStorage()
            )
              return 'unknown'
            const value: unknown = JSON.parse(
              safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))
            )
            if (marker) {
              if (
                !record(value) ||
                !exact(value, ['version', 'layout', 'limit']) ||
                value.version !== 1 ||
                value.layout !== 'receipt-index-v1' ||
                value.limit !== AI_LIMITS.jobs
              )
                return 'unknown'
            } else if (folder.endsWith('/receipts')) {
              if (
                !record(value) ||
                !exact(value, ['version', 'receipt', 'recordDigest']) ||
                value.version !== 1 ||
                !isAiHandoffReceipt(value.receipt) ||
                value.receipt.operationId !== entry.name.slice(0, -5) ||
                typeof value.recordDigest !== 'string' ||
                !/^[a-f0-9]{64}$/.test(value.recordDigest)
              )
                return 'unknown'
              if (sameScope(value.receipt.scope, scope)) return 'linked'
            } else {
              if (!isRetainedOperation(value) || value.view.operationId !== entry.name.slice(0, -5))
                return 'unknown'
              if (sameScope(value.view.scope, scope)) return 'linked'
            }
          }
        } finally {
          dir.closeSync()
        }
      }
      return 'clear'
    } catch {
      return 'unknown'
    }
  }
  async initialize(): Promise<void> {
    const working = this.workingRoot()
    if (!working || !secureAiStorage())
      throw new AiError(!working ? 'storage-unavailable' : 'secure-storage-unavailable')
    if (this.root && this.root !== join(working, 'ai')) throw new AiError('storage-unavailable')
    if (!this.initialized) {
      this.root = join(working, 'ai')
      this.initialized = (async () => {
        await directory(working, this.root!)
        await directory(this.root!, join(this.root!, 'operations'))
      })().catch(() => {
        this.initialized = null
        throw new AiError('storage-unavailable')
      })
    }
    await this.initialized
  }
  async runtimeRoot(): Promise<string> {
    await this.initialize()
    await directory(this.root!, join(this.root!, 'runtime'))
    return join(this.root!, 'runtime')
  }
  async localSession(): Promise<LocalCodexSessionV2> {
    const value = await this.read(LOCAL_CODEX_SESSION_FILE)
    if (value !== null) {
      if (!isLocalCodexSessionV2(value)) throw new AiError('storage-unavailable')
      return value
    }
    const legacy = await this.read(LOCAL_CODEX_METADATA_FILE)
    if (legacy === null) return emptyLocalSession()
    if (!isLocalCodexMetadataV1(legacy)) throw new AiError('storage-unavailable')
    return {
      ...emptyLocalSession(),
      active: legacy.account ? { profileId: legacy.profileId, account: legacy.account } : null,
      retired: legacy.account ? [] : [legacy.profileId]
    }
  }
  async saveLocalSession(value: LocalCodexSessionV2): Promise<void> {
    if (!isLocalCodexSessionV2(value)) throw new AiError('storage-unavailable')
    await this.write(LOCAL_CODEX_SESSION_FILE, value)
  }
  private async read(name: string, maxBytes = 2 * 1024 * 1024): Promise<unknown | null> {
    await this.initialize()
    const path = join(this.root!, name)
    try {
      await contained(this.root!, path, false)
      if ((await lstat(path)).size > maxBytes) throw new AiError('storage-unavailable')
      const bytes = await readFile(path)
      if (bytes.length > maxBytes) throw new AiError('storage-unavailable')
      const envelope: unknown = JSON.parse(bytes.toString('utf8'))
      if (
        !record(envelope) ||
        !exact(envelope, ['version', 'encrypted']) ||
        envelope.version !== 1 ||
        typeof envelope.encrypted !== 'string' ||
        !/^[A-Za-z0-9+/]+=*$/.test(envelope.encrypted)
      )
        throw new AiError('storage-unavailable')
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64')))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return null
      throw new AiError('storage-unavailable')
    }
  }
  private async write(name: string, value: unknown, maxBytes = 2 * 1024 * 1024): Promise<void> {
    await this.initialize()
    try {
      const path = join(this.root!, name)
      await contained(this.root!, dirname(path), true)
      try {
        await contained(this.root!, path, false)
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
          throw error
      }
      const envelope = {
        version: 1,
        encrypted: safeStorage.encryptString(JSON.stringify(value)).toString('base64')
      }
      if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > maxBytes)
        throw new AiError('storage-unavailable')
      await writeJson(path, envelope)
    } catch {
      throw new AiError('storage-unavailable')
    }
  }
  async conversationDrafts(): Promise<DraftFile> {
    const value = await this.read('conversation-drafts-v1.json', 8 * 1024 ** 2)
    if (value === null) return { version: 1, revision: randomUUID(), entries: [] }
    if (!isDraftFile(value)) throw new AiError('storage-unavailable')
    return value
  }
  async saveConversationDrafts(value: DraftFile): Promise<void> {
    if (!isDraftFile(value)) throw new AiError('storage-unavailable')
    await this.write('conversation-drafts-v1.json', value, 8 * 1024 ** 2)
  }
  async credentials(): Promise<Credentials> {
    const value = await this.read('credentials-v1.json')
    if (value === null) return { version: 1, hostId: randomUUID(), activeId: null, accounts: [] }
    if (!isCredentials(value)) throw new AiError('storage-unavailable')
    // A pending rotation after interruption cannot safely replay its old refresh token.
    if (value.accounts.some((a) => a.refreshPending)) {
      for (const account of value.accounts)
        if (account.refreshPending) {
          account.tokens = null
          account.refreshPending = false
        }
      await this.saveCredentials(value)
    }
    return value
  }
  async saveCredentials(value: Credentials): Promise<void> {
    if (!isCredentials(value)) throw new AiError('storage-unavailable')
    await this.write('credentials-v1.json', value)
  }
  async planPreferences(): Promise<PlanPreferences> {
    const value = await this.read(PLAN_PREFERENCES_FILE, 16 * 1024)
    if (value === null) return emptyPlanPreferences()
    if (!isPlanPreferences(value)) throw new AiError('storage-unavailable')
    return value
  }
  async savePlanPreferences(value: PlanPreferences): Promise<void> {
    if (!isPlanPreferences(value)) throw new AiError('storage-unavailable')
    await this.write(PLAN_PREFERENCES_FILE, value)
  }
  async planCredentials(): Promise<PlanCredentials> {
    const value = await this.read(DIRECT_CREDENTIAL_FILE)
    if (value === null) return emptyPlanCredentials()
    if (!isPlanCredentials(value)) throw new AiError('storage-unavailable')
    // An interrupted rotation cannot be retried with the previous refresh token.
    // Keep its registration and identity hint; sign-out also removes the hint.
    if (value.accounts.some((a) => a.pending !== null)) {
      for (const account of value.accounts)
        if (account.pending) {
          if (account.pending === 'sign-out') {
            account.hint = null
            if (value.activeId === account.id) value.activeId = null
          }
          account.tokens = null
          account.pending = null
        }
      await this.savePlanCredentials(value)
    }
    return value
  }
  async savePlanCredentials(value: PlanCredentials): Promise<void> {
    if (!isPlanCredentials(value)) throw new AiError('storage-unavailable')
    await this.write(DIRECT_CREDENTIAL_FILE, value)
  }
  private async retention(): Promise<void> {
    await this.initialize()
    if (!this.retentionLayout)
      this.retentionLayout = (async () => {
        await directory(this.root!, join(this.root!, 'retained-v1'))
        await directory(this.root!, join(this.root!, 'retained-v1', 'records'))
        await directory(this.root!, join(this.root!, 'retained-v1', 'receipts'))
        await syncDirectory(join(this.root!, 'retained-v1'))
        await syncDirectory(this.root!)
        const name = join('operations', 'index-v1.json'),
          marker = await this.read(name)
        // The marker also makes pre-CD08 readers refuse the new local layout.
        if (marker === null)
          await this.write(name, { version: 1, layout: 'receipt-index-v1', limit: AI_LIMITS.jobs })
        else if (
          !record(marker) ||
          !exact(marker, ['version', 'layout', 'limit']) ||
          marker.version !== 1 ||
          marker.layout !== 'receipt-index-v1' ||
          marker.limit !== AI_LIMITS.jobs
        )
          throw new AiError('storage-unavailable')
      })().catch((error) => {
        this.retentionLayout = null
        throw error
      })
    await this.retentionLayout
  }
  private async coldIndex(
    id: string
  ): Promise<{ version: 1; receipt: AiHandoffReceipt; recordDigest: string } | null> {
    if (!isId(id)) throw new AiError('invalid-request')
    const value = await this.read(join('retained-v1', 'receipts', `${id}.json`), 32768)
    if (value === null) return null
    if (
      !record(value) ||
      !exact(value, ['version', 'receipt', 'recordDigest']) ||
      value.version !== 1 ||
      !isAiHandoffReceipt(value.receipt) ||
      value.receipt.operationId !== id ||
      typeof value.recordDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.recordDigest)
    )
      throw new AiError('storage-unavailable')
    return value as { version: 1; receipt: AiHandoffReceipt; recordDigest: string }
  }
  /** Only exact IDs are read from cold storage; no unbounded history listing. */
  async operation(id: string): Promise<RetainedOperation | null> {
    if (!isId(id)) throw new AiError('invalid-request')
    await this.retention()
    const hot = await this.read(join('operations', `${id}.json`), 4 * 1024 * 1024)
    const cold = await this.read(join('retained-v1', 'records', `${id}.json`), 4 * 1024 * 1024)
    if (hot !== null && cold !== null) throw new AiError('storage-unavailable')
    const value = hot ?? cold,
      index = await this.coldIndex(id)
    if (value === null) {
      if (index) throw new AiError('storage-unavailable')
      return null
    }
    if (
      !isRetainedOperation(value) ||
      value.view.operationId !== id ||
      (cold !== null && !index) ||
      (index &&
        (!handoffMatches(value, index.receipt) || requestDigest(value) !== index.recordDigest))
    )
      throw new AiError('storage-unavailable')
    return value
  }
  async operations(): Promise<RetainedOperation[]> {
    await this.retention()
    const operations: RetainedOperation[] = []
    for await (const entry of await opendir(join(this.root!, 'operations'))) {
      const name = entry.name
      if (name === 'index-v1.json' || name.startsWith('.write-')) continue
      if (!name.endsWith('.json') || operations.length >= AI_LIMITS.jobs)
        throw new AiError('storage-unavailable')
      if (!isId(name.slice(0, -5))) throw new AiError('storage-unavailable')
      // v2 retains raw text plus final/commentary channels and exact framing.
      // Bound the encrypted envelope as well as the decoded content fields.
      const value = await this.operation(name.slice(0, -5))
      if (!isRetainedOperation(value) || value.view.operationId !== name.slice(0, -5))
        throw new AiError('storage-unavailable')
      operations.push(value)
    }
    return operations
  }
  async retain(operation: RetainedOperation): Promise<void> {
    if (!isRetainedOperation(operation)) throw new AiError('invalid-request')
    await this.retention()
    const index = await this.coldIndex(operation.view.operationId)
    if (index) {
      if (
        index.recordDigest !== requestDigest(operation) ||
        !(await this.operation(operation.view.operationId))
      )
        throw new AiError('storage-unavailable')
      return
    }
    await this.write(
      join('operations', `${operation.view.operationId}.json`),
      operation,
      4 * 1024 * 1024
    )
  }
  /** Receipt first, atomic move second. Interrupted steps keep the hot slot or
   * its cold proof, and repeating this local transfer cannot send inference. */
  async retire(receipt: AiHandoffReceipt): Promise<void> {
    await this.retention()
    const item = await this.operation(receipt.operationId)
    if (!item || !handoffMatches(item, receipt)) throw new AiError('storage-unavailable')
    const desired = { version: 1 as const, receipt, recordDigest: requestDigest(item) },
      previous = await this.coldIndex(receipt.operationId)
    if (previous && requestDigest(previous) !== requestDigest(desired))
      throw new AiError('storage-unavailable')
    if (!previous)
      await this.write(
        join('retained-v1', 'receipts', `${receipt.operationId}.json`),
        desired,
        32768
      )
    const hot = join(this.root!, 'operations', `${receipt.operationId}.json`),
      cold = join(this.root!, 'retained-v1', 'records', `${receipt.operationId}.json`)
    if (
      (await this.read(
        join('retained-v1', 'records', `${receipt.operationId}.json`),
        4 * 1024 * 1024
      )) === null
    ) {
      await contained(this.root!, hot, false)
      await contained(this.root!, dirname(cold), true)
      await rename(hot, cold)
    }
    await syncDirectory(dirname(cold))
    await syncDirectory(dirname(hot))
  }
}
