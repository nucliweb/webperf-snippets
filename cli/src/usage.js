// The text of --help, and of the usage error of a command without a URL
export const USAGE = `webperf-snippets <url> [options]
webperf-snippets --matrix <file> [options]
webperf-snippets mcp

Run curated WebPerf Snippets headlessly via Playwright.

Commands:
  mcp                   Start the MCP server over stdio, for AI agents
                        (claude mcp add webperf -- npx -y webperf-snippets mcp)

Options:
  --workflow <name>     Workflow to run (default: core-web-vitals)
                        Workflows: core-web-vitals, audit, loading, interaction
  --snippet <name>      Run a single snippet by name, alias or Category/Name path
                        Any of the 57 snippets, such as Compression-Audit
                        Aliases: LCP, CLS, INP, LCP-Subparts, fonts,
                                 render-blocking, resource-hints, preload-scripts,
                                 priority-hints, critical-css, ttfb,
                                 script-parties, script-loading,
                                 lazy-atf, lazy-conflict, eager-below-fold
  --json                Output JSON instead of formatted text
  --markdown            Output GitHub-renderable markdown (for PR comments)
  --viewport <preset>   Viewport preset: mobile (default), tablet, desktop
  --wait <ms>           Post-load wait before evaluating (default: 3000)
  --cpu <factor>        Slow the CPU down by this factor, such as 4 (no throttling by default)
  --network <preset>    Throttle the network as DevTools does: fast-4g, slow-4g, 3g
  --budget-lcp <ms>     Exit 1 if LCP exceeds this value, or was not measured
  --budget-fcp <ms>     Exit 1 if FCP exceeds this value, or was not measured
  --budget-ttfb <ms>    Exit 1 if TTFB exceeds this value, or was not measured
  --budget-cls <score>  Exit 1 if CLS exceeds this value, or was not measured
  --budget-inp <ms>     Exit 1 if INP exceeds this value, or was not measured (interaction workflow)
  --interact-script <path>  JSON file with interactions to run after the load; the
                            Interaction snippets are installed first and read last
                            Actions: scroll, click, hover, type, wait
  --storage-state <path>    Playwright storage state (cookies + localStorage) to
                            measure pages that require authentication
  --header "Name: value"    Request header for the origin of the URL only, such as
                            the token of an access proxy. Repeat it for more headers
  --own-domains <list>      Domains of the site to count as first party, such as its
                            own CDN, comma-separated or repeated
  --runs <n>                Measure the page n times (1 to 9), one after the other, and
                            report the median run
  --matrix <file>           Measure every URL of a JSON file on every device and in every
                            variant it lists, and report a table of the medians
  --median-by <metric>      Metric that picks the median run: LCP, FCP, TTFB, CLS, INP,
                            navMs (default: the first of LCP, FCP, TTFB, INP, navMs
                            measured)
  --baseline <file|url>     Compare the page, or each combination of a matrix, with the --json
                            output of an earlier run, or the page with another URL measured in
                            this run, their runs alternating (a live baseline): which metrics got
                            worse or better beyond the noise, and which errors are new or fixed.
                            It only informs, unless --fail-on-regression
  --threshold <metric>=<v>  The threshold of a metric for --baseline, such as LCP=15%,
                            LCP=200ms or CLS=0.1. Repeat it for more metrics
  --fail-on-regression      Exit 1 when a metric regressed or an error is new against --baseline
  --fail-on-inconclusive    Exit 1 when a metric is inconclusive for the worse against --baseline:
                            over its threshold, without the evidence of the runs
  --max-runs <n>            With a live baseline and --runs 5 or more: when a metric is
                            inconclusive for the worse, measure both pages up to n runs each (at
                            most 9) and compare once more
  --fail-on <level>         The issues of the snippets that exit 1: error (default), warning
                            (errors and warnings) or never. Budgets, --fail-on-regression
                            and runs that fail keep exiting 1
  --crux-key <key>          Add CrUX field data (p75) next to the measured values.
  --crux-history <weeks>    Add the trend of the field data over the last 1 to 40 weeks (needs a CrUX key).
                            Also read from the CRUX_API_KEY environment variable
  --report-to <url>         POST the results to this https URL after the run
                            (without it the CLI makes no external calls)
  --api-key <key>           Sent as "Authorization: Bearer <key>" with --report-to.
                            Prefer the PERF_REVIEWS_API_KEY environment variable
  --verbose             Show all items, even for passing checks
  --headed              Show the browser window (debug)
  -h, --help            Show this help
  -v, --version         Show the version

Examples:
  npx webperf-snippets https://example.com
  npx webperf-snippets https://example.com --workflow audit
  npx webperf-snippets https://example.com --json
  npx webperf-snippets https://example.com --snippet LCP-Subparts
  npx webperf-snippets https://example.com --snippet render-blocking
  npx webperf-snippets https://example.com --snippet fonts
  npx webperf-snippets https://example.com --snippet Compression-Audit
  npx webperf-snippets https://example.com --budget-lcp 2500
  npx webperf-snippets https://example.com --cpu 4 --network slow-4g
  npx webperf-snippets https://example.com --workflow loading --own-domains cdn.example.net
  npx webperf-snippets https://example.com --runs 5 --budget-lcp 2500
  npx webperf-snippets --matrix matrix.json --runs 3 --budget-lcp 2500
  npx webperf-snippets https://example.com --runs 5 --json > baseline.json
  npx webperf-snippets https://pr-123.example.com --runs 5 --baseline baseline.json --fail-on-regression
  npx webperf-snippets https://pr-123.example.com --runs 5 --max-runs 7 --baseline https://example.com --fail-on-regression
  npx webperf-snippets --matrix matrix.json --baseline last-week.json
  npx webperf-snippets https://example.com --snippet INP --interact-script interactions.json
  npx webperf-snippets https://example.com/dashboard --storage-state auth.json
  npx webperf-snippets https://review.example.com --header "CF-Access-Client-Id: $CF_ID" --header "CF-Access-Client-Secret: $CF_SECRET"
`;
