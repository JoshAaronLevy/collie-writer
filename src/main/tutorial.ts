import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DocumentPayload } from '../domain/editor/schema'
import { ProjectError } from '../domain/projects/errors'
import type { OpenInput, OpenProject, ProjectCommand, ProjectValue } from '../shared/projects'
import type { SourceMetadata, SourcesView } from '../shared/sources'
import type { StorageWorker } from './storage-worker'
import { bundledResources } from './resources'

const sampleTitle = 'Sample: Evaluating a study'
const sourceTitle = 'Reading time and comprehension: a synthetic study'
const opening = 'A before-and-after difference is a starting point for inquiry, not proof of causation.'
const metadata: SourceMetadata = {
  type: 'report', title: sourceTitle,
  author: [{ family: '', given: '', literal: 'Collie Writer tutorial' }], issued: '2026',
  containerTitle: '', publisher: 'Collie Writer (synthetic teaching material)',
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
  // Resume a partially provisioned older tutorial using its original teaching material.
  // Existing or renamed samples are never upgraded in place.
  const legacy = sources.sources.some(item => item.metadata.title === 'The Lantern Library: fictional source note')
    || JSON.stringify(project.payload).includes('A reading room can preserve more than books.')
  const selectedTitle = legacy ? 'The Lantern Library: fictional source note' : sourceTitle
  const selectedOpening = legacy ? 'A reading room can preserve more than books.' : opening
  const filename = legacy ? 'lantern-library.txt' : 'reading-study.txt'
  const selectedMetadata:SourceMetadata = legacy ? {...metadata,title:selectedTitle,author:[{family:'Vale',given:'Mira',literal:''}],issued:'2024',publisher:'Bellweather Community Archive (fictional)'} : metadata
  let source = sources.sources.find(item => item.metadata.title === selectedTitle)
  if (!source) {
    const id = randomUUID()
    const created = await command<SourcesView>(storage, {
      kind: 'sourceChange', input: { ...scope, operationId: randomUUID(),
        change: { type: 'create', id, metadata:selectedMetadata, verified: false, documentIds: [project.documentId] } }
    })
    source = created.sources.find(item => item.id === id)
  }
  if (!source) throw new ProjectError('UNAVAILABLE')
  if (!source.attachments.some(item => item.name === filename)) {
    await command<SourcesView>(storage, {
      kind: 'sourceAttach', input: { ...scope, operationId: randomUUID(),
        token: randomUUID(), sourceId: source.id,
        sourcePath: join(bundledResources(), `tutorial/${filename}`), originalName: filename }
    })
  }

  project = await command<OpenProject>(storage, { kind: 'section', input: { ...scope, documentId: project.documentId } })
  const isEmpty = project.payload.ast.content.length === 1 && project.payload.ast.content[0].type === 'paragraph' && !project.payload.ast.content[0].content?.length
  if (isEmpty) {
    const payload: DocumentPayload = { schemaVersion: 1, footnotesById: {}, ast: { type: 'doc', content: [
      { type: 'heading', attrs: { blockId: randomUUID(), level: 1 }, content: [{ type: 'text', text: legacy ? 'The Lantern Library' : 'What can this study tell us?' }] },
      { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: selectedOpening }] },
      { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [
        { type: 'text', text: legacy ? 'In a fictional town, volunteers opened a reading room in an old depot ' : 'A synthetic study reports higher average comprehension scores after a reading routine ' },
        { type: 'citation', attrs: { citationId: randomUUID(), items: [{ sourceId: source.id }] } },
        { type: 'text', text: legacy ? '. This source suggests a place to start, but does not establish the room’s effect on local records.' : '. Its small volunteer sample, repeated questions and lack of a comparison group limit the causal claim. The participants and numbers are invented for this tutorial; they are not real research findings.' }
      ] },
      { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: legacy ? 'Research question: How could several independent sources support or challenge a claim about shared neighborhood history?' : 'Research question: What additional evidence would distinguish a reading effect from practice effects or participant selection?' }] }
    ] } }
    await command(storage, { kind: 'commit', input: { ...scope, operationId: randomUUID(), documentId: project.documentId, expectedRevisionId: project.revisionId, payload } })
    project = await command<OpenProject>(storage, { kind: 'section', input: { ...scope, documentId: project.documentId } })
  } else if (!JSON.stringify(project.payload).includes(selectedOpening)) {
    // An interrupted setup may have been edited by a person. Keep that writing intact.
    throw new ProjectError('OPERATION_CONFLICT')
  }
  return command<OpenProject>(storage, { kind: 'rename', input: { scope, operationId: randomUUID(), expectedHead: project.headCommitId, title: legacy ? 'Sample: The Lantern Library' : sampleTitle } })
}
