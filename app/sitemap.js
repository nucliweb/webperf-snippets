import fs from "fs";
import { getPageMap } from "nextra/page-map";
import { collectRoutes, sitemapEntries } from "../lib/sitemap-routes";
import { lastModifiedOf } from "../lib/page-dates";
import { snippetPaths } from "../lib/page-info";

export default async function sitemap() {
  // A page changes with its MDX and with the snippets it shows
  const dateOf = lastModifiedOf(process.cwd(), (file) => snippetPaths(fs.readFileSync(file, "utf8")));
  return sitemapEntries(collectRoutes(await getPageMap()), process.env.SITE_URL || "https://webperf-snippets.net", dateOf);
}
