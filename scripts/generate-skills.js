#!/usr/bin/env node
/**
 * Generates skill.md files from /snippets/ JS files + /pages/ MDX documentation.
 * Output: /skills/webperf-{category}/skill.md + scripts/*.js
 *
 * Run: node scripts/generate-skills.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SNIPPETS_DIR = path.join(ROOT, 'snippets')
const PAGES_DIR = path.join(ROOT, 'pages')
const SKILLS_DIR = path.join(ROOT, 'skills')

const CATEGORIES = {
  CoreWebVitals: {
    skill: 'webperf-core-web-vitals',
    name: 'Core Web Vitals',
    description:
      'Measure and debug Core Web Vitals (LCP, CLS, INP). Use when the user asks about LCP, CLS, INP, page loading performance, or wants to analyze Core Web Vitals on a URL or current page. Compatible with Chrome DevTools MCP.',
  },
  Loading: {
    skill: 'webperf-loading',
    name: 'Loading Performance',
    description:
      'Analyze loading performance (TTFB, FCP, render-blocking resources, scripts, fonts, resource hints, service workers). Use when the user asks about loading time, TTFB, FCP, render-blocking, font loading, script analysis, or prefetching. Compatible with Chrome DevTools MCP.',
  },
  Interaction: {
    skill: 'webperf-interaction',
    name: 'Interaction & Animation',
    description:
      'Measure interaction and animation performance (Long Animation Frames, Long Tasks, scroll jank, layout shifts). Use when the user asks about interaction latency, jank, animation frames, long tasks, or scroll performance. Compatible with Chrome DevTools MCP.',
  },
  Media: {
    skill: 'webperf-media',
    name: 'Media Performance',
    description:
      'Audit images, videos, and SVGs for performance issues. Use when the user asks about image optimization, video performance, lazy loading, image formats, or SVG analysis. Compatible with Chrome DevTools MCP.',
  },
  Resources: {
    skill: 'webperf-resources',
    name: 'Resources & Network',
    description:
      'Analyze network and resource performance (bandwidth, connection quality, effective connection type). Use when the user asks about network performance, bandwidth, connection quality, or adaptive loading. Compatible with Chrome DevTools MCP.',
  },
}

function getSnippetFiles(category) {
  const dir = path.join(SNIPPETS_DIR, category)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()
}

function getMdxFiles(category) {
  const dir = path.join(PAGES_DIR, category)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => path.join(dir, f))
}

// Find the MDX file that imports a given snippet JS file, and return its var name
function findMdxForSnippet(category, snippetFile) {
  const escapedFile = snippetFile.replace('.', '\\.')
  const importRe = new RegExp(`import (\\w+) from '[^']*/${escapedFile}\\?raw'`)

  for (const mdxPath of getMdxFiles(category)) {
    const content = fs.readFileSync(mdxPath, 'utf-8')
    const match = content.match(importRe)
    if (match) {
      return { mdxPath, content, varName: match[1] }
    }
  }
  return null
}

// For a shared MDX (multiple snippets), find the H2 section title containing a given snippet var
function findH2ForSnippetVar(content, varName) {
  const snippetCall = `<Snippet code={${varName}} />`
  const snippetIdx = content.indexOf(snippetCall)
  if (snippetIdx === -1) return null

  const before = content.slice(0, snippetIdx)
  const h2Matches = [...before.matchAll(/^## (.+)$/gm)]
  if (h2Matches.length === 0) return null
  return h2Matches[h2Matches.length - 1][1].trim()
}

// Extract the first real description paragraph from MDX content.
// If afterH2Text is given, searches only within that H2 section (bounded by next H2).
function extractDescription(content, afterH2Text = null) {
  let searchContent = content

  if (afterH2Text) {
    const h2Marker = `## ${afterH2Text}`
    const h2Idx = content.indexOf(h2Marker)
    if (h2Idx !== -1) {
      const afterH2 = content.slice(h2Idx + h2Marker.length)
      // Bound search to current section (up to next H2 heading)
      const nextH2Match = afterH2.match(/\n## /)
      searchContent = nextH2Match ? afterH2.slice(0, nextH2Match.index) : afterH2
    }
  } else {
    const h1Match = content.match(/^# .+$/m)
    if (h1Match) searchContent = content.slice(content.indexOf(h1Match[0]) + h1Match[0].length)
  }

  const skipPatterns = [/^#/, /^import /, /^```/, /^\|/, /^>/, /^</, /^\s*$/, /^\*\*[^*]*:\*\*/]

  for (const para of searchContent.split(/\n\n+/)) {
    const trimmed = para.trim()
    if (!trimmed) continue
    if (skipPatterns.some((re) => re.test(trimmed))) continue
    return trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\n/g, ' ')
      .trim()
  }
  // Fall back to full MDX description if section has no paragraph
  if (afterH2Text) return extractDescription(content)
  return ''
}

// Extract the first thresholds/rating table (contains 🟢) from MDX content
function extractThresholds(content) {
  // Find the bold label line followed by the table
  const thresholdSectionRe = /\*\*[^*]*[Tt]hreshold[^*]*\*\*[:\s]*\n\n((?:\|.+\n)+)/g
  let match = thresholdSectionRe.exec(content)
  if (match) return match[1].trimEnd()

  // Fallback: any table containing 🟢 emoji
  const tableRe = /((?:\|.+\n)+)/g
  while ((match = tableRe.exec(content)) !== null) {
    if (match[1].includes('🟢')) return match[1].trimEnd()
  }
  return ''
}

// Strip internal relative links (e.g. /CoreWebVitals/LCP-Sub-Parts) from markdown link text
function cleanLinks(text) {
  return text
    .replace(/\[([^\]]+)\]\(\/[^)]+\)/g, '$1')  // remove internal links, keep text
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '[$1]($2)')  // keep external links
}

// Build metadata for a single snippet JS file
function buildSnippetMeta(category, snippetFile) {
  const basename = path.basename(snippetFile, '.js')
  const found = findMdxForSnippet(category, snippetFile)

  if (!found) {
    return { basename, title: basename.replace(/-/g, ' '), description: '', thresholds: '' }
  }

  const { content, varName } = found
  const importCount = (content.match(/import snippet\w* from/g) || []).length
  const isShared = importCount > 1

  const h1Match = content.match(/^# (.+)$/m)
  const mdxTitle = h1Match ? h1Match[1] : basename.replace(/-/g, ' ')

  let title, description, thresholds

  if (isShared) {
    const h2Title = findH2ForSnippetVar(content, varName)
    title = h2Title ? `${mdxTitle}: ${h2Title}` : mdxTitle
    description = extractDescription(content, h2Title)
    thresholds = ''
  } else {
    title = mdxTitle
    description = extractDescription(content)
    thresholds = extractThresholds(content)
  }

  return {
    basename,
    title,
    description,
    thresholds,
  }
}

function generateCategorySkill(category, catConfig) {
  const snippetFiles = getSnippetFiles(category)
  if (snippetFiles.length === 0) return

  console.log(`\nGenerating ${catConfig.skill}/ (${snippetFiles.length} snippets)...`)

  const metas = snippetFiles.map((f) => buildSnippetMeta(category, f))

  const skillDir = path.join(SKILLS_DIR, catConfig.skill)
  const scriptsDir = path.join(skillDir, 'scripts')
  fs.mkdirSync(scriptsDir, { recursive: true })

  for (const snippetFile of snippetFiles) {
    const src = path.join(SNIPPETS_DIR, category, snippetFile)
    const dst = path.join(scriptsDir, snippetFile)
    fs.copyFileSync(src, dst)
  }
  console.log(`  copied ${snippetFiles.length} scripts to scripts/`)

  const lines = []

  lines.push('---')
  lines.push(`name: ${catConfig.skill}`)
  lines.push(`description: ${catConfig.description}`)
  lines.push('---')
  lines.push('')
  lines.push(`# WebPerf: ${catConfig.name}`)
  lines.push('')
  lines.push(
    'JavaScript snippets for measuring web performance in Chrome DevTools. ' +
    'Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.'
  )
  lines.push('')

  lines.push('## Available Snippets')
  lines.push('')
  lines.push('| Snippet | Description | File |')
  lines.push('|---------|-------------|------|')
  for (const meta of metas) {
    const desc = meta.description
      ? meta.description.split(/[.!?]/)[0].slice(0, 100)
      : meta.title
    lines.push(`| ${meta.title} | ${desc} | scripts/${meta.basename}.js |`)
  }
  lines.push('')

  lines.push('## Execution with Chrome DevTools MCP')
  lines.push('')
  lines.push('```')
  lines.push('1. mcp__chrome-devtools__navigate_page  → navigate to target URL')
  lines.push('2. mcp__chrome-devtools__evaluate_script → run snippet code (read from scripts/ file)')
  lines.push('3. mcp__chrome-devtools__get_console_message → capture console output')
  lines.push('4. Interpret results using thresholds below, provide recommendations')
  lines.push('```')
  lines.push('')

  for (const meta of metas) {
    lines.push(`---`)
    lines.push('')
    lines.push(`## ${meta.title}`)
    lines.push('')

    if (meta.description) {
      lines.push(meta.description)
      lines.push('')
    }

    lines.push(`**Script:** \`scripts/${meta.basename}.js\``)
    lines.push('')

    if (meta.thresholds) {
      lines.push('**Thresholds:**')
      lines.push('')
      lines.push(meta.thresholds)
      lines.push('')
    }
  }

  const skillContent = lines.join('\n')
  const skillPath = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillPath, skillContent)
  console.log(`  written: SKILL.md (${Math.round(skillContent.length / 1024)}KB)`)
}

function generateMetaSkill() {
  console.log('\nGenerating webperf/ meta-skill...')

  const skillDir = path.join(SKILLS_DIR, 'webperf')
  fs.mkdirSync(skillDir, { recursive: true })

  const totalSnippets = Object.keys(CATEGORIES).reduce(
    (sum, cat) => sum + getSnippetFiles(cat).length, 0
  )

  const lines = []

  lines.push('---')
  lines.push('name: webperf')
  lines.push(
    'description: Web performance measurement and debugging toolkit. Use when the user asks about web performance, wants to audit a page, or says "analyze performance", "debug lcp", "check ttfb", "measure core web vitals", "audit images", or similar.'
  )
  lines.push('---')
  lines.push('')
  lines.push('# WebPerf Snippets Toolkit')
  lines.push('')
  lines.push(
    `A collection of ${totalSnippets} JavaScript snippets for measuring and debugging web performance in Chrome DevTools. ` +
    'Each snippet runs in the browser console and outputs structured, color-coded results.'
  )
  lines.push('')

  lines.push('## Skills by Category')
  lines.push('')
  lines.push('| Skill | Snippets | Use when |')
  lines.push('|-------|----------|----------|')
  for (const [category, config] of Object.entries(CATEGORIES)) {
    const count = getSnippetFiles(category).length
    const useWhen = config.description.split('.')[0]
    lines.push(`| ${config.skill} | ${count} | ${useWhen} |`)
  }
  lines.push('')

  lines.push('## Quick Reference')
  lines.push('')
  lines.push('| User says | Skill to use |')
  lines.push('|-----------|--------------|')
  lines.push('| "debug LCP", "slow LCP", "largest contentful paint" | webperf-core-web-vitals |')
  lines.push('| "check CLS", "layout shifts", "visual stability" | webperf-core-web-vitals |')
  lines.push('| "INP", "interaction latency", "responsiveness" | webperf-core-web-vitals |')
  lines.push('| "TTFB", "slow server", "time to first byte" | webperf-loading |')
  lines.push('| "FCP", "first contentful paint", "render blocking" | webperf-loading |')
  lines.push('| "font loading", "script loading", "resource hints", "service worker" | webperf-loading |')
  lines.push('| "jank", "scroll performance", "long tasks", "animation frames", "INP debug" | webperf-interaction |')
  lines.push('| "image audit", "lazy loading", "image optimization", "video audit" | webperf-media |')
  lines.push('| "network quality", "bandwidth", "connection type", "save-data" | webperf-resources |')
  lines.push('')

  lines.push('## Workflow')
  lines.push('')
  lines.push('1. Identify the relevant skill based on the user\'s question (use Quick Reference above)')
  lines.push('2. Load the skill\'s skill.md to see available snippets and thresholds')
  lines.push('3. Execute with Chrome DevTools MCP:')
  lines.push('   - `mcp__chrome-devtools__navigate_page` → navigate to target URL')
  lines.push('   - `mcp__chrome-devtools__evaluate_script` → run the snippet')
  lines.push('   - `mcp__chrome-devtools__get_console_message` → read results')
  lines.push('4. Interpret results using the thresholds defined in the skill')
  lines.push('5. Provide actionable recommendations based on findings')
  lines.push('')

  const content = lines.join('\n')
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content)
  console.log(`  written: SKILL.md`)
}

function validateSkill(name, description) {
  const errors = []
  if (name.length > 64) errors.push(`name too long: ${name.length} chars (max 64)`)
  if (description.length > 1024) errors.push(`description too long: ${description.length} chars (max 1024)`)
  return errors
}

function main() {
  console.log('Generating WebPerf skills...\n')
  fs.mkdirSync(SKILLS_DIR, { recursive: true })

  // Validate frontmatter constraints before generating
  const validationErrors = []
  for (const [, config] of Object.entries(CATEGORIES)) {
    const errors = validateSkill(config.skill, config.description)
    if (errors.length) validationErrors.push(...errors.map((e) => `  ${config.skill}: ${e}`))
  }
  const metaDesc =
    'Web performance measurement and debugging toolkit. Use when the user asks about web performance, wants to audit a page, or says "analyze performance", "debug lcp", "check ttfb", "measure core web vitals", "audit images", or similar.'
  const metaErrors = validateSkill('webperf', metaDesc)
  if (metaErrors.length) validationErrors.push(...metaErrors.map((e) => `  webperf: ${e}`))

  if (validationErrors.length) {
    console.error('Validation errors:\n' + validationErrors.join('\n'))
    process.exit(1)
  }

  for (const [category, config] of Object.entries(CATEGORIES)) {
    generateCategorySkill(category, config)
  }

  generateMetaSkill()

  console.log('\nDone! Skills generated in /skills/')
}

main()
