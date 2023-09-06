import Script from "next/script";

function WebPerfSnippets({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="https://cdn.debugbear.com/BK73p0yToVVP.js"
        strategy="afterInteractive"
      />
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-NNX9SYKEV2"></Script>
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments)}
          gtag('js', new Date());

          gtag('config', 'G-NNX9SYKEV2');
        `}
      </Script>
    </>
  );
}

export default WebPerfSnippets;
