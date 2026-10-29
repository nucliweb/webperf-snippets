import { describe, it, expect } from "vitest";
import { followUpCalls, trackingCall } from "../../src/mcp/next-steps.js";

const url = "https://example.test/";
const isTracking = (path) => path === "Interaction/Layout-Shift-Loading-and-Interaction";

describe("followUpCalls", () => {
  it("turns the follow-ups of the decision tree into the call of the tool that runs each one", () => {
    const results = [{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok", value: 3100, details: { elementType: "Text" } }];
    expect(followUpCalls({ results, url, viewport: "mobile", isTracking })).toEqual([
      {
        tool: "run_snippet",
        args: { url, snippet: "CoreWebVitals/LCP-Subparts", viewport: "mobile" },
        reason: expect.stringMatching(/LCP > 2\.5s/),
      },
    ]);
  });

  it("waits as long as the run that called for the follow-up, so it reads the same paint", () => {
    const results = [{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok", value: 3100 }];
    const [call] = followUpCalls({ results, url, viewport: "mobile", waitMs: 5000, isTracking });
    expect(call.args).toEqual({ url, snippet: "CoreWebVitals/LCP-Subparts", viewport: "mobile", waitMs: 5000 });
  });

  it("opens a page for a follow-up that records interactions", () => {
    const results = [{ id: "CoreWebVitals/CLS", script: "CLS", status: "ok", value: 0.15 }];
    expect(followUpCalls({ results, url, viewport: "desktop", isTracking })).toEqual([
      {
        tool: "open_page",
        args: { url, track: ["Interaction/Layout-Shift-Loading-and-Interaction"], viewport: "desktop" },
        reason: expect.stringMatching(/CLS > 0\.1/),
      },
    ]);
  });

  it("suggests nothing for a good result, an error, or a snippet that already ran", () => {
    expect(followUpCalls({ results: [{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok", value: 1200 }], url, viewport: "mobile", isTracking })).toEqual([]);
    expect(followUpCalls({ results: [{ id: "CoreWebVitals/LCP", script: "LCP", status: "error" }], url, viewport: "mobile", isTracking })).toEqual([]);
    const results = [{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok", value: 3100 }];
    expect(followUpCalls({ results, url, viewport: "mobile", isTracking, ran: ["CoreWebVitals/LCP-Subparts"] })).toEqual([]);
  });
});

describe("trackingCall", () => {
  it("opens one page with every step a workflow skipped because it needs interactions", () => {
    expect(trackingCall({ paths: ["CoreWebVitals/INP", "Interaction/Interactions"], url, viewport: "mobile" })).toEqual({
      tool: "open_page",
      args: { url, track: ["CoreWebVitals/INP", "Interaction/Interactions"], viewport: "mobile" },
      reason: expect.stringMatching(/interact/),
    });
  });
});
