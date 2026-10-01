import { DatabaseSync } from 'node:sqlite'
import { chmodSync, lstatSync } from 'node:fs'
import { dirname } from 'node:path'

export function openStore(path, config) {
  const root = lstatSync(dirname(path))
  if (!root.isDirectory() || root.isSymbolicLink() || process.platform !== 'win32' && (root.mode & 0o077)) throw new Error('PRIVATE_DATA_DIRECTORY_REQUIRED')
  try { const file = lstatSync(path); if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1) throw new Error('DATABASE_PATH_INVALID') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, allowExtension: false })
  chmodSync(path, 0o600)
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;')
  const version = db.prepare('PRAGMA user_version').get().user_version
  const sqlite = db.prepare('SELECT sqlite_version() version').get().version.split('.').map(Number)
  if (sqlite[0] < 3 || sqlite[0] === 3 && (sqlite[1] < 51 || sqlite[1] === 51 && sqlite[2] < 3)) throw new Error('SQLITE_UPGRADE_REQUIRED')
  if (version === 0) {
    if (db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().length) throw new Error('UNKNOWN_SERVICE_DATABASE')
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), environment TEXT NOT NULL, issuer TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, claim_hash TEXT NOT NULL, browser_hash TEXT NOT NULL, credential_hash TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL, transaction_id TEXT, customer_id TEXT, claimed INTEGER NOT NULL DEFAULT 0, creating INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE credentials (hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE recovery (hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL);
      CREATE TABLE purchases (reference TEXT PRIMARY KEY, customer_id TEXT NOT NULL, revision INTEGER NOT NULL, envelope TEXT NOT NULL);
      CREATE TABLE events (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, occurred_at TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, retry_after INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE issuer_keys (key_id TEXT PRIMARY KEY, public_key TEXT NOT NULL);
      CREATE INDEX customer_purchases ON purchases(customer_id);
      CREATE INDEX pending_events ON events(state);
      PRAGMA user_version=1;
      COMMIT;`)
  } else if (version !== 1) throw new Error('SERVICE_MIGRATION_REQUIRED_PRESERVE_DATABASE')
  const identity = db.prepare('SELECT * FROM identity WHERE singleton=1').get()
  if (!identity) db.prepare('INSERT INTO identity VALUES (1,?,?)').run(config.environment, config.issuer)
  else if (identity.environment !== config.environment || identity.issuer !== config.issuer) throw new Error('SERVICE_DATABASE_IDENTITY_MISMATCH')
  const knownKey = db.prepare('SELECT public_key FROM issuer_keys WHERE key_id=?').get(config.keyId)
  if (knownKey && knownKey.public_key !== config.publicKey) throw new Error('SIGNING_KEY_ID_REUSE')
  if (!knownKey) db.prepare('INSERT INTO issuer_keys VALUES (?,?)').run(config.keyId, config.publicKey)
  db.exec('PRAGMA journal_mode=WAL;')
  return db
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try { const result = work(); db.exec('COMMIT'); return result }
  catch (error) { db.exec('ROLLBACK'); throw error }
}

// A single service process owns reconciliation. Provider fetches and commits for
// a customer cannot interleave or publish an older in-flight result afterward.
export function serialQueue() {
  let tail = Promise.resolve()
  return work => { const next = tail.then(work); tail = next.catch(() => {}); return next }
}
