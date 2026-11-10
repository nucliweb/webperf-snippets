import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// The e2e tests launch Chromium, the full Chromium in its headless mode: seven processes and several
// hundred MB each. With a file per core, as vitest runs by default (the cores minus one), a machine of
// many cores saturates and the tests that read timings lose their margin. Four files at once at most:
// a runner of GitHub (4 cores) keeps its three, and a machine of ten cores takes about a third longer.
export default defineConfig({
  test: {
    maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
  },
});
