import { ICONS, SHAPES } from "../lib/icons";

// The same icons and dots the rehype plugin draws in the MDX pages, for React
// components. Pass the emoji the icon replaces; lib/icons.js has the mapping.
export function Icon({ emoji, style }) {
  const spec = ICONS[emoji];
  if (!spec) return emoji;
  if (spec.kind === "dot") {
    return <span className={`wp-dot wp-dot-${spec.tone}`} role="img" aria-label={spec.label} style={style} />;
  }
  return (
    <span className={`wp-ic wp-ic-${spec.tone}`} role="img" aria-label={spec.label} style={style}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {SHAPES[spec.shape].map(([Tag, props], i) => (
          <Tag key={i} {...props} />
        ))}
      </svg>
    </span>
  );
}
