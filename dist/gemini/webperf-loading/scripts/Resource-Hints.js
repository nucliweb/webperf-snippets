(async () => {
  function isOwnRequest(entry) {
    return entry.name.endsWith("#webperf-snippets");
  }
  function ownRequestUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/^https?:$/.test(parsed.protocol)) return url;
      parsed.hash = "webperf-snippets";
      return parsed.href;
    } catch {
      return url;
    }
  }
  function parseLinkHeader(value) {
    const parts = [];
    let current = "";
    let inUrl = false;
    let inQuote = false;
    for (const ch of value || "") {
      if (ch === "<" && !inQuote) inUrl = true; else if (ch === ">" && !inQuote) inUrl = false; else if (ch === '"' && !inUrl) inQuote = !inQuote;
      if (ch === "," && !inUrl && !inQuote) {
        parts.push(current);
        current = "";
      } else current += ch;
    }
    parts.push(current);
    const hints = [];
    for (const part of parts) {
      const match = part.match(/^\s*<([^>]*)>([\s\S]*)$/);
      if (!match) continue;
      const params = {};
      for (const param of match[2].split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        const [rawKey, ...rest] = param.split("=");
        const key = rawKey.trim().toLowerCase();
        if (key && !(key in params)) params[key] = rest.join("=").trim().replace(/^"([\s\S]*)"$/, "$1");
      }
      let href;
      try {
        href = new URL(match[1].trim(), location.href).href;
      } catch {
        continue;
      }
      const crossorigin = !("crossorigin" in params) ? "" : params.crossorigin.toLowerCase() === "use-credentials" ? "use-credentials" : "anonymous";
      for (const rel of (params.rel || "").toLowerCase().split(/\s+/).filter(Boolean)) hints.push({
        rel: rel,
        href: href,
        as: params.as || "",
        crossorigin: crossorigin,
        fetchpriority: params.fetchpriority || "",
        type: params.type || "",
        media: params.media || ""
      });
    }
    return hints;
  }
  async function readHeaderHints() {
    try {
      const response = await fetch(ownRequestUrl(location.href), {
        method: "HEAD",
        credentials: "include"
      });
      if (!response.ok) return null;
      return parseLinkHeader(response.headers.get("link"));
    } catch {
      return null;
    }
  }
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
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
  const headerHints = await readHeaderHints();
  const declaredHints = (headerHints || []).filter(h => hintTypes.some(t => t.rel === h.rel)).map(h => ({
    ...h,
    element: null,
    source: "header"
  }));
  hintTypes.forEach(type => {
    document.querySelectorAll(`link[rel="${type.rel}"]`).forEach(link => {
      declaredHints.push({
        rel: type.rel,
        href: link.href || link.getAttribute("href") || "",
        as: link.getAttribute("as") || "",
        crossorigin: link.crossOrigin || link.getAttribute("crossorigin") || "",
        fetchpriority: link.fetchPriority || link.getAttribute("fetchpriority") || "",
        type: link.type || "",
        media: link.media || "",
        element: link,
        source: "dom"
      });
    });
  });
  const hintKey = h => {
    let origin = h.href;
    try {
      origin = new URL(h.href).origin;
    } catch {}
    if (h.rel === "dns-prefetch") return `${h.rel} ${origin}`;
    if (h.rel === "preconnect") return `${h.rel} ${origin} ${h.crossorigin}`;
    return `${h.rel} ${h.href} ${h.as} ${h.crossorigin}`;
  };
  const sourceLabel = {
    dom: "the HTML",
    header: "the Link header"
  };
  const allHints = [];
  const issues = [];
  const firstByKey = new Map;
  let ignoredHints = 0;
  if (headerHints === null) issues.push({
    hint: {
      rel: "Link header",
      href: ""
    },
    code: "header-hints-unavailable",
    issue: "Could not read the Link header of the document (the HEAD request failed)",
    severity: "info",
    fix: "Hints sent only in the Link header or as 103 Early Hints are not in this report"
  });
  declaredHints.forEach(declared => {
    const type = hintTypes.find(t => t.rel === declared.rel);
    const href = declared.href;
    let protocol = "";
    try {
      protocol = new URL(href, location.href).protocol;
    } catch {}
    if (protocol !== "http:" && protocol !== "https:") {
      ignoredHints++;
      return;
    }
    let hostname = "";
    try {
      hostname = new URL(href, location.origin).hostname;
    } catch {}
    const hint = {
      ...declared,
      icon: type.icon,
      shortHref: href.length > 50 ? "..." + href.slice(-47) : href,
      hostname: hostname
    };
    allHints.push(hint);
    const first = firstByKey.get(hintKey(hint));
    if (first) issues.push({
      hint: hint,
      code: "duplicate-hint",
      issue: first.source === hint.source ? `Declared twice in ${sourceLabel[hint.source]}` : "Declared both in the Link header and in the HTML",
      severity: "info",
      fix: "Keep one of them"
    }); else firstByKey.set(hintKey(hint), hint);
    if (type.requiresAs && !hint.as) issues.push({
      hint: hint,
      code: "preload-missing-as",
      issue: "Missing 'as' attribute (required for preload)",
      severity: "error",
      fix: `Add as="script|style|font|image|fetch"`
    });
    if (hint.as === "font" && !hint.crossorigin) issues.push({
      hint: hint,
      code: "font-preload-no-crossorigin",
      issue: "Font preload without crossorigin (causes double fetch)",
      severity: "error",
      fix: 'Add crossorigin="anonymous"'
    });
    if (type.rel === "preconnect" && !hint.crossorigin) {
      const corsResources = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e)).filter(r => r.name.includes(hostname) && (r.initiatorType === "script" || r.initiatorType === "css" || r.initiatorType === "font"));
      if (corsResources.length > 0) issues.push({
        hint: hint,
        code: "preconnect-no-crossorigin",
        issue: "Preconnect may need crossorigin for CORS resources",
        severity: "warning",
        fix: 'Consider adding crossorigin="anonymous"'
      });
    }
  });
  const preloads = allHints.filter(h => h.rel === "preload");
  const loadedResources = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e));
  preloads.forEach(preload => {
    const wasUsed = loadedResources.some(r => r.name === preload.href);
    if (!wasUsed) issues.push({
      hint: preload,
      code: "unused-preload",
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
      code: "unused-preconnect",
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
    code: "too-many-preloads",
    issue: `Too many preloads (${preloads.length}) - they compete for bandwidth`,
    severity: "warning",
    fix: "Limit to 5-6 most critical resources"
  });
  const thirdPartyOrigins = new Map;
  let sizeUnknownCount = 0;
  loadedResources.forEach(r => {
    try {
      const url = new URL(r.name);
      if (url.hostname !== location.hostname) {
        if (!thirdPartyOrigins.has(url.origin)) thirdPartyOrigins.set(url.origin, {
          count: 0,
          size: null,
          types: new Set
        });
        const data = thirdPartyOrigins.get(url.origin);
        data.count++;
        if (r.transferSize === 0 && r.encodedBodySize === 0 && r.decodedBodySize === 0 && r.duration > 0) sizeUnknownCount++; else data.size = (data.size ?? 0) + (r.transferSize || 0);
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
        Resource: h.shortHref,
        Source: h.source === "header" ? "Link header" : "HTML"
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
  const infos = issues.filter(i => i.severity === "info");
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
    if (infos.length > 0) {
      infos.forEach(issue => {
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
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const MAX_ITEMS = 50;
  const hintRank = h => issues.some(i => i.hint === h && i.severity === "error") ? 0 : issues.some(i => i.hint === h) ? 1 : 2;
  const rankedHints = allHints.map((h, index) => ({
    h: h,
    index: index
  })).sort((a, b) => hintRank(a.h) - hintRank(b.h) || a.index - b.index).map(({h: h}) => h);
  return {
    script: "Resource-Hints",
    status: "ok",
    count: allHints.length,
    corsLimitedAnalysis: sizeUnknownCount > 0,
    details: {
      sizeUnknownCount: sizeUnknownCount,
      ignoredHints: ignoredHints,
      headerHints: headerHints === null ? null : allHints.filter(h => h.source === "header").length,
      earlyHints: typeof navigationEntry?.firstInterimResponseStart === "number" ? navigationEntry.firstInterimResponseStart > 0 : null,
      byType: Object.fromEntries(hintTypes.map(t => [ t.rel, allHints.filter(h => h.rel === t.rel).length ])),
      missingPreconnectsCount: missingPreconnects.length,
      missingPreconnects: missingPreconnects.slice(0, 20).map(o => ({
        origin: o.origin,
        requestCount: o.count,
        sizeBytes: o.size,
        resourceTypes: Array.from(o.types),
        recommendedHint: "preconnect"
      }))
    },
    items: rankedHints.slice(0, MAX_ITEMS).map(h => ({
      rel: h.rel,
      href: h.href,
      source: h.source,
      as: h.as,
      crossorigin: h.crossorigin,
      fetchpriority: h.fetchpriority
    })),
    issues: issues.map(i => ({
      code: i.code,
      severity: i.severity,
      message: `${i.hint.rel}: ${i.issue}. Fix: ${i.fix}`,
      ...i.hint.source ? {
        target: i.hint.href
      } : {}
    }))
  };
})();
