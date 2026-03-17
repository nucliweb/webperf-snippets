(() => {
  const formatBytes = bytes => {
    if (!bytes || bytes === 0) return "-";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  };
  const hintTypes = [ {
    rel: "preload",
    icon: "⚡",
    description: "Critical resource for current page",
    requiresAs: true
  }, {
    rel: "modulepreload",
    icon: "📦",
    description: "ES module for current page",
    requiresAs: false
  }, {
    rel: "preconnect",
    icon: "🔌",
    description: "Early connection to origin",
    requiresAs: false
  }, {
    rel: "dns-prefetch",
    icon: "🔍",
    description: "DNS lookup for origin",
    requiresAs: false
  }, {
    rel: "prefetch",
    icon: "📥",
    description: "Resource for future navigation",
    requiresAs: false
  }, {
    rel: "prerender",
    icon: "🖼️",
    description: "Pre-render page",
    requiresAs: false
  } ];
  const allHints = [];
  const issues = [];
  hintTypes.forEach(type => {
    const links = document.querySelectorAll(`link[rel="${type.rel}"]`);
    links.forEach(link => {
      const href = link.href || link.getAttribute("href") || "";
      let hostname = "";
      try {
        hostname = new URL(href, location.origin).hostname;
      } catch {}
      const hint = {
        rel: type.rel,
        icon: type.icon,
        href: href,
        shortHref: href.length > 50 ? "..." + href.slice(-47) : href,
        hostname: hostname,
        as: link.getAttribute("as") || "",
        crossorigin: link.crossOrigin || link.getAttribute("crossorigin") || "",
        fetchpriority: link.fetchPriority || link.getAttribute("fetchpriority") || "",
        type: link.type || "",
        media: link.media || "",
        element: link
      };
      allHints.push(hint);
      if (type.requiresAs && !hint.as) issues.push({
        hint: hint,
        issue: "Missing 'as' attribute (required for preload)",
        severity: "error",
        fix: `Add as="script|style|font|image|fetch"`
      });
      if (hint.as === "font" && !hint.crossorigin) issues.push({
        hint: hint,
        issue: "Font preload without crossorigin (causes double fetch)",
        severity: "error",
        fix: 'Add crossorigin="anonymous"'
      });
      if (type.rel === "preconnect" && !hint.crossorigin) {
        const corsResources = performance.getEntriesByType("resource").filter(r => r.name.includes(hostname) && (r.initiatorType === "script" || r.initiatorType === "css" || r.initiatorType === "font"));
        if (corsResources.length > 0) issues.push({
          hint: hint,
          issue: "Preconnect may need crossorigin for CORS resources",
          severity: "warning",
          fix: 'Consider adding crossorigin="anonymous"'
        });
      }
    });
  });
  const preloads = allHints.filter(h => h.rel === "preload");
  const loadedResources = performance.getEntriesByType("resource");
  preloads.forEach(preload => {
    const wasUsed = loadedResources.some(r => r.name === preload.href);
    if (!wasUsed) issues.push({
      hint: preload,
      issue: "Preloaded resource not used within page load",
      severity: "warning",
      fix: "Remove unused preload or verify it's needed"
    });
  });
  const preconnects = allHints.filter(h => h.rel === "preconnect" || h.rel === "dns-prefetch");
  preconnects.forEach(pc => {
    const hasResources = loadedResources.some(r => {
      try {
        return new URL(r.name).hostname === pc.hostname;
      } catch {
        return false;
      }
    });
    if (!hasResources && pc.hostname) issues.push({
      hint: pc,
      issue: `No resources loaded from ${pc.hostname}`,
      severity: "warning",
      fix: "Remove unused preconnect or verify it's needed for future resources"
    });
  });
  if (preloads.length > 6) issues.push({
    hint: {
      rel: "preload",
      href: `${preloads.length} preloads`
    },
    issue: `Too many preloads (${preloads.length}) - they compete for bandwidth`,
    severity: "warning",
    fix: "Limit to 5-6 most critical resources"
  });
  const thirdPartyOrigins = new Map;
  loadedResources.forEach(r => {
    try {
      const url = new URL(r.name);
      if (url.hostname !== location.hostname) {
        if (!thirdPartyOrigins.has(url.origin)) thirdPartyOrigins.set(url.origin, {
          count: 0,
          size: 0,
          types: new Set
        });
        const data = thirdPartyOrigins.get(url.origin);
        data.count++;
        data.size += r.transferSize || 0;
        data.types.add(r.initiatorType);
      }
    } catch {}
  });
  const preconnectedOrigins = new Set([ ...preconnects ].map(p => {
    try {
      return new URL(p.href).origin;
    } catch {
      return "";
    }
  }));
  const missingPreconnects = [];
  thirdPartyOrigins.forEach((data, origin) => {
    if (!preconnectedOrigins.has(origin) && data.count >= 2) missingPreconnects.push({
      origin: origin,
      ...data
    });
  });
  const summary = hintTypes.map(type => {
    const count = allHints.filter(h => h.rel === type.rel).length;
    return {
      type: type.rel,
      count: count,
      icon: type.icon
    };
  });
  summary.forEach(s => {
    s.count;
  });
  hintTypes.forEach(type => {
    const hints = allHints.filter(h => h.rel === type.rel);
    if (hints.length === 0) return;
    hints.map(h => {
      const row = {
        Resource: h.shortHref
      };
      if (type.rel === "preload" || type.rel === "modulepreload") {
        row.As = h.as || "⚠️ missing";
        row.Crossorigin = h.crossorigin || "-";
        if (h.fetchpriority) row.Priority = h.fetchpriority;
        const used = loadedResources.some(r => r.name === h.href);
        row.Used = used ? "✅" : "⚠️ No";
      }
      if (type.rel === "preconnect" || type.rel === "dns-prefetch") {
        row.Origin = h.hostname;
        row.Crossorigin = h.crossorigin || "-";
        const originResources = loadedResources.filter(r => {
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
    hints.forEach((h, i) => {
    });
  });
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  if (issues.length > 0) {
    if (errors.length > 0) {
      errors.forEach(issue => {
      });
    }
    if (warnings.length > 0) {
      warnings.forEach(issue => {
        if (issue.hint.href) void 0;
      });
    }
  } else {
  }
  if (missingPreconnects.length > 0) {
    missingPreconnects.sort((a, b) => b.count - a.count).slice(0, 5).map(o => ({
      Origin: o.origin,
      Resources: o.count,
      Size: formatBytes(o.size),
      Types: Array.from(o.types).join(", ")
    }));
    missingPreconnects.slice(0, 3).forEach(o => {
    });
  }
  return {
    script: "Resource-Hints",
    status: "ok",
    count: allHints.length,
    details: {
      byType: Object.fromEntries(hintTypes.map(t => [ t.rel, allHints.filter(h => h.rel === t.rel).length ])),
      missingPreconnectsCount: missingPreconnects.length
    },
    items: allHints.map(h => ({
      rel: h.rel,
      href: h.shortHref,
      as: h.as,
      crossorigin: h.crossorigin,
      fetchpriority: h.fetchpriority
    })),
    issues: issues.map(i => ({
      severity: i.severity,
      message: `${i.hint.rel}: ${i.issue}. Fix: ${i.fix}`
    }))
  };
})();
