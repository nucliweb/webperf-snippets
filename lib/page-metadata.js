import { site } from "./site";

// The metadata of the site, which the layout gives every page, and the one of a page, which replaces
// its description and the URL, title and description of Open Graph and Twitter. Next.js replaces an
// object such as openGraph as a whole, so a page spreads the one of the site.

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

export function pageMetadata({ url, title, description }) {
  return {
    description,
    openGraph: { ...siteMetadata.openGraph, url, title, description },
    twitter: { ...siteMetadata.twitter, title, description },
  };
}
