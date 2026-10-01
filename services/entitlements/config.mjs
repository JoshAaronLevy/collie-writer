import { createPrivateKey, createPublicKey } from 'node:crypto'
import { readFileSync, lstatSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export function configuration() {
  const required = name => {
    const value = process.env[name]
    if (!value || value.length > 8192) throw new Error('SERVICE_CONFIGURATION_REQUIRED')
    return value
  }
  const origin = new URL(required('COLLIE_SERVICE_ORIGIN'))
  if (origin.protocol !== 'https:' || origin.href !== `${origin.origin}/` || origin.username || origin.password) throw new Error('SERVICE_ORIGIN_INVALID')
  const environment = required('PADDLE_ENVIRONMENT')
  if (!['sandbox', 'live'].includes(environment)) throw new Error('PADDLE_ENVIRONMENT_INVALID')
  const keyPath = required('COLLIE_SIGNING_KEY_FILE'), database = required('COLLIE_PURCHASE_DATABASE')
  if (!isAbsolute(keyPath) || !isAbsolute(database)) throw new Error('ABSOLUTE_SERVICE_PATH_REQUIRED')
  const keyInfo = lstatSync(keyPath)
  if (!keyInfo.isFile() || keyInfo.isSymbolicLink() || keyInfo.size > 8192 || (process.platform !== 'win32' && (keyInfo.mode & 0o077))) throw new Error('PRIVATE_KEY_PERMISSIONS')
  const signingKey = createPrivateKey(readFileSync(keyPath))
  if (signingKey.asymmetricKeyType !== 'ed25519') throw new Error('ED25519_REQUIRED')
  const keyId = required('COLLIE_SIGNING_KEY_ID'), issuer = required('COLLIE_ISSUER')
  if (![keyId, issuer].every(v => /^[A-Za-z0-9_-]{1,128}$/.test(v))) throw new Error('ISSUER_INVALID')
  const monthly = required('PADDLE_MONTHLY_PRICE_ID'), lifetime = required('PADDLE_LIFETIME_PRICE_ID')
  if (monthly === lifetime || ![monthly, lifetime].every(v => /^pri_[a-z0-9]{26}$/.test(v))) throw new Error('CATALOG_INVALID')
  const clientToken = required('PADDLE_CLIENT_TOKEN')
  if (!clientToken.startsWith(environment === 'sandbox' ? 'test_' : 'live_')) throw new Error('CLIENT_ENVIRONMENT_MISMATCH')
  const supportEmail = required('COLLIE_SUPPORT_EMAIL')
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(supportEmail)) throw new Error('SUPPORT_EMAIL_INVALID')
  const port = Number(process.env.COLLIE_SERVICE_PORT ?? '8787')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SERVICE_PORT_INVALID')
  return {
    origin: origin.origin, environment, database, keyId, issuer, signingKey,
    publicKey: createPublicKey(signingKey).export({ type: 'spki', format: 'pem' }),
    monthly, lifetime, clientToken, apiKey: required('PADDLE_API_KEY'),
    webhookSecret: required('PADDLE_WEBHOOK_SECRET'), supportEmail,
    sellerName: required('COLLIE_LEGAL_SELLER_NAME'), port
  }
}
