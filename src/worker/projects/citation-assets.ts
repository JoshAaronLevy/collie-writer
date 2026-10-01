import { randomUUID } from 'node:crypto'
import { readFile, lstat, mkdir, copyFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { SaxesParser } from 'saxes'
import { contained, syncFile, syncDirectory } from '../storage/files'
import { fileHash } from './streams'
import { SnapshotError, LIMITS, type CitationRef } from './manifest'

// App-owned exact supported bytes; archive metadata never chooses an external resource to fetch.
export const CITATION_ASSETS: readonly (CitationRef & { resource: string })[] = [
  { id: 'apa-7', kind: 'style', resource: 'styles/apa.csl', sha256: '1ece4fb3c295e66d04b4394e295aa58a87741ceeef1658192437eb9953c2f13e', bytes: 85658 },
  { id: 'chicago-18-notes-bibliography', kind: 'style', resource: 'styles/chicago-notes-bibliography.csl', sha256: '4b6be4bceaf8f3c31b49331c9f9e38c977f666d6ab80e19a2ac8482c7511abeb', bytes: 242663 },
  { id: 'en-US', kind: 'locale', resource: 'locales/locales-en-US.xml', sha256: 'ac864c7c21166b4390d82c31792cdc509400727fa0060b43d8aa17e07f9cb079', bytes: 32649 },
  { id: 'csl-style-notices', kind: 'notice', resource: 'licenses/CSL-styles-README.md', sha256: 'eeda35e6ab1c71ef74ba98e8d63f3f5c07e1b1c458b92d54cdd7515afcb1b04e', bytes: 6573 },
  { id: 'csl-locale-notices', kind: 'notice', resource: 'licenses/CSL-locales-README.md', sha256: 'f8e1b34d3e1b66f101b45bc45e5fca0397aa923fe4abeab6f98139c8f731c320', bytes: 1777 }
]
export function citationProfile(refs: CitationRef[]): void {
  if (refs.length !== CITATION_ASSETS.length || CITATION_ASSETS.some(expected => !refs.some(ref => ref.id === expected.id && ref.kind === expected.kind && ref.bytes === expected.bytes && ref.sha256 === expected.sha256))) throw new SnapshotError('INVALID_ARCHIVE')
}
export async function validateCitationFile(path: string, ref: CitationRef, signal?: AbortSignal): Promise<void> {
  const actual = await fileHash(path, LIMITS.citation, signal)
  if (actual.sha256 !== ref.sha256 || actual.bytes !== ref.bytes) throw new SnapshotError('INVALID_ARCHIVE')
  if (ref.kind === 'notice') return
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SnapshotError('INVALID_ARCHIVE')
  const parser = new SaxesParser({ xmlns: true })
  let depth = 0, nodes = 0, root = false
  const reject = (): never => { throw new SnapshotError('INVALID_ARCHIVE') }
  parser.on('doctype', reject); parser.on('error', reject)
  parser.on('processinginstruction', reject)
  parser.on('opentag', tag => {
    if (++depth > 64 || ++nodes > 100000 || Object.keys(tag.attributes).length > 64) reject()
    if (!root) {
      root = true
      if (tag.uri !== 'http://purl.org/net/xbiblio/csl' || tag.local !== (ref.kind === 'style' ? 'style' : 'locale')) reject()
    }
  })
  parser.on('closetag', () => { depth-- })
  parser.write(xml).close()
  if (!root || depth !== 0) reject()
}
export async function bundledCitationFiles(resources: string, signal?: AbortSignal): Promise<{ ref: CitationRef; path: string }[]> {
  const result: { ref: CitationRef; path: string }[] = []
  for (const { resource, ...ref } of CITATION_ASSETS) {
    const path = join(resources, resource)
    await contained(resources, path, false)
    await validateCitationFile(path, ref, signal)
    result.push({ ref, path })
  }
  return result
}

/** Restored projects use their retained exact profile. Missing/corrupt retained files never fall back. */
export async function projectCitationFiles(workspace: string, resources: string, signal?: AbortSignal): Promise<{ ref: CitationRef; path: string }[]> {
  const folder = join(workspace,'citation-assets')
  try { await lstat(folder) } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
    const bundled = await bundledCitationFiles(resources,signal)
    const staging = join(workspace,`citation-profile-${randomUUID()}`)
    await mkdir(staging,{mode:0o700})
    for (const asset of bundled) { const destination = join(staging,asset.ref.sha256); await copyFile(asset.path,destination); await syncFile(destination) }
    await syncDirectory(staging)
    try { await rename(staging,folder) } catch (error) {
      // Preview and an initial snapshot may publish the same immutable profile concurrently.
      if (!error || typeof error !== 'object' || !('code' in error) || !['EEXIST','ENOTEMPTY'].includes(String(error.code))) throw error
    }
    await syncDirectory(workspace)
  }
  await contained(workspace,folder,true)
  const files: { ref: CitationRef; path: string }[] = []
  for (const { resource: _resource, ...ref } of CITATION_ASSETS) {
    const path = join(folder,ref.sha256)
    await contained(workspace,path,false)
    await validateCitationFile(path,ref,signal)
    files.push({ref,path})
  }
  return files
}
