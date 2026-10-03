/* eslint-disable no-unused-vars */
// Canonical source of the helpers that several snippets copy.
//
// Snippets run pasted into the DevTools console, so they cannot import anything. Each snippet
// that needs a helper carries a copy of it between the same two markers:
//
//   // @shared <name>
//   ...
//   // @end-shared <name>
//
// `npm run check:consistency` fails when a copy differs from the block below (indentation is
// ignored). Edit the block here first, then paste it into every snippet that carries the marker.

// @shared getRootDomain
function getRootDomain(hostname) {
  const host = hostname.replace(/\.$/, "");
  // An IP address has no registrable domain, so each address is its own root
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  // Country-code domains with a second-level suffix: example.co.uk, example.com.au, example.ac.jp
  const secondLevelSuffixes = ["ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch"];
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}
// @end-shared getRootDomain

// Declared at the top of each snippet that carries isFirstParty: the domains of the site that
// differ from the page's root domain, such as its own CDN. They count as first party.
const OWN_DOMAINS = [];

// @shared isFirstParty
function isFirstParty(hostname) {
  const root = getRootDomain(hostname);
  if (root === getRootDomain(location.hostname)) return true;
  return OWN_DOMAINS.some((d) => getRootDomain(String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0]) === root);
}
// @end-shared isFirstParty

// @shared logOwnDomainsHint
function logOwnDomainsHint(thirdPartyCount) {
  if (OWN_DOMAINS.length === 0 && thirdPartyCount > 0) {
    console.log(
      '%cℹ️ OWN_DOMAINS is empty. If this site serves its own assets from other domains (for example a CDN), add them at the top of the snippet, such as const OWN_DOMAINS = ["cdn.example.net"];, and run it again so they count as first party.',
      "color: #3b82f6;"
    );
  }
}
// @end-shared logOwnDomainsHint

// @shared formatBytes
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}
// @end-shared formatBytes
