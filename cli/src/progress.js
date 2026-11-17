// The progress of a run on a terminal: one line under what the command has said, rewritten at each
// stage of the run (Chromium opens, the page loads, the snippets are evaluated), with the time the run
// has taken and, among several runs, which one it is and about how long is left.

const duration = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);

// `done` runs ended of `total`, each `averageMs` long. What is left counts the run in progress, less
// what it has taken, and is never under a second: a run that is slower than the others still has to end
export function progressLine({ message, elapsedMs, done = 0, total = 1, averageMs }) {
  const stage = `${message}… ${(elapsedMs / 1000).toFixed(1)} s`;
  if (total <= 1) return stage;
  const left = averageMs ? `, about ${duration(Math.max(averageMs * (total - done) - elapsedMs, 1000))} left` : "";
  return `${stage} · run ${done + 1} of ${total}${left}`;
}

const CLEAR_LINE = "\r\x1b[2K";

// A line that is rewritten in place. Only on a terminal: a pipe, a file or the log of a CI job would
// keep every version of it, so there it writes nothing and stderr stays as it was. The line is cut to
// the width of the terminal, since a line that wraps cannot be rewritten.
export function createStatus(stream = process.stderr) {
  if (!stream.isTTY) return { show() {}, clear() {} };
  let shown = false;
  return {
    show(text) {
      const width = (stream.columns ?? 80) - 1;
      stream.write(CLEAR_LINE + (text.length > width ? `${text.slice(0, width - 1)}…` : text));
      shown = true;
    },
    clear() {
      if (shown) stream.write(CLEAR_LINE);
      shown = false;
    },
  };
}

// The last stage of a run, as the runner numbers them
const LAST_STAGE = 3;

// What runs `turn` again and again while a stage lasts; it does not keep the process alive
const everyQuarterSecond = () => {
  let timer;
  return {
    start(turn) {
      timer = setInterval(turn, 250);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
};

// Follows the stages the runner reports (its onProgress) and shows them on the status line, with the
// time of the run running in between. A run starts at its first stage and ends at its last one; the
// runs that ended give the time of the ones left, when the command says how many it expects. `stop`
// ends the line: the command calls it before it writes anything else.
export function createProgress({ status, now = Date.now, ticker = everyQuarterSecond() }) {
  let total = 1;
  let done = 0;
  let spentMs = 0;
  let startedAt;
  let current;
  let ticking = false;
  const line = (elapsedMs) => progressLine({ message: current, elapsedMs, done, total, averageMs: done ? spentMs / done : undefined });
  const rest = () => {
    if (ticking) ticker.stop();
    ticking = false;
  };
  return {
    expectRuns(count) {
      total = count;
    },
    onStage(stage, message) {
      current = message;
      const at = now();
      if (stage === 1 || startedAt === undefined) startedAt = at;
      const elapsedMs = at - startedAt;
      status.show(line(elapsedMs));
      if (stage === LAST_STAGE) {
        done++;
        spentMs += elapsedMs;
        rest();
        return;
      }
      if (!ticking) ticker.start(() => status.show(line(now() - startedAt)));
      ticking = true;
    },
    stop() {
      rest();
      status.clear();
    },
  };
}
