import Script from "next/script";

function WebPerfSnippets({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="https://cdn.debugbear.com/BK73p0yToVVP.js"
        strategy="afterInteractive"
      />
    </>
  );
}

export default WebPerfSnippets;
