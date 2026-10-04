# Changelog

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Security
- The site runs on Next.js 16, which resolves the `next` and `postcss` advisories reported by `npm audit`. `dev` and `build` use webpack (`--webpack`) for the `?raw` snippet imports, and React stays on 18.

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

[Unreleased]: https://github.com/nucliweb/webperf-snippets/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nucliweb/webperf-snippets/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nucliweb/webperf-snippets/releases/tag/v1.0.0
