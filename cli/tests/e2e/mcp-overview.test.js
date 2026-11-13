import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { startContractServers } from "../helpers/contract.js";
import { auditWorkflow } from "../../src/workflows/audit.js";

// The tools that measure answer what the results found as the JSON of the CLI does: when the run
// started (date), how many snippets have errors, warnings or nothing to fix (overview) and every issue
// in one list, errors first (issues), whole or as summaries; and the run they keep has them too.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SEVERITY = ["error", "warning", "info"];
const WAIT_MS = 500;

let servers;
let client;

beforeAll(async () => {
  servers = await startContractServers();
}, 30000);

afterAll(() => servers?.close());

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
}

const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  return result.structuredContent;
};
const keptRun = async (runId) => JSON.parse((await client.readResource({ uri: `webperf://runs/${runId}` })).contents[0].text);

function expectOverviewOf(answer, count) {
  expect(answer.date).toMatch(ISO);
  expect(answer.overview.snippets).toBe(count);
  expect(answer.overview.withErrors + answer.overview.withWarnings + answer.overview.withNothingToFix).toBe(count);
  const order = answer.issues.map((i) => SEVERITY.indexOf(i.severity));
  expect(order).toEqual([...order].sort((a, b) => a - b));
}

describe("the overview and the issues of the tools that measure", () => {
  it.each(["summary", "full"])("run_workflow gives them with %s results, with the path of each step", async (detail) => {
    await connect();
    const answer = await call("run_workflow", { url: `${servers.base}/seeded`, workflow: "audit", waitMs: WAIT_MS, detail });
    expect(answer.detail).toBe(detail);
    expectOverviewOf(answer, auditWorkflow.steps.length);
    expect(answer.overview.withErrors).toBeGreaterThan(0);
    const pathOf = Object.fromEntries(auditWorkflow.steps.map((s) => [s.id, s.path]));
    for (const issue of answer.issues) expect(issue.path, issue.id).toBe(pathOf[issue.id]);
    expect(answer.issues).toContainEqual(expect.objectContaining({ id: "render-blocking", severity: "error", code: expect.any(String) }));

    // The run it keeps, the baseline of a later one, is the JSON of the CLI
    const kept = await keptRun(answer.runId);
    expect(kept).toMatchObject({ date: answer.date, overview: answer.overview, issues: answer.issues });
  }, 90000);

  it("run_snippet gives them for its one result", async () => {
    await connect();
    const answer = await call("run_snippet", { url: `${servers.base}/seeded`, snippet: "render-blocking", waitMs: WAIT_MS });
    expectOverviewOf(answer, 1);
    expect(answer.overview).toEqual({ snippets: 1, withErrors: 1, withWarnings: 0, withNothingToFix: 0 });
    for (const issue of answer.issues) expect(issue).toMatchObject({ id: "Loading/Find-render-blocking-resources", path: "Loading/Find-render-blocking-resources" });
    expect((await keptRun(answer.runId)).issues).toEqual(answer.issues);
  }, 60000);
});
