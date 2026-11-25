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
  const PRECONNECT_BUDGET = 4;
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
  const originOf = url => {
    try {
      return new URL(url, location.href).origin;
    } catch {
      return "";
    }
  };
  const withoutHash = url => {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return url;
    }
  };
  const modeOfCrossorigin = crossorigin => crossorigin && crossorigin !== "use-credentials" ? "anonymous" : "include";
  const elementsByUrl = (selector, urlOf) => {
    const map = new Map;
    document.querySelectorAll(selector).forEach(el => {
      const url = urlOf(el);
      if (url && !map.has(withoutHash(url))) map.set(withoutHash(url), el);
    });
    return map;
  };
  const scriptsByUrl = elementsByUrl("script[src]", el => el.src);
  const linksByUrl = elementsByUrl("link[href]", el => el.href);
  const imagesByUrl = elementsByUrl("img", el => el.currentSrc || el.src);
  const headerHintsByUrl = new Map(allHints.filter(h => h.source === "header").map(h => [ withoutHash(h.href), h ]));
  const FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;
  function credentialsMode(entry) {
    const url = withoutHash(entry.name);
    switch (entry.initiatorType) {
     case "script":
      {
        const script = scriptsByUrl.get(url);
        if (!script) return "unknown";
        if (script.type === "module") return script.crossOrigin === "use-credentials" ? "include" : "anonymous";
        return modeOfCrossorigin(script.crossOrigin);
      }

     case "link":
     case "early-hints":
      {
        const link = linksByUrl.get(url) || headerHintsByUrl.get(url);
        if (!link) return "unknown";
        const crossorigin = link.crossOrigin ?? link.crossorigin;
        if (link.rel === "modulepreload") return crossorigin === "use-credentials" ? "include" : "anonymous";
        return modeOfCrossorigin(crossorigin);
      }

     case "img":
      {
        const img = imagesByUrl.get(url);
        return modeOfCrossorigin(img ? img.crossOrigin : "");
      }

     case "css":
      return FONT_FILE.test(url) ? "anonymous" : "include";

     default:
      return "unknown";
    }
  }
  const connectionOf = r => {
    if (r.requestStart === 0) return "unknown";
    if (r.transferSize === 0 && r.decodedBodySize > 0) return "cache";
    return r.connectEnd > r.connectStart ? "new" : "reused";
  };
  const requestsByOrigin = new Map;
  const requestsByCredentials = {
    include: 0,
    anonymous: 0,
    unknown: 0
  };
  loadedResources.forEach(r => {
    const origin = originOf(r.name);
    if (!origin) return;
    const mode = credentialsMode(r);
    if (origin !== location.origin) requestsByCredentials[mode]++;
    if (!requestsByOrigin.has(origin)) requestsByOrigin.set(origin, []);
    requestsByOrigin.get(origin).push({
      url: r.name,
      startTime: r.startTime,
      mode: mode,
      connection: connectionOf(r)
    });
  });
  requestsByOrigin.forEach(requests => requests.sort((a, b) => a.startTime - b.startTime));
  const modeOfHint = h => modeOfCrossorigin(h.crossorigin);
  const preconnectsByOrigin = new Map;
  allHints.filter(h => h.rel === "preconnect").forEach(h => {
    const origin = originOf(h.href);
    const requests = requestsByOrigin.get(origin) || [];
    const first = requests.find(r => r.mode === modeOfHint(h));
    h.use = first ? "used" : requests.some(r => r.mode === "unknown") ? "unknown" : "unused";
    h.firstUse = first || null;
    if (!preconnectsByOrigin.has(origin)) preconnectsByOrigin.set(origin, []);
    preconnectsByOrigin.get(origin).push(h);
  });
  const MODE_WORDS = {
    anonymous: "without credentials (fonts, module scripts, scripts with crossorigin)",
    include: "with credentials (images, stylesheets, scripts without crossorigin)"
  };
  preconnectsByOrigin.forEach((hints, origin) => {
    const requests = requestsByOrigin.get(origin) || [];
    const explained = new Set;
    [ {
      mode: "anonymous",
      code: "preconnect-no-crossorigin",
      add: `<link rel="preconnect" href="${origin}" crossorigin>`,
      change: "Add crossorigin to this preconnect"
    }, {
      mode: "include",
      code: "preconnect-crossorigin-only",
      add: `<link rel="preconnect" href="${origin}">`,
      change: "Remove crossorigin from this preconnect"
    } ].forEach(({mode: mode, code: code, add: add, change: change}) => {
      if (!requests.some(r => r.mode === mode) || hints.some(h => modeOfHint(h) === mode)) return;
      const hint = hints.find(h => h.use === "unused") || hints[0];
      hints.filter(h => h.use === "unused").forEach(h => explained.add(h));
      issues.push({
        hint: hint,
        code: code,
        issue: `Requests ${MODE_WORDS[mode]} to ${origin} cannot use a preconnect ${mode === "anonymous" ? "without" : "with"} crossorigin`,
        severity: "warning",
        fix: hint.use === "unused" ? change : `Add a second preconnect: ${add}`
      });
    });
    hints.forEach(h => {
      if (h.firstUse?.connection !== "new" || firstByKey.get(hintKey(h)) !== h) return;
      issues.push({
        hint: h,
        code: "preconnect-not-reused",
        issue: `The first request ${MODE_WORDS[modeOfHint(h)].split(" (")[0]} to ${origin} started at ${Math.round(h.firstUse.startTime)} ms and opened a new connection, so the preconnected one was not used`,
        severity: "warning",
        fix: "A server or CDN can close a connection that carries no request, and Chrome closes an unused one after about 60 s: preconnect only to origins the page requests early, or remove the hint"
      });
    });
    hints.forEach(h => {
      if (h.use !== "unused" || explained.has(h) || firstByKey.get(hintKey(h)) !== h) return;
      issues.push({
        hint: h,
        code: "unused-preconnect",
        issue: requests.length === 0 ? `No resources loaded from ${origin}` : `No request ${modeOfHint(h) === "anonymous" ? "without" : "with"} credentials to ${origin}; its requests use another connection`,
        severity: "warning",
        fix: "Remove unused preconnect or verify it's needed for future resources"
      });
    });
  });
  allHints.filter(h => h.rel === "dns-prefetch").forEach(pc => {
    const hasResources = loadedResources.some(r => {
      try {
        return new URL(r.name).hostname === pc.hostname;
      } catch {
        return false;
      }
    });
    if (!hasResources && pc.hostname && firstByKey.get(hintKey(pc)) === pc) issues.push({
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
          types: new Set,
          firstStart: 1 / 0,
          modes: new Set
        });
        const data = thirdPartyOrigins.get(url.origin);
        data.count++;
        data.firstStart = Math.min(data.firstStart, r.startTime);
        const mode = credentialsMode(r);
        if (mode !== "unknown") data.modes.add(mode);
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
  const lcpEntry = PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint") ? await new Promise(resolve => {
    const entries = [];
    const observer = new PerformanceObserver(list => entries.push(...list.getEntries()));
    observer.observe({
      type: "largest-contentful-paint",
      buffered: true
    });
    setTimeout(() => {
      observer.disconnect();
      resolve(entries.at(-1) ?? null);
    }, 100);
  }) : null;
  const fcpEntry = performance.getEntriesByType("paint").find(e => e.name === "first-contentful-paint");
  const cutoff = lcpEntry ? {
    metric: "lcp",
    ms: Math.round(lcpEntry.startTime)
  } : fcpEntry ? {
    metric: "fcp",
    ms: Math.round(fcpEntry.startTime)
  } : {
    metric: null,
    ms: null
  };
  const preconnectBudget = {
    max: PRECONNECT_BUDGET,
    used: new Set(allHints.filter(h => h.rel === "preconnect").map(h => `${originOf(h.href)} ${modeOfHint(h)}`)).size
  };
  const earlyOrigins = [];
  thirdPartyOrigins.forEach((data, origin) => {
    if (preconnectedOrigins.has(origin)) return;
    if (cutoff.ms !== null && data.firstStart >= cutoff.ms) return;
    earlyOrigins.push({
      origin: origin,
      ...data
    });
  });
  earlyOrigins.sort((a, b) => a.firstStart - b.firstStart);
  earlyOrigins.forEach(o => {
    o.crossorigin = o.modes.size ? [ ...o.modes ].map(m => m === "anonymous" ? "anonymous" : "").sort() : [ "anonymous" ];
  });
  let left = Math.max(0, preconnectBudget.max - preconnectBudget.used);
  const fitting = earlyOrigins.findIndex(o => (left -= o.crossorigin.length) < 0);
  const missingPreconnects = fitting === -1 ? earlyOrigins : earlyOrigins.slice(0, fitting);
  const dnsPrefetchCandidates = earlyOrigins.slice(missingPreconnects.length);
  const preconnectTags = o => o.crossorigin.map(c => `<link rel="preconnect" href="${o.origin}"${c ? " crossorigin" : ""}>`);
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
        if (type.rel === "preconnect") {
          row.Used = {
            used: "✅",
            unused: "⚠️ No",
            unknown: "? fetch/XHR"
          }[h.use];
          row["First use"] = h.firstUse ? `${Math.round(h.firstUse.startTime)} ms` : "-";
          row.Connection = h.firstUse ? {
            reused: "✅ reused",
            new: "⚠️ new",
            cache: "cache",
            unknown: "? no TAO"
          }[h.firstUse.connection] : "-";
        }
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
    missingPreconnects.flatMap(preconnectTags).forEach(tag => {
    });
    if (missingPreconnects.some(o => o.modes.size === 0)) void 0;
    if (dnsPrefetchCandidates.length > 0) {
      dnsPrefetchCandidates.slice(0, 5).forEach(o => {
      });
    }
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
      requestsByCredentials: requestsByCredentials,
      headerHints: headerHints === null ? null : allHints.filter(h => h.source === "header").length,
      earlyHints: typeof navigationEntry?.firstInterimResponseStart === "number" ? navigationEntry.firstInterimResponseStart > 0 : null,
      byType: Object.fromEntries(hintTypes.map(t => [ t.rel, allHints.filter(h => h.rel === t.rel).length ])),
      missingPreconnectsCount: earlyOrigins.length,
      missingPreconnectsCutoff: cutoff,
      preconnectBudget: preconnectBudget,
      missingPreconnects: missingPreconnects.map(o => ({
        origin: o.origin,
        firstRequestStartMs: Math.round(o.firstStart),
        requestCount: o.count,
        sizeBytes: o.size,
        resourceTypes: Array.from(o.types),
        credentialsModes: [ ...o.modes ].sort(),
        recommendedHint: "preconnect",
        crossorigin: o.crossorigin
      })),
      dnsPrefetchCandidates: dnsPrefetchCandidates.slice(0, 20).map(o => ({
        origin: o.origin,
        firstRequestStartMs: Math.round(o.firstStart),
        requestCount: o.count
      }))
    },
    items: rankedHints.slice(0, MAX_ITEMS).map(h => ({
      rel: h.rel,
      href: h.href,
      source: h.source,
      as: h.as,
      crossorigin: h.crossorigin,
      fetchpriority: h.fetchpriority,
      use: h.use ?? null,
      firstUseUrl: h.firstUse?.url ?? null,
      firstUseMs: h.firstUse ? Math.round(h.firstUse.startTime) : null,
      firstUseConnection: h.firstUse?.connection ?? null
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
