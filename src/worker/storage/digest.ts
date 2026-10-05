/* eslint-disable prettier/prettier */
import { createHash } from 'node:crypto'
/** Canonical JSON key ordering makes retry identity independent of object construction order. */
export function requestDigest(value: unknown): string {
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
    const encoded = JSON.stringify(v)
    if (encoded === undefined) throw new Error('Invalid canonical JSON value')
    return encoded
  }
  return createHash('sha256').update(canonical(value)).digest('hex')
}
