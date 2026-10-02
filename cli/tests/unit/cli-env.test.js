import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cliEnv } from "../helpers/cli-env.js";

const KEYS = ["CRUX_API_KEY", "PERF_REVIEWS_API_KEY", "WEBPERF_CRUX_ENDPOINT"];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) process.env[k] = `from-the-shell-${k}`;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("cliEnv", () => {
  it("blanks the variables that make the CLI call an external service", () => {
    const env = cliEnv();
    for (const k of KEYS) expect(env[k]).toBe("");
  });

  it("keeps the rest of the environment so the CLI can still run", () => {
    expect(cliEnv().PATH).toBe(process.env.PATH);
  });

  it("lets a test set one of the variables on purpose", () => {
    const env = cliEnv({ CRUX_API_KEY: "test-key" });
    expect(env.CRUX_API_KEY).toBe("test-key");
    expect(env.PERF_REVIEWS_API_KEY).toBe("");
  });
});
