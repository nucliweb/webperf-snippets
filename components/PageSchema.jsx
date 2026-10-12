import { site } from "../lib/site";

// JSON-LD of a page, built on the server from what the page says about itself (lib/page-info.js): the
// breadcrumb, and on a snippet page the article and the source code of each snippet.

const BASE_URL = "https://webperf-snippets.nucliweb.net";
const AUTHOR = { "@type": "Person", name: site.author.name, url: site.author.url };

const CATEGORY_LABELS = {
  CoreWebVitals: "Core Web Vitals",
  Loading: "Loading",
  Interaction: "Interaction",
  Media: "Media",
  Resources: "Resources",
};

function buildBreadcrumbs(segments, title) {
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: BASE_URL,
    },
  ];

  if (segments[0] && CATEGORY_LABELS[segments[0]]) {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: CATEGORY_LABELS[segments[0]],
      item: `${BASE_URL}/${segments[0]}`,
    });
  }

  if (segments[1]) {
    items.push({
      "@type": "ListItem",
      position: items.length + 1,
      name: title,
      item: `${BASE_URL}/${segments[0]}/${segments[1]}`,
    });
  }

  return items;
}

// The source of a snippet, for the agents and search engines that cite code
function sourceCode(path, { description, pageUrl }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: path.split("/")[1].replace(/-/g, " "),
    description,
    programmingLanguage: "JavaScript",
    runtimePlatform: "Web browser",
    codeRepository: site.repository,
    url: `${site.repository}/blob/main/snippets/${path}.js`,
    license: "https://opensource.org/licenses/MIT",
    author: AUTHOR,
    subjectOf: { "@type": "WebPage", url: pageUrl },
  };
}

// page: { title, description, snippets } of lib/page-info.js
export function buildPageSchemas(pathname, page) {
  const path = pathname.replace(/\/+$/, "");
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);

  if (segments.length === 0) return [];

  const schemas = [];
  const pageUrl = `${BASE_URL}${path}`;

  const breadcrumbItems = buildBreadcrumbs(segments, page.title);
  if (breadcrumbItems.length > 1) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    });
  }

  const isSnippetPage = segments.length === 2 && CATEGORY_LABELS[segments[0]];
  if (isSnippetPage) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.title,
      description: page.description,
      url: pageUrl,
      author: AUTHOR,
      publisher: AUTHOR,
      isPartOf: {
        "@type": "WebSite",
        name: "WebPerf Snippets",
        url: BASE_URL,
      },
    });
    for (const path of page.snippets) schemas.push(sourceCode(path, { description: page.description, pageUrl }));
  }

  return schemas;
}

export function PageSchema({ pathname, page }) {
  return (
    <>
      {buildPageSchemas(pathname, page).map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
