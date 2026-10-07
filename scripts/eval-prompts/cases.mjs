import { SCROLL_SCRIPT } from '../../lib/snippet-prompt.mjs'

// Each case gives an agent the Copy prompt of one snippet and a local page with a known result.
// `fixture` is looked up in scripts/eval-prompts/fixtures first and then in cli/tests/fixtures;
// `unreachable: true` gives a URL on a closed port instead.
//
// expect.status            statuses the CLI result can have
// expect.cliFails          the CLI cannot load the URL: every run must be on it, and no result is expected
// expect.noRun             the agent must not run the CLI (a case without a fixture gives no URL)
// expect.reference         compare the agent's value with a run of the CLI by the runner (± tolerance in
//                          the unit of the result), with `interactions` for a tracking snippet
// expect.details           values the `details` of the CLI result must have
// expect.mentions          { id, pattern } the report must match, for what the prompt asks it to say
// expect.judge             { id, question } a model answers about the report, for what no pattern can check
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
  {
    // Shifts happen only while scrolling, so the agent must run the scroll script of the prompt: a run
    // without it reports a CLS of 0 with status `tracking`
    id: 'cls-tracking-scroll',
    path: 'Interaction/Layout-Shift-Loading-and-Interaction',
    docsPath: '/Interaction/Layout-Shift-Loading-and-Interaction',
    snippet: 'Layout-Shift-Loading-and-Interaction',
    fixture: 'cls-on-scroll.html',
    interactive: true,
    expect: { status: ['ok'], reference: { tolerance: 0.05, interactions: SCROLL_SCRIPT } },
  },
  {
    // The CLI does not navigate back, so the prompt asks the agent to say that `no-blockers-detected`
    // is not a guarantee and to point to the test of DevTools. A clean page gives that result.
    id: 'bfcache-partial',
    path: 'Loading/Back-Forward-Cache',
    docsPath: '/Loading/Back-Forward-Cache',
    snippet: 'Back-Forward-Cache',
    fixture: 'index.html',
    expect: {
      status: ['ok'],
      details: { eligibility: 'no-blockers-detected' },
      mentions: [{ id: 'points-to-devtools', pattern: /DevTools[\s\S]*back[\s/-]*forward cache|back[\s/-]*forward cache[\s\S]*DevTools/i }],
      judge: [
        {
          id: 'no-eligibility-claim',
          question:
            'The CLI loaded the page once and did not navigate back, so `no-blockers-detected` only means that the checks on load found nothing. Does the report make clear that this is not a guarantee that the page is restored from the back/forward cache, without stating as a fact that the page is eligible or will be restored?',
        },
      ],
    },
  },
  {
    // The prompt as it is copied, with no URL: it says "Ask for the URL if you do not have it", so the
    // agent must end asking for one instead of measuring a page it chooses, such as example.com
    id: 'no-url',
    path: 'CoreWebVitals/LCP',
    docsPath: '/CoreWebVitals/LCP',
    snippet: 'LCP',
    expect: { noRun: true, mentions: [{ id: 'asks-for-url', pattern: /\b(URL|page)\b[^\n]*\?/i }] },
  },
  {
    // The prompt says "If the CLI cannot run, stop and report the error instead of measuring another
    // way". The URL is on a closed port: the agent must report ERR_CONNECTION_REFUSED, not measure
    // another page, write its own measurement or give an estimate.
    id: 'unreachable-url',
    path: 'CoreWebVitals/LCP',
    docsPath: '/CoreWebVitals/LCP',
    snippet: 'LCP',
    unreachable: true,
    expect: {
      cliFails: true,
      mentions: [{ id: 'reports-error', pattern: /ERR_CONNECTION_REFUSED|connection refused/i }],
      judge: [
        {
          id: 'no-estimate',
          question:
            'The CLI could not load the page, so there is no measurement. Does the report avoid giving, estimating or guessing an LCP value or rating for the page, and present the failure as the result?',
        },
      ],
    },
  },
]
