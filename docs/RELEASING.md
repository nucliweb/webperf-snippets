# Releasing

The repository publishes three parts, each with its own version and tag:

| Part | Version in | Tag | Workflow | Publishes |
|---|---|---|---|---|
| Collection and skills | [package.json](../package.json) | `v*` | [release.yml](../.github/workflows/release.yml) | GitHub Release with the skill zips |
| CLI | [cli/package.json](../cli/package.json) | `cli-v*` | [publish-cli.yml](../.github/workflows/publish-cli.yml) | `webperf-snippets` on npm, and its MCP server in the MCP Registry |
| DevTools extension | [extension/manifest.json](../extension/manifest.json) | `extension-v*` | [release-extension.yml](../.github/workflows/release-extension.yml) | GitHub prerelease with the extension zip |

Each workflow first runs `node scripts/check-tag-version.js <tag>`, which fails when the tag does not match the version of its file, so a mistyped tag publishes nothing. For the CLI it also checks [cli/server.json](../cli/server.json): its version, the version of the npm package it lists, and its name, which has to be the `mcpName` of `cli/package.json`. Run it locally before pushing a tag:

```bash
node scripts/check-tag-version.js cli-v1.1.0
```

## Collection and skills (`v*`)

### Pre-release checklist

1. Update the version in [package.json](../package.json).
2. Regenerate derived artifacts with `npm run generate-skills` and `node scripts/generate-llms.js`; the footer of the site and `llms.txt` show the version of `package.json`.
3. Verify the generated version in [skills/webperf/SKILL.md](../skills/webperf/SKILL.md).
4. Run:

```bash
npm run lint
npm run build
npm run check:consistency
npm run generate-skills:check
npm run test:skills
```

5. Commit the source changes together with the regenerated `skills/`, `dist/` and `public/llms*.txt`.

### Tag

```bash
git tag v2.0.2
git push origin v2.0.2
```

### What the workflow produces

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

## CLI (`cli-v*`)

1. Update the version in [cli/package.json](../cli/package.json) and the CHANGELOG, and merge the pull request.
   Before the merge, run `npm run smoke:cli-package`: it packs the CLI as the workflow publishes it, installs it in an empty folder and checks its MCP server without Chromium and after `npx playwright install chromium`. It needs the network, so it does not run in CI.
2. Push the tag right after the merge. The Copy prompt of the site pins the CLI version of `cli/package.json`, so the prompts of the deployed site fail until npm has that version.

```bash
git tag cli-v1.1.0
git push origin cli-v1.1.0
```

3. The job runs in the `npm-publish` environment, which needs a manual approval: approve it in the Actions tab, or the run waits.
4. npm takes about two minutes to list a new version. Until then a local `npx webperf-snippets@<version>` fails with `ETARGET`; run it with `--prefer-online` after that.

The workflow runs the CLI unit and E2E tests, copies `snippets/` into `cli/` and publishes from there.

It publishes with no stored secret. npm accepts the OIDC token of the run through trusted publishing, configured on npmjs.com for this repository, `publish-cli.yml` and the `npm-publish` environment, and adds the provenance of the package. Then `mcp-publisher` logs in to the MCP Registry with the same token (`login github-oidc`, which allows the `io.github.nucliweb/*` names) and publishes `cli/server.json`. The registry checks that the npm package carries that name in `mcpName`, so the step retries for three minutes while npm lists the new version.

If npm published and the registry step failed, publish `cli/server.json` from a clone instead of tagging again, since npm rejects a version twice:

```bash
cd cli
mcp-publisher login github
mcp-publisher publish
```

## DevTools extension (`extension-v*`)

1. Update the version in [extension/manifest.json](../extension/manifest.json) and merge the pull request.
2. Push the tag right after the merge. The download link of the [extension page](https://webperf-snippets.net/extension) points to the zip of the version in `manifest.json` (`components/ExtensionDownload.jsx`), so it is broken until the prerelease exists.

```bash
git tag extension-v0.1.2
git push origin extension-v0.1.2
```

The workflow tests the zip and publishes it on a GitHub prerelease, so it never becomes the latest release of the repository, which belongs to the skills.

## Failure modes to watch

- A tag that does not match its file: the workflow stops at the version check.
- `skills/webperf/SKILL.md` version does not match `package.json`
- `skills/` or `dist/` are stale relative to `snippets/` or `content/`
- `_meta.js` entries drift from the actual MDX files
- Published snippet counts in `README.md`, `SKILLS.md`, or `skills/webperf/SKILL.md` are outdated
- The CLI publish waits forever: the `npm-publish` environment needs its approval.
- The CLI publish fails at npm with an authentication error: the trusted publisher on npmjs.com has to name this repository, `publish-cli.yml` and the `npm-publish` environment.
