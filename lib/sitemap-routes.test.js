const test = require("node:test");
const assert = require("node:assert/strict");
const { collectRoutes, sitemapEntries, robotsRules } = require("./sitemap-routes");

// The shape of the page map of Nextra: folders hold `children`, pages carry a `route`,
// and `_meta` files carry `data`
const pageMap = [
  { data: { index: { title: "Introduction" } } },
  { name: "index", route: "/", title: "Introduction" },
  { name: "CLI", route: "/CLI", title: "CLI" },
  {
    name: "Loading",
    route: "/Loading",
    title: "Loading",
    children: [
      { data: { TTFB: { title: "TTFB" } } },
      { name: "TTFB", route: "/Loading/TTFB", title: "TTFB" },
      { name: "FCP", route: "/Loading/FCP", title: "FCP" },
    ],
  },
  { name: "Empty", route: "/Empty", title: "Empty", children: [{ data: {} }] },
];

test("collectRoutes lists the pages of the page map, folders included only through their pages", () => {
  assert.deepEqual(collectRoutes(pageMap), ["/", "/CLI", "/Loading/TTFB", "/Loading/FCP"]);
});

test("collectRoutes returns nothing for an empty page map", () => {
  assert.deepEqual(collectRoutes([]), []);
});

test("sitemapEntries builds absolute URLs and leaves the home page without a trailing slash", () => {
  assert.deepEqual(sitemapEntries(["/", "/CLI", "/Loading/TTFB"], "https://example.com"), [
    { url: "https://example.com" },
    { url: "https://example.com/CLI" },
    { url: "https://example.com/Loading/TTFB" },
  ]);
});

test("robotsRules allows every crawler and points to the sitemap of the site", () => {
  assert.deepEqual(robotsRules("https://example.com"), {
    rules: { userAgent: "*", allow: "/" },
    host: "https://example.com",
    sitemap: "https://example.com/sitemap.xml",
  });
});
