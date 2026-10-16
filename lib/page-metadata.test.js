import { describe, it, expect } from "vitest";
import { siteMetadata, pageMetadata } from "./page-metadata";

const DESCRIPTION =
  "Tested JavaScript snippets that measure and debug web performance. Your AI agent runs them for you, or you run them yourself in DevTools.";
const OG_IMAGE =
  "https://res.cloudinary.com/nucliweb/image/upload/c_scale,dpr_auto,f_auto,q_auto,w_1200/v1792134386/webperf-snippets/webperf-snippets-og-image.png";

describe("siteMetadata", () => {
  it("keeps the title template, description, author, Open Graph and Twitter values of the site", () => {
    expect(siteMetadata).toEqual({
      title: { default: "WebPerf Snippets", template: "%s | WebPerf Snippets" },
      description: DESCRIPTION,
      authors: [{ name: "Joan Leon" }],
      openGraph: {
        url: "https://webperf-snippets.net/",
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
    url: "https://webperf-snippets.net/CoreWebVitals/LCP",
    title: "Largest contentful paint (LCP)",
    description: "Quick check for Largest Contentful Paint.",
  });

  it("points the canonical URL to the page", () => {
    expect(page.alternates).toEqual({ canonical: "https://webperf-snippets.net/CoreWebVitals/LCP" });
  });

  it("keeps the title of the page for the template of the site", () => {
    expect(page.title).toBeUndefined();
  });

  it("gives the page its own description", () => {
    expect(page.description).toBe("Quick check for Largest Contentful Paint.");
  });

  it("gives Open Graph and Twitter the URL, title and description of the page, and keeps the rest of the site", () => {
    expect(page.openGraph).toEqual({
      ...siteMetadata.openGraph,
      url: "https://webperf-snippets.net/CoreWebVitals/LCP",
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

describe("pageMetadata of the home", () => {
  const home = pageMetadata({ url: "https://webperf-snippets.net/", title: "WebPerf Snippets", description: "Home." });

  it("gives the home the name of the site without the template, which would repeat it", () => {
    expect(home.title).toEqual({ absolute: "WebPerf Snippets" });
  });

  it("points the canonical URL to the root of the site", () => {
    expect(home.alternates).toEqual({ canonical: "https://webperf-snippets.net/" });
  });
});
