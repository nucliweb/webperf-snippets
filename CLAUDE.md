# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **WebPerf Snippets** - a curated collection of web performance measurement JavaScript snippets designed for use in browser consoles or Chrome DevTools. The project is a documentation website built with Next.js and Nextra, serving as a comprehensive resource for web performance analysis tools.

## Architecture

### Technology Stack
- **Framework**: Next.js 13+ with Nextra (documentation theme)
- **Theme**: nextra-theme-docs for documentation layout
- **Media**: Cloudinary integration via next-cloudinary for optimized images/videos
- **Deployment**: Configured for Vercel

### Project Structure
- `pages/` - MDX documentation files organized by performance categories:
  - `CoreWebVitals/` - LCP, CLS, and related metrics
  - `Loading/` - Resource loading, TTFB, scripts, fonts analysis
  - `Interaction/` - User interaction and animation frame metrics
- `_meta.json` files - Define navigation structure and page titles
- `theme.config.jsx` - Nextra theme configuration with custom branding
- `next.config.js` - Next.js configuration with Nextra integration and redirects

### Content Organization
The documentation follows a hierarchical structure where:
- Each category has its own directory under `pages/`
- Individual snippets are documented in `.mdx` files with code examples
- Navigation is controlled via `_meta.json` files in each directory
- All snippets are JavaScript code meant for browser execution

## Development Commands

### Build & Development
```bash
# Build the project
npm run build

# No dev server command defined - check with maintainer
# Note: Standard Next.js commands likely work (npm run dev)
```

### Testing
```bash
# No tests configured
npm test  # Will show error message
```

## Key Files to Understand

- `theme.config.jsx` - Contains site branding, meta tags, and navigation configuration
- `pages/_app.js` - Next.js app wrapper
- `pages/index.mdx` - Homepage with project introduction and video
- Individual snippet files contain executable JavaScript with explanations

## Content Guidelines

When working with snippet documentation:
- Each snippet should include clear explanations and usage instructions
- Code blocks use the `copy` prop for easy copying to DevTools
- Snippets are designed for Chrome DevTools console execution
- Focus on web performance metrics (Core Web Vitals, loading, interactions)
- Include performance measurement context and interpretation guidance

## Navigation Structure

The site uses Nextra's file-system based routing with `_meta.json` files controlling:
- Page order in navigation
- Display titles
- Category organization

Content is organized around web performance measurement topics, making it easy for developers to find relevant performance analysis tools.