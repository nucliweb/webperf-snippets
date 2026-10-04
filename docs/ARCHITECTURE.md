# Architecture

This repository has four main content layers:

1. `snippets/`
Source of truth for executable JavaScript snippets. Each category contains the browser-console code that users and agents run.

2. `content/`
Human-facing MDX documentation published by the Nextra site. Most pages document one snippet or a related set of snippets. Editorial pages can be declared with frontmatter such as `type: guide`.

3. `skills/`
Generated Agent Skills built from `snippets/` and `content/`. These files are not the authoring source. Regenerate them with `npm run generate-skills`.

4. `dist/`
Generated readable artifacts for external consumption. These are also derived outputs, not source files.

## Build Flow

The normal flow is:

`snippets/` + `content/` -> `scripts/generate-skills.js` -> `skills/` + `dist/`

Supporting files:

- `lib/snippets-registry.js` powers site-level snippet metadata and imports.
- `content/**/_meta.js` defines sidebar navigation for each section.
- `scripts/check-consistency.js` validates source-to-doc parity, editorial page declarations, `_meta.js` alignment, and published counts.

## Source of Truth

Treat these as editable source:

- `snippets/`
- `content/`
- `content/**/_meta.js`
- `lib/snippets-registry.js`
- `README.md`
- `SKILLS.md`

Treat these as generated or derivative:

- `skills/`
- `dist/`

## Common Contributor Workflow

1. Edit or add a snippet in `snippets/`.
2. Add or update its documentation in `content/`.
3. Update the relevant `_meta.js`.
4. Run `npm run generate-skills` when you intentionally want to refresh derived artifacts.
5. Run `npm run check:consistency`.
6. Run `npm run lint` and `npm run build`.

## When To Regenerate Skills

Run `npm run generate-skills` whenever you change:

- Any file in `snippets/`
- Any MDX page used to build skill descriptions or thresholds
- `package.json` version or metadata that should propagate to generated skills

## Release Relationship

Release packaging reads from generated `skills/`, so stale generated files can leak into release artifacts. Before a release, verify generation explicitly with:

- `npm run check:consistency`
- `npm run generate-skills:check`
