import { site } from "../lib/site";

// The WebSite JSON-LD. The description, author, Open Graph and Twitter tags come from the metadata of
// the layout and of each page (lib/page-metadata.js).

export function SiteHead() {
  return (
    <>
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
