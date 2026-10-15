import pkg from "../package.json";
import { site } from "../lib/site";
import { withExternalLinkLabel } from "./ExternalLinkLabel";

const NewTabLink = withExternalLinkLabel((props) => (
  <a target="_blank" rel="noopener noreferrer" {...props} />
));

const LINKS = [
  { label: "GitHub", href: site.repository },
  { label: "npm", href: "https://www.npmjs.com/package/webperf-snippets" },
  { label: "Changelog", href: `${site.repository}/blob/main/CHANGELOG.md` },
];

export function FooterText() {
  return (
    <div className="wp-footer">
      <p className="wp-footer-credit">
        {`${site.name} v${pkg.version} · `}
        <NewTabLink href={`${site.repository}/blob/main/LICENSE`}>MIT License</NewTabLink>
        {" · "}
        <span className="wp-footer-author">
          {`© ${new Date().getFullYear()} `}
          <NewTabLink href={site.author.url}>{`${site.author.name} (${site.twitter})`}</NewTabLink>
        </span>
      </p>
      <nav aria-label="Footer" className="wp-footer-links">
        {LINKS.map(({ label, href }) => (
          <NewTabLink key={label} href={href}>
            {label}
          </NewTabLink>
        ))}
        <a href="/llms.txt">llms.txt</a>
      </nav>
    </div>
  );
}
