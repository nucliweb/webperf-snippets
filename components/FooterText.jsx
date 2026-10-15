import pkg from "../package.json";
import { site } from "../lib/site";

export function FooterText() {
  return (
    <span>
      MIT {new Date().getFullYear()} ©{" "}
      <a href={site.author.url} target="_blank" rel="noopener noreferrer">
        {`${site.author.name} | ${site.twitter}`}
      </a>
      {` · v${pkg.version} · `}
      <a
        href={`${site.repository}/blob/main/CHANGELOG.md`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Changelog
      </a>
    </span>
  );
}
