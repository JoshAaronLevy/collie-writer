// Production support operation, never a test/fixture or synthetic paid grant.
// Run only after verifying the customer's ownership using the merchant record.
import { randomBytes, createHash } from 'node:crypto'
import { configuration } from './config.mjs'
import { openStore, transaction } from './store.mjs'
import { Paddle, providerId } from './paddle.mjs'
import { reconcileCustomer } from './reconcile.mjs'

process.umask(0o077)
const [action, customer, acknowledgment] = process.argv.slice(2)
if (!['replace-code', 'disconnect-devices'].includes(action) || !providerId(customer, 'ctm') || acknowledgment !== '--ownership-confirmed') throw new Error('VERIFIED_OWNER_AND_EXPLICIT_ACTION_REQUIRED')
const config = configuration(), db = openStore(config.database, config)
try {
  const purchases = await reconcileCustomer(db, new Paddle(config), config, customer)
  if (!purchases.grants.length) throw new Error('NO_PURCHASE_RECORD')
  const output = transaction(db, () => {
    db.prepare('DELETE FROM sessions WHERE customer_id=?').run(customer)
    if (action === 'disconnect-devices') {
      db.prepare('DELETE FROM credentials WHERE customer_id=?').run(customer)
      return 'Purchase connections disconnected. Cached signed grants remain governed by their signed terms.\n'
    } else {
      const code = `cw_${randomBytes(32).toString('base64url')}`
      db.prepare('DELETE FROM recovery WHERE customer_id=?').run(customer)
      db.prepare('INSERT INTO recovery VALUES (?,?)').run(createHash('sha256').update(code).digest('hex'), customer)
      // Intentional one-time operator output; use a private terminal with logging off.
      return `${code}\n`
    }
  })
  process.stdout.write(output)
} finally { db.close() }
