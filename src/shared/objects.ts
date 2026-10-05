/** Copy enumerable own fields, excluding metadata that is outside a persisted identity. */
export function withoutKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[]
): Omit<T, K> {
  const result = { ...value }
  for (const key of keys) delete result[key]
  return result
}
