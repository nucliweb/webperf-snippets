# WebPerf Snippets

Tested JavaScript snippets that measure and debug web performance. Your AI agent runs them for you, or you run them yourself in DevTools: the same code every time.

[![CI](https://github.com/nucliweb/webperf-snippets/actions/workflows/ci.yml/badge.svg)](https://github.com/nucliweb/webperf-snippets/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/nucliweb/webperf-snippets)](https://github.com/nucliweb/webperf-snippets/releases)
[![Snippets](https://img.shields.io/badge/snippets-56-0f766e)](https://webperf-snippets.net)
[![License](https://img.shields.io/github/license/nucliweb/webperf-snippets)](./LICENSE)
[![Star History](https://img.shields.io/github/stars/nucliweb/webperf-snippets?style=social)](https://star-history.com/#nucliweb/webperf-snippets&Date)

![WebPerf Snippets](https://github.com/nucliweb/webperf-snippets/assets/1307927/f47f3049-34f5-407c-896a-d26a30ddf344)

AI agents are good at interpreting performance data and unreliable when they write measurement code on the fly. WebPerf Snippets keeps both apart: the measurement is fixed code, tested in CI, that returns structured data, and the agent reasons about the result. The same snippets run in the console, the CLI, the DevTools extension and the Agent Skills, and every one returns an object that follows a single contract ([`snippets/SCHEMA.md`](./snippets/SCHEMA.md)).

→ [Why AI audits need deterministic scripts](https://joanleon.dev/en/ai-web-performance-audits-scripts-reports/)

## Run them with an AI agent

| You want to                                           | Use                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| Audit a URL with any agent that has a terminal        | The [Copy prompt](#copy-prompt) button on each snippet page      |
| Let the agent drive your Chrome (login, interactions) | The [Agent Skills](#agent-skills) with Chrome DevTools MCP       |
| Run snippets from scripts or CI                       | The [CLI](#cli)                                                  |
| Give an agent the whole documentation                 | [`llms.txt`](https://webperf-snippets.net/llms.txt) ([details](#documentation-for-agents)) |

Not sure which snippet to run? Start from the symptom in [Which snippet should I use?](https://webperf-snippets.net/which-snippet)

### Copy prompt

Snippet pages have a **Copy prompt** button above the code. It copies a prompt that asks any AI agent with a terminal to run that snippet with the [CLI](#cli) on the URL you give it, and to report the value, the cause and the issues. The agent runs the published snippet instead of rewriting it or estimating the result.

### Agent skills

The snippets are packaged as [Agent Skills](https://agentskills.io/) for Claude Code, Cursor, OpenCode, Gemini CLI, VS Code extensions and [other compatible agents](https://agentskills.io/). With [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), the agent runs the snippets in your browser and reads the object they return.

```bash
npx skills add nucliweb/webperf-snippets
```

This installs the skills from the GitHub repository into `~/.claude/skills/`. To install them from a clone instead:

```bash
git clone https://github.com/nucliweb/webperf-snippets.git
cd webperf-snippets
npm run install-skills   # into .claude/skills/ of the current project
npm run install-global   # into ~/.claude/skills/, for every project
```

| Skill                     | Snippets | What it covers                                                   |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| `webperf`                 | 56       | Main entry point for all web performance analysis                |
| `webperf-core-web-vitals` | 7        | LCP, CLS, INP measurements with detailed breakdowns              |
| `webperf-loading`         | 34       | TTFB, FCP, script and font analysis, resource hints, service workers |
| `webperf-interaction`     | 10       | Long tasks, animation frames, scroll jank, INP debugging         |
| `webperf-media`           | 4        | Image and video audits, lazy loading validation, SVG analysis    |
| `webperf-resources`       | 1        | Network bandwidth, connection quality, adaptive loading          |

The skills include workflows (predefined sequences, such as a complete loading audit or a font loading investigation) and decision trees that pick the next snippet from the result of the previous one: when TTFB is above 600 ms, the agent runs TTFB-Sub-Parts to find whether the time goes to DNS, the connection or the server.

```
User: "Analyze loading performance"

Agent:
1. Runs TTFB.js → 1.9 s (poor)
2. Follows the decision tree → runs TTFB-Sub-Parts.js
3. Finds that the server response takes most of the time
4. Runs Service-Worker-Analysis.js
5. Reports the findings with specific fixes
```

Skills activate when the request matches them:

```
Audit this page for Core Web Vitals
Debug slow LCP
Why is my TTFB so high?
Check for image optimization issues
```

See [SKILLS.md](./SKILLS.md) for every skill, its workflows and its triggers.

→ [Read more about WebPerf Agent Skills](https://joanleon.dev/en/webperf-snippets-agent-skills/)

### CLI

The CLI runs the same snippets headlessly with Playwright. It diagnoses LCP regressions in CI, gates pull requests on performance budgets and automates the audits you run by hand. The `--json` output is what an agent or a script reads.

```bash
npx webperf-snippets https://example.com --json
npx webperf-snippets https://example.com --snippet LCP-Subparts
npx webperf-snippets https://example.com --workflow audit
npx webperf-snippets https://example.com --budget-lcp 2500 --budget-cls 0.1
```

The `core-web-vitals`, `audit`, `loading` and `interaction` workflows chain several snippets in one run. A composite GitHub Action (`nucliweb/webperf-snippets/.github/actions/webperf-snippets`) wraps the CLI for CI, with budgets and a Markdown output ready to post as a pull request comment.

The CLI is published to npm as [`webperf-snippets`](https://www.npmjs.com/package/webperf-snippets). See the [CLI documentation](https://webperf-snippets.net/CLI) and [`cli/README.md`](./cli/README.md) for installation, usage and CI integration.

## Run them in your browser

Every snippet also runs by hand in the DevTools console, with the same code the agents use. All snippets are tested in Google Chrome; most also work in other Chromium-based browsers and in Firefox, and Safari has limited Performance API support. Each snippet page shows the browser support of the APIs it needs.

### Run in the console

1. Copy any snippet from [webperf-snippets.net](https://webperf-snippets.net)
2. Open DevTools (`F12` or `Cmd+Option+I` / `Ctrl+Shift+I`)
3. Go to the **Console** tab
4. Paste and press `Enter`

### Save as a DevTools snippet

1. Open DevTools → **Sources** tab → **Snippets** panel
2. Click **+ New snippet**
3. Name it (e.g., "LCP")
4. Paste the code
5. Right-click → **Run** (or `Cmd+Enter` / `Ctrl+Enter`)

### DevTools extension (beta)

A DevTools panel runs the snippets on the inspected page without pasting them, shows their results, and audits the page with the checks of the CLI. It installs from a zip while it is in beta.

→ [DevTools extension](https://webperf-snippets.net/extension)

### Video tutorial

https://github.com/nucliweb/webperf-snippets/assets/1307927/2987a2ca-3eef-4b73-8f6b-7b1e06b50040

## What you can measure

| Category                                                                 | Snippets | What it includes                                                                        |
| ------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------- |
| [Core Web Vitals](https://webperf-snippets.net/CoreWebVitals/LCP)        | 7        | LCP, CLS and INP, with LCP sub-parts, trail, image entropy and video candidate          |
| [Loading](https://webperf-snippets.net/Loading/TTFB)                     | 34       | TTFB, FCP, render-blocking resources, resource and priority hints, scripts, fonts, CSS, caching, compression, back/forward cache |
| [Interaction](https://webperf-snippets.net/Interaction/Long-Animation-Frames) | 10  | Long animation frames with script attribution, interactions, input latency, long tasks, layout shifts, forced layout, scroll performance, DOM size |
| [Media](https://webperf-snippets.net/Media/Image-Element-Audit)          | 4        | Image and video element audits, oversized images, SVG with embedded bitmaps                               |
| [Resources](https://webperf-snippets.net/Resources/Network-Bandwidth-Connection-Quality) | 1 | Network bandwidth and connection quality                                       |
| [DevTools Overrides](https://webperf-snippets.net/DevTools-Overrides)    | 2        | Fetch and XHR timeline, injected with a local override before the page scripts                           |

## Documentation for agents

- [`llms.txt`](https://webperf-snippets.net/llms.txt): an index of every page, with a short description of each snippet.
- [`llms-full.txt`](https://webperf-snippets.net/llms-full.txt): the documentation and the code of every snippet in one file.
- Every page has a Markdown version at the same URL with `.md` (for example, [`/CoreWebVitals/LCP.md`](https://webperf-snippets.net/CoreWebVitals/LCP.md)).

## Contributing

Contributions are welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) explains how to add or change a snippet, its tests and its documentation page.

## Resources

- [Web Vitals](https://web.dev/articles/vitals): learn about Core Web Vitals
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/): official documentation

## Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=nucliweb/webperf-snippets&type=date&theme=dark&legend=top-left" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=nucliweb/webperf-snippets&type=date&legend=top-left" />
  <img alt="Star History Chart" src="https://api.star-history.com/image?repos=nucliweb/webperf-snippets&type=date&legend=top-left" />
</picture>
