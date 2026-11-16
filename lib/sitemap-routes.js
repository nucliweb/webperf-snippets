// The routes of the pages come from the page map of Nextra: folders hold `children`,
// pages carry a `route` and the `_meta` files carry `data`. A folder is not a page.
function collectRoutes(pageMap) {
  return pageMap.flatMap((item) => {
    if (item.children) return collectRoutes(item.children)
    return item.route ? [item.route] : []
  })
}

// `lastModifiedOf` gives the date of a route, or undefined for a page without one
function sitemapEntries(routes, siteUrl, lastModifiedOf = () => undefined) {
  return routes.map((route) => {
    const lastModified = lastModifiedOf(route)
    return { url: route === '/' ? siteUrl : `${siteUrl}${route}`, ...(lastModified ? { lastModified } : {}) }
  })
}

function robotsRules(siteUrl) {
  return {
    rules: { userAgent: '*', allow: '/' },
    host: siteUrl,
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}

module.exports = { collectRoutes, sitemapEntries, robotsRules }
