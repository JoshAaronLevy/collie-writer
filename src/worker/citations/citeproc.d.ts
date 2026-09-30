declare module 'citeproc' {
  type Citation = { citationID: string; citationItems: Record<string, unknown>[]; properties: { noteIndex: number } }
  class Engine {
    constructor(sys: { retrieveLocale: (language: string) => string | false; retrieveItem: (id: string) => Record<string, unknown> }, style: string, language?: string, forceLanguage?: boolean)
    setOutputFormat(format: 'html' | 'text'): void
    updateItems(ids: string[]): void
    processCitationCluster(citation: Citation, previous: [string, number][], following: [string, number][]): [{ citation_errors?: unknown[] }, [number, string, string?][]]
    makeBibliography(): false | [{ hangingindent: boolean; linespacing: number; entryspacing: number; bibliography_errors?: unknown[] }, string[]]
  }
  const CSL: { Engine: typeof Engine; debug: (message: string) => void; error: (message: string) => never }
  export default CSL
}
