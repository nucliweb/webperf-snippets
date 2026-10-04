# Spec: Snippet Result Visualizer

## Objective

A client-side page on webperf-snippets that accepts the JSON return value of any snippet (copied
from the browser console), detects the snippet type, and renders a formatted performance report.

**Problem solved**: Sites protected by Akamai or strict CSP block extended DevTools console output,
but the IIFE return value remains accessible as the last evaluated expression. The visualizer turns
that object into a readable report without requiring any setup or CLI.

**Target users**: Web performance engineers doing reviews on sites with restrictive security
policies (e.g., FedEx, enterprise sites with Akamai).

---

## Core Features

1. **Paste area** — textarea accepting a raw JSON object (single result, not array)
2. **Auto-parse** — live parse on input change (debounced 300ms); no submit button
3. **Auto-detect** — identify snippet type from the `script` field (or structural heuristics)
4. **Renderers** — three display modes:
   - **CWV** — metric + rating + value + optional LCP subparts
   - **Fonts** — loaded fonts table, used-above-fold table, issues
   - **Audit** — issues list (severity-colored) + items table (generic)
5. **Export as Markdown** — copy the rendered report as Markdown to clipboard
6. **Error state** — clear message for invalid JSON or unrecognized format

---

## Acceptance Criteria

- [ ] Pasting a Fonts snippet result renders three sections: Loaded, Used above fold, Issues
- [ ] Pasting an LCP result shows rating badge + value + subParts breakdown when present
- [ ] Pasting any audit snippet result shows issues list + items table (up to 10 rows)
- [ ] Pasting invalid JSON shows an inline error, not a crash
- [ ] "Copy as Markdown" copies formatted Markdown to clipboard and shows confirmation
- [ ] Page appears in the sidebar nav as "Visualizer"
- [ ] No new npm dependencies introduced

---

## Detection Logic

```
result.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold"  → FontsRenderer
result.rating != null                                                → CWVRenderer
Array.isArray(result.issues)                                         → AuditRenderer
otherwise                                                            → RawRenderer (formatted JSON)
```

---

## Data Shapes (input contracts)

**CWV metric** (LCP, CLS, INP, FCP, etc.):
```json
{
  "script": "LCP",
  "metric": "LCP",
  "rating": "good | needs-improvement | poor",
  "value": 1234,
  "unit": "ms | score",
  "details": { "element": "...", "subParts": { "ttfb": {}, ... } }
}
```

**Fonts**:
```json
{
  "script": "Fonts-Preloaded-Loaded-and-used-above-the-fold",
  "status": "ok",
  "details": { "preloadedCount": 2, "loadedCount": 3, "usedAboveFoldCount": 2, ... },
  "items": [{ "family": "...", "weight": "400", "style": "normal", "display": "swap" }],
  "usedFonts": [{ "family": "...", "weight": "400", "style": "normal", "elements": 12 }],
  "issues": [{ "severity": "warning | error", "message": "..." }]
}
```

**Audit** (all other snippets):
```json
{
  "script": "Find-render-blocking-resources",
  "status": "ok",
  "count": 3,
  "items": [{ "url": "...", "type": "script", "durationMs": 120 }],
  "issues": [{ "severity": "error | warning | info", "message": "..." }]
}
```

---

## Project Structure

```
pages/
  visualizer.mdx           ← Nextra page (imports SnippetVisualizer)
components/
  SnippetVisualizer.jsx    ← Main component (textarea + renderer dispatch)
  SnippetVisualizer/
    CWVRenderer.jsx
    FontsRenderer.jsx
    AuditRenderer.jsx
    exportMarkdown.js      ← Pure function: result → markdown string
```

`pages/_meta.json` gets a new entry:
```json
"visualizer": { "title": "Visualizer" }
```

---

## Code Style

- **No new dependencies** — React hooks only (`useState`, `useMemo`, `useCallback`)
- **CSS classes** — own `wp-*` classes and `--wp-*` tokens in `styles/globals.css`, never the utility
  classes of the docs theme; inline styles only for dynamic values (rating colors)
- **No TypeScript** — plain `.jsx` / `.js`, matching the rest of the project
- **No comments** unless the why is non-obvious

---

## Markdown Export Format

Single result exported as:
```markdown
## Fonts — Fonts-Preloaded-Loaded-and-used-above-the-fold

### Loaded Fonts
| Family | Weight | Style | Display |
|--------|--------|-------|---------|
| ...    | 400    | normal| swap    |

### Used Above Fold
| Family | Weight | Style | Elements |
...

### Issues
- ⚠️ warning: Font preloaded without crossorigin...
```

For CWV metrics:
```markdown
## LCP — 1.2s ✅ good
...
```

---

## Boundaries

| Always | Ask First | Never |
|--------|-----------|-------|
| Handle invalid input gracefully | Adding a new npm dependency | Server-side code / API routes |
| Keep all logic client-side | Changing next.config.js | TypeScript migration |
| Use own `wp-*` classes for styling | Adding a new page category | Storing paste data anywhere |
| Clear error feedback | | Sending data to any external service |
