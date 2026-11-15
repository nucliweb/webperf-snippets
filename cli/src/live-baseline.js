import { MAX_RUNS, summarizeRuns } from "./runs.js";
import { inconclusiveForTheWorse, RUNS_FOR_STATISTICS } from "./baseline.js";
import { isHttpUrl } from "./url.js";

// A live baseline: --baseline with the URL of a page, measured in the same run as the page it compares
// with, instead of a file saved earlier. The runs of both pages alternate, baseline first, so a machine
// that slows down or speeds up during the measurement, with a process in the background, moves both
// sides alike instead of the one it happened to be measuring.

// A value of --baseline that starts with http:// or https:// is a URL; anything else is a file
export const isLiveBaseline = (value) => typeof value === "string" && /^https?:\/\//i.test(value);

// The options of a live baseline, checked before the browser opens. Returns whether the baseline is live
// and --max-runs as a number; throws an error whose message says what to give.
export function parseLiveBaseline({ baseline, matrix, runs, maxRuns }) {
  const live = isLiveBaseline(baseline);
  if (live && matrix) {
    throw new Error("A live baseline (--baseline with a URL) compares one page, so it does not take --matrix: give --matrix the --json output of an earlier matrix");
  }
  if (live && !isHttpUrl(baseline)) {
    throw new Error(`Invalid --baseline "${baseline}": a live baseline is an http or https URL, such as https://example.com or http://localhost:3000`);
  }
  if (maxRuns == null) return { live, maxRuns: undefined };
  if (!live) throw new Error("--max-runs needs a live baseline: --baseline with the URL of the page to compare with, such as --baseline https://example.com");
  if (runs == null) throw new Error("--max-runs needs --runs, the runs of each page before it decides whether to measure more, such as --runs 5 --max-runs 7");
  // Without statistics no metric is inconclusive, so the option would be accepted and never act
  if (runs < RUNS_FOR_STATISTICS) {
    throw new Error(`--max-runs needs --runs ${RUNS_FOR_STATISTICS} or more: with fewer runs a side there are no statistics, so no metric is inconclusive and nothing more would be measured`);
  }
  const count = /^\d+$/.test(maxRuns.trim()) ? Number(maxRuns) : NaN;
  if (!(count > runs && count <= MAX_RUNS)) {
    throw new Error(`Invalid --max-runs "${maxRuns}": use a whole number greater than --runs (${runs}) and at most ${MAX_RUNS}, such as ${Math.min(runs + 2, MAX_RUNS)}`);
  }
  return { live, maxRuns: count };
}

const SIDES = ["baseline", "current"];

// Measures both pages `runs` times each, alternating baseline and current, one run after the other, and
// compares them with `compare(baseline, current)`, which takes the summaries of summarizeRuns. With
// maxRuns, when a metric is inconclusive for the worse, it measures more pairs up to maxRuns and compares
// once more with every run. It decides exactly twice at most, after `runs` and after `maxRuns`, never
// after each added pair: a p-value read after every pair would find a change by chance. A run that fails
// is kept as { error } on its side, as measureRuns does, unless isFatal says the next run would fail the
// same way. When every run of a side failed there is nothing to compare, and the comparison is null.
export async function measureLiveBaseline(measure, { runs, maxRuns, medianBy, compare, isFatal = () => false, onRun = () => {}, onExtend = () => {} }) {
  const measured = { baseline: [], current: [] };
  const measurePairs = async (first, last) => {
    for (let run = first; run <= last; run++) {
      for (const [i, side] of SIDES.entries()) {
        onRun({ side, run, runs: last, step: (run - 1) * SIDES.length + i + 1, steps: last * SIDES.length });
        try {
          measured[side].push(await measure(side, run));
        } catch (err) {
          if (isFatal(err)) throw err;
          measured[side].push({ error: err.message });
        }
      }
    }
  };
  const decide = () => {
    const baseline = summarizeRuns(measured.baseline, { medianBy });
    const current = summarizeRuns(measured.current, { medianBy });
    return { baseline, current, comparison: baseline.payload && current.payload ? compare(baseline, current) : null };
  };

  await measurePairs(1, runs);
  const first = decide();
  const worse = first.comparison && maxRuns > runs ? inconclusiveForTheWorse(first.comparison) : [];
  if (worse.length === 0) return first;

  const extended = { after: runs, metrics: worse };
  onExtend({ ...extended, maxRuns });
  await measurePairs(runs + 1, maxRuns);
  return { ...decide(), extended };
}
