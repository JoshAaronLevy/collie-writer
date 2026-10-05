import type {
  Compilation,
  Frozen,
  Paragraph,
  Run,
  CompileBlock
} from '../../domain/compilation/model'
import type { ManagedImage } from './assets'

export type Interchange = {
  bytes: Buffer
  assets: { name: string; bytes: Buffer }[]
  losses: string[]
}

/** Markdown dialect: UTF-8 CommonMark blocks plus numbered [^n] footnotes. */
export function exportInterchange(
  model: Frozen<Compilation>,
  images: ReadonlyMap<string, ManagedImage>,
  format: 'markdown' | 'text',
  assetFolder: string
): Interchange {
  const markdown = format === 'markdown'
  const losses = new Set<string>()
  const assets: Interchange['assets'] = []
  const listNumbers = new Map<string, number>()
  const noteMap = new Map(model.footnotes.map((n) => [n.number, n]))
  const escape = (value: string): string =>
    markdown ? value.replace(/([\\`*_{}[\]<>!|])/g, '\\$1') : value
  function runs(input: readonly Frozen<Run>[]): string {
    return input
      .map((run) => {
        if (run.kind === 'break') return markdown ? '  \n' : '\n'
        if (run.kind === 'note') {
          if (!noteMap.has(run.number)) throw new Error('MISSING_NOTE')
          return markdown ? `[^${run.number}]` : `[note ${run.number}]`
        }
        let value = escape(run.text)
        if (markdown)
          for (const mark of run.marks) {
            if (mark.type === 'bold') value = `**${value}**`
            else if (mark.type === 'italic') value = `*${value}*`
            else if (mark.type === 'strike') value = `~~${value}~~`
            else if (mark.type === 'link') value = `[${value}](${mark.attrs.href})`
            else losses.add('Underline has no portable Markdown equivalent.')
          }
        if (!markdown && run.marks.length) {
          for (const mark of run.marks) if (mark.type === 'link') value += ` (${mark.attrs.href})`
          losses.add('Inline styling is flattened in plain text.')
        }
        if (run.superscript || run.subscript || run.smallCaps)
          losses.add('Superscript, subscript or small-cap styling is flattened.')
        return value
      })
      .join('')
  }
  function paragraph(p: Frozen<Paragraph>): string {
    const value = runs(p.runs)
    if (markdown && p.style.startsWith('heading'))
      return `${'#'.repeat(Number(p.style.slice(-1)))} ${value}`
    if (!markdown && p.style.startsWith('heading'))
      return `${value}\n${'='.repeat(Math.min(value.length, 80))}`
    if (p.style === 'quote')
      return markdown
        ? value
            .split('\n')
            .map((s) => `> ${s}`)
            .join('\n')
        : `“${value}”`
    return value
  }
  function block(value: Frozen<CompileBlock>): string {
    switch (value.kind) {
      case 'paragraph': {
        const body = paragraph(value)
        if (!value.list) return body
        if (!value.list.marker) return `  ${body}`
        const number = listNumbers.get(value.list.id) ?? value.list.start
        listNumbers.set(value.list.id, number + 1)
        return `${value.list.ordered ? `${number}.` : '-'} ${body}`
      }
      case 'rule':
        return markdown ? '---' : '────────────────'
      case 'pageBreak':
        losses.add('Page boundaries are not preserved in text interchange.')
        return markdown ? '\n---\n' : '\n[Page break]\n'
      case 'image': {
        if (!markdown) {
          losses.add('Image pixels are absent from plain text.')
          return `[Image: ${value.alt || 'untitled'}]${value.caption ? ` ${value.caption}` : ''}`
        }
        const image = images.get(value.assetId)
        if (!image) throw new Error('MISSING_IMAGE')
        const name = `${value.assetId}.${image.mediaType === 'image/png' ? 'png' : 'jpg'}`
        if (!assets.some((a) => a.name === name))
          assets.push({ name, bytes: Buffer.from(image.bytes) })
        losses.add('Image dimensions and placement are not preserved in Markdown.')
        const path = `${assetFolder}/${name}`
          .split('/')
          .map((part) =>
            encodeURIComponent(part).replace(
              /[()]/g,
              (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
            )
          )
          .join('/')
        return `![${escape(value.alt)}](${path})${value.caption ? `\n\n*${escape(value.caption)}*` : ''}`
      }
      case 'table': {
        const rows = value.rows.map((row) => row.map((cell) => cell.map(paragraph).join(' / ')))
        if (!markdown) {
          losses.add('Table layout is flattened in plain text.')
          return rows.map((row) => row.join(' | ')).join('\n')
        }
        const width = Math.max(...rows.map((row) => row.length))
        const padded = rows.map((row) =>
          [...row, ...Array(width - row.length).fill('')].map((s) =>
            s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
          )
        )
        const heading = padded[0]
        const rest = padded.slice(1)
        if (!value.header)
          losses.add('A table without a header uses its first row as a Markdown header.')
        return [
          `| ${heading.join(' | ')} |`,
          `| ${Array(width).fill('---').join(' | ')} |`,
          ...rest.map((row) => `| ${row.join(' | ')} |`)
        ].join('\n')
      }
    }
  }
  const parts: string[] = []
  if (model.titlePage) {
    const literal = (text: string): string =>
      markdown ? escape(text).replace(/([#>+.-])/g, '\\$1') : text
    parts.push(
      `${markdown ? '# ' : ''}${literal(model.metadata.title)}\n\n${literal(model.metadata.byline)}`
    )
    losses.add(
      'The selected title page is opening text; text formats have no native metadata or page layout.'
    )
  }
  for (const section of model.sections) parts.push(section.blocks.map(block).join('\n\n'))
  if (model.footnotes.length) {
    parts.push(markdown ? '## Notes' : 'Notes')
    for (const note of model.footnotes) {
      const body = note.paragraphs.map(paragraph).join(markdown ? '\n    \n    ' : '\n    ')
      parts.push(markdown ? `[^${note.number}]: ${body}` : `[note ${note.number}] ${body}`)
    }
  }
  if (model.bibliography.bibliography.length) {
    parts.push(
      markdown
        ? `# ${model.style === 'apa' ? 'References' : 'Bibliography'}`
        : model.style === 'apa'
          ? 'References'
          : 'Bibliography'
    )
    parts.push(...model.bibliography.bibliography.map(runs))
  }
  return {
    bytes: Buffer.from(parts.join('\n\n').trimEnd() + '\n', 'utf8'),
    assets,
    losses: [...losses]
  }
}
