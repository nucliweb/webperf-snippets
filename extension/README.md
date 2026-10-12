# WebPerf Snippets for Chrome DevTools

A DevTools panel that lists the snippets and runs the one you choose on the inspected page, with its result shown by the return contract (`snippets/SCHEMA.md`): the metric and its rating, the issues, the items as a table and the details. It runs through `chrome.devtools.inspectedWindow.eval`, which works on pages whose Content Security Policy blocks pasted code.

## Load it

1. `npm run extension:build` writes `extension/snippets.json` with every snippet.
2. In `chrome://extensions`, turn on Developer mode, choose Load unpacked and select the `extension` folder.
3. Open DevTools on any page and go to the WebPerf Snippets panel.

Run `npm run extension:build` again after a snippet changes, then reload the extension in `chrome://extensions`. The snippets ship inside the extension, since the Chrome Web Store does not allow an extension to run code it did not ship with.

## Tracking snippets

A snippet such as INP or Long Animation Frames records what happens after it runs. Run it, use the page, then choose Read result.

## Code

- `panel.js`: the panel.
- `lib/run.js`: runs a snippet in the page and waits for an async result, which `inspectedWindow.eval` does not do.
- `lib/render.js`: the HTML of a result, with every value from the page escaped.
- `lib/catalog.js`: the categories and the search.

`npm run test:extension` runs their tests.
