import Script from "next/script";

export function Analytics() {
  return (
    <>
      <Script
        src="https://cdn.debugbear.com/BK73p0yToVVP.js"
        strategy="afterInteractive"
      />
      {/* The library loads when the browser is idle after load, not while the page loads: it took
          about 200 ms of main thread on a mobile CPU. gtag() below queues the events until then. */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-NNX9SYKEV2"
        strategy="lazyOnload"
      />
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
