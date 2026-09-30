import CSL from 'citeproc'
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentError, isId, safeLink, type Mark } from '../../domain/editor/schema'
import type { CitationFormatter, Run } from '../../domain/compilation/model'

// Library diagnostics can contain titles/citation text. Return bounded product errors instead.
CSL.debug = () => {}
CSL.error = () => { throw new ContentError('CITATION_PROCESSOR_ERROR', 'citations') }

/** Convert processor markup into inert runs; never forward its HTML into an app/print document. */
function runsFromHtml(html: string): Run[] {
  const result: Run[] = []
  function walk(node: DefaultTreeAdapterTypes.ChildNode, marks: Mark[], decoration: Partial<Extract<Run, { kind: 'text' }>> = {}): void {
    if (node.nodeName === '#text') {
      result.push({ ...decoration, kind: 'text', text: (node as DefaultTreeAdapterTypes.TextNode).value, marks })
      return
    }
    if (node.nodeName === '#comment') return
    if (!('tagName' in node)) throw new ContentError('UNSUPPORTED_CSL_MARKUP', 'citations')
    const next = [...marks]
    if (['i', 'em'].includes(node.tagName)) next.push({ type: 'italic' })
    else if (['b', 'strong'].includes(node.tagName)) next.push({ type: 'bold' })
    else if (node.tagName === 'sup') decoration = { ...decoration, superscript: true }
    else if (node.tagName === 'sub') decoration = { ...decoration, subscript: true }
    else if (node.tagName === 'a') {
      const href = node.attrs.find(a => a.name === 'href')?.value
      if (!safeLink(href)) throw new ContentError('UNSAFE_CSL_LINK', 'citations')
      next.push({ type: 'link', attrs: { href } })
    } else if (node.tagName === 'span') {
      const style = node.attrs.find(a => a.name === 'style')?.value.replace(/\s/g, '')
      if (style === 'font-variant:small-caps;') decoration = { ...decoration, smallCaps: true }
      else if (style && style !== 'font-style:normal;' && style !== 'font-weight:normal;' && style !== 'font-variant:normal;') throw new ContentError('UNSUPPORTED_CSL_MARKUP', 'citations')
      else if (style === 'font-style:normal;') next.splice(0, next.length, ...next.filter(m => m.type !== 'italic'))
      else if (style === 'font-weight:normal;') next.splice(0, next.length, ...next.filter(m => m.type !== 'bold'))
      else if (style === 'font-variant:normal;') decoration = { ...decoration, smallCaps: false }
    } else if (node.tagName === 'br') { result.push({ kind: 'break' }); return }
    else if (node.tagName === 'div') {
      const className = node.attrs.find(a => a.name === 'class')?.value
      if (className !== 'csl-entry' && className !== 'csl-bib-body') throw new ContentError('UNSUPPORTED_CSL_MARKUP', 'citations')
    } else throw new ContentError('UNSUPPORTED_CSL_MARKUP', 'citations')
    node.childNodes.forEach(child => walk(child, next, decoration))
  }
  parseFragment(html.trim()).childNodes.forEach(node => walk(node, []))
  return result
}

/** Trusted, pinned resources only. User-imported CSL is deliberately not an input to this adapter. */
export async function createCitationFormatter(resourceRoot: string, style: 'apa' | 'chicago', sources: readonly Record<string, unknown>[]): Promise<CitationFormatter> {
  const styleFile = style === 'apa' ? 'apa.csl' : style === 'chicago' ? 'chicago-notes-bibliography.csl' : null
  if (!styleFile) throw new ContentError('UNSUPPORTED_STYLE', 'style')
  const [xml, locale] = await Promise.all([readFile(join(resourceRoot, 'styles', styleFile), 'utf8'), readFile(join(resourceRoot, 'locales/locales-en-US.xml'), 'utf8')])
  if ([xml, locale].some(s => s.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(s))) throw new ContentError('INVALID_CSL_ASSET', 'style')
  const records = new Map<string, Record<string, unknown>>()
  if (sources.length > 100_000) throw new ContentError('TOO_MANY_SOURCES', 'sources')
  for (const source of sources) {
    if (!isId(source.id) || records.has(source.id) || !['article-journal', 'book', 'chapter', 'report', 'thesis', 'webpage'].includes(String(source.type))) throw new ContentError('INVALID_SOURCE', 'sources')
    const serialized = JSON.stringify(source)
    if (serialized.length > 100_000) throw new ContentError('SOURCE_TOO_LARGE', source.id)
    // Source import owns field provenance/metadata warnings. These are inert JSON records only.
    records.set(source.id, JSON.parse(serialized) as Record<string, unknown>)
  }
  return requests => {
    const engine = new CSL.Engine({
      retrieveLocale: language => ['en', 'en-US', 'us'].includes(language) ? locale : false,
      retrieveItem: id => {
        const record = records.get(id)
        if (!record) throw new ContentError('MISSING_SOURCE', id)
        return structuredClone(record)
      }
    }, xml, 'en-US', true)
    engine.setOutputFormat('html')
    engine.updateItems([...new Set(requests.flatMap(c => c.items.map(i => i.sourceId)))])
    const strings = new Map<number, string>()
    const previous: [string, number][] = []
    for (const request of requests) {
      const [status, updates] = engine.processCitationCluster({
        citationID: request.id,
        citationItems: request.items.map(({ sourceId, ...item }) => ({ ...item, id: sourceId })),
        properties: { noteIndex: request.noteIndex }
      }, previous, [])
      if (status.citation_errors?.length) throw new ContentError('CITATION_FORMAT_FAILED', request.id)
      for (const [index, text] of updates) strings.set(index, text)
      previous.push([request.id, request.noteIndex])
    }
    const bibliography = engine.makeBibliography()
    if (bibliography && bibliography[0].bibliography_errors?.length) throw new ContentError('BIBLIOGRAPHY_FAILED', 'bibliography')
    return {
      citations: Object.fromEntries(requests.map((request, index) => {
        const text = strings.get(index)
        if (text === undefined || !text.trim()) throw new ContentError('CITATION_FORMAT_FAILED', request.id)
        return [request.id, runsFromHtml(text)]
      })),
      bibliography: bibliography ? bibliography[1].map(runsFromHtml) : [],
      hangingIndent: bibliography ? bibliography[0].hangingindent : false,
      lineSpacing: bibliography ? bibliography[0].linespacing : 1,
      entrySpacing: bibliography ? bibliography[0].entryspacing : 0
    }
  }
}
