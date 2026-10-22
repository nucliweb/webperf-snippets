// The domains of the site that differ from the root domain of the page, such as its own CDN,
// which the snippets that tell first from third parties count as first party. In the console
// they are written at the top of each snippet; the CLI writes them there before it runs it.
const DECLARATION = "const OWN_DOMAINS = [];";

export function withOwnDomains(source, ownDomains) {
  if (!ownDomains?.length) return source;
  return source.replace(DECLARATION, `const OWN_DOMAINS = ${JSON.stringify(ownDomains)};`);
}

// The values given to --own-domains, each one a domain or a comma-separated list, or null when
// one of the domains is empty or has spaces. The snippets accept URLs and any case.
export function parseOwnDomains(values) {
  const domains = values.flatMap((value) => value.split(",").map((domain) => domain.trim()));
  return domains.every((domain) => domain !== "" && !/\s/.test(domain)) ? domains : null;
}
