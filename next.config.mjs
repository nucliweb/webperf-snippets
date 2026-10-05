import path from 'node:path'
import { createRequire } from 'node:module'
import nextra from 'nextra'
import remarkSnippetPrompt from './lib/remark-snippet-prompt.mjs'

const require = createRequire(import.meta.url)
const rehypeIcons = require('./lib/rehype-icons')
const remarkBrowserSupport = require('./lib/remark-browser-support')

const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: [remarkBrowserSupport, remarkSnippetPrompt],
    rehypePlugins: [rehypeIcons],
  },
})

export default withNextra({
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  webpack(config) {
    const snippetsDir = path.join(import.meta.dirname, 'snippets')

    // Exclude snippets from pre-loaders (React Fast Refresh, etc.)
    for (const rule of config.module.rules) {
      if (rule.enforce === 'pre') {
        rule.exclude = [].concat(rule.exclude || [], snippetsDir)
      }
    }

    // Next 16 keeps its SWC rule outside `oneOf`, so every other rule that handles `.js` must skip
    // the snippets, or the loaders rewrite the code before it becomes a string
    const rawRule = {
      test: /\.js$/,
      include: snippetsDir,
      resourceQuery: /raw/,
      type: 'asset/source',
    }
    const usesSwc = (rule) =>
      [].concat(rule.use || rule.loader || []).some((use) => String(typeof use === 'string' ? use : use?.loader).includes('next-swc-loader'))
    const skipSnippets = (rules) => {
      for (const rule of rules) {
        if (rule.oneOf) skipSnippets(rule.oneOf)
        if (usesSwc(rule)) rule.exclude = [].concat(rule.exclude || [], snippetsDir)
      }
    }
    skipSnippets(config.module.rules)
    config.module.rules.unshift(rawRule)

    return config
  },
  async redirects() {
    return [
      {
        source: "/Loading/Find-Above-The-Fold-Lazy-Loades-Images",
        destination: "/Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
        permanent: true,
      },
      {
        source: "/Loading/Inline-Script-Info-and-Size-Including__NEXT_DATA",
        destination: "/Loading/SSR-Hydration-Data-Analysis",
        permanent: true,
      },
      {
        source: "/CoreWebVitals/LCP-Sub-Parts",
        destination: "/CoreWebVitals/LCP-Subparts",
        permanent: true,
      },
    ];
  },
});

// If you have other Next.js configurations, you can pass them as the parameter:
// module.exports = withNextra({ /* other next.js config */ })
