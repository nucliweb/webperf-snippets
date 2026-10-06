// Each case gives an agent the Copy prompt of one snippet and a local page with a known result.
// `fixture` is looked up in scripts/eval-prompts/fixtures first and then in cli/tests/fixtures.
//
// expect.status            statuses the CLI result can have
// expect.reference         compare the agent's value with a run of the CLI by the runner (± tolerance, ms)
// expect.noTyping          the page has no text field, so the interactions must not type
// expect.minInteractions   interactions the snippet must have recorded

export const CASES = [
  {
    id: 'lcp-one-shot',
    path: 'CoreWebVitals/LCP',
    docsPath: '/CoreWebVitals/LCP',
    snippet: 'LCP',
    fixture: 'observer-lcp.html',
    expect: { status: ['ok'], reference: { tolerance: 200 } },
  },
  {
    // The prompt shows a click on `button.menu-toggle` and a `type` in a search box as an example;
    // this page has neither, so a copied example fails
    id: 'inp-buttons-only',
    path: 'CoreWebVitals/INP',
    docsPath: '/CoreWebVitals/INP',
    snippet: 'INP',
    fixture: 'inp-buttons.html',
    interactive: true,
    expect: { status: ['ok', 'tracking'], noTyping: true, minInteractions: 1 },
  },
]
