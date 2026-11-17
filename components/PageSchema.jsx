import { site } from "../lib/site";

// JSON-LD of a page, built on the server from what the page says about itself (lib/page-info.js): the
// breadcrumb, and on a snippet page the article and the source code of each snippet.

const BASE_URL = "https://webperf-snippets.net";
const AUTHOR = { "@type": "Person", name: site.author.name, url: site.author.url };

const SNIPPET_CATEGORIES = new Set(["CoreWebVitals", "Loading", "Interaction", "Media", "Resources"]);

// Home, the category when it has a page of its own, and the page. A category without one is left out,
// instead of linking to a URL that is a 404. `categories` maps the folder of each category with a page
// to its title.
function buildBreadcrumbs(segments, title, categories) {
  const items = [{ name: "Home", item: BASE_URL }];
  const categoryTitle = categories[segments[0]];
  if (categoryTitle) items.push({ name: categoryTitle, item: `${BASE_URL}/${segments[0]}` });
  if (segments[1]) items.push({ name: title, item: `${BASE_URL}/${segments[0]}/${segments[1]}` });
  return items.map((item, i) => ({ "@type": "ListItem", position: i + 1, ...item }));
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

// page: { title, description, snippets } of lib/page-info.js; categories: the title of each category
// with a page, by its folder
export function buildPageSchemas(pathname, page, categories = {}) {
  const path = pathname.replace(/\/+$/, "");
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);

  if (segments.length === 0) return [];

  const schemas = [];
  const pageUrl = `${BASE_URL}${path}`;

  const breadcrumbItems = buildBreadcrumbs(segments, page.title, categories);
  if (breadcrumbItems.length > 1) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    });
  }

  const isSnippetPage = segments.length === 2 && SNIPPET_CATEGORIES.has(segments[0]);
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

export function PageSchema({ pathname, page, categories }) {
  return (
    <>
      {buildPageSchemas(pathname, page, categories).map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
