import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head, Search } from "nextra/components";
import { GitHubIcon } from "nextra/icons";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";
import "../styles/globals.css";
import { Analytics } from "../components/Analytics";
import { FooterText } from "../components/FooterText";
import { Logo } from "../components/Logo";
import { SiteHead } from "../components/SiteHead";
import { WebMCP } from "../components/WebMCP";
import { site } from "../lib/site";
import { siteMetadata } from "../lib/page-metadata";

export const metadata = siteMetadata;

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <SiteHead />
      </Head>
      <body>
        <Layout
          // The icon is the only content of its link, so it carries the name of the link
          navbar={<Navbar logo={<Logo />} projectLink={site.repository} projectIcon={<GitHubIcon height="24" role="img" aria-label="WebPerf Snippets on GitHub" />} />}
          // A placeholder goes away with the first key: the field has a name of its own
          search={<Search aria-label="Search the documentation" />}
          footer={
            <Footer>
              <FooterText />
            </Footer>
          }
          pageMap={await getPageMap()}
          docsRepositoryBase={site.repository}
          copyPageButton={false}
          editLink={null}
          feedback={{ content: null }}
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
        >
          {children}
        </Layout>
        <WebMCP />
        <Analytics />
      </body>
    </html>
  );
}
