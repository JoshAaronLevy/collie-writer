import type { Compilation, CompileBlock, Frozen, Paragraph, Run } from '../../domain/compilation/model'
import { ContentError } from '../../domain/editor/schema'
import { collectImages, imageSize, type ImageResolver } from './assets'

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export type PrintDocument = { body: string; css: string; paper: 'Letter' | 'A4'; capturedHead: string }

/** Inert generated markup and app-owned CSS only; never accepts imported HTML or resource URLs. */
export async function exportPrintDocument(model: Frozen<Compilation>, resolveImage: ImageResolver): Promise<PrintDocument> {
  const images = await collectImages(model, resolveImage)
  const notes = new Map(model.footnotes.map(note => [note.number, note]))
  function runs(values: readonly Frozen<Run>[], inNote = false): string {
    return values.map(run => {
      if (run.kind === 'break') return '<br>'
      if (run.kind === 'note') {
        const note = notes.get(run.number)
        if (!note || inNote) throw new ContentError('INVALID_FOOTNOTE', 'print')
        return `<span class="footnote" data-note-number="${note.number}">${note.paragraphs.map(p => `<span class="note-paragraph">${runs(p.runs, true)}</span>`).join('')}</span>`
      }
      let text = escapeHtml(run.text)
      for (const mark of run.marks) {
        if (mark.type === 'link') text = `<a href="${escapeHtml(mark.attrs.href)}">${text}</a>`
        else { const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[mark.type]; text = `<${tag}>${text}</${tag}>` }
      }
      if (run.smallCaps) text = `<span class="small-caps">${text}</span>`
      if (run.superscript) text = `<sup>${text}</sup>`
      if (run.subscript) text = `<sub>${text}</sub>`
      return text
    }).join('')
  }
  function paragraph(p: Frozen<Paragraph>): string {
    const tag = p.style.startsWith('heading') ? `h${p.style.slice(-1)}` : 'p'
    return `<${tag} class="${p.style}">${runs(p.runs)}</${tag}>`
  }
  function block(b: Frozen<CompileBlock>): string {
    switch (b.kind) {
      case 'paragraph': return paragraph(b)
      case 'pageBreak': return '<div class="page-break"></div>'
      case 'rule': return '<hr>'
      case 'image': {
        const image = images.get(b.assetId)!
        const size = imageSize(b.width, b.height)
        return `<figure><img src="data:${image.mediaType};base64,${Buffer.from(image.bytes).toString('base64')}" alt="${escapeHtml(b.alt)}" width="${size.width}" height="${size.height}">${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ''}</figure>`
      }
      case 'table': {
        const row = (cells: readonly (readonly Frozen<Paragraph>[])[], header: boolean): string => `<tr>${cells.map(cell => `<${header ? 'th' : 'td'}>${cell.map(paragraph).join('')}</${header ? 'th' : 'td'}>`).join('')}</tr>`
        return `<table>${b.header ? `<thead>${row(b.rows[0], true)}</thead>` : ''}<tbody>${b.rows.slice(b.header ? 1 : 0).map(c => row(c, false)).join('')}</tbody></table>`
      }
    }
  }
  function blocks(values: readonly Frozen<CompileBlock>[]): string {
    let html = ''; let list: string | undefined; let tag = ''; let itemOpen = false
    const close = (): void => { if (list) { html += `${itemOpen ? '</li>' : ''}</${tag}>`; list = undefined; itemOpen = false } }
    for (const value of values) {
      const current = value.kind === 'paragraph' ? value.list : undefined
      if (!current) { close(); html += block(value); continue }
      if (list !== current.id) {
        close(); tag = current.ordered ? 'ol' : 'ul'; list = current.id
        html += `<${tag}${current.ordered ? ` start="${current.start}"` : ''}>`
      }
      if (current.marker) { if (itemOpen) html += '</li>'; html += '<li>'; itemOpen = true }
      html += paragraph(value as Frozen<Paragraph>)
    }
    close(); return html
  }
  const bibliography = model.bibliography.bibliography.length ? `<section class="bibliography-section"><h1>${model.style === 'apa' ? 'References' : 'Bibliography'}</h1>${model.bibliography.bibliography.map(entry => `<p class="bibliography">${runs(entry)}</p>`).join('')}</section>` : ''
  const body = model.sections.map(s => `<section>${blocks(s.blocks)}</section>`).join('') + bibliography
  const css = `
@font-face { font-family: 'Source Serif 4'; src: url('/fonts/SourceSerif4-Regular.ttf'); }
@font-face { font-family: 'Source Serif 4'; font-weight: 700; src: url('/fonts/SourceSerif4-Bold.ttf'); }
@font-face { font-family: 'Source Serif 4'; font-style: italic; src: url('/fonts/SourceSerif4-It.ttf'); }
@font-face { font-family: 'Source Serif 4'; font-style: italic; font-weight: 700; src: url('/fonts/SourceSerif4-BoldIt.ttf'); }
@font-face { font-family: 'Noto Sans CJK SC'; src: url('/fonts/NotoSansCJKsc-Regular.otf'); }
@font-face { font-family: 'Noto Naskh Arabic'; src: url('/fonts/NotoNaskhArabic-Regular.ttf'); }
@font-face { font-family: 'Noto Sans Hebrew'; src: url('/fonts/NotoSansHebrew-Regular.ttf'); }
@page { size: ${model.paper}; margin: 1in; @bottom-center { content: counter(page); } @footnote { border-top: 0.5pt solid; padding-top: 5pt; } }
body { margin: 0; font: 12pt/1.5 'Source Serif 4', 'Noto Sans CJK SC', 'Noto Naskh Arabic', 'Noto Sans Hebrew'; }
p { margin: 0 0 6pt; orphans: 2; widows: 2; overflow-wrap: anywhere; }
h1,h2,h3 { break-after: avoid; line-height: 1.2; } h1 {font-size: 18pt} h2 {font-size: 16pt} h3 {font-size: 14pt}
.quote { margin-left: 0.5in; margin-right: 0.5in; }
.page-break,.bibliography-section { break-before: page; }
figure { margin: 6pt 0; break-inside: avoid; } img { max-width: 100%; object-fit: contain; }
figcaption { font-size: 10pt; font-style: italic; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; } td,th { border: 0.5pt solid; padding: 4pt; vertical-align: top; overflow-wrap: anywhere; }
thead { display: table-header-group; } .small-caps { font-variant: small-caps; }
.footnote { float: footnote; font-size: 10pt; line-height: 1.2; }
.footnote::footnote-call { content: counter(footnote); vertical-align: super; font-size: 0.75em; }
.footnote::footnote-marker { content: attr(data-note-number) '. '; }
.footnote[data-split-from]::marker { content: none; }
.note-paragraph { display: block; } .note-paragraph:first-child { display: inline; }
.bibliography { ${model.bibliography.hangingIndent ? 'padding-left: 0.5in; text-indent: -0.5in;' : ''} line-height: ${Math.max(1, model.bibliography.lineSpacing)}; margin-bottom: ${Math.max(0, model.bibliography.entrySpacing)}em; }
a { color: inherit; text-decoration: none; }
@media print { .pagedjs_page { margin: 0; border: 0; box-shadow: none; } }
`
  return { body, css, paper: model.paper, capturedHead: model.capturedHead }
}
