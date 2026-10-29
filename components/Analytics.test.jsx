import { describe, it, expect } from "vitest";
import { Children } from "react";
import { Analytics } from "./Analytics";

const scripts = () => Children.toArray(Analytics().props.children);
const bySrc = (part) => scripts().find((s) => s.props.src?.includes(part));
const inline = () => scripts().find((s) => s.props.id === "google-analytics");

describe("Analytics", () => {
  // The library of Google Analytics took about 200 ms of main thread on a mobile CPU while the page loaded
  it("loads the library of Google Analytics once the browser is idle after load", () => {
    expect(bySrc("googletagmanager.com/gtag/js").props.strategy).toBe("lazyOnload");
  });

  // gtag() pushes to dataLayer, which the library sends when it loads, so no event is lost before
  it("defines gtag() and its queue right away, so the events of the copy buttons wait for the library", () => {
    expect(inline().props.strategy ?? "afterInteractive").toBe("afterInteractive");
    expect(inline().props.children).toMatch(/window\.dataLayer = window\.dataLayer \|\| \[\]/);
    expect(inline().props.children).toMatch(/function gtag\(\)\{dataLayer\.push\(arguments\)\}/);
  });

  // The domain of DebugBear was taken over (2026-10-29), so its RUM script could serve anything
  it("does not load the RUM script of DebugBear", () => {
    expect(bySrc("debugbear.com")).toBeUndefined();
  });
});
