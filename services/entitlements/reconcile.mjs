import { sign } from 'node:crypto'
import { ServiceError, object, providerId, utc } from './paddle.mjs'
import { transaction } from './store.mjs'

const canonical = grant => JSON.stringify(Object.fromEntries(Object.entries(grant).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
const money = value => {
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) throw new ServiceError('PROVIDER_AMOUNT_INVALID')
  return BigInt(value)
}

export function recognizedTransaction(item, config) {
  if (!object(item) || !providerId(item.id, 'txn') || !providerId(item.customer_id, 'ctm')) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
  if (!Array.isArray(item.items)) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
  const applicable = item.items.filter(line => [config.monthly, config.lifetime].includes(line.price?.id))
  if (!applicable.length) return null
  // Ignore known zero-value completed transactions rather than letting a payment
  // method change block reconciliation of the customer's actual paid periods.
  if (item.status === 'completed' && money(item.details?.totals?.total) === 0n) return null
  if (item.status !== 'completed' || item.currency_code !== 'USD' || item.collection_mode !== 'automatic' || item.items.length !== 1 || applicable[0].quantity !== 1) throw new ServiceError('PURCHASE_REVIEW_REQUIRED')
  const kind = applicable[0].price.id === config.monthly ? 'subscription' : 'lifetime'
  if (kind === 'subscription' && !providerId(item.subscription_id, 'sub') || kind === 'lifetime' && item.subscription_id !== null) throw new ServiceError('PURCHASE_REVIEW_REQUIRED')
  return { reference: kind === 'subscription' ? item.subscription_id : item.id, kind,
    end: kind === 'subscription' ? utc(item.billing_period?.ends_at) : null }
}

function refunded(item, adjustments) {
  let total = 0n
  for (const adjustment of adjustments.filter(a => a.transaction_id === item.id)) {
    if (adjustment.customer_id !== item.customer_id || adjustment.currency_code !== item.currency_code) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
    if (adjustment.status !== 'approved') continue
    if (adjustment.action === 'chargeback') return true
    if (adjustment.action === 'refund') {
      if (adjustment.type === 'full') return true
      total += money(adjustment.totals?.total)
    }
  }
  return total >= money(item.details.totals.total)
}

/** Called only inside the service's single reconciliation queue. No webhook
 * snapshot or client success event is used as payment authority. */
export async function reconcileCustomer(db, paddle, config, customer) {
  if (!providerId(customer, 'ctm')) throw new ServiceError('CUSTOMER_INVALID', 400)
  const payments = await paddle.list(`/transactions?customer_id=${customer}&status=completed&per_page=30`)
  const adjustments = await paddle.list(`/adjustments?customer_id=${customer}&per_page=50`)
  const groups = new Map()
  for (const payment of payments) {
    if (payment.customer_id !== customer) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
    const recognized = recognizedTransaction(payment, config)
    if (!recognized) continue
    const group = groups.get(recognized.reference) ?? { kind: recognized.kind, periods: [], allEnds: [], lifetimeActive: false }
    const reversed = refunded(payment, adjustments)
    if (recognized.kind === 'subscription') { group.allEnds.push(recognized.end); if (!reversed) group.periods.push(recognized.end) }
    else if (!reversed) group.lifetimeActive = true
    groups.set(recognized.reference, group)
  }
  const old = db.prepare('SELECT * FROM purchases WHERE customer_id=?').all(customer)
  if (old.some(row => !groups.has(row.reference))) throw new ServiceError('PURCHASE_HISTORY_INCOMPLETE')
  if (groups.size > 1000) throw new ServiceError('PURCHASE_HISTORY_LIMIT')
  const decisions = []; let hasSubscription = false
  for (const [reference, group] of groups) {
    let dates = {}, status = group.lifetimeActive ? 'active' : 'revoked'
    if (group.kind === 'subscription') {
      const { data: sub } = await paddle.request(`/subscriptions/${reference}`)
      if (sub.customer_id !== customer || sub.id !== reference || !['active', 'past_due', 'canceled', 'paused', 'trialing'].includes(sub.status)) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
      hasSubscription ||= ['active', 'past_due'].includes(sub.status)
      const paidThrough = [...(group.periods.length ? group.periods : group.allEnds)].sort().at(-1)
      if (!paidThrough) throw new ServiceError('PURCHASE_HISTORY_INCOMPLETE')
      // A refunded current period must not turn into fresh grace on an older period.
      const newestPaid = [...group.allEnds].sort().at(-1)
      const renewing = ['active', 'past_due'].includes(sub.status) && sub.scheduled_change?.action !== 'cancel' && paidThrough === newestPaid
      const graceUntil = new Date(Date.parse(paidThrough) + (renewing ? 14 * 86400000 : 0)).toISOString()
      status = group.periods.length ? 'active' : 'revoked'
      dates = { paidThrough, graceUntil }
    }
    const stable = { schema: 1, keyId: config.keyId, issuer: config.issuer, channel: 'direct', purchaseRef: reference,
      editionId: 'nonfiction', accessKind: group.kind, status, ...dates }
    decisions.push({ reference, stable })
  }
  const grants = transaction(db, () => decisions.map(({ reference, stable }) => {
    const previous = db.prepare('SELECT * FROM purchases WHERE reference=?').get(reference)
    if (previous && previous.customer_id !== customer) throw new ServiceError('PURCHASE_OWNER_CONFLICT')
    const prior = previous ? JSON.parse(previous.envelope) : null
    if (prior) {
      const { revision: _revision, issuedAt: _issuedAt, ...priorStable } = prior.grant
      if (canonical(priorStable) === canonical(stable)) return prior
    }
    const revision = previous ? previous.revision + 1 : 1
    if (!Number.isSafeInteger(revision)) throw new ServiceError('REVISION_LIMIT')
    const grant = { ...stable, revision, issuedAt: new Date().toISOString() }
    const envelope = { grant, signature: sign(null, Buffer.from(canonical(grant)), config.signingKey).toString('base64') }
    db.prepare('INSERT INTO purchases VALUES (?,?,?,?) ON CONFLICT(reference) DO UPDATE SET revision=excluded.revision,envelope=excluded.envelope').run(reference, customer, revision, JSON.stringify(envelope))
    return envelope
  }))
  return { grants, hasSubscription }
}
