const fs = require('fs')
const path = require('path')

// A _meta.js file is `export default { ... }` with a literal object, so the scripts
// read it without a module loader and work the same on every Node version.
function readMeta(dir) {
  const metaPath = path.join(dir, '_meta.js')
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Missing _meta.js in ${dir}`)
  }
  const source = fs.readFileSync(metaPath, 'utf8')
  const body = source.replace(/^\s*export\s+default\s+/, '')
  return new Function(`return (${body.trim().replace(/;$/, '')})`)()
}

module.exports = { readMeta }
