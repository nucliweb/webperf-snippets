# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WebPerf Snippets** is a curated collection of web performance measurement JavaScript snippets designed for use in browser consoles or Chrome DevTools. The project is a documentation website built with Next.js and Nextra, serving as a comprehensive resource for web performance analysis tools.

## Architecture

### Technology Stack
- **Framework**: Next.js 13+ with Nextra documentation theme
- **Theme**: nextra-theme-docs for documentation layout
- **Media**: Cloudinary integration via next-cloudinary for optimized images/videos
- **Deployment**: Vercel
- **Analytics**: Google Analytics and DebugBear monitoring

### Project Structure

```
pages/
├── _app.js                  # Next.js app wrapper with analytics scripts
├── _meta.json              # Top-level navigation configuration
├── index.mdx               # Homepage with introduction and video
├── CoreWebVitals/          # LCP, CLS, and related metrics
│   ├── _meta.json
│   └── *.mdx
├── Loading/                # Resource loading, TTFB, scripts, fonts analysis
│   ├── _meta.json
│   └── *.mdx
└── Interaction/            # User interaction and animation frame metrics
    ├── _meta.json
    └── *.mdx

theme.config.jsx            # Nextra theme configuration (branding, SEO, footer)
next.config.js              # Next.js + Nextra configuration with redirects
```

### Content Organization

The documentation uses Nextra's file-system based routing:
- Each category has its own directory under `pages/`
- Individual snippets are documented in `.mdx` files with executable JavaScript code
- Navigation structure is controlled by `_meta.json` files in each directory
- All snippets are JavaScript code meant for Chrome DevTools console execution

### Key Configuration Files

- **theme.config.jsx**: Site branding (logo SVG), SEO meta tags, Open Graph settings, footer, sidebar configuration
- **pages/_app.js**: Next.js app wrapper that includes DebugBear and Google Analytics scripts
- **next.config.js**: Nextra integration and URL redirects for renamed pages

## Development Commands

```bash
# Build the production site
npm run build

# Development server (standard Next.js command - not in package.json)
npx next dev

# No tests configured
npm test  # Will show error message
```

## Content Guidelines

When working with snippet documentation:

1. **Code Blocks**: Use the `copy` prop in code fences to enable easy copying to DevTools
   ```mdx
   ```js copy
   // snippet code here
   ```
   ```

2. **Snippet Structure**: Each snippet should include:
   - Clear title and description
   - Reference to relevant web.dev documentation for metrics
   - Usage instructions
   - Executable JavaScript code optimized for Chrome DevTools

3. **Performance Context**: Snippets focus on measuring:
   - Core Web Vitals (LCP, CLS, etc.)
   - Resource loading metrics (TTFB, render-blocking resources)
   - User interaction and animation frames
   - Script and font analysis

4. **MDX Features**: Pages can import and use:
   - `CldVideoPlayer` from next-cloudinary for video embeds
   - Standard React components
   - Cloudinary URLs for optimized images

## Navigation Management

To add a new snippet or category:

1. Create the `.mdx` file in the appropriate category directory
2. Add an entry to the corresponding `_meta.json` file with title and ordering
3. Use kebab-case for file names (e.g., `LCP-Sub-Parts.mdx`)
4. If creating a redirect for a renamed page, update `next.config.js`

Example `_meta.json` entry:
```json
{
  "LCP": {
    "title": "LCP"
  }
}
```
