# Stage 19 local files, network and controlled surfaces

October 1, 2026 source/config inventory. This records implemented paths and policy, not observed native traffic or an exhaustive binary audit. User-led clean-machine observation is pending.

Stage 20 adds an optional, explicitly invoked main-process purchase transport and OS-encrypted connection store; its origin/key configuration is currently absent and checkout remains disabled. The renderer's request policy is unchanged. The table below is the Stage 19 checkpoint; consult the current [direct service contract](../formats/direct-commerce-v1.md) and [D7](../decisions/D7-direct-commerce.md) for the additional non-content purchase/browser boundaries.

| Area | Current behavior and boundary |
| --- | --- |
| Working root | Verified internal unsynced folder. `workspaces/` holds SQLite/WAL, originals, excerpts, local history and recovery; `reset-recovery/`, file-operation candidates and retained previous copies are preserved. Stage 7 Data Locations lists work/recovery and size. |
| Chosen project files | Native Save/Save As/Backup/Move pickers create separate `.collie` files. The first Save is explicit. Customer cloud storage may later sync a chosen file; the app reports local write/reopen, never upload completion. |
| Rebuildable data | Search projections can be rebuilt. Picker history is a folder hint that can be cleared. Source originals, selected files, backups, excerpts, snapshot candidates and unsaved recovery are retained content, not disposable cache. |
| Visual settings | Zoom, contrast and motion choices contain no manuscript data and use the local Chromium app profile. |
| Access | `access/` under working root holds the local free/sample scopes and authentic signed grant cache. No key or grant is supplied in this checkout. Project archives do not carry access material. Future service credentials must use protected OS storage under Stage 20. |
| Tutorial | Bundled fictional `.txt` source is copied into a separately identified local sample. Fresh sample creation keeps the previous workspace; reset does not delete personal work. |
| Support preview | Only version numbers, platform/architecture, storage state, uptime and allowlisted error codes. No path, URL, title, text, hash, account value, free-form error string, file or attachment. The user decides whether to copy it; no send function exists. |
| Network | Production CSP and session request filter allow bundled `collie://app`, `collie-source://asset` and matching blob resources. PDF/source inspection fetches authorized app-local asset bytes. Development origin is restricted to loopback. No automatic crash upload, analytics, ad tracking, purchase call or updater is configured. System spellcheck and OS services are outside the app's managed network claims. |
| External links | The Help menu's Electron security documentation link requires a native user confirmation and opens the OS browser. Project DOI/URL metadata are inert identifiers. Future checkout/update links need their own explicit Stage 20/21 review. |
| App-controlled surfaces | Shell, Access, tutorial, settings/privacy, Help/About/license dialogs, project/editor, source/research, export and file/recovery panels contain no advertising, sponsored/affiliate recommendation or promotional upsell placement in source. Intended prices appear only as factual access information. |
| Bundled dependencies | The direct package manifest lists editor, citation, document, local archive and parser libraries; no advertising SDK, analytics SDK, crash uploader or merchant client. Build resources are allowlisted in `electron-builder.yml`, including the tutorial text. Native packaged contents and dependency behavior still need user-owned observation. |

The expected clean-machine offline session needs only local app assets and the writer's chosen disk. If a user observes off-app traffic, a hidden dependency, or a content-bearing payload, record the exact user-observed behavior and treat it as a release blocker until explained or removed. No app-controlled advertising surface is permitted in any access state.
