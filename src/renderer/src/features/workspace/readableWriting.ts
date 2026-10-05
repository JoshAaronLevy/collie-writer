export function readableWriting(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  if ('type' in value && value.type === 'text' && 'text' in value) return String(value.text)
  if ('type' in value && value.type === 'hardBreak') return '\n'
  if ('content' in value && Array.isArray(value.content))
    return (
      value.content.map(readableWriting).join('') +
      ('type' in value && ['paragraph', 'heading', 'tableRow'].includes(String(value.type))
        ? '\n'
        : '')
    )
  return ''
}
