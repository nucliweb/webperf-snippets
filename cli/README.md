# webperf-snippets CLI

Run curated [WebPerf Snippets](https://webperf-snippets.nucliweb.net) headlessly via Playwright. Diagnose Core Web Vitals beyond what Lighthouse exposes and gate CI on real performance budgets.

<img width="1820" height="1442" alt="webperf-snippets-CLI" src="https://github.com/user-attachments/assets/af7e6b02-8877-407e-87a4-db063468b5fb" />


> **Status:** v0.2. Core Web Vitals, loading audit, and structural checks. See [Roadmap](#roadmap) for what's next.

## Why

Lighthouse gives you a score. The DevTools snippets give you the *diagnosis*, such as TTFB / Resource Load Delay / Element Render Delay sub-parts, LoAF script attribution, and render-blocking resources. This CLI runs the same curated snippets in a headless browser so you can:

- Diagnose LCP regressions in CI without copy-pasting into DevTools.
- Gate pull requests on real performance budgets.
- Automate the snippets you already run by hand.

## Install

Playwright is a peer dependency. Install both, plus the chromium browser:

```bash
npm install --save-dev webperf-snippets playwright
npx playwright install chromium
```

## Usage

```bash
npx webperf-snippets <url> [options]
```

### Examples

Run the default Core Web Vitals workflow (LCP + CLS, plus LCP-Subparts if LCP > 2.5s):

```bash
npx webperf-snippets https://web.dev
```

Loading audit (TTFB, FCP, render-blocking, scripts, fonts):

```bash
npx webperf-snippets https://web.dev --workflow loading
```

Structural checks for CI (render-blocking, fonts, priority hints, resource hints):

```bash
npx webperf-snippets https://web.dev --workflow audit
```

Markdown output for PR comments:

```bash
npx webperf-snippets https://web.dev --markdown
```

JSON output (for piping into `jq` or CI):

```bash
npx webperf-snippets https://web.dev --json
```

Single snippet:

```bash
npx webperf-snippets https://web.dev --snippet LCP-Subparts
```

Synthetic INP measurement with an interaction script:

```bash
npx webperf-snippets https://web.dev --snippet INP --interact-script interactions.json
```

CI gating:

```bash
npx webperf-snippets https://web.dev --budget-lcp 2500 --budget-cls 0.1
```

### Options

| Option                       | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `--workflow <name>`          | Workflow to run. Default: `core-web-vitals`. Options: `core-web-vitals`, `loading`, `audit`. |
| `--snippet <name>`           | Run a single snippet by alias or `Category/Name` path.                 |
| `--json`                     | Output JSON instead of formatted text.                                 |
| `--markdown`                 | Output GitHub-renderable markdown (for PR comments).                   |
| `--viewport <preset>`        | Viewport preset: `mobile` (default), `tablet`, `desktop`.             |
| `--wait <ms>`                | Post-load wait before evaluating snippets. Default: `3000`.            |
| `--interact-script <path>`   | JSON file with interactions to run before evaluation (for INP).        |
| `--budget-lcp <ms>`          | Exit `1` if LCP exceeds this value.                                    |
| `--budget-cls <score>`       | Exit `1` if CLS exceeds this value.                                    |
| `--verbose`                  | Show all items, including passing checks.                              |
| `--headed`                   | Show the browser window (debug).                                       |
| `-h, --help`                 | Show help.                                                             |

### Snippet aliases

| Alias              | Snippet                                        |
| ------------------ | ---------------------------------------------- |
| `LCP`              | CoreWebVitals/LCP                              |
| `CLS`              | CoreWebVitals/CLS                              |
| `LCP-Subparts`     | CoreWebVitals/LCP-Subparts                     |
| `fonts`            | Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold |
| `render-blocking`  | Loading/Find-render-blocking-resources         |
| `resource-hints`   | Loading/Resource-Hints-Validation              |
| `preload-scripts`  | Loading/Validate-Preload-Async-Defer-Scripts   |
| `priority-hints`   | Loading/Priority-Hints-Audit                   |
| `critical-css`     | Loading/Critical-CSS-Detection                 |
| `ttfb`             | Loading/TTFB-Sub-Parts                         |
| `script-parties`   | Loading/First-And-Third-Party-Script-Info      |
| `script-loading`   | Loading/Script-Loading                         |
| `lazy-atf`         | Loading/Find-Above-The-Fold-Lazy-Loaded-Images |
| `lazy-conflict`    | Loading/Find-Images-With-Lazy-and-Fetchpriority |
| `eager-below-fold` | Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport |

### Exit codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `0`  | All checks passed.                            |
| `1`  | Budget violation, or a snippet errored.       |
| `2`  | Usage error (missing URL, unknown workflow).  |

## CI example

GitHub Actions, fail the PR if LCP exceeds 2.5s:

```yaml
- run: |
    npm install --no-save webperf-snippets playwright
    npx playwright install --with-deps chromium
    npx webperf-snippets https://staging.web.dev --budget-lcp 2500 --budget-cls 0.1
```

## Publishing

The CLI package is published to npm via a tag-based workflow. Publishing is explicit and intentional; it only happens when a `cli-v*` tag is pushed.

### Release steps

1. Bump the version in `cli/package.json`.
2. Commit the version change.
3. Tag and push:
   ```bash
   git tag cli-v0.2.0
   git push origin cli-v0.2.0
   ```
4. The `publish-cli` CI job runs, executes the full test suite, and publishes to npm.

### Why tag-based and not path-based

An alternative is to publish automatically on every push to `main` that touches `cli/`, using a version check to skip republishes. Tag-based publishing was chosen instead because it keeps releases deliberate; a passing CI on `main` does not mean the package is ready to ship, and a tag communicates that intent explicitly.

### Access control

Tag protection rules restrict who can push `cli-v*` tags. Configure them under **Settings → Rules → New ruleset** in the repository, targeting the `cli-v*` tag pattern and limiting push access to admins or maintainers. This ensures only authorized collaborators can trigger a publish.

### Required secret

The `NPM_TOKEN` secret must be set in the repository settings with publish access to the `webperf-snippets` npm package.

## Known limitations

- **CLS in headless is conservative**: layout shifts that only happen on scroll are missed unless you script the scroll.
- **First navigation only**: each `webperf-snippets` invocation runs one URL. SPAs need the post-route URL passed directly.
- **Synthetic INP ≠ field INP**: `--interact-script` measures handler latency for a single scripted event. Real INP reflects the worst interaction across all user sessions; use RUM for field data.

## Roadmap

- ~~v0.2: Loading workflow (TTFB, FCP, render-blocking, scripts, fonts), shared page session, synthetic interactions for INP, markdown reporter for PR comments.~~ ✓ Released
- v0.3: GitHub Action wrapper.
- v0.4: Auth flows (login + measure logged-in pages), CrUX field-data enrichment.

## How it works

1. Launches headless chromium via Playwright.
2. Pre-registers `PerformanceObserver`s for LCP and layout-shift before navigation (Chrome doesn't expose these via `getEntriesByType` without a buffered observer, so the runner shims it).
3. Navigates, waits for the page to settle.
4. Evaluates each snippet's IIFE in the page context, capturing the returned object.
5. Applies the workflow's decision tree to enqueue follow-up snippets.
6. Renders results (human or JSON) and exits with an appropriate code.

## License

MIT, see [LICENSE](../LICENSE).
