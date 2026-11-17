const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// The responsive images of the pages: <img> with a srcSet, in the MDX of content/
const CONTENT = path.join(__dirname, '..', 'content')
const pages = fs.readdirSync(CONTENT, { recursive: true }).filter((file) => file.endsWith('.mdx'))
const images = pages.flatMap((page) => {
  const source = fs.readFileSync(path.join(CONTENT, page), 'utf8')
  return [...source.matchAll(/<img\b[^>]*\bsrcSet=[^>]*>/g)].map(([tag]) => {
    const attr = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
    return { page, sizes: attr('sizes'), alt: attr('alt'), widths: [...attr('srcSet').matchAll(/ (\d+)w/g)].map((m) => Number(m[1])) }
  })
})

test('the pages have responsive images to check', () => {
  assert.ok(images.length >= 3)
})

// The column of a page is as wide as a phone and at most 832px on the widest screen, so a single
// share of the viewport, such as 85vw, asks a desktop for an image that is far too large
test('the sizes of an image give the width of the column in px for wide screens', () => {
  for (const { page, sizes } of images) assert.match(sizes ?? '', /\(min-width: \d+px\) \d+px/, `${page}: sizes="${sizes}"`)
})

// A column of 672px with files of 600 and 1200px gets the 1200px one: the widths need one in between
test('the srcSet of an image has a file between 600 and 1000px, for a column at one pixel per point', () => {
  for (const { page, widths } of images) assert.ok(widths.some((w) => w > 600 && w < 1000), `${page}: ${widths.join(', ')}`)
})

test('the alt of an image says what it shows, in more than a name', () => {
  for (const { page, alt } of images) assert.ok((alt ?? '').split(/\s+/).length >= 8, `${page}: alt="${alt}"`)
})
