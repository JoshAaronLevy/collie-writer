import { hasControlCharacters } from '../../shared/control-characters'
import { shell } from 'electron'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { aiText } from '../../shared/ai'
import { record } from '../../shared/projects'
import type { DirectStage } from '../../shared/ai-direct'
import { OPENAI } from './deployment'
import { openAiRequest, verifyOpenAiToken } from './openai-http'
import {
  issuedClient,
  isPlanTokens,
  planAuthorized,
  type PlanAccount,
  type PlanTokens
} from './direct-credentials'
import { DirectError, directIssue, httpFailure } from './direct-errors'

const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const equal = (a: string, b: string): boolean => {
  const left = Buffer.from(a),
    right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
function invalid(stage: DirectStage): DirectError {
  return new DirectError(directIssue(stage, 'auth-failed', 'invalid-response'))
}
export async function parsePlanTokens(
  value: unknown,
  clientId: string,
  signal: AbortSignal,
  expectedSubject: string | null,
  nonce?: string,
  priorHint?: string | null
): Promise<{ tokens: PlanTokens; subject: string; hint: string; label: string }> {
  if (
    !record(value) ||
    value.token_type !== 'Bearer' ||
    !aiText(value.access_token, 32768) ||
    !value.access_token ||
    typeof value.scope !== 'string' ||
    value.scope.length > 4096 ||
    !Number.isSafeInteger(value.expires_in) ||
    Number(value.expires_in) <= 0 ||
    Number(value.expires_in) > 86400
  )
    throw invalid('identity-validation')
  const hint = typeof value.id_token === 'string' ? value.id_token : priorHint
  if (!hint || hint.length > 32768) throw invalid('identity-validation')
  const access = await verifyOpenAiToken(value.access_token, OPENAI.resource, signal)
  const identity = value.id_token ? await verifyOpenAiToken(hint, clientId, signal) : null
  if (nonce && (!identity || typeof identity.nonce !== 'string' || !equal(identity.nonce, nonce)))
    throw invalid('identity-validation')
  const subject = identity?.sub ?? expectedSubject
  if (
    typeof subject !== 'string' ||
    !subject ||
    access.sub !== subject ||
    access.client_id !== clientId ||
    (expectedSubject !== null && subject !== expectedSubject)
  )
    throw invalid('identity-validation')
  const scopes = [...new Set(value.scope.split(' ').filter(Boolean))]
  if (
    typeof access.scope !== 'string' ||
    scopes.some((s) => !(access.scope as string).split(' ').includes(s))
  )
    throw invalid('identity-validation')
  if (
    scopes.includes('offline_access') &&
    (typeof value.refresh_token !== 'string' || !value.refresh_token)
  )
    throw invalid('identity-validation')
  const earliest = value.earliest_refresh_at ?? 0
  if (!Number.isSafeInteger(earliest) || Number(earliest) < 0) throw invalid('identity-validation')
  const tokens: PlanTokens = {
    access: value.access_token,
    refresh: typeof value.refresh_token === 'string' ? value.refresh_token : null,
    expiresAt: Math.min(Date.now() + Number(value.expires_in) * 1000, Number(access.exp) * 1000),
    earliestRefreshAt: Number(earliest) * 1000,
    scopes
  }
  if (!isPlanTokens(tokens) || signal.aborted) throw invalid('identity-validation')
  const email = identity?.email
  return {
    tokens,
    subject,
    hint,
    label:
      typeof email === 'string' && !hasControlCharacters(email, false, 0x7f)
        ? email.slice(0, 160)
        : 'ChatGPT account'
  }
}

/** OAuth public client. The only browser URL containing a token is OpenAI's
 * documented id_token_hint on reauthorization. No URL or callback is logged. */
export class PlanSignIn {
  readonly abort = new AbortController()
  private server: Server | null = null
  private rejectCode: ((error: DirectError) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  constructor(
    readonly attemptId: string,
    private readonly stage: (value: DirectStage) => void
  ) {}
  cancel(): void {
    this.abort.abort()
    this.rejectCode?.(new DirectError(directIssue('browser-sign-in', 'cancelled', 'cancelled')))
    this.cleanup()
  }
  private cleanup(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.server?.close()
    this.server?.closeAllConnections()
    this.server = null
    this.rejectCode = null
  }
  async run(
    hostId: string,
    account: PlanAccount | undefined,
    retainClient: (id: string) => Promise<void>
  ): Promise<Awaited<ReturnType<typeof parsePlanTokens>>> {
    const state = randomBytes(32).toString('base64url'),
      nonce = randomBytes(32).toString('base64url'),
      verifier = randomBytes(48).toString('base64url')
    let redirect = '',
      accepted = false
    let resolveCode!: (value: { code: string; clientId: string }) => void
    const callback = new Promise<{ code: string; clientId: string }>((resolve, reject) => {
      resolveCode = resolve
      this.rejectCode = reject
    })
    void callback.catch(() => undefined)
    this.server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
      const refuse = (): void => {
        res.writeHead(400)
        res.end('This response could not be accepted. Return to Collie Writer.')
      }
      if (
        !redirect ||
        req.method !== 'GET' ||
        !req.url ||
        req.url.length > 16384 ||
        req.headers.host !== new URL(redirect).host ||
        req.headers.origin ||
        accepted ||
        this.abort.signal.aborted
      ) {
        refuse()
        return
      }
      let url: URL
      try {
        url = new URL(req.url, redirect)
      } catch {
        refuse()
        return
      }
      const q = url.searchParams
      if (
        url.origin !== new URL(redirect).origin ||
        url.pathname !== '/auth/callback' ||
        url.hash ||
        [...q.keys()].some(
          (k) =>
            !['state', 'code', 'client_id', 'scope', 'error', 'error_description', 'iss'].includes(
              k
            )
        ) ||
        [...new Set(q.keys())].some((k) => q.getAll(k).length !== 1) ||
        !equal(q.get('state') ?? '', state) ||
        (q.has('iss') && q.get('iss') !== OPENAI.issuer)
      ) {
        refuse()
        return
      }
      accepted = true
      if (q.has('error')) {
        res.end('Sign-in was not completed. Return to Collie Writer.')
        this.rejectCode?.(
          new DirectError({
            ...httpFailure('browser-sign-in', 400, { error: q.get('error') }).issue,
            httpStatus: null
          })
        )
        return
      }
      const clientId = q.get('client_id') ?? account?.clientId,
        code = q.get('code')
      if (
        !issuedClient(clientId) ||
        (account && clientId !== account.clientId) ||
        !code ||
        code.length > 8192
      ) {
        refuse()
        this.rejectCode?.(invalid('registration'))
        return
      }
      res.end('Return to Collie Writer. The app will finish checking this connection.')
      resolveCode({ code, clientId })
    })
    this.server.headersTimeout = 5000
    this.server.requestTimeout = 10000
    this.server.maxConnections = 8
    try {
      this.stage(account ? 'browser-sign-in' : 'registration')
      await new Promise<void>((resolve, reject) => {
        this.server!.once('error', () => reject(invalid('browser-sign-in')))
        this.server!.listen(0, '127.0.0.1', resolve)
      })
      if (this.abort.signal.aborted)
        throw new DirectError(directIssue('browser-sign-in', 'cancelled', 'cancelled'))
      const address = this.server.address()
      if (!address || typeof address === 'string') throw invalid('browser-sign-in')
      redirect = `http://127.0.0.1:${address.port}/auth/callback`
      this.timer = setTimeout(() => {
        this.rejectCode?.(new DirectError(directIssue('browser-sign-in', 'offline', 'interrupted')))
        this.abort.abort()
        this.cleanup()
      }, 5 * 60000)
      const url = new URL(OPENAI.authorize)
      url.search = new URLSearchParams({
        client_id: account?.clientId ?? 'dynamic_agent_client',
        ext_agent_host_id: `urn:uuid:${hostId}`,
        response_type: 'code',
        redirect_uri: redirect,
        scope: SCOPES,
        resource: OPENAI.resource,
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        ...(!account ? { agent_name_hint: 'Collie Writer' } : {}),
        ...(account?.hint ? { id_token_hint: account.hint } : {}),
        // This button is an explicit reauthorization action. Ask for consent
        // again only when a previously validated grant lacks plan permission.
        ...(account?.tokens && !planAuthorized(account) ? { prompt: 'consent' } : {})
      }).toString()
      this.stage('browser-sign-in')
      await shell.openExternal(url.href, { activate: true })
      const result = await callback
      await retainClient(result.clientId) // Protect the issued ID BEFORE code exchange.
      if (this.abort.signal.aborted)
        throw new DirectError(directIssue('code-exchange', 'cancelled', 'cancelled'))
      this.stage('code-exchange')
      const response = await openAiRequest(
        OPENAI.token,
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: result.clientId,
          code: result.code,
          code_verifier: verifier,
          redirect_uri: redirect,
          resource: OPENAI.resource
        }),
        this.abort.signal
      )
      if (response.status !== 200)
        throw httpFailure('code-exchange', response.status, response.value)
      this.stage('identity-validation')
      return await parsePlanTokens(
        response.value,
        result.clientId,
        this.abort.signal,
        account?.subject ?? null,
        nonce
      )
    } finally {
      this.cleanup()
    }
  }
}
