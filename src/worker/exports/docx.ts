import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, FootnoteReferenceRun,
  ImageRun, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType, type ParagraphChild, type INumberingOptions
} from 'docx'
import type { Compilation, CompileBlock, Frozen, Paragraph as CompileParagraph, Run } from '../../domain/compilation/model'
import { collectImages, fontFiles, imageSize, type ImageResolver } from './assets'

function textRuns(run: Frozen<Extract<Run, { kind: 'text' }>>): TextRun[] {
  const segments: { font: string; text: string; rtl: boolean }[] = []
  for (const character of run.text) {
    const previous = segments.at(-1)
    const font = /\p{Script=Arabic}/u.test(character) ? 'Noto Naskh Arabic'
      : /\p{Script=Hebrew}/u.test(character) ? 'Noto Sans Hebrew'
      : /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character) ? 'Noto Sans CJK SC'
      : /\p{Mark}/u.test(character) && previous ? previous.font : 'Source Serif 4'
    if (previous?.font === font) previous.text += character
    else segments.push({ font, text: character, rtl: font === 'Noto Naskh Arabic' || font === 'Noto Sans Hebrew' })
  }
  return segments.map(segment => new TextRun({
    text: segment.text, font: segment.font, rightToLeft: segment.rtl,
    bold: run.marks.some(m => m.type === 'bold'), italics: run.marks.some(m => m.type === 'italic'),
    underline: run.marks.some(m => m.type === 'underline') ? {} : undefined,
    strike: run.marks.some(m => m.type === 'strike'), superScript: run.superscript, subScript: run.subscript, smallCaps: run.smallCaps
  }))
}
function runs(input: readonly Frozen<Run>[]): ParagraphChild[] {
  return input.flatMap((run): ParagraphChild[] => {
    if (run.kind === 'break') return [new TextRun({ break: 1 })]
    if (run.kind === 'note') return [new FootnoteReferenceRun(run.number)]
    const children = textRuns(run)
    const link = run.marks.find(m => m.type === 'link')
    return link?.type === 'link' ? [new ExternalHyperlink({ link: link.attrs.href, children })] : children
  })
}

/** Returns bytes only. Stage 16 owns capture/leases, cancellation and native destination replacement. */
export async function exportDocx(model: Frozen<Compilation>, resourceRoot: string, resolveImage: ImageResolver): Promise<Buffer> {
  const images = await collectImages(model, resolveImage)
  const numbering = new Map<string, INumberingOptions['config'][number]>()
  function paragraph(p: Frozen<CompileParagraph>, note = false, firstNoteParagraph = false): Paragraph {
    if (p.list && !numbering.has(p.list.id)) numbering.set(p.list.id, {
      reference: p.list.id, levels: [{ level: 0, format: p.list.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: p.list.ordered ? '%1.' : '•', start: p.list.start, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    })
    return new Paragraph({
      style: note ? 'FootnoteText' : p.style,
      children: [...(firstNoteParagraph ? [new TextRun(' ')] : []), ...runs(p.runs)],
      ...(p.list?.marker ? { numbering: { reference: p.list.id, level: 0 } } : p.list ? { indent: { left: 720 } } : {}),
      ...(p.style === 'bibliography' ? { indent: model.bibliography.hangingIndent ? { left: 720, hanging: 720 } : undefined, spacing: { line: Math.max(1, model.bibliography.lineSpacing) * 240, after: Math.max(0, model.bibliography.entrySpacing) * 240 } } : {})
    })
  }
  function block(b: Frozen<CompileBlock>): (Paragraph | Table)[] {
    switch (b.kind) {
      case 'paragraph': return [paragraph(b)]
      case 'pageBreak': return [new Paragraph({ children: [new PageBreak()] })]
      case 'rule': return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '555555' } } })]
      case 'table': return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((row, i) => new TableRow({ tableHeader: b.header && i === 0, cantSplit: false, children: row.map(cell => new TableCell({ children: cell.map(p => paragraph(p)) })) })) })]
      case 'image': {
        const image = images.get(b.assetId)!
        return [new Paragraph({ children: [new ImageRun({ type: image.mediaType === 'image/png' ? 'png' : 'jpg', data: image.bytes, transformation: imageSize(b.width, b.height), altText: { name: 'Manuscript image', title: b.caption, description: b.alt } })] }), ...(b.caption ? [new Paragraph({ style: 'caption', children: [new TextRun(b.caption)] })] : [])]
      }
    }
  }
  const children = model.sections.flatMap(section => section.blocks.flatMap(block))
  if (model.bibliography.bibliography.length) {
    children.push(new Paragraph({ style: 'heading1', text: model.style === 'apa' ? 'References' : 'Bibliography', pageBreakBefore: true }))
    model.bibliography.bibliography.forEach((entry, index) => children.push(paragraph({ kind: 'paragraph', blockId: `bibliography-${index}`, runs: entry, style: 'bibliography' })))
  }
  const doc = new Document({
    creator: 'Collie Writer', description: `Captured revision ${model.capturedHead}`,
    fonts: await Promise.all(fontFiles.map(async ([name, filename]) => ({ name, data: await readFile(join(resourceRoot, 'fonts', filename)) }))),
    styles: {
      default: { document: { run: { font: 'Source Serif 4', size: 24 }, paragraph: { spacing: { line: 360, after: 120 } } } },
      paragraphStyles: [
        { id: 'body', name: 'Body', basedOn: 'Normal', next: 'body' },
        ...([1, 2, 3] as const).map(level => ({ id: `heading${level}`, name: `Heading ${level}`, basedOn: 'Normal', next: 'body', run: { bold: true, size: 36 - level * 4 }, paragraph: { outlineLevel: level - 1, keepNext: true, spacing: { before: 240, after: 120 } } })),
        { id: 'quote', name: 'Block quotation', basedOn: 'body', paragraph: { indent: { left: 720, right: 720 } } },
        { id: 'caption', name: 'Caption', basedOn: 'body', run: { size: 20, italics: true } },
        { id: 'bibliography', name: 'Bibliography', basedOn: 'body' },
        { id: 'FootnoteText', name: 'Footnote Text', basedOn: 'Normal', run: { size: 20 }, paragraph: { spacing: { line: 240, after: 0 } } }
      ]
    },
    numbering: { config: [...numbering.values()] },
    footnotes: Object.fromEntries(model.footnotes.map(note => [note.number, { children: note.paragraphs.map((p, index) => paragraph(p, true, index === 0)) }])),
    sections: [{
      properties: { page: { size: model.paper === 'Letter' ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children
    }]
  })
  return Packer.toBuffer(doc)
}
