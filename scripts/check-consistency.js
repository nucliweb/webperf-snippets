#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SNIPPETS_DIR = path.join(ROOT, 'snippets')
const PAGES_DIR = path.join(ROOT, 'pages')
const README_PATH = path.join(ROOT, 'README.md')
const SKILLS_DOC_PATH = path.join(ROOT, 'SKILLS.md')
const META_SKILL_PATH = path.join(ROOT, 'skills', 'webperf', 'SKILL.md')

const CATEGORY_SKILLS = {
  CoreWebVitals: 'webperf-core-web-vitals',
  Loading: 'webperf-loading',
  Interaction: 'webperf-interaction',
  Media: 'webperf-media',
  Resources: 'webperf-resources',
}

const ROOT_EDITORIAL_PAGES = new Set(['index'])
const NON_SNIPPET_PAGE_TYPES = new Set(['guide', 'tool'])

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function getJson(filePath) {
  return JSON.parse(readFile(filePath))
}

function getSnippetFiles(category) {
  const dir = path.join(SNIPPETS_DIR, category)
  if (!exists(dir)) return []
  return fs.readdirSync(dir).filter((file) => file.endsWith('.js')).sort()
}

function getMdxFiles(dirPath) {
  if (!exists(dirPath)) return []
  return fs.readdirSync(dirPath).filter((file) => file.endsWith('.mdx')).sort()
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return {}

  const endIndex = content.indexOf('\n---\n', 4)
  if (endIndex === -1) return {}

  const body = content.slice(4, endIndex)
  const frontmatter = {}

  for (const line of body.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/)
    if (!match) continue
    const [, key, value] = match
    frontmatter[key] = value.trim().replace(/^['"]|['"]$/g, '')
  }

  return frontmatter
}

function getSnippetImports(content) {
  const matches = content.matchAll(/import\s+\w+\s+from\s+['"]\.\.\/\.\.\/snippets\/([^/'"]+)\/([^'"]+)\?raw['"]/g)
  return [...matches].map((match) => ({
    category: match[1],
    file: match[2],
  }))
}

function getRootPages() {
  return getMdxFiles(PAGES_DIR)
}

function getCategoryPages(category) {
  return getMdxFiles(path.join(PAGES_DIR, category))
}

function verifySourceToPageMapping(errors) {
  for (const category of Object.keys(CATEGORY_SKILLS)) {
    for (const snippetFile of getSnippetFiles(category)) {
      const isImported = getCategoryPages(category).some((mdxFile) => {
        const content = readFile(path.join(PAGES_DIR, category, mdxFile))
        return content.includes(`/snippets/${category}/${snippetFile}?raw`)
      })

      if (!isImported) {
        errors.push(`Missing MDX page import for snippet ${category}/${snippetFile}`)
      }
    }
  }
}

function verifyPageToSourceMapping(errors) {
  for (const rootPage of getRootPages()) {
    const basename = path.basename(rootPage, '.mdx')
    if (ROOT_EDITORIAL_PAGES.has(basename)) continue

    const content = readFile(path.join(PAGES_DIR, rootPage))
    const frontmatter = parseFrontmatter(content)

    if (NON_SNIPPET_PAGE_TYPES.has(frontmatter.type)) continue

    if (getSnippetImports(content).length === 0) {
      errors.push(`Root page ${rootPage} has no snippet import and is not marked with type: guide or type: tool`)
    }
  }

  for (const category of Object.keys(CATEGORY_SKILLS)) {
    for (const mdxFile of getCategoryPages(category)) {
      const basename = path.basename(mdxFile, '.mdx')
      if (basename === 'index') continue

      const content = readFile(path.join(PAGES_DIR, category, mdxFile))
      const frontmatter = parseFrontmatter(content)

      if (NON_SNIPPET_PAGE_TYPES.has(frontmatter.type)) continue

      const imports = getSnippetImports(content)
      if (imports.length === 0) {
        errors.push(`Page ${category}/${mdxFile} has no snippet import and is not marked with type: guide or type: tool`)
        continue
      }

      const hasMatchingCategory = imports.some((item) => item.category === category)
      if (!hasMatchingCategory) {
        errors.push(`Page ${category}/${mdxFile} only imports snippets from other categories`)
      }
    }
  }
}

function verifyMetaAlignment(errors) {
  const rootMeta = getJson(path.join(PAGES_DIR, '_meta.json'))
  const rootPageKeys = new Set(getRootPages().map((file) => path.basename(file, '.mdx')))
  const rootMetaKeys = new Set(Object.keys(rootMeta))

  for (const key of rootPageKeys) {
    if (!rootMetaKeys.has(key)) {
      errors.push(`pages/_meta.json is missing entry for ${key}.mdx`)
    }
  }

  for (const key of rootMetaKeys) {
    if (ROOT_EDITORIAL_PAGES.has(key)) continue
    const categoryDir = path.join(PAGES_DIR, key)
    if (!rootPageKeys.has(key) && !exists(categoryDir)) {
      errors.push(`pages/_meta.json contains stale entry "${key}"`)
    }
  }

  for (const category of Object.keys(CATEGORY_SKILLS)) {
    const metaPath = path.join(PAGES_DIR, category, '_meta.json')
    const meta = getJson(metaPath)
    const pageKeys = new Set(getCategoryPages(category).map((file) => path.basename(file, '.mdx')))
    const metaKeys = new Set(Object.keys(meta))

    for (const key of pageKeys) {
      if (key === '_meta') continue
      if (!metaKeys.has(key)) {
        errors.push(`${path.relative(ROOT, metaPath)} is missing entry for ${key}.mdx`)
      }
    }

    for (const key of metaKeys) {
      if (!pageKeys.has(key)) {
        errors.push(`${path.relative(ROOT, metaPath)} contains stale entry "${key}"`)
      }
    }
  }
}

function verifyPublishedCounts(errors) {
  const categoryCounts = {}
  let total = 0

  for (const category of Object.keys(CATEGORY_SKILLS)) {
    const count = getSnippetFiles(category).length
    categoryCounts[category] = count
    total += count
  }

  const readme = readFile(README_PATH)
  const skillsDoc = readFile(SKILLS_DOC_PATH)
  const metaSkill = readFile(META_SKILL_PATH)

  const tableRow = (pattern, count) => new RegExp(`${pattern}\\s*\\|\\s*${count}\\s*\\|`)
  const sectionCount = (skill) => {
    const start = skillsDoc.indexOf(`### ${skill}\n`)
    if (start === -1) return null
    const match = skillsDoc.slice(start).match(/\*\*Snippets \((\d+)\):\*\*/)
    return match ? Number(match[1]) : null
  }

  const perCategory = Object.entries(CATEGORY_SKILLS).map(([category, skill]) => ({
    skill,
    count: categoryCounts[category],
  }))

  const expectedChecks = [
    {
      file: 'README.md',
      ok:
        readme.includes(`| \`webperf\`                 | ${total}`) &&
        perCategory.every(({ skill, count }) => tableRow(`\\|\\s*\`${skill}\`\\s*`, count).test(readme)),
    },
    {
      file: 'SKILLS.md',
      ok:
        skillsDoc.includes(`These skills transform ${total} battle-tested JavaScript snippets`) &&
        skillsDoc.includes(`Provides overview of all ${total} available snippets`) &&
        perCategory.every(({ skill, count }) =>
          tableRow(`\\[${skill}\\]\\(#${skill}\\)\\*\\*`, count).test(skillsDoc)
        ),
    },
    {
      file: 'SKILLS.md (per-skill "Snippets (N)" sections)',
      ok: perCategory.every(({ skill, count }) => sectionCount(skill) === count),
    },
    {
      file: 'skills/webperf/SKILL.md',
      ok:
        metaSkill.includes(`A collection of ${total} JavaScript snippets`) &&
        perCategory.every(({ skill, count }) => metaSkill.includes(`| ${skill} | ${count} |`)),
    },
  ]

  for (const check of expectedChecks) {
    if (!check.ok) {
      errors.push(`${check.file} contains outdated published snippet counts`)
    }
  }
}

function main() {
  const errors = []

  verifySourceToPageMapping(errors)
  verifyPageToSourceMapping(errors)
  verifyMetaAlignment(errors)
  verifyPublishedCounts(errors)

  if (errors.length > 0) {
    console.error('Consistency check failed:\n')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('Consistency check passed.')
}

main()
