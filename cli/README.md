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

Loading audit (11 steps: TTFB, FCP, render-blocking, scripts, resource timings, third-party impact, fonts, cache; the list is in the [CLI page](https://webperf-snippets.nucliweb.net/CLI)):

```bash
npx webperf-snippets https://web.dev --workflow loading
```

Structural checks for CI (22 checks: render-blocking, compression, fonts, images, hints, DOM size and more; the list is in the [CLI page](https://webperf-snippets.nucliweb.net/CLI)):

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
npx webperf-snippets https://web.dev --snippet Interaction/Interactions --interact-script interactions.json
```

The Interaction snippets (`Interactions`, `Input-Latency-Breakdown`, `LongTask`, `Forced-Synchronous-Layout`...) are installed before the first step and read after the last one, so their result holds what the steps caused.

Pages behind a login, with a Playwright storage state (cookies and localStorage):

```bash
# Step 1: sign in once and save the session
npx playwright codegen --save-storage=auth.json https://example.com/login

# Step 2: measure an authenticated page
npx webperf-snippets https://example.com/dashboard --storage-state auth.json
```

The file holds live session cookies. Keep it out of version control (add it to `.gitignore`) and use a throwaway account when you run it in CI. The CLI exits with code `2` if the path does not exist.

Compare the measured values with CrUX field data (what real users experience at the 75th percentile):

```bash
CRUX_API_KEY=your-key npx webperf-snippets https://web.dev
```

```
Field data (CrUX p75, mobile)
  🟡 LCP    2.80s      needs-improvement    (synthetic: 2.10s)
  🟢 CLS    0.0800     good                 (synthetic: 0.0500)
  🟡 INP    220ms      needs-improvement    (synthetic: n/a)
```

Get a key for the [Chrome UX Report API](https://developer.chrome.com/docs/crux/api) and pass it with `--crux-key` or the `CRUX_API_KEY` environment variable; prefer the variable, because a flag ends up in shell history and CI logs. The section appears in the human and markdown output and under `crux` in the `--json` output.

- The population follows `--viewport`: `desktop` uses desktop data, `mobile` and `tablet` use phone data. The heading says which one.
- When the page itself has no data, the CLI looks the origin up instead and labels the section `origin-level`, so it is not mistaken for page-level data. If the origin has none either, the output says `Field data: not available`.
- A CrUX error (quota, network, no answer within 10 seconds) only skips the section. It never changes the exit code, and the key is never printed.
- INP shows `n/a` as the synthetic value unless you run an interaction script.

Send the results to an endpoint after the run with `--report-to`:

```bash
npx webperf-snippets https://example.com --workflow audit \
  --report-to https://reports.example.com/api/report \
  --api-key $REPORT_API_KEY
```

Without `--report-to` the CLI makes no external calls. With it, the results are POSTed as JSON once the snippets have finished:

```json
{
  "url": "https://example.com",
  "workflow": "audit",
  "timestamp": "2026-05-06T10:00:00.000Z",
  "navMs": 1240,
  "results": [],
  "meta": { "viewport": "mobile", "waitMs": 3000, "cli_version": "0.3.0" }
}
```

For a `--snippet` run, `workflow` is `null` and a `snippet` field carries the name. `results` is the same list the `--json` output contains, so it can include URLs and details of the measured page; send it only to an endpoint you trust.

- The URL must be `https`. `http` is accepted only for `localhost`, so a key is never sent in clear text.
- `--api-key` is sent as `Authorization: Bearer <key>`. Prefer the `PERF_REVIEWS_API_KEY` environment variable, because a flag ends up in shell history and CI logs. The key is never printed.
- The exit code never depends on the report. A failed POST (error status, unreachable endpoint, or no answer within 5 seconds) prints a warning and the exit code stays the one the budgets and snippets decide. If the endpoint answers `{ "ok": false, "regressions": [...] }`, the regressions are printed as a warning, again without changing the exit code.

CI gating:

```bash
npx webperf-snippets https://web.dev --budget-lcp 2500 --budget-cls 0.1
```

### Options

| Option                       | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `--workflow <name>`          | Workflow to run. Default: `core-web-vitals`. Options: `core-web-vitals`, `loading`, `audit`. |
| `--snippet <name>`           | Run a single snippet by name, alias or `Category/Name` path.           |
| `--json`                     | Output JSON instead of formatted text.                                 |
| `--markdown`                 | Output GitHub-renderable markdown (for PR comments).                   |
| `--viewport <preset>`        | Viewport preset: `mobile` (default), `tablet`, `desktop`.             |
| `--wait <ms>`                | Post-load wait before evaluating snippets. Default: `3000`.            |
| `--interact-script <path>`   | JSON file with interactions to run after the page loads (`scroll`, `click`, `hover`, `type`, `wait`). The Interaction snippets are installed first and read afterwards. |
| `--storage-state <path>`     | Playwright storage state (cookies and localStorage) for pages that require authentication. |
| `--crux-key <key>`           | Add CrUX field data (p75) next to the measured values. Prefer `CRUX_API_KEY`. |
| `--report-to <url>`          | POST the results to this `https` URL after the run. No external calls without it. |
| `--api-key <key>`            | Sent as a Bearer token with `--report-to`. Prefer `PERF_REVIEWS_API_KEY`. |
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
| `INP`              | CoreWebVitals/INP                              |
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

### GitHub Action

The repository ships a composite action that installs the CLI and Chromium, runs a workflow and exposes the result as markdown, so any repository can gate on performance budgets without extra setup:

```yaml
jobs:
  webperf:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: nucliweb/webperf-snippets/.github/actions/webperf-snippets@main
        id: webperf
        with:
          url: https://staging.example.com
          budget-lcp: 2500
          fail-on-budget: "false"

      - uses: actions/github-script@v7
        env:
          BODY: ${{ steps.webperf.outputs.markdown }}
        with:
          script: |
            await github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body: process.env.BODY,
            });

      - if: steps.webperf.outputs.exit-code != '0'
        run: exit 1
```

| Input            | Default             | Description                                                                                  |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `url`            | required            | URL to measure.                                                                              |
| `workflow`       | `core-web-vitals`   | Workflow to run: `core-web-vitals`, `loading` or `audit`.                                    |
| `budget-lcp`     | `2500`              | LCP budget in ms. An empty value disables the check.                                         |
| `budget-cls`     | `0.1`               | CLS budget. An empty value disables the check.                                               |
| `fail-on-budget` | `true`              | Fail the step when a budget is exceeded or a snippet errors. Use `"false"` to read `exit-code` and decide yourself. |
| `cli-version`    | `latest`            | Version of the `webperf-snippets` npm package to run.                                        |

| Output      | Description                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| `markdown`  | The results as markdown. Also written to the job summary.                            |
| `exit-code` | Exit code of the CLI: `0` passed, `1` budget exceeded or a snippet errored, `2` usage error. |

The markdown includes text taken from the measured page, so pass it to other steps through an environment variable (`env:` and `process.env`) as above, never by interpolating `${{ steps.webperf.outputs.markdown }}` inside a script. With `fail-on-budget: "false"` the action step always succeeds, which lets later steps post the comment before the job fails. Without `permissions: pull-requests: write` the comment step cannot post on a pull request.

LCP, CLS and INP vary by 15 to 30% on shared runners; prefer the deterministic `audit` workflow for a gate, or generous budgets.

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
