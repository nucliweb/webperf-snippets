#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Renders assets/icon.svg, the W of the logo, into the icons of the site and the extension.
// Run it after changing the SVG and commit what it writes.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(ROOT, 'assets/icon.svg'), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()

async function png(size, source = svg) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}"></body>`,
  )
  await page.locator('img').evaluate((img) => img.decode())
  return page.screenshot({ omitBackground: true })
}

// An ICO file whose images are PNGs, which every browser that requests /favicon.ico reads
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size, entry)
    header.writeUInt8(size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map((image) => image.data)])
}

const write = (path, data) => {
  mkdirSync(dirname(join(ROOT, path)), { recursive: true })
  writeFileSync(join(ROOT, path), data)
  console.log(`wrote ${path}`)
}

write('app/icon.svg', svg)
// iOS rounds the corners itself and fills transparent ones with black
write('app/apple-icon.png', await png(180, svg.replace(/ rx="[^"]*"/, '')))
write('app/favicon.ico', ico([{ size: 16, data: await png(16) }, { size: 32, data: await png(32) }, { size: 48, data: await png(48) }]))
// The home page of the panel shows the SVG, next to the logo
write('extension/icons/icon.svg', svg)
for (const size of [16, 32, 48, 128]) write(`extension/icons/icon-${size}.png`, await png(size))

await browser.close()
