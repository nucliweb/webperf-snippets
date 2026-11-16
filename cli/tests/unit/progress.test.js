import { describe, it, expect } from "vitest";
import { createStatus, createProgress, progressLine } from "../../src/progress.js";

// A stream that records what is written to it, a terminal or not
const stream = (isTTY, columns = 80) => {
  const written = [];
  return { isTTY, columns, written, write: (text) => written.push(text) };
};
const CLEAR = "\r\x1b[2K";

describe("progressLine", () => {
  it("says the stage of the run and how long the run has taken", () => {
    expect(progressLine({ message: "Opening Chromium", elapsedMs: 0 })).toBe("Opening Chromium… 0.0 s");
    expect(progressLine({ message: "Page loaded, running the snippets", elapsedMs: 3240 })).toBe("Page loaded, running the snippets… 3.2 s");
  });

  it("names the run among several, before the first one ends", () => {
    expect(progressLine({ message: "Opening Chromium", elapsedMs: 100, done: 0, total: 3 })).toBe("Opening Chromium… 0.1 s · run 1 of 3");
  });

  it("estimates what is left from the runs that ended, the run in progress included", () => {
    // Two runs of 4 s done of 6, and 1 s into the third: 4 s × 4 runs left − 1 s
    expect(progressLine({ message: "Opening Chromium", elapsedMs: 1000, done: 2, total: 6, averageMs: 4000 })).toBe("Opening Chromium… 1.0 s · run 3 of 6, about 15 s left");
    expect(progressLine({ message: "Opening Chromium", elapsedMs: 0, done: 1, total: 31, averageMs: 10000 })).toBe("Opening Chromium… 0.0 s · run 2 of 31, about 5 min left");
  });

  it("does not promise less than the run in progress has already taken", () => {
    expect(progressLine({ message: "Snippets evaluated", elapsedMs: 9000, done: 1, total: 2, averageMs: 4000 })).toBe("Snippets evaluated… 9.0 s · run 2 of 2, about 1 s left");
  });
});

describe("createStatus", () => {
  it("writes nothing when the stream is not a terminal: a log or a pipe keeps what it had", () => {
    const out = stream(false);
    const status = createStatus(out);
    status.show("Opening Chromium… 0.0 s");
    status.clear();
    expect(out.written).toEqual([]);
  });

  it("rewrites one line on a terminal, and clears it once", () => {
    const out = stream(true);
    const status = createStatus(out);
    status.show("Opening Chromium… 0.0 s");
    status.show("Page loaded… 1.0 s");
    status.clear();
    status.clear();
    expect(out.written).toEqual([`${CLEAR}Opening Chromium… 0.0 s`, `${CLEAR}Page loaded… 1.0 s`, CLEAR]);
  });

  it("cuts the line to the width of the terminal, so it never wraps", () => {
    const out = stream(true, 20);
    createStatus(out).show("Page loaded, running the snippets… 3.2 s");
    expect(out.written[0]).toBe(`${CLEAR}Page loaded, runni…`);
    expect(out.written[0].length - CLEAR.length).toBe(19);
  });
});

describe("createProgress", () => {
  const shown = [];
  const status = { show: (line) => shown.push(line), clear: () => {} };
  const clock = (times) => () => times.shift();
  // A ticker the test turns by hand: `turn` is what the progress asked to run again and again
  const ticker = () => {
    const t = { turn: null, start: (fn) => (t.turn = fn), stop: () => (t.turn = null) };
    return t;
  };

  it("times each run from its first stage", () => {
    shown.length = 0;
    const progress = createProgress({ status, now: clock([1000, 3500, 4000]), ticker: ticker() });
    progress.onStage(1, "Opening Chromium");
    progress.onStage(2, "Page loaded, running the snippets");
    progress.onStage(3, "Snippets evaluated");
    expect(shown).toEqual(["Opening Chromium… 0.0 s", "Page loaded, running the snippets… 2.5 s", "Snippets evaluated… 3.0 s"]);
  });

  it("counts the runs that ended, and estimates what is left of the ones it expects", () => {
    shown.length = 0;
    const progress = createProgress({ status, now: clock([0, 4000, 4000, 5000]), ticker: ticker() });
    progress.expectRuns(3);
    progress.onStage(1, "Opening Chromium");
    progress.onStage(3, "Snippets evaluated");
    progress.onStage(1, "Opening Chromium");
    progress.onStage(2, "Page loaded, running the snippets");
    expect(shown).toEqual([
      "Opening Chromium… 0.0 s · run 1 of 3",
      "Snippets evaluated… 4.0 s · run 1 of 3",
      "Opening Chromium… 0.0 s · run 2 of 3, about 8 s left",
      "Page loaded, running the snippets… 1.0 s · run 2 of 3, about 7 s left",
    ]);
  });

  it("keeps the time of the stage running between two stages, and stops when the run ends", () => {
    shown.length = 0;
    const tick = ticker();
    const progress = createProgress({ status, now: clock([0, 1000, 2000, 2500]), ticker: tick });
    progress.onStage(1, "Opening Chromium");
    tick.turn();
    tick.turn();
    progress.onStage(3, "Snippets evaluated");
    expect(shown).toEqual(["Opening Chromium… 0.0 s", "Opening Chromium… 1.0 s", "Opening Chromium… 2.0 s", "Snippets evaluated… 2.5 s"]);
    expect(tick.turn).toBeNull();
  });

  it("stops and clears its line when the command writes something else", () => {
    const cleared = [];
    const tick = ticker();
    const progress = createProgress({ status: { show: () => {}, clear: () => cleared.push(true) }, now: clock([0]), ticker: tick });
    progress.onStage(1, "Opening Chromium");
    expect(tick.turn).not.toBeNull();
    progress.stop();
    expect(tick.turn).toBeNull();
    expect(cleared).toEqual([true]);
  });
});
