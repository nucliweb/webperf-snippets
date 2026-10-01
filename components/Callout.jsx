import { Callout as NextraCallout } from "nextra/components";
import { Icon } from "./Icon";

// Nextra draws the default icon of a callout as an emoji. This wrapper draws the
// site icons instead and leaves everything else to the Nextra component.
const TYPE_ICON = { default: "💡", info: "ℹ️", warning: "⚠️", error: "❌" };

export function Callout({ type = "default", emoji, ...props }) {
  const icon = emoji ?? (
    <span className="wp-callout-icon">
      <Icon emoji={TYPE_ICON[type]} />
    </span>
  );
  return <NextraCallout type={type} emoji={icon} {...props} />;
}
