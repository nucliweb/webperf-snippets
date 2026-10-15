import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
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
          navbar={<Navbar logo={<Logo />} projectLink={site.repository} />}
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
