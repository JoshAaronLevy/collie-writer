import { addPdfMetadata } from './pdf-metadata'
import { randomUUID, createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { link, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { crc32 } from 'node:zlib'
import { openPromise } from 'yauzl'
import {
  isExportJob,
  type DestinationFingerprint,
  type ExportJob,
  type WorkerExportStart,
  type WorkerExportBatchStart
} from '../../shared/exports'
import { ProjectError, projectError } from '../../domain/projects/errors'
import { exportFingerprint as fingerprint } from '../../domain/projects/export-path'
import { syncDirectory, writeJson } from '../storage/files'
import { fileHash, requireSpace, withSpaceBudget, errorSpace } from '../projects/streams'
import { storageBytes, type SpaceIssue } from '../../shared/storage-space'
import { exportDocx } from './docx'
import { exportPrintDocument, type PrintDocument } from './html'
import { exportInterchange } from './interchange'
import type { PreparedExport } from './prepare'

function same(a: DestinationFingerprint | null, b: DestinationFingerprint | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new ProjectError('CANCELLED')
}
async function inspectDocx(path: string): Promise<void> {
  const zip = await openPromise(path, {
    autoClose: false,
    lazyEntries: true,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true
  })
  const names = new Set<string>()
  let total = 0
  try {
    if (zip.entryCount > 20000) throw new ProjectError('LIMIT_EXCEEDED')
    for await (const entry of zip.eachEntry()) {
      if (
        names.has(entry.fileName) ||
        entry.isEncrypted() ||
        entry.uncompressedSize > 512 * 1024 * 1024 ||
        (total += entry.uncompressedSize) > 1024 * 1024 * 1024
      )
        throw new ProjectError('VALIDATION')
      names.add(entry.fileName)
      const stream = await zip.openReadStreamPromise(entry)
      let checksum = 0,
        expanded = 0
      for await (const chunk of stream) {
        checksum = crc32(chunk as Buffer, checksum)
        expanded += (chunk as Buffer).length
      }
      if (checksum !== entry.crc32 || expanded !== entry.uncompressedSize)
        throw new ProjectError('VALIDATION')
    }
    if (
      !['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml'].every(
        (name) => names.has(name)
      )
    )
      throw new ProjectError('VALIDATION')
  } finally {
    zip.close()
  }
}
type Running = { job: ExportJob; controller: AbortController; task: Promise<void>; folder: string }
export class ExportJobs {
  private readonly jobs = new Map<string, Running>()
  busy(): boolean {
    return this.jobs.size > 0
  }
  private readonly spaceIssues = new Map<string, SpaceIssue[]>()
  private space(job: ExportJob, issue: SpaceIssue | null): void {
    if (!issue) return
    const retained = this.spaceIssues.get(job.id) ?? []
    this.spaceIssues.set(job.id, [...retained, { ...issue }].slice(-4))
    if (this.spaceIssues.size > 64) this.spaceIssues.delete(this.spaceIssues.keys().next().value!)
  }
  private view(job: ExportJob): ExportJob {
    const space = this.spaceIssues.get(job.id)
    return { ...job, ...(space ? { space: space.map((s) => ({ ...s })) } : {}) }
  }
  constructor(
    private readonly root: string,
    private readonly resources: string,
    private readonly renderPdf?: (
      document: PrintDocument,
      signal: AbortSignal
    ) => Promise<{ bytes: Buffer; pages: number; capturedHead: string }>
  ) {}
  private async persist(running: Running): Promise<void> {
    await writeJson(join(running.folder, 'report.json'), { version: 1, ...running.job })
  }
  async start(
    workspace: string,
    input: WorkerExportStart,
    prepared: PreparedExport
  ): Promise<ExportJob> {
    const { preview, model, images } = prepared
    if (preview.headCommitId !== input.expectedHead || preview.digest !== input.previewDigest)
      throw new ProjectError('STALE_REVISION')
    if (
      !model ||
      preview.issues.some((i) => i.kind !== 'metadata') ||
      (preview.issues.some((i) => i.kind === 'metadata') && !input.acknowledgeMetadata) ||
      preview.losses.length
    )
      throw new ProjectError('VALIDATION')
    const destination = input.destinationPath,
      parent = dirname(destination)
    if (!isAbsolute(destination) || !/\.docx$/i.test(destination) || destination.length > 4096)
      throw new ProjectError('VALIDATION')
    const resolvedParent = await realpath(parent),
      resolvedRoot = await realpath(this.root),
      rel = relative(resolvedRoot, resolvedParent)
    if (!rel.startsWith('..') && !isAbsolute(rel)) throw new ProjectError('UNSAFE_DESTINATION')
    const target = await fingerprint(destination)
    if (!same(target, input.destinationFingerprint)) throw new ProjectError('EXTERNAL_CHANGE')
    const id = randomUUID(),
      folder = join(workspace, 'exports', id)
    await mkdir(join(workspace, 'exports'), { recursive: true, mode: 0o700 })
    await mkdir(folder, { mode: 0o700 })
    const job: ExportJob = {
      id,
      state: 'rendering',
      headCommitId: preview.headCommitId,
      destinationPath: destination,
      phase: 'Rendering DOCX from captured revision',
      error: null,
      reportPath: join(folder, 'report.json'),
      counts: preview.counts,
      losses: preview.losses
    }
    const running: Running = {
      job,
      controller: new AbortController(),
      task: Promise.resolve(),
      folder
    }
    await writeJson(join(folder, 'manifest.json'), {
      version: 1,
      capturedAt: new Date().toISOString(),
      preview,
      acknowledgedMetadata: input.acknowledgeMetadata,
      compilationVersion: model.version,
      metadata: model.metadata,
      titlePage: model.titlePage,
      sourceMap: model.sourceMap,
      imageAssets: [...images].map(([assetId, image]) => ({
        assetId,
        bytes: image.bytes.length,
        sha256: createHash('sha256').update(image.bytes).digest('hex')
      }))
    })
    await this.persist(running)
    this.jobs.set(id, running)
    running.task = new Promise<void>((resolve) =>
      setImmediate(() => {
        void withSpaceBudget('Export DOCX', folder, () =>
          this.render(running, input, model, images)
        ).finally(resolve)
      })
    )
    return { ...job }
  }
  async startBatch(
    workspace: string,
    input: WorkerExportBatchStart,
    prepared: PreparedExport
  ): Promise<ExportJob> {
    const { preview, model, images } = prepared
    if (preview.headCommitId !== input.expectedHead || preview.digest !== input.previewDigest)
      throw new ProjectError('STALE_REVISION')
    if (
      !model ||
      preview.issues.some((i) => i.kind !== 'metadata') ||
      (preview.issues.some((i) => i.kind === 'metadata') && !input.acknowledgeMetadata) ||
      preview.losses.length
    )
      throw new ProjectError('VALIDATION')
    if (input.formats.includes('pdf') && !this.renderPdf) throw new ProjectError('UNAVAILABLE')
    const resolvedRoot = await realpath(this.root)
    for (const target of input.destinations) {
      const extension =
        target.format === 'markdown' ? 'md' : target.format === 'text' ? 'txt' : target.format
      if (
        !isAbsolute(target.path) ||
        !target.path.toLowerCase().endsWith(`.${extension}`) ||
        target.path.length > 4096
      )
        throw new ProjectError('VALIDATION')
      const parent = await realpath(dirname(target.path)),
        rel = relative(resolvedRoot, parent)
      if (!rel.startsWith('..') && !isAbsolute(rel)) throw new ProjectError('UNSAFE_DESTINATION')
    }
    const id = randomUUID(),
      folder = join(workspace, 'exports', id)
    await mkdir(join(workspace, 'exports'), { recursive: true, mode: 0o700 })
    await mkdir(folder, { mode: 0o700 })
    const job: ExportJob = {
      id,
      state: 'rendering',
      headCommitId: preview.headCommitId,
      destinationPath: dirname(input.destinations[0].path),
      phase: 'Rendering captured revision',
      error: null,
      reportPath: join(folder, 'report.json'),
      counts: preview.counts,
      losses: preview.losses,
      files: input.destinations.map((d) => ({
        format: d.format,
        path: d.path,
        state: 'pending',
        error: null,
        bytes: null,
        pages: null,
        losses: []
      }))
    }
    const running: Running = {
      job,
      controller: new AbortController(),
      task: Promise.resolve(),
      folder
    }
    await writeJson(join(folder, 'manifest.json'), {
      version: 2,
      capturedAt: new Date().toISOString(),
      preview,
      formats: input.formats,
      acknowledgedMetadata: input.acknowledgeMetadata,
      compilationVersion: model.version,
      metadata: model.metadata,
      titlePage: model.titlePage,
      sourceMap: model.sourceMap,
      imageAssets: [...images].map(([assetId, image]) => ({
        assetId,
        bytes: image.bytes.length,
        sha256: createHash('sha256').update(image.bytes).digest('hex')
      }))
    })
    await this.persist(running)
    this.jobs.set(id, running)
    running.task = new Promise<void>((resolve) =>
      setImmediate(() => {
        void withSpaceBudget('Export files', folder, () =>
          this.renderBatch(running, input, model, images)
        ).finally(resolve)
      })
    )
    return { ...job }
  }
  private async publishNew(
    destination: string,
    bytes: Buffer,
    signal: AbortSignal,
    onLinked: () => void
  ): Promise<void> {
    cancelled(signal)
    if (await fingerprint(destination)) throw new ProjectError('DESTINATION_EXISTS')
    const parent = dirname(destination),
      temporary = join(parent, `.collie-export-${randomUUID()}.incoming`)
    let ownsTemporary = false
    try {
      await requireSpace(parent, bytes.length)
      const output = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600
      )
      ownsTemporary = true
      try {
        await output.writeFile(bytes)
        await output.sync()
      } finally {
        await output.close()
      }
      cancelled(signal)
      if (await fingerprint(destination)) throw new ProjectError('DESTINATION_EXISTS')
      try {
        await link(temporary, destination)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
          throw new ProjectError('DESTINATION_EXISTS')
        throw error
      }
      // From this point a destination exists, even if cleanup, sync or inspection later fails.
      onLinked()
      // fileHash deliberately rejects multiply linked files. Retire our staging name first;
      // keep the no-overwrite link operation and the untrusted-file protections unchanged.
      await unlink(temporary)
      ownsTemporary = false
      await syncDirectory(parent)
      const actual = await fileHash(destination, 512 * 1024 * 1024)
      if (
        actual.bytes !== bytes.length ||
        actual.sha256 !== createHash('sha256').update(bytes).digest('hex')
      )
        throw new ProjectError('UNAVAILABLE')
    } finally {
      if (ownsTemporary) await unlink(temporary).catch(() => {})
    }
  }
  private async renderBatch(
    running: Running,
    input: WorkerExportBatchStart,
    model: NonNullable<PreparedExport['model']>,
    images: PreparedExport['images']
  ): Promise<void> {
    const { job, controller, folder } = running,
      signal = controller.signal
    let retainedPartialOutput = false
    for (let index = 0; index < input.destinations.length; index++) {
      const target = input.destinations[index],
        file = job.files![index]
      if (signal.aborted) {
        file.state = 'cancelled'
        file.error = 'CANCELLED'
        continue
      }
      const publication = {
        outputLinked: false,
        sidecarCreated: false,
        assetsLinked: 0,
        assetsVerified: 0
      }
      const sidecar = `${input.baseName}-assets-${job.id}`
      try {
        job.phase = `Rendering ${target.format}`
        await this.persist(running)
        if (!same(await fingerprint(target.path), target.fingerprint))
          throw new ProjectError('EXTERNAL_CHANGE')
        if (target.fingerprint) throw new ProjectError('DESTINATION_EXISTS')
        let bytes: Buffer,
          pages: number | null = null,
          assets: { name: string; bytes: Buffer }[] = [],
          losses: string[] = []
        if (target.format === 'docx') {
          bytes = await exportDocx(model, this.resources, async (assetId) => {
            cancelled(signal)
            const image = images.get(assetId)
            if (!image) throw new ProjectError('NOT_FOUND')
            return image
          })
          if (bytes.length > 512 * 1024 * 1024) throw new ProjectError('LIMIT_EXCEEDED')
          await requireSpace(folder, bytes.length * 2)
          const candidate = join(folder, `candidate-${index}.docx`),
            output = await open(candidate, 'wx', 0o600)
          try {
            await output.writeFile(bytes)
            await output.sync()
          } finally {
            await output.close()
          }
          await inspectDocx(candidate)
        } else if (target.format === 'pdf') {
          const document = await exportPrintDocument(model, async (assetId) => {
            cancelled(signal)
            const image = images.get(assetId)
            if (!image) throw new ProjectError('NOT_FOUND')
            return image
          })
          cancelled(signal)
          const printed = await this.renderPdf!(document, signal)
          if (printed.capturedHead !== job.headCommitId) throw new ProjectError('STALE_REVISION')
          bytes = await addPdfMetadata(printed.bytes, model.metadata, signal)
          pages = printed.pages
          if (
            bytes.length < 100 ||
            bytes.subarray(0, 5).toString('ascii') !== '%PDF-' ||
            !bytes.subarray(-2048).toString('ascii').includes('%%EOF')
          )
            throw new ProjectError('VALIDATION')
        } else {
          const result = exportInterchange(model, images, target.format, sidecar)
          bytes = result.bytes
          assets = result.assets
          losses = result.losses
          file.losses = losses
          if (assets.length) {
            await requireSpace(
              dirname(target.path),
              bytes.length + assets.reduce((n, asset) => n + asset.bytes.length, 0)
            )
            const sidecarPath = join(dirname(target.path), sidecar)
            await mkdir(sidecarPath, { mode: 0o700 })
            publication.sidecarCreated = true
            await syncDirectory(dirname(sidecarPath))
            for (const asset of assets) {
              await this.publishNew(join(sidecarPath, asset.name), asset.bytes, signal, () => {
                publication.assetsLinked++
              })
              publication.assetsVerified++
            }
          }
        }
        if (bytes.length > 512 * 1024 * 1024) throw new ProjectError('LIMIT_EXCEEDED')
        cancelled(signal)
        job.state = 'publishing'
        job.phase = `Publishing ${target.format}`
        await this.persist(running)
        await this.publishNew(target.path, bytes, signal, () => {
          publication.outputLinked = true
        })
        if (target.format === 'docx') await inspectDocx(target.path)
        file.state = 'complete'
        file.bytes = bytes.length
        file.pages = pages
        file.losses = losses
      } catch (error) {
        const code = signal.aborted ? 'CANCELLED' : projectError(error)
        file.state = code === 'CANCELLED' ? 'cancelled' : 'failed'
        file.error = code
        const space = errorSpace(error, 'Export files', folder)
        this.space(job, space)
        if (space)
          file.losses.push(
            `Space check: ${space.required === null ? 'additional bytes unknown' : `${storageBytes(space.required)} additional including margin`}; working folder and destination both need space. Review Data and recovery before retrying with the retained result.`
          )
        if (publication.outputLinked) {
          retainedPartialOutput = true
          file.losses.push(
            'The output file was created, but final publication checks did not finish. Inspect the retained file before using it or retrying with a new name.'
          )
        }
        if (publication.sidecarCreated) {
          retainedPartialOutput = true
          file.losses.push(
            `${publication.assetsLinked} image file(s) were created in the adjacent ${sidecar} folder; ${publication.assetsVerified} completed publication checks. These files were retained. Review this folder before retrying.`
          )
        }
      }
      job.losses.push(...file.losses.map((loss) => `${target.format}: ${loss}`))
      job.state = 'rendering'
      await this.persist(running).catch(() => {})
    }
    job.state = job.files!.every((f) => f.state === 'complete')
      ? 'complete'
      : signal.aborted
        ? 'cancelled'
        : 'failed'
    job.error = job.state === 'complete' ? null : signal.aborted ? 'CANCELLED' : 'UNAVAILABLE'
    job.phase =
      job.state === 'complete'
        ? 'All selected files ready'
        : retainedPartialOutput
          ? 'Export stopped; partial output retained. Review each file result.'
          : job.state === 'cancelled'
            ? 'Export cancelled; completed files retained'
            : 'Some files failed; completed files retained'
    await this.persist(running).catch(() => {})
    this.jobs.delete(job.id)
  }
  async status(workspace: string, id: string): Promise<ExportJob> {
    const live = this.jobs.get(id)
    if (live) {
      if (live.folder !== join(workspace, 'exports', id)) throw new ProjectError('DENIED')
      return this.view(live.job)
    }
    const path = join(workspace, 'exports', id, 'report.json')
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      throw new ProjectError('NOT_FOUND')
    }
    if (!raw || typeof raw !== 'object' || !('id' in raw) || raw.id !== id || !('state' in raw))
      throw new ProjectError('CORRUPT_PROJECT')
    const stored = { ...raw } as Record<string, unknown>
    delete stored.version
    if (Object.hasOwn(stored, 'space') || !isExportJob(stored))
      throw new ProjectError('CORRUPT_PROJECT')
    const job = stored
    if (job.state === 'rendering' || job.state === 'publishing') {
      job.state = 'interrupted'
      job.phase = 'Interrupted; inspect retained report and candidate'
      job.error = 'JOB_INTERRUPTED'
      await writeJson(path, { version: 1, ...job })
    }
    return this.view(job)
  }
  async cancel(workspace: string, id: string): Promise<ExportJob> {
    const running = this.jobs.get(id)
    if (!running) return this.status(workspace, id)
    if (running.folder !== join(workspace, 'exports', id)) throw new ProjectError('DENIED')
    if (running.job.state === 'rendering') running.controller.abort()
    return { ...running.job }
  }
  async stop(): Promise<void> {
    for (const job of this.jobs.values()) if (job.job.state === 'rendering') job.controller.abort()
    await Promise.all([...this.jobs.values()].map((j) => j.task))
  }
  private async render(
    running: Running,
    input: WorkerExportStart,
    model: NonNullable<PreparedExport['model']>,
    images: PreparedExport['images']
  ): Promise<void> {
    const { job, folder, controller } = running,
      signal = controller.signal
    const candidate = join(folder, 'candidate.docx'),
      destination = input.destinationPath,
      parent = dirname(destination)
    let temporary: string | null = null,
      previous: string | null = null
    try {
      cancelled(signal)
      const bytes = await exportDocx(model, this.resources, async (assetId) => {
        cancelled(signal)
        const image = images.get(assetId)
        if (!image) throw new ProjectError('NOT_FOUND')
        return image
      })
      cancelled(signal)
      if (bytes.length > 512 * 1024 * 1024) throw new ProjectError('LIMIT_EXCEEDED')
      await requireSpace(folder, bytes.length * 2)
      await requireSpace(parent, bytes.length)
      const output = await open(candidate, 'wx', 0o600)
      try {
        await output.writeFile(bytes)
        await output.sync()
      } finally {
        await output.close()
      }
      await inspectDocx(candidate)
      cancelled(signal)
      job.phase = 'Preparing guarded destination'
      await this.persist(running)
      if (!same(await fingerprint(destination), input.destinationFingerprint))
        throw new ProjectError('EXTERNAL_CHANGE')
      const suffix = `.collie-export-${job.id}`
      temporary = join(parent, `.${job.id}.incoming.docx`)
      const staging = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600
      )
      try {
        await staging.writeFile(bytes)
        await staging.sync()
      } finally {
        await staging.close()
      }
      await inspectDocx(temporary)
      cancelled(signal)
      if (!same(await fingerprint(destination), input.destinationFingerprint))
        throw new ProjectError('EXTERNAL_CHANGE')
      job.state = 'publishing'
      job.phase = 'Replacing selected DOCX'
      await this.persist(running)
      if (input.destinationFingerprint) {
        previous = join(parent, `${destination.split(/[\\/]/).pop()}${suffix}.previous.docx`)
        if (await fingerprint(previous)) throw new ProjectError('DESTINATION_EXISTS')
        await rename(destination, previous)
        if (!same(await fingerprint(previous), input.destinationFingerprint)) {
          if (!(await fingerprint(destination))) await rename(previous, destination).catch(() => {})
          throw new ProjectError('EXTERNAL_CHANGE')
        }
      }
      try {
        await link(temporary, destination)
        await unlink(temporary)
        temporary = null
        await syncDirectory(parent)
        await inspectDocx(destination)
        const actual = await fileHash(destination, 512 * 1024 * 1024)
        if (
          actual.sha256 !== createHash('sha256').update(bytes).digest('hex') ||
          actual.bytes !== bytes.length
        )
          throw new ProjectError('UNAVAILABLE')
      } catch (error) {
        if (previous && !(await fingerprint(destination)))
          await rename(previous, destination).catch(() => {})
        throw error
      }
      job.state = 'complete'
      job.phase = 'DOCX ready'
      job.error = null
      await this.persist(running)
    } catch (error) {
      const code = projectError(error)
      job.state =
        code === 'CANCELLED' ? 'cancelled' : job.state === 'publishing' ? 'interrupted' : 'failed'
      job.phase = job.state === 'interrupted' ? 'Publication needs inspection' : 'Export stopped'
      const space = errorSpace(error, 'Export DOCX', folder)
      this.space(job, space)
      job.error = code
      await this.persist(running).catch(() => {})
    } finally {
      if (temporary) await unlink(temporary).catch(() => {})
      this.jobs.delete(job.id)
    }
  }
}
