import { cpus } from "node:os";

// The machine a measurement ran on, kept in its conditions, so --baseline can say when two were measured
// on machines of different speed: timings move with the CPU as much as with the page.

const WINDOW_MS = 40;
const WINDOWS = 5;

// A fixed piece of work: build a string and sort an array, as the benchmark index of Lighthouse builds
// strings in the page. Its result is returned so the engine cannot drop it.
function work() {
  let s = "";
  for (let i = 0; i < 2000; i++) s += String.fromCharCode(97 + (i % 26));
  const numbers = Array.from({ length: 200 }, (_, i) => (i * 7919) % 211);
  numbers.sort((a, b) => a - b);
  return s.length + numbers[0];
}

// How many times the work fits in 40 ms, the best of five windows: the first one also warms up the
// engine, and the best one is the least touched by other work of the machine. In Node, so --cpu, which
// throttles the page, leaves it alone: it measures the machine. Alone, ten in a row vary by about 6 %.
export function benchmarkIndex() {
  let best = 0;
  let sink = 0;
  for (let w = 0; w < WINDOWS; w++) {
    const end = performance.now() + WINDOW_MS;
    let count = 0;
    while (performance.now() < end) {
      sink += work();
      count++;
    }
    best = Math.max(best, count);
  }
  return sink > 0 ? best : 0;
}

export function machineOf({ cores = cpus().length, benchmark = benchmarkIndex } = {}) {
  return { cores, benchmarkIndex: benchmark() };
}
