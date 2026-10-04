const EXTERNAL = /^https?:\/\//;

// Wraps the link component of the theme so a link to another site tells screen readers
// that it opens in a new tab; the theme sets `target="_blank"` but adds no label
export function withExternalLinkLabel(Link) {
  return function ExternalLinkLabel({ children, ...props }) {
    const external = typeof props.href === "string" && EXTERNAL.test(props.href);
    return (
      <Link {...props}>
        {children}
        {external && <span className="wp-sr-only"> (opens in a new tab)</span>}
      </Link>
    );
  };
}
