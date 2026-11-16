// What every call of a tool that loads a page shares: how its answer and its errors are written, the
// progress it reports and the limits that keep one page from holding up the others.
import { isMissingBrowser } from "../browser.js";
import { measureRuns } from "../runs.js";

export const STAGES = 3;
export const NAV_TIMEOUT_MS = 30000;
// How long a page load can keep its turn: far beyond the load and the wait, which have their own limits
// (30 s and 10 s), because a run that reaches this is not slow. A page whose main thread never yields
// answers no evaluation, and Playwright has no timeout for one, so it would hold up the queue for ever.
export const CALL_LIMIT_MS = 120000;

// The result of a tool, as structured content for clients that read it and as the same JSON in text
// for those that do not
export const toolResult = (data) => ({ structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] });

// A failure the model reads and can act on: a wrong argument or a page that does not load. It is
// still a result of the tool, not an error of the protocol.
export const toolError = (text) => ({ isError: true, content: [{ type: "text", text }] });

export const firstLine = (message) => message.split("\n")[0];

// A client that wants progress sends a token with the call; the stages of each run go to it, numbered
// across the runs. Returns the reporter of a run, by its number.
export function progressFor(ctx, runs) {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  const total = STAGES * runs;
  return (run) => (stage, message) =>
    progressToken === undefined
      ? undefined
      : ctx.mcpReq.notify({
          method: "notifications/progress",
          params: { progressToken, progress: (run - 1) * STAGES + stage, total, message: runs > 1 ? `Run ${run} of ${runs}: ${message}` : message },
        });
}

// The report of a call that waits for its turn, for a client that wants progress: how many calls are
// ahead. Progress has to grow with each report, and the stages of a run start at 1, so it stays below 1.
export function waitProgressFor(ctx, total) {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) return undefined;
  let reports = 0;
  return (ahead) => {
    reports++;
    const message = `Waiting for its turn: ${ahead} ${ahead === 1 ? "call" : "calls"} ahead`;
    return ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress: reports / (reports + 1), ...(total ? { total } : {}), message } });
  };
}

export const stoppedAnswering = (limitMs) => `The page did not answer within ${limitMs / 1000} seconds`;

// A page that stopped answering is closed, and the runs left of the call would only hold up the queue
export class PageStoppedError extends Error {}
export const endsTheCall = (err) => isMissingBrowser(err) || err instanceof PageStoppedError;

// A page load measured once, or `count` times with the median run as the answer, as --runs of the CLI.
// `measure` gets the signal of its run, which closes its Chromium. When the client gives up (a cancel,
// its timeout, or leaving), the run in progress ends and the runs left never start.
export async function measurePage(measure, count, ctx, limitMs) {
  const progress = progressFor(ctx, count);
  const measureRun = async (run) => {
    const limit = AbortSignal.timeout(limitMs);
    let measured;
    try {
      measured = await measure(progress(run), AbortSignal.any([ctx.mcpReq.signal, limit]));
    } catch (err) {
      if (!limit.aborted) throw err;
    }
    // The runner keeps a failed evaluation as a result, and closing Chromium fails every one
    if (limit.aborted) throw new PageStoppedError(stoppedAnswering(limitMs));
    return measured;
  };
  if (count === 1) return measureRun(1);
  const { payload, runs, errors } = await measureRuns(measureRun, count, { isFatal: endsTheCall, signal: ctx.mcpReq.signal });
  if (!payload) throw new Error(`Every run failed: ${[...new Set(errors.map(firstLine))].join("; ")}`);
  return { ...payload, runs };
}
