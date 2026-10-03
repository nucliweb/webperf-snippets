# Changelog

All notable changes to the `webperf-snippets` CLI are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The CLI is versioned and published independently from the snippets collection, with `cli-v*` tags. See the [root changelog](../CHANGELOG.md) for the rest of the project.

---

## [Unreleased]

### Added
- `loading` workflow runs 5 more snippets, 11 in total: `script-timings`, `ttfb-resources`, `js-execution`, `third-party-impact` and `cache-strategy`. `cache-strategy` makes HEAD requests of its own, so it runs last.
- `audit` workflow runs 11 more snippets, 22 in total: `compression`, `inline-scripts`, `inline-css`, `webfonts`, `content-visibility`, `prefetch`, `video`, `dom-size`, `oversized-images`, `image-audit` and `svg-bitmaps`. Their `error` issues now count toward the exit code (an inline script that blocks the parser in the head, a prefetch of a file the page already uses, a font that fails to load, an excessive DOM). The steps that make their own requests run last.
- `--snippet` accepts the name of any snippet (`--snippet Compression-Audit`), in any case, besides the short aliases and `Category/Name` paths. An unknown name exits with code `2` and lists the closest snippets.

### Fixed
- `TTFB-Resources` returns an empty result (`status: "ok"`, `count: 0`, an info issue) on a page with no resource it can measure, instead of an error that made a workflow exit with code `1`.
- `--snippet` only resolves a listed snippet. Before, any `.js` file reachable from the snippets directory by a relative path could be loaded and run in the page.

---

## [0.3.0] — 2026-10-02

### Added
- GitHub Action at `.github/actions/webperf-snippets`: installs the CLI and Chromium, runs a workflow with LCP and CLS budgets, and exposes `markdown` and `exit-code` outputs. The markdown is written to the job summary and handled as untrusted text.
- `--crux-key <key>` (or `CRUX_API_KEY`): add CrUX field data at the 75th percentile for LCP, CLS and INP next to the measured values, in the human, markdown and JSON output. The form factor follows `--viewport`; a page without data falls back to its origin and is labeled `origin-level`; a CrUX error only skips the section.
- `--report-to <url>` and `--api-key <key>`: POST the results as JSON to an `https` endpoint after the run. Without the flag the CLI makes no external calls. A failed POST only prints a warning and never changes the exit code. The key can also come from `PERF_REVIEWS_API_KEY`.
- `--storage-state <path>`: measure pages behind a login with a Playwright storage state (cookies and localStorage).
- `INP` snippet alias for `--snippet INP`.

### Changed
- The snippets the CLI runs include the fixes released in the collection version 1.3.0. Results differ for existing users: CLS is the largest session window instead of the sum of all shifts, and `TTFB` and `FCP` are measured from `activationStart` on prerendered pages.

---

## [0.2.0] — 2026-05-06

### Added
- `loading` workflow: TTFB, FCP, render-blocking resources, resource hints, scripts and fonts.
- Shared page session, so the follow-up snippets of a workflow reuse one loaded page.
- Synthetic interactions for INP: `--interact-script <path>` runs a JSON list of interactions before the snippets are evaluated.
- Markdown reporter for pull request comments: `--markdown`.
- Manual approval before publishing to npm.

---

## [0.1.1] — 2026-05-04

### Fixed
- CI consistency checks and the npm publish configuration.

---

## [0.1.0] — 2026-05-04

### Added
- First release: runs the snippets headlessly with Playwright. The default `core-web-vitals` workflow runs LCP and CLS, plus LCP subparts when LCP is above 2.5 s.
- `audit` workflow with deterministic structural checks.
- Viewport presets (`mobile` by default, `tablet`, `desktop`) with `--viewport`.
- `--verbose` flag to show every item, including passing checks.
- Fonts snippet, with an alias and detailed terminal output.
- Documentation page and a Vitest suite with unit and end-to-end tests.
- npm publish workflow triggered by `cli-v*` tags.

---

[Unreleased]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.2.0...HEAD
[0.2.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.1.1...cli-v0.2.0
[0.1.1]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.1.0...cli-v0.1.1
[0.1.0]: https://github.com/nucliweb/webperf-snippets/releases/tag/cli-v0.1.0
