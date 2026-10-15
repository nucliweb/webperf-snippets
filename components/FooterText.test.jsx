import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import pkg from "../package.json";
import { FooterText } from "./FooterText";

const html = renderToStaticMarkup(<FooterText />);

describe("FooterText", () => {
  it("gives the version of the collection, the license and the author", () => {
    expect(html).toContain(`v${pkg.version}`);
    expect(html).toContain('href="https://github.com/nucliweb/webperf-snippets/blob/main/LICENSE"');
    expect(html).toContain(`© ${new Date().getFullYear()}`);
    expect(html).toContain('href="https://twitter.com/nucliweb"');
  });

  it("links the repository, the npm package, the changelog and llms.txt in a footer navigation", () => {
    expect(html).toMatch(/<nav aria-label="Footer"[^>]*>/);
    expect(html).toContain('href="https://github.com/nucliweb/webperf-snippets"');
    expect(html).toContain('href="https://www.npmjs.com/package/webperf-snippets"');
    expect(html).toContain('href="https://github.com/nucliweb/webperf-snippets/blob/main/CHANGELOG.md"');
    expect(html).toContain('href="/llms.txt"');
  });

  it("opens the other sites in a new tab and says so to screen readers", () => {
    const external = html.match(/<a [^>]*href="https:[^>]*>.*?<\/a>/g);
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain('<span class="wp-sr-only"> (opens in a new tab)</span>');
    }
    expect(html).toMatch(/<a href="\/llms\.txt">llms\.txt<\/a>/);
  });
});
