import { ipcMain, shell, type WebContents } from 'electron'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  DIRECT_CHANNELS,
  isDirectAction,
  type DirectAction,
  type DirectView
} from '../../../shared/direct-access'
import { exact, record, projectFailure } from '../../../shared/projects'
import { isInfoRequest } from '../../../shared/schemas'
import { isId } from '../../../domain/editor/schema'
import { isTrustedSender } from '../../ipc'
import { AccessService } from '../service'
import { verifyGrant } from '../grant'
import { ISSUER_KEYS } from '../keys'
import { DIRECT_CONFIGURATION, type DirectConfiguration } from './config'
import {
  readVault,
  saveVault,
  secureStorageAvailable,
  type Vault,
  type PendingConnection
} from './vault'

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
class DirectFailure extends Error {
  constructor(readonly publicMessage: string) {
    super('DIRECT_UNAVAILABLE')
  }
}
const unavailable = (): DirectFailure =>
  new DirectFailure(
    'The purchase service could not confirm this action. Existing signed access and all writing were kept. Try again when connected.'
  )

export class DirectAccessService {
  private vault: Vault | null = null
  private loaded = false
  private loading: Promise<void> | null = null
  private broken = false
  private busy = false
  private message = ''
  constructor(
    private readonly owner: () => WebContents | undefined,
    private readonly access: AccessService,
    private readonly devOrigin?: string
  ) {}
  private config(): DirectConfiguration | null {
    const config = DIRECT_CONFIGURATION
    if (
      !config ||
      !ISSUER_KEYS.some((key) => key.issuer === config.issuer && key.channel === 'direct')
    )
      return null
    try {
      const url = new URL(config.origin)
      if (url.protocol !== 'https:' || url.origin !== config.origin || url.username || url.password)
        return null
      return config
    } catch {
      return null
    }
  }
  private async load(): Promise<void> {
    if (this.loaded) return
    if (!this.loading)
      this.loading = (async () => {
        try {
          this.vault = await readVault()
        } catch {
          this.broken = true
          this.message =
            'Purchase credentials could not be opened safely. Disconnect to clear this computer’s connection, then restore again. Cached signed access and writing remain available.'
        }
        this.loaded = true
      })()
    await this.loading
  }
  private view(): DirectView {
    const config = this.config()
    return {
      configured: !!config,
      checkoutEnabled: !!config?.checkoutApproved,
      connected: !!this.vault?.credential,
      secureStorage: secureStorageAvailable() && !this.broken,
      pending: this.vault?.pending?.kind ?? null,
      expiresAt: this.vault?.pending?.expiresAt ?? null,
      hasSubscription: this.vault?.hasSubscription ?? false,
      message:
        this.message ||
        (config
          ? 'Purchase connections contact the service only when you request an action.'
          : 'Direct purchases and restore are not configured in this build. Free writing has no time limit.')
    }
  }
  private requireConfig(): DirectConfiguration {
    const config = this.config()
    if (!config)
      throw new DirectFailure(
        'Direct purchases and restore require an approved service address and authentic issuer keys. They are not configured in this build.'
      )
    if (this.broken || !secureStorageAvailable())
      throw new DirectFailure(
        'OS-protected purchase credential storage is unavailable. Free writing and cached signed access remain available.'
      )
    if (this.vault && (this.vault.origin !== config.origin || this.vault.issuer !== config.issuer))
      throw new DirectFailure(
        'This connection belongs to a different purchase service. Disconnect it before restoring through this build.'
      )
    return config
  }
  private async store(value: Vault | null): Promise<void> {
    try {
      await saveVault(value)
      this.vault = value
    } catch {
      this.broken = true
      throw new DirectFailure(
        'Purchase credentials could not be saved securely. No plaintext copy was created. Keep this session open and contact support.'
      )
    }
  }
  private async request(path: string, body: unknown, credential?: string): Promise<unknown> {
    const config = this.requireConfig()
    // These paths are selected by main, never supplied by the renderer.
    if (
      !['/v1/sessions', '/v1/session/claim', '/v1/access', '/v1/manage', '/v1/disconnect'].includes(
        path
      )
    )
      throw unavailable()
    try {
      const response = await fetch(`${config.origin}${path}`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(25000),
        headers: {
          'Content-Type': 'application/json',
          ...(credential ? { Authorization: `Bearer ${credential}` } : {})
        },
        body: JSON.stringify(body)
      })
      if (response.status === 410)
        throw new DirectFailure(
          'This browser session expired. Start purchase or restore again. Existing purchases and writing were kept.'
        )
      if (response.status === 401)
        throw new DirectFailure(
          'This purchase connection expired or was disconnected. Disconnect locally, then restore with your recovery code.'
        )
      if (!response.ok || !response.body) throw unavailable()
      const chunks: Uint8Array[] = []
      let bytes = 0
      const reader = response.body.getReader()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.length
          if (bytes > 2 * 1024 * 1024) {
            await reader.cancel()
            throw unavailable()
          }
          chunks.push(chunk.value)
        }
      } finally {
        reader.releaseLock()
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    } catch (error) {
      if (error instanceof DirectFailure) throw error
      throw unavailable()
    }
  }
  private async registerPending(pending: PendingConnection): Promise<void> {
    const result = await this.request(
      '/v1/sessions',
      {
        id: pending.id,
        claimHash: hash(pending.claim),
        browserHash: hash(pending.browser),
        credentialHash: hash(pending.credential),
        kind: pending.kind
      },
      this.vault?.credential ?? undefined
    )
    if (
      !record(result) ||
      !exact(result, ['expiresAt']) ||
      !Number.isSafeInteger(result.expiresAt) ||
      Number(result.expiresAt) <= Date.now() ||
      Number(result.expiresAt) > Date.now() + 21 * 60000
    )
      throw unavailable()
    await this.store({
      ...this.vault!,
      pending: { ...pending, expiresAt: Number(result.expiresAt) }
    })
  }
  private async openPending(): Promise<void> {
    const config = this.requireConfig(),
      pending = this.vault?.pending
    if (!pending || pending.expiresAt <= Date.now())
      throw new DirectFailure(
        'There is no current browser session. Start purchase or restore again.'
      )
    await this.registerPending(pending)
    await shell.openExternal(`${config.origin}/connect#${pending.id}.${pending.browser}`)
    this.message =
      'Continue in your system browser, then return here and choose Check completion. A browser success message alone does not grant access.'
  }
  private async begin(kind: DirectAction): Promise<void> {
    const config = this.requireConfig()
    if (kind !== 'restore' && !config.checkoutApproved)
      throw new DirectFailure(
        'Checkout is awaiting the recorded commercial-value decision and configured merchant review. No purchase was started.'
      )
    const secret = (): string => randomBytes(32).toString('base64url')
    const pending: PendingConnection = {
      id: randomUUID(),
      claim: secret(),
      browser: secret(),
      credential: secret(),
      kind,
      expiresAt: Date.now() + 20 * 60000
    }
    await this.store({
      version: 1,
      origin: config.origin,
      issuer: config.issuer,
      credential: this.vault?.credential ?? null,
      hasSubscription: this.vault?.hasSubscription ?? false,
      pending
    })
    await this.openPending()
  }
  private async apply(result: unknown): Promise<boolean> {
    const config = this.requireConfig()
    if (
      !record(result) ||
      !Array.isArray(result.grants) ||
      result.grants.length > 1000 ||
      typeof result.hasSubscription !== 'boolean'
    )
      throw unavailable()
    // Authenticate the entire batch before applying any record. The service cannot
    // inject a grant from another environment, issuer, channel or edition.
    const signed = result.grants.map((value) => verifyGrant(value))
    if (
      signed.some(
        (value) => value.grant.issuer !== config.issuer || value.grant.channel !== 'direct'
      ) ||
      new Set(signed.map((value) => value.grant.purchaseRef)).size !== signed.length
    )
      throw unavailable()
    for (const grant of signed) await this.access.acceptGrant(grant)
    return result.hasSubscription
  }
  private async claim(): Promise<void> {
    this.requireConfig()
    const pending = this.vault?.pending
    if (!pending || pending.expiresAt <= Date.now())
      throw new DirectFailure(
        'The browser session has expired. Start a new restore session; your completed purchase is preserved by the merchant.'
      )
    const result = await this.request('/v1/session/claim', { sessionId: pending.id }, pending.claim)
    if (record(result) && exact(result, ['ready']) && result.ready === false) {
      this.message = 'Payment or restore is still pending. Finish in the browser, then check again.'
      return
    }
    if (
      !record(result) ||
      !exact(result, ['ready', 'grants', 'hasSubscription']) ||
      result.ready !== true
    )
      throw unavailable()
    const hasSubscription = await this.apply(result)
    const previous = this.vault!.credential
    await this.store({
      ...this.vault!,
      credential: pending.credential,
      pending: null,
      hasSubscription
    })
    // Rotation keeps the same customer's purchase, while the previous connection
    // cannot outlive a successful replacement unnecessarily.
    if (previous && previous !== pending.credential)
      await this.request('/v1/disconnect', {}, previous).catch(() => {})
    this.message =
      'Purchase connection restored and signed access updated. Keep the recovery code from your browser for replacement computers.'
  }
  private async refresh(): Promise<void> {
    this.requireConfig()
    if (!this.vault?.credential) throw new DirectFailure('Restore a purchase connection first.')
    const result = await this.request('/v1/access', {}, this.vault.credential)
    if (!record(result) || !exact(result, ['grants', 'hasSubscription'])) throw unavailable()
    const hasSubscription = await this.apply(result)
    await this.store({ ...this.vault, hasSubscription })
    this.message =
      'Signed purchase access refreshed. Cancellation and refund decisions follow the current verified merchant record.'
  }
  private async manage(): Promise<void> {
    const config = this.requireConfig()
    if (!this.vault?.credential) throw new DirectFailure('Restore a purchase connection first.')
    const result = await this.request('/v1/manage', {}, this.vault.credential)
    if (
      !record(result) ||
      !exact(result, ['url']) ||
      typeof result.url !== 'string' ||
      result.url.length > 4096
    )
      throw unavailable()
    const url = new URL(result.url),
      host =
        config.environment === 'sandbox'
          ? 'sandbox-customer-portal.paddle.com'
          : 'customer-portal.paddle.com'
    if (
      url.protocol !== 'https:' ||
      url.hostname !== host ||
      url.port ||
      url.username ||
      url.password
    )
      throw unavailable()
    await shell.openExternal(url.href)
    this.message =
      'Subscription management opened in your browser. Buying lifetime access does not automatically cancel recurring billing.'
  }
  private async disconnect(): Promise<void> {
    const credential = this.vault?.credential
    let remote = !credential
    if (credential) {
      try {
        await this.request('/v1/disconnect', {}, credential)
        remote = true
      } catch {
        /* Local secret removal must also work offline. */
      }
    }
    await this.store(null)
    this.broken = false
    this.message = `Purchase connection cleared from this computer. Cached signed licenses and all projects remain. This does not cancel billing.${remote ? '' : ' The service could not confirm remote token revocation; contact purchase support for remote disconnection.'}`
  }
  register(): void {
    for (const [kind, channel] of Object.entries(DIRECT_CHANNELS))
      ipcMain.handle(channel, async (event, payload: unknown) => {
        if (
          !isTrustedSender(event, this.owner(), this.devOrigin) ||
          !record(payload) ||
          !isId(payload.requestId)
        )
          return projectFailure('', 'DENIED')
        const requestId = payload.requestId
        if (
          kind === 'begin'
            ? !exact(payload, ['requestId', 'input']) || !isDirectAction(payload.input)
            : !isInfoRequest(payload)
        )
          return projectFailure(requestId, 'VALIDATION')
        if (kind === 'read') {
          await this.load()
          return { ok: true, requestId, value: this.view() }
        }
        if (this.busy)
          return {
            ok: true,
            requestId,
            value: {
              ...this.view(),
              message: 'A purchase action is already in progress. Wait for it to finish.'
            }
          }
        this.busy = true
        try {
          await this.load()
          if (kind === 'begin') await this.begin(payload.input as DirectAction)
          else if (kind === 'resume') await this.openPending()
          else if (kind === 'claim') await this.claim()
          else if (kind === 'refresh') await this.refresh()
          else if (kind === 'manage') await this.manage()
          else if (kind === 'disconnect') await this.disconnect()
        } catch (error) {
          this.message =
            error instanceof DirectFailure
              ? error.publicMessage
              : 'Purchase access could not be updated safely. Keep your recovery code and retry; current writing has been preserved.'
        } finally {
          this.busy = false
        }
        return { ok: true, requestId, value: this.view() }
      })
  }
}
