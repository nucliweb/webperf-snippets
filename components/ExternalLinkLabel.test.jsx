import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { withExternalLinkLabel } from "./ExternalLinkLabel";

const Base = ({ children, ...props }) => <a {...props}>{children}</a>;
const Link = withExternalLinkLabel(Base);
const render = (props) => renderToStaticMarkup(<Link {...props} />);

describe("withExternalLinkLabel", () => {
  it("tells assistive technology that an external link opens in a new tab", () => {
    const html = render({ href: "https://github.com/rviscomi/capo.js", children: "capo.js" });
    expect(html).toContain("capo.js");
    expect(html).toContain('<span class="wp-sr-only"> (opens in a new tab)</span>');
  });

  it("keeps the props of the wrapped link", () => {
    const html = render({ href: "http://example.com", target: "_blank", rel: "noreferrer", children: "x" });
    expect(html).toContain('href="http://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it.each(["/Loading/TTFB", "#section", "../Media/Oversized-Images", "mailto:joan@example.com"])(
    "adds no label to %s",
    (href) => {
      expect(render({ href, children: "x" })).not.toContain("opens in a new tab");
    }
  );

  it("adds no label when there is no href", () => {
    expect(render({ children: "x" })).not.toContain("opens in a new tab");
  });
});
