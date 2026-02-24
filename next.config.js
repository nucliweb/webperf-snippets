const path = require('path')
const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.jsx'
})

module.exports = withNextra({
  webpack(config) {
    const snippetsDir = path.join(__dirname, 'snippets')

    // Exclude snippets from pre-loaders (React Fast Refresh, etc.)
    for (const rule of config.module.rules) {
      if (rule.enforce === 'pre') {
        rule.exclude = [].concat(rule.exclude || [], snippetsDir)
      }
    }

    // Inject into oneOf so our rule takes precedence over the SWC loader
    const rawRule = {
      test: /\.js$/,
      include: snippetsDir,
      resourceQuery: /raw/,
      type: 'asset/source',
    }
    const oneOfRule = config.module.rules.find(r => Array.isArray(r.oneOf))
    if (oneOfRule) {
      oneOfRule.oneOf.unshift(rawRule)
    } else {
      config.module.rules.unshift(rawRule)
    }

    return config
  },
  async redirects() {
    return [
      {
        source: '/Loading/Find-Above-The-Fold-Lazy-Loades-Images',
        destination: '/Loading/Find-Above-The-Fold-Lazy-Loaded-Images',
        permanent: true,
      },
      {
        source: '/Loading/Inline-Script-Info-and-Size-Including__NEXT_DATA',
        destination: '/Loading/SSR-Hydration-Data-Analysis',
        permanent: true,
      },
    ]
  },
})

// If you have other Next.js configurations, you can pass them as the parameter:
// module.exports = withNextra({ /* other next.js config */ })
