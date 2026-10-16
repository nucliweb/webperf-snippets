import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPageSchemas, PageSchema } from "./PageSchema";

const BASE = "https://webperf-snippets.net";
const types = (schemas) => schemas.map((s) => s["@type"]);

const TTFB = {
  title: "Time to first byte (TTFB)",
  description: "Measures the time until the first byte of the document arrives.",
  snippets: ["Loading/TTFB", "Loading/TTFB-Sub-Parts"],
};

describe("buildPageSchemas", () => {
  it("adds nothing to the home page", () => {
    expect(buildPageSchemas("/", TTFB)).toEqual([]);
  });

  it("adds nothing to a page outside the snippet categories", () => {
    expect(buildPageSchemas("/which-snippet", TTFB)).toEqual([]);
    expect(buildPageSchemas("/CLI", TTFB)).toEqual([]);
  });

  // The categories have no page of their own, so the breadcrumb does not link to them
  it("adds nothing to a category path, which has no page", () => {
    expect(buildPageSchemas("/Loading", { title: "Loading", description: "", snippets: [] })).toEqual([]);
  });

  it("describes a snippet page with a breadcrumb, an article and the source code of each snippet", () => {
    const schemas = buildPageSchemas("/Loading/TTFB", TTFB);
    expect(types(schemas)).toEqual(["BreadcrumbList", "Article", "SoftwareSourceCode", "SoftwareSourceCode"]);
    expect(schemas[0].itemListElement.map((i) => [i.position, i.name, i.item])).toEqual([
      [1, "Home", BASE],
      [2, "Time to first byte (TTFB)", `${BASE}/Loading/TTFB`],
    ]);
  });

  it("gives the article the title and description of the page", () => {
    const [, article] = buildPageSchemas("/Loading/TTFB", TTFB);
    expect(article).toMatchObject({
      headline: "Time to first byte (TTFB)",
      description: "Measures the time until the first byte of the document arrives.",
      url: `${BASE}/Loading/TTFB`,
      isPartOf: { "@type": "WebSite", url: BASE },
    });
  });

  it("describes each snippet as JavaScript for the browser, with its source file, license and page", () => {
    const [, , ttfb, subParts] = buildPageSchemas("/Loading/TTFB", TTFB);
    expect(ttfb).toEqual({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "TTFB",
      description: "Measures the time until the first byte of the document arrives.",
      programmingLanguage: "JavaScript",
      runtimePlatform: "Web browser",
      codeRepository: "https://github.com/nucliweb/webperf-snippets",
      url: "https://github.com/nucliweb/webperf-snippets/blob/main/snippets/Loading/TTFB.js",
      license: "https://opensource.org/licenses/MIT",
      author: { "@type": "Person", name: "Joan León", url: "https://twitter.com/nucliweb" },
      subjectOf: { "@type": "WebPage", url: `${BASE}/Loading/TTFB` },
    });
    expect(subParts.name).toBe("TTFB Sub Parts");
    expect(subParts.url).toMatch(/snippets\/Loading\/TTFB-Sub-Parts\.js$/);
  });

  it("ignores a trailing slash", () => {
    expect(buildPageSchemas("/Loading/TTFB/", TTFB)).toEqual(buildPageSchemas("/Loading/TTFB", TTFB));
  });
});

describe("PageSchema", () => {
  it("renders one JSON-LD script per schema in the HTML of the page", () => {
    const html = renderToStaticMarkup(<PageSchema pathname="/Loading/TTFB" page={TTFB} />);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b["@type"])).toEqual(["BreadcrumbList", "Article", "SoftwareSourceCode", "SoftwareSourceCode"]);
  });

  it("renders nothing when no schema applies", () => {
    expect(renderToStaticMarkup(<PageSchema pathname="/" page={TTFB} />)).toBe("");
  });
});
