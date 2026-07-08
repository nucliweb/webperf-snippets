import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { runSnippets } from "../../src/runner.js";

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body></body></html>");
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
  10000
);

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    })
);

describe("runSnippets — timeout", () => {
  it("fails when a snippet hangs", async () => {
    const items = [{ id: "hang", path: "test-hang", source: "(() => { while(true) {} })()" }];
    const { results } = await runSnippets({
      url: baseUrl,
      items,
      waitMs: 500,
      evaluateTimeout: 1000,
    });

    expect(results[0].status).toBe("error");
    expect(results[0].error).toContain("Snippet evaluation timed out");
  });
});
