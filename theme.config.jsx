import { FooterText } from "./components/FooterText";
import { Logo } from "./components/Logo";
import { SiteHead } from "./components/SiteHead";
import { site } from "./lib/site";

export default {
  useNextSeoProps() {
    return {
      titleTemplate: site.titleTemplate,
      defaultTitle: site.name,
    };
  },
  logo: <Logo />,
  // Called, not mounted: next/head only replaces the tags of the theme (the viewport) when they are direct children
  head: SiteHead(),
  project: {
    link: site.repository,
  },
  editLink: {
    component: null,
  },
  feedback: {
    content: null,
  },
  sidebar: {
    titleComponent({ title, type }) {
      if (type === "separator") {
        return <span className="cursor-default">{title}</span>;
      }
      return <>{title}</>;
    },
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  footer: {
    text: <FooterText />,
  },
};
