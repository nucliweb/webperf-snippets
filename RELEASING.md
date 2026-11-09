# Releasing

The repository publishes three parts, each with its own version and its own tag:

| Part | Version in | Tag | Workflow | Published to |
| --- | --- | --- | --- | --- |
| Collection and skills | `package.json` | `v*` | `release.yml` | GitHub release (Latest), with the zips of the skills |
| CLI and its MCP server | `cli/package.json` and `cli/server.json` | `cli-v*` | `publish-cli.yml` | npm and the MCP Registry |
| DevTools extension | `extension/manifest.json` | `extension-v*` | `release-extension.yml` | GitHub prerelease with the zip |

A release publishes only the parts that changed. The CLI and the extension ship the snippets, so a change to a snippet releases all three; a change to the CLI alone releases only the CLI, and a change to the extension alone only the extension. Fixes bump the patch version and new features the minor one.

Every workflow first runs `scripts/check-tag-version.js`, which stops the release when the version of the tag is not the one of its files.

## 1. Bump the versions

On a branch `chore/release-<version>` from an up-to-date `main`, change the versions of the parts to release:

- **Collection:** `"version"` in `package.json`.
- **CLI:** `"version"` in `cli/package.json`, and both versions in `cli/server.json` (the server and its npm package). The examples of the JSON output carry the version too: `cliVersion` and `cli_version` in `cli/README.md` and `content/CLI.mdx`.
- **Extension:** `"version"` in `extension/manifest.json`, and the `placeholder` of the version in `.github/ISSUE_TEMPLATE/extension-feedback.yml`.

Then update what derives from them:

```bash
npm install --package-lock-only --ignore-scripts   # package-lock.json, without touching node_modules
npm run generate-skills                            # skills/, dist/, .claude/skills/: the version line
node scripts/generate-llms.js                      # public/llms.txt and public/llms-full.txt
```

`git grep` for the previous versions, leaving out the changelogs and the generated files, should find nothing left.

## 2. Write the changelogs

Move the entries of `## [Unreleased]` to a new section, `## [<version>] — <date>`, with one paragraph that says what the release brings, and leave `## [Unreleased]` empty above it:

- **`CHANGELOG.md`** for the collection. Its paragraph names the versions of the extension and the CLI that come with it, and links to `cli/CHANGELOG.md`.
- **`cli/CHANGELOG.md`** for the CLI. A fix in a snippet the CLI ships goes there too, naming the collection version that has it.

## 3. Check before the pull request

```bash
npm run smoke:cli-package        # with a CLI release: the packed CLI installed in an empty folder, npm audit, its MCP server
npm run test:unit --prefix cli
npm run test:ci
npm run test:extension
npm run test:site
npm run lint
npm run check:consistency
```

`npm run smoke:cli-package` is the closest to what `npx webperf-snippets` gets: it copies the snippets into the package as the publish workflow does, installs it and calls its MCP server. CI runs the full e2e suite on the pull request.

## 4. The pull request

Commit everything as `chore: release <version>, the CLI <version> and the extension <version>`, naming only the parts it releases, and open the pull request against `main`. After the commit, `npm run generate-skills:check` must pass. CI runs on it as on any other.

A pull request that changes the prompts of the snippets runs the evals with the CLI version of the repository, so once that version is bumped they fail until it is on npm.

## 5. Tags

Once the pull request is merged, tag the merge commit, one lightweight tag per part released, and push them together:

```bash
git switch main && git pull
git tag v<version> <merge-commit>
git tag extension-v<version> <merge-commit>
git tag cli-v<version> <merge-commit>
git push origin v<version> extension-v<version> cli-v<version>
```

Each tag starts its workflow. `publish-cli.yml` runs in the `npm-publish` environment, which waits for a maintainer to approve it in GitHub Actions (Review deployments) before it runs the tests and publishes.

The CLI is published with npm trusted publishing: npm exchanges the OIDC token of the workflow for a short-lived one and adds the provenance of the package, so no npm token is stored in the repository. The MCP Registry takes the same OIDC token (`mcp-publisher login github-oidc`), and the workflow retries the publish for a few minutes, until npm lists the new version, since the registry checks the `mcpName` of the package on npm.

## 6. Check what was published

```bash
gh release list --limit 3                                   # v<version> Latest, extension-v<version> prerelease
gh release view extension-v<version> --json assets          # webperf-snippets-extension-<version>.zip
npm view webperf-snippets dist-tags                         # latest: the CLI version
npx -y webperf-snippets@<version> --version
curl -s "https://registry.modelcontextprotocol.io/v0/servers/io.github.nucliweb%2Fwebperf-snippets/versions/latest"
```

The registry answers with the new version and `isLatest: true`. The download button of the extension page takes its version from `extension/manifest.json`, so it links to the new zip once Vercel deploys `main`.

## When a publication fails halfway

- **A download from GitHub releases answers 504**, as the bundle of CodeQL or `mcp-publisher` can: rerun the failed job. The download of `mcp-publisher` already retries a few times. A run of the default setup of CodeQL cannot be rerun; it runs again with the next push to the branch, and on `main` after the merge.
- **The CLI is on npm but not on the MCP Registry:** rerun `publish-cli.yml`. Its npm step skips a version that npm already has, so the run goes on to the registry. If the rerun cannot finish either, publish the registry by hand from `cli/`, with the `mcp-publisher` of the version the workflow uses:

  ```bash
  gh release download v1.8.1 -R modelcontextprotocol/registry -p "mcp-publisher_darwin_arm64.tar.gz"
  tar -xzf mcp-publisher_darwin_arm64.tar.gz mcp-publisher
  cd cli && ../mcp-publisher login github && ../mcp-publisher publish
  ```

  `login github` gives a code to authorize at github.com/login/device.
- **A version reached npm with a mistake:** npm does not let a version be published twice, so the fix is the next patch version.
