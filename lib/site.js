const url = "https://webperf-snippets.nucliweb.net/";
const description =
  "A curated list of snippets to get Web Performance metrics to use in the browser console or as snippets on Chrome DevTools";

export const site = {
  name: "WebPerf Snippets",
  titleTemplate: "%s | WebPerf Snippets",
  url,
  locale: "en_US",
  description,
  ogDescription: `${description} by Joan León`,
  ogImage: {
    url: "https://res.cloudinary.com/nucliweb/image/upload/c_scale,dpr_auto,f_auto,q_auto,w_1200/v1685886151/webperf-snippets/webperf-snippets-og-image.png",
    width: 1200,
    height: 675,
  },
  metaAuthor: "Joan Leon",
  author: { name: "Joan León", url: "https://twitter.com/nucliweb" },
  twitter: "@nucliweb",
  repository: "https://github.com/nucliweb/webperf-snippets",
};
