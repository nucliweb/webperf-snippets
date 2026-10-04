import "../styles/globals.css";
import { Analytics } from "../components/Analytics";
import { PageSchema } from "../components/PageSchema";
import { WebMCP } from "../components/WebMCP";

const ERROR_ROUTES = new Set(["/404", "/_error"]);

function WebPerfSnippets({ Component, pageProps, router }) {
  return (
    <>
      {/* The error pages are prerendered for the route, not for the URL that was not found */}
      {!ERROR_ROUTES.has(router.pathname) && <PageSchema />}
      <WebMCP />
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}

export default WebPerfSnippets;
