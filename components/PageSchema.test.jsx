import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPageSchemas, PageSchemaScripts } from "./PageSchema";

const BASE = "https://webperf-snippets.nucliweb.net";
const types = (schemas) => schemas.map((s) => s["@type"]);

describe("buildPageSchemas", () => {
  it("adds nothing to the home page", () => {
    expect(buildPageSchemas("/")).toEqual([]);
  });

  it("adds nothing to a page outside the snippet categories", () => {
    expect(buildPageSchemas("/which-snippet")).toEqual([]);
    expect(buildPageSchemas("/CLI")).toEqual([]);
  });

  it("describes a category page with a breadcrumb and no article", () => {
    const schemas = buildPageSchemas("/Loading");
    expect(types(schemas)).toEqual(["BreadcrumbList"]);
    expect(schemas[0].itemListElement.map((i) => [i.position, i.name, i.item])).toEqual([
      [1, "Home", BASE],
      [2, "Loading", `${BASE}/Loading`],
    ]);
  });

  it("describes a snippet page with a breadcrumb and an article", () => {
    const schemas = buildPageSchemas("/Loading/TTFB");
    expect(types(schemas)).toEqual(["BreadcrumbList", "Article"]);
    expect(schemas[0].itemListElement.map((i) => [i.position, i.name, i.item])).toEqual([
      [1, "Home", BASE],
      [2, "Loading", `${BASE}/Loading`],
      [3, "TTFB", `${BASE}/Loading/TTFB`],
    ]);
    expect(schemas[1]).toMatchObject({
      headline: "TTFB",
      url: `${BASE}/Loading/TTFB`,
      isPartOf: { "@type": "WebSite", url: BASE },
    });
  });

  it("uses the human label of the category and spaces for the hyphens of the page name", () => {
    const schemas = buildPageSchemas("/CoreWebVitals/LCP-Subparts");
    expect(schemas[0].itemListElement[1].name).toBe("Core Web Vitals");
    expect(schemas[1].headline).toBe("LCP Subparts");
  });

  it("ignores a trailing slash", () => {
    expect(buildPageSchemas("/Loading/TTFB/")).toEqual(buildPageSchemas("/Loading/TTFB"));
  });
});

describe("PageSchemaScripts", () => {
  it("renders one JSON-LD script per schema in the HTML of the page", () => {
    const html = renderToStaticMarkup(<PageSchemaScripts pathname="/Loading/TTFB" />);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b["@type"])).toEqual(["BreadcrumbList", "Article"]);
  });

  it("renders nothing when there is no pathname yet or no schema applies", () => {
    expect(renderToStaticMarkup(<PageSchemaScripts pathname={null} />)).toBe("");
    expect(renderToStaticMarkup(<PageSchemaScripts pathname="/" />)).toBe("");
  });
});
