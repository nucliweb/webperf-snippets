import { site } from "../lib/site";

export function SiteHead() {
  return (
    <>
      <meta name="description" content={site.description} />
      <meta name="author" content={site.metaAuthor} />
      <meta property="og:url" content={site.url} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content={site.locale} />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:image:width" content={String(site.ogImage.width)} />
      <meta property="og:image:height" content={String(site.ogImage.height)} />
      <meta property="og:title" content={site.name} />
      <meta property="og:description" content={site.ogDescription} />
      <meta property="og:image" content={site.ogImage.url} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={site.twitter} />
      <meta name="twitter:creator" content={site.twitter} />
      <meta name="twitter:title" content={site.name} />
      <meta name="twitter:description" content={site.description} />
      <meta name="twitter:image" content={site.ogImage.url} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: site.name,
            url: site.url,
            description: site.description,
            author: {
              "@type": "Person",
              name: site.author.name,
              url: site.author.url,
            },
          }),
        }}
      />
    </>
  );
}
