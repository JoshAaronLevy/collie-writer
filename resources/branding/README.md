# Collie Writer artwork

`collie-writer-master.png` is the original, unchanged PNG approved by Josh on October 3, 2026. It was created with the built-in image-generation tool and copied into this repository after approval. It is the source of truth for the app's artwork; generated platform assets are derived from this file.

The approved refinement depicts a sweet black-and-white Border Collie holding a golden pencil, with a tilted head, soft painted illustration and a close composition that retains the complete head and ears. Its pale sage background was prompted from the app's `#c8e2d2` palette color. The image contains no wordmark; the UI supplies accessible text beside it.

Derived assets:

| Path                                        | Purpose                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `build/icon.iconset/`                       | macOS 16, 32, 128, 256 and 512-point images, each at 1× and 2×                        |
| `build/icon.icns`                           | macOS application bundle icon                                                         |
| `build/icon.ico`                            | Windows application/installer icon, with 16, 24, 32, 48, 64, 128 and 256-pixel frames |
| `build/icon-mac.png`                        | 1024-pixel macOS development Dock icon with transparent padding and rounded corners   |
| `build/icon.png`                            | 1024-pixel generic native image                                                       |
| `src/renderer/src/assets/collie-writer.png` | 256-pixel image shared by the header and About screen                                 |

Run `npm run icons:generate` on macOS to regenerate these assets after an approved artwork or icon-treatment update. The script uses macOS AppKit through `osascript`, `sips` and `iconutil`, plus Node's standard library for the ICO container. It preserves the original master and never starts or packages the app. No image-generation service, API key or additional package is needed. Generated assets are committed, so Windows development and packaging do not require these macOS tools.

The October 6 Dock correction derives the macOS PNG and every ICNS representation from one offscreen bitmap: an 832-pixel artwork tile centered in a transparent 1024-pixel canvas, with 96-pixel margins and a 185-pixel corner radius. The whole square artwork is scaled into that tile before the corners are masked. This reduces the visible footprint to about 81% of the canvas and gives the Dock and Finder a rounded silhouette. `src/main/windows.ts` selects `build/icon-mac.png` for the unpackaged macOS Dock; packaged macOS uses `build/icon.icns`. Windows, the generic native PNG and the renderer logo continue to use the original square treatment.

Brand placement and native rendering are **implementation complete — awaiting user testing**. See the [implementation record](../../docs/validation/app-branding.md) and [manual guide](../../docs/manual-testing/app-branding.md).

PS01 explicitly reuses `build/icon.icns` and `build/icon.ico` for direct production `.collie` document associations. Association icon paths are relative to `build/` in the platform-specific configuration; beta/development do not register the production type. The artwork was not regenerated. Installed document-icon and guarded double-click behavior remain pending user observation; see the [PS01 record](../../docs/validation/project-storage-PS01.md) and [manual guide](../../docs/manual-testing/project-storage-PS01.md).
