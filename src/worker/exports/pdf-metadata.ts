import { PDFDocument } from 'pdf-lib'
import type { CompilationMetadata, Frozen } from '../../domain/compilation/model'
import { ProjectError } from '../../domain/projects/errors'

/** Applies only to this export's freshly rendered bytes, never imported PDFs. */
export async function addPdfMetadata(bytes: Buffer, metadata: Frozen<CompilationMetadata>, signal: AbortSignal): Promise<Buffer> {
  if (signal.aborted) throw new ProjectError('CANCELLED')
  if (bytes.length > 512 * 1024 * 1024) throw new ProjectError('LIMIT_EXCEEDED')
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  document.setTitle(metadata.title)
  document.setAuthor(metadata.byline)
  document.setSubject(metadata.description ?? '')
  document.setCreator('Collie Writer')
  if (signal.aborted) throw new ProjectError('CANCELLED')
  const result = Buffer.from(await document.save({ addDefaultPage: false }))
  if (signal.aborted) throw new ProjectError('CANCELLED')
  if (result.length > 512 * 1024 * 1024) throw new ProjectError('LIMIT_EXCEEDED')
  return result
}
