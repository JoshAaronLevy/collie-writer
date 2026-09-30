# D4 — Local citation processor and redistribution

September 29, 2026. **Select citeproc 2.4.63 under CPAL 1.0. Implementation complete; style/native acceptance pending.** This is the engineering redistribution choice, not a claim of legal certification or completed release review.

The actual npm artifact contains readable `citeproc_commonjs.js`, `LICENSE`, `README.rst` and package metadata; it contains no attribution graphic. Its license and JS header offer CPAL 1.0-or-later or AGPL 3.0-or-later. The npm manifest instead labels the AGPL alternative as `AGPL-1.0`. The delivered source/license govern this decision; it is **not MIT**. The independent Collie adapter does not relicense or conceal it through Citation.js. [Upstream license](https://github.com/Juris-M/citeproc-js/blob/master/LICENSE).

The selected [upstream CPAL text](https://github.com/Juris-M/citeproc-js/blob/master/CPAL) includes Exhibit B requiring attribution in Larger Works. Credits reachable only through a menu are not the implementation strategy. The shell shows the attribution on every initial window display, in ordinary readable body text:

> citeproc-js implements the Citation Style Language
> (c) Frank Bennett
> https://citationstyles.org/

The Help → Third-party licenses dialog repeats it and reveals the bundled notices/source in the OS file manager. This is required legal attribution, with no promotional link or remote request. When Stage 8 replaces the welcome screen, keep equally prominent initial-session attribution. Do not hide it in a collapsed view or remove it during UI redesign.

The full CPAL text, original dual-license notice and unmodified readable processor source ship together in the positive `resources/licenses/` package allowlist. This uses same-media source delivery rather than depending on a future hosted download. `NOTICE.txt` explains source rights, exact location and upstream origin; application terms must not restrict those rights. No processor source was modified. If future work changes covered code, include the changes/date, applicable source and notices under CPAL; reassess licensing before mixing that source into app files. Sections 3, 14 and 15 and Exhibits A/B are retained in full, not replaced by this summary.

## Selected citation assets

The exact downloaded bytes, upstream commit URLs, SHA-256 identifiers and lengths are in `resources/asset-manifest.json`. No app startup fetch or implicit style update exists.

| Asset | Selected version / identity | Attribution |
| --- | --- | --- |
| `styles/apa.csl` | APA Style 7th edition; CSL update 2026-02-07; `http://www.zotero.org/styles/apa` | Brenton M. Wiernik and Andrew Dunning; complete XML notices retained |
| `styles/chicago-notes-bibliography.csl` | Chicago Manual of Style **18th edition**, notes and bibliography; CSL update 2025-02-09; `http://www.zotero.org/styles/chicago-notes-bibliography` | Andrew Dunning; complete XML notices retained |
| `locales/locales-en-US.xml` | Pinned en-US locale | CSL project and contributors; notices retained |

Styles and locale use CC BY-SA 3.0. Keep author/license links and notices with copies, and license adaptations of those assets accordingly; this does not put user-authored manuscripts under CC BY-SA. The files are unmodified. Their licenses are separate from citeproc's license. Source repository licensing statements ship as local READMEs. [CSL styles licensing](https://github.com/citation-style-language/styles#licensing), [CSL locale licensing](https://github.com/citation-style-language/locales#licensing).

`createCitationFormatter()` accepts only the two fixed bundled styles and en-US locale. It rejects oversized XML and DTD/entity declarations; there is no external XML resolver or arbitrary CSL upload route. Stage 5/15 must carry approved asset bytes, identity, hashes and notices with projects rather than assume future installed defaults reproduce old output. Arbitrary imported style parsing remains outside this adapter.

One processor instance is created per compilation. Citation clusters are processed in order with prior citation IDs and final note indexes; all returned updates are applied, including earlier occurrences changed by later disambiguation. Bibliography uses that same instance. The [processor API documentation](https://citeproc-js.readthedocs.io/en/latest/running.html) explains why isolated `makeCitationCluster()` calls are unsuitable for this context.

`parse5` 8.0.0 parses generated citation HTML into an allowlisted inert run model, preserving emphasis, small caps, superscript/subscript and safe links. Unexpected markup or processor errors abort instead of disappearing. App/print renderers never receive citeproc HTML directly. Library logging is replaced at the adapter boundary with bounded errors to avoid content-bearing logs. The processor source file itself is unchanged.

Stage 11 owns full source import normalization/provenance; Stage 15 owns incomplete-metadata warnings and correction. This adapter accepts the planned six work types and checks IDs/record budgets, but does not certify bibliographic accuracy. Both styles, repeated references, locators and same-author/year disambiguation require independent user review through the later product citation/export UI. No examples were generated or rendered in Stage 3.
