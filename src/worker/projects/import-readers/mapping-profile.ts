import { setImmediate } from 'node:timers/promises'
import type { ImportFile } from '../../../shared/project-import'
import { GRAPH_LIMITS } from '../../../shared/import-graph'
import {
  MAPPING_LIMITS,
  mappingKey,
  isStructureProfile,
  type MappingPath,
  type StructureProfile
} from '../../../shared/import-mapping'
import { record } from '../../../shared/projects'
import { requestDigest } from '../../storage/digest'
import { graphId } from './records'
import { InputError, pointer, parseInputJson, type ParsedInput } from './json'

export class MappingWork {
  private steps = 0
  constructor(private readonly signal?: AbortSignal) {}
  async step(): Promise<void> {
    this.signal?.throwIfAborted()
    if (++this.steps > MAPPING_LIMITS.traversals)
      throw new InputError('limited', 'Mapping traversal budget was exceeded.')
    if (this.steps % MAPPING_LIMITS.yieldEvery === 0) {
      await setImmediate()
      this.signal?.throwIfAborted()
    }
  }
}
export const valueType = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
/** Immediate field/type signature; shape alone never proves field meaning. */
export function mappingVariant(v: unknown): string {
  return requestDigest({
    contract: 'mapping-shape-v1',
    type: valueType(v),
    fields: record(v)
      ? Object.keys(v)
          .sort()
          .map((k) => [k, valueType(v[k])])
      : []
  })
}
function sample(v: unknown, path: string): StructureProfile['variants'][number]['first'] {
  let omitted = false
  function preview(value: unknown, depth: number): unknown {
    if (typeof value === 'string') {
      if (value.length > 80) omitted = true
      return value.length > 80
        ? { type: 'string', units: value.length, prefix: value.slice(0, 80) }
        : value
    }
    if (Array.isArray(value)) {
      omitted ||= value.length > 3 || (depth === 0 && value.length > 0)
      return {
        type: 'array',
        items: value.length,
        example: depth > 0 ? value.slice(0, 3).map((x) => preview(x, depth - 1)) : []
      }
    }
    if (record(value)) {
      const keys = Object.keys(value),
        fields: Array<[string, unknown]> = []
      omitted ||= keys.length > 6 || (depth === 0 && keys.length > 0)
      for (const key of depth > 0 ? keys.slice(0, 6) : [])
        fields.push([key, preview(value[key], depth - 1)])
      return { type: 'object', members: keys.length, fields }
    }
    return value
  }
  let encoded = JSON.stringify(preview(v, 1))
  if (encoded.length > MAPPING_LIMITS.sampleUnits) {
    omitted = true
    encoded = JSON.stringify({
      type: valueType(v),
      units: encoded.length,
      detail: 'Example omitted to fit sample budget.'
    })
  }
  return { pointer: path, sample: encoded, omitted }
}
/** Visits every admitted value; only bounded first/last examples are retained. */
export async function profileStructure(
  file: ImportFile,
  parsed: ParsedInput,
  sourceGraphId: string,
  work = new MappingWork()
): Promise<StructureProfile> {
  const fields = new Map<string, StructureProfile['fields'][number]>(),
    collections = new Map<string, StructureProfile['collections'][number]>(),
    variants = new Map<string, StructureProfile['variants'][number]>()
  async function walk(
    value: unknown,
    path: string,
    pattern: MappingPath,
    representative: boolean
  ): Promise<void> {
    await work.step()
    if (pattern.length > MAPPING_LIMITS.path)
      throw new InputError('limited', 'The structure exceeds the supported mapping path depth.')
    const key = JSON.stringify(pattern),
      type = valueType(value)
    let f = fields.get(key)
    if (!f) {
      if (fields.size >= MAPPING_LIMITS.fields)
        throw new InputError(
          'limited',
          'The structure has too many distinct field paths for one mapping profile.'
        )
      f = { path: pattern, types: [] }
      fields.set(key, f)
    }
    const old = f.types.find((t) => t.type === type)
    if (old) old.count++
    else f.types.push({ type, count: 1 })
    if (representative) {
      const shape = mappingVariant(value),
        variantKey = `${key}:${shape}`,
        example = sample(value, path)
      const old = variants.get(variantKey)
      if (old) {
        old.count++
        old.last = example
      } else {
        if (variants.size >= MAPPING_LIMITS.variants)
          throw new InputError(
            'limited',
            'The structure has too many variants for one bounded mapping profile.'
          )
        variants.set(variantKey, {
          id: shape,
          path: pattern,
          count: 1,
          first: example,
          last: example
        })
      }
    }
    if (Array.isArray(value)) {
      let c = collections.get(key)
      if (!c) {
        if (collections.size >= MAPPING_LIMITS.collections)
          throw new InputError('limited', 'The structure has too many distinct collections.')
        c = { path: pattern, arrays: 0, items: 0, min: value.length, max: value.length }
        collections.set(key, c)
      }
      c.arrays++
      c.items += value.length
      c.min = Math.min(c.min, value.length)
      c.max = Math.max(c.max, value.length)
      for (let i = 0; i < value.length; i++)
        await walk(value[i], pointer(path, i), [...pattern, { each: true }], true)
    } else if (record(value)) {
      for (const key of Object.keys(value)) {
        if (!mappingKey(key))
          throw new InputError(
            'unsupported',
            'An unsafe or overlong object key cannot be used in a mapping.'
          )
        await walk(value[key], pointer(path, key), [...pattern, { field: key }], false)
      }
    }
  }
  await walk(parsed.value, '', [], true)
  const body = {
      version: 1 as const,
      fileId: file.id,
      sha256: file.sha256,
      values: parsed.values,
      fields: [...fields.values()],
      collections: [...collections.values()],
      variants: [...variants.values()]
    },
    digest = requestDigest({ contract: 'import-structure-profile-v1', ...body }),
    profile = {
      ...body,
      id: graphId(['import-profile-v1', sourceGraphId, file.id, file.sha256, digest]),
      digest
    }
  if (!isStructureProfile(profile))
    throw new InputError(
      'limited',
      'The complete structure profile exceeds its retained sample/descriptor budget.'
    )
  return profile
}
export type MappingValue = { value: unknown; pointer: string }
/** Own properties only. No expressions, recursion operators or external lookups. */
export async function* traverseMapping(
  value: unknown,
  path: MappingPath,
  base: string,
  work: MappingWork,
  at = 0
): AsyncGenerator<MappingValue> {
  await work.step()
  if (at === path.length) {
    yield { value, pointer: base }
    return
  }
  const s = path[at]
  if ('each' in s) {
    if (!Array.isArray(value))
      throw new InputError('unsupported', 'A mapped collection is not an array.')
    for (let i = 0; i < value.length; i++)
      yield* traverseMapping(value[i], path, pointer(base, i), work, at + 1)
  } else {
    const key = 'field' in s ? s.field : s.index
    if (
      ('field' in s && !record(value)) ||
      ('index' in s && !Array.isArray(value)) ||
      !Object.hasOwn(value as object, key)
    )
      throw new InputError(
        'unsupported',
        'A required mapping field is missing or has an unexpected type.'
      )
    yield* traverseMapping(
      (value as Record<string, unknown>)[key],
      path,
      pointer(base, key),
      work,
      at + 1
    )
  }
}
export function mappingField(value: unknown, path: MappingPath, base: string): MappingValue | null {
  let current = value,
    location = base
  for (const s of path) {
    if ('each' in s)
      throw new InputError('unsupported', 'A scalar field cannot contain array traversal.')
    const key = 'field' in s ? s.field : s.index
    if (
      ('field' in s && !record(current)) ||
      ('index' in s && !Array.isArray(current)) ||
      !Object.hasOwn(current as object, key)
    )
      return null
    current = (current as Record<string, unknown>)[key]
    location = pointer(location, key)
  }
  return { value: current, pointer: location }
}
export function decodeMappingJson(
  bytes: Buffer,
  signal?: AbortSignal
): { parsed: ParsedInput; bom: boolean } {
  signal?.throwIfAborted()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new InputError('corrupt', 'The selected original is not valid UTF-8 text.')
  }
  const bom = text.startsWith('\uFEFF')
  if (bom) text = text.slice(1)
  if (text.length > GRAPH_LIMITS.units)
    throw new InputError('limited', 'Decoded file exceeds the local text budget.')
  // Kept here to make the strict parser the single JSON input admission owner.
  return { parsed: parseInputJson(text), bom }
}
