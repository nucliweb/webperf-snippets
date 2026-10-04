# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**WebPerf Snippets** is a curated collection of web performance measurement JavaScript snippets for the browser console and Chrome DevTools. The repository is a documentation site (Next.js + Nextra) plus the tooling that packages the same snippets as Agent Skills, a CLI and `llms.txt` files.

The snippet source files in `snippets/` are the single source of truth. Documentation pages, skills, the CLI and `llms-full.txt` are all derived from them.

## Technology stack

- **Site**: Next.js 16 App Router with Nextra 4 (`nextra-theme-docs`) and React 19, deployed on Vercel. Search is Pagefind, built after `next build`
- **Media**: Cloudinary through `next-cloudinary`
- **Analytics**: Google Analytics and DebugBear
- **CLI** (`cli/`, npm workspace `webperf-snippets`): Playwright runner for the snippets, tested with Vitest

## Repository layout

```
content/                MDX pages, file-system routing, one _meta.js per directory
app/                    Root layout, the [[...mdxPath]] page that renders the MDX, sitemap and robots
mdx-components.js       MDX components of the theme, with the external link label
  CoreWebVitals/ Loading/ Interaction/ Media/ Resources/ DevTools-Overrides/
  index.mdx, which-snippet.mdx, CLI.mdx, visualizer.mdx, case-studies/
snippets/               The snippet sources (*.js), same categories as content/
  SCHEMA.md             Return-value contract every snippet must follow
  _shared/              Helpers marked with `// @shared`
components/             Snippet (code block), Callout, Icon, Demo, SnippetVisualizer, diagrams/
components/diagrams/    Own SVG diagrams (Flow, Sequence, custom), styled with --dg-* tokens
lib/                    remark/rehype plugins: browser support, icons, emoji stripping
styles/globals.css      Global styles, including the --dg-* tokens and .wp-support*
public/demos/           Interactive HTML demos; see public/demos/README.md for the contract
skills/, dist/, .claude/skills/   Generated Agent Skills (do not edit by hand)
public/llms.txt, public/llms-full.txt   Generated
cli/                    Playwright CLI, workflows, e2e tests and fixtures
scripts/                Generators, checks and their tests
workspace/              Local notes, ignored by git
```

## Commands

```bash
npm run dev                  # development server (port 3000)
npm run build                # production build (regenerates llms files first)
npm run lint                 # eslint
npm run generate-skills      # regenerate skills/, dist/, .claude/skills/ from snippets/
npm run generate-skills:check  # CI check: generation leaves no diff
node scripts/generate-llms.js  # regenerate public/llms*.txt

npm run check:consistency    # shared helpers must carry the `// @shared` marker
npm run check:emoji          # no emoji left in rendered text where an icon exists
npm run test:demos           # demo contract
npm run test:site            # sitemap routes, _meta reader, built snippets check
npm run check:built-snippets # after `npm run build`: every page shows its snippets as in the source
npm run test:icons           # emoji to icon plugins
npm run test:support         # browser support plugin

npm run test:unit --prefix cli
npm run test:e2e --prefix cli   # Playwright against local fixtures (cli/tests/fixtures)
```

CI (`.github/workflows/ci.yml`) runs lint, build, all the checks above, `generate-skills:check` and the CLI unit and e2e tests. The pre-commit hook (`.githooks/pre-commit`) runs `check:consistency`, `check:emoji` and `lint`.

## Snippets

- Every snippet is an IIFE that returns a structured object with `script`, `status` (`ok`, `tracking`, `error`, `unsupported`) and the metric data. The contract is in `snippets/SCHEMA.md` and is enforced by `cli/tests/e2e/snippet-contract.test.js`.
- A snippet that needs a `PerformanceObserver` entry type checks `PerformanceObserver.supportedEntryTypes` first and returns `status: "unsupported"` when it is missing.
- Chrome exposes some entry types only through observers (`largest-contentful-paint`, `layout-shift`, `longtask`, `event`, `first-input`), so they are read with a buffered observer, not `getEntriesByType`.
- Helpers duplicated across snippets (`formatBytes`, `getRootDomain`) carry a `// @shared` marker and stay identical.
- After changing a snippet: `npm run generate-skills` and `node scripts/generate-llms.js`, and commit the regenerated files.
- Tests come first and use the e2e harness in `cli/tests/helpers/contract.js` and the fixtures in `cli/tests/fixtures/`.

## Documentation pages

`CONTRIBUTING.md` describes the page template step by step. In short:

1. Create `content/<Category>/<Name>.mdx` (kebab-case or the existing naming of the category) and import the snippet with `import snippet from '../../snippets/<Category>/<Name>.js?raw'`, rendered with `<Snippet code={snippet} />`.
2. Register it in the `_meta.js` of the category (`export default { ... }` with a literal object, which `scripts/read-meta.js` reads).
3. Add the `browserSupport` frontmatter and a `### Browser support` section before "Further reading". The badge and tables are generated from MDN browser-compat-data by `lib/remark-browser-support.js`, and the build fails if a key does not exist or the title is missing. `browserSupport` lists what the snippet needs to run; the optional `browserSupportReported` lists what it only audits.
4. If a page is renamed, add a redirect in `next.config.mjs`.

Emojis in MDX are replaced by icons at render time (rehype plugin); the MDX source keeps the emoji.

Writing rules for pages are in the `webperf-docs-reviewer` skill: sentence-case headings, no bold as headers, timeless language.

## Diagrams and demos

- Diagrams are SVG components in `components/diagrams`, not Mermaid. Use `Flow` or `Sequence`, or a custom component, and the `--dg-*` tokens from `styles/globals.css`.
- Demos are standalone HTML files in `public/demos`, embedded with `<Demo>`. They share a style, an icon block (`.ic`) and a contract documented in `public/demos/README.md`, checked by `npm run test:demos`.

## Notes

- `dev` and `build` run with `--webpack`: the plugins of `lib/` are functions, and Nextra 4 does not load them under Turbopack (its loader cannot resolve plugins given as strings). The `?raw` import of the snippets is a webpack rule in `next.config.mjs`; Next 16 keeps its SWC rule outside `oneOf`, so the rule excludes `snippets/` from every SWC rule, or the code reaches the page rewritten. `npm run check:built-snippets` fails after a build when a page shows different code from the source.
- `package.json` pins `zod` to 4.3.6 with `overrides`: Nextra 4.6.1 fails in `<Layout>` with 4.4.3 or later. Review it when Nextra is upgraded.
- `agentRules: false` in `next.config.mjs` stops `next dev` from writing a Next.js block into `CLAUDE.md` and `AGENTS.md`.
- The code block and the demo are components of this repository, and `Callout` wraps the one of the theme (`components/`); their styles use `wp-*` classes and `--wp-*` tokens in `styles/globals.css`, never the utility classes of the theme.
- The dev server does not pick up changes in `lib/`; restart it after editing a plugin.
- Cloudinary URLs and `CldVideoPlayer` are available in MDX for media.
