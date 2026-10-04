import { robotsRules } from "../lib/sitemap-routes";

export default function robots() {
  return robotsRules(process.env.SITE_URL || "https://webperf-snippets.nucliweb.net");
}
