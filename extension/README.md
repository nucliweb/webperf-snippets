# WebPerf Snippets for Chrome DevTools

A DevTools panel that lists the snippets and runs the one you choose on the inspected page, with its result shown by the return contract (`snippets/SCHEMA.md`): the metric and its rating, the issues, the items as a table and the details. It runs through `chrome.devtools.inspectedWindow.eval`, which works on pages whose Content Security Policy blocks pasted code.

## Load it

1. `npm run extension:build` writes `extension/snippets.json` with every snippet.
2. In `chrome://extensions`, turn on Developer mode, choose Load unpacked and select the `extension` folder.
3. Open DevTools on any page and go to the WebPerf Snippets panel.

Run `npm run extension:build` again after a snippet changes, then reload the extension in `chrome://extensions`. The snippets ship inside the extension, since the Chrome Web Store does not allow an extension to run code it did not ship with.

## Release the beta

`npm run extension:zip` builds the snippets and writes `webperf-snippets-extension-<version>.zip`, without the tests. A tag `extension-v<version>`, with the version of `manifest.json`, makes the Release extension workflow test the zip and publish it as a prerelease, the file the beta page links to.

## Copy buttons

- Copy JSON copies the result, to paste it into an issue or an agent.
- Prompt to measure copies the prompt of the Copy prompt button of the site, which runs the snippet with the CLI, with the inspected page in its command, quoted for the shell, and as the page to measure at the end, so an agent can run it as it is. The two snippets the CLI cannot run have none.
- Prompt to fix shows when the result has errors or warnings. It copies a prompt for an agent that works in the repository of the site: the issues with their code and target, the details of the result and the rows the issues point to (up to 30 issues and 20 rows, about 16 KB, counting the rest), and how to check the fix with the CLI, a run before the change and one after it with `--baseline`, on a URL where the change can be tested. It carries URLs and selectors of the inspected page.
- Prompt to fix in the audit, once it is done and some snippet has errors or warnings, copies the same kind of prompt for the whole audit: the errors and warnings of every snippet, the errors first, under the title of each snippet and the id of its step (up to 30 issues), checked with `--workflow audit` before and after the change.

## Tracking snippets

A snippet such as INP or Long Animation Frames records what happens after it runs. Run it, use the page, then choose Read result.

## Code

- `panel.js`: the panel.
- `lib/run.js`: runs a snippet in the page and waits for an async result, which `inspectedWindow.eval` does not do.
- `lib/render.js`: the HTML of a result, with every value from the page escaped.
- `lib/catalog.js`: the categories and the search.

`npm run test:extension` runs their tests. `npm run test:extension:e2e` runs every snippet through the real panel, against the seeded page of the CLI contract tests: a DevTools panel cannot be automated, so `panel.html` gets an `inspectedWindow.eval` that runs in another tab as the real one does, and each result must keep the return contract.

The DevTools-Overrides scripts are not in the extension: they go into Local Overrides so they run before the page, and return nothing.
