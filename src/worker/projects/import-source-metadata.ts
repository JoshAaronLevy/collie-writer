import { record } from '../../shared/projects'
import { SOURCE_TYPES, type SourceMetadata } from '../../shared/sources'
import { fromCsl } from './sources'
export function originalSourceMetadata(value: unknown, losses: string[]): SourceMetadata | null {
  if (!record(value)) return null
  // CSL has structured creators and dates. Curated references may have literal authors and URLs.
  const c: Record<string, unknown> = { ...value }
  if (!SOURCE_TYPES.includes(c.type as SourceMetadata['type'])) {
    if (c.type !== undefined)
      losses.push('Original work type needs review; webpage is only a proposed mapping.')
    else losses.push('Work type was not supplied; webpage is only a proposed mapping.')
    c.type = 'webpage'
  }
  c.URL = c.URL ?? c.url
  if (typeof c.author === 'string') c.author = [{ literal: c.author }]
  if (typeof c.issued === 'string') c.issued = { literal: c.issued }
  if (c.issued === undefined && typeof c.pub_date === 'string') c.issued = { literal: c.pub_date }
  if (c.attribution && !c.author)
    losses.push('Attribution is retained as metadata, not inferred to be an author.')
  try {
    const converted = fromCsl(c)
    losses.push(...converted.losses)
    return converted.metadata
  } catch {
    losses.push(
      'Incomplete or unsupported bibliography fields need review before a source can be proposed.'
    )
    return null
  }
}
