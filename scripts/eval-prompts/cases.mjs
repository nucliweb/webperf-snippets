import { SCROLL_SCRIPT } from '../../lib/snippet-prompt.mjs'

// Each case gives an agent the Copy prompt of one snippet and a local page with a known result.
// `fixture` is looked up in scripts/eval-prompts/fixtures first and then in cli/tests/fixtures.
//
// expect.status            statuses the CLI result can have
// expect.reference         compare the agent's value with a run of the CLI by the runner (± tolerance in
//                          the unit of the result), with `interactions` for a tracking snippet
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
]
