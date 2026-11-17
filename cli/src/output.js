import { MissingBrowserError } from "./browser.js";
import { measureRuns } from "./runs.js";
import { createProgress, createStatus } from "./progress.js";

// The stage of the run in progress, on a line of its own when stderr is a terminal (progress.js). What
// the command writes takes its place: the line stops before a line of stderr and before the report
export const progress = createProgress({ status: createStatus(process.stderr) });

// A pipe takes 64 KB at a time and process.exit() does not wait for the rest, so a report larger than
// that reached `| jq` or a script cut short. The report is written whole before the code after it exits
export const writeReport = (text) => {
  progress.stop();
  return new Promise((resolve) => process.stdout.write(text, () => resolve()));
};
// A reader that closes the pipe early, as head does, ends the writing, not the run: no error, and the
// exit code is the one of the report
process.stdout.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});

// stdout is the report; what the command says while it runs, and its warnings, go to stderr
export const say = (line) => {
  progress.stop();
  process.stderr.write(`${line}\n`);
};

// Each run is reported on stderr as it starts, so stdout keeps only the report
export const measureRunsWithProgress = (measure, count, medianBy, progress) =>
  measureRuns(
    (i) => {
      say(progress(i));
      return measure();
    },
    count,
    { medianBy, isFatal: (err) => err instanceof MissingBrowserError }
  );
