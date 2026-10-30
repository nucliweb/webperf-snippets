# Changelog

All notable changes to the `webperf-snippets` CLI are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The CLI is versioned and published independently from the snippets collection, with `cli-v*` tags. See the [root changelog](../CHANGELOG.md) for the rest of the project.

---

## [Unreleased]

---

## [1.8.0] — 2026-10-30

The MCP server spends fewer tokens of the agent on large results: it answers them with summaries, gives the rest of a result of the same run with `get_details`, and says which call to make next with `nextSteps`. Small results come whole, as in 1.7. On a page with 60 product images, the agents of `npm run eval:mcp` diagnosed the page with 57 % fewer input tokens and 3 turns instead of 11. The snippets are those of the collection 2.4.2, the same as in 1.7.1, and the command line does not change.

### Changed
- `run_snippet`, `run_workflow` and `read_results` of the MCP server return a summary of each result when the results are large, around 2,000 tokens or more, and the whole objects when they are small; `detail` in the answer says which. A summary has the `status`, `metric`, `value`, `unit`, `rating`, `error` and `message` of a result, the `reason` of a follow-up, and its `issues` with `code`, `severity`, `message` and `target`, without the details, items and thresholds. On a page with 60 product images, an `audit` takes ~6,400 tokens instead of ~14,900. Small results stay whole because a summary made the agent spend a turn on `get_details` for what it left out, which costs more than it saves: with summaries always on, the agents of `npm run eval:mcp` used up to 44 % more tokens on the small fixture pages. `detail: "summary"` and `detail: "full"` choose one of the two whatever the size, and `full` is the shape of 1.7. Only an answer with summaries has a `runId`: with the whole objects, agents still called `get_details` for nothing. The `audit_lcp` and `debug_inp` prompts call `get_details` when they get a summary.

### Added
- `get_details` returns the whole object of one snippet of a run, by the `runId` that `run_snippet`, `run_workflow` and `read_results` return with summaries, with the values the summary came from: measuring again would give other ones. It takes the id of the result in the summary, the name of its script, an alias or `Category/Name`. The server keeps the last 20 runs of a connection, and an older or unknown `runId` answers with a tool error that says to run the tool again.
- `run_snippet` and `run_workflow` of the MCP server return `nextSteps`, the calls an agent makes next, each with its `tool`, its `args` and its `reason`, when the results call for them. After `run_snippet` they are the follow-ups of the decision tree of the workflows, such as `run_snippet` with LCP-Subparts, the same viewport and the same wait when LCP is over 2.5 s, or `open_page` for a follow-up that records interactions. After `run_workflow`, which already runs those follow-ups, it is the `open_page` call with the steps the workflow skipped because they measure clicks and key presses.

---

## [1.7.1] — 2026-10-29

The snippets are those of the collection 2.4.1.

### Fixed
- Content-Visibility warns with `missing-intrinsic-size` about an element with `content-visibility: auto` and no size, which Chrome reports as `auto none`: the warning never appeared in the CLI. A `--baseline` of 1.7.0 lists these warnings as new.
- Oversized-Images leaves out an SVG of the page served without the `.svg` extension, by the content type of its response, which it measured as a raster image and flagged as oversized. A `--baseline` of 1.7.0 lists its warnings as fixed.

---

## [1.7.0] — 2026-10-29

A security release: the URL of the command line takes only `http` and `https`, an invalid `--header` no longer prints its token, and the MCP server tells the agent that what a page returns is data. The snippets are those of the collection 2.4.0, whose selectors match only their element, listed under Changed: a `--baseline` of 1.6.0 sees the warnings `missing-intrinsic-size` of Content-Visibility, whose `target` is a selector, as fixed and new once.

### Security
- The URL of the command line must be `http` or `https`, as the MCP server and the matrix file require: `file:///etc/passwd` loaded the file and returned what the snippets read from it, and other protocols went to the browser as well. Any other protocol, or a text that is not a URL, exits with `2` before a browser opens; the message does not repeat the URL, which can carry a token. `localhost` and internal addresses are measured as before.
- An invalid `--header` is named by its position (`Invalid --header (number 2)`), not by its text, which may hold a token: `--header "Authorization Bearer <token>"`, without the colon, printed the token to stderr, and so to the log of a CI job. A test passes a value per secret (`--header`, `--storage-state`, `--api-key`, `--crux-key`) through every output of the CLI, the body of `--report-to` and its errors, and fails if one comes out.
- The MCP server tells the agent, in its instructions and in the description of `run_snippet`, `run_workflow`, `open_page`, `interact` and `read_results`, that everything a tool returns comes from the measured page (selectors, URLs, alt texts, the names of its resources): data to report, never an instruction to follow. A page can put instructions for agents in those values, and an agent with a terminal could follow them. `npm run eval:mcp` has a case with such a page, where the agent has Bash and Write and must report the issue of the page without creating the file or running the command the page asks for.

### Changed
- The snippets the CLI runs are those of the collection 2.4.0: every selector a snippet returns matches only its element, such as `div.c0:nth-of-type(2)` instead of `html > body > div.c0` and `#wide` instead of `ul#wide`; Oversized-Images names an image with no id or class by its path instead of `img`; and Image-Element-Audit returns a `selector` in each item and in `lcpCandidate`, which held a short URL. A `--baseline` of 1.6.0 pairs the warnings `missing-intrinsic-size` of Content-Visibility, whose `target` is a selector, as fixed and new.

---

## [1.6.0] — 2026-10-26

A budget never passes unchecked, which changes the exit code of a run whose budget was not measured, listed first under Changed. Budgets for FCP, TTFB and INP join those for LCP and CLS, every report lists them with their verdicts, and the reports read the details of a result with the labels and units of the extension.

### Added
- The reports list every budget with its value and verdict (`passed`, `exceeded` with by how much, or `not measured` with why): a Budgets section in the human and markdown reports, and `budgets` in the JSON output, in each combination of a matrix and in the body of `--report-to`. A matrix lists the failed budgets with their combination under its table. A pull request comment says which budget failed, which only stderr said before.
- `--budget-fcp`, `--budget-ttfb` and `--budget-inp`, next to `--budget-lcp` and `--budget-cls`: a budget for each metric the CLI measures. The interaction workflow measures INP, in a step `INP` that needs a click or a key press like `interactions` and `input-latency`. The GitHub Action takes `budget-fcp`, `budget-ttfb` and `budget-inp`.
- The markdown report folds the details of each result under its id, below the table of its section and inside the block of each combination of a matrix: one item per field with the labels and units of the extension (`- **Total blocking time**: 70 ms`), a nested list for a nested table, and no block for a result without details.

### Changed
- A budget never passes unchecked. One whose metric the run does not measure, such as `--budget-lcp` with `--workflow audit`, exits with `2` before the page loads, naming the workflow or snippet that measures it; one whose metric was not measured, such as INP without interactions or an LCP that failed, exits with `1`. A value that is not a number of 0 or more exits with `2`; it passed before. Each failed budget goes to stderr also with `--json`.
- The `budget-lcp` and `budget-cls` inputs of the GitHub Action default to `auto`: 2500 and 0.1 with the `core-web-vitals` workflow, and no budget with the others, which do not measure LCP or CLS. An empty value still disables the check.
- A tracking snippet with nothing recorded, such as INP without interactions, is reported as `not measured` with its message, and no longer counts as a failed snippet: the command exits with `0` for it. After a click or a key press the CLI reads it again while it is still tracking, as it did while it returned an error.
- The snippets the CLI runs are those of the collection 2.2.0: the recommendations of Cache-Strategy-Analysis carry no emoji and come in order of priority, and INP, Interactions and Input-Latency-Breakdown return `tracking` before any interaction.
- The human report reads the details of a result with the labels and units of the extension, from the shared view of `snippets/_view/`: `Total blocking time 36 ms` instead of `totalBlockingTimeMs 36`, the phases of LCP and the slowest one by their names (`Resource load delay`), and the rows of an audit as their cells, the file of a URL and each value in its unit, with the values that are the same in every row once above them.

### Fixed
- Critical-CSS-Detection leaves out the stylesheets without `href` or with `disabled`, which it counted as render-blocking with no name and 0 bytes.
- The markdown report gives a result with a count and no value, such as the long tasks, a row with its count and its first numbers, where it said `undefined`.

---

## [1.5.0] — 2026-10-25

### Changed
- The `webperf://schema` resource of the MCP server keeps the rules of the issue codes and leaves out the table of each snippet, which goes in `webperf://schema/{snippet}`. A snippet with issue codes and no section of its own has a resource with its table.
- `--baseline` pairs the errors of a snippet by their code and the resource they name (`target`), whatever their messages say; a resource of the page itself compares by its path and query, so a review app on another host matches production. A snippet without codes on one side, as in a baseline of 1.4.0, keeps pairing by message with the figures normalized. The errors in `baseline.errors` carry their `target`.
- The snippets the CLI runs give each issue a stable `code`, and a `target` when there is one issue per thing, as listed under Issue codes in `snippets/SCHEMA.md`. No message changes.

---

## [1.4.0] — 2026-10-24

### Added
- The JSON output of a page, and of each combination of a matrix, carries `conditions`: the viewport, the workflow (or the path of the snippet with `--snippet`), the wait and the version of the CLI. It is a new field, and the existing ones do not change.
- `--baseline <file>` compares a page with the `--json` output of an earlier run. LCP, FCP, TTFB, CLS and INP get a verdict against a threshold, the larger of a share of the baseline and a minimum, and, with two runs or more in the baseline, against its range, so a change within the noise of the lab does not count; the errors that decide the exit code are listed as new or fixed, paired by code or by their message with the figures normalized. A different workflow, viewport, wait, throttling, number of runs, version of the CLI, path or query warns on stderr, in the reports and in `warnings`. The human and markdown reports add the comparison, and the JSON output a `baseline` field. `--threshold` changes the threshold of a metric (`LCP=15%`, `LCP=200ms`, `CLS=0.1`). The comparison only informs, unless `--fail-on-regression`, which exits with `1` when a metric regressed or an error is new. An invalid baseline or threshold exits with `2` before the page loads. A matrix compares with an earlier matrix, combination by combination by `id`: the table adds a change column after each metric, the comparison lists the warnings, the new and fixed errors and the combinations only one side has, and the JSON output carries `baseline` in each combination and at its root.

### Fixed
- The snippets the CLI runs include two fixes of the collection, listed in the [root changelog](../CHANGELOG.md): CLS counts the shifts that the observer has not delivered when the page is hidden, and LCP-Subparts splits the LCP as web-vitals does, from the last request for the LCP resource that started before the render and with the end of the download capped at the LCP. Results of CLS and LCP-Subparts can differ from 1.3.0 on the same page.

---

## [1.3.0] — 2026-10-23

### Added
- `--runs <n>` measures the page n times, from 1 to 9, one after the other, and reports the median run, as WebPageTest does, with the median, min and max of each metric in `runs`. The median follows LCP, or the first of FCP, TTFB and the navigation time that the workflow measures, and `--median-by <metric>` picks another one. Budgets compare the median, and each run is reported on stderr.
- `--matrix <file>` measures every URL of a JSON file on every device and in every variant it lists, each combination `runs` times, and reports a table with the rated median of each combination, or `{ matrix, runs, combinations }` with `--json`. A device sets its viewport, CPU and network, a preset or a network of its own such as 5G; a variant sets its storage state, headers and own domains. The options of the command line apply to every combination, budgets compare the median of each one, and an invalid file exits with `2` before any page load. `--verbose` adds the report of each combination, `--markdown` folds it into a `<details>` block, CrUX is asked once for each URL and form factor, and `--report-to` posts one report for each combination, with its device, variant and runs.

---

## [1.2.0] — 2026-10-22

### Added
- `--header "Name: value"`, repeatable, sends request headers to the origin of the measured URL only, for pages behind an access proxy such as Cloudflare Access. Third parties never receive them, so their requests keep their CORS behavior and timings.
- `--cpu <factor>` and `--network <preset>` measure under CPU and network throttling, with the network presets of DevTools (`fast-4g`, `slow-4g`, `3g`). The reports name the conditions under their header, and the JSON output and the `--report-to` payload carry them in `throttling`.
- `--own-domains <list>`, comma-separated or repeated, counts the domains of the site that differ from the root domain of the page, such as its own CDN, as first party in the snippets that tell first from third parties. The CLI writes them in the `OWN_DOMAINS` constant of each snippet.

---

## [1.1.0] — 2026-10-21

### Added
- `webperf-snippets mcp` starts an MCP server over stdio, for AI agents, with a `list_snippets` tool that lists the snippets with their category, title, aliases and whether they track interactions. It answers clients of the 2026-07-28 revision of the protocol and of the earlier ones. The `@modelcontextprotocol/server` SDK is a new dependency, loaded only by this command.
- The `run_snippet` tool of the MCP server opens a URL, runs one snippet and returns its result object, with progress notifications. A page that does not load or an unknown snippet comes back as a tool error the agent can act on; a snippet that reports an error stays a result.
- The MCP server keeps pages open between calls for the tracking snippets: `open_page` installs them and returns a session id, `interact` clicks, types, hovers, scrolls or waits, `read_results` returns what they recorded and `close_page` closes the page. At most three pages are open, an unused page closes after 10 minutes, and a cancelled call or a client that disconnects closes its pages and Chromium.
- The `run_workflow` tool of the MCP server runs the workflows of the CLI with the follow-ups of their decision tree, and `get_crux` returns CrUX field data with the key read from `CRUX_API_KEY` in the environment of the server.
- The MCP server offers the result contract of the snippets (`webperf://schema`, and one section per snippet at `webperf://schema/{snippet}`) and the workflows of each category (`webperf://workflows/{category}`) as resources, and the prompts `audit_lcp`, `debug_inp` and `audit_page`, which chain the tools with the schema sections the answer needs.
- The MCP server is listed in the MCP Registry as `io.github.nucliweb/webperf-snippets` (`server.json`, and `mcpName` in `package.json`). The package is published with npm provenance.

### Changed
- With `--crux-key`, the CrUX object of the JSON report has `failed: true` when the API answers with an error or does not answer, next to `unavailable`. A page with no field data keeps only `unavailable`.
- The examples of `--help` and of the README run the CLI on `https://example.com`, a domain reserved for documentation, instead of a real site.
- The snippets the CLI runs include changes since 1.0.0 that alter their results:
  - `LCP-Subparts` splits the Resource Load Time into `waiting` (until the first byte of the response) and `download`, in `details.subParts.resourceLoadTime`, when Resource Timing exposes them. The human report shows the split under the row.
  - `INP`, `Interactions` and `Input-Latency-Breakdown` measure the phases over the whole interaction, not over one of its events: a slow click handler comes out as `click` with the processing as the bottleneck, not as `pointerup` with 0 ms of processing. `Interactions` and `Input-Latency-Breakdown` return `unsupported` in browsers without Event Timing.
  - `Script-Loading` lists a `nomodule` script with the strategy `nomodule`, never as blocking.
  - `Inline-Script-Info-and-Size` tells framework data payloads from scripts, with `isDataPayload` and `details.dataPayloadCount`, and counts analytics only from a call or definition.
  - `LCP-Image-Entropy` divides by the displayed area of the image, capped at its natural area, as Chrome does, with `displayedWidth` and `displayedHeight`.

### Fixed
- Without Chromium, which npx does not download, `run_snippet`, `run_workflow`, `open_page` and the CLI say how to install it: `npx playwright install chromium`. The CLI prints it without a stack and exits with `1`. After the install, `open_page` works without restarting the MCP server.
- After an interaction script with a click or a key press, the tracking snippets (INP, Interactions, Input-Latency-Breakdown) report the interactions on a loaded machine too. The browser can deliver their timing later than the frames the runner waited for, and the result was "No interactions recorded yet". The runner reads a snippet that has no data yet again, every 100 ms, for up to 2 seconds.

---

## [1.0.0] — 2026-10-15

### Changed
- The command line options, the workflows, the exit codes and the shape of the JSON report are stable: a change that breaks them comes in a new major version. The results of each snippet follow the contract of `snippets/SCHEMA.md`.

---

## [0.5.0] — 2026-10-15

### Changed
- The snippets the CLI runs include changes since 0.4.1 that alter their results:
  - `TTFB-Sub-Parts` returns a warning issue when the TTFB needs improvement and an error issue when it is poor, naming the slowest phase. The `audit` workflow runs it as a step, so a poor TTFB makes `--workflow audit` exit with code `1`.
  - `CSS-Media-Queries-Analysis` returns one item per distinct query, largest first and at most 50, with the totals in `details` and an issue for the bytes that narrower screens download without using them. The device estimates and `details.performanceImpact` are removed.
  - `Webfont-Usage-Analyzer` attributes each `@font-face` rule to its own file. Items are one row per face and file, the faces nothing needed are in `details.neverLoaded`, and a face whose file downloaded twice raises a warning.
  - `LCP-Video-Candidate` returns no LCP value when the LCP is not a video, only the tag and URL of the LCP element and an info issue. It tells the first frame of a video (`details.videoUrl`) from its poster, and warns when the LCP rendered more than 10 s after the load.
  - `LCP`, `LCP-Subparts` and `LCP-Trail` give the LCP element a selector that matches only that element.
  - `LCP-Image-Entropy` gives the tag of the LCP element in `details.lcpElement`, and an info issue that says why when the LCP is not an image whose entropy it can compute.
  - `SVG-Embedded-Bitmap-Analysis` returns an info issue when five or more inline SVGs could share a sprite, and `Video-Element-Audit` and `Prefetch-Resource-Validation` return one when the page has nothing to check.
  - The requests the snippets make to read files of the page carry the fragment `#webperf-snippets`, and the snippets that read Resource Timing leave them out, so a snippet that runs after another no longer counts those requests as the page's.
- The package homepage is https://webperf-snippets.net.

---

## [0.4.1] — 2026-10-04

### Fixed
- `INP` returns its value with `--interact-script`. It used to stop at `tracking`, because its value only comes out of `getINP()`, which the CLI did not call; it is now read after the interactions like the Interaction snippets, and the CrUX comparison shows the synthetic INP next to the field value.
- A script that ends on a click no longer loses that click. The CLI waits for the browser to report the timing of the last interaction (two frames and a task, a few milliseconds, with a limit of one second) before it reads the snippets. Before, `Interactions` and `Input-Latency-Breakdown` recorded nothing and reported an error, and `INP` and the other snippets read the page too early.

---

## [0.4.0] — 2026-10-04

### Added
- Decision-tree follow-ups for Core Web Vitals: an image LCP adds `LCP-Image-Entropy` and `Image-Element-Audit`, a video poster LCP adds `LCP-Video-Candidate` and `Video-Element-Audit`, LCP over 4 s adds `LCP-Trail`, CLS over 0.1 adds `Layout-Shift-Loading-and-Interaction`, and CLS over 0.25 adds the lazy images, fonts, critical CSS and image checks. A follow-up that is a tracking snippet is read through its data function.
- `interaction` workflow (`--workflow interaction`): `long-tasks`, `long-frames`, `scroll`, `layout-shifts`, `forced-layout`, `interactions` and `input-latency`. It runs the steps of `--interact-script`, or a scroll of its own when there is none. `interactions` and `input-latency` are `skipped`, with the reason and without failing the run, when the interactions have no click or type step.
- `skipped` result status, shown in the human, markdown and JSON reports. It does not count toward the exit code.
- The human report summarizes a result with a count and details but no issues (long tasks, long animation frames) and names the items that use `kind`, `target` and `detail`, which printed `undefined` and empty lines.
- With `--interact-script`, the snippets of the Interaction category are installed before the interactions and read through their data function afterwards. A run such as `--snippet Interaction/Interactions --interact-script interactions.json` returns `ok` with the interactions it caused, where it used to stop at `tracking`.
- `loading` workflow runs 5 more snippets, 11 in total: `script-timings`, `ttfb-resources`, `js-execution`, `third-party-impact` and `cache-strategy`. `cache-strategy` makes HEAD requests of its own, so it runs last.
- `audit` workflow runs 11 more snippets, 22 in total: `compression`, `inline-scripts`, `inline-css`, `webfonts`, `content-visibility`, `prefetch`, `video`, `dom-size`, `oversized-images`, `image-audit` and `svg-bitmaps`. Their `error` issues now count toward the exit code (an inline script that blocks the parser in the head, a prefetch of a file the page already uses, a font that fails to load, an excessive DOM). The steps that make their own requests run last.
- `--snippet` accepts the name of any snippet (`--snippet Compression-Audit`), in any case, besides the short aliases and `Category/Name` paths. An unknown name exits with code `2` and lists the closest snippets.

### Changed
- The snippets the CLI runs include changes since 0.3.0 that alter their results:
  - `First-And-Third-Party-Script-Timings` returns `null` for the DNS, connection, request and response phases of a cross-origin script without `Timing-Allow-Origin`, instead of numbers computed against zero (a response time larger than the total).
  - `First-And-Third-Party-Script-Info`, `First-And-Third-Party-Script-Timings`, `Script-Loading`, `TTFB-Resources`, `Cache-Strategy-Analysis` and `Fonts-Preloaded-Loaded-and-used-above-the-fold` count the domains listed in `OWN_DOMAINS`, declared at the top of the snippet, as first party. Without it, a site's own CDN on another root domain is third party.
  - `Resource-Hints-Validation` lists each unused hint in `items`, and a preload for a viewport that does not match is no longer counted as unused.
  - `Image-Element-Audit` audits the image the browser reports as the LCP element, and none when the LCP is text, a CSS background or a video, instead of the largest image in the viewport.
  - `Cache-Strategy-Analysis` reports uncompressed text and duplicates that need no headers, and how much of the page it could analyze; `Third-Party-Impact-by-Domain` notes the long animation frames that no third-party script accounts for.
- A follow-up runs once: a snippet two rules ask for, or that the workflow already ran, is not repeated. Before, the render-blocking check ran twice in the `loading` workflow when FCP was over 1.8 s.
- The `error` issues of a follow-up show in the report and no longer change the exit code, so the default `core-web-vitals` workflow keeps failing only on budgets. A follow-up that itself fails (`status: "error"`) still counts.

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

[Unreleased]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.8.0...HEAD
[1.8.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.7.1...cli-v1.8.0
[1.7.1]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.7.0...cli-v1.7.1
[1.7.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.6.0...cli-v1.7.0
[1.6.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.5.0...cli-v1.6.0
[1.5.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.4.0...cli-v1.5.0
[1.4.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.3.0...cli-v1.4.0
[1.3.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.2.0...cli-v1.3.0
[1.2.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.1.0...cli-v1.2.0
[1.1.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v1.0.0...cli-v1.1.0
[1.0.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.5.0...cli-v1.0.0
[0.5.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.4.1...cli-v0.5.0
[0.4.1]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.4.0...cli-v0.4.1
[0.4.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.3.0...cli-v0.4.0
[0.3.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.2.0...cli-v0.3.0
[0.2.0]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.1.1...cli-v0.2.0
[0.1.1]: https://github.com/nucliweb/webperf-snippets/compare/cli-v0.1.0...cli-v0.1.1
[0.1.0]: https://github.com/nucliweb/webperf-snippets/releases/tag/cli-v0.1.0
