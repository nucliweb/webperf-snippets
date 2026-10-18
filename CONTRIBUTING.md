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
npm run dev
```

The site runs on http://localhost:3000. Use `npm run dev` rather than `npx next dev`: the script runs Next.js with webpack, which loads the remark and rehype plugins of `lib/` (browser support, icons). The dev server does not pick up changes in `lib/`, so restart it after editing a plugin.

## Adding a new snippet

### 1. Write the test first

Every snippet starts with a failing test. `cli/tests/e2e/snippet-contract.test.js` runs every snippet and checks the shape of its result, so a new snippet is covered by it as soon as the file exists. What the contract cannot know is whether the result is right: write an e2e test in `cli/tests/e2e/<name>.test.js` that serves a page from `cli/tests/fixtures/` where you know the answer, runs the snippet in Chromium and checks the returned object. `cli/tests/e2e/dom-size.test.js` is a short example, and `cli/tests/helpers/contract.js` has the helpers to start the servers and run a snippet.

```bash
npm run test:e2e --prefix cli -- dom-size
```

Run it before writing the snippet and see it fail, then write the minimal snippet that passes it.

### 2. Create the JavaScript file

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

### 3. Create the MDX documentation page

Add a corresponding `.mdx` file in `content/<Category>/My-New-Snippet.mdx`:

```mdx
---
browserSupport:
  - api.PerformanceObserver
  - api.PerformanceResourceTiming
---

import snippet from '../../snippets/<Category>/My-New-Snippet.js?raw'
import { Snippet } from '../../components/Snippet'

# My new snippet

Brief description of what it measures and why it matters, in one or two sentences.

### Snippet

<Snippet code={snippet} />

### Understanding the results

Explain what the output means. Use `###` subsections for structure, never bold text as a header.

### Browser support

### Further reading

- [Relevant web.dev article](https://web.dev/...) | web.dev
```

Conventions:

- `browserSupport` lists the [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) keys of the APIs the snippet needs to run. The build draws a badge under the title and a table under the `### Browser support` heading from them; leave the section empty. It fails when a key does not exist or the heading is missing. An optional `browserSupportReported` lists the features the snippet only audits (for example, `html.elements.img.fetchpriority`), which get a table of their own and no badge.
- The `<Snippet>` component takes the code through the `code` prop; it renders its own copy button.
- The page follows the rules of [Writing documentation pages](#writing-documentation-pages).

Use the `copy` prop in code blocks to enable easy copying to DevTools:

````mdx
```js copy
// example usage
```
````

### 4. Register the page in navigation

Add an entry to `content/<Category>/_meta.js`, which exports a literal object:

```js
export default {
  "My-New-Snippet": {
    "title": "My New Snippet"
  }
}
```

Preserve the existing order and group related snippets together.

### 5. Document the result and what to run next

People, agents and the CLI read the same sources to know what a snippet returns and what comes after it:

- `snippets/SCHEMA.md`: add a `#### My-New-Snippet` entry under its category, with an example of the object it returns. It is the contract the agents read, copied into every skill.
- `snippets/<Category>/WORKFLOWS.md`: add an `### After My-New-Snippet.js` section to the decision tree, and the snippet to the workflows where it belongs (see [Improving workflows and decision trees](#improving-workflows-and-decision-trees)).
- `content/which-snippet.mdx`: add a row for the symptom the snippet answers.

### 6. Make it available to the CLI and Copy prompt

Every snippet runs in the CLI by its name (`--snippet My-New-Snippet` or `--snippet Loading/My-New-Snippet`). A short alias, for the snippets people run most, goes in `SNIPPET_ALIASES` of `cli/src/snippet-names.js`.

Every snippet page gets a Copy prompt button. If the CLI cannot run the snippet in a meaningful way (it is pasted into DevTools by hand, or it reads something a headless browser does not have), add it to `EXCLUDED` in `lib/snippet-prompt.mjs`. A tracking snippet that only records something after a click or a key press goes in `NEEDS_INPUT` of the same file.

### 7. Regenerate the generated files

```bash
npm run generate-skills
node scripts/generate-llms.js
npm run test:skills
```

`generate-skills` reads all snippets and their MDX documentation and rebuilds the skills in `skills/`, `dist/` and `.claude/skills/`. `generate-llms.js` rebuilds `public/llms.txt` and `public/llms-full.txt`. `test:skills` checks that every built script keeps the result objects of its source. Commit the regenerated files with the snippet.

Never edit the generated files by hand: change the sources in `snippets/` and regenerate.

### 8. Validate

```bash
npm run lint
npm run test:e2e --prefix cli
npm run build
npm run check:built-snippets
```

`check:built-snippets` runs after the build and fails when a page shows different code from the source. Then open the page with `npm run dev`, run the snippet from it in the DevTools console of a page where you know the answer, and check that the result is the one the test expects.

### 9. Add a CHANGELOG entry

Describe the change under `## [Unreleased]` in `CHANGELOG.md`, in the `Added`, `Changed` or `Fixed` section, from the point of view of someone who runs the snippet.

## Renaming a snippet or a page

A renamed page keeps its old URL working with a permanent redirect in `redirects()` of `next.config.mjs`. Rename the snippet file, the MDX page and the `_meta.js` entry together, update the links to the page (`grep -rn "Old-Name" content snippets`), and keep the old name as an alias in `cli/src/snippet-names.js` so scripts that use it still run.

## Writing documentation pages

These rules apply to every page under `content/`. Review a new or changed page against them before opening the pull request.

### Page types

- A snippet page documents one or more snippets and follows the template of [step 3](#3-create-the-mdx-documentation-page).
- A guide page (`CLI.mdx`, `extension.mdx`, `which-snippet.mdx`) has free structure and `type: guide` in its frontmatter; a tool page such as `visualizer.mdx` has `type: tool`. `npm run check:consistency` fails when a page imports no snippet and has neither type. The heading, link and tone rules below apply to them too.

### Structure of a snippet page

| Section | Notes |
| --- | --- |
| `browserSupport` frontmatter | The APIs the snippet needs to run; `browserSupportReported` for what it only audits |
| Import block | The snippet with `?raw` and the `Snippet` component |
| `# Title` | Sentence case |
| Intro paragraph | One or two sentences, directly under the title, with no `### Overview` heading |
| `### Snippet` | Contains `<Snippet code={snippet} />` |
| `### Understanding the results` | Or `### Understanding <concept>` when that is clearer |
| `### Browser support` | Only the heading, right before Further reading and at the same level (`##` on a page that uses `##` sections); the build fills it |
| `### Further reading` | Links in the format below |

A table, a `Callout`, a diagram or a `Demo` can go between the intro and `### Snippet`, and other sections (common patterns, related snippets) between Understanding the results and Browser support.

### Headings

- Sentence case everywhere: `# Largest contentful paint`, `### Understanding the results`.
- Never bold text as a heading (`**Results:**` on its own line, or a bold line that opens a section): use a `###` heading. Bold is for emphasis inside a sentence.

### Links

Each Further reading link is `- [Title](url) | source`. Internal links use the path of the page, without `.mdx`:

```
- [Largest Contentful Paint](https://web.dev/articles/lcp) | web.dev
- [LCP subparts](/CoreWebVitals/LCP-Subparts) | Detailed phase breakdown
```

Examples, commands and test data use the domains reserved for documentation (`example.com`, `example.net`, `example.org`) or `localhost`, never real sites. `scripts/example-domains.test.js` fails when a real site appears as an example.

### Callouts

Use the `Callout` component for tips, warnings and notes, not bold text or plain `>` blockquotes; keep `>` for real quotations. Import it once per page, after the frontmatter: `import { Callout } from '../../components/Callout'`, the wrapper of this site, which draws its icons, not the one of `nextra/components`. Types: `info` for tips, related links and recommendations, `warning` for warnings, browser support and CORS caveats, `default` for notes.

### Code examples

Before and after examples mark each version with an `❌` or `✅` comment:

```html
<!-- ❌ Render-blocking -->
<script src="app.js"></script>

<!-- ✅ Non-blocking -->
<script src="app.js" defer></script>
```

Emojis in an MDX page are fine: the site replaces them with icons when the page renders.

### Tone

Pages are reference material, not a tutorial:

- No first person and no conversational asides ("Now let's see…", "As you can see…").
- State what the snippet returns and what it means, without adjectives such as "powerful" or "comprehensive".
- Timeless language: describe what a feature does, as if it always existed ("Supports", "Reports"), never "now supports" or "we've added". Versions appear only for things that are versioned, such as a browser release.
- No em-dash with spaces as a comma: use a comma, a semicolon, a colon or a new sentence.

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

A demo has no external scripts, styles, fonts or requests. It reports its height to the page, follows the theme of the site, respects reduced motion, and works with a keyboard and a screen reader. The full contract, the shared components (legend, tabs, frame, controls, explanation box) and the icons are in [`public/demos/README.md`](public/demos/README.md); copy an existing demo instead of restyling one. After adding a demo or changing its layout, run `npm run generate-demo-heights`, so the page reserves the height of the demo before it loads. `npm run test:demos` checks the contract, fails when a demo has no reserved height, and runs in CI.

Demos and pages draw icons instead of emojis, and `npm run check:emoji` fails when an emoji slips into rendered text. An emoji in an MDX page is fine: the site swaps it for an icon when the page renders.

## Improving workflows and decision trees

Skills include workflows that chain snippets. To add or improve them, edit the `WORKFLOWS.md` file in the relevant category:

```
snippets/CoreWebVitals/WORKFLOWS.md
snippets/Loading/WORKFLOWS.md
snippets/Interaction/WORKFLOWS.md
snippets/Media/WORKFLOWS.md
snippets/Resources/WORKFLOWS.md
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

See `snippets/Loading/WORKFLOWS.md` for a complete reference. The skills read these files when they are generated, so run `npm run generate-skills` after editing one.

## PR checklist

- [ ] An e2e test in `cli/tests/e2e/` that failed before the change and passes after it
- [ ] Snippet file added under `snippets/<Category>/`, returning an object that follows `snippets/SCHEMA.md`
- [ ] MDX documentation page created under `content/<Category>/`, with `browserSupport` and a `### Browser support` section
- [ ] Entry added to `content/<Category>/_meta.js`
- [ ] Entry in `snippets/SCHEMA.md`, an `After My-New-Snippet.js` section in `WORKFLOWS.md` and a row in `content/which-snippet.mdx`
- [ ] If the CLI cannot run it: the snippet is in `EXCLUDED` of `lib/snippet-prompt.mjs`
- [ ] `npm run generate-skills` and `node scripts/generate-llms.js` run, `npm run test:skills` passes, and the output is committed
- [ ] `npm run lint` and `npm run test:e2e --prefix cli` pass
- [ ] `npm run build` succeeds and `npm run check:built-snippets` passes
- [ ] The snippet run from its page, in the DevTools console, gives the result the test expects
- [ ] Entry under `## [Unreleased]` in `CHANGELOG.md`
- [ ] If a page was renamed: a redirect in `next.config.mjs`
- [ ] If the page has a diagram or a demo: it follows the sections above, and `npm run test:demos` and `npm run check:emoji` pass

## Code style

- File names: kebab-case (`My-New-Snippet.js`)
- English for all code, variable names, and comments
- No external dependencies in snippets: they run in browser consoles
- `console.log` is fine; snippets are diagnostic tools

## Skipping the slow CI steps

CI takes about five minutes, most of it the build, the Chromium install and the e2e tests. A pull request that only changes documentation can skip those three steps by carrying the `skip-e2e` label. Lint, the consistency, emoji and generated-skills checks, and the unit tests still run.

- Put the label on when you open the pull request (`gh pr create --label skip-e2e`) or add it later; adding it re-runs CI and cancels the run in progress.
- The label is honored only when every changed file is documentation: `*.md`, `docs/**` and `LICENSE`. If the pull request changes anything else, including pages (`.mdx`), snippets, tests, scripts, workflows or `package.json`, the label is ignored and everything runs. A later push that touches code therefore cannot skip the tests by accident.
- The job summary says what the label did, or why it was ignored.
- A push to `main` always runs every step.
- Only people with write access can add a label, so it cannot be used from a fork.

