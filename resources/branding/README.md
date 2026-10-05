# Collie Writer artwork

`collie-writer-master.png` is the original, unchanged PNG approved by Josh on October 3, 2026. It was created with the built-in image-generation tool and copied into this repository after approval. It is the source of truth for the app's artwork; generated platform assets are derived from this file.

The approved refinement depicts a sweet black-and-white Border Collie holding a golden pencil, with a tilted head, soft painted illustration and a close composition that retains the complete head and ears. Its pale sage background was prompted from the app's `#c8e2d2` palette color. The image contains no wordmark; the UI supplies accessible text beside it.

Derived assets:

| Path                                        | Purpose                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `build/icon.iconset/`                       | macOS 16, 32, 128, 256 and 512-point images, each at 1× and 2×                        |
| `build/icon.icns`                           | macOS application bundle icon                                                         |
| `build/icon.ico`                            | Windows application/installer icon, with 16, 24, 32, 48, 64, 128 and 256-pixel frames |
| `build/icon.png`                            | 1024-pixel native image, including the development macOS Dock                         |
| `src/renderer/src/assets/collie-writer.png` | 256-pixel image shared by the header and About screen                                 |

Run `npm run icons:generate` on macOS to regenerate these assets after an explicitly approved master update. The script uses macOS `sips` and `iconutil`, plus Node's standard library for the ICO container. It resizes the complete square artwork, preserves the original master, and never starts or packages the app. No image-generation service, API key or additional package is needed for resizing. Generated assets are committed, so Windows development and packaging do not require these macOS tools.

Brand placement and native rendering are **implementation complete — awaiting user testing**. See the [implementation record](../../docs/validation/app-branding.md) and [manual guide](../../docs/manual-testing/app-branding.md).
