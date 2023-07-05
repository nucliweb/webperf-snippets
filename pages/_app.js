import { Analytics } from '@vercel/analytics/react';
 
function WebPerfSnippets({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
 
export default WebPerfSnippets;
