// Asset generation only: keeps the approved master and adds a macOS-only icon mask.
// Requires macOS AppKit/osascript, sips and iconutil. Assets are committed for all platforms.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  throw new Error(
    'Regenerate icons on macOS with sips and iconutil; other platforms use the committed assets.'
  )
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const master = join(root, 'resources/branding/collie-writer-master.png')
const build = join(root, 'build')
const iconset = join(build, 'icon.iconset')
const renderer = join(root, 'src/renderer/src/assets/collie-writer.png')
const scratch = mkdtempSync(join(tmpdir(), 'collie-icon-assets-'))

function generate(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(
      `${command} could not generate the icon assets: ${result.stderr || result.stdout}`
    )
}

function generateMacIcon(output) {
  // AppKit draws into an offscreen bitmap; this does not launch the app or open a window.
  // Keep the 832px tile centered in a 1024px transparent canvas so it fits the Dock.
  generate('/usr/bin/osascript', [
    '-l',
    'JavaScript',
    '-e',
    String.raw`
      ObjC.import('AppKit')
      function run(args) {
        const image = $.NSImage.alloc.initWithContentsOfFile(args[0])
        if (!image || !image.isValid) throw new Error('Cannot read the approved icon master')
        const canvas = 1024
        const inset = 96
        const radius = 185
        const bitmap = $.NSBitmapImageRep.alloc
          .initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
            null, canvas, canvas, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0
          )
        const context = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmap)
        if (!context) throw new Error('Cannot create the macOS icon bitmap')
        $.NSGraphicsContext.saveGraphicsState
        try {
          $.NSGraphicsContext.setCurrentContext(context)
          context.imageInterpolation = $.NSImageInterpolationHigh
          context.shouldAntialias = true
          const bounds = $.NSMakeRect(0, 0, canvas, canvas)
          $.NSRectFillUsingOperation(bounds, $.NSCompositingOperationClear)
          const tile = $.NSMakeRect(inset, inset, canvas - 2 * inset, canvas - 2 * inset)
          $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(tile, radius, radius).addClip
          image.drawInRectFromRectOperationFraction(
            tile, $.NSZeroRect, $.NSCompositingOperationSourceOver, 1
          )
        } finally {
          $.NSGraphicsContext.restoreGraphicsState
        }
        const png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}))
        if (!png || !png.writeToFileAtomically(args[1], true)) {
          throw new Error('Cannot write the macOS icon PNG')
        }
      }
    `,
    master,
    output
  ])
}

try {
  mkdirSync(iconset, { recursive: true })
  mkdirSync(dirname(renderer), { recursive: true })
  const macMaster = join(scratch, 'mac-1024.png')
  generateMacIcon(macMaster)
  for (const size of [16, 32, 64, 128, 256, 512]) {
    generate('/usr/bin/sips', [
      '-s',
      'format',
      'png',
      '-z',
      String(size),
      String(size),
      macMaster,
      '--out',
      join(scratch, `mac-${size}.png`)
    ])
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    generate('/usr/bin/sips', [
      '-s',
      'format',
      'png',
      '-z',
      String(size),
      String(size),
      master,
      '--out',
      join(scratch, `${size}.png`)
    ])
  }
  for (const size of [16, 32, 128, 256, 512]) {
    copyFileSync(join(scratch, `mac-${size}.png`), join(iconset, `icon_${size}x${size}.png`))
    copyFileSync(join(scratch, `mac-${size * 2}.png`), join(iconset, `icon_${size}x${size}@2x.png`))
  }
  generate('/usr/bin/iconutil', [
    '--convert',
    'icns',
    '--output',
    join(scratch, 'icon.icns'),
    iconset
  ])

  // Windows ICO directory followed by PNG frames (supported by Windows 11).
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const frames = sizes.map((size) => readFileSync(join(scratch, `${size}.png`)))
  const directory = Buffer.alloc(6 + sizes.length * 16)
  directory.writeUInt16LE(1, 2) // ICO type, rather than cursor.
  directory.writeUInt16LE(sizes.length, 4)
  let offset = directory.length
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16
    directory.writeUInt8(size === 256 ? 0 : size, entry)
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1)
    directory.writeUInt16LE(1, entry + 4) // Color planes.
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(frames[index].length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += frames[index].length
  })
  writeFileSync(join(build, 'icon.ico'), Buffer.concat([directory, ...frames]))
  copyFileSync(join(scratch, 'icon.icns'), join(build, 'icon.icns'))
  copyFileSync(macMaster, join(build, 'icon-mac.png'))
  copyFileSync(join(scratch, '1024.png'), join(build, 'icon.png'))
  copyFileSync(join(scratch, '256.png'), renderer)
  console.log(
    'Generated build/icon.iconset, icon.icns, icon-mac.png, icon.ico, icon.png and the renderer logo from the approved master.'
  )
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
