import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { configuration } from './config.mjs'
import { checkoutApproved } from './policy.mjs'
import { openStore, serialQueue, transaction } from './store.mjs'
import { Paddle, ServiceError, object, providerId } from './paddle.mjs'
import { reconcileCustomer, recognizedTransaction } from './reconcile.mjs'
import { acceptWebhook } from './webhook.mjs'
import { page } from './pages.mjs'

process.umask(0o077)
const config = configuration(), db = openStore(config.database, config), paddle = new Paddle(config), enqueue = serialQueue()
const hash = value => createHash('sha256').update(value).digest('hex')
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const exact = (value, fields) => object(value) && Object.keys(value).length === fields.length && fields.every(name => Object.hasOwn(value, name))
const bearer = request => { const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? ''); return match?.[1] ?? null }
const reply = (response, value, code = 200) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
function device(request, optional = false) {
  const secret = bearer(request)
  if (!secret && optional && !request.headers.authorization) return null
  const credential = secret && db.prepare('SELECT * FROM credentials WHERE hash=? AND expires>?').get(hash(secret), Date.now())
  if (!credential) throw new ServiceError('CONNECTION_REQUIRED', 401)
  return credential
}
function session(request, body, browser) {
  if (!uuid(body.sessionId)) throw new ServiceError('SESSION_INVALID', 400)
  const secret = bearer(request), found = db.prepare('SELECT * FROM sessions WHERE id=?').get(body.sessionId)
  if (!secret || !found || found.expires < Date.now() || hash(secret) !== found[browser ? 'browser_hash' : 'claim_hash']) throw new ServiceError('SESSION_EXPIRED', 410)
  return found
}
async function settle(found) {
  if (found.kind === 'restore') return found.customer_id
  if (!found.transaction_id) return null
  const { data: payment } = await paddle.request(`/transactions/${found.transaction_id}`)
  if (payment.id !== found.transaction_id || payment.custom_data?.collie_session !== found.id) throw new ServiceError('PURCHASE_SESSION_MISMATCH')
  if (payment.status !== 'completed') return null
  const recognized = recognizedTransaction(payment, config)
  if (!recognized || recognized.kind !== (found.kind === 'monthly' ? 'subscription' : 'lifetime') || found.customer_id && found.customer_id !== payment.customer_id) throw new ServiceError('PURCHASE_SESSION_MISMATCH')
  db.prepare('UPDATE sessions SET customer_id=? WHERE id=?').run(payment.customer_id, found.id)
  return payment.customer_id
}
async function route(request, path, body) {
  if (path.startsWith('/v1/browser/') && request.headers.origin !== config.origin) throw new ServiceError('ORIGIN_DENIED', 403)
  if (!path.startsWith('/v1/browser/') && request.headers.origin) throw new ServiceError('ORIGIN_DENIED', 403)
  if (path === '/v1/sessions') {
    if (!exact(body, ['id', 'claimHash', 'browserHash', 'credentialHash', 'kind']) || !uuid(body.id) || !['monthly', 'lifetime', 'restore'].includes(body.kind) || ![body.claimHash, body.browserHash, body.credentialHash].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) throw new ServiceError('INPUT_INVALID', 400)
    if (body.kind !== 'restore' && !checkoutApproved) throw new ServiceError('CHECKOUT_NOT_APPROVED', 503)
    const account = device(request, true), previous = db.prepare('SELECT * FROM sessions WHERE id=?').get(body.id)
    if (previous) {
      if (previous.claim_hash !== body.claimHash || previous.browser_hash !== body.browserHash || previous.credential_hash !== body.credentialHash || previous.kind !== body.kind || previous.expires < Date.now()) throw new ServiceError('SESSION_CONFLICT', 409)
      return { expiresAt: previous.expires }
    }
    if (db.prepare('SELECT count(*) total FROM sessions').get().total >= 1000) throw new ServiceError('BUSY', 429)
    const expires = Date.now() + 20 * 60000
    db.prepare('INSERT INTO sessions (id,claim_hash,browser_hash,credential_hash,kind,expires,customer_id) VALUES (?,?,?,?,?,?,?)').run(body.id, body.claimHash, body.browserHash, body.credentialHash, body.kind, expires, body.kind === 'restore' ? null : account?.customer_id ?? null)
    return { expiresAt: expires }
  }
  if (path === '/v1/session/claim') {
    if (!exact(body, ['sessionId'])) throw new ServiceError('INPUT_INVALID', 400)
    const found = session(request, body, false), customer = await settle(found)
    if (!customer) return { ready: false }
    const result = await reconcileCustomer(db, paddle, config, customer)
    if (!result.grants.length) throw new ServiceError('NO_PURCHASE_FOUND', 409)
    transaction(db, () => {
      db.prepare('INSERT INTO credentials VALUES (?,?,?) ON CONFLICT(hash) DO UPDATE SET expires=excluded.expires').run(found.credential_hash, customer, Date.now() + 365 * 86400000)
      db.prepare('UPDATE sessions SET claimed=1 WHERE id=?').run(found.id)
    })
    // One claim identity; retries for the same secret return the same device authority.
    return { ready: true, ...result }
  }
  if (path.startsWith('/v1/browser/')) {
    if (!exact(body, path === '/v1/browser/restore' ? ['sessionId', 'recoveryCode'] : ['sessionId'])) throw new ServiceError('INPUT_INVALID', 400)
    const found = session(request, body, true)
    if (path === '/v1/browser/read') return { kind: found.kind, clientToken: config.clientToken, environment: config.environment }
    if (path === '/v1/browser/checkout') {
      if (!checkoutApproved || found.kind === 'restore') throw new ServiceError('CHECKOUT_NOT_APPROVED', 503)
      if (found.transaction_id) return { transactionId: found.transaction_id }
      if (found.creating) throw new ServiceError('CHECKOUT_OUTCOME_UNKNOWN', 409)
      db.prepare('UPDATE sessions SET creating=1 WHERE id=?').run(found.id)
      const id = await paddle.createCheckout(found, found.customer_id)
      db.prepare('UPDATE sessions SET transaction_id=? WHERE id=?').run(id, found.id)
      return { transactionId: id }
    }
    if (path === '/v1/browser/restore') {
      if (found.kind !== 'restore' || found.claimed || typeof body.recoveryCode !== 'string' || !/^cw_[A-Za-z0-9_-]{43}$/.test(body.recoveryCode)) throw new ServiceError('RESTORE_UNAVAILABLE', 403)
      const purchase = db.prepare('SELECT customer_id FROM recovery WHERE hash=?').get(hash(body.recoveryCode))
      if (!purchase || found.customer_id && found.customer_id !== purchase.customer_id) throw new ServiceError('RESTORE_UNAVAILABLE', 403)
      await reconcileCustomer(db, paddle, config, purchase.customer_id)
      db.prepare('UPDATE sessions SET customer_id=? WHERE id=?').run(purchase.customer_id, found.id)
      return { restored: true }
    }
    if (path === '/v1/browser/recovery') {
      if (found.kind === 'restore') throw new ServiceError('INPUT_INVALID', 400)
      const customer = await settle(found)
      if (!customer) return { ready: false }
      const result = await reconcileCustomer(db, paddle, config, customer)
      if (!result.grants.some(item => item.grant.status === 'active')) throw new ServiceError('NO_PAID_PURCHASE', 409)
      const recoveryCode = `cw_${randomBytes(32).toString('base64url')}`
      transaction(db, () => { db.prepare('DELETE FROM recovery WHERE customer_id=?').run(customer); db.prepare('INSERT INTO recovery VALUES (?,?)').run(hash(recoveryCode), customer) })
      return { ready: true, recoveryCode }
    }
    throw new ServiceError('NOT_FOUND', 404)
  }
  if (!exact(body, [])) throw new ServiceError('INPUT_INVALID', 400)
  const credential = device(request)
  if (path === '/v1/access') {
    const result = await reconcileCustomer(db, paddle, config, credential.customer_id)
    db.prepare('UPDATE credentials SET expires=? WHERE hash=?').run(Date.now() + 365 * 86400000, credential.hash)
    return result
  }
  if (path === '/v1/manage') return { url: await paddle.portal(credential.customer_id) }
  if (path === '/v1/disconnect') {
    transaction(db, () => {
      db.prepare('DELETE FROM credentials WHERE hash=?').run(credential.hash)
      db.prepare('DELETE FROM sessions WHERE credential_hash=?').run(credential.hash)
    })
    return { disconnected: true }
  }
  throw new ServiceError('NOT_FOUND', 404)
}

const assets = new Map([
  ['/connect.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/connect.js', import.meta.url))]],
  ['/site.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/site.css', import.meta.url))]]
])
let requests = 0, windowStart = Date.now(), queued = 0
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' https://cdn.paddle.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.paddle.com; frame-src https://*.paddle.com; img-src 'self' data: https://*.paddle.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
  try {
    if (Date.now() - windowStart > 60000) { windowStart = Date.now(); requests = 0 }
    if (++requests > 600 || queued >= 32) throw new ServiceError('BUSY', 429)
    if (request.headers.host !== new URL(config.origin).host) throw new ServiceError('HOST_DENIED', 403)
    const url = new URL(request.url, config.origin)
    if (url.origin !== config.origin || url.search || url.hash) throw new ServiceError('INPUT_INVALID', 400)
    if (request.method === 'GET') {
      const asset = assets.get(url.pathname), html = page(url.pathname, config)
      if (!asset && !html) throw new ServiceError('NOT_FOUND', 404)
      response.setHeader('Content-Type', asset ? asset[0] : 'text/html; charset=utf-8'); response.end(asset ? asset[1] : html); return
    }
    if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json')) throw new ServiceError('INPUT_INVALID', 400)
    const chunks = []; let bytes = 0
    for await (const chunk of request) { bytes += chunk.length; if (bytes > (url.pathname === '/webhooks/paddle' ? 1024 * 1024 : 16384)) throw new ServiceError('BODY_LIMIT', 413); chunks.push(chunk) }
    const raw = Buffer.concat(chunks)
    if (url.pathname === '/webhooks/paddle') {
      acceptWebhook(db, raw, request.headers['paddle-signature'], config.webhookSecret)
      reply(response, { received: true }); void drain().catch(() => {}); return
    }
    let body
    try { body = JSON.parse(raw.toString('utf8')) } catch { throw new ServiceError('INPUT_INVALID', 400) }
    queued++
    try { reply(response, await enqueue(() => route(request, url.pathname, body))) } finally { queued-- }
  } catch (error) {
    // No body, URL, authorization header, provider exception or PII is logged.
    reply(response, { error: error instanceof ServiceError ? error.code : 'SERVICE_UNAVAILABLE' }, error instanceof ServiceError ? error.status : 503)
  }
})
let draining = false
async function drain() {
  if (draining) return
  draining = true
  try {
    const events = db.prepare("SELECT * FROM events WHERE state='pending' AND retry_after<=? ORDER BY retry_after,occurred_at LIMIT 25").all(Date.now())
    for (const event of events) {
      try {
        await enqueue(() => reconcileCustomer(db, paddle, config, event.customer_id))
        db.prepare("UPDATE events SET state='done' WHERE id=?").run(event.id)
      } catch { db.prepare('UPDATE events SET attempts=attempts+1,retry_after=? WHERE id=?').run(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(event.attempts, 6)), event.id) }
    }
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())
    db.prepare('DELETE FROM credentials WHERE expires<?').run(Date.now())
  } finally { draining = false }
}
setInterval(() => { void drain().catch(() => {}) }, 60000).unref()
server.requestTimeout = 15000
server.headersTimeout = 10000
server.listen(config.port, '127.0.0.1', () => { void drain().catch(() => {}) })
