import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'

export const PROJECT_APPLICATION_ID = 1129270359
export const PROJECT_SCHEMA_VERSION = 32
// Persisted schema is app-owned; never execute DDL or migrations supplied by a project.
export const projectTablesV1 = [
  `CREATE TABLE format (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, minimum_reader INTEGER NOT NULL, editor_version INTEGER NOT NULL) STRICT`,
  `CREATE TABLE commits (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,parent_id) REFERENCES commits(project_id,id)) STRICT`,
  `CREATE TABLE projects (id TEXT PRIMARY KEY, template TEXT NOT NULL, title TEXT NOT NULL, locale TEXT NOT NULL, head_commit_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(id,head_commit_id) REFERENCES commits(project_id,id)) STRICT`,
  `CREATE TABLE documents (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, synopsis TEXT NOT NULL, revision_id TEXT NOT NULL, editor_version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,parent_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE domain_operations (project_id TEXT NOT NULL, operation_id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(project_id,operation_id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE editor_ids (project_id TEXT NOT NULL, id TEXT NOT NULL, document_id TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`
] as const
export const assetTable = `CREATE TABLE managed_assets (project_id TEXT NOT NULL, id TEXT NOT NULL, original_name TEXT NOT NULL, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK(byte_size>=0), sha256 TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`
export const outlineTables = [
  `CREATE TABLE history_content (project_id TEXT NOT NULL, id TEXT NOT NULL, content TEXT NOT NULL, byte_size INTEGER NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE outline_state (project_id TEXT NOT NULL, document_id TEXT NOT NULL, state TEXT NOT NULL, replacement_id TEXT, PRIMARY KEY(project_id,document_id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id), FOREIGN KEY(project_id,replacement_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE anchor_targets (project_id TEXT NOT NULL, id TEXT NOT NULL, document_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, replacement_id TEXT, label TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id), FOREIGN KEY(project_id,replacement_id) REFERENCES anchor_targets(project_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`,
  `CREATE TABLE history_checkpoints (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, head_commit_id TEXT NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, title TEXT NOT NULL, snapshot TEXT NOT NULL, byte_size INTEGER NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,head_commit_id) REFERENCES commits(project_id,id)) STRICT`
] as const
export const projectTablesV2 = [...projectTablesV1, assetTable] as const
export const projectTablesV3 = [...projectTablesV2, ...outlineTables] as const
export const noteTables = [
  `CREATE TABLE notes (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE note_revisions (project_id TEXT NOT NULL, note_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,note_id,revision_id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id)) STRICT`,
  `CREATE TABLE note_links (project_id TEXT NOT NULL, note_id TEXT NOT NULL, document_id TEXT NOT NULL, PRIMARY KEY(project_id,note_id,document_id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE note_labels (project_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, normalized TEXT NOT NULL, state TEXT NOT NULL, revision_id TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE note_label_links (project_id TEXT NOT NULL, note_id TEXT NOT NULL, label_id TEXT NOT NULL, PRIMARY KEY(project_id,note_id,label_id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id), FOREIGN KEY(project_id,label_id) REFERENCES note_labels(project_id,id)) STRICT`,
  `CREATE TABLE annotations (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, document_id TEXT NOT NULL, block_id TEXT NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, quote TEXT NOT NULL, interpretation TEXT NOT NULL, state TEXT NOT NULL, anchor_state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE annotation_revisions (project_id TEXT NOT NULL, annotation_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,annotation_id,revision_id), FOREIGN KEY(project_id,annotation_id) REFERENCES annotations(project_id,id)) STRICT`
] as const
export const projectTablesV4 = [...projectTablesV3, ...noteTables] as const
export const sourceTables = [
  `CREATE TABLE sources (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, metadata TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','trashed','merged')), replacement_id TEXT, verified INTEGER NOT NULL CHECK(verified IN (0,1)), provenance TEXT NOT NULL, raw_import TEXT, unknown_fields TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,replacement_id) REFERENCES sources(project_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`,
  `CREATE TABLE source_revisions (project_id TEXT NOT NULL, source_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,source_id,revision_id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)) STRICT`,
  `CREATE TABLE source_aliases (project_id TEXT NOT NULL, alias TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(project_id,alias), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)) STRICT`,
  `CREATE TABLE source_links (project_id TEXT NOT NULL, source_id TEXT NOT NULL, document_id TEXT NOT NULL, PRIMARY KEY(project_id,source_id,document_id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE source_attachments (project_id TEXT NOT NULL, id TEXT NOT NULL, source_id TEXT NOT NULL, asset_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','removed')), created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES managed_assets(project_id,id)) STRICT`,
  `CREATE TABLE source_import_reports (project_id TEXT NOT NULL, id TEXT NOT NULL, format TEXT NOT NULL, report TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE source_import_records (project_id TEXT NOT NULL, report_id TEXT NOT NULL, record_index INTEGER NOT NULL, raw_record TEXT NOT NULL, unknown_fields TEXT NOT NULL, action TEXT NOT NULL, source_id TEXT, error TEXT, PRIMARY KEY(project_id,report_id,record_index), FOREIGN KEY(project_id,report_id) REFERENCES source_import_reports(project_id,id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`
] as const
export const projectTablesV5 = [...projectTablesV4, ...sourceTables] as const
export const inspectionTables = [
  `CREATE TABLE source_versions (project_id TEXT NOT NULL, id TEXT NOT NULL, source_id TEXT NOT NULL, attachment_id TEXT NOT NULL, sha256 TEXT NOT NULL, media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','text/plain')), metadata_snapshot TEXT NOT NULL, extractor_version TEXT, status TEXT NOT NULL CHECK(status IN ('pending','extracting','indexed','partial','no_text','failed','password_required','unsupported')), document_title TEXT NOT NULL, document_author TEXT NOT NULL, total_pages INTEGER, revision_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,attachment_id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,attachment_id) REFERENCES source_attachments(project_id,id)) STRICT`,
  `CREATE TABLE source_version_selections (project_id TEXT NOT NULL, source_id TEXT NOT NULL, version_id TEXT NOT NULL, PRIMARY KEY(project_id,source_id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,version_id) REFERENCES source_versions(project_id,id)) STRICT`,
  `CREATE TABLE source_pages (project_id TEXT NOT NULL, version_id TEXT NOT NULL, page_index INTEGER NOT NULL CHECK(page_index>=0), label TEXT, state TEXT NOT NULL CHECK(state IN ('text','no_text','failed')), text TEXT NOT NULL, text_hash TEXT NOT NULL, error TEXT, PRIMARY KEY(project_id,version_id,page_index), FOREIGN KEY(project_id,version_id) REFERENCES source_versions(project_id,id)) STRICT`,
  `CREATE TABLE source_excerpts (project_id TEXT NOT NULL, id TEXT NOT NULL, version_id TEXT NOT NULL, page_index INTEGER, representation_hash TEXT, start_offset INTEGER, end_offset INTEGER, quote TEXT NOT NULL, context_before TEXT NOT NULL, context_after TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('extracted','transcription','correction')), label TEXT NOT NULL, supersedes_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,version_id) REFERENCES source_versions(project_id,id), FOREIGN KEY(project_id,supersedes_id) REFERENCES source_excerpts(project_id,id)) STRICT`
] as const
export const projectTablesV6 = [...projectTablesV5, ...inspectionTables] as const
export const evidenceTables = [
  `CREATE TABLE research_questions (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','archived')), document_id TEXT, note_id TEXT, document_revision_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id)) STRICT`,
  `CREATE TABLE research_claims (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','archived')), document_id TEXT, note_id TEXT, document_revision_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id)) STRICT`,
  `CREATE TABLE evidence_links (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, identity_key TEXT NOT NULL, source_id TEXT NOT NULL, excerpt_id TEXT, claim_id TEXT, document_id TEXT, target_revision_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('support','challenge','background','potential_use')), origin TEXT NOT NULL CHECK(origin='human'), review TEXT NOT NULL CHECK(review IN ('reviewed','needs_review')), state TEXT NOT NULL CHECK(state IN ('active','removed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,identity_key), CHECK((claim_id IS NULL) != (document_id IS NULL)), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,excerpt_id) REFERENCES source_excerpts(project_id,id), FOREIGN KEY(project_id,claim_id) REFERENCES research_claims(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`,
  `CREATE TABLE research_decisions (project_id TEXT NOT NULL, question_id TEXT NOT NULL, source_id TEXT NOT NULL, revision_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('candidate','kept','rejected')), reason TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin='human'), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,question_id,source_id), FOREIGN KEY(project_id,question_id) REFERENCES research_questions(project_id,id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)) STRICT`,
  `CREATE TABLE research_revisions (project_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK(entity_type IN ('question','claim','link','decision')), entity_key TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,entity_type,entity_key,revision_id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`
] as const
export const projectTablesV7 = [...projectTablesV6, ...evidenceTables] as const
export const citationTables = [
  `CREATE TABLE citation_settings (project_id TEXT PRIMARY KEY, style TEXT NOT NULL CHECK(style IN ('apa','chicago')), profile TEXT NOT NULL CHECK(profile='csl-v1'), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE citation_occurrences (project_id TEXT NOT NULL, document_id TEXT NOT NULL, citation_id TEXT NOT NULL, item_index INTEGER NOT NULL CHECK(item_index>=0), source_id TEXT NOT NULL, footnote_id TEXT, item TEXT NOT NULL, PRIMARY KEY(project_id,citation_id,item_index), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`
] as const
export const projectTablesV8 = [...projectTablesV7, ...citationTables] as const
export const interchangeTables = [
  `CREATE TABLE compilation_recipes (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, name TEXT NOT NULL, document_ids TEXT NOT NULL, paper TEXT NOT NULL CHECK(paper IN ('Letter','A4')), formats TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE compilation_recipe_revisions (project_id TEXT NOT NULL, recipe_id TEXT NOT NULL, revision_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,recipe_id,revision_id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE interchange_imports (project_id TEXT NOT NULL, id TEXT NOT NULL, document_id TEXT NOT NULL, original_name TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('markdown','text')), sha256 TEXT NOT NULL, original_bytes BLOB, losses TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,document_id) REFERENCES documents(project_id,id)) STRICT`
] as const
export const projectTablesV9 = [...projectTablesV8, ...interchangeTables] as const
export const projectDetailsTable = `CREATE TABLE project_details (project_id TEXT PRIMARY KEY, byline TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL, revision_id TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`
export const projectTablesV10 = [...projectTablesV9, projectDetailsTable] as const
export const conversationTables = [
  `CREATE TABLE conversations (project_id TEXT NOT NULL, id TEXT NOT NULL, revision_id TEXT NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','archived')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE ai_captures (project_id TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,conversation_id) REFERENCES conversations(project_id,id)) STRICT`,
  `CREATE TABLE conversation_attempts (project_id TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, capture_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,capture_id), FOREIGN KEY(project_id,conversation_id) REFERENCES conversations(project_id,id), FOREIGN KEY(project_id,capture_id) REFERENCES ai_captures(project_id,id)) STRICT`,
  `CREATE TABLE conversation_messages (project_id TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, attempt_id TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>=0), role TEXT NOT NULL CHECK(role IN ('user','assistant')), revision_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,conversation_id,ordinal), UNIQUE(project_id,attempt_id,role), FOREIGN KEY(project_id,conversation_id) REFERENCES conversations(project_id,id), FOREIGN KEY(project_id,attempt_id) REFERENCES conversation_attempts(project_id,id)) STRICT`
] as const
export const projectTablesV11 = [...projectTablesV10, ...conversationTables] as const
export const proofreadingTables = [
  `CREATE TABLE proofreading_captures (project_id TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`,
  `CREATE TABLE proofreading_runs (project_id TEXT NOT NULL, id TEXT NOT NULL, capture_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,capture_id), FOREIGN KEY(project_id,capture_id) REFERENCES proofreading_captures(project_id,id)) STRICT`,
  `CREATE TABLE proofreading_findings (project_id TEXT NOT NULL, id TEXT NOT NULL, run_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,run_id) REFERENCES proofreading_runs(project_id,id)) STRICT`,
  `CREATE TABLE proofreading_decisions (project_id TEXT NOT NULL, operation_id TEXT NOT NULL, finding_id TEXT NOT NULL, revision_id TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('pending','ignored','accepted')), decided_at TEXT NOT NULL, checkpoint_id TEXT, PRIMARY KEY(project_id,operation_id), FOREIGN KEY(project_id,finding_id) REFERENCES proofreading_findings(project_id,id), FOREIGN KEY(project_id,operation_id) REFERENCES domain_operations(project_id,operation_id), FOREIGN KEY(project_id,checkpoint_id) REFERENCES history_checkpoints(project_id,id)) STRICT`
] as const
// Frozen SQL for schemas 12-14: never require subtitle in an old archive image.
export const projectTablesV14 = [...projectTablesV11, ...proofreadingTables] as const
export const projectDetailsTableV15 = `CREATE TABLE project_details (project_id TEXT PRIMARY KEY, subtitle TEXT NOT NULL, byline TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL, revision_id TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id)) STRICT`
export const projectTablesV15 = projectTablesV14.map((sql) =>
  sql === projectDetailsTable ? projectDetailsTableV15 : sql
)
// SQLite ADD COLUMN inserts before the table constraints. Keep old DDL frozen.
export const conversationTableV16 = conversationTables[0].replace(
  ', PRIMARY KEY',
  ', origin_document_id TEXT, PRIMARY KEY'
)
export const projectTablesV17 = projectTablesV15.map((sql) =>
  sql === conversationTables[0] ? conversationTableV16 : sql
)
export const memoryTable = `CREATE TABLE conversation_memory (project_id TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('chat','overview')), current INTEGER NOT NULL CHECK(current IN (0,1)), body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,conversation_id) REFERENCES conversations(project_id,id)) STRICT`
export const projectTablesV18 = [...projectTablesV17, memoryTable]
export const knowledgeTable = `CREATE TABLE conversation_context (project_id TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, current INTEGER NOT NULL CHECK(current IN (0,1)), request TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,conversation_id) REFERENCES conversations(project_id,id)) STRICT`
export const projectTablesV19 = [...projectTablesV18, knowledgeTable]
export const researchTable = `CREATE TABLE conversation_research (project_id TEXT NOT NULL, attempt_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,attempt_id), FOREIGN KEY(project_id,attempt_id) REFERENCES conversation_attempts(project_id,id)) STRICT`
export const projectTablesV20 = [...projectTablesV19, researchTable]
export const conversationSourcesTable = `CREATE TABLE conversation_sources (project_id TEXT NOT NULL, operation_id TEXT NOT NULL, attempt_id TEXT NOT NULL, source_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,operation_id), FOREIGN KEY(project_id,attempt_id) REFERENCES conversation_attempts(project_id,id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)) STRICT`
export const projectTablesV21 = [...projectTablesV20, conversationSourcesTable]
export const importTables = [
  `CREATE TABLE import_batches (project_id TEXT NOT NULL, id TEXT NOT NULL, current_revision_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,id,current_revision_id) REFERENCES import_batch_revisions(project_id,batch_id,id) DEFERRABLE INITIALLY DEFERRED) STRICT`,
  `CREATE TABLE import_batch_revisions (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, parent_id TEXT, operation_id TEXT NOT NULL, head_commit_id TEXT NOT NULL, request TEXT NOT NULL, body TEXT NOT NULL, artifact_id TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,batch_id,id), UNIQUE(project_id,operation_id), UNIQUE(project_id,artifact_id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,batch_id,parent_id) REFERENCES import_batch_revisions(project_id,batch_id,id), FOREIGN KEY(project_id,operation_id) REFERENCES domain_operations(project_id,operation_id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,head_commit_id) REFERENCES commits(project_id,id), FOREIGN KEY(project_id,batch_id,artifact_id) REFERENCES import_artifacts(project_id,batch_id,id)) STRICT`,
  `CREATE TABLE import_files (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, asset_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,asset_id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES managed_assets(project_id,id)) STRICT`,
  `CREATE TABLE import_artifacts (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, asset_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,batch_id,id), UNIQUE(project_id,asset_id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES managed_assets(project_id,id)) STRICT`
] as const
export const projectTablesV22 = [...projectTablesV21, ...importTables]
export const importGraphTables = [
  `CREATE TABLE import_graphs (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, revision_id TEXT NOT NULL, source_revision_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,revision_id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,batch_id,revision_id) REFERENCES import_batch_revisions(project_id,batch_id,id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,batch_id,source_revision_id) REFERENCES import_batch_revisions(project_id,batch_id,id)) STRICT`,
  `CREATE TABLE import_graph_pages (project_id TEXT NOT NULL, id TEXT NOT NULL, graph_id TEXT NOT NULL, page_index INTEGER NOT NULL, asset_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,graph_id,page_index), UNIQUE(project_id,asset_id), FOREIGN KEY(project_id,graph_id) REFERENCES import_graphs(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES managed_assets(project_id,id)) STRICT`
] as const
export const projectTablesV23 = [...projectTablesV22, ...importGraphTables]
export const externalConversationTables = [
  `CREATE TABLE external_conversations (project_id TEXT NOT NULL, conversation_id TEXT NOT NULL, graph_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,conversation_id), FOREIGN KEY(project_id,conversation_id) REFERENCES conversations(project_id,id), FOREIGN KEY(project_id,graph_id) REFERENCES import_graphs(project_id,id)) STRICT`,
  `CREATE TABLE external_messages (project_id TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence>=0), body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,conversation_id,sequence), FOREIGN KEY(project_id,conversation_id) REFERENCES external_conversations(project_id,conversation_id)) STRICT`
] as const
export const projectTablesV24 = [...projectTablesV23, ...externalConversationTables]
export const importedContentTable = `CREATE TABLE imported_content_origins (project_id TEXT NOT NULL, id TEXT NOT NULL, graph_id TEXT NOT NULL, record_id TEXT NOT NULL, source_id TEXT, message_id TEXT, note_id TEXT, commit_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,graph_id,record_id), UNIQUE(project_id,note_id), FOREIGN KEY(project_id,graph_id) REFERENCES import_graphs(project_id,id), FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id), FOREIGN KEY(project_id,message_id) REFERENCES external_messages(project_id,id), FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id), FOREIGN KEY(project_id,commit_id) REFERENCES commits(project_id,id)) STRICT`
export const projectTablesV25 = [...projectTablesV24, importedContentTable]
export const importAnalysisTables = [
  `CREATE TABLE import_analysis_captures (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, graph_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,graph_id) REFERENCES import_graphs(project_id,id)) STRICT`,
  `CREATE TABLE import_analysis_runs (project_id TEXT NOT NULL, id TEXT NOT NULL, capture_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,capture_id), FOREIGN KEY(project_id,capture_id) REFERENCES import_analysis_captures(project_id,id)) STRICT`
] as const
export const projectTablesV26 = [...projectTablesV25, ...importAnalysisTables]
export const importPlanTables = [
  `CREATE TABLE import_analysis_plans (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, graph_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,graph_id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,graph_id) REFERENCES import_graphs(project_id,id)) STRICT`,
  `CREATE TABLE import_analysis_parts (project_id TEXT NOT NULL, id TEXT NOT NULL, plan_id TEXT NOT NULL, ordinal INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,plan_id,ordinal), FOREIGN KEY(project_id,plan_id) REFERENCES import_analysis_plans(project_id,id)) STRICT`,
  `CREATE TABLE import_analysis_proposals (project_id TEXT NOT NULL, id TEXT NOT NULL, plan_id TEXT NOT NULL, parent_id TEXT, part_id TEXT NOT NULL, attempt_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,attempt_id), FOREIGN KEY(project_id,plan_id) REFERENCES import_analysis_plans(project_id,id), FOREIGN KEY(project_id,parent_id) REFERENCES import_analysis_proposals(project_id,id), FOREIGN KEY(project_id,part_id) REFERENCES import_analysis_parts(project_id,id), FOREIGN KEY(project_id,attempt_id) REFERENCES import_analysis_runs(project_id,id)) STRICT`,
  `CREATE TABLE import_analysis_plan_state (project_id TEXT NOT NULL, plan_id TEXT NOT NULL, current_proposal_id TEXT, PRIMARY KEY(project_id,plan_id), FOREIGN KEY(project_id,plan_id) REFERENCES import_analysis_plans(project_id,id), FOREIGN KEY(project_id,current_proposal_id) REFERENCES import_analysis_proposals(project_id,id)) STRICT`
]
export const projectTablesV27 = [...projectTablesV26, ...importPlanTables]
export const importReviewTables = [
  `CREATE TABLE import_reviews (project_id TEXT NOT NULL, id TEXT NOT NULL, plan_id TEXT NOT NULL, proposal_id TEXT, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,plan_id) REFERENCES import_analysis_plans(project_id,id), FOREIGN KEY(project_id,proposal_id) REFERENCES import_analysis_proposals(project_id,id)) STRICT`,
  `CREATE TABLE import_review_revisions (project_id TEXT NOT NULL, id TEXT NOT NULL, review_id TEXT NOT NULL, parent_id TEXT, request TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,review_id) REFERENCES import_reviews(project_id,id), FOREIGN KEY(project_id,parent_id) REFERENCES import_review_revisions(project_id,id)) STRICT`,
  `CREATE TABLE import_review_choices (project_id TEXT NOT NULL, review_id TEXT NOT NULL, revision_id TEXT NOT NULL, item_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,revision_id,item_id), FOREIGN KEY(project_id,review_id) REFERENCES import_reviews(project_id,id), FOREIGN KEY(project_id,revision_id) REFERENCES import_review_revisions(project_id,id)) STRICT`,
  `CREATE TABLE import_review_state (project_id TEXT NOT NULL, review_id TEXT NOT NULL, current_revision_id TEXT, current_manifest_id TEXT, PRIMARY KEY(project_id,review_id), FOREIGN KEY(project_id,review_id) REFERENCES import_reviews(project_id,id), FOREIGN KEY(project_id,current_revision_id) REFERENCES import_review_revisions(project_id,id), FOREIGN KEY(project_id,current_manifest_id) REFERENCES import_confirmation_manifests(project_id,id)) STRICT`,
  `CREATE TABLE import_confirmation_manifests (project_id TEXT NOT NULL, id TEXT NOT NULL, review_id TEXT NOT NULL, revision_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,review_id) REFERENCES import_reviews(project_id,id), FOREIGN KEY(project_id,revision_id) REFERENCES import_review_revisions(project_id,id)) STRICT`,
  `CREATE TABLE import_confirmation_entries (project_id TEXT NOT NULL, manifest_id TEXT NOT NULL, item_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,manifest_id,item_id), FOREIGN KEY(project_id,manifest_id) REFERENCES import_confirmation_manifests(project_id,id)) STRICT`
] as const
export const projectTablesV28 = [...projectTablesV27, ...importReviewTables]
export const importCommitTables = [
  `CREATE TABLE import_receipts (project_id TEXT NOT NULL, id TEXT NOT NULL, batch_id TEXT NOT NULL, manifest_id TEXT NOT NULL, operation_id TEXT NOT NULL, head_commit_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,id), UNIQUE(project_id,batch_id), UNIQUE(project_id,manifest_id), UNIQUE(project_id,operation_id), FOREIGN KEY(project_id,batch_id) REFERENCES import_batches(project_id,id), FOREIGN KEY(project_id,manifest_id) REFERENCES import_confirmation_manifests(project_id,id), FOREIGN KEY(project_id,operation_id) REFERENCES domain_operations(project_id,operation_id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(project_id,head_commit_id) REFERENCES commits(project_id,id)) STRICT`,
  `CREATE TABLE import_accepted_items (project_id TEXT NOT NULL, identity_key TEXT NOT NULL, fingerprint TEXT NOT NULL, receipt_id TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY(project_id,identity_key), UNIQUE(project_id,receipt_id,item_id), FOREIGN KEY(project_id,receipt_id) REFERENCES import_receipts(project_id,id)) STRICT`
] as const
export const projectTablesV29 = [...projectTablesV28, ...importCommitTables]
// IM11 changes versioned JSON contracts; schema 30 preserves the schema-29 DDL.
// IU01 changes review JSON contracts only; preserve the schema-30 DDL.
export const projectTablesV30 = [...projectTablesV29]
export const projectTablesV31 = [...projectTablesV30]
// IU04 retains v1 analysis as review v2; DDL stays frozen.
export const projectTables = [...projectTablesV31]
const sqlKey = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

export function createProjectSchema(db: Database.Database): void {
  for (const statement of projectTables) db.exec(statement)
  db.prepare('INSERT INTO format VALUES (1,?,?,?)').run(
    PROJECT_SCHEMA_VERSION,
    PROJECT_SCHEMA_VERSION,
    1
  )
  db.pragma(`application_id = ${PROJECT_APPLICATION_ID}`)
  db.pragma(`user_version = ${PROJECT_SCHEMA_VERSION}`)
}
export function inspectVersion(db: Database.Database): number {
  db.pragma('trusted_schema = OFF')
  if (db.pragma('application_id', { simple: true }) !== PROJECT_APPLICATION_ID)
    throw new ProjectError('CORRUPT_PROJECT')
  const version = db.pragma('user_version', { simple: true }) as number
  if (!Number.isInteger(version) || version < 1) throw new ProjectError('CORRUPT_PROJECT')
  if (version > PROJECT_SCHEMA_VERSION) throw new ProjectError('FORMAT_TOO_NEW')
  return version
}
export function validateProjectSchema(
  db: Database.Database,
  expectedVersion = PROJECT_SCHEMA_VERSION
): void {
  const version = inspectVersion(db)
  if (version !== expectedVersion) throw new ProjectError('MIGRATION_FAILED')
  const objects = db
    .prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { sql: string | null }[]
  const expected = new Set(
    (expectedVersion === 1
      ? projectTablesV1
      : expectedVersion === 2
        ? projectTablesV2
        : expectedVersion === 3
          ? projectTablesV3
          : expectedVersion === 4
            ? projectTablesV4
            : expectedVersion === 5
              ? projectTablesV5
              : expectedVersion === 6
                ? projectTablesV6
                : expectedVersion === 7
                  ? projectTablesV7
                  : expectedVersion === 8
                    ? projectTablesV8
                    : expectedVersion === 9
                      ? projectTablesV9
                      : expectedVersion === 10
                        ? projectTablesV10
                        : expectedVersion === 11
                          ? projectTablesV11
                          : expectedVersion < 15
                            ? projectTablesV14
                            : expectedVersion === 15
                              ? projectTablesV15
                              : expectedVersion < 18
                                ? projectTablesV17
                                : expectedVersion === 18
                                  ? projectTablesV18
                                  : expectedVersion === 19
                                    ? projectTablesV19
                                    : expectedVersion === 20
                                      ? projectTablesV20
                                      : expectedVersion === 21
                                        ? projectTablesV21
                                        : expectedVersion === 22
                                          ? projectTablesV22
                                          : expectedVersion === 23
                                            ? projectTablesV23
                                            : expectedVersion === 24
                                              ? projectTablesV24
                                              : expectedVersion === 25
                                                ? projectTablesV25
                                                : expectedVersion === 26
                                                  ? projectTablesV26
                                                  : expectedVersion === 27
                                                    ? projectTablesV27
                                                    : expectedVersion === 28
                                                      ? projectTablesV28
                                                      : expectedVersion === 29
                                                        ? projectTablesV29
                                                        : expectedVersion === 30
                                                          ? projectTablesV30
                                                          : expectedVersion === 31
                                                            ? projectTablesV31
                                                            : projectTables
    ).map(sqlKey)
  )
  if (
    objects.length !== expected.size ||
    objects.some((o) => !o.sql || !expected.has(sqlKey(o.sql)))
  )
    throw new ProjectError('CORRUPT_PROJECT')
  const format = db.prepare('SELECT * FROM format').all() as {
    schema_version: number
    minimum_reader: number
    editor_version: number
  }[]
  if (
    format.length !== 1 ||
    format[0].minimum_reader > PROJECT_SCHEMA_VERSION ||
    format[0].editor_version > 1
  )
    throw new ProjectError('FORMAT_TOO_NEW')
  if (
    format[0].schema_version !== version ||
    format[0].editor_version !== 1 ||
    format[0].minimum_reader !== expectedVersion
  )
    throw new ProjectError('CORRUPT_PROJECT')
  if (
    db.pragma('integrity_check', { simple: true }) !== 'ok' ||
    (db.pragma('foreign_key_check') as unknown[]).length
  )
    throw new ProjectError('CORRUPT_PROJECT')
}
