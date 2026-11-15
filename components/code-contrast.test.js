import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The comments of a code block are text to read, so they need the 4.5:1 of WCAG 1.4.3 against the
// background of the block, which is the --wp-code-bg tint over the background of the page
const css = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8");
// The backgrounds of the page in each theme of the docs theme, as the browser computes them
const PAGE = { light: [250, 250, 250], dark: [17, 17, 17] };

const channel = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (value) => {
  const h = value.length === 4 ? [...value.slice(1)].map((c) => c + c).join("") : value.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

// --wp-code-bg is declared twice, for the light theme and then for the dark one
const tints = [...css.matchAll(/--wp-code-bg:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)].map((m) => m.slice(1).map(Number));
const background = (theme) => {
  const [r, g, b, alpha] = tints[theme === "light" ? 0 : 1];
  return [r, g, b].map((c, i) => alpha * c + (1 - alpha) * PAGE[theme][i]);
};
const commentColor = (theme) => {
  const selector = theme === "light" ? /(?<!\.dark )\.hljs-comment,\s*\.hljs-quote\s*\{\s*color:\s*(#[0-9a-f]{3,6})/i : /\.dark \.hljs-comment,\s*\.dark \.hljs-quote\s*\{\s*color:\s*(#[0-9a-f]{3,6})/i;
  return hex(css.match(selector)[1]);
};

describe("the comments of a code block", () => {
  it.each(["light", "dark"])("have a contrast of at least 4.5:1 in the %s theme", (theme) => {
    expect(tints).toHaveLength(2);
    expect(contrast(commentColor(theme), background(theme))).toBeGreaterThanOrEqual(4.5);
  });
});
