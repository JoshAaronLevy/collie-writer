# Stage 5 dependency/resource inventory

September 29, 2026. Exact production packages added: **yazl 3.3.1 (MIT)**, **yauzl 3.4.0 (MIT)** and **saxes 6.0.0 (ISC)**. Types: `@types/yazl 3.3.1` and `@types/yauzl 3.4.0` (MIT). Production transitives are `buffer-crc32 1.0.0`, `pend 1.2.0` and `xmlchars 2.2.0` (MIT).

Actual installed manifests, README/API sources and licenses informed the implementation. Complete notices were copied into `resources/licenses/`; saxes' npm distribution lacks its standalone LICENSE, so its unmodified license was retrieved from the [v6.0.0 upstream tag](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE). Its upstream repository is archived; keep its small bounded, exact-hash XML use under review before release. The XML validator neither resolves external entities nor selects remote dependencies.

`resources/asset-manifest.json` records notice origins, byte sizes and hashes for packaging provenance. The existing `licenses/**` resource allowlist includes them; no packaging pipeline change was needed. Required Stage 3 attribution and notices remain intact. No advertisement, analytics or content-hosting dependency was added.

Dependencies were installed with the pinned Node/npm toolchain using `--save-exact --ignore-scripts --no-audit --no-fund`. Both installations completed; no package scripts, audit, build or tests ran. Metadata/license/source inspection is not a vulnerability assessment or native compatibility result. Artifact inclusion, full dependency security review and runtime acceptance remain user-owned release gates.
