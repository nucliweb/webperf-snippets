(() => {
  const formatBytes = bytes => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };
  const frameworks = [ {
    name: "Next.js",
    selector: "#__NEXT_DATA__",
    type: "json",
    threshold: 128 * 1024,
    docs: "https://nextjs.org/docs/messages/large-page-data"
  }, {
    name: "Nuxt 3",
    selector: "#__NUXT_DATA__",
    type: "json-array",
    threshold: 100 * 1024,
    docs: "https://nuxt.com/docs/api/composables/use-hydration"
  }, {
    name: "Nuxt 2",
    pattern: /window\.__NUXT__\s*=/,
    type: "script",
    threshold: 100 * 1024,
    docs: "https://nuxtjs.org/"
  }, {
    name: "Remix",
    selector: "#__remixContext",
    type: "script",
    threshold: 100 * 1024,
    docs: "https://remix.run/docs/en/main/guides/performance"
  }, {
    name: "Gatsby",
    selector: "#___gatsby",
    pattern: /window\.___/,
    type: "script",
    threshold: 100 * 1024,
    docs: "https://www.gatsbyjs.com/docs/"
  }, {
    name: "SvelteKit",
    selector: "[data-sveltekit-hydrate]",
    type: "json",
    threshold: 100 * 1024,
    docs: "https://kit.svelte.dev/docs/performance"
  }, {
    name: "Astro",
    selector: "astro-island",
    type: "props",
    threshold: 50 * 1024,
    docs: "https://docs.astro.build/en/concepts/islands/"
  } ];
  const detected = [];
  const allInlineScripts = Array.from(document.querySelectorAll("script:not([src])")).filter(s => s.innerHTML.trim().length > 0);
  frameworks.forEach(fw => {
    let elements = [];
    let content = "";
    let size = 0;
    if (fw.selector) {
      const el = document.querySelector(fw.selector);
      if (el) {
        elements = [ el ];
        content = el.innerHTML || el.textContent || "";
        size = new Blob([ content ]).size;
      }
    }
    if (fw.pattern && elements.length === 0) allInlineScripts.forEach(script => {
      if (fw.pattern.test(script.innerHTML)) {
        elements.push(script);
        content = script.innerHTML;
        size += new Blob([ content ]).size;
      }
    });
    if (fw.name === "Astro") {
      const islands = document.querySelectorAll("astro-island");
      if (islands.length > 0) {
        elements = Array.from(islands);
        let totalProps = 0;
        islands.forEach(island => {
          const props = island.getAttribute("props");
          if (props) totalProps += new Blob([ props ]).size;
        });
        size = totalProps;
        content = `${islands.length} islands with props`;
      }
    }
    if (elements.length > 0) detected.push({
      ...fw,
      elements: elements,
      content: content,
      size: size,
      exceedsThreshold: size > fw.threshold
    });
  });
  const frameworkScripts = new Set(detected.flatMap(d => d.elements));
  const otherScripts = allInlineScripts.filter(s => !frameworkScripts.has(s));
  const otherSize = otherScripts.reduce((sum, s) => sum + new Blob([ s.innerHTML ]).size, 0);
  if (detected.length === 0) {
    return {
      script: "SSR-Hydration-Data-Analysis",
      status: "ok",
      count: 0,
      details: {
        frameworksFound: 0,
        totalHydrationBytes: 0,
        otherInlineBytes: otherSize
      },
      items: [],
      issues: []
    };
  }
  detected.forEach(fw => {
    fw.exceedsThreshold;
  });
  const totalHydrationSize = detected.reduce((sum, d) => sum + d.size, 0);
  detected.forEach(fw => {
    if (fw.type === "json" && fw.content) try {
      const data = JSON.parse(fw.content);
      if (fw.name === "Next.js" && data.props) {
        const pageProps = data.props?.pageProps || {};
        const pagePropsSize = new Blob([ JSON.stringify(pageProps) ]).size;
        const propsKeys = Object.keys(pageProps);
        if (propsKeys.length > 0) {
          const propSizes = propsKeys.map(key => ({
            key: key,
            size: new Blob([ JSON.stringify(pageProps[key]) ]).size
          }));
          propSizes.sort((a, b) => b.size - a.size);
          propSizes.slice(0, 10).forEach(prop => {
            const pct = (prop.size / pagePropsSize * 100).toFixed(1);
            "█".repeat(Math.min(Math.round(parseFloat(pct) / 5), 20));
          });
          if (propsKeys.length > 10) void 0;
        }
        const largeArrays = propsKeys.filter(key => {
          const val = pageProps[key];
          return Array.isArray(val) && val.length > 50;
        });
        if (largeArrays.length > 0) void 0;
        const checkDepth = (obj, depth = 0) => {
          if (depth > 5) return true;
          if (typeof obj !== "object" || obj === null) return false;
          return Object.values(obj).some(v => checkDepth(v, depth + 1));
        };
        if (checkDepth(pageProps)) void 0;
        const sensitivePatterns = /password|secret|token|apikey|api_key|private/i;
        const propsString = JSON.stringify(pageProps);
        if (sensitivePatterns.test(propsString)) void 0;
        if (largeArrays.length === 0 && !checkDepth(pageProps) && !sensitivePatterns.test(propsString)) void 0;
      }
    } catch (e) {
    }
    if (fw.name === "Astro") {
      fw.elements.map((island, i) => {
        const props = island.getAttribute("props");
        const clientDirective = island.getAttribute("client") || Array.from(island.attributes).find(a => a.name.startsWith("client:"))?.name.replace("client:", "") || "unknown";
        return {
          "#": i + 1,
          Component: island.getAttribute("component-url")?.split("/").pop() || "Unknown",
          Client: clientDirective,
          "Props Size": props ? formatBytes(new Blob([ props ]).size) : "0 B"
        };
      });
    }
    fw.elements.forEach((el, i) => {
    });
  });
  const hasIssues = detected.some(d => d.exceedsThreshold);
  if (hasIssues) {
    const nextJs = detected.find(d => d.name === "Next.js");
    if (nextJs) {
    }
  }
  return {
    script: "SSR-Hydration-Data-Analysis",
    status: "ok",
    count: detected.length,
    details: {
      frameworksFound: detected.length,
      totalHydrationBytes: totalHydrationSize,
      otherInlineBytes: otherSize,
      hasExceedingThreshold: detected.some(d => d.exceedsThreshold)
    },
    items: detected.map(fw => ({
      name: fw.name,
      sizeBytes: fw.size,
      thresholdBytes: fw.threshold,
      exceedsThreshold: fw.exceedsThreshold
    })),
    issues: detected.filter(fw => fw.exceedsThreshold).map(fw => ({
      severity: "warning",
      message: `${fw.name} hydration data (${Math.round(fw.size / 1024)} KB) exceeds ${Math.round(fw.threshold / 1024)} KB threshold`
    }))
  };
})();
