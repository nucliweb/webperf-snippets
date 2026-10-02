# Interactive demos

Self-contained HTML files embedded in the docs through the `<Demo />` component
(`components/Demo.jsx`). Each file is a single page with no external dependencies:
all CSS and JS are inline, so it works offline and inside a sandboxed iframe.

A demo is worth building only for a **temporal or stateful** phenomenon, something
the reader benefits from watching move (the parser pausing on a script, request
waterfalls, metric sub-parts accumulating). Static mechanism diagrams and decision
trees are diagrams (see "Diagrams" in `CONTRIBUTING.md`).

## The contract

A demo must satisfy the first three things for the embed to behave, and the last two so every demo is usable by everyone.

### 1. Report its height

The iframe has no scrollbar of its own; it grows to fit its content. The demo
measures its body and posts the height to the parent. The component listens for
`demoHeight` and sizes the iframe to it (plus a small padding).

```js
function notifyHeight() {
  window.parent.postMessage({ demoHeight: document.body.offsetHeight }, "*");
}
new ResizeObserver(notifyHeight).observe(document.body);
```

Post `demoHeight`. (A custom key can be passed to the component via the
`heightKey` prop, but there is no reason to; standardize on `demoHeight`.)

### 2. Sync the theme

The demo shares the same origin as the docs, so it reads the theme Nextra writes
to `localStorage.theme` and reacts to changes through the `storage` event. Style
both themes: dark by default under `:root`, light under `[data-theme="light"]`.

```js
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t || "dark");
}
(function initTheme() {
  const stored = localStorage.getItem("theme");
  if (stored) return applyTheme(stored);
  applyTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();
addEventListener("storage", (e) => {
  if (e.key === "theme") applyTheme(e.newValue);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (!localStorage.getItem("theme")) applyTheme(e.matches ? "dark" : "light");
});
```

### 3. Be self-contained

No external scripts, styles, fonts, or network requests. Inline everything. The
file must render identically whether opened directly (the "Open demo in a new
tab" fallback link) or embedded.

### 4. Respect reduced motion

Turn off transitions and animations when the reader asks for less motion. The
same block works for every demo. A demo that animates on its own (a cursor, a
progress bar) must also jump straight to its final state.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
```

### 5. Be usable without a mouse or a sighted reader

- Every choice that switches the view is a `<button>` inside a
  `role="group"` with an `aria-label`, and sets `aria-pressed` to `true` on the
  active one.
- The explanation box has `aria-live="polite"`, so a change of scenario or step is
  announced. When a value is only drawn (a total, a bar), write it in the text of
  the explanation too.
- Tabs and buttons show a visible focus ring:
  `.tab:focus-visible, .btn:focus-visible { outline: 2px solid var(--c-js); outline-offset: 2px; }`

## Visual language

All demos share the same components, so they read as one set. Copy them from an
existing demo (`raf-pipeline.html` is the reference for step-by-step demos and
`ttfb-subparts.html` for scenario demos) instead of restyling them.

| Component | Class | Notes |
|-----------|-------|-------|
| Base | `body` | 13 px system font, 16 px padding, 14 px gap. Palette tokens `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--muted`, `--tab-active-bg` |
| Legend strip | `.legend`, `.legend-label`, `.lg` | First element. An uppercase label followed by one pill per lane, phase or piece. Pill color matches the color used in the diagram. `raf-pipeline` and `yield-pipeline` use the same component under the name `.pipeline-order` |
| Scenario tabs | `.tabs`, `.tab` | 7 px 14 px padding, 6 px radius, 12 px text at weight 500. The active tab gets `--tab-active-bg` and an accent border. A bad, doubtful and good variant of the same code carries an `ic-bad`, `ic-warn` or `ic-ok` icon (see Icons) |
| Frame | `.frame`, `.frame-label`, `.frame-body` | The diagram or timeline lives in a frame with an uppercase title bar |
| Controls | `.controls`, `.btn`, `.btn-reset`, `.btn-next` | Primary action is the blue `.btn-next` (`#1f6feb`, hover `#388bfd`); `.btn-reset` is the secondary one. A counter goes on the right (`Step n / N`) |
| Explanation | `.expl` | A box with a 3 px left border. The border color follows the state: `t-ok` green, `t-warn` yellow, `t-block` red, `t-neutral` blue |

Two interaction models are in use, and both are fine. Use **step by step**
(`Next step` and `Reset`) for a mechanism that happens in order inside the
browser. Use **scenarios with an animated result** (a `Replay` button) to
compare configurations. Whichever you pick, keep the components above.

## Icons

Demos use no emoji and no check or cross glyph: they draw their own icons, and `npm run check:emoji` fails if one slips in. The only symbols allowed as text are the arrows that label the Reset and Next buttons.

An icon is an empty `<span>` whose CSS mask draws the shape; the color is the status tone (`--ic-good`, `--ic-mid`, `--ic-poor`, the same values as the site). It works inside the text a demo injects with `innerHTML`, so it needs no JavaScript.

| Class | Shape | Tone | Replaces |
|-------|-------|------|----------|
| `ic-ok` | Circle with a check | Green | Good, done |
| `ic-bad` | Circle with a cross | Red | Bad, problem |
| `ic-warn` | Warning triangle | Yellow | Doubtful, warning |
| `ic-check` | Bare check | Green | Item that works |
| `ic-x` | Bare cross | Red | Item that fails or closes |

Add `ic-end` when the icon comes after the text (it moves the gap to the other side). A symbol that only decorates a label (a lightning bolt, a paint palette, a play triangle) is dropped, not replaced.

For screen readers, an icon that is the only thing saying the status (a scenario tab, a note that is only an icon) carries `role="img"` and an `aria-label`. An icon next to text that already says it is `aria-hidden="true"`.

```html
<button class="tab" aria-pressed="false"><span class="ic ic-warn" role="img" aria-label="Warning"></span>Single rAF</button>
<div class="item">Recalc Style<span class="ic ic-check ic-end" aria-hidden="true"></span></div>
```

Copy this block into the demo's `<style>`, before the reduced motion rule. Keep it as it is, so every demo draws the same icons:

```css
/* Icons (see "Icons" in README.md): a mask draws the shape, the color is the status tone */
:root { --ic-good: #3fb950; --ic-mid: #e3b341; --ic-poor: #f85149; }
[data-theme="light"] { --ic-good: #1a7f37; --ic-mid: #9a6700; --ic-poor: #cf222e; }
.ic {
  display: inline-block;
  width: 1.1em;
  height: 1.1em;
  margin-inline-end: .3em;
  vertical-align: -.2em;
  background: currentColor;
  -webkit-mask: var(--ic-shape) center / contain no-repeat;
  mask: var(--ic-shape) center / contain no-repeat;
}
.ic-end { margin-inline: .3em 0; }
.ic-ok { --ic-shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9.5'/%3E%3Cpath d='m8 12.5 3 3 5-6'/%3E%3C/svg%3E"); color: var(--ic-good); }
.ic-bad { --ic-shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9.5'/%3E%3Cpath d='m9 9 6 6M15 9l-6 6'/%3E%3C/svg%3E"); color: var(--ic-poor); }
.ic-warn { --ic-shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'/%3E%3Cpath d='M12 9.5v4.2M12 17h.01'/%3E%3C/svg%3E"); color: var(--ic-mid); }
.ic-check { --ic-shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.5 4.5L19 7.5'/%3E%3C/svg%3E"); color: var(--ic-good); }
.ic-x { --ic-shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 6 12 12M18 6 6 18'/%3E%3C/svg%3E"); color: var(--ic-poor); }
```

## Minimal template

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Demo title</title>
<style>
  :root { --bg: #0d1117; --text: #e6edf3; /* dark palette */ }
  [data-theme="light"] { --bg: #ffffff; --text: #1f2328; /* light palette */ }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); padding: 16px;
         font: 13px/1.4 -apple-system, system-ui, sans-serif; }
</style>
</head>
<body>
  <!-- interactive content here -->

<script>
  // ...demo logic...

  // Theme
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t || "dark"); }
  (function initTheme() {
    const stored = localStorage.getItem("theme");
    if (stored) return applyTheme(stored);
    applyTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  })();
  addEventListener("storage", (e) => { if (e.key === "theme") applyTheme(e.newValue); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) applyTheme(e.matches ? "dark" : "light");
  });

  // Height
  function notifyHeight() { window.parent.postMessage({ demoHeight: document.body.offsetHeight }, "*"); }
  new ResizeObserver(notifyHeight).observe(document.body);
</script>
</body>
</html>
```

## Embedding in a page

```mdx
import { Demo } from "../../components/Demo";

<Demo
  src="/demos/your-demo.html"
  title="Accessible description of what the demo shows"
  caption="One line telling the reader what to do (use the buttons, switch scenarios...)."
/>
```

Keep the mermaid diagram that documents the internal mechanism or decision tree;
the demo complements it, it does not replace mechanism documentation.
