export class ServiceError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status }
}
export const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
export const providerId = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[a-z0-9]{26}$`).test(value)
export const utc = value => {
  const stamp = typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? Date.parse(value) : NaN
  if (!Number.isFinite(stamp)) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
  return new Date(stamp).toISOString()
}

export class Paddle {
  constructor(config) { this.config = config; this.origin = config.environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com' }
  async request(path, body) {
    const url = new URL(path, this.origin)
    if (url.origin !== this.origin || url.username || url.password || url.hash) throw new ServiceError('PROVIDER_URL_INVALID')
    try {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', 'Paddle-Version': '1' },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      if (!response.ok || !response.body) throw new ServiceError('PROVIDER_UNAVAILABLE')
      const chunks = []; let bytes = 0
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) throw new ServiceError('PROVIDER_RESPONSE_LIMIT'); chunks.push(chunk) }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!object(result) || !Object.hasOwn(result, 'data')) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
      return result
    } catch (error) { if (error instanceof ServiceError) throw error; throw new ServiceError('PROVIDER_UNAVAILABLE') }
  }
  async list(path) {
    const all = [], seen = new Set()
    for (let page = 0; path && page < 200; page++) {
      const url = new URL(path, this.origin)
      if (seen.has(url.href)) throw new ServiceError('PROVIDER_PAGINATION_INVALID')
      seen.add(url.href)
      const response = await this.request(url.href)
      if (!Array.isArray(response.data) || !object(response.meta?.pagination)) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
      all.push(...response.data)
      path = response.meta.pagination.has_more ? response.meta.pagination.next : null
      if (response.meta.pagination.has_more && typeof path !== 'string') throw new ServiceError('PROVIDER_RESPONSE_INVALID')
    }
    if (path) throw new ServiceError('PURCHASE_HISTORY_LIMIT')
    return all
  }
  async catalog() {
    for (const [id, amount, recurring] of [[this.config.monthly, '999', true], [this.config.lifetime, '19900', false]]) {
      const { data: price } = await this.request(`/prices/${id}`)
      if (!object(price) || price.id !== id || price.status !== 'active' || price.trial_period !== null ||
          price.unit_price?.currency_code !== 'USD' || price.unit_price?.amount !== amount ||
          (price.unit_price_overrides?.length ?? 0) !== 0 ||
          (recurring ? price.billing_cycle?.interval !== 'month' || price.billing_cycle?.frequency !== 1 : price.billing_cycle !== null)) throw new ServiceError('CATALOG_CONFIGURATION_MISMATCH')
    }
  }
  async createCheckout(session, customer) {
    await this.catalog()
    const body = { items: [{ price_id: session.kind === 'monthly' ? this.config.monthly : this.config.lifetime, quantity: 1 }],
      currency_code: 'USD', collection_mode: 'automatic', custom_data: { collie_session: session.id },
      checkout: { url: `${this.config.origin}/connect` } }
    if (customer) body.customer_id = customer
    const { data } = await this.request('/transactions', body)
    if (!providerId(data?.id, 'txn')) throw new ServiceError('PROVIDER_RESPONSE_INVALID')
    return data.id
  }
  async portal(customer) {
    const { data } = await this.request(`/customers/${customer}/portal-sessions`, {})
    const raw = data?.urls?.general?.overview
    if (typeof raw !== 'string') throw new ServiceError('PROVIDER_RESPONSE_INVALID')
    const url = new URL(raw), host = this.config.environment === 'sandbox' ? 'sandbox-customer-portal.paddle.com' : 'customer-portal.paddle.com'
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) throw new ServiceError('PROVIDER_URL_INVALID')
    return url.href
  }
}
