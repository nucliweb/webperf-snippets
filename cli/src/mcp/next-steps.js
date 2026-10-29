import { RULES, nextSteps } from "../decision-tree.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";

const isTrackingPath = (path) => isTrackingSnippet(path, loadSnippet(path));

// The call of the tool that runs a snippet: a tracking snippet needs a page the agent interacts with. A
// snippet waits as long as the run that called for it, so it reads the same paint.
const callFor = ({ path, reason, url, viewport, waitMs, isTracking }) =>
  isTracking(path)
    ? { tool: "open_page", args: { url, track: [path], viewport }, reason }
    : { tool: "run_snippet", args: { url, snippet: path, viewport, ...(waitMs !== undefined ? { waitMs } : {}) }, reason };

// The follow-ups the decision tree of the CLI asks for, as the calls an agent makes next. The rules name
// the steps of a workflow (LCP, CLS, TTFB, FCP), which are the scripts of the snippets, so a result of
// run_snippet, whose id is Category/Name, is matched by its script. `ran` leaves out what already ran.
export function followUpCalls({ results, url, viewport, waitMs, ran = [], rules = RULES, isTracking = isTrackingPath }) {
  const named = results.map((r) => ({ ...r, id: r.script ?? r.id }));
  return nextSteps(named, rules, ran).map(({ path, reason }) => callFor({ path, reason, url, viewport, waitMs, isTracking }));
}

// The steps a workflow skipped because they measure clicks and key presses, in one page to open
export function trackingCall({ paths, url, viewport }) {
  return {
    tool: "open_page",
    args: { url, track: paths, viewport },
    reason: "These steps measure clicks and key presses: open the page with them, interact with it and read them with read_results",
  };
}
