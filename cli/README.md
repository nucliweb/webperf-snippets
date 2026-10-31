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

The steps that tell first-party from third-party resources count as first party the root domain of the page and its subdomains (`cdn.example.com` for `example.com`). A site that serves its own assets from another domain, such as its CDN, lists it with `--own-domains`, comma-separated or repeated:

```bash
npx webperf-snippets https://example.com --workflow loading --own-domains cdn.example.net,static.example.org
```

Each domain counts with its root domain, so `cdn.example.net` makes every host under `example.net` first party. The CLI writes the list in the `OWN_DOMAINS` constant of each snippet, the same one you edit at the top of the snippet in the console. An empty domain or one with spaces exits with code `2`.

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

The JSON output records how the page was measured in `conditions`, so a later run can tell whether it measured the same way: the viewport, the workflow (or the path of the snippet with `--snippet`), the wait, the version of the CLI and the machine: its CPU model, cores, architecture and memory, as the operating system reports them, and a benchmark index, a short CPU test in Node before Chromium starts, which only informs, since on the same machine it moves by up to 40 % with the load.

```json
"conditions": { "viewport": "mobile", "workflow": "core-web-vitals", "waitMs": 3000, "cliVersion": "1.9.0", "machine": { "cpu": "Apple M4", "cores": 10, "arch": "arm64", "memoryGB": 16, "benchmarkIndex": 2371 } }
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

Pages behind an access proxy that reads a token from every request, such as the service tokens of Cloudflare Access, take the token as request headers with `--header`, once per header:

```bash
npx webperf-snippets https://review.example.com \
  --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```

The headers go with every request to the origin of the URL and never to another origin, so third parties do not receive the token and their cross-origin requests need no CORS preflight. Each request to that origin is paused in the browser to add them, which adds a few milliseconds to its timing; when the proxy accepts a session cookie, `--storage-state` measures without that cost. A header without a name or a colon exits with code `2`. Read the values from environment variables, as above, to keep them out of the shell history.

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

With a key, the field data also gives what CrUX knows of the LCP when it is an image: the p75 of its sub-parts, TTFB, load delay, load duration and render delay. When the measurement ran LCP-Subparts, with `--snippet LCP-Subparts` or the `core-web-vitals` workflow over 2.5 s, a table puts each one next to its lab value, with a note where one side is at least 1.5 times the other and 100 ms apart: a slower server or network for users, an image the lab finds sooner, slower connections, slower devices, or a lab slower than users. The field sub-parts describe only the loads whose LCP is an image, and the table says which share that is; when the LCP of the lab is not an image, only TTFB and render delay compare. Each p75 is taken on its own, so the sub-parts do not add up to the p75 of LCP. A line gives the navigation types of the users, by share, and points to Back-Forward-Cache when over 5 % of the visits come back without the back/forward cache. The JSON output carries them in `crux.subParts`, `crux.lcpImageShare`, `crux.roundTripTime` and `crux.navigationTypes`.

`--crux-history <weeks>` adds the trend of the field data over the last 1 to 40 weeks, from the [CrUX History API](https://developer.chrome.com/docs/crux/history-api), with the same key. Each week is the p75 of the 28 days before it, so the weeks overlap and the series is smooth. For LCP, CLS and INP the section gives the first and the last week, the change between them and its direction, `stable` within 5 %, and the weeks as a sparkline, where a gap is a week with too little data:

```
Field data trend (CrUX p75, 40 weeks, mobile, origin-level)
  LCP   2.88s → 3.10s       ▲ +7.7%   worsening   ▃▃▄▃▃▃▄▆▇██▇▆▄▂▁▂▃▃▄▅▆▆▆▆▆▆
  CLS   0.2600 → 0.2100     ▼ −19.2%  improving   ▅▆▆▇▇█▇▆▆▅▄▃▃▃▃▃▂▂▁▂▂▂▂▂▂▂
  INP   253ms → 251ms       ▼ −0.8%   stable      ▇▅▃▂▂▄▆██▇▅▃▂▃▄▆▅▃▂▁▂▃▃▄▅▆
```

The JSON output carries it in `crux.history`, with the periods, the p75 of each week and the trend of each metric. Like the p75, it uses the page when it has data of its own and its origin otherwise, and says which in `scope`.

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
  "meta": { "viewport": "mobile", "waitMs": 3000, "cli_version": "1.9.0" }
}
```

For a `--snippet` run, `workflow` is `null` and a `snippet` field carries the name. With `--cpu` or `--network`, `meta` carries the conditions in `throttling`, and with `--runs`, the summary of the runs in `runs`. `results` is the same list the `--json` output contains, so it can include URLs and details of the measured page; send it only to an endpoint you trust.

- The URL must be `https`. `http` is accepted only for `localhost`, so a key is never sent in clear text.
- `--api-key` is sent as `Authorization: Bearer <key>`. Prefer the `PERF_REVIEWS_API_KEY` environment variable, because a flag ends up in shell history and CI logs. The key is never printed.
- The exit code never depends on the report. A failed POST (error status, unreachable endpoint, or no answer within 5 seconds) prints a warning and the exit code stays the one the budgets and snippets decide. If the endpoint answers `{ "ok": false, "regressions": [...] }`, the regressions are printed as a warning, again without changing the exit code.

Measure under the conditions of a slower device and network with `--cpu` and `--network`. Without them the CLI runs at the speed of the machine, which on a laptop or a CI runner is faster than most phones:

```bash
npx webperf-snippets https://example.com --cpu 4 --network slow-4g
```

`--cpu <factor>` slows the main thread down by that factor. `--network` takes the presets of DevTools, with the same values:

| Preset    | Download    | Upload      | Latency   |
| --------- | ----------- | ----------- | --------- |
| `fast-4g` | 8.1 Mbps    | 1.35 Mbps   | 165 ms    |
| `slow-4g` | 1.44 Mbps   | 675 kbps    | 562.5 ms  |
| `3g`      | 400 kbps    | 400 kbps    | 2000 ms   |

Chrome adds the latency to the body of each response, not to its headers. The values read from `responseStart`, such as the TTFB and its sub-parts, do not include it; the download of each resource, FCP, LCP and the load event do. The report names the conditions under its header, and the JSON output carries them in `throttling`, such as `{ "cpu": 4, "network": "slow-4g" }`. A CPU factor below `1` or an unknown preset exits with code `2`.

One page load is one sample, and lab values vary from one load to the next. `--runs <n>` measures the page n times, from 1 to 9, one after the other, and reports the median run, as WebPageTest does: every result comes from that run, so they agree with each other (the sub-parts of the LCP add up to its LCP):

```bash
npx webperf-snippets https://example.com --runs 5 --budget-lcp 2500
```

The median run is the one with the median LCP. A workflow without LCP uses the first of FCP, TTFB and the navigation time that it measures, and `--median-by <metric>` picks another one (`LCP`, `FCP`, `TTFB`, `CLS`, `INP` or `navMs`). With an even count it takes the lower of the two middle runs, so the report is always a run that happened. The report adds the median, min and max of each metric across the runs, and how much the runs agree, and the JSON output carries them in `runs`:

```json
"runs": {
  "count": 5,
  "failed": 0,
  "medianRun": 3,
  "medianBy": "LCP",
  "summary": {
    "LCP": { "median": 2140, "min": 1980, "max": 2610, "values": [2610, 2010, 2140, 1980, 2290], "unit": "ms", "cv": 11.6, "agreement": "noisy" }
  }
}
```

`medianRun` counts from 1, and `values` keeps the order of the runs. `cv` is the coefficient of variation of the runs, their standard deviation over their mean in percent, and `agreement` its band: `consistent` up to 5 %, `variable` up to 10 % and `noisy` above, where one median says little and more runs help. Runs that vary by less than half of the minimum change of `--baseline` (50 ms for LCP, FCP and TTFB, 25 ms for INP, 0.025 for CLS) are `consistent` whatever their CV, since a local TTFB of 3 to 18 ms has a CV of 64 %. The budgets compare the median of each metric, not one run. A run that fails, such as a navigation that does not finish, counts in `failed` and is left out of the median; when every run fails, the command exits with code `1`. Each run is reported on stderr as it starts, so stdout keeps only the report. An invalid count or metric exits with code `2`.

Measure several pages, on several devices and in several variants, in one command with `--matrix <file>`. The file lists them, and the CLI measures every URL on every device and in every variant, each combination `runs` times, one load after the other:

```json
{
  "urls": {
    "home": "https://example.com/",
    "article": "https://example.com/news/some-article"
  },
  "devices": {
    "mobile": { "viewport": "mobile", "cpu": 4, "network": "slow-4g" },
    "high-end": { "viewport": "mobile", "cpu": 1, "network": { "downloadKbps": 50000, "uploadKbps": 10000, "latencyMs": 20 } },
    "desktop": { "viewport": "desktop" }
  },
  "variants": {
    "no-consent": {},
    "consent": { "storageState": "states/consent.json" }
  },
  "runs": 3
}
```

```bash
npx webperf-snippets --matrix matrix.json --budget-lcp 2500
```

- `urls`: names and URLs. An array of URLs also works, and names each one by its path and query (`/`, `/news/`), with the host when the URLs have more than one.
- `devices`: the `viewport` preset, the `cpu` factor and the `network`, a preset (`fast-4g`, `slow-4g`, `3g`) or a network of its own in kilobits per second and milliseconds, for the ones DevTools has no preset for, such as 5G. An array of viewport presets (`["mobile", "desktop"]`) is a shortcut for devices without throttling. Without `devices`, the matrix measures a mid-range phone, with CPU 4x and Slow 4G, as Lighthouse does.
- `variants`: the conditions of each variant, `storageState` (relative to the file), `headers` and `ownDomains`. Without `variants`, the combinations are the pages on the devices: the report has no Variant column, and the `id` of a combination is its page and device (`/news/ · mobile`).
- `runs` (1 to 9) and `medianBy`, which `--runs` and `--median-by` replace.

The options of the command line apply to every combination: `--workflow`, `--snippet`, `--wait`, `--interact-script`, `--header`, `--own-domains`, `--storage-state`, `--cpu`, `--network` and the budgets. The file replaces `cpu`, `network` and `storageState` where it sets them, and its `headers` and `ownDomains` add to the ones of the command line, the variant winning on the same header. A matrix file is meant to be versioned, so pass secrets, such as the token of an access proxy, with `--header` and an environment variable; a header of the file whose name looks like a secret raises a warning. A key the CLI does not know is an error, so a typo does not measure without its condition.

The report is a table with one row per combination and the rated median of each metric, a variable or noisy one followed by the coefficient of variation of its runs (`🟡 2.71s ±14%`), then the errors that decide the exit code; `--verbose` adds the report of the median run of each combination. `--markdown` gives the same table and folds the report of each combination into a `<details>` block, to keep a pull request comment readable. With `--json`, it is `{ "matrix", "runs", "combinations" }`, each combination being the report of its median run with its `id`, `name`, `device`, `variant` (when the file defines variants), `runs` and `conditions`, with the viewport of its device. The budgets compare the median of each combination. The command exits with code `1` when a combination exceeds a budget, has an error or fails every run, and with code `2` for an invalid file, before any page load, naming the place of the problem in the JSON. `--viewport` does not apply, since each device sets its own.

With CrUX, the CLI asks once for each URL and form factor, so the variants of a device share their field data. With `--report-to`, it posts one report for each combination, the body of one page with `meta.device`, `meta.variant` and `meta.runs`; the headers of the command line and of the file are conditions of the load, and no report carries their values.

Compare a run with an earlier one with `--baseline <file>`, the `--json` output of that run. The comparison says which metrics got worse or better beyond the noise of the lab, which errors are new or fixed, and what differs in how both runs were measured:

```bash
# On main, once: the baseline
npx webperf-snippets https://example.com --runs 5 --json > baseline.json

# On the pull request: compare and report
npx webperf-snippets https://pr-123.example.com --runs 5 --baseline baseline.json --markdown

# Fail when the page gets worse
npx webperf-snippets https://pr-123.example.com --runs 5 --baseline baseline.json --fail-on-regression
```

LCP, FCP, TTFB, CLS and INP compare when both runs measured them, the median of each with `--runs`; a metric that only one side measured is `not measured`. A metric regresses when it gets worse by more than its threshold, the larger of a share of the baseline and a minimum, and, when the baseline has two runs or more, ends above the slowest of them: a median inside the range of the baseline is noise the baseline already had. It improves under the same rules the other way, and otherwise it is unchanged.

With five runs or more on each side, the range gives way to a test of the runs themselves: a change that beats its threshold also needs a one-sided Mann-Whitney U p-value under 0.05, the chance that runs of an unchanged page would differ this much. A median can move with two slow runs out of five; the test asks whether most runs moved. The JSON of the metric adds `stats`, with `p`, the `shift` (the Hodges-Lehmann estimate, the median of the differences between every run of one side and every run of the other) and its 95 % interval `ci`, and the reports add them to the verdict: `regressed (p = 0.028, +500ms, 95% CI +20ms to +600ms)`, or `unchanged (no evidence: p = 0.35)` for a change over the threshold that the runs do not back. Three runs a side can never reach p < 0.05, so under five the range decides.

| Metric         | Share of the baseline | Minimum |
| -------------- | --------------------- | ------- |
| LCP, FCP, TTFB | 10%                   | 100 ms  |
| INP            | 10%                   | 50 ms   |
| CLS            | none                  | 0.05    |

`--threshold` changes one part of a threshold and keeps the other: `--threshold LCP=15%` the share, `--threshold LCP=200ms` the minimum, and `--threshold CLS=0.1` the only part of CLS. Repeat it for more metrics.

The errors that compare are the ones that decide the exit code: the issues of severity `error` of the steps of the workflow and the snippets that failed. Two errors are the same when they share their [code](https://github.com/nucliweb/webperf-snippets/blob/main/snippets/SCHEMA.md#issue-codes) and the resource they name, whatever their messages say; a resource of the page itself compares by its path and query, so the review app of a pull request, on another host, matches production. A snippet without codes on one side, as in a baseline of an earlier version, compares by message with the figures left out, so "Render-blocking CSS (69.21 KB)…" and "Render-blocking CSS (71.80 KB)…" are one error. An error that only this run has is new, and one that only the baseline had is fixed. Warnings and information do not compare, since they change too easily.

The report adds the comparison after the usual one, and `--markdown` a table for the pull request comment. The JSON output carries it in `baseline`:

```json
"baseline": {
  "file": "baseline.json",
  "url": "https://example.com/",
  "runs": { "count": 5, "medianBy": "LCP" },
  "metrics": {
    "LCP": { "baseline": 2100, "current": 2480, "delta": 380, "deltaPercent": 18.1, "threshold": 210, "verdict": "regressed" }
  },
  "errors": { "new": [{ "id": "render-blocking", "message": "1 render-blocking resource(s) delay rendering until 900ms" }], "fixed": [] },
  "warnings": []
}
```

When both runs were measured differently, with another workflow or snippet, viewport, wait, throttling, number of runs or version of the CLI, on another CPU model or with other cores, or on another path or query, the CLI compares anyway and warns on stderr, in the reports and in `warnings`: whoever reads the pull request comment does not see the stderr of the CI. Another host does not warn, since it is the review app of a pull request against production. A baseline of one run warns that only the thresholds apply.

The comparison only informs, and the exit code is the same as without it, unless `--fail-on-regression`, which exits with `1` when a metric regressed or an error is new, and names them on stderr. A baseline that does not exist or is not an output of the CLI, a baseline of a page for a matrix or of a matrix for a page, or a `--threshold` the CLI does not understand exits with code `2`, before the page loads.

A matrix compares with the `--json` output of an earlier matrix, each combination with the one of the same `id`:

```bash
npx webperf-snippets --matrix matrix.json --runs 3 --baseline last-week.json
```

The table adds a change column after each metric: the change when it counts (`▲ +380ms`, `▼ −90ms`), `=` when it is unchanged, and `new` for a combination the baseline did not have. Below the table come the warnings, once when every combination has them, the new and fixed errors of each combination, and the combinations that only one side has. `--markdown` gives the same, and the `<details>` block of each combination carries its own comparison. In the JSON output each combination carries its `baseline`, and the root `baseline` names the file and the `added` and `missing` combinations. `--fail-on-regression` exits with `1` when any combination regressed or has a new error.

CI gating:

```bash
npx webperf-snippets https://example.com --budget-lcp 2500 --budget-cls 0.1
```

Each budget compares the value measured, or the median with `--runs`, and fails when the value is above it. `--budget-lcp` and `--budget-cls` need the `core-web-vitals` workflow, `--budget-fcp` the `loading` workflow, `--budget-ttfb` the `loading` or `audit` workflow, and `--budget-inp` the `interaction` workflow with a click or a key press; `--snippet` with the snippet of the metric works too. A budget of a metric that the run does not measure exits with code `2` before the page loads, and one whose metric was not measured, such as INP without interactions, exits with code `1`: a budget never passes unchecked. The report lists every budget with its value and verdict, `passed`, `exceeded` with by how much, or `not measured` with why: a Budgets section in the human and markdown reports, and `budgets` in the JSON output and in the body of `--report-to`. A matrix lists the failed budgets with their combination under its table. Each failed budget is also written to stderr, with `--json` too.

### Options

| Option                       | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `--workflow <name>`          | Workflow to run. Default: `core-web-vitals`. Options: `core-web-vitals`, `loading`, `audit`, `interaction`. |
| `--snippet <name>`           | Run a single snippet by name, alias or `Category/Name` path.           |
| `--json`                     | Output JSON instead of formatted text.                                 |
| `--markdown`                 | Output GitHub-renderable markdown (for PR comments).                   |
| `--viewport <preset>`        | Viewport preset: `mobile` (default), `tablet`, `desktop`.             |
| `--wait <ms>`                | Post-load wait before evaluating snippets. Default: `3000`.            |
| `--cpu <factor>`             | Slow the main thread down by this factor, such as `4`. No throttling by default. |
| `--network <preset>`         | Throttle the network with a preset of DevTools: `fast-4g`, `slow-4g`, `3g`. No throttling by default. |
| `--interact-script <path>`   | JSON file with interactions to run after the page loads (`scroll`, `click`, `hover`, `type`, `wait`). The Interaction snippets are installed first and read afterwards. |
| `--storage-state <path>`     | Playwright storage state (cookies and localStorage) for pages that require authentication. |
| `--header "Name: value"`     | Request header for the origin of the URL only, such as the token of an access proxy. Repeat it for more headers. |
| `--own-domains <list>`       | Domains of the site to count as first party, such as its own CDN. Comma-separated or repeated. |
| `--runs <n>`                 | Measure the page n times, from 1 to 9, one after the other, and report the median run. |
| `--median-by <metric>`       | Metric that picks the median run: `LCP`, `FCP`, `TTFB`, `CLS`, `INP` or `navMs`. Default: the first of LCP, FCP, TTFB and `navMs` measured. |
| `--matrix <file>`            | Measure every URL of a JSON file on every device and in every variant it lists, and report a table of the medians. |
| `--baseline <file>`          | Compare the page, or each combination of a matrix, with the `--json` output of an earlier run: which metrics got worse or better beyond the noise, and which errors are new or fixed. |
| `--threshold <metric>=<v>`   | The threshold of a metric for `--baseline`, such as `LCP=15%`, `LCP=200ms` or `CLS=0.1`. Repeat it for more metrics. |
| `--fail-on-regression`       | Exit `1` when a metric regressed or an error is new against `--baseline`. |
| `--crux-key <key>`           | Add CrUX field data (p75) next to the measured values. Prefer `CRUX_API_KEY`. |
| `--crux-history <weeks>`     | Add the trend of the field data over the last 1 to 40 weeks. Needs a CrUX key. |
| `--report-to <url>`          | POST the results to this `https` URL after the run. No external calls without it. |
| `--api-key <key>`            | Sent as a Bearer token with `--report-to`. Prefer `PERF_REVIEWS_API_KEY`. |
| `--budget-lcp <ms>`          | Exit `1` if LCP exceeds this value or was not measured.                                    |
| `--budget-fcp <ms>`          | Exit `1` if FCP exceeds this value or was not measured.                                    |
| `--budget-ttfb <ms>`         | Exit `1` if TTFB exceeds this value or was not measured.                                    |
| `--budget-cls <score>`       | Exit `1` if CLS exceeds this value or was not measured.                                    |
| `--budget-inp <ms>`          | Exit `1` if INP exceeds this value or was not measured.                                    |
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
| `1`  | Budget violation, a snippet errored, a step of the workflow reported an `error` issue, or, with `--fail-on-regression`, a regression against the baseline. |
| `2`  | Usage error (missing URL, unknown workflow, a baseline or threshold that is not valid). |

## MCP server

`webperf-snippets mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so an AI agent can call the snippets by name instead of reading their source. Add it to a client that launches local servers, for example Claude Code:

```bash
claude mcp add webperf -- npx -y webperf-snippets mcp
```

It needs the Chromium of Playwright (`npx playwright install chromium`); without it, the tools answer with that command. The [MCP server documentation](https://webperf-snippets.net/MCP) has the configuration of other clients (Cursor, VS Code, Claude Desktop, Gemini CLI). The server is listed in the [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.nucliweb/webperf-snippets`.

| Tool            | What it does                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `list_snippets` | Lists the snippets with their category, title, short aliases and whether they track interactions. Takes an optional `category`. |
| `run_snippet`   | Opens a URL in a headless Chromium, runs one snippet and returns a summary of its result. Takes `url`, `snippet` (name, alias or `Category/Name`), and optional `viewport` and `waitMs`. The snippets that record interactions run on a page opened with `open_page`. |
| `run_workflow`  | Runs a workflow of the CLI (`core-web-vitals`, `audit`, `loading`, `interaction`) and the follow-ups of its decision tree. Takes `url`, `workflow`, and optional `viewport` and `waitMs`. |
| `get_crux`      | Returns the CrUX p75 of LCP, CLS and INP for a URL, or its origin. Takes `url` and an optional `formFactor` (`phone`, `desktop`, `tablet`). Needs `CRUX_API_KEY` in the environment of the server. |
| `open_page`     | Opens a URL in a page that stays open between calls and installs tracking snippets (`track`, such as `INP`). Returns a `sessionId`. |
| `interact`      | Runs steps on an open page: `click`, `type`, `hover`, `scroll` or `wait`. |
| `read_results`  | Returns what the tracking snippets of an open page have recorded. |
| `get_details`   | Returns the whole object of one snippet of a run, by the `runId` that `run_snippet`, `run_workflow` or `read_results` returned, without measuring again. Takes `runId` and `snippet`. |
| `close_page`    | Closes an open page. |

The server also offers resources, documents a client can attach to the context:

| Resource                         | What it has                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `webperf://schema`               | The contract every snippet result follows: base shape, statuses, how to read a result, the rules of the issue codes. |
| `webperf://schema/{snippet}`     | The fields one snippet returns, with an example, and the codes of its issues. |
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
| `budget-lcp`     | `auto`              | LCP budget in ms. `auto` is `2500` with `core-web-vitals` and no budget with the other workflows. An empty value disables the check. |
| `budget-fcp`     |                     | FCP budget in ms, for `loading`.                                                              |
| `budget-ttfb`    |                     | TTFB budget in ms, for `loading` or `audit`.                                                  |
| `budget-cls`     | `auto`              | CLS budget. `auto` is `0.1` with `core-web-vitals` and no budget with the other workflows. An empty value disables the check. |
| `budget-inp`     |                     | INP budget in ms, for `interaction` with a click or a key press.                             |
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
