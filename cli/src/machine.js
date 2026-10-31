import { arch as osArch, cpus as osCpus, totalmem as osTotalmem } from "node:os";

// The machine a measurement ran on, kept in its conditions, so --baseline can say when two were measured
// on different machines: timings move with the CPU as much as with the page. The machine is told apart by
// what the operating system reports of it. The benchmark index only informs: on the same machine it
// moves by 40 % with its load and with the cores the system picks (performance or efficiency).

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

export function machineOf({ cpus = osCpus, arch = osArch(), totalmem = osTotalmem, benchmark = benchmarkIndex } = {}) {
  const list = cpus();
  return { cpu: list[0]?.model ?? "unknown", cores: list.length, arch, memoryGB: Math.round(totalmem() / 2 ** 30), benchmarkIndex: benchmark() };
}
