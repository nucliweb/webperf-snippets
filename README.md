# WebPerf Snippets

A curated collection of JavaScript snippets to measure and debug Web Performance directly in your browser's DevTools console.

[![Star History](https://img.shields.io/github/stars/nucliweb/webperf-snippets?style=social)](https://star-history.com/#nucliweb/webperf-snippets&Date)

![WebPerf Snippets](https://github.com/nucliweb/webperf-snippets/assets/1307927/f47f3049-34f5-407c-896a-d26a30ddf344)

## What you can measure

| Category | What it includes |
|----------|------------------|
| **Core Web Vitals** | LCP, CLS, INP - the metrics that impact SEO and user experience |
| **Loading** | TTFB, resource hints, scripts, fonts, images, render-blocking resources |
| **Interaction** | Long Animation Frames, event timing, responsiveness |

## How to use

### Option 1: Run in browser console

1. Copy any snippet from [webperf-snippets.nucliweb.net](https://webperf-snippets.nucliweb.net)
2. Open DevTools (`F12` or `Cmd+Option+I` / `Ctrl+Shift+I`)
3. Go to the **Console** tab
4. Paste and press `Enter`

### Option 2: Save as DevTools Snippet

Save frequently used snippets for quick access:

1. Open DevTools → **Sources** tab → **Snippets** panel
2. Click **+ New snippet**
3. Name it (e.g., "LCP")
4. Paste the code
5. Right-click → **Run** (or `Cmd+Enter` / `Ctrl+Enter`)

### Video tutorial

https://github.com/nucliweb/webperf-snippets/assets/1307927/2987a2ca-3eef-4b73-8f6b-7b1e06b50040

## Agent Skills for AI Coding Assistants

WebPerf Snippets can be used as [Agent Skills](https://agentskills.io/) with AI coding assistants like Claude Code, Cursor, OpenCode, Gemini CLI, and more for automated performance analysis.

### Installation

**Option 1: Using skills CLI (recommended)**

```bash
npx skills add nucliweb/webperf-snippets
```

Installs directly from GitHub repository to `~/.claude/skills/`.

**Option 2: Install locally (project-specific)**

```bash
git clone https://github.com/nucliweb/webperf-snippets.git
cd webperf-snippets
npm run install-skills
```

This installs skills to `.claude/skills/` in your project directory.

**Option 3: Install globally (for contributors)**

```bash
git clone https://github.com/nucliweb/webperf-snippets.git
cd webperf-snippets
npm run install-global
```

This installs skills to `~/.claude/skills/` for use across any project.

### Available Skills

| Skill | Snippets | Description |
|-------|----------|-------------|
| `webperf` | 47 | Main entry point for all web performance analysis |
| `webperf-core-web-vitals` | 7 | LCP, CLS, INP measurements with detailed breakdowns |
| `webperf-loading` | 28 | TTFB, FCP, script/font analysis, resource hints, service workers |
| `webperf-interaction` | 8 | Long tasks, animation frames, scroll jank, INP debugging |
| `webperf-media` | 3 | Image/video audits, lazy loading validation, SVG analysis |
| `webperf-resources` | 1 | Network bandwidth, connection quality, adaptive loading |

### Intelligent Workflows & Decision Trees

Skills include built-in workflows and decision trees that enable autonomous performance analysis:

**Workflows** - Predefined sequences for common scenarios:
- Complete loading audit (6 snippets)
- Server performance investigation (4 snippets)
- Font loading optimization (3 snippets)
- Script performance deep dive (6 snippets)
- And more...

**Decision Trees** - Conditional logic based on results:
- If TTFB > 600ms → automatically run TTFB-Sub-Parts.js
- If FCP > 1.8s → run render-blocking resource analysis
- If many third-party scripts detected → analyze timing and impact
- And 15+ more intelligent triggers

Example interaction:

```
User: "Analyze loading performance"

Agent:
1. Runs TTFB.js → detects 750ms (slow)
2. Follows decision tree → runs TTFB-Sub-Parts.js
3. Identifies DNS + server time issues
4. Runs Service-Worker-Analysis.js
5. Provides consolidated report with specific fixes
```

### Usage

Skills activate automatically when matched:

```
Audit this page for Core Web Vitals
Analyze loading performance
Check for image optimization issues
Debug slow LCP
Why is my TTFB so high?
```

Skills are compatible with [Chrome DevTools MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/chrome-devtools) for automated browser-based performance auditing.

**Supported agents**: Claude Code, Cursor, OpenCode, Gemini CLI, VS Code extensions, and [many more](https://agentskills.io/).

## Documentation

Visit **[webperf-snippets.nucliweb.net](https://webperf-snippets.nucliweb.net)** for the full documentation with all snippets.

## Resources

- [Web Vitals](https://web.dev/articles/vitals) - Learn about Core Web Vitals
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/) - Official documentation

