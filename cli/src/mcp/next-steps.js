import { RULES, nextSteps } from "../decision-tree.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";
import { throttlingOf } from "../throttling.js";

const isTrackingPath = (path) => isTrackingSnippet(path, loadSnippet(path));

// The call of the tool that runs a snippet: a tracking snippet needs a page the agent interacts with. A
// snippet waits as long as the run that called for it, so it reads the same paint, and loads under its
// throttling, so it measures the same page.
const callFor = ({ path, reason, url, viewport, waitMs, cpu, network, isTracking }) =>
  isTracking(path)
    ? { tool: "open_page", args: { url, track: [path], viewport, ...throttlingOf({ cpu, network }) }, reason }
    : { tool: "run_snippet", args: { url, snippet: path, viewport, ...(waitMs !== undefined ? { waitMs } : {}), ...throttlingOf({ cpu, network }) }, reason };

// The follow-ups the decision tree of the CLI asks for, as the calls an agent makes next. The rules name
// the steps of a workflow (LCP, CLS, TTFB, FCP), which are the scripts of the snippets, so a result of
// run_snippet, whose id is Category/Name, is matched by its script. `ran` leaves out what already ran.
export function followUpCalls({ results, url, viewport, waitMs, cpu, network, ran = [], rules = RULES, isTracking = isTrackingPath }) {
  const named = results.map((r) => ({ ...r, id: r.script ?? r.id }));
  return nextSteps(named, rules, ran).map(({ path, reason }) => callFor({ path, reason, url, viewport, waitMs, cpu, network, isTracking }));
}

// The steps a workflow skipped because they measure clicks and key presses, in one page to open
export function trackingCall({ paths, url, viewport, cpu, network }) {
  return {
    tool: "open_page",
    args: { url, track: paths, viewport, ...throttlingOf({ cpu, network }) },
    reason: "These steps measure clicks and key presses: open the page with them, interact with it and read them with read_results",
  };
}

// A click the agent completes: only the agent can choose the element of the page to click
const CLICK_TO_COMPLETE = { action: "click", selector: "<selector of the element to click>" };

// The steps a workflow skipped because they measure clicks and key presses. First the workflow again
// with interactions, which measures them in one call, with the runs and the baseline of a page load; then
// a page to open with them, for an agent that explores the page step by step.
export function inputStepsCalls({ workflow, paths, url, viewport, waitMs, cpu, network }) {
  return [
    {
      tool: "run_workflow",
      args: { url, workflow, viewport, ...(waitMs !== undefined ? { waitMs } : {}), ...throttlingOf({ cpu, network }), interactions: [CLICK_TO_COMPLETE] },
      reason:
        "These steps measure clicks and key presses: run the workflow again with interactions, a click or type step on an element of the page in place of this selector; runs and baseline work with them",
    },
    trackingCall({ paths, url, viewport, cpu, network }),
  ];
}
