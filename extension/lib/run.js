// Runs a snippet in the inspected page. chrome.devtools.inspectedWindow.eval returns the value of an
// expression but does not wait for a promise, and most snippets are async. So the snippet starts in
// the page, keeps its result on window under an id, and the panel reads it back until it is there.
//
// evaluate(expression) runs an expression in the page and resolves with its value (see panel.js).

const STORE = '__webperfSnippets'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runExpression(evaluate, expression, { pollMs = 100, timeoutMs = 30000 } = {}) {
  const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const slot = `window.${STORE}[${JSON.stringify(id)}]`
  await evaluate(`(() => {
    window.${STORE} = window.${STORE} || {};
    ${slot} = { pending: true };
    Promise.resolve()
      .then(() => ${expression})
      .then((value) => { ${slot} = { value }; }, (error) => { ${slot} = { error: String((error && error.message) || error) }; });
  })()`)

  for (let waited = 0; waited < timeoutMs; waited += pollMs) {
    const entry = await evaluate(`(() => {
      const entry = ${slot};
      if (entry && !entry.pending) delete ${slot};
      return entry;
    })()`)
    if (entry?.error !== undefined) return { status: 'error', error: entry.error }
    if (entry && !entry.pending) return entry.value
    await sleep(pollMs)
  }
  await evaluate(`delete ${slot}`)
  return { status: 'error', error: `The snippet did not finish in ${timeoutMs / 1000} s` }
}

// expression: the snippet as one expression, as npm run extension:build writes it in snippets.json
export const runSnippet = (evaluate, expression, options) => runExpression(evaluate, expression, options)

// A tracking snippet answers later through the window function its result names, such as "getINP"
// or "loafHelpers.getData"
export function readTrackingData(evaluate, getDataFn, options) {
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(getDataFn)) {
    return Promise.resolve({ status: 'error', error: `"${getDataFn}" is not a valid function name` })
  }
  return runExpression(evaluate, `window.${getDataFn}()`, options)
}
