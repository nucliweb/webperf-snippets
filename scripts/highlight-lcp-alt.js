import("https://unpkg.com/web-vitals?module").then(({ getLCP }) =>
  getLCP(highlightLCP)
);

highlightLCP = (el) => {
  console.log("LCP Highlighted");
  const lcp = el.entries[el.entries.length - 1];
  lcp.element.style.outline = "5px solid red";
};
