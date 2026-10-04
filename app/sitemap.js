import { getPageMap } from "nextra/page-map";
import { collectRoutes, sitemapEntries } from "../lib/sitemap-routes";

export default async function sitemap() {
  return sitemapEntries(collectRoutes(await getPageMap()), process.env.SITE_URL || "https://webperf-snippets.nucliweb.net");
}
