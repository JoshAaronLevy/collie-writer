import { importPlanTables, importReviewTables, importCommitTables } from './schema'
import { validatePortableProofreading } from '../projects/proofreading'
import { validatePortableImports, validateImportArtifactFiles } from '../projects/import-sessions'
import { validatePortableConversations } from '../projects/conversations'
import { isProjectTemplate, kindForTemplate } from '../../domain/projects/templates'
import { readProjectDetails } from '../projects/details'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { manuscript, reconcileAnchors, validateManuscript } from '../projects/manuscript'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { backupStorageDatabase, inWriteTransaction, openStorageDatabase } from './driver'
import {
  PROJECT_SCHEMA_VERSION,
  assetTable,
  outlineTables,
  noteTables,
  sourceTables,
  inspectionTables,
  evidenceTables,
  citationTables,
  interchangeTables,
  projectDetailsTable,
  projectDetailsTableV15,
  conversationTables,
  memoryTable,
  knowledgeTable,
  researchTable,
  conversationSourcesTable,
  importTables,
  importGraphTables,
  externalConversationTables,
  importedContentTable,
  importAnalysisTables,
  proofreadingTables,
  inspectVersion,
  validateProjectSchema
} from './schema'
import { contained, directory, syncFile, syncDirectory, writeJson } from './files'
import { ProjectError } from '../../domain/projects/errors'

import { rebuildCitations } from '../projects/citation-occurrences'
import { seedOutline } from '../projects/manuscript'

type Migration = {
  from: number
  to: number
  validateSource: (db: Database.Database) => void
  apply: (db: Database.Database) => void
}
// Stage 4 schema 1 is retained untouched; only its verified candidate receives the asset inventory.
const migrations: readonly Migration[] = [
  {
    from: 1,
    to: 2,
    validateSource: (db) => validateProjectSchema(db, 1),
    apply: (db) => {
      db.exec(assetTable)
      db.prepare('UPDATE format SET schema_version=2,minimum_reader=2').run()
    }
  },
  {
    from: 2,
    to: 3,
    validateSource: (db) => validateProjectSchema(db, 2),
    apply: (db) => {
      for (const sql of outlineTables) db.exec(sql)
      seedOutline(db)
      db.prepare('UPDATE format SET schema_version=3,minimum_reader=3').run()
    }
  },
  {
    from: 3,
    to: 4,
    validateSource: (db) => validateProjectSchema(db, 3),
    apply: (db) => {
      for (const sql of noteTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=4,minimum_reader=4').run()
    }
  },
  {
    from: 4,
    to: 5,
    validateSource: (db) => validateProjectSchema(db, 4),
    apply: (db) => {
      for (const sql of sourceTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=5,minimum_reader=5').run()
    }
  },
  {
    from: 5,
    to: 6,
    validateSource: (db) => validateProjectSchema(db, 5),
    apply: (db) => {
      for (const sql of inspectionTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=6,minimum_reader=6').run()
    }
  },
  {
    from: 6,
    to: 7,
    validateSource: (db) => validateProjectSchema(db, 6),
    apply: (db) => {
      for (const sql of evidenceTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=7,minimum_reader=7').run()
    }
  },
  {
    from: 7,
    to: 8,
    validateSource: (db) => validateProjectSchema(db, 7),
    apply: (db) => {
      for (const sql of citationTables) db.exec(sql)
      for (const p of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        rebuildCitations(db, p.id)
      db.prepare('UPDATE format SET schema_version=8,minimum_reader=8').run()
    }
  },
  {
    from: 8,
    to: 9,
    validateSource: (db) => validateProjectSchema(db, 8),
    apply: (db) => {
      for (const sql of interchangeTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=9,minimum_reader=9').run()
    }
  },
  {
    from: 9,
    to: 10,
    validateSource: (db) => validateProjectSchema(db, 9),
    apply: (db) => {
      db.exec(projectDetailsTable)
      const insert = db.prepare('INSERT INTO project_details VALUES (?,?,?,?,?)')
      for (const row of db.prepare('SELECT id,template,head_commit_id FROM projects').all() as {
        id: string
        template: unknown
        head_commit_id: string
      }[]) {
        if (!isProjectTemplate(row.template)) throw new ProjectError('CORRUPT_PROJECT')
        insert.run(row.id, '', '', kindForTemplate(row.template), row.head_commit_id)
        readProjectDetails(db, row.id)
      }
      db.prepare('UPDATE format SET schema_version=10,minimum_reader=10').run()
    }
  },
  {
    from: 10,
    to: 11,
    validateSource: (db) => validateProjectSchema(db, 10),
    apply: (db) => {
      for (const sql of conversationTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=11,minimum_reader=11').run()
    }
  },
  {
    from: 11,
    to: 12,
    validateSource: (db) => validateProjectSchema(db, 11),
    apply: (db) => {
      for (const sql of proofreadingTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=12,minimum_reader=12').run()
    }
  },
  {
    from: 12,
    to: 13,
    validateSource: (db) => {
      validateProjectSchema(db, 12)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    // Only the reader floor changes. Historical attempts retain their exact
    // version/provider; new direct attempts use a distinct portable version.
    apply: (db) => {
      db.prepare('UPDATE format SET schema_version=13,minimum_reader=13').run()
    }
  },
  {
    from: 13,
    to: 14,
    validateSource: (db) => validateProjectSchema(db, 13),
    apply: (db) => {
      const snapshots = (db.prepare('SELECT id FROM projects').all() as { id: string }[]).map(
        ({ id }) => ({ id, snapshot: manuscript(db, id) })
      )
      db.prepare('UPDATE format SET schema_version=14,minimum_reader=14').run()
      for (const { id, snapshot } of snapshots) {
        const original = new Map(snapshot.anchors.map((anchor) => [anchor.id, anchor]))
        snapshot.version = 2
        reconcileAnchors(snapshot)
        validateManuscript(snapshot)
        const addAnchor = db.prepare('INSERT INTO anchor_targets VALUES (?,?,?,?,?,?,?)')
        const addEditorId = db.prepare('INSERT INTO editor_ids VALUES (?,?,?,?)')
        for (const anchor of snapshot.anchors) {
          const previous = original.get(anchor.id)
          if (previous) {
            if (
              previous.documentId !== anchor.documentId ||
              previous.kind !== anchor.kind ||
              previous.state !== anchor.state ||
              previous.replacementId !== anchor.replacementId
            )
              throw new ProjectError('CORRUPT_PROJECT')
            continue
          }
          addAnchor.run(
            id,
            anchor.id,
            anchor.documentId,
            anchor.kind,
            anchor.state,
            anchor.replacementId,
            anchor.label
          )
          if (anchor.state !== 'deleted')
            addEditorId.run(id, anchor.id, anchor.documentId, anchor.kind)
        }
        // Bodies, revisions, history bytes and original operation digests stay untouched.
      }
    }
  },
  {
    from: 14,
    to: 15,
    validateSource: (db) => {
      validateProjectSchema(db, 14)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        readProjectDetails(db, row.id)
    },
    apply: (db) => {
      // Only the retained candidate is changed, inside the migration transaction.
      // Recreate from app-owned DDL so old-version SQL validation stays exact.
      const rows = db.prepare('SELECT * FROM project_details').all() as {
        project_id: string
        byline: string
        description: string
        kind: string
        revision_id: string
      }[]
      db.exec('DROP TABLE project_details')
      db.exec(projectDetailsTableV15)
      const insert = db.prepare('INSERT INTO project_details VALUES (?,?,?,?,?,?)')
      for (const row of rows)
        insert.run(row.project_id, '', row.byline, row.description, row.kind, row.revision_id)
      db.prepare('UPDATE format SET schema_version=15,minimum_reader=15').run()
    }
  },
  {
    from: 15,
    to: 16,
    validateSource: (db) => {
      validateProjectSchema(db, 15)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      // Retained candidate only; no changes to IDs, receipts, messages or capture digests.
      db.exec('ALTER TABLE conversations ADD COLUMN origin_document_id TEXT')
      db.prepare('UPDATE format SET schema_version=16,minimum_reader=16').run()
    }
  },
  {
    from: 16,
    to: 17,
    validateSource: (db) => {
      validateProjectSchema(db, 16)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      // Reader floor for v2 automatic captures. Original rows and digests are untouched.
      db.prepare('UPDATE format SET schema_version=17,minimum_reader=17').run()
    }
  },
  {
    from: 17,
    to: 18,
    validateSource: (db) => {
      validateProjectSchema(db, 17)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      db.exec(memoryTable)
      db.prepare('UPDATE format SET schema_version=18,minimum_reader=18').run()
    }
  },
  {
    from: 18,
    to: 19,
    validateSource: (db) => {
      validateProjectSchema(db, 18)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      db.exec(knowledgeTable)
      db.prepare('UPDATE format SET schema_version=19,minimum_reader=19').run()
    }
  },
  {
    from: 19,
    to: 20,
    validateSource: (db) => {
      validateProjectSchema(db, 19)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      db.exec(researchTable)
      db.prepare('UPDATE format SET schema_version=20,minimum_reader=20').run()
    }
  },
  {
    from: 20,
    to: 21,
    validateSource: (db) => {
      validateProjectSchema(db, 20)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      db.exec(conversationSourcesTable)
      db.prepare('UPDATE format SET schema_version=21,minimum_reader=21').run()
    }
  },
  {
    from: 21,
    to: 22,
    validateSource: (db) => {
      validateProjectSchema(db, 21)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, row.id)
    },
    apply: (db) => {
      for (const sql of importTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=22,minimum_reader=22').run()
    }
  },
  {
    from: 22,
    to: 23,
    validateSource: (db) => {
      validateProjectSchema(db, 22)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, row.id)
    },
    apply: (db) => {
      for (const sql of importGraphTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=23,minimum_reader=23').run()
    }
  },
  {
    from: 23,
    to: 24,
    validateSource: (db) => {
      validateProjectSchema(db, 23)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[]) {
        validatePortableImports(db, row.id)
        validatePortableConversations(db, row.id)
      }
    },
    apply: (db) => {
      for (const sql of externalConversationTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=24,minimum_reader=24').run()
    }
  },
  {
    from: 24,
    to: 25,
    validateSource: (db) => {
      validateProjectSchema(db, 24)
      for (const row of db.prepare('SELECT id FROM projects').all() as { id: string }[]) {
        validatePortableImports(db, row.id)
        validatePortableConversations(db, row.id)
      }
    },
    apply: (db) => {
      db.exec(importedContentTable)
      db.prepare('UPDATE format SET schema_version=25,minimum_reader=25').run()
    }
  },
  {
    from: 25,
    to: 26,
    validateSource: (db) => {
      validateProjectSchema(db, 25)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, r.id)
    },
    apply: (db) => {
      for (const sql of importAnalysisTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=26,minimum_reader=26').run()
    }
  },
  {
    from: 26,
    to: 27,
    validateSource: (db) => {
      validateProjectSchema(db, 26)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, r.id)
    },
    apply: (db) => {
      for (const sql of importPlanTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=27,minimum_reader=27').run()
    }
  },
  {
    from: 27,
    to: 28,
    validateSource: (db) => {
      validateProjectSchema(db, 27)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, r.id)
    },
    apply: (db) => {
      for (const sql of importReviewTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=28,minimum_reader=28').run()
    }
  },
  {
    from: 28,
    to: 29,
    validateSource: (db) => {
      validateProjectSchema(db, 28)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, r.id)
    },
    apply: (db) => {
      for (const sql of importCommitTables) db.exec(sql)
      db.prepare('UPDATE format SET schema_version=29,minimum_reader=29').run()
    }
  },
  {
    from: 29,
    to: 30,
    validateSource: (db) => {
      validateProjectSchema(db, 29)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableConversations(db, r.id)
    },
    apply: (db) => {
      db.prepare('UPDATE format SET schema_version=30,minimum_reader=30').run()
    }
  },
  {
    from: 30,
    to: 31,
    validateSource: (db) => {
      validateProjectSchema(db, 30)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, r.id)
    },
    apply: (db) => {
      db.prepare('UPDATE format SET schema_version=31,minimum_reader=31').run()
    }
  },
  {
    from: 31,
    to: 32,
    validateSource: (db) => {
      validateProjectSchema(db, 31)
      for (const r of db.prepare('SELECT id FROM projects').all() as { id: string }[])
        validatePortableImports(db, r.id)
    },
    apply: (db) => {
      db.prepare('UPDATE format SET schema_version=32,minimum_reader=32').run()
    }
  }
]

export async function activeDatabase(root: string, workspace: string): Promise<string> {
  let file = 'working.sqlite'
  try {
    const pointer = join(workspace, 'active.json')
    await contained(root, pointer, false)
    const value: unknown = JSON.parse(await readFile(pointer, 'utf8'))
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 1 ||
      !('file' in value) ||
      typeof value.file !== 'string' ||
      !/^working(?:-v\d+-[a-f0-9-]{36})?\.sqlite$/.test(value.file)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    file = value.file
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
      throw error
  }
  const path = join(workspace, file)
  await contained(root, path, false)
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await contained(root, path + suffix, false).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  return path
}

/** Caller holds the project owner lock throughout. Switch a pointer, never replace the original DB. */
export async function openProjectDatabase(
  root: string,
  workspace: string,
  nativeBinding?: string
): Promise<Database.Database> {
  let path = await activeDatabase(root, workspace)
  const source = new Database(path, {
    nativeBinding,
    readonly: true,
    fileMustExist: true,
    timeout: 5000
  })
  try {
    let version = inspectVersion(source)
    if (version === PROJECT_SCHEMA_VERSION) validateProjectSchema(source)
    else {
      const first = migrations.find((step) => step.from === version)
      if (!first) throw new ProjectError('MIGRATION_FAILED')
      first.validateSource(source)
      const retained = join(workspace, 'migrations')
      await directory(root, retained)
      const original = join(retained, `before-v${version}-${randomUUID()}.sqlite`)
      await backupStorageDatabase(source, original, nativeBinding)
      await syncFile(original)
      await syncDirectory(retained)
      const candidateName = `working-v${PROJECT_SCHEMA_VERSION}-${randomUUID()}.sqlite`
      const candidatePath = join(workspace, candidateName)
      await backupStorageDatabase(source, candidatePath, nativeBinding)
      const candidate = openStorageDatabase(candidatePath, nativeBinding)
      try {
        inWriteTransaction(candidate, () => {
          while (version < PROJECT_SCHEMA_VERSION) {
            const step = migrations.find((m) => m.from === version)
            if (!step || step.to <= version) throw new ProjectError('MIGRATION_FAILED')
            step.validateSource(candidate)
            step.apply(candidate)
            version = step.to
            candidate.pragma(`user_version = ${version}`)
          }
        })
        validateProjectSchema(candidate)
        for (const row of candidate.prepare('SELECT id FROM projects').all() as { id: string }[]) {
          manuscript(candidate, row.id)
          readProjectDetails(candidate, row.id)
          validatePortableConversations(candidate, row.id)
          validatePortableProofreading(candidate, row.id)
          await validateImportArtifactFiles(
            root,
            workspace,
            validatePortableImports(candidate, row.id)
          )
        }
        candidate.pragma('wal_checkpoint(TRUNCATE)')
      } finally {
        candidate.close()
      }
      // Backups and candidate remain on any failure. Publication follows verified copy completion.
      await syncFile(candidatePath)
      await syncDirectory(workspace)
      await writeJson(join(workspace, 'active.json'), { file: candidateName })
      path = candidatePath
    }
  } finally {
    source.close()
  }
  const db = openStorageDatabase(path, nativeBinding)
  try {
    validateProjectSchema(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
