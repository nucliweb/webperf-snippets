import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LazyVideoPlayer } from "./LazyVideoPlayer";

const html = renderToStaticMarkup(<LazyVideoPlayer src="webperf-snippets/demo" width="1920" height="1080" title="How to save a snippet in DevTools" />);

describe("LazyVideoPlayer before it plays", () => {
  it("is a button that says what it plays, so the keyboard and a screen reader reach it", () => {
    expect(html).toMatch(/^<button type="button" aria-label="Play video: How to save a snippet in DevTools"/);
    expect(html).not.toContain("<video");
  });

  it("leaves the name to the button: the poster and the icon say nothing more", () => {
    expect(html).toMatch(/<img[^>]* alt=""/);
    expect(html).toMatch(/<svg[^>]* aria-hidden="true"/);
  });

  it("offers the poster at several widths, with the width of the column of the page", () => {
    const srcSet = html.match(/srcSet="([^"]+)"/)[1];
    const widths = [...srcSet.matchAll(/c_scale,w_(\d+)\/webperf-snippets\/demo\.jpg (\d+)w/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(widths.length).toBeGreaterThanOrEqual(3);
    expect(widths.every(([inUrl, described]) => inUrl === described)).toBe(true);
    expect(Math.min(...widths.map(([w]) => w))).toBeLessThanOrEqual(480);
    expect(html).toMatch(/sizes="\(min-width: \d+px\) \d+px, 100vw"/);
  });

  it("reserves the space of the video and loads the poster lazily", () => {
    expect(html).toContain("aspect-ratio:1920 / 1080");
    expect(html).toMatch(/<img[^>]* width="1920" height="1080"[^>]* loading="lazy"/);
  });
});
