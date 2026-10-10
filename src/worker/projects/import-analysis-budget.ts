import type Database from 'better-sqlite3'

/** Conservative terminal reservation: capture, raw output, validated proposal and bookkeeping. */
export const MULTIPART_RESERVE = 1024 ** 2
export const ANALYSIS_RESERVE = 2 * 1024 ** 2
export function analysisReservedBytes(
  db: Database.Database,
  projectId: string,
  batchId: string
): number {
  const format = db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as {
    v: number
  }
  if (format.v < 26) return 0
  const row = db
    .prepare(
      `SELECT coalesce(sum(CASE
   WHEN json_extract(c.body,'$.version')=1 THEN ${ANALYSIS_RESERVE}
   WHEN json_extract(r.body,'$.validation')='pending' THEN ${MULTIPART_RESERVE}
   ELSE length(CAST(c.body AS BLOB))+length(CAST(r.body AS BLOB))+8192 END),0) AS n
   FROM import_analysis_captures c JOIN import_analysis_runs r ON r.project_id=c.project_id AND r.capture_id=c.id
   WHERE c.project_id=? AND c.batch_id=?`
    )
    .get(projectId, batchId) as { n: number }
  let plans = 0
  if (format.v >= 27) {
    for (const table of [
      'import_analysis_plans',
      'import_analysis_parts',
      'import_analysis_proposals'
    ]) {
      const sql =
        table === 'import_analysis_plans'
          ? `SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS n FROM ${table} WHERE project_id=? AND batch_id=?`
          : `SELECT coalesce(sum(length(CAST(t.body AS BLOB))),0) AS n FROM ${table} t JOIN import_analysis_plans p ON p.project_id=t.project_id AND p.id=t.plan_id WHERE t.project_id=? AND p.batch_id=?`
      plans += (db.prepare(sql).get(projectId, batchId) as { n: number }).n
    }
  }
  if (format.v >= 28) {
    for (const table of [
      'import_reviews',
      'import_review_revisions',
      'import_review_choices',
      'import_confirmation_manifests',
      'import_confirmation_entries'
    ]) {
      const sql =
        table === 'import_reviews'
          ? `SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS n FROM ${table} WHERE project_id=? AND json_extract(body,'$.batchId')=?`
          : table === 'import_confirmation_entries'
            ? `SELECT coalesce(sum(length(CAST(e.body AS BLOB))),0) AS n FROM ${table} e JOIN import_confirmation_manifests m ON m.project_id=e.project_id AND m.id=e.manifest_id JOIN import_reviews r ON r.project_id=m.project_id AND r.id=m.review_id WHERE e.project_id=? AND json_extract(r.body,'$.batchId')=?`
            : `SELECT coalesce(sum(length(CAST(t.body AS BLOB))${table === 'import_review_revisions' ? '+length(CAST(t.request AS BLOB))' : ''}),0) AS n FROM ${table} t JOIN import_reviews r ON r.project_id=t.project_id AND r.id=t.review_id WHERE t.project_id=? AND json_extract(r.body,'$.batchId')=?`
      plans += (db.prepare(sql).get(projectId, batchId) as { n: number }).n
    }
  }
  if (format.v >= 29) {
    plans += (
      db
        .prepare(
          'SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS n FROM import_receipts WHERE project_id=? AND batch_id=?'
        )
        .get(projectId, batchId) as { n: number }
    ).n
    plans += (
      db
        .prepare(
          'SELECT count(*)*512 AS n FROM import_accepted_items i JOIN import_receipts r ON r.project_id=i.project_id AND r.id=i.receipt_id WHERE i.project_id=? AND r.batch_id=?'
        )
        .get(projectId, batchId) as { n: number }
    ).n
  }
  if (format.v >= 29) {
    for (const table of ['external_conversations', 'imported_content_origins'])
      plans += (
        db
          .prepare(
            `SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS n FROM ${table} WHERE project_id=? AND json_extract(body,'$.batchId')=?`
          )
          .get(projectId, batchId) as { n: number }
      ).n
    plans += (
      db
        .prepare(
          "SELECT coalesce(sum(length(CAST(m.body AS BLOB))),0) AS n FROM external_messages m JOIN external_conversations c ON c.project_id=m.project_id AND c.conversation_id=m.conversation_id WHERE m.project_id=? AND json_extract(c.body,'$.batchId')=?"
        )
        .get(projectId, batchId) as { n: number }
    ).n
    // Literal note bodies are reproducible from pinned originals; reserve their initial SQL payload after later edits too.
    plans += (
      db
        .prepare(
          "SELECT coalesce(sum((SELECT coalesce(sum(json_extract(t.value,'$.units')),0) FROM json_each(o.body,'$.record.texts') t)*6+8192),0) AS n FROM imported_content_origins o WHERE project_id=? AND json_extract(body,'$.batchId')=? AND note_id IS NOT NULL"
        )
        .get(projectId, batchId) as { n: number }
    ).n
  }
  return row.n + plans
}
