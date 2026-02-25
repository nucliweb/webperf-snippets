const withNextra = require("nextra")({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.jsx",
});

module.exports = withNextra({
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
    ];
  },
  search: {
    codeblocks: false,
  },
});

// If you have other Next.js configurations, you can pass them as the parameter:
// module.exports = withNextra({ /* other next.js config */ })
