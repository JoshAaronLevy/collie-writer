import type Database from 'better-sqlite3'
import type { GraphRecord } from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'

export const alreadyImportedReason =
  'Already imported / Skip. The original accepted material remains in this project.'
export function importIdentity(r: GraphRecord): { key: string; fingerprint: string } {
  // Strong exporter IDs survive another export; local-only records require the same original bytes/location.
  const key = requestDigest(
    r.externalId && ['conversation', 'message'].includes(r.kind)
      ? [r.kind, r.originNamespace, r.identityId]
      : [r.kind, r.locator.sha256, r.locator.pointer]
  )
  const fingerprint = requestDigest({
    kind: r.kind,
    namespace: r.originNamespace,
    externalId: r.externalId,
    conversation: r.externalConversationId,
    label: r.label,
    role: r.role,
    contentType: r.contentType,
    path: r.path,
    disposition: r.disposition,
    facts: r.facts,
    unknownFields: r.unknownFields,
    texts: r.texts.map((t) => ({ sha256: t.sha256, units: t.units }))
  })
  return { key, fingerprint }
}
export function acceptedIdentities(db: Database.Database, p: string): Map<string, string> {
  const version = (
    db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number }
  ).v
  if (version < 29) return new Map()
  return new Map(
    (
      db
        .prepare('SELECT identity_key,fingerprint FROM import_accepted_items WHERE project_id=?')
        .all(p) as { identity_key: string; fingerprint: string }[]
    ).map((r) => [r.identity_key, r.fingerprint])
  )
}

export function importBatchAccepted(db: Database.Database, p: string, batchId: string): boolean {
  const version = (
    db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number }
  ).v
  return (
    version >= 29 &&
    !!db.prepare('SELECT 1 FROM import_receipts WHERE project_id=? AND batch_id=?').get(p, batchId)
  )
}
