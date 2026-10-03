# Contributing to WebPerf Snippets

## Ways to contribute

- Add a new snippet
- Improve an existing snippet or its documentation
- Fix a bug
- Improve workflows and decision trees for Agent Skills

## Development setup

```bash
git clone https://github.com/nucliweb/webperf-snippets.git
cd webperf-snippets
npm install
npx next dev
```

## Adding a new snippet

### 1. Create the JavaScript file

Add the snippet to the appropriate category under `snippets/`:

```
snippets/
├── CoreWebVitals/   # LCP, CLS, INP metrics
├── Loading/         # TTFB, FCP, scripts, fonts, images, hints
├── Interaction/     # Long tasks, animation frames, scroll
├── Media/           # Images, videos, SVGs
├── Resources/       # Network bandwidth, connection quality
└── DevTools-Overrides/  # Scripts meant for DevTools Local Overrides
```

Use kebab-case for the filename (e.g., `My-New-Snippet.js`).

Each snippet must return a structured object so Agent Skills can consume its output:

```js
// ... snippet logic ...

return {
  script: "My-New-Snippet",
  status: "ok",           // "ok" | "tracking" | "error" | "unsupported"
  count: results.length,
  details: { /* structured data */ },
  items: results,         // homogeneous, at most 50
};
```

The full contract is in [`snippets/SCHEMA.md`](snippets/SCHEMA.md), which is also the source of the `schema.md` file of every generated skill. `cli/tests/e2e/snippet-contract.test.js` runs every snippet, and the function it exposes for tracking data, and checks that contract. Two rules cause most failures:

- Chrome only exposes `largest-contentful-paint`, `layout-shift`, `longtask`, `event` and `first-input` entries through a `PerformanceObserver`. `performance.getEntriesByType()` returns `[]` for them, and ESLint rejects it. Use a buffered observer.
- Never wrap the IIFE in `void`, which discards the return value.

A snippet runs pasted into the console, so it cannot import a helper. The helpers several snippets share (`getRootDomain`, `isFirstParty`, `logOwnDomainsHint`, `formatBytes`) live in [`snippets/_shared/helpers.js`](snippets/_shared/helpers.js). Copy the block between the `// @shared <name>` and `// @end-shared <name>` markers into the snippet, markers included. `npm run check:consistency` fails when a copy differs from the canonical block, or when a snippet defines one of these helpers without the markers. A snippet that carries `isFirstParty` also declares `const OWN_DOMAINS = [];` at the top, which the helper reads, and calls `logOwnDomainsHint(thirdPartyCount)` once at the end of its console output.

### 2. Create the MDX documentation page

Add a corresponding `.mdx` file in `pages/<Category>/My-New-Snippet.mdx`:

```mdx
import snippet from '../../snippets/<Category>/My-New-Snippet.js?raw'
import { Snippet } from '../../components/Snippet'

# My new snippet

Brief description of what it measures and why it matters, in one or two sentences.

### Snippet

<Snippet code={snippet} />

### Understanding the results

Explain what the output means. Use `###` subsections for structure, never bold text as a header.

### Further reading

- [Relevant web.dev article](https://web.dev/...) | web.dev
```

Conventions:

- Headings use sentence case (`# My new snippet`, `### Further reading`).
- The `<Snippet>` component takes the code through the `code` prop; it renders its own copy button.
- Each Further reading link ends with `| source`.
- Use the `Callout` component for tips and warnings (`import { Callout } from '../../components/Callout'`; types `info`, `warning`, `default`), not bold text or plain `>` blockquotes. Reserve `>` for real quotations. It wraps the Nextra callout and draws the site icons instead of emojis.

Use the `copy` prop in code blocks to enable easy copying to DevTools:

````mdx
```js copy
// example usage
```
````

### 3. Register the page in navigation

Add an entry to `pages/<Category>/_meta.json`:

```json
{
  "My-New-Snippet": {
    "title": "My New Snippet"
  }
}
```

Preserve the existing order and group related snippets together.

### 4. Regenerate Agent Skills

```bash
npm run generate-skills
```

This reads all snippets and their MDX documentation and rebuilds the skills in `/skills/` and `/.claude/skills/`.

> Never edit generated files directly. Always modify source files in `/snippets/` and regenerate.

### 5. Validate

```bash
npm run lint
npm run build
```

## Diagrams

Pages draw their diagrams with the SVG components in `components/diagrams`, not with Mermaid. They follow the light and dark theme, and the colors come from the `--dg-*` tokens at the end of `styles/globals.css`.

```mdx
import { Flow, Sequence } from '../../components/diagrams'

<Flow
  title="Decision tree: critical scripts are inlined or preloaded, the rest use defer or async"
  nodes={[
    { id: "Start", label: "Script loading strategy" },
    { id: "Critical", label: "Critical for\ninitial render?", shape: "decision" },
    { id: "Inline", label: "Inline the script", tone: "good" },
    { id: "Defer", label: "Use defer", tone: "info" },
  ]}
  edges={[
    { from: "Start", to: "Critical" },
    { from: "Critical", to: "Inline", label: "Yes" },
    { from: "Critical", to: "Defer", label: "No" },
  ]}
/>

<Sequence
  title="The browser requests a page and the server answers"
  participants={[{ id: "B", label: "Browser" }, { id: "S", label: "Server" }]}
  steps={[
    { type: "message", from: "B", to: "S", label: "GET /" },
    { type: "message", from: "S", to: "B", label: "200 OK", dashed: true },
  ]}
/>
```

- `Flow` draws flowcharts, decision trees and state diagrams. Nodes take a `shape` (`rect`, `pill`, `decision`, `start`, `end`) and a `tone` (`neutral`, `info`, `good`, `warn`, `bad`, `violet`, `ttfb`, `delay`, `load`, `render`). Edges take a `label` and `dashed`. Optional `groups`, `notes` and `direction` (`TD` or `LR`). The props are documented at the top of `components/diagrams/Flow.jsx`.
- `Sequence` draws messages between participants, with `note` steps and `alt`, `loop`, `opt` and `rect` blocks. A message from a participant to itself draws a loop. The props are documented at the top of `components/diagrams/Sequence.jsx`.
- Every diagram needs a `title`: one sentence, written by hand, that says what the diagram shows. Screen readers announce it.
- A tone says the same thing an emoji would, so do not put emojis in labels; the component strips them.
- The nodes a node points to are drawn in the order of its edges: the first edge goes on the left in a top down flow and on top in a left to right one, so write `Yes` before `No`. The order is never bought with a crossing edge. If the edges you wrote could only be ordered by crossing them, the pair that would cross keeps the arrangement without crossings, so reorder the edges of that node. Children on different ranks have no order.
- An edge can start or end at a group: it attaches to the box of the group. Two edges between the same pair of nodes, for example a solid one and a dashed one, are drawn as two separate routes. A `start` or `end` shape can carry a `label`, drawn next to the dot on the side the edge does not use: above a `start` and below an `end` in a top down flow, left of a `start` and right of an `end` in a left to right one.
- A diagram that needs something the components do not do (a timeline, the LCP phases) is a component of its own next to them, such as `LcpSubparts.jsx` or `EventProcessingTimeline.jsx`.

Check a new diagram with `npm run dev` at 1280 px and at 420 px, in the light and the dark theme, with no console errors and no horizontal scroll of the page. A sequence that does not fit the column scrolls inside its own region, which is expected.

## Interactive demos

A demo is a self-contained HTML file in `public/demos/`, embedded in a page with the `Demo` component. Build one only for something that moves or changes over time (a request waterfall, the parser pausing on a script, a metric adding up its sub-parts). A static mechanism or a decision tree is a diagram.

```mdx
import { Demo } from '../../components/Demo'

<Demo
  src="/demos/render-blocking-timeline.html"
  title="Interactive timeline comparing how render-blocking resources delay First Contentful Paint"
  caption="Switch between the two setups, then step through to see when the first paint can happen."
/>
```

A demo has no external scripts, styles, fonts or requests. It reports its height to the page, follows the theme of the site, respects reduced motion, and works with a keyboard and a screen reader. The full contract, the shared components (legend, tabs, frame, controls, explanation box) and the icons are in [`public/demos/README.md`](public/demos/README.md); copy an existing demo instead of restyling one. `npm run test:demos` checks the contract and runs in CI.

Demos and pages draw icons instead of emojis, and `npm run check:emoji` fails when an emoji slips into rendered text. An emoji in an MDX page is fine: the site swaps it for an icon when the page renders.

## Improving workflows and decision trees

Skills include intelligent workflows that chain snippets automatically. To add or improve them, edit the `WORKFLOWS.md` file in the relevant category:

```
snippets/Loading/WORKFLOWS.md
snippets/CoreWebVitals/WORKFLOWS.md
snippets/Interaction/WORKFLOWS.md
```

Structure:

```markdown
## Common Workflows

### Workflow Name

When the user asks about [scenario]:

1. **Snippet1.js** - Brief description
2. **Snippet2.js** - Brief description

## Decision Tree

### After Snippet1.js

- **If metric > threshold** → Run **Snippet2.js**
- **If metric is good** → Run **Snippet3.js**
```

See `snippets/Loading/WORKFLOWS.md` for a complete reference.

## PR checklist

- [ ] Snippet file added under `snippets/<Category>/`
- [ ] MDX documentation page created under `pages/<Category>/`
- [ ] Entry added to `pages/<Category>/_meta.json`
- [ ] `npm run generate-skills` run and output committed
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` succeeds
- [ ] If the page has a diagram or a demo: it follows the sections above, and `npm run test:demos` and `npm run check:emoji` pass

## Code style

- File names: kebab-case (`My-New-Snippet.js`)
- English for all code, variable names, and comments
- No external dependencies in snippets — they run in browser consoles
- `console.log` is fine; snippets are diagnostic tools

## Skipping the slow CI steps

CI takes about five minutes, most of it the build, the Chromium install and the e2e tests. A pull request that only changes documentation can skip those three steps by carrying the `skip-e2e` label. Lint, the consistency, emoji and generated-skills checks, and the unit tests still run.

- Put the label on when you open the pull request (`gh pr create --label skip-e2e`) or add it later; adding it re-runs CI and cancels the run in progress.
- The label is honored only when every changed file is documentation: `*.md`, `docs/**` and `LICENSE`. If the pull request changes anything else, including pages (`.mdx`), snippets, tests, scripts, workflows or `package.json`, the label is ignored and everything runs. A later push that touches code therefore cannot skip the tests by accident.
- The job summary says what the label did, or why it was ignored.
- A push to `main` always runs every step.
- Only people with write access can add a label, so it cannot be used from a fork.

