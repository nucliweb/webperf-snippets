import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACTION_DIR = join(HERE, "../../../.github/actions/webperf-snippets");
const RUN_SH = join(ACTION_DIR, "run.sh");
const BIN = join(HERE, "../../src/bin.js");

let dir;
let pageServer;
let pageUrl;
let fakeCli;
let outputFile;
let summaryFile;
let argsFile;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "action-"));
  fakeCli = join(dir, "fake-cli.mjs");
  writeFileSync(
    fakeCli,
    `import { writeFileSync } from "node:fs";
writeFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
process.stdout.write(process.env.FAKE_MARKDOWN ?? "## fake results");
process.exit(Number(process.env.FAKE_EXIT ?? 0));
`
  );
  await new Promise((resolve) => {
    pageServer = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(readFileSync(join(HERE, "../fixtures/index.html")));
    });
    pageServer.listen(0, "127.0.0.1", () => {
      pageUrl = `http://127.0.0.1:${pageServer.address().port}`;
      resolve();
    });
  });
}, 10000);

afterAll(() => {
  pageServer.closeAllConnections();
  return new Promise((resolve) => pageServer.close(resolve));
});

beforeEach(() => {
  outputFile = join(dir, `output-${Math.random()}`);
  summaryFile = join(dir, `summary-${Math.random()}`);
  argsFile = join(dir, `args-${Math.random()}.json`);
  writeFileSync(outputFile, "");
  writeFileSync(summaryFile, "");
});

function runAction(env = {}) {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [RUN_SH],
      {
        env: {
          PATH: process.env.PATH,
          WEBPERF_CMD: `node ${fakeCli}`,
          WEBPERF_URL: "https://example.com",
          WEBPERF_WORKFLOW: "core-web-vitals",
          WEBPERF_BUDGET_LCP: "2500",
          WEBPERF_BUDGET_CLS: "0.1",
          WEBPERF_FAIL_ON_BUDGET: "false",
          GITHUB_OUTPUT: outputFile,
          GITHUB_STEP_SUMMARY: summaryFile,
          FAKE_ARGS_FILE: argsFile,
          ...env,
        },
      },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })
    );
  });
}

// Reads $GITHUB_OUTPUT the way the runner does: `name=value` lines and
// `name<<DELIMITER` blocks that end at the first line equal to the delimiter.
function parseOutputs(text) {
  const outputs = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const heredoc = line.match(/^([^=<]+)<<(.+)$/);
    if (heredoc) {
      const [, name, delimiter] = heredoc;
      const body = [];
      i++;
      while (i < lines.length && lines[i] !== delimiter) body.push(lines[i++]);
      outputs[name] = body.join("\n");
    } else {
      const [name, ...rest] = line.split("=");
      outputs[name] = rest.join("=");
    }
  }
  return outputs;
}

const outputs = () => parseOutputs(readFileSync(outputFile, "utf8"));
const argsSeen = () => JSON.parse(readFileSync(argsFile, "utf8"));

describe("run.sh outputs", () => {
  it("exposes the markdown and the CLI exit code", async () => {
    const { code } = await runAction({ FAKE_MARKDOWN: "## Results\n| LCP | 1s |" });
    expect(code).toBe(0);
    expect(outputs()).toEqual({ markdown: "## Results\n| LCP | 1s |", "exit-code": "0" });
  });

  it("cannot be tricked into setting extra outputs by text from the page", async () => {
    const hostile = "line\nEOF\ninjected=pwned\nmarkdown<<EOF\nmore";
    await runAction({ FAKE_MARKDOWN: hostile });
    const result = outputs();
    expect(Object.keys(result).sort()).toEqual(["exit-code", "markdown"]);
    expect(result.markdown).toBe(hostile);
  });

  it("writes the markdown to the job summary", async () => {
    await runAction({ FAKE_MARKDOWN: "## Summary me" });
    expect(readFileSync(summaryFile, "utf8")).toContain("## Summary me");
  });

  it("prints text from the page between stop-commands markers", async () => {
    const { stdout } = await runAction({ FAKE_MARKDOWN: "::error::from the page" });
    const stop = stdout.match(/^::stop-commands::(\S+)$/m);
    expect(stop).not.toBeNull();
    const [, token] = stop;
    expect(stdout.indexOf(`::stop-commands::${token}`)).toBeLessThan(stdout.indexOf("::error::from the page"));
    expect(stdout.indexOf("::error::from the page")).toBeLessThan(stdout.indexOf(`::${token}::`));
  });
});

describe("run.sh exit status", () => {
  it("reports a budget violation in exit-code without failing the step by default", async () => {
    const { code } = await runAction({ FAKE_EXIT: "1" });
    expect(code).toBe(0);
    expect(outputs()["exit-code"]).toBe("1");
  });

  it("fails the step with the CLI exit code when fail-on-budget is true", async () => {
    const { code } = await runAction({ FAKE_EXIT: "1", WEBPERF_FAIL_ON_BUDGET: "true" });
    expect(code).toBe(1);
    expect(outputs()["exit-code"]).toBe("1");
  });

  it("does not fail when fail-on-budget is true and the budgets pass", async () => {
    const { code } = await runAction({ WEBPERF_FAIL_ON_BUDGET: "true" });
    expect(code).toBe(0);
  });
});

describe("run.sh arguments", () => {
  it("forwards the inputs as CLI flags and always asks for markdown", async () => {
    await runAction({ WEBPERF_WORKFLOW: "audit", WEBPERF_BUDGET_LCP: "3000", WEBPERF_BUDGET_CLS: "0.2" });
    expect(argsSeen()).toEqual([
      "https://example.com",
      "--workflow",
      "audit",
      "--markdown",
      "--budget-lcp",
      "3000",
      "--budget-cls",
      "0.2",
    ]);
  });

  it("omits a budget flag when its input is empty", async () => {
    await runAction({ WEBPERF_BUDGET_LCP: "", WEBPERF_BUDGET_CLS: "" });
    expect(argsSeen()).toEqual(["https://example.com", "--workflow", "core-web-vitals", "--markdown"]);
  });

  it("passes an input with shell syntax as plain text", async () => {
    const marker = join(dir, "pwned");
    const url = `https://example.com/$(touch ${marker});touch ${marker}`;
    await runAction({ WEBPERF_URL: url });
    expect(existsSync(marker)).toBe(false);
    expect(argsSeen()[0]).toBe(url);
  });
});

describe("run.sh with the real CLI", () => {
  it("measures a page and fails on a budget it cannot meet", async () => {
    const { code } = await runAction({
      WEBPERF_CMD: `node ${BIN}`,
      WEBPERF_URL: pageUrl,
      WEBPERF_BUDGET_LCP: "0",
      WEBPERF_FAIL_ON_BUDGET: "true",
    });
    expect(code).toBe(1);
    const result = outputs();
    expect(result["exit-code"]).toBe("1");
    expect(result.markdown).toContain("## WebPerf Results");
  }, 60000);
});

describe("action.yml", () => {
  const lines = readFileSync(join(ACTION_DIR, "action.yml"), "utf8").split("\n");

  it("only reads inputs through environment variables, never inside a script", () => {
    const offenders = lines.filter(
      (line) => line.includes("${{ inputs.") && !/^\s+WEBPERF_[A-Z_]+: \$\{\{ inputs\.[a-z-]+ \}\}$/.test(line)
    );
    expect(offenders).toEqual([]);
  });

  it("declares the url input as required and the markdown and exit-code outputs", () => {
    const text = lines.join("\n");
    expect(text).toMatch(/url:\n\s+description:.*\n\s+required: true/);
    expect(text).toMatch(/^\s+markdown:/m);
    expect(text).toMatch(/^\s+exit-code:/m);
  });
});
