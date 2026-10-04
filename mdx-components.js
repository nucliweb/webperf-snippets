import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";
import { withExternalLinkLabel } from "./components/ExternalLinkLabel";

const docsComponents = getDocsMDXComponents();

export const useMDXComponents = (components) => ({
  ...docsComponents,
  a: withExternalLinkLabel(docsComponents.a),
  ...components,
});
