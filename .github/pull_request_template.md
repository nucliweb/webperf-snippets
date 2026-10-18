## Summary

<!-- What changes and why. Link the issue it closes, if any (Closes #123). -->

## Test plan

<!-- Each check and where it was done: local, CI, the dev server, a fixture, a real browser. -->

- [ ]

## Checklist

- [ ] A test that failed before the change and passes after it, or a note on why the change has none
- [ ] After changing a snippet: `npm run generate-skills`, `node scripts/generate-llms.js` and `npm run test:skills`, with the output committed
- [ ] After changing a page: `npm run build` and `npm run check:built-snippets`, and the page follows "Writing documentation pages" in CONTRIBUTING.md
- [ ] An entry under `## [Unreleased]` in `CHANGELOG.md` for a change people or agents notice
- [ ] No real third-party sites in code, tests, docs or examples (`example.com`, `localhost`)

A new snippet has a longer checklist in [CONTRIBUTING.md](https://github.com/nucliweb/webperf-snippets/blob/main/CONTRIBUTING.md#pr-checklist).
