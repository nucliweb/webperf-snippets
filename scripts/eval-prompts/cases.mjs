import { SCROLL_SCRIPT } from '../../lib/snippet-prompt.mjs'

// Each case gives an agent the Copy prompt of one snippet and a local page with a known result.
// `fixture` is looked up in scripts/eval-prompts/fixtures first and then in cli/tests/fixtures.
//
// expect.status            statuses the CLI result can have
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
]
