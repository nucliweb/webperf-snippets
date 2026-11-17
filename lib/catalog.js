const fs = require('fs')
const path = require('path')
const { readMeta } = require('../scripts/read-meta')
const { readPageInfo } = require('./page-info')

// The pages of a category of snippets, as its catalog shows them: in the order of the sidebar (its
// _meta.js), each with the title and the description of its page. Read at build time, so a new page
// is in the catalog as soon as it is in _meta.js.
function categoryCatalog(contentDir, category) {
  const rootMeta = readMeta(contentDir)
  const meta = readMeta(path.join(contentDir, category))
  const pages = Object.keys(meta)
    .filter((slug) => slug !== 'index')
    .map((slug) => {
      const { title, description } = readPageInfo(contentDir, `${category}/${slug}`)
      return { slug, title, description, url: `/${category}/${slug}` }
    })
  return { category, title: rootMeta[category]?.title ?? category, pages }
}

// The folders of the site that have a page of their own (an index.mdx), in the order of the sidebar:
// the snippet categories and DevTools Overrides. Each with its title, URL, description and number of pages.
function siteCategories(contentDir) {
  const rootMeta = readMeta(contentDir)
  return Object.keys(rootMeta)
    .filter((category) => fs.existsSync(path.join(contentDir, category, 'index.mdx')))
    .map((category) => ({
      category,
      title: rootMeta[category].title ?? category,
      url: `/${category}`,
      description: readPageInfo(contentDir, `${category}/index`).description,
      count: categoryCatalog(contentDir, category).pages.length,
    }))
}

// The categories of snippets, the ones the home lists: DevTools Overrides is a technique to run a
// snippet before the page, with a page of its own but not a category of measurements
function snippetCategories(contentDir) {
  return siteCategories(contentDir).filter((c) => c.category !== 'DevTools-Overrides')
}

module.exports = { categoryCatalog, siteCategories, snippetCategories }
