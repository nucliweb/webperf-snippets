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
  status: "ok",           // "ok" | "error"
  count: results.length,
  details: { /* structured data */ },
  items: results,
};
```

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
- Use `>` blockquotes for tips and warnings, not bold text.

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

## Code style

- File names: kebab-case (`My-New-Snippet.js`)
- English for all code, variable names, and comments
- No external dependencies in snippets — they run in browser consoles
- `console.log` is fine; snippets are diagnostic tools
