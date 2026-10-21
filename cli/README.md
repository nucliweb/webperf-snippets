# webperf-snippets CLI

Run curated [WebPerf Snippets](https://webperf-snippets.net) headlessly via Playwright. Diagnose Core Web Vitals beyond what Lighthouse exposes and gate CI on real performance budgets.

<img width="1820" height="1442" alt="webperf-snippets-CLI" src="https://github.com/user-attachments/assets/af7e6b02-8877-407e-87a4-db063468b5fb" />


> **Status:** v0.4. Core Web Vitals, loading, interaction and structural audit workflows, and every snippet of the collection by name. See the [Roadmap](#roadmap).

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
npx webperf-snippets https://example.com
```

Loading audit (11 steps: TTFB, FCP, render-blocking, scripts, resource timings, third-party impact, fonts, cache; the list is in the [CLI page](https://webperf-snippets.net/CLI)):

```bash
npx webperf-snippets https://example.com --workflow loading
```

Structural checks for CI (22 checks: render-blocking, compression, fonts, images, hints, DOM size and more; the list is in the [CLI page](https://webperf-snippets.net/CLI)):

```bash
npx webperf-snippets https://example.com --workflow audit
```

Markdown output for PR comments:

```bash
npx webperf-snippets https://example.com --markdown
```

JSON output (for piping into `jq` or CI):

```bash
npx webperf-snippets https://example.com --json
```

Single snippet:

```bash
npx webperf-snippets https://example.com --snippet LCP-Subparts
```

Synthetic INP measurement with an interaction script:

```bash
npx webperf-snippets https://example.com --snippet INP --interact-script interactions.json
npx webperf-snippets https://example.com --snippet Interaction/Interactions --interact-script interactions.json
```

The Interaction snippets (`Interactions`, `Input-Latency-Breakdown`, `LongTask`, `Forced-Synchronous-Layout`...) are installed before the first step and read after the last one, so their result holds what the steps caused.

The CLI waits for the browser to report the timing of the last interaction before it reads the snippets. A script that ends right after a click still reads the page before anything the click sets in motion later has happened, such as a request or an animation, so end it with a `wait` step when you want to measure that.

Interaction audit (long tasks, long animation frames, scroll, layout shifts, forced layouts, interaction latency). It scrolls the page, or runs your `--interact-script`; the steps that need a click are skipped when the script has none:

```bash
npx webperf-snippets https://example.com --workflow interaction
```

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
CRUX_API_KEY=your-key npx webperf-snippets https://example.com
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
  "meta": { "viewport": "mobile", "waitMs": 3000, "cli_version": "1.1.0" }
}
```

For a `--snippet` run, `workflow` is `null` and a `snippet` field carries the name. `results` is the same list the `--json` output contains, so it can include URLs and details of the measured page; send it only to an endpoint you trust.

- The URL must be `https`. `http` is accepted only for `localhost`, so a key is never sent in clear text.
- `--api-key` is sent as `Authorization: Bearer <key>`. Prefer the `PERF_REVIEWS_API_KEY` environment variable, because a flag ends up in shell history and CI logs. The key is never printed.
- The exit code never depends on the report. A failed POST (error status, unreachable endpoint, or no answer within 5 seconds) prints a warning and the exit code stays the one the budgets and snippets decide. If the endpoint answers `{ "ok": false, "regressions": [...] }`, the regressions are printed as a warning, again without changing the exit code.

CI gating:

```bash
npx webperf-snippets https://example.com --budget-lcp 2500 --budget-cls 0.1
```

### Options

| Option                       | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `--workflow <name>`          | Workflow to run. Default: `core-web-vitals`. Options: `core-web-vitals`, `loading`, `audit`, `interaction`. |
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

### Follow-up steps

The results of a run can add steps on the same page load: LCP over 2.5 s adds `LCP-Subparts`, over 4 s `LCP-Trail`; an image or video LCP adds its entropy, image or video audit; CLS over 0.1 adds `Layout-Shift-Loading-and-Interaction`, over 0.25 also the lazy images, fonts, critical CSS and images without dimensions; TTFB over 600 ms adds `TTFB-Sub-Parts`; FCP over 1.8 s adds the render-blocking check. The full table is in the [CLI page](https://webperf-snippets.net/CLI). Each snippet runs once, and a follow-up informs: its `error` issues do not change the exit code.

### Exit codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `0`  | All checks passed.                            |
| `1`  | Budget violation, a snippet errored, or a step of the workflow reported an `error` issue. |
| `2`  | Usage error (missing URL, unknown workflow).  |

## MCP server

`webperf-snippets mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so an AI agent can call the snippets by name instead of reading their source. Add it to a client that launches local servers, for example Claude Code:

```bash
claude mcp add webperf -- npx -y webperf-snippets mcp
```

| Tool            | What it does                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `list_snippets` | Lists the snippets with their category, title, short aliases and whether they track interactions. Takes an optional `category`. |
| `run_snippet`   | Opens a URL in a headless Chromium, runs one snippet and returns the object it returns. Takes `url`, `snippet` (name, alias or `Category/Name`), and optional `viewport` and `waitMs`. The snippets that record interactions run on a page opened with `open_page`. |
| `run_workflow`  | Runs a workflow of the CLI (`core-web-vitals`, `audit`, `loading`, `interaction`) and the follow-ups of its decision tree. Takes `url`, `workflow`, and optional `viewport` and `waitMs`. |
| `get_crux`      | Returns the CrUX p75 of LCP, CLS and INP for a URL, or its origin. Takes `url` and an optional `formFactor` (`phone`, `desktop`, `tablet`). Needs `CRUX_API_KEY` in the environment of the server. |
| `open_page`     | Opens a URL in a page that stays open between calls and installs tracking snippets (`track`, such as `INP`). Returns a `sessionId`. |
| `interact`      | Runs steps on an open page: `click`, `type`, `hover`, `scroll` or `wait`. |
| `read_results`  | Returns what the tracking snippets of an open page have recorded. |
| `close_page`    | Closes an open page. |

The server also offers resources, documents a client can attach to the context:

| Resource                         | What it has                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `webperf://schema`               | The contract every snippet result follows: base shape, statuses, how to read a result. |
| `webperf://schema/{snippet}`     | The fields one snippet returns, with an example.                         |
| `webperf://workflows/{category}` | The workflows and the decision tree of a category.                       |

And prompts, templates that chain the tools (in Claude Code, `/mcp__webperf__audit_lcp`): `audit_lcp`, `debug_inp` and `audit_page`, each with a `url` argument.

The CrUX key goes in the configuration of the client, never in a tool argument:

```bash
claude mcp add webperf -e CRUX_API_KEY=<key> -- npx -y webperf-snippets mcp
```

At most three pages are open at a time, a page closes after 10 minutes without use, and every page and Chromium close when the client disconnects.

The server answers clients of both eras of the protocol: the 2026-07-28 revision and the earlier ones that open with `initialize`. [ADR 0002](../docs/adr/0002-mcp-server-as-cli-subcommand.md) explains why it is a subcommand and uses stdio.

## CI example

GitHub Actions, fail the PR if LCP exceeds 2.5s:

```yaml
- run: |
    npm install --no-save webperf-snippets playwright
    npx playwright install --with-deps chromium
    npx webperf-snippets https://staging.example.com --budget-lcp 2500 --budget-cls 0.1
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
| `workflow`       | `core-web-vitals`   | Workflow to run: `core-web-vitals`, `loading`, `audit` or `interaction`.                                    |
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
- ~~v0.3: GitHub Action wrapper, auth flows (login + measure logged-in pages), CrUX field-data enrichment, `--report-to`.~~ ✓ Released
- ~~v0.4: Every snippet by name, a 22-step audit, an 11-step loading workflow, the interaction workflow and decision-tree follow-ups for Core Web Vitals.~~ ✓ Released

## How it works

1. Launches headless chromium via Playwright.
2. Navigates to the URL, waits for the `load` event and then for `--wait` milliseconds (3000 by default), so late entries reach the page.
3. Evaluates each snippet's IIFE in the page context, capturing the returned object. The snippets read the entries Chrome only exposes to observers (LCP, layout shifts, long tasks, event timing) with a buffered `PerformanceObserver`, so they see the entries recorded before they ran.
4. With an interaction script, installs the tracking snippets first, runs the interactions, lets the page settle and then reads the tracking data and runs the other snippets.
5. Applies the workflow's decision tree to enqueue follow-up snippets.
6. Renders results (human or JSON) and exits with an appropriate code.

## License

MIT, see [LICENSE](../LICENSE).
