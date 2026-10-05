import { hasControlCharacters } from '../../shared/control-characters'
import { isProjectKind, type ProjectKind } from './templates'

export type ProjectDetails = {
  title: string
  byline: string
  description: string
  projectKind: ProjectKind
}
// Match existing shared validators: JavaScript string.length (UTF-16 code units).
export function projectText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' && value.length <= maximum && !hasControlCharacters(value, true, 0x9f)
  )
}
export function requiredProjectName(value: unknown): value is string {
  return (
    projectText(value, 500) &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\r\n\t]/u.test(value)
  )
}
export function validDetails(value: ProjectDetails, creating = false): boolean {
  return (
    requiredProjectName(value.title) &&
    (creating
      ? requiredProjectName(value.byline)
      : value.byline === '' || requiredProjectName(value.byline)) &&
    projectText(value.description, 10000) &&
    isProjectKind(value.projectKind)
  )
}
// Old titles keep the pre-I04 contract: no trimming, rewriting or truncation on read.
export function storedProjectTitle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 500 &&
    !hasControlCharacters(value, true)
  )
}
