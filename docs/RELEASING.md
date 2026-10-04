# Releasing

## Pre-release Checklist

1. Update the version in [package.json](../package.json).
2. Regenerate derived artifacts with `npm run generate-skills`.
3. Verify the generated version in [skills/webperf/SKILL.md](../skills/webperf/SKILL.md).
4. Run:

```bash
npm run lint
npm run build
npm run check:consistency
npm run generate-skills:check
```

5. Commit the source changes together with regenerated `skills/` and `dist/`.

## Tag Release

The release workflow is triggered by pushing a tag that matches `v*`.

Example:

```bash
git tag v1.2.1
git push origin v1.2.1
```

## What The Workflow Produces

The release workflow:

1. Installs dependencies with `npm ci`
2. Regenerates `skills/`
3. Packages each generated skill as a zip
4. Publishes a GitHub Release with:

- `webperf-skills-all.zip`
- `webperf.zip`
- `webperf-core-web-vitals.zip`
- `webperf-loading.zip`
- `webperf-interaction.zip`
- `webperf-media.zip`
- `webperf-resources.zip`

## Failure Modes To Watch

- `skills/webperf/SKILL.md` version does not match `package.json`
- `skills/` or `dist/` are stale relative to `snippets/` or `content/`
- `_meta.js` entries drift from the actual MDX files
- Published snippet counts in `README.md`, `SKILLS.md`, or `skills/webperf/SKILL.md` are outdated
