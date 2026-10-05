/** Portable text boundaries use explicit code points instead of invisible regex ranges. */
export function hasControlCharacters(
  value: string,
  allowTextWhitespace = false,
  maximum = 0x1f
): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (allowTextWhitespace && (code === 9 || code === 10 || code === 13)) continue
    if (code <= 0x1f || (code >= 0x7f && code <= maximum)) return true
  }
  return false
}

export function replaceControlCharacters(value: string, allowTextWhitespace = false): string {
  return Array.from(value, (character) =>
    hasControlCharacters(character, allowTextWhitespace) ? ' ' : character
  ).join('')
}
