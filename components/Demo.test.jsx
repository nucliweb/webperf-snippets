import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Demo } from "./Demo";
import heights from "./demo-heights.json";

describe("Demo", () => {
  it("reserves the height of its demo for narrow and wide columns before it loads", () => {
    const { mobile, desktop } = heights["cls-shifts.html"];
    const html = renderToStaticMarkup(<Demo src="/demos/cls-shifts.html" title="Layout shifts" />);
    expect(html).toContain(`--wp-demo-h-mobile:${mobile + 24}px`);
    expect(html).toContain(`--wp-demo-h-desktop:${desktop + 24}px`);
  });

  it("gives the iframe no fixed height until the demo reports one", () => {
    const html = renderToStaticMarkup(<Demo src="/demos/cls-shifts.html" title="Layout shifts" />);
    expect(html).not.toMatch(/[;"]height:/);
  });

  it("links to the demo so it can be opened on its own", () => {
    const html = renderToStaticMarkup(<Demo src="/demos/cls-shifts.html" title="Layout shifts" caption="Try it." />);
    expect(html).toContain('href="/demos/cls-shifts.html"');
    expect(html).toContain("Try it.");
  });
});
