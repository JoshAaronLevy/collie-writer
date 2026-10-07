import { isEditableKind } from '../../shared/outline'
import { readProjectDetails } from '../projects/details'
import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExportOptions, ExportPreview } from '../../shared/exports'
import type { Compilation, Frozen } from '../../domain/compilation/model'
import { compileManuscript } from '../../domain/compilation/model'
import { ContentError } from '../../domain/editor/schema'
import { effectiveState, type RetainedDocument } from '../../shared/outline'
import { ProjectError } from '../../domain/projects/errors'
import { createCitationFormatter } from '../citations/processor'
import { requestDigest } from '../storage/digest'
import { contained } from '../storage/files'
import { manuscript } from '../projects/manuscript'
import { citationOccurrences } from '../projects/citation-occurrences'
import { readSources, toCsl } from '../projects/sources'
import { projectCitationFiles } from '../projects/citation-assets'
import type { ManagedImage } from './assets'

export type PreparedExport = {
  preview: ExportPreview
  model: Frozen<Compilation> | null
  images: Map<string, ManagedImage>
}
export async function prepareExport(
  db: Database.Database,
  workspace: string,
  resources: string,
  input: ExportOptions
): Promise<PreparedExport> {
  const snapshot = manuscript(db, input.projectId),
    sources = readSources(db, input.projectId)
  const details = readProjectDetails(db, input.projectId)
  const title = (
    db.prepare('SELECT title FROM projects WHERE id=?').get(input.projectId) as { title: string }
  ).title
  const metadata = {
    title,
    subtitle: details.subtitle,
    byline: details.byline,
    description: input.includeDescription ? details.description : null
  }
  const rows = new Map(snapshot.documents.map((d) => [d.id, d]))
  const selected: RetainedDocument[] = input.documentIds.map((id) => {
    const row = rows.get(id)
    if (!row || !isEditableKind(row.kind) || effectiveState(row, snapshot.documents) !== 'active')
      throw new ProjectError('VALIDATION')
    return row
  })
  const style =
    (
      db.prepare('SELECT style FROM citation_settings WHERE project_id=?').get(input.projectId) as
        { style: 'apa' | 'chicago' } | undefined
    )?.style ?? 'apa'
  const preview: ExportPreview = {
    headCommitId: sources.headCommitId,
    digest: requestDigest({
      compilationVersion: 5,
      head: sources.headCommitId,
      style,
      paper: input.paper,
      documentIds: input.documentIds,
      titlePage: input.titlePage,
      metadata
    }),
    style,
    paper: input.paper,
    sections: selected.map((d) => ({
      documentId: d.id,
      title: d.title,
      blocks: d.payload.ast.content.length
    })),
    counts: { paragraphs: 0, tables: 0, images: 0, footnotes: 0, citations: 0, bibliography: 0 },
    issues: [],
    losses: []
  }
  const record = new Map(sources.sources.map((s) => [s.id, s])),
    used = new Set<string>(),
    imageIds = new Map<string, string>()
  for (const doc of selected) {
    for (const occurrence of citationOccurrences(doc.payload)) {
      preview.counts.citations++
      for (const item of occurrence.items) {
        const source = record.get(item.sourceId)
        if (!source || source.state !== 'active') {
          preview.issues.push({
            kind: 'reference',
            documentId: doc.id,
            message: `Citation ${occurrence.citationId} points to a missing, merged or trashed source (${item.sourceId}). Repair the citation before export.`
          })
          continue
        }
        used.add(source.id)
        const m = source.metadata,
          missing: string[] = []
        if (!m.author.length) missing.push('author')
        if (!m.issued) missing.push('date')
        if (['article-journal', 'chapter'].includes(m.type) && !m.containerTitle)
          missing.push('journal or book title')
        if (['book', 'chapter', 'report'].includes(m.type) && !m.publisher)
          missing.push('publisher')
        if (m.type === 'webpage' && !m.URL) missing.push('URL')
        if (!source.verified) missing.push('human metadata review')
        if (missing.length)
          preview.issues.push({
            kind: 'metadata',
            documentId: doc.id,
            message: `${m.title}: review ${missing.join(', ')}.`
          })
      }
    }
    function visit(value: unknown): void {
      if (!value || typeof value !== 'object') return
      if (
        'type' in value &&
        value.type === 'image' &&
        'attrs' in value &&
        value.attrs &&
        typeof value.attrs === 'object' &&
        'assetId' in value.attrs &&
        typeof value.attrs.assetId === 'string'
      )
        imageIds.set(value.attrs.assetId, doc.id)
      for (const child of Object.values(value))
        if (child && typeof child === 'object')
          Array.isArray(child) ? child.forEach(visit) : visit(child)
    }
    visit(doc.payload.ast)
  }
  if (preview.issues.length > 100000 || imageIds.size > 10000)
    throw new ProjectError('LIMIT_EXCEEDED')
  const images = new Map<string, ManagedImage>()
  let imageBytes = 0
  for (const [assetId, documentId] of imageIds) {
    const row = db
      .prepare('SELECT media_type,byte_size,sha256 FROM managed_assets WHERE project_id=? AND id=?')
      .get(input.projectId, assetId) as
      { media_type: string; byte_size: number; sha256: string } | undefined
    if (
      !row ||
      !['image/png', 'image/jpeg'].includes(row.media_type) ||
      row.byte_size > 25 * 1024 * 1024 ||
      imageBytes + row.byte_size > 256 * 1024 * 1024
    ) {
      preview.issues.push({
        kind: 'asset',
        documentId,
        message: `Image ${assetId} is missing or exceeds DOCX limits.`
      })
      continue
    }
    const path = join(workspace, 'blobs', row.sha256)
    try {
      await contained(workspace, path, false)
      const stat = await lstat(path)
      if (stat.size !== row.byte_size) throw new Error('size')
      const bytes = await readFile(path)
      if (
        bytes.length !== row.byte_size ||
        createHash('sha256').update(bytes).digest('hex') !== row.sha256
      )
        throw new Error('hash')
      images.set(assetId, { mediaType: row.media_type as ManagedImage['mediaType'], bytes })
      imageBytes += bytes.length
    } catch {
      preview.issues.push({
        kind: 'asset',
        documentId,
        message: `Image ${assetId} is unavailable or changed. Restore it before export.`
      })
    }
  }
  if (preview.issues.some((i) => i.kind !== 'metadata')) return { preview, model: null, images }
  try {
    const assets = await projectCitationFiles(workspace, resources)
    const styleAsset = assets.find(
      (a) => a.ref.id === (style === 'apa' ? 'apa-7' : 'chicago-18-notes-bibliography')
    )!
    const locale = assets.find((a) => a.ref.id === 'en-US')!
    const formatter = await createCitationFormatter(
      resources,
      style,
      sources.sources
        .filter((s) => used.has(s.id))
        .map((s) => toCsl(s.id, s.metadata) as unknown as Record<string, unknown>),
      { xml: await readFile(styleAsset.path, 'utf8'), locale: await readFile(locale.path, 'utf8') }
    )
    const included = new Set(selected.map((d) => d.id)),
      emitted = new Set<string>()
    const sections = selected.map((d, index) => {
      const ancestors: RetainedDocument[] = []
      let parent = d.parentId
      while (parent) {
        const found = rows.get(parent)
        if (!found) throw new ProjectError('CORRUPT_PROJECT')
        ancestors.unshift(found)
        parent = found.parentId
      }
      const headings = ancestors.flatMap((a, depth) => {
        if (included.has(a.id) || emitted.has(a.id)) return []
        emitted.add(a.id)
        return [{ id: a.id, title: a.title, level: Math.min(3, depth + 1) as 1 | 2 | 3 }]
      })
      const titleLevel = Math.min(3, ancestors.length + 1) as 1 | 2 | 3
      if (
        ancestors.length >= 3 &&
        !preview.losses.includes(
          'Outline headings deeper than level three use heading style three; all selected writing is included.'
        )
      )
        preview.losses.push(
          'Outline headings deeper than level three use heading style three; all selected writing is included.'
        )
      return {
        documentId: d.id,
        title: d.title,
        includeTitle: true,
        pageBreakBefore: index > 0,
        payload: d.payload,
        headings,
        titleLevel
      }
    })
    const model = compileManuscript(
      {
        metadata,
        titlePage: input.titlePage,
        capturedHead: preview.headCommitId,
        style,
        paper: input.paper,
        sections
      },
      formatter
    )
    for (const section of model.sections)
      for (const block of section.blocks) {
        if (block.kind === 'paragraph') preview.counts.paragraphs++
        if (block.kind === 'table') preview.counts.tables++
        if (block.kind === 'image') preview.counts.images++
      }
    preview.counts.footnotes = model.footnotes.length
    preview.counts.bibliography = model.bibliography.bibliography.length
    return { preview, model, images }
  } catch (error) {
    const message =
      error instanceof ContentError
        ? `${error.code} at ${error.location}`
        : 'The selected content could not be compiled without loss.'
    preview.issues.push({ kind: 'content', documentId: selected[0].id, message })
    return { preview, model: null, images }
  }
}
