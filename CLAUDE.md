# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **WebPerf Snippets** - a curated collection of web performance measurement JavaScript snippets designed for use in browser consoles or Chrome DevTools. The project is a documentation website built with Next.js (App Router) and Nextra v4, serving as a comprehensive resource for web performance analysis tools.

## Architecture

### Technology Stack

- **Framework**: Next.js 16+ (App Router) with Nextra v4 (documentation theme)
- **Theme**: nextra-theme-docs for documentation layout
- **Media**: Cloudinary integration via next-cloudinary for optimized images/videos
- **Search**: Pagefind (Rust-powered static search engine)
- **Deployment**: Configured for Vercel

### Project Structure

- `content/` - MDX documentation files organized by performance categories:
  - `CoreWebVitals/` - LCP, CLS, and related metrics
  - `Loading/` - Resource loading, TTFB, scripts, fonts analysis
  - `Interaction/` - User interaction and animation frame metrics
- `_meta.json` files - Define navigation structure and page titles
- `app/layout.jsx` - Nextra v4 theme configuration, branding, and metadata (reemplaza `theme.config.jsx`)
- `mdx-components.jsx` - Global MDX components for custom rendering
- `next.config.js` - Next.js configuration with Nextra v4 integration and redirects

### Content Organization

The documentation follows a hierarchical structure where:

- Each category has its own directory under `content/`
- Individual snippets are documented en `.mdx` files with code examples and frontmatter YAML for metadata
- Navigation is controlled via `_meta.json` files in each directory
- All snippets are JavaScript code meant for browser execution

## Development Commands

### Build & Development

```bash
# Build the project
npm run build

# Dev server (Next.js App Router)
npm run dev
```

### Search Index

```bash
# Generate static search index after build
npm run postbuild
```

### Testing

```bash
# No tests configured
npm test  # Will show error message
```

## Key Files to Understand

- `app/layout.jsx` - Configuración global del tema, branding, metadatos y layout (Nextra v4)
- `mdx-components.jsx` - Componentes MDX globales para personalización
- `content/index.mdx` - Homepage con introducción y video
- Individual snippet files contain executable JavaScript with explanations
- `_meta.json` - Navegación y títulos personalizados por carpeta

## Content Guidelines

When working with snippet documentation:

- Each snippet should include clear explanations and usage instructions
- Code blocks use the `copy` prop for easy copying to DevTools
- Snippets are designed for Chrome DevTools console execution
- Focus on web performance metrics (Core Web Vitals, loading, interactions)
- Include performance measurement context and interpretation guidance
- Añade frontmatter YAML (`---`) en cada `.mdx` para título y descripción

## Navigation Structure

The site uses Nextra v4's file-system based routing with `_meta.json` files controlling:

- Page order in navigation
- Display titles
- Category organization

Content is organized around web performance measurement topics, making it easy for developers to find relevant performance analysis tools.
