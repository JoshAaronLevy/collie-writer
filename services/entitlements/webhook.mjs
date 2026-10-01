import { createHmac, timingSafeEqual } from 'node:crypto'
import { ServiceError, object, providerId, utc } from './paddle.mjs'

export function acceptWebhook(db, raw, header, secret) {
  if (typeof header !== 'string' || header.length > 2048) throw new ServiceError('WEBHOOK_SIGNATURE', 401)
  const pieces = header.split(';').map(piece => piece.trim().split('='))
  const stamps = pieces.filter(([name]) => name === 'ts'), signatures = pieces.filter(([name]) => name === 'h1').map(([, value]) => value)
  if (stamps.length !== 1 || !/^\d{10,12}$/.test(stamps[0][1]) || Math.abs(Date.now() / 1000 - Number(stamps[0][1])) > 5) throw new ServiceError('WEBHOOK_TIMESTAMP', 401)
  const expected = createHmac('sha256', secret).update(`${stamps[0][1]}:`).update(raw).digest()
  if (!signatures.some(value => /^[a-f0-9]{64}$/i.test(value) && timingSafeEqual(expected, Buffer.from(value, 'hex')))) throw new ServiceError('WEBHOOK_SIGNATURE', 401)
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { throw new ServiceError('WEBHOOK_BODY', 400) }
  if (!object(event) || !providerId(event.event_id, 'evt') || typeof event.event_type !== 'string' || !object(event.data)) throw new ServiceError('WEBHOOK_BODY', 400)
  const occurred = utc(event.occurred_at)
  if (!/^(transaction|subscription|adjustment)\.[a-z_]+$/.test(event.event_type)) return
  if (!providerId(event.data.customer_id, 'ctm')) {
    if (event.event_type.startsWith('transaction.') && event.event_type !== 'transaction.completed' && event.data.customer_id === null) return
    throw new ServiceError('WEBHOOK_CUSTOMER', 400)
  }
  // Deduplication is permanent; raw bodies, addresses and emails never enter this database.
  db.prepare("INSERT INTO events (id,customer_id,occurred_at,state) VALUES (?,?,?,'pending') ON CONFLICT(id) DO NOTHING").run(event.event_id, event.data.customer_id, occurred)
}
