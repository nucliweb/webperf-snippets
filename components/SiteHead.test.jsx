import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteHead } from "./SiteHead";
import { Logo } from "./Logo";
import { FooterText } from "./FooterText";
import { site } from "../lib/site";

const DESCRIPTION =
  "A curated list of snippets to get Web Performance metrics to use in the browser console or as snippets on Chrome DevTools";
const OG_IMAGE =
  "https://res.cloudinary.com/nucliweb/image/upload/c_scale,dpr_auto,f_auto,q_auto,w_1200/v1685886151/webperf-snippets/webperf-snippets-og-image.png";

const metas = (html) =>
  [...html.matchAll(/<meta ([^>]*?)\/?>/g)].map(([, attrs]) =>
    Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]))
  );

describe("SiteHead", () => {
  const html = renderToStaticMarkup(<SiteHead />);

  it("emits the description, author, Open Graph and Twitter tags in order", () => {
    expect(metas(html)).toEqual([
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { name: "description", content: DESCRIPTION },
      { name: "author", content: "Joan Leon" },
      { property: "og:url", content: "https://webperf-snippets.nucliweb.net/" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { property: "og:site_name", content: "WebPerf Snippets" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "675" },
      { property: "og:title", content: "WebPerf Snippets" },
      { property: "og:description", content: `${DESCRIPTION} by Joan León` },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@nucliweb" },
      { name: "twitter:creator", content: "@nucliweb" },
      { name: "twitter:title", content: "WebPerf Snippets" },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ]);
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
