// SSR Framework Hydration Data Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  // Framework detection patterns
  const frameworks = [
    {
      name: "Next.js",
      selector: "#__NEXT_DATA__",
      type: "json",
      threshold: 128 * 1024, // 128 KB official warning threshold
      docs: "https://nextjs.org/docs/messages/large-page-data",
    },
    {
      name: "Nuxt 3",
      selector: "#__NUXT_DATA__",
      type: "json-array",
      threshold: 100 * 1024,
      docs: "https://nuxt.com/docs/api/composables/use-hydration",
    },
    {
      name: "Nuxt 2",
      pattern: /window\.__NUXT__\s*=/,
      type: "script",
      threshold: 100 * 1024,
      docs: "https://nuxtjs.org/",
    },
    {
      name: "Remix",
      selector: "#__remixContext",
      type: "script",
      threshold: 100 * 1024,
      docs: "https://remix.run/docs/en/main/guides/performance",
    },
    {
      name: "Gatsby",
      selector: "#___gatsby",
      pattern: /window\.___/,
      type: "script",
      threshold: 100 * 1024,
      docs: "https://www.gatsbyjs.com/docs/",
    },
    {
      name: "SvelteKit",
      selector: "[data-sveltekit-hydrate]",
      type: "json",
      threshold: 100 * 1024,
      docs: "https://kit.svelte.dev/docs/performance",
    },
    {
      name: "Astro",
      selector: "astro-island",
      type: "props",
      threshold: 50 * 1024,
      docs: "https://docs.astro.build/en/concepts/islands/",
    },
  ];

  // Find all hydration scripts
  const detected = [];
  const allInlineScripts = Array.from(
    document.querySelectorAll("script:not([src])")
  ).filter((s) => s.innerHTML.trim().length > 0);

  // Check each framework
  frameworks.forEach((fw) => {
    let elements = [];
    let content = "";
    let size = 0;

    if (fw.selector) {
      const el = document.querySelector(fw.selector);
      if (el) {
        elements = [el];
        content = el.innerHTML || el.textContent || "";
        size = new Blob([content]).size;
      }
    }

    if (fw.pattern && elements.length === 0) {
      allInlineScripts.forEach((script) => {
        if (fw.pattern.test(script.innerHTML)) {
          elements.push(script);
          content = script.innerHTML;
          size += new Blob([content]).size;
        }
      });
    }

    // Special handling for Astro islands
    if (fw.name === "Astro") {
      const islands = document.querySelectorAll("astro-island");
      if (islands.length > 0) {
        elements = Array.from(islands);
        let totalProps = 0;
        islands.forEach((island) => {
          const props = island.getAttribute("props");
          if (props) totalProps += new Blob([props]).size;
        });
        size = totalProps;
        content = `${islands.length} islands with props`;
      }
    }

    if (elements.length > 0) {
      detected.push({
        ...fw,
        elements,
        content,
        size,
        exceedsThreshold: size > fw.threshold,
      });
    }
  });

  // Calculate other inline scripts
  const frameworkScripts = new Set(detected.flatMap((d) => d.elements));
  const otherScripts = allInlineScripts.filter((s) => !frameworkScripts.has(s));
  const otherSize = otherScripts.reduce(
    (sum, s) => sum + new Blob([s.innerHTML]).size,
    0
  );

  // Display results
  console.group(
    "%c🚀 SSR Framework Hydration Analysis",
    "font-weight: bold; font-size: 14px;"
  );

  if (detected.length === 0) {
    console.log("");
    console.log(
      "%c📭 No SSR framework hydration data detected.",
      "color: #6b7280; font-weight: bold;"
    );
    console.log("This page may be:");
    console.log("   • A static HTML page");
    console.log("   • A client-side rendered SPA");
    console.log("   • Using a framework not yet supported by this snippet");
    console.log("");
    console.log(
      `Found ${otherScripts.length} other inline scripts (${formatBytes(otherSize)})`
    );
    console.groupEnd();
    return;
  }

  // Summary
  console.log("");
  console.log("%cDetected Framework(s):", "font-weight: bold;");
  detected.forEach((fw) => {
    const status = fw.exceedsThreshold ? "🔴" : "🟢";
    console.log(
      `   ${status} ${fw.name}: ${formatBytes(fw.size)} (threshold: ${formatBytes(fw.threshold)})`
    );
  });

  const totalHydrationSize = detected.reduce((sum, d) => sum + d.size, 0);
  console.log("");
  console.log(`   Total hydration data: ${formatBytes(totalHydrationSize)}`);
  console.log(`   Other inline scripts: ${formatBytes(otherSize)}`);

  // Detailed analysis for each framework
  detected.forEach((fw) => {
    console.log("");
    console.group(
      `%c${fw.exceedsThreshold ? "🔴" : "🟢"} ${fw.name} Analysis`,
      `color: ${fw.exceedsThreshold ? "#ef4444" : "#22c55e"}; font-weight: bold;`
    );

    console.log(`Size: ${formatBytes(fw.size)}`);
    console.log(`Threshold: ${formatBytes(fw.threshold)}`);
    console.log(
      `Status: ${fw.exceedsThreshold ? "⚠️ Exceeds recommended limit" : "✅ Within limits"}`
    );

    // Parse and analyze content
    if (fw.type === "json" && fw.content) {
      try {
        const data = JSON.parse(fw.content);
        console.log("");
        console.log("%cData Structure:", "font-weight: bold;");

        if (fw.name === "Next.js" && data.props) {
          const pageProps = data.props?.pageProps || {};
          const pagePropsSize = new Blob([JSON.stringify(pageProps)]).size;

          console.log(`   Build ID: ${data.buildId || "N/A"}`);
          console.log(`   Page: ${data.page || "N/A"}`);
          console.log(`   pageProps size: ${formatBytes(pagePropsSize)}`);

          // Analyze pageProps keys
          const propsKeys = Object.keys(pageProps);
          if (propsKeys.length > 0) {
            console.log("");
            console.log("%c   pageProps breakdown:", "font-weight: bold;");

            const propSizes = propsKeys.map((key) => ({
              key,
              size: new Blob([JSON.stringify(pageProps[key])]).size,
            }));
            propSizes.sort((a, b) => b.size - a.size);

            propSizes.slice(0, 10).forEach((prop) => {
              const pct = ((prop.size / pagePropsSize) * 100).toFixed(1);
              const bar = "█".repeat(Math.min(Math.round(parseFloat(pct) / 5), 20));
              console.log(
                `      ${prop.key}: ${formatBytes(prop.size)} (${pct}%) ${bar}`
              );
            });

            if (propsKeys.length > 10) {
              console.log(`      ... and ${propsKeys.length - 10} more props`);
            }
          }

          // Check for common issues
          console.log("");
          console.log("%cPotential Issues:", "font-weight: bold;");

          // Large arrays
          const largeArrays = propsKeys.filter((key) => {
            const val = pageProps[key];
            return Array.isArray(val) && val.length > 50;
          });
          if (largeArrays.length > 0) {
            console.log(
              `   ⚠️ Large arrays: ${largeArrays.join(", ")} (consider pagination)`
            );
          }

          // Deeply nested objects
          const checkDepth = (obj, depth = 0) => {
            if (depth > 5) return true;
            if (typeof obj !== "object" || obj === null) return false;
            return Object.values(obj).some((v) => checkDepth(v, depth + 1));
          };
          if (checkDepth(pageProps)) {
            console.log("   ⚠️ Deeply nested data (> 5 levels)");
          }

          // Potential sensitive data patterns
          const sensitivePatterns = /password|secret|token|apikey|api_key|private/i;
          const propsString = JSON.stringify(pageProps);
          if (sensitivePatterns.test(propsString)) {
            console.log(
              "   🚨 Possible sensitive data detected - review prop names"
            );
          }

          if (
            largeArrays.length === 0 &&
            !checkDepth(pageProps) &&
            !sensitivePatterns.test(propsString)
          ) {
            console.log("   ✅ No obvious issues detected");
          }
        }

        // Raw data reference
        console.log("");
        console.log("%c📦 Raw data object:", "font-weight: bold;");
        console.log(data);
      } catch (e) {
        console.log("Could not parse JSON content");
      }
    }

    if (fw.name === "Astro") {
      console.log("");
      console.log(`Islands found: ${fw.elements.length}`);
      const islandTable = fw.elements.map((island, i) => {
        const props = island.getAttribute("props");
        const clientDirective =
          island.getAttribute("client") ||
          Array.from(island.attributes)
            .find((a) => a.name.startsWith("client:"))
            ?.name.replace("client:", "") ||
          "unknown";
        return {
          "#": i + 1,
          Component: island.getAttribute("component-url")?.split("/").pop() || "Unknown",
          Client: clientDirective,
          "Props Size": props ? formatBytes(new Blob([props]).size) : "0 B",
        };
      });
      console.table(islandTable);
    }

    // Element reference
    console.log("");
    console.log("%c🔎 Element(s):", "font-weight: bold;");
    fw.elements.forEach((el, i) => {
      console.log(`${i + 1}.`, el);
    });

    console.log("");
    console.log(`📚 Docs: ${fw.docs}`);

    console.groupEnd();
  });

  // Recommendations
  const hasIssues = detected.some((d) => d.exceedsThreshold);

  if (hasIssues) {
    console.log("");
    console.group("%c📝 Recommendations", "color: #3b82f6; font-weight: bold;");
    console.log("");
    console.log("%cTo reduce hydration data size:", "font-weight: bold;");
    console.log("");
    console.log("1. Only fetch data you actually render");
    console.log("   → Remove unused fields from API responses");
    console.log("   → Use GraphQL or tRPC for precise data fetching");
    console.log("");
    console.log("2. Paginate large lists");
    console.log("   → Don't send 100+ items in initial props");
    console.log("   → Implement infinite scroll or pagination");
    console.log("");
    console.log("3. Defer non-critical data");
    console.log("   → Fetch some data client-side after hydration");
    console.log("   → Use React Query, SWR, or similar");
    console.log("");
    console.log("4. Transform data before sending");
    console.log("   → Remove unnecessary nested data");
    console.log("   → Flatten structures where possible");
    console.log("");

    const nextJs = detected.find((d) => d.name === "Next.js");
    if (nextJs) {
      console.log("%cNext.js specific:", "font-weight: bold;");
      console.log(
        '%c// In getServerSideProps or getStaticProps:\nreturn {\n  props: {\n    // Only include what the page renders\n    items: items.slice(0, 10), // Paginate\n    // Omit unused fields\n    user: { name: user.name, avatar: user.avatar },\n  },\n};',
        "font-family: monospace; color: #22c55e;"
      );
    }

    console.groupEnd();
  }

  console.groupEnd();
})();
