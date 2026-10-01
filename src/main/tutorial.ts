import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DocumentPayload } from '../domain/editor/schema'
import { ProjectError } from '../domain/projects/errors'
import type { OpenInput, OpenProject, ProjectCommand, ProjectValue } from '../shared/projects'
import type { SourceMetadata, SourcesView } from '../shared/sources'
import type { StorageWorker } from './storage-worker'
import { bundledResources } from './resources'

const sampleTitle = 'Sample: The Lantern Library'
const sourceTitle = 'The Lantern Library: fictional source note'
const opening = 'A reading room can preserve more than books.'
const metadata: SourceMetadata = {
  type: 'report', title: sourceTitle,
  author: [{ family: 'Vale', given: 'Mira', literal: '' }], issued: '2024',
  containerTitle: '', publisher: 'Bellweather Community Archive (fictional)',
  edition: '', volume: '', issue: '', page: '', DOI: '', URL: '', ISBN: '', ISSN: ''
}

async function command<T extends ProjectValue>(storage: StorageWorker, value: ProjectCommand): Promise<T> {
  const result = await storage.request(randomUUID(), value)
  if (!result.ok) throw new ProjectError(result.error.code)
  return result.value as T
}

/** Production onboarding content. The main process alone invokes these commands. */
export async function seedTutorial(storage: StorageWorker, scope: OpenInput): Promise<OpenProject> {
  let project = await command<OpenProject>(storage, { kind: 'open', input: scope })
  // Once a writer renames the sample, opening it must not try to provision it again.
  if (project.title !== 'Untitled project') return project
  if (project.template !== 'article') throw new ProjectError('OPERATION_CONFLICT')

  const sources = await command<SourcesView>(storage, { kind: 'sources', input: scope })
  let source = sources.sources.find(item => item.metadata.title === sourceTitle)
  if (!source) {
    const id = randomUUID()
    const created = await command<SourcesView>(storage, {
      kind: 'sourceChange', input: { ...scope, operationId: randomUUID(),
        change: { type: 'create', id, metadata, verified: false, documentIds: [project.documentId] } }
    })
    source = created.sources.find(item => item.id === id)
  }
  if (!source) throw new ProjectError('UNAVAILABLE')
  if (!source.attachments.some(item => item.name === 'lantern-library.txt')) {
    await command<SourcesView>(storage, {
      kind: 'sourceAttach', input: { ...scope, operationId: randomUUID(),
        token: randomUUID(), sourceId: source.id,
        sourcePath: join(bundledResources(), 'tutorial/lantern-library.txt'), originalName: 'lantern-library.txt' }
    })
  }

  project = await command<OpenProject>(storage, { kind: 'section', input: { ...scope, documentId: project.documentId } })
  const isEmpty = project.payload.ast.content.length === 1 && project.payload.ast.content[0].type === 'paragraph' && !project.payload.ast.content[0].content?.length
  if (isEmpty) {
    const payload: DocumentPayload = { schemaVersion: 1, footnotesById: {}, ast: { type: 'doc', content: [
      { type: 'heading', attrs: { blockId: randomUUID(), level: 1 }, content: [{ type: 'text', text: 'The Lantern Library' }] },
      { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: opening }] },
      { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [
        { type: 'text', text: 'In a fictional town, volunteers opened a reading room in an old depot ' },
        { type: 'citation', attrs: { citationId: randomUUID(), items: [{ sourceId: source.id }] } },
        { type: 'text', text: '. This source suggests a place to start, but does not establish the room’s effect on local records.' }
      ] },
      { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: 'Research question: How could several independent sources support or challenge a claim about shared neighborhood history?' }] }
    ] } }
    await command(storage, { kind: 'commit', input: { ...scope, operationId: randomUUID(), documentId: project.documentId, expectedRevisionId: project.revisionId, payload } })
    project = await command<OpenProject>(storage, { kind: 'section', input: { ...scope, documentId: project.documentId } })
  } else if (!JSON.stringify(project.payload).includes(opening)) {
    // An interrupted setup may have been edited by a person. Keep that writing intact.
    throw new ProjectError('OPERATION_CONFLICT')
  }
  return command<OpenProject>(storage, { kind: 'rename', input: { scope, operationId: randomUUID(), expectedHead: project.headCommitId, title: sampleTitle } })
}
