// Each case gives an agent the Copy prompt of one snippet and a local page with a known result.
// `fixture` is a page of cli/tests/fixtures.
//
// expect.status            statuses the CLI result can have
// expect.reference         compare the agent's value with a run of the CLI by the runner (± tolerance, ms)

export const CASES = [
  {
    id: 'lcp-one-shot',
    path: 'CoreWebVitals/LCP',
    docsPath: '/CoreWebVitals/LCP',
    snippet: 'LCP',
    fixture: 'observer-lcp.html',
    expect: { status: ['ok'], reference: { tolerance: 200 } },
  },
]
