import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_URL, middleEllipsis, withLongUrls, EXPAND_URLS } from './long-url.js'

const LONG = 'https://shop.example/es-es?aid=branding&source=mkt&utm_source=search&utm_campaign=ES_Branding&gclid=Cj0KCQ&tid=01m6s2916cmsmexczn3f3y120v'

test('a long URL keeps its start and its end, with an ellipsis in the middle', () => {
  const short = middleEllipsis(LONG)
  assert.equal(short.length, MAX_URL)
  assert.ok(short.startsWith('https://shop.example/es-es?aid='), short)
  assert.ok(short.endsWith('tid=01m6s2916cmsmexczn3f3y120v'), short)
  assert.equal(short.split('…').length, 2)
})

test('two URLs that start alike stay apart once shortened', () => {
  const other = LONG.replace('tid=01m6s2916cmsmexczn3f3y120v', 'tid=99zzz2916cmsmexczn3f3y120v')
  assert.notEqual(middleEllipsis(LONG), middleEllipsis(other))
})

test('a URL up to the limit stays whole', () => {
  const url = 'https://shop.example/products/shoes?id=1'
  assert.equal(middleEllipsis(url), url)
})

test('a long URL in a text is shortened and keeps the whole URL, and the rest of the text is escaped', () => {
  const { html, long } = withLongUrls(`<b>${LONG}</b> imports https://shop.example/a.css.`)
  assert.equal(long, true)
  assert.ok(html.startsWith('&lt;b&gt;<span class="long-url"'), html)
  assert.ok(html.includes(`data-full="${LONG.replaceAll('&', '&amp;')}"`), html)
  assert.ok(html.includes(`title="${LONG.replaceAll('&', '&amp;')}"`), html)
  assert.ok(html.includes(`>${middleEllipsis(LONG).replaceAll('&', '&amp;')}</span>&lt;/b&gt;`), html)
  // A short URL stays as it is, and the full stop after it is not part of it
  assert.ok(html.endsWith(' imports https://shop.example/a.css.'), html)
})

test('a text without long URLs is only escaped', () => {
  assert.deepEqual(withLongUrls('Add width & height to https://shop.example/a.png'), {
    html: 'Add width &amp; height to https://shop.example/a.png',
    long: false,
  })
})

test('the button that shows the whole URLs starts folded', () => {
  assert.match(EXPAND_URLS, /<button type="button" class="expand-urls" aria-expanded="false" title="Show the whole URL"/)
})
