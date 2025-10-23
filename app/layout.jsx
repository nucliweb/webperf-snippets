import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: {
    default: "WebPerf Snippets",
    template: "%s",
  },
  openGraph: {
    title: "WebPerf Snippets",
    url: "https://webperf-snippets.nucliweb.net/",
    siteName: "WebPerf Snippets",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://res.cloudinary.com/nucliweb/image/upload/c_scale,dpr_auto,f_auto,q_auto,w_1200/v1685886151/webperf-snippets/webperf-snippets-og-image.png",
        width: 1200,
        height: 675,
        alt: "WebPerf Snippets OG Image",
      },
    ],
    description:
      "A curated list of snippets to get Web Performance metrics to use in the browser console or as snippets on Chrome DevTools by Joan León",
  },
  twitter: {
    card: "summary_large_image",
    site: "@nucliweb",
    creator: "@nucliweb",
  },
  viewport: "width=device-width, initial-scale=1.0",
  author: "Joan Leon",
};

const banner = (
  <Banner storageKey="webperf-snippets-banner">
    WebPerf Snippets: curated web performance metrics for DevTools 🚀
  </Banner>
);

const navbar = (
  <Navbar
    logo={
      <svg
        style={{ width: "200px" }}
        viewBox="0 0 348 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ...SVG paths... */}
      </svg>
    }
    projectLink="https://github.com/nucliweb/webperf-snippets"
  />
);

const footer = (
  <Footer>
    MIT {new Date().getFullYear()} ©{" "}
    <a href="https://twitter.com/nucliweb" target="_blank" rel="noopener noreferrer">
      Joan León | @nucliweb
    </a>
  </Footer>
);

export default async function RootLayout({ children }) {
  return (
    <html lang="es" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/nucliweb/webperf-snippets"
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
