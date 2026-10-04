import { site } from "../lib/site";

export function FooterText() {
  return (
    <span>
      MIT {new Date().getFullYear()} ©{" "}
      <a href={site.author.url} target="_blank" rel="noopener noreferrer">
        {`${site.author.name} | ${site.twitter}`}
      </a>
    </span>
  );
}
