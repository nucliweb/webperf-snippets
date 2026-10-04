// The routes of the pages come from the page map of Nextra: folders hold `children`,
// pages carry a `route` and the `_meta` files carry `data`. A folder is not a page.
function collectRoutes(pageMap) {
  return pageMap.flatMap((item) => {
    if (item.children) return collectRoutes(item.children)
    return item.route ? [item.route] : []
  })
}

function sitemapEntries(routes, siteUrl) {
  return routes.map((route) => ({ url: route === '/' ? siteUrl : `${siteUrl}${route}` }))
}

function robotsRules(siteUrl) {
  return {
    rules: { userAgent: '*', allow: '/' },
    host: siteUrl,
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}

module.exports = { collectRoutes, sitemapEntries, robotsRules }
