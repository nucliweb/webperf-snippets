#!/usr/bin/env node
/**
 * Generates skill.md files from /snippets/ JS files + /pages/ MDX documentation.
 * Output: /skills/webperf-{category}/skill.md + scripts/*.js
 *
 * Run: node scripts/generate-skills.js
 */

const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')
const { minify } = require('terser')

const GITHUB_BASE = 'https://github.com/nucliweb/webperf-snippets/blob/main'

const ROOT = path.join(__dirname, '..')
const SNIPPETS_DIR = path.join(ROOT, 'snippets')
const PAGES_DIR = path.join(ROOT, 'pages')
const SKILLS_DIR = path.join(ROOT, 'skills')
const CLAUDE_SKILLS_DIR = path.join(ROOT, '.claude', 'skills')

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))

const SKILL_METADATA = {
  license: pkg.license,
  metadata: {
    author: pkg.author,
    version: pkg.version,
    'mcp-server': 'chrome-devtools',
    category: 'web-performance',
    repository: 'https://github.com/nucliweb/webperf-snippets',
  },
}

const CATEGORIES = {
  CoreWebVitals: {
    skill: 'webperf-core-web-vitals',
    name: 'Core Web Vitals',
    description:
      'Intelligent Core Web Vitals analysis with automated workflows and decision trees. Measures LCP, CLS, INP with guided debugging that automatically determines follow-up analysis based on results. Includes workflows for LCP deep dive (5 phases), CLS investigation (loading vs interaction), INP debugging (latency breakdown + attribution), and cross-skill integration with loading, interaction, and media skills. Use when the user asks about Core Web Vitals, LCP optimization, layout shifts, or interaction responsiveness. Compatible with Chrome DevTools MCP.',
  },
  Loading: {
    skill: 'webperf-loading',
    name: 'Loading Performance',
    description:
      'Intelligent loading performance analysis with automated workflows for TTFB investigation (DNS/connection/server breakdown), render-blocking detection, script performance deep dive (first vs third-party attribution), font optimization, and resource hints validation. Includes decision trees that automatically analyze TTFB sub-parts when slow, detect script loading anti-patterns (async/defer/preload conflicts), identify render-blocking resources, and validate resource hints usage. Features workflows for complete loading audit (6 phases), backend performance investigation, and priority optimization. Cross-skill integration with Core Web Vitals (LCP resource loading), Interaction (script execution blocking), and Media (lazy loading strategy). Use when the user asks about TTFB, FCP, render-blocking, slow loading, font performance, script optimization, or resource hints. Compatible with Chrome DevTools MCP.',
  },
  Interaction: {
    skill: 'webperf-interaction',
    name: 'Interaction & Animation',
    description:
      'Intelligent interaction performance analysis with automated workflows for INP debugging, scroll jank investigation, and main thread blocking. Includes decision trees that automatically run script attribution when long frames detected, break down input latency phases, and correlate layout shifts with interactions. Features workflows for complete interaction audit, third-party script impact analysis, and animation performance debugging. Cross-skill integration with Core Web Vitals (INP/CLS correlation) and Loading (script execution analysis). Use when the user asks about slow interactions, janky scrolling, unresponsive pages, or INP optimization. Compatible with Chrome DevTools MCP.',
  },
  Media: {
    skill: 'webperf-media',
    name: 'Media Performance',
    description:
      'Intelligent media optimization with automated workflows for images, videos, and SVGs. Includes decision trees that detect LCP images (triggers format/lazy-loading/priority analysis), identify layout shift risks (missing dimensions), and flag lazy loading issues (above-fold lazy or below-fold eager). Features workflows for complete media audit, LCP image investigation, video performance (poster optimization), and SVG embedded bitmap detection. Cross-skill integration with Core Web Vitals (LCP/CLS impact) and Loading (priority hints, resource preloading). Provides performance budgets and format recommendations based on content type. Use when the user asks about image optimization, LCP is an image/video, layout shifts from media, or media loading strategy. Compatible with Chrome DevTools MCP.',
  },
  Resources: {
    skill: 'webperf-resources',
    name: 'Resources & Network',
    description:
      'Intelligent network quality analysis with adaptive loading strategies. Detects connection type (2g/3g/4g), bandwidth, RTT, and save-data mode, then automatically triggers appropriate optimization workflows. Includes decision trees that recommend image compression for slow connections, critical CSS inlining for high RTT, and save-data optimizations (disable autoplay, reduce quality). Features connection-aware performance budgets (500KB for 2g, 1.5MB for 3g, 3MB for 4g+) and adaptive loading implementation guides. Cross-skill integration with Loading (TTFB impact), Media (responsive images), and Core Web Vitals (connection impact on LCP/INP). Use when the user asks about slow connections, mobile optimization, save-data support, or adaptive loading strategies. Compatible with Chrome DevTools MCP.',
  },
}

async function buildScript(src, dst, relPath) {
  const source = fs.readFileSync(src, 'utf-8')
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const githubUrl = `${GITHUB_BASE}/${relPath}`
  const header = `// ${relPath} | sha256:${hash} | ${githubUrl}\n`

  let code
  try {
    const result = await minify(source, {
      compress: { drop_console: true, pure_getters: true, passes: 2 },
      mangle: true,
      format: { comments: false },
    })
    code = result.code
  } catch (err) {
    console.warn(`  ⚠ minify failed for ${path.basename(src)}: ${err.message} — copying as-is`)
    code = source
  }

  fs.writeFileSync(dst, header + code)
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

async function generateCategorySkill(category, catConfig) {
  const snippetFiles = getSnippetFiles(category)
  if (snippetFiles.length === 0) return

  console.log(`\nGenerating ${catConfig.skill}/ (${snippetFiles.length} snippets)...`)

  const metas = snippetFiles.map((f) => buildSnippetMeta(category, f))

  const skillDir = path.join(SKILLS_DIR, catConfig.skill)
  const scriptsDir = path.join(skillDir, 'scripts')
  const refsDir = path.join(skillDir, 'references')
  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.mkdirSync(refsDir, { recursive: true })

  for (const snippetFile of snippetFiles) {
    const src = path.join(SNIPPETS_DIR, category, snippetFile)
    const dst = path.join(scriptsDir, snippetFile)
    await buildScript(src, dst, `snippets/${category}/${snippetFile}`)
  }
  console.log(`  built ${snippetFiles.length} scripts to scripts/`)

  // Write references/snippets.md (L3 — loaded on demand)
  const snippetLines = []
  for (const meta of metas) {
    snippetLines.push(`---`)
    snippetLines.push(`## ${meta.title}`)
    if (meta.description) {
      snippetLines.push('')
      snippetLines.push(meta.description)
    }
    snippetLines.push('')
    snippetLines.push(`**Script:** \`scripts/${meta.basename}.js\``)
    if (meta.thresholds) {
      snippetLines.push('')
      snippetLines.push('**Thresholds:**')
      snippetLines.push('')
      snippetLines.push(meta.thresholds)
    }
  }
  fs.writeFileSync(path.join(refsDir, 'snippets.md'), snippetLines.join('\n') + '\n')
  console.log(`  written: references/snippets.md`)

  // Copy SCHEMA.md to references/schema.md
  const schemaSrc = path.join(CLAUDE_SKILLS_DIR, 'SCHEMA.md')
  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, path.join(refsDir, 'schema.md'))
    console.log(`  copied: references/schema.md`)
  }

  const lines = []

  lines.push('---')
  lines.push(`name: ${catConfig.skill}`)
  lines.push(`description: ${catConfig.description}`)
  lines.push('context: fork')
  lines.push(`license: ${SKILL_METADATA.license}`)
  lines.push('metadata:')
  for (const [key, value] of Object.entries(SKILL_METADATA.metadata)) {
    lines.push(`  ${key}: ${value}`)
  }
  lines.push('---')
  lines.push('')
  lines.push(`# WebPerf: ${catConfig.name}`)
  lines.push('')
  lines.push(
    'JavaScript snippets for measuring web performance in Chrome DevTools. ' +
    'Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.'
  )
  lines.push('')

  // Compact script list (replaces truncated table)
  lines.push('## Scripts')
  lines.push('')
  for (const meta of metas) {
    lines.push(`- \`scripts/${meta.basename}.js\` — ${meta.title}`)
  }
  lines.push('')
  lines.push('Descriptions and thresholds: `references/snippets.md`')
  lines.push('')

  // Inject WORKFLOWS.md if exists (no trailing --- to avoid double separator)
  const workflowsPath = path.join(SNIPPETS_DIR, category, 'WORKFLOWS.md')
  if (fs.existsSync(workflowsPath)) {
    const workflowsContent = fs.readFileSync(workflowsPath, 'utf-8').trim()
    lines.push(workflowsContent)
    lines.push('')
    console.log(`  injected WORKFLOWS.md`)
  }

  lines.push('## References')
  lines.push('')
  lines.push('- `references/snippets.md` — Descriptions and thresholds for each script')
  lines.push('- `references/schema.md` — Return value schema for interpreting script output')
  lines.push('')
  lines.push('> Execute via `mcp__chrome-devtools__evaluate_script` → read with `mcp__chrome-devtools__get_console_message`.')

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
  lines.push('context: fork')
  lines.push(`license: ${SKILL_METADATA.license}`)
  lines.push('metadata:')
  for (const [key, value] of Object.entries(SKILL_METADATA.metadata)) {
    lines.push(`  ${key}: ${value}`)
  }
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

async function main() {
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
    await generateCategorySkill(category, config)
  }

  generateMetaSkill()

  // Copy skills to .claude/skills/ for Claude Code
  console.log('\nCopying skills to .claude/skills/...')

  function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return

    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  copyRecursive(SKILLS_DIR, CLAUDE_SKILLS_DIR)
  console.log('  copied to .claude/skills/')

  console.log('\nDone! Skills generated in /skills/ and .claude/skills/')
}

main().catch(console.error)
