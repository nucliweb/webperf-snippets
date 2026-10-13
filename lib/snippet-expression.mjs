import { parse } from 'acorn'

// A snippet as one JavaScript expression whose value is the result of the snippet, for a runner that
// has to place the code inside an expression, such as the DevTools extension. Most snippets are an
// IIFE statement and only lose the semicolon. A few are scripts that declare their functions and call
// one at the end (CSS-Media-Queries-Analysis); they go into a function that returns the value of their
// last statement. The code is changed at build time, not run with eval() in the page, which a strict
// Content Security Policy blocks.

export function snippetExpression(source) {
  const iife = source.trim().replace(/;\s*$/, '')
  try {
    parse(`(${iife})`, { ecmaVersion: 'latest' })
    return iife
  } catch {
    // Not one expression: a script
  }

  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: false })
  const last = program.body.at(-1)
  if (last?.type !== 'ExpressionStatement') return `(() => {\n${source}\n})()`
  const before = source.slice(0, last.start)
  const value = source.slice(last.expression.start, last.expression.end)
  return `(() => {\n${before}\nreturn (${value});\n})()`
}
