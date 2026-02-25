// Resource Hints Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "-";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  };

  // Resource hint definitions
  const hintTypes = [
    {
      rel: "preload",
      icon: "⚡",
      description: "Critical resource for current page",
      requiresAs: true,
    },
    {
      rel: "modulepreload",
      icon: "📦",
      description: "ES module for current page",
      requiresAs: false,
    },
    {
      rel: "preconnect",
      icon: "🔌",
      description: "Early connection to origin",
      requiresAs: false,
    },
    {
      rel: "dns-prefetch",
      icon: "🔍",
      description: "DNS lookup for origin",
      requiresAs: false,
    },
    {
      rel: "prefetch",
      icon: "📥",
      description: "Resource for future navigation",
      requiresAs: false,
    },
    {
      rel: "prerender",
      icon: "🖼️",
      description: "Pre-render page",
      requiresAs: false,
    },
  ];

  // Get all link elements with resource hints
  const allHints = [];
  const issues = [];

  hintTypes.forEach((type) => {
    const links = document.querySelectorAll(`link[rel="${type.rel}"]`);
    links.forEach((link) => {
      const href = link.href || link.getAttribute("href") || "";
      let hostname = "";
      try {
        hostname = new URL(href, location.origin).hostname;
      } catch {}

      const hint = {
        rel: type.rel,
        icon: type.icon,
        href,
        shortHref: href.length > 50 ? "..." + href.slice(-47) : href,
        hostname,
        as: link.getAttribute("as") || "",
        crossorigin: link.crossOrigin || link.getAttribute("crossorigin") || "",
        fetchpriority: link.fetchPriority || link.getAttribute("fetchpriority") || "",
        type: link.type || "",
        media: link.media || "",
        element: link,
      };

      allHints.push(hint);

      // Check for issues
      if (type.requiresAs && !hint.as) {
        issues.push({
          hint,
          issue: "Missing 'as' attribute (required for preload)",
          severity: "error",
          fix: `Add as="script|style|font|image|fetch"`,
        });
      }

      if (hint.as === "font" && !hint.crossorigin) {
        issues.push({
          hint,
          issue: "Font preload without crossorigin (causes double fetch)",
          severity: "error",
          fix: 'Add crossorigin="anonymous"',
        });
      }

      if (type.rel === "preconnect" && !hint.crossorigin) {
        // Check if we load CORS resources from this origin
        const corsResources = performance
          .getEntriesByType("resource")
          .filter(
            (r) =>
              r.name.includes(hostname) &&
              (r.initiatorType === "script" ||
                r.initiatorType === "css" ||
                r.initiatorType === "font")
          );
        if (corsResources.length > 0) {
          issues.push({
            hint,
            issue: "Preconnect may need crossorigin for CORS resources",
            severity: "warning",
            fix: 'Consider adding crossorigin="anonymous"',
          });
        }
      }
    });
  });

  // Check for unused preloads
  const preloads = allHints.filter((h) => h.rel === "preload");
  const loadedResources = performance.getEntriesByType("resource");

  preloads.forEach((preload) => {
    const wasUsed = loadedResources.some((r) => r.name === preload.href);
    if (!wasUsed) {
      issues.push({
        hint: preload,
        issue: "Preloaded resource not used within page load",
        severity: "warning",
        fix: "Remove unused preload or verify it's needed",
      });
    }
  });

  // Check for preconnects without loaded resources
  const preconnects = allHints.filter(
    (h) => h.rel === "preconnect" || h.rel === "dns-prefetch"
  );
  preconnects.forEach((pc) => {
    const hasResources = loadedResources.some((r) => {
      try {
        return new URL(r.name).hostname === pc.hostname;
      } catch {
        return false;
      }
    });
    if (!hasResources && pc.hostname) {
      issues.push({
        hint: pc,
        issue: `No resources loaded from ${pc.hostname}`,
        severity: "warning",
        fix: "Remove unused preconnect or verify it's needed for future resources",
      });
    }
  });

  // Check for too many preloads
  if (preloads.length > 6) {
    issues.push({
      hint: { rel: "preload", href: `${preloads.length} preloads` },
      issue: `Too many preloads (${preloads.length}) - they compete for bandwidth`,
      severity: "warning",
      fix: "Limit to 5-6 most critical resources",
    });
  }

  // Get third-party origins that could benefit from preconnect
  const thirdPartyOrigins = new Map();
  loadedResources.forEach((r) => {
    try {
      const url = new URL(r.name);
      if (url.hostname !== location.hostname) {
        if (!thirdPartyOrigins.has(url.origin)) {
          thirdPartyOrigins.set(url.origin, { count: 0, size: 0, types: new Set() });
        }
        const data = thirdPartyOrigins.get(url.origin);
        data.count++;
        data.size += r.transferSize || 0;
        data.types.add(r.initiatorType);
      }
    } catch {}
  });

  // Find origins without preconnect
  const preconnectedOrigins = new Set(
    [...preconnects].map((p) => {
      try {
        return new URL(p.href).origin;
      } catch {
        return "";
      }
    })
  );

  const missingPreconnects = [];
  thirdPartyOrigins.forEach((data, origin) => {
    if (!preconnectedOrigins.has(origin) && data.count >= 2) {
      missingPreconnects.push({ origin, ...data });
    }
  });

  // Display results
  console.group("%c🔗 Resource Hints Analysis", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary:", "font-weight: bold;");

  const summary = hintTypes.map((type) => {
    const count = allHints.filter((h) => h.rel === type.rel).length;
    return { type: type.rel, count, icon: type.icon };
  });

  summary.forEach((s) => {
    const status = s.count > 0 ? "🟢" : "⚪";
    console.log(`   ${status} ${s.icon} ${s.type}: ${s.count}`);
  });

  console.log(`   Total hints: ${allHints.length}`);

  // Details by type
  hintTypes.forEach((type) => {
    const hints = allHints.filter((h) => h.rel === type.rel);
    if (hints.length === 0) return;

    console.log("");
    console.group(
      `%c${type.icon} ${type.rel} (${hints.length})`,
      "color: #3b82f6; font-weight: bold;"
    );

    const tableData = hints.map((h) => {
      const row = {
        Resource: h.shortHref,
      };

      if (type.rel === "preload" || type.rel === "modulepreload") {
        row.As = h.as || "⚠️ missing";
        row.Crossorigin = h.crossorigin || "-";
        if (h.fetchpriority) row.Priority = h.fetchpriority;

        // Check if used
        const used = loadedResources.some((r) => r.name === h.href);
        row.Used = used ? "✅" : "⚠️ No";
      }

      if (type.rel === "preconnect" || type.rel === "dns-prefetch") {
        row.Origin = h.hostname;
        row.Crossorigin = h.crossorigin || "-";

        // Check resources from this origin
        const originResources = loadedResources.filter((r) => {
          try {
            return new URL(r.name).hostname === h.hostname;
          } catch {
            return false;
          }
        });
        row["Resources Loaded"] = originResources.length;
      }

      return row;
    });

    console.table(tableData);

    // Elements for inspection
    console.log("%c🔎 Elements:", "font-weight: bold;");
    hints.forEach((h, i) => {
      console.log(`${i + 1}.`, h.element);
    });

    console.groupEnd();
  });

  // Issues
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Issues Found (${errors.length} errors, ${warnings.length} warnings)`,
      "color: #ef4444; font-weight: bold;"
    );

    if (errors.length > 0) {
      console.log("");
      console.log("%c🔴 Errors:", "font-weight: bold; color: #ef4444;");
      errors.forEach((issue) => {
        console.log(`   ${issue.hint.rel}: ${issue.issue}`);
        console.log(`      Resource: ${issue.hint.href}`);
        console.log(`      Fix: ${issue.fix}`);
      });
    }

    if (warnings.length > 0) {
      console.log("");
      console.log("%c🟡 Warnings:", "font-weight: bold; color: #f59e0b;");
      warnings.forEach((issue) => {
        console.log(`   ${issue.hint.rel}: ${issue.issue}`);
        if (issue.hint.href) {
          console.log(`      Resource: ${issue.hint.href}`);
        }
        console.log(`      Fix: ${issue.fix}`);
      });
    }

    console.groupEnd();
  } else {
    console.log("");
    console.log(
      "%c✅ No issues found with resource hints.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Recommendations
  if (missingPreconnects.length > 0) {
    console.log("");
    console.group("%c💡 Optimization Opportunities", "color: #3b82f6; font-weight: bold;");

    console.log("");
    console.log("%cThird-party origins without preconnect:", "font-weight: bold;");
    console.log("These origins load multiple resources and could benefit from preconnect:");
    console.log("");

    const recTable = missingPreconnects
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((o) => ({
        Origin: o.origin,
        Resources: o.count,
        Size: formatBytes(o.size),
        Types: Array.from(o.types).join(", "),
      }));
    console.table(recTable);

    console.log("");
    console.log("%cAdd preconnect for critical origins:", "font-weight: bold;");
    missingPreconnects.slice(0, 3).forEach((o) => {
      console.log(
        `%c<link rel="preconnect" href="${o.origin}" crossorigin>`,
        "font-family: monospace; color: #22c55e;"
      );
    });

    console.groupEnd();
  }

  // Best practices
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("%cPreload (current page critical resources):", "font-weight: bold;");
  console.log(
    '%c<link rel="preload" href="/font.woff2" as="font" type="font/woff2" crossorigin>',
    "font-family: monospace; color: #22c55e;"
  );
  console.log(
    '%c<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">',
    "font-family: monospace; color: #22c55e;"
  );
  console.log("");
  console.log("%cPreconnect (third-party origins):", "font-weight: bold;");
  console.log(
    '%c<link rel="preconnect" href="https://fonts.googleapis.com">',
    "font-family: monospace; color: #22c55e;"
  );
  console.log(
    '%c<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    "font-family: monospace; color: #22c55e;"
  );
  console.log("");
  console.log("%cPrefetch (next page resources):", "font-weight: bold;");
  console.log(
    '%c<link rel="prefetch" href="/next-page.js" as="script">',
    "font-family: monospace; color: #22c55e;"
  );
  console.groupEnd();

  console.groupEnd();
})();
