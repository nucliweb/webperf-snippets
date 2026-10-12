import { describe, it, expect, afterEach } from "vitest";
import { trackEvent } from "./analytics";

describe("trackEvent", () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it("sends a Google Analytics event with its parameters", () => {
    const calls = [];
    globalThis.window = { gtag: (...args) => calls.push(args) };
    trackEvent("copy_prompt", { snippet: "CoreWebVitals/LCP" });
    expect(calls).toEqual([["event", "copy_prompt", { snippet: "CoreWebVitals/LCP" }]]);
  });

  it("does nothing when Google Analytics is not loaded, as with a blocker", () => {
    globalThis.window = {};
    expect(() => trackEvent("copy_snippet", { snippet: "Loading/TTFB" })).not.toThrow();
  });

  it("does nothing on the server", () => {
    expect(() => trackEvent("copy_snippet", { snippet: "Loading/TTFB" })).not.toThrow();
  });
});
