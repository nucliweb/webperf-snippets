import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteHead } from "./SiteHead";
import { Logo } from "./Logo";
import { FooterText } from "./FooterText";
import { site } from "../lib/site";

const DESCRIPTION =
  "A curated list of snippets to get Web Performance metrics to use in the browser console or as snippets on Chrome DevTools";

const metas = (html) =>
  [...html.matchAll(/<meta ([^>]*?)\/?>/g)].map(([, attrs]) =>
    Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]))
  );

describe("SiteHead", () => {
  const html = renderToStaticMarkup(<SiteHead />);

  it("emits no meta tag: the metadata of the layout and of each page gives them", () => {
    expect(metas(html)).toEqual([]);
  });

  it("emits the WebSite JSON-LD", () => {
    const [, json] = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
    expect(JSON.parse(json)).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "WebPerf Snippets",
      url: "https://webperf-snippets.nucliweb.net/",
      description: DESCRIPTION,
      author: { "@type": "Person", name: "Joan León", url: "https://twitter.com/nucliweb" },
    });
  });
});

describe("site", () => {
  it("defines the title template used for every page", () => {
    expect(site.titleTemplate).toBe("%s | WebPerf Snippets");
    expect(site.name).toBe("WebPerf Snippets");
  });
});

describe("Logo", () => {
  it("is an accessible image named after the site", () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="WebPerf Snippets"');
  });
});

describe("FooterText", () => {
  it("credits the author with the year of the build", () => {
    const html = renderToStaticMarkup(<FooterText />);
    expect(html).toContain(`MIT ${new Date().getFullYear()}`);
    expect(html).toContain("https://twitter.com/nucliweb");
  });
});
