const fs = require('fs')
const path = require('path')

function htmlCount(dir) {
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((count, entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return count + htmlCount(full)
    return count + (entry.name.endsWith('.html') ? 1 : 0)
  }, 0)
}

// Where `next build` leaves the HTML of the prerendered pages. A build adapter, which Vercel
// uses, stores it in the route cache (server/route-cache/APP_PAGE/<hash>/$) and leaves
// server/app without any HTML. The folder with the most pages is the one of the content pages.
function findPrerenderedDir(nextDir) {
  const appDir = path.join(nextDir, 'server', 'app')
  if (htmlCount(appDir) > 0) return appDir

  const cacheDir = path.join(nextDir, 'server', 'route-cache', 'APP_PAGE')
  let best = null
  let bestCount = 0
  if (fs.existsSync(cacheDir)) {
    for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(cacheDir, entry.name, '$')
      const count = htmlCount(candidate)
      if (count > bestCount) {
        best = candidate
        bestCount = count
      }
    }
  }
  if (best) return best

  throw new Error(`No prerendered HTML found in ${appDir} or in ${cacheDir}. Run \`next build\` first.`)
}

module.exports = { findPrerenderedDir }
