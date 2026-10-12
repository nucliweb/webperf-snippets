import test from 'node:test'
import assert from 'node:assert/strict'
import { createSettings, DEFAULTS } from './settings.js'

// An area of chrome.storage: get and set return promises
function area(initial = {}) {
  const data = { ...initial }
  return {
    data,
    get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, items),
  }
}

test('without saved values, the settings are the defaults', async () => {
  const settings = createSettings({ sync: area(), local: area() })
  assert.deepEqual(await settings.load(), DEFAULTS)
})

test('the preferences come from the synced area and the state of the panel from the local one', async () => {
  const sync = area({ theme: 'dark', side: 'right' })
  const local = area({ sidebar: 'collapsed', snippet: 'LCP' })
  assert.deepEqual(await createSettings({ sync, local }).load(), { theme: 'dark', side: 'right', sidebar: 'collapsed', snippet: 'LCP' })
})

test('save writes the preferences to the synced area and the rest to the local one', async () => {
  const sync = area()
  const local = area()
  const settings = createSettings({ sync, local })
  await settings.save('theme', 'light')
  await settings.save('side', 'right')
  await settings.save('sidebar', 'collapsed')
  await settings.save('snippet', 'TTFB')
  assert.deepEqual(sync.data, { theme: 'light', side: 'right' })
  assert.deepEqual(local.data, { sidebar: 'collapsed', snippet: 'TTFB' })
})

test('a value saved in the old place of the setting is ignored', async () => {
  const settings = createSettings({ sync: area({ snippet: 'LCP' }), local: area({ theme: 'dark' }) })
  assert.deepEqual(await settings.load(), DEFAULTS)
})

test('without chrome.storage, or when it fails, the panel keeps the defaults and saving does nothing', async () => {
  assert.deepEqual(await createSettings(undefined).load(), DEFAULTS)
  await createSettings(undefined).save('theme', 'dark')
  const failing = { get: async () => Promise.reject(new Error('quota')), set: async () => Promise.reject(new Error('quota')) }
  const settings = createSettings({ sync: failing, local: failing })
  assert.deepEqual(await settings.load(), DEFAULTS)
  await settings.save('theme', 'dark')
})
