# Changelog

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Issues carry a `code`, kebab-case and stable across runs and versions, so a comparison pairs the issues of two runs without reading their message, and a `target` with the URL, selector or name of what the issue is about when there is one issue per thing, such as an image or a CSS property. `snippets/SCHEMA.md` lists the codes of each snippet under Issue codes, and `cli/tests/unit/issue-codes.test.js` fails when the source and the table differ. Every snippet that returns issues carries its codes, and the contract fails on an issue without one.
- `npm run eval:mcp`: the same question about a local page with a known answer, asked to an agent with the webperf MCP server, with Chrome DevTools MCP and the webperf skills, and with Chrome DevTools MCP alone, graded on the diagnosis and measured in tokens, turns and time. It runs by hand, not in CI.
- The CLI reaches version 1.4.0 (see [`cli/CHANGELOG.md`](cli/CHANGELOG.md)): `--baseline` compares a page, or a matrix combination by combination, with the `--json` output of an earlier run, with a threshold per metric, the new and fixed errors, warnings when the conditions differ, and `--fail-on-regression` to exit with `1` on a regression. The JSON output carries the conditions of each measurement in `conditions`.
- The CLI reaches version 1.3.0 (see [`cli/CHANGELOG.md`](cli/CHANGELOG.md)): `--runs` measures a page several times and reports the median run, and `--matrix` measures several pages on several devices and in several variants, such as with and without the consent cookie, from one JSON file, with a table of the medians.
- The CLI reaches version 1.2.0 (see [`cli/CHANGELOG.md`](cli/CHANGELOG.md)): `--header` for pages behind an access proxy, sent only to the origin of the measured URL, `--cpu` and `--network` for CPU and network throttling with the presets of DevTools, and `--own-domains` for the domains of the site that count as first party.
- A Claude Code plugin, `webperf`, in a marketplace of this repository (`.claude-plugin/marketplace.json`). It starts the MCP server of the CLI with `npx -y webperf-snippets@1 mcp`, pinned to the major version, and installs with `/plugin install webperf --marketplace nucliweb/webperf-snippets`.
- `npm run smoke:cli-package`: packs the CLI as the publish workflow does, installs it in an empty folder and checks its MCP server without Chromium and after `npx playwright install chromium`. It runs by hand before a release of the CLI.
- LCP-Subparts splits the Resource Load Time into the wait for the server and the download of the resource, in `details.subParts.resourceLoadTime.waiting` and `.download`, from its Resource Timing entry. When the wait is the larger part of the slowest phase, the console recommends the server, CDN and cache instead of compressing the image. The split is missing when another origin hides its timing (no `Timing-Allow-Origin`).

### Changed
- The audit comparison of the extension pairs issues by their code and target, whatever their messages say, and an issue whose severity moves is listed as changed, with both severities, instead of new and resolved. An audit saved before the codes pairs by message as before. The downloaded report carries the `code` and `target` of each issue.
- The code in the first column of a table, such as an option of the CLI or a property, stays on one line. A table wider than the content column scrolls sideways inside its own box.
- CI skips the build and the end-to-end tests on its own when a pull request only changes documentation, instead of waiting for the `skip-e2e` label. Opening a pull request with the label fired two runs and cancelled one, which showed as a failed check.
- Examples, CLI commands, the `OWN_DOMAINS` hint of the snippets and the test data use the domains reserved for documentation (`example.com`, `example.net`, `example.org`) instead of real sites. `scripts/example-domains.test.js`, in `npm run test:site`, fails when a real site comes back as an example.
- `getINPDetails()` of INP returns a result object, `{ script, status, count, items }`, like the other functions the snippets expose, instead of an array. `items` holds the 15 slowest interactions as plain data, with the target as a CSS selector instead of the DOM element. Code or agents that read the array need to read `items`.

### Fixed
- The generated skills run in the conversation of the agent, not in a forked context (`context: fork`): a forked skill runs in a subagent that does not get the conversation, so it did not know the URL or the open page and answered that it had no page to measure.
- INP, Interactions and Input-Latency-Breakdown measure the phases over the whole interaction, not over one of its events. A slow click handler was reported as `pointerup`, with 0 ms of processing and the presentation as the bottleneck; it is reported as `click`, with the processing as the bottleneck. An interaction whose entries arrive in separate observer callbacks counts once.
- Interactions and Input-Latency-Breakdown return `unsupported` in browsers without Event Timing.
- Script-Loading lists a `nomodule` script with the strategy `nomodule`, never as blocking: browsers with modules never fetch it.
- Inline-Script-Info-and-Size classifies framework data payloads (JSON types, hydration ids such as `__NEXT_DATA__`, `self.__next_f.push(...)`) before looking for patterns, and counts analytics only from a call or definition such as `gtag(...)` or `dataLayer.push(...)`. A data payload that contained the word "gtag" was labelled analytics. Adds `isDataPayload` and `details.dataPayloadCount`.
- LCP-Image-Entropy divides by the displayed area of the image, capped at its natural area, as Chrome does. It divided by the natural area, so a large image shown small was flagged as low entropy while Chrome took it as the LCP. Adds `displayedWidth` and `displayedHeight`.
- CLS counts the shifts that the observer has not delivered when the page is hidden. It called `takeRecords()` and dropped the records, so a shift right before the page was hidden was missing from the final value and from `getCLS()`.
- LCP-Subparts splits the LCP as web-vitals does. It took the first Resource Timing entry for the URL of the LCP resource, so an image downloaded earlier with `fetch()` gave the phases of that earlier request; it takes the last request that started before the render. The end of the download is capped at the LCP, so a video that keeps downloading after its first frame paints no longer gives phases that add up to more than the LCP. An e2e test compares LCP, LCP-Subparts and CLS with the attribution build of web-vitals on the same page.

---

## [2.0.1] — 2026-10-16

### Fixed
- The scripts of the skills return their result object again, which those of 2.0.0 did not. The minifier dropped the final `return { script, status, ... }` of 53 of the 56 scripts, so `evaluate_script` gave the agent `undefined`. `npm run test:skills` checks that every built script keeps the result objects of its source.

### Changed
- The footer gives the version, the license and the author, and links GitHub, the npm package, the changelog and `llms.txt`. `llms.txt` and `llms-full.txt` give the version in their header.

---

## [2.0.0] — 2026-10-15

A major version: several snippets return different fields or values (listed under Changed), so code or agents that read their results need to review them, and the site lives at a new domain.

### Changed
- The site is served at https://webperf-snippets.net, and so are its metadata, the Markdown pages, `llms.txt`, the agent prompts, the extension, the CLI and the snippet headers. The previous domain redirects to it with a 308.
- The home page leads with the paths for AI agents (the CLI, the Copy prompt and the skills) and keeps DevTools as the path for the browser.
- Each page has its own description and its own Open Graph and Twitter tags, read from its MDX, instead of those of the home page.
- The site runs on Nextra 4 and the Next.js App Router with React 19. The pages live in `content/`, the navigation of each directory in `_meta.js`, and the layout in `app/layout.jsx`.
- Search uses Pagefind, indexed at build time over the 61 pages, code included.
- The sitemap and `robots.txt` come from `app/sitemap.js` and `app/robots.js` instead of `next-sitemap`, with the same 61 URLs.
- Links to other sites carry the hidden label "(opens in a new tab)" for screen readers. The "Copy page" button and the previous and next links at the foot of a page do not exist; the sidebar and the search cover the navigation.
- The text of the pages and the headings use typographic quotes, a convention of Nextra 4.
- The snippet pages follow the docs template of `CONTRIBUTING.md`.
- The helpers several snippets share (`formatBytes`, `getRootDomain`, first-party detection) are one block marked with `// @shared`, and `check:consistency` fails when a copy differs. First-party detection compares root domains in every snippet, `getRootDomain` treats an IP address as its own root, and `formatBytes` prints `-` for an unknown size.
- The nine snippets that returned every item they found cap `items` at 50, most relevant first.
- `Cache-Strategy-Analysis` reports uncompressed text and duplicate requests, which need no headers, as anti-patterns on any origin, says how much of the page it could analyze (`details.headerCoveragePercent`), and leaves the cache efficiency score `null` when no header was readable.
- `Resource-Hints-Validation` lists each unused hint in `items`, and a preload for a viewport that does not match is no longer counted as unused.
- `Image-Element-Audit` audits the image the browser reports as the LCP element, and none when the LCP is text, a CSS background or a video.
- `TTFB-Sub-Parts`, `CSS-Media-Queries-Analysis`, `Webfont-Usage-Analyzer`, `LCP-Video-Candidate`, `LCP-Image-Entropy`, `SVG-Embedded-Bitmap-Analysis`, `Video-Element-Audit` and `Prefetch-Resource-Validation` change their results, `LCP`, `LCP-Subparts` and `LCP-Trail` give the LCP element a selector that matches only that element, and the snippets that read Resource Timing leave out the requests other snippets make. The details are under 0.5.0 in [`cli/CHANGELOG.md`](cli/CHANGELOG.md).

### Added
- A "Copy prompt" bar above each snippet, with a sentence that says what it is for, also presented on the home page and the CLI page. It copies a prompt that asks an AI agent to run that snippet with the pinned `webperf-snippets` CLI and report the result, instead of rewriting the snippet or estimating it. The prompt lists the snippets the page links, to name the next one to run. Tracking snippets include an interaction script, `Back-Forward-Cache` says that the result is partial, and the Fetch-XHR-Timeline overrides, the Long-Animation-Frames helpers and `Network-Bandwidth-Connection-Quality` have no button.
- Seven snippets: `Compression-Audit`, `Server-Timing-Early-Hints`, `Speculation-Rules-Inspector`, `Webfont-Usage-Analyzer`, `Oversized-Images`, `DOM-Size-and-Depth` and `Third-Party-Impact-by-Domain`, which ranks third parties by render-blocking, main-thread time in long animation frames and transfer size. The collection now has 56 snippets.
- Twelve interactive demos, 17 in total: TTFB sub-parts, LCP sub-parts, layout shifts and CLS, the INP phases, long animation frames, back/forward cache blockers, scroll frame times, input latency by event type, `fetchpriority` and the order of a load, LCP candidates, what `content-visibility: auto` skips, and the ranking of third parties. They share a look, keyboard and screen reader support, and reduced motion handling, documented in `public/demos/README.md`.
- A "Which snippet should I use?" guide, linked from the home page and from the TTFB sections.
- Browser support as a badge and a table on the snippet pages, generated from MDN browser-compat-data with the `browserSupport` and `browserSupportReported` frontmatter. The build fails when a key does not exist.
- Own SVG diagrams, `Flow` and `Sequence`, drawn with the theme colors in `components/diagrams`. They replace the Mermaid diagrams of the pages.
- Icons drawn at render time instead of emojis in pages, callouts, diagrams, demos and the visualizer. The MDX source keeps the emoji, and `check:emoji` runs in CI and in the pre-commit hook.
- `snippets/SCHEMA.md`, the return-value contract of every snippet, enforced by an end-to-end test.
- `corsLimitedAnalysis` in the result of the snippets whose analysis is partial because cross-origin data is hidden.
- `OWN_DOMAINS` at the top of the first-party snippets (`First-And-Third-Party-Script-Info`, `First-And-Third-Party-Script-Timings`, `Script-Loading`, `TTFB-Resources`, `Cache-Strategy-Analysis` and `Fonts-Preloaded-Loaded-and-used-above-the-fold`) to count a site's own CDN on another root domain as first party.
- The CLI reaches version 1.0.0 (see [`cli/CHANGELOG.md`](cli/CHANGELOG.md)): `audit`, `loading` and `interaction` workflows, CrUX field data, `--storage-state` for pages behind a login, `--report-to` and decision-tree follow-ups for LCP and CLS.
- GitHub Action at `.github/actions/webperf-snippets` that runs the CLI with LCP and CLS budgets and writes the report to the job summary.
- A `skip-e2e` label that skips the build and the end-to-end tests on documentation-only pull requests.
- A Markdown version of every page at its path with `.md` (`/CoreWebVitals/LCP.md`), declared with `<link rel="alternate" type="text/markdown">`. `llms.txt` links each page to it and lists the guides.
- A `SoftwareSourceCode` JSON-LD for each snippet of a page, with its language, runtime, license and source file.
- WebMCP tools registered on `document.modelContext`, with `navigator.modelContext` as the fallback for earlier Chromium versions. Their registry is generated from the content and covers every snippet, and `get_snippet_prompt` returns the prompt to run a snippet on any URL with the CLI.
- A Chrome DevTools extension, in beta at version 0.1.1: a panel that runs the snippets on the inspected page, an audit with the steps of the CLI `audit` workflow that compares the result with the previous audit of the page, and a page on the site to download it. A tag `extension-v*` publishes its zip as a prerelease.
- Google Analytics events when a snippet or its prompt is copied (`copy_snippet`, `copy_prompt`) and when the extension is downloaded (`download_extension`).
- `npm run eval:prompts`: an agent runs the Copy prompt on local pages and is graded from its transcript. A workflow runs it on demand and on the pull requests that change the prompt.
- `npm run check:built-snippets` fails after a build when a page shows a snippet different from its source file. CI runs it.

### Fixed
- The `BreadcrumbList` and `Article` JSON-LD schemas appear in the HTML of the snippet and category pages. They were mounted inside `next/head`, which does not render components, so no page carried them. Error pages carry none.
- `LCP-Image-Entropy`, `LCP-Subparts`, `LCP-Trail` and `LCP-Video-Candidate` return `status: "unsupported"` in a browser without LCP entries, instead of an empty result.
- `First-And-Third-Party-Script-Timings` reports the DNS, connection, request and response phases of a cross-origin script without `Timing-Allow-Origin` as `null`, instead of numbers computed against zero.
- The demo animations start their clock on the first frame, so the progress does not stay at zero inside an iframe.

### Security
- The site runs on Next.js 16, which resolves the `next` and `postcss` advisories reported by `npm audit`. `dev` and `build` use webpack (`--webpack`) for the `?raw` snippet imports.
- Nextra 4 and the removal of `next-sitemap` clear the critical advisory and most of the high ones. `npm audit --omit=dev` still reports 7 (6 high, 1 moderate) in the dependencies of Nextra itself (`fast-glob`, `micromatch`, `braces`, `@xmldom/xmldom`), none critical.

---

## [1.3.0] — 2026-09-29

### Added
- Snippets: Cache Strategy Analysis, Forced Synchronous Layout detector, and the Fetch & XHR Timeline DevTools Override (inject and read). The collection now has 49 snippets.
- Snippet result Visualizer page: paste the object a snippet returns and get a formatted report, useful on sites that block extended console output.
- `webperf-snippets` CLI, published to npm. It runs the snippets headlessly with Playwright. See [`cli/CHANGELOG.md`](cli/CHANGELOG.md).
- Interactive demos embedded in the documentation: forced synchronous layout, long tasks, resource hints (preconnect), script loading and render-blocking resources. The embed contract (`demoHeight` message, theme sync, self-contained page) is documented in `public/demos/README.md`.
- `llms.txt` and `llms-full.txt` for AI agents.
- `BreadcrumbList` and `Article` JSON-LD schemas on every page.
- Gemini CLI and Antigravity output formats for the generated skills (`dist/gemini`, `dist/antigravity`).
- `eslint.config.mjs` (ESLint v10 flat config) and the `lint`, `lint:fix` and `validate` scripts.
- `check:consistency`, run in CI and in the pre-commit hook. It validates source-to-page parity, navigation entries and the published snippet counts of every category.
- `generate-skills:check` in CI, so `skills/`, `dist/` and `.claude/skills/` cannot drift from the snippets.
- `CONTRIBUTING.md` contributor guide and this changelog.
- Security headers in `next.config.js`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- End-to-end tests for the snippet logic (`cli/tests/e2e`).

### Changed
- CLS is the largest session window (shifts less than 1 s apart, within 5 s), not the sum of all shifts. Applies to `CLS` and `Layout-Shift-Loading-and-Interaction`.
- INP picks the p98 index from `performance.interactionCount` when the browser provides it.
- `TTFB`, `FCP` and `Event-Processing-Time` measure from `activationStart` on prerendered pages.
- `TTFB-Resources` reports the wait between the request and the first byte (`responseStart - requestStart`) and counts resources whose timing is hidden in `details.corsRestrictedCount`.
- `Back-Forward-Cache` reports only what can be verified: the `NotRestoredReasons` tree (including embedded frames), a `window.onunload` handler and `Cache-Control: no-store`. `details.eligibility` is now `blocked`, `likely-blocked` or `no-blockers-detected`, replacing `potentially-eligible` and `likely-eligible`. Consumers of that field need to update.
- `Script-Loading` and `First-And-Third-Party-Script-Info` return `sizeKnown` per item and `details.sizeUnknownCount` for cross-origin scripts without `Timing-Allow-Origin`.
- `Service-Worker-Analysis` reports an unknown source instead of counting opaque resources as cache hits.
- `Event-Processing-Time` returns `status: "tracking"` before the load event.
- Snippets collect entries with a buffered observer in the value they return to agents.
- Logo in `theme.config.jsx` uses `maxWidth` instead of a fixed `width`.
- `CONTRIBUTING.md` documents the current page template, and the interaction (9) and loading (29) snippet counts are corrected in the README and `SKILLS.md`.

### Fixed
- `LCP-Video-Candidate`, `LCP-Trail`, `LCP-Image-Entropy`, `LongTask`, `Layout-Shift-Loading-and-Interaction` and `Fetch-XHR-Timeline-read` read entries that Chrome only exposes to a `PerformanceObserver`, so they returned nothing.
- `CLS`, `INP`, `LCP`, `LongTask` and `Layout-Shift-Loading-and-Interaction` return `status: "unsupported"` on browsers without the entry type, instead of a false "good".
- `INP`: a negative presentation delay crashed the console output, and an unfilled `${color}` in a style string.
- `Long-Animation-Frames` correlates interactions from 16 ms instead of 104 ms.
- `TTFB-Sub-Parts` reported a negative TCP time on plain HTTP and reused connections.
- `SVG-Embedded-Bitmap-Analysis` labelled opaque cross-origin SVGs as cached.
- `LCP-Video-Candidate` source detection and first-frame handling, a duplicate `printLCP` call in `LCP`, an empty Performance API buffer in `Cache-Strategy-Analysis`, and position objects in `Find-Above-The-Fold-Lazy-Loaded-Images` results.
- 14 Loading pages missing from the sidebar, a duplicate `const p75` in `Interactions`, and DOM globals in the ESLint config.
- Broken or obsolete links in the documentation, and absolute paths in `docs/RELEASING.md`.

### Removed
- The `next-cloudinary` and `vercel` dependencies. The home page video uses a native `<video>` element.
- Unused Claude GitHub workflows.

### Security
- Production dependency vulnerabilities go from 55 to 8. The remaining ones need the Next.js and Nextra major upgrades.

---

## [1.2.0] — 2026-03-18

### Added
- AI Agent Skills section in the introduction page
- `npm run install-from-release` script for installing skills from GitHub Releases

### Fixed
- Update Node to 22 and sync `package-lock.json` for CI

### Changed
- Reduce context duplication in WebPerf skills (−16.6% lines)

---

## [1.1.0] — 2026-03-17

### Added
- Minified skill scripts with console output stripped at build time
- Structured return values for all snippets (enables Agent Skill consumption)
- Progressive disclosure for skills (L2/L3 content split)
- `context: fork` added to all webperf skills
- External distribution via `dist/` directory with readable scripts
- GitHub Release workflow and remote skill installer

### Fixed
- Critical CSS Detection: use `renderBlockingStatus` to avoid false positives
- Sync `.claude/skills/` cleanly without preserving stale subdirectories
- Correct bugs and inconsistencies in Core Web Vitals snippets

### Changed
- Skills reorganized for agent-first consumption

---

## [1.0.0] — 2026-03-04

### Added
- Agent Skills system with `generate-skills.js` build script
- Intelligent workflows and decision trees for autonomous performance analysis
- Local skill installation via `npm run install-skills`
- Global skill installation via `npm run install-global`
- WebMCP support to expose snippets as structured tools for AI agents
- Lazy-load `CldVideoPlayer` on click to avoid loading video player on every page
- `snippets-registry` dynamic import chunk for easier identification

### Fixed
- Set intrinsic width/height on hero image to prevent CLS

---

[Unreleased]: https://github.com/nucliweb/webperf-snippets/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/nucliweb/webperf-snippets/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.3.0...v2.0.0
[1.3.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nucliweb/webperf-snippets/releases/tag/v1.0.0
