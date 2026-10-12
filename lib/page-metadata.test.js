import { describe, it, expect } from "vitest";
import { siteMetadata, pageMetadata } from "./page-metadata";

const DESCRIPTION =
  "A curated list of snippets to get Web Performance metrics to use in the browser console or as snippets on Chrome DevTools";
const OG_IMAGE =
  "https://res.cloudinary.com/nucliweb/image/upload/c_scale,dpr_auto,f_auto,q_auto,w_1200/v1685886151/webperf-snippets/webperf-snippets-og-image.png";

describe("siteMetadata", () => {
  it("keeps the title template, description, author, Open Graph and Twitter values of the site", () => {
    expect(siteMetadata).toEqual({
      title: { default: "WebPerf Snippets", template: "%s | WebPerf Snippets" },
      description: DESCRIPTION,
      authors: [{ name: "Joan Leon" }],
      openGraph: {
        url: "https://webperf-snippets.nucliweb.net/",
        type: "website",
        locale: "en_US",
        siteName: "WebPerf Snippets",
        title: "WebPerf Snippets",
        description: `${DESCRIPTION} by Joan León`,
        images: [{ url: OG_IMAGE, width: 1200, height: 675 }],
      },
      twitter: {
        card: "summary_large_image",
        site: "@nucliweb",
        creator: "@nucliweb",
        title: "WebPerf Snippets",
        description: DESCRIPTION,
        images: [OG_IMAGE],
      },
    });
  });
});

describe("pageMetadata", () => {
  const page = pageMetadata({
    url: "https://webperf-snippets.nucliweb.net/CoreWebVitals/LCP",
    title: "Largest contentful paint (LCP)",
    description: "Quick check for Largest Contentful Paint.",
  });

  it("gives the page its own description", () => {
    expect(page.description).toBe("Quick check for Largest Contentful Paint.");
  });

  it("gives Open Graph and Twitter the URL, title and description of the page, and keeps the rest of the site", () => {
    expect(page.openGraph).toEqual({
      ...siteMetadata.openGraph,
      url: "https://webperf-snippets.nucliweb.net/CoreWebVitals/LCP",
      title: "Largest contentful paint (LCP)",
      description: "Quick check for Largest Contentful Paint.",
    });
    expect(page.twitter).toEqual({
      ...siteMetadata.twitter,
      title: "Largest contentful paint (LCP)",
      description: "Quick check for Largest Contentful Paint.",
    });
  });
});
