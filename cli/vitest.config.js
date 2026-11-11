import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// The e2e tests launch Chromium, the full Chromium in its headless mode: seven processes and several
// hundred MB each. With a file per core, as vitest runs by default (the cores minus one), a machine of
// many cores saturates and the tests that read timings lose their margin. Four files at once at most on
// a machine of many cores, where a machine of ten cores takes about a third longer. In CI (GitHub sets
// CI), two: a runner of 4 cores with three files at once failed a test of timings in two runs of five,
// a different one each time (#413 on, until this change).
const cores = availableParallelism();

export default defineConfig({
  test: {
    maxWorkers: process.env.CI ? Math.min(2, cores) : Math.max(1, Math.min(4, cores - 1)),
  },
});
