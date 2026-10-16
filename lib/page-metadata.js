import { site } from "./site";

// The metadata of the site, which the layout gives every page, and the one of a page, which replaces
// its description, its canonical URL and the URL, title and description of Open Graph and Twitter.
// Next.js replaces an object such as openGraph as a whole, so a page spreads the one of the site.

export const siteMetadata = {
  title: { default: site.name, template: site.titleTemplate },
  description: site.description,
  authors: [{ name: site.metaAuthor }],
  openGraph: {
    url: site.url,
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: site.name,
    description: site.ogDescription,
    images: [{ url: site.ogImage.url, width: site.ogImage.width, height: site.ogImage.height }],
  },
  twitter: {
    card: "summary_large_image",
    site: site.twitter,
    creator: site.twitter,
    title: site.name,
    description: site.description,
    images: [site.ogImage.url],
  },
};

// The home takes the name of the site as it is: through the template it would read
// "WebPerf Snippets | WebPerf Snippets"
export function pageMetadata({ url, title, description }) {
  return {
    ...(url === site.url && { title: { absolute: site.name } }),
    description,
    alternates: { canonical: url },
    openGraph: { ...siteMetadata.openGraph, url, title, description },
    twitter: { ...siteMetadata.twitter, title, description },
  };
}
