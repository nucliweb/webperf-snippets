# WebPerf Skills for AI Coding Agents

A collection of [Agent Skills](https://agentskills.io/) for measuring and debugging web performance using Chrome DevTools.

**Compatible with multiple AI coding agents** including Claude Code, Cursor, OpenCode, VS Code extensions, and more. Also compatible with Chrome DevTools MCP for automated browser-based performance auditing.

## Why WebPerf Skills?

These skills transform 47 battle-tested JavaScript snippets into agent capabilities for any skills-compatible AI coding assistant:

- **Browser Console Integration**: Run performance measurements directly in Chrome DevTools
- **Real-time Analysis**: Measure actual user experience on live pages
- **Core Web Vitals**: Track LCP, CLS, INP with detailed breakdowns
- **Resource Optimization**: Analyze scripts, fonts, images, and network performance
- **Interaction Debugging**: Detect long tasks, animation frames, and scroll jank
- **Intelligent Workflows**: Predefined sequences for common performance scenarios
- **Decision Trees**: Autonomous follow-up analysis based on measurement results

## Available Skills

| Skill                                                   | Snippets   | Use when                                                     |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| **[webperf](#webperf)**                                 | Meta-skill | "Audit performance", "check web vitals", "analyze this page" |
| **[webperf-core-web-vitals](#webperf-core-web-vitals)** | 7          | "Debug LCP", "check CLS", "measure INP"                      |
| **[webperf-loading](#webperf-loading)**                 | 27         | "Analyze TTFB", "check render-blocking", "audit scripts"     |
| **[webperf-interaction](#webperf-interaction)**         | 8          | "Debug jank", "long tasks", "animation frames"               |
| **[webperf-media](#webperf-media)**                     | 3          | "Audit images", "optimize video", "lazy loading"             |
| **[webperf-resources](#webperf-resources)**             | 1          | "Check bandwidth", "network quality"                         |

## Installation

### Option 1: Using skills CLI (Recommended)

```bash
npx skills add nucliweb/webperf-snippets
```

Installs directly from GitHub repository to `~/.claude/skills/`. This is the easiest method for end users.

### Option 2: Local Installation (Project-specific)

Install skills to `.claude/skills/` in your project:

```bash
git clone https://github.com/nucliweb/webperf-snippets.git
cd webperf-snippets
npm run install-skills
```

Skills will be registered in `.claude/settings.json` and available only in this project.

### Option 3: Global Installation (For Contributors)

Install skills to `~/.claude/skills/` for development:

```bash
git clone https://github.com/nucliweb/webperf-snippets.git
cd webperf-snippets
npm run install-global
```

After installation, register skills in your project's `.claude/settings.json`:

```json
{
  "skills": [
    { "path": "~/.claude/skills/webperf" },
    { "path": "~/.claude/skills/webperf-core-web-vitals" },
    { "path": "~/.claude/skills/webperf-loading" },
    { "path": "~/.claude/skills/webperf-interaction" },
    { "path": "~/.claude/skills/webperf-media" },
    { "path": "~/.claude/skills/webperf-resources" }
  ]
}
```

## Usage

Skills activate automatically when matched. Examples:

```
Audit this page for Core Web Vitals
```

```
Check loading performance and TTFB
```

```
Analyze images for optimization opportunities
```

```
Debug layout shifts and measure CLS
```

## Skill Details

### webperf

The main entry point that helps identify the right skill for your performance question.

**Trigger phrases:** "audit performance", "check web vitals", "analyze this page", "debug performance"

**What it does:**

- Routes to the appropriate specialized skill
- Provides overview of all 46 available snippets
- Suggests which skill to use based on your question

### webperf-core-web-vitals

Measure and debug the three Core Web Vitals that impact Google Search ranking.

**Trigger phrases:** "Core Web Vitals", "LCP", "CLS", "INP", "slow loading", "layout shifts"

**Snippets (7):**

- Largest Contentful Paint (LCP) with sub-parts breakdown
- Cumulative Layout Shift (CLS) tracking
- Interaction to Next Paint (INP) measurement
- LCP Trail (visual candidate tracking)
- LCP Image Entropy analysis
- LCP Video Candidate detection

**Thresholds:**

- **LCP**: Good ≤ 2.5s | Needs Improvement ≤ 4.0s | Poor > 4.0s
- **CLS**: Good ≤ 0.1 | Needs Improvement ≤ 0.25 | Poor > 0.25
- **INP**: Good ≤ 200ms | Needs Improvement ≤ 500ms | Poor > 500ms

### webperf-loading

Comprehensive loading performance analysis and optimization with built-in workflows and decision trees.

**Trigger phrases:** "TTFB", "FCP", "render-blocking", "script loading", "font loading", "resource hints"

**Snippets (28):**

- TTFB (Time to First Byte) with sub-parts
- FCP (First Contentful Paint)
- Render-blocking resources detection
- Script loading patterns and timings
- Font preloading and usage analysis
- Resource hints validation (preload, prefetch, preconnect)
- Service Worker analysis
- Critical CSS detection
- Inline script/CSS analysis
- Back/Forward Cache compatibility
- Priority hints audit
- Client-side redirect detection

**Intelligent Features:**

**8 Common Workflows:**
- Complete loading performance audit (6 snippets)
- Server/backend performance investigation (4 snippets)
- Font loading optimization (3 snippets)
- Script performance deep dive (6 snippets)
- Resource hints & priority optimization (5 snippets)
- CSS optimization workflow (4 snippets)
- Image loading audit (4 snippets)
- SSR/framework performance (4 snippets)

**16 Decision Trees:**
- Automatic follow-up snippets based on thresholds
- Example: If TTFB > 600ms → runs TTFB-Sub-Parts.js
- Example: If FCP > 1.8s → runs render-blocking analysis + critical CSS detection
- Example: If many third-party scripts → analyzes timing and execution impact

This enables autonomous, multi-snippet performance audits that progressively diagnose issues.

### webperf-interaction

Measure and debug user interaction responsiveness.

**Trigger phrases:** "jank", "long tasks", "animation frames", "scroll performance", "interaction latency"

**Snippets (8):**

- Long Animation Frames (LoAF) detection
- Long Animation Frames with script attribution
- Long Tasks tracking
- Interaction latency breakdown
- Scroll performance analysis
- Layout shifts during interaction
- Event processing time

### webperf-media

Audit images and videos for performance optimization.

**Trigger phrases:** "image audit", "lazy loading", "image optimization", "video performance", "SVG analysis"

**Snippets (3):**

- Image element audit (format, lazy loading, sizing)
- Video element audit (poster, preload, formats)
- SVG embedded bitmap analysis

### webperf-resources

Analyze network and connection quality.

**Trigger phrases:** "bandwidth", "network quality", "connection type", "save-data mode"

**Snippets (1):**

- Network bandwidth and connection quality detection

## Chrome DevTools MCP Workflow

These skills are designed to work with the Chrome DevTools Model Context Protocol:

1. **Navigate**: `mcp__chrome-devtools__navigate_page` → go to target URL
2. **Execute**: `mcp__chrome-devtools__evaluate_script` → run snippet code
3. **Capture**: `mcp__chrome-devtools__get_console_message` → read results
4. **Interpret**: Use thresholds from SKILL.md to analyze results
5. **Recommend**: Provide actionable optimization suggestions

## Development

### Generating Skills

Skills are auto-generated from the `snippets/` directory:

```bash
npm run generate-skills
```

This creates:

- `skills/{category}/SKILL.md` - Skill documentation with injected workflows
- `skills/{category}/scripts/*.js` - Snippet code

The generator:
1. Reads all `.js` files from `snippets/{Category}/`
2. Extracts metadata from `pages/{Category}/*.mdx` documentation
3. Injects workflows from `snippets/{Category}/WORKFLOWS.md` (if exists)
4. Generates complete `SKILL.md` with thresholds and execution instructions

### Adding New Snippets

1. Add JavaScript snippet to `snippets/{Category}/`
2. Document in `pages/{Category}/*.mdx`
3. Run `npm run generate-skills`
4. Run `npm run install-skills` to update local installation

### Adding Workflows & Decision Trees

To add intelligent workflows to a skill category:

1. Create `snippets/{Category}/WORKFLOWS.md`
2. Structure with `## Common Workflows` and `## Decision Tree` sections
3. Run `npm run generate-skills` to inject into generated skills

Example structure:

```markdown
## Common Workflows

### Workflow Name

When the user asks about [scenario]:

1. **Snippet1.js** - Brief description
2. **Snippet2.js** - Brief description

## Decision Tree

### After Snippet1.js

- **If condition** → Run **Snippet2.js**
- **If other condition** → Run **Snippet3.js**
```

See `snippets/Loading/WORKFLOWS.md` for a complete example with 8 workflows and 16 decision trees.

## Compatible Agents

Agent Skills is an open format supported by many AI coding tools:

- **Claude Code** - Anthropic's CLI coding assistant
- **Cursor** - AI-first code editor
- **OpenCode** - Open-source AI coding agent
- **VS Code Extensions** - Various AI assistant extensions
- **Gemini CLI** - Google's Gemini coding assistant
- **GitHub Copilot Workspace** - GitHub's AI development environment
- **And many more** - See [agentskills.io](https://agentskills.io) for full list

The standard `.claude/skills/` directory and `SKILL.md` format work across all compatible agents.

## Resources

- [WebPerf Snippets Documentation](https://webperf-snippets.nucliweb.net)
- [Agent Skills Specification](https://agentskills.io/specification)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Web Vitals](https://web.dev/articles/vitals)
- [Core Web Vitals](https://web.dev/articles/vitals#core-web-vitals)

## License

MIT License - see [LICENSE](LICENSE) for details.
