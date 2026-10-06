# PS08 archive writer policy — Container v1

October 5, 2026. Addendum to [archive v1](collie-v1.md) and [D6](../decisions/D6-portable-snapshots.md). Portable SQL/minimum reader **13**, AST/archive **1** and compilation **3** are unchanged. This changes new archive creation, with runtime acceptance pending.

## Entry policy

`src/worker/projects/archive-policy.ts` derives one plan from the strict manifest and exact supported citation profile. `archive.ts` streams every entry with yazl's lazy reader API, explicit compression level, regular mode 0100600 and no comments. The archive remains ZIP64 with the same exact names and inventory.

| Entry                    | New writer policy                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `project.sqlite`         | Raw ZIP deflate, level 6.                                                                                               |
| `manifest.json`          | Deflate level 6 through 2 MiB; larger permitted manifests remain stored.                                                |
| `citation-assets/<hash>` | Deflate level 6 for the exact supported style/locale/notice text through 2 MiB. All five current pinned assets qualify. |
| `blobs/<hash>`           | Stored, level 0, including text-like or already compressed attachments. Hash names do not establish media types.        |

No working database or managed original is compressed in place. Existing project files remain untouched until an explicit ordinary Save replaces its selected destination through the existing staged publication contract. Save As, Backup, Move and snapshot-producing operations share the new writer; copying an already completed candidate preserves that candidate's bytes. No automatic archive conversion, compression setting or cache purge is added.

The reader already accepts methods 0 and 8. Both old stored entries and new deflated entries still undergo declared/streamed expanded-size checks, CRC32, expanded SHA-256 matching, exact citation profile validation and strict database/graph inspection. The manifest records expanded lengths and digests, never compressed lengths. Reader expansion remains 100 GiB including the manifest; entry count and per-entry limits are unchanged. The writer now includes the actual serialized manifest in this total before creation. Supported historical SQL/minimum-reader combinations retain their existing migration behavior; no SQL migration is added for compression.

## Conservative additional-space budgets

For an expanded deflated entry of `n` bytes, the bound is `n + ceil(n/8) + ceil(n/256) + ceil(n/512) + 64`. This conservatively covers zlib's general fixed-block bound with rounding and extra final-block allowance, rather than relying on compressibility or the tighter default-parameter bound. The implementation uses safe integer arithmetic, avoiding 32-bit shifts at the 4 GiB database limit. See the primary [zlib 1.3.1 deflateBound implementation](https://raw.githubusercontent.com/madler/zlib/v1.3.1/deflate.c).

Define `E` as all expanded entries including the exact JSON bytes, and `A` as the sum of stored lengths or deflate bounds, plus 512 bytes per entry and 512 bytes for the ZIP64 footer. Exact ASCII names are at most 80 bytes; these allowances exceed the pinned writer's local/central headers, permitted timestamp/ZIP64 extras and data descriptors. Planning validates `E` against the reader ceiling and `A` against the physical-file ceiling before allocating an archive.

| Phase                                       | Additional bytes checked before work, besides the existing 64 MiB margin                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot preparation                        | `A + E`: candidate plus its full validation extraction. The captured database and retained older files already consume available space.                                                     |
| Archive writer                              | `A`, with an actual final-length check against that plan.                                                                                                                                   |
| Native Save/Save As/Backup/Move destination | `C + P`, where `C` is the actual completed candidate length and `P` is the previous target length, or zero for a new destination. This covers the sibling stage and retained previous copy. |
| Publication working folder                  | `2 * E` for the stage and final full inspections; add `C + P` when working and destination folders share a device. Compressed candidate length cannot substitute for either extraction.     |
| Archive extraction                          | The inspected inventory's complete expanded length, with the original streamed per-entry and total enforcement.                                                                             |

The shared physical archive ceiling preserves the previous `100 GiB + 32 MiB + 100,000 * 512` allowance, adds 512 footer bytes, and adds bounded deflate overhead for the maximum database, one small manifest and the exact pinned citation files. Native observation/copying and extraction use the same ceiling. This accommodates possible writer expansion without raising expanded-content limits. Retention review keeps its independent tighter physical, expanded, database and count bounds; a smaller compressed archive does not bypass them.

Existing per-device job reservations remain held until actual work settles. They are conservative estimates rather than OS reservations. Space errors still protect local work and retained candidates; changing the destination still requires working-folder space. Actual I/O failure, other applications and unknown capacity retain their existing refusal/recovery behavior.

## Stream ownership and acceptance limits

The pinned yazl stream writer does not forward errors or destroy its internal CRC/size/deflate streams when output fails. The adapter owns the input and each private readable transform at its `pipe` handoff, forwards errors to the archive owner, and destroys them all on cancellation/failure. It awaits output-pipeline completion and owned stream closure before returning. This includes compression-handle settlement before snapshot lease/job ownership is released. Manifest bytes also use this stream path; no separately buffered asynchronous compression callback is used. Expanded byte progress retains its existing meaning rather than claiming an overall percentage or compression ratio.

The writer counts each source's actual expanded bytes while reading and stops if it grows beyond the planned entry length. A source changing after capture cannot consume unbounded compression/output work under its earlier size allowance. Final entry-size comparison and full content validation still reject shorter or changed bytes.

Capture, exact managed-file leases, immutable snapshots, selected-file checks, sibling staging, retained previous versions, pre-publication cancellation and full stage/final validation remain. Publication stops offering cancellation at its original replacement boundary. No settings/profile records, portable metadata or journal formats change.

Space reduction depends on real content. Local working databases, attachments, AI outcome records and existing backups/recovery still consume their own space. CPU, memory, elapsed time, cancellation responsiveness, installed-platform/native behavior and old/new round trips have no runtime evidence in this stage. See the [manual guide](../manual-testing/project-storage-PS08.md) and [implementation record](../validation/project-storage-PS08.md). Release remains NO-GO.
