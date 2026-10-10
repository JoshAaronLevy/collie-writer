import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  IMPORT_LIMITS,
  isImportFileSelection,
  type ImportFileSelection
} from '../../shared/project-import'
import { hasControlCharacters } from '../../shared/control-characters'
import { ProjectError } from '../../domain/projects/errors'

export const importExtensions = ['json', 'txt', 'md', 'markdown', 'bib', 'ris']
export function selectedName(path: string): string {
  const name = basename(path)
  // An unsafe display name is never copied into IPC. The actual descriptor still refuses it.
  return name.length > 0 && name.length <= 255 && !hasControlCharacters(name)
    ? name
    : 'File with unsupported name'
}
/** Reads only a native-selected regular file, bounded in memory and size. No semantic parsing. */
export async function describeSelectedFile(path: string): Promise<ImportFileSelection> {
  const originalName = basename(path),
    extension = extname(path).slice(1).toLowerCase()
  const mediaType =
    extension === 'json'
      ? 'application/json'
      : extension === 'bib'
        ? 'application/x-bibtex'
        : extension === 'ris'
          ? 'application/x-research-info-systems'
          : ['md', 'markdown'].includes(extension)
            ? 'text/markdown'
            : 'text/plain'
  const selection: ImportFileSelection = {
    id: randomUUID(),
    assetId: randomUUID(),
    originalName,
    sha256: '0'.repeat(64),
    bytes: 0,
    mediaType
  }
  if (path.length > 4096 || hasControlCharacters(path) || !isImportFileSelection(selection))
    throw new ProjectError('VALIDATION')
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    throw new ProjectError('VALIDATION')
  if (before.size > IMPORT_LIMITS.fileBytes) throw new ProjectError('LIMIT_EXCEEDED')
  if (!before.size) throw new ProjectError('VALIDATION')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    if (
      before.dev !== opened.dev ||
      before.ino !== opened.ino ||
      opened.nlink !== 1 ||
      !opened.isFile()
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    const buffer = Buffer.alloc(64 * 1024),
      hash = createHash('sha256'),
      decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0
    for (;;) {
      const chunk = await handle.read(buffer, 0, buffer.length, null)
      if (!chunk.bytesRead) break
      bytes += chunk.bytesRead
      if (bytes > IMPORT_LIMITS.fileBytes) throw new ProjectError('LIMIT_EXCEEDED')
      const value = buffer.subarray(0, chunk.bytesRead)
      hash.update(value)
      try {
        decoder.decode(value, { stream: true })
      } catch {
        throw new ProjectError('VALIDATION')
      }
    }
    try {
      decoder.decode()
    } catch {
      throw new ProjectError('VALIDATION')
    }
    const after = await handle.stat(),
      current = await lstat(path)
    if (
      bytes !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.dev !== before.dev ||
      current.ino !== before.ino ||
      current.isSymbolicLink()
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return { ...selection, bytes, sha256: hash.digest('hex') }
  } finally {
    await handle.close()
  }
}
