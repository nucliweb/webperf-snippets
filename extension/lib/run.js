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
  // A reload or a navigation clears the page, and with it the function and what the snippet recorded
  const missing = `${getDataFn}() is not on the page: it reloaded or navigated since the snippet ran, which clears what it recorded. Run the snippet again`
  const path = getDataFn.split('.').map((part) => `?.[${JSON.stringify(part)}]`).join('')
  return runExpression(
    evaluate,
    `typeof window${path} === 'function' ? window.${getDataFn}() : Promise.reject(new Error(${JSON.stringify(missing)}))`,
    options
  )
}

// Reloads the inspected page and resolves once the new page has loaded and afterLoadMs more have
// passed, as the CLI waits before it runs the snippets (--wait, 3000 ms by default). A marker on the
// old page tells it apart from the new one; while the page reloads, an evaluation can fail, and the
// next poll tries again. Resolves false when the page does not load in timeoutMs
export async function reloadPage(evaluate, reload, { afterLoadMs = 3000, pollMs = 200, timeoutMs = 30000 } = {}) {
  const MARK = '__webperfSnippetsBeforeReload'
  await evaluate(`window.${MARK} = true`)
  await reload()
  for (let waited = 0; waited < timeoutMs; waited += pollMs) {
    await sleep(pollMs)
    const ready = await evaluate(`!window.${MARK} && document.readyState === 'complete'`).catch(() => false)
    if (ready) {
      await sleep(afterLoadMs)
      return true
    }
  }
  return false
}
