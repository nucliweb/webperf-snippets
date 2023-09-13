const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.jsx'
})

module.exports = withNextra({
  async redirects() {
    return [
      {
        source: '/Loading/Find-Above-The-Fold-Lazy-Loades-Images',
        destination: '/Loading/Find-Above-The-Fold-Lazy-Loaded-Images',
        permanent: true,
      },
    ]
  },
})

// If you have other Next.js configurations, you can pass them as the parameter:
// module.exports = withNextra({ /* other next.js config */ })
