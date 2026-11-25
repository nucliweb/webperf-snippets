// Resource Hints Analysis
// https://webperf-snippets.net

(async () => {
  // @shared isOwnRequest
  // True for the Resource Timing entry of a request a snippet made with ownRequestUrl: the page
  // did not make it, so no snippet counts it.
  function isOwnRequest(entry) {
    return entry.name.endsWith("#webperf-snippets");
  }
  // @end-shared isOwnRequest

  // @shared ownRequestUrl
  // The URL a snippet requests when it reads a file of the page itself (fetch, a HEAD request,
  // new Image()). The fragment never reaches the server or the HTTP cache key, so the file still
  // comes from the cache, but it stays in the name of the Resource Timing entry of the request,
  // which is how isOwnRequest leaves these requests out of what the page loaded.
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
  // @end-shared ownRequestUrl

  // The hints of a Link header: `<url>; rel=preconnect; crossorigin, </font.woff2>; rel="preload"; as=font`.
  // A comma or a semicolon inside <...> or quotes does not split, a rel with several tokens gives one
  // hint per token, and URLs resolve against the page. crossorigin is read as the crossOrigin property
  // of a <link> reads it: "" when missing, "use-credentials", or "anonymous" for any other value.
  function parseLinkHeader(value) {
    const parts = [];
    let current = "";
    let inUrl = false;
    let inQuote = false;
    for (const ch of value || "") {
      if (ch === "<" && !inQuote) inUrl = true;
      else if (ch === ">" && !inQuote) inUrl = false;
      else if (ch === '"' && !inUrl) inQuote = !inQuote;
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
      const crossorigin = !("crossorigin" in params)
        ? ""
        : params.crossorigin.toLowerCase() === "use-credentials" ? "use-credentials" : "anonymous";
      for (const rel of (params.rel || "").toLowerCase().split(/\s+/).filter(Boolean)) {
        hints.push({ rel, href, as: params.as || "", crossorigin, fetchpriority: params.fetchpriority || "", type: params.type || "", media: params.media || "" });
      }
    }
    return hints;
  }

  // The hints of the Link header of the document. The page cannot read the headers of its own
  // navigation, so it asks for them again with a HEAD request; null when that request fails.
  async function readHeaderHints() {
    try {
      const response = await fetch(ownRequestUrl(location.href), { method: "HEAD", credentials: "include" });
      if (!response.ok) return null;
      return parseLinkHeader(response.headers.get("link"));
    } catch {
      return null;
    }
  }

  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

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

  // The hints of the Link header come first, as the browser gets them before the HTML
  const headerHints = await readHeaderHints();
  const declaredHints = (headerHints || [])
    .filter((h) => hintTypes.some((t) => t.rel === h.rel))
    .map((h) => ({ ...h, element: null, source: "header" }));
  hintTypes.forEach((type) => {
    document.querySelectorAll(`link[rel="${type.rel}"]`).forEach((link) => {
      declaredHints.push({
        rel: type.rel,
        href: link.href || link.getAttribute("href") || "",
        as: link.getAttribute("as") || "",
        crossorigin: link.crossOrigin || link.getAttribute("crossorigin") || "",
        fetchpriority: link.fetchPriority || link.getAttribute("fetchpriority") || "",
        type: link.type || "",
        media: link.media || "",
        element: link,
        source: "dom",
      });
    });
  });

  // Two hints are the same when the browser would do the same work for both: the same connection
  // for a preconnect (origin and crossorigin), the same lookup for a dns-prefetch, the same fetch otherwise
  const hintKey = (h) => {
    let origin = h.href;
    try {
      origin = new URL(h.href).origin;
    } catch {}
    if (h.rel === "dns-prefetch") return `${h.rel} ${origin}`;
    if (h.rel === "preconnect") return `${h.rel} ${origin} ${h.crossorigin}`;
    return `${h.rel} ${h.href} ${h.as} ${h.crossorigin}`;
  };
  const sourceLabel = { dom: "the HTML", header: "the Link header" };

  const allHints = [];
  const issues = [];
  const firstByKey = new Map();
  // Hints with a URL that is not http or https, such as those a browser extension injects
  // (chrome-extension://), are not the page's
  let ignoredHints = 0;

  if (headerHints === null) {
    issues.push({
      hint: { rel: "Link header", href: "" },
      code: "header-hints-unavailable",
      issue: "Could not read the Link header of the document (the HEAD request failed)",
      severity: "info",
      fix: "Hints sent only in the Link header or as 103 Early Hints are not in this report",
    });
  }

  declaredHints.forEach((declared) => {
    const type = hintTypes.find((t) => t.rel === declared.rel);
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
      hostname,
    };

    allHints.push(hint);

    const first = firstByKey.get(hintKey(hint));
    if (first) {
      issues.push({
        hint,
        code: "duplicate-hint",
        issue: first.source === hint.source
          ? `Declared twice in ${sourceLabel[hint.source]}`
          : "Declared both in the Link header and in the HTML",
        severity: "info",
        fix: "Keep one of them",
      });
    } else {
      firstByKey.set(hintKey(hint), hint);
    }

    // Check for issues
    if (type.requiresAs && !hint.as) {
      issues.push({
        hint,
        code: "preload-missing-as",
        issue: "Missing 'as' attribute (required for preload)",
        severity: "error",
        fix: `Add as="script|style|font|image|fetch"`,
      });
    }

    if (hint.as === "font" && !hint.crossorigin) {
      issues.push({
        hint,
        code: "font-preload-no-crossorigin",
        issue: "Font preload without crossorigin (causes double fetch)",
        severity: "error",
        fix: 'Add crossorigin="anonymous"',
      });
    }
  });

  // Check for unused preloads
  const preloads = allHints.filter((h) => h.rel === "preload");
  const loadedResources = performance.getEntriesByType("resource").filter((e) => !isOwnRequest(e));

  preloads.forEach((preload) => {
    const wasUsed = loadedResources.some((r) => r.name === preload.href);
    if (!wasUsed) {
      issues.push({
        hint: preload,
        code: "unused-preload",
        issue: "Preloaded resource not used within page load",
        severity: "warning",
        fix: "Remove unused preload or verify it's needed",
      });
    }
  });

  // Preconnects and dns-prefetches, for the origins that need no other hint
  const preconnects = allHints.filter(
    (h) => h.rel === "preconnect" || h.rel === "dns-prefetch"
  );

  const originOf = (url) => {
    try {
      return new URL(url, location.href).origin;
    } catch {
      return "";
    }
  };
  const withoutHash = (url) => {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return url;
    }
  };

  // The credentials mode of a request decides which connection it can use: a preconnect without
  // crossorigin opens one for requests that send credentials ("include"), such as images, stylesheets
  // and classic scripts; one with crossorigin opens one for requests that do not ("anonymous"), such
  // as fonts, module scripts and scripts with crossorigin. Resource Timing does not report the mode,
  // so it is read from the element that made the request. It is "unknown" when nothing says it: a
  // fetch() or an XMLHttpRequest can go either way, and a script no longer in the DOM can be either.
  const modeOfCrossorigin = (crossorigin) => (crossorigin && crossorigin !== "use-credentials" ? "anonymous" : "include");
  const elementsByUrl = (selector, urlOf) => {
    const map = new Map();
    document.querySelectorAll(selector).forEach((el) => {
      const url = urlOf(el);
      if (url && !map.has(withoutHash(url))) map.set(withoutHash(url), el);
    });
    return map;
  };
  const scriptsByUrl = elementsByUrl("script[src]", (el) => el.src);
  const linksByUrl = elementsByUrl("link[href]", (el) => el.href);
  const imagesByUrl = elementsByUrl("img", (el) => el.currentSrc || el.src);
  const headerHintsByUrl = new Map(allHints.filter((h) => h.source === "header").map((h) => [withoutHash(h.href), h]));
  const FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;

  function credentialsMode(entry) {
    const url = withoutHash(entry.name);
    switch (entry.initiatorType) {
      case "script": {
        const script = scriptsByUrl.get(url);
        if (!script) return "unknown";
        // A module script is fetched with CORS and sends no credentials to another origin
        if (script.type === "module") return script.crossOrigin === "use-credentials" ? "include" : "anonymous";
        return modeOfCrossorigin(script.crossOrigin);
      }
      case "link":
      case "early-hints": {
        const link = linksByUrl.get(url) || headerHintsByUrl.get(url);
        if (!link) return "unknown";
        const crossorigin = link.crossOrigin ?? link.crossorigin;
        if (link.rel === "modulepreload") return crossorigin === "use-credentials" ? "include" : "anonymous";
        return modeOfCrossorigin(crossorigin);
      }
      case "img": {
        // An image sends credentials unless it has crossorigin; one that is not in the DOM, such as a
        // tracking pixel made with new Image(), almost never has it
        const img = imagesByUrl.get(url);
        return modeOfCrossorigin(img ? img.crossOrigin : "");
      }
      case "css":
        // A font of a stylesheet is always fetched with CORS; its images and imports send credentials
        return FONT_FILE.test(url) ? "anonymous" : "include";
      default:
        return "unknown";
    }
  }

  // The requests to each origin, in the order they started, with their credentials mode
  const requestsByOrigin = new Map();
  const requestsByCredentials = { include: 0, anonymous: 0, unknown: 0 };
  loadedResources.forEach((r) => {
    const origin = originOf(r.name);
    if (!origin) return;
    const mode = credentialsMode(r);
    if (origin !== location.origin) requestsByCredentials[mode]++;
    if (!requestsByOrigin.has(origin)) requestsByOrigin.set(origin, []);
    requestsByOrigin.get(origin).push({ url: r.name, startTime: r.startTime, mode });
  });
  requestsByOrigin.forEach((requests) => requests.sort((a, b) => a.startTime - b.startTime));

  // Each preconnect is used by the first request of its mode to its origin. Without one, it is
  // "unknown" when a request of unknown mode went to the origin, and "unused" otherwise.
  const modeOfHint = (h) => modeOfCrossorigin(h.crossorigin);
  const preconnectsByOrigin = new Map();
  allHints.filter((h) => h.rel === "preconnect").forEach((h) => {
    const origin = originOf(h.href);
    const requests = requestsByOrigin.get(origin) || [];
    const first = requests.find((r) => r.mode === modeOfHint(h));
    h.use = first ? "used" : requests.some((r) => r.mode === "unknown") ? "unknown" : "unused";
    h.firstUse = first || null;
    if (!preconnectsByOrigin.has(origin)) preconnectsByOrigin.set(origin, []);
    preconnectsByOrigin.get(origin).push(h);
  });

  const MODE_WORDS = {
    anonymous: "without credentials (fonts, module scripts, scripts with crossorigin)",
    include: "with credentials (images, stylesheets, scripts without crossorigin)",
  };
  preconnectsByOrigin.forEach((hints, origin) => {
    const requests = requestsByOrigin.get(origin) || [];
    const explained = new Set();
    // Requests of one mode with no preconnect of that mode: one issue for the origin
    [
      { mode: "anonymous", code: "preconnect-no-crossorigin", add: `<link rel="preconnect" href="${origin}" crossorigin>`, change: "Add crossorigin to this preconnect" },
      { mode: "include", code: "preconnect-crossorigin-only", add: `<link rel="preconnect" href="${origin}">`, change: "Remove crossorigin from this preconnect" },
    ].forEach(({ mode, code, add, change }) => {
      if (!requests.some((r) => r.mode === mode) || hints.some((h) => modeOfHint(h) === mode)) return;
      const hint = hints.find((h) => h.use === "unused") || hints[0];
      hints.filter((h) => h.use === "unused").forEach((h) => explained.add(h));
      issues.push({
        hint,
        code,
        issue: `Requests ${MODE_WORDS[mode]} to ${origin} cannot use a preconnect ${mode === "anonymous" ? "without" : "with"} crossorigin`,
        severity: "warning",
        fix: hint.use === "unused" ? change : `Add a second preconnect: ${add}`,
      });
    });
    hints.forEach((h) => {
      if (h.use !== "unused" || explained.has(h) || firstByKey.get(hintKey(h)) !== h) return;
      issues.push({
        hint: h,
        code: "unused-preconnect",
        issue: requests.length === 0
          ? `No resources loaded from ${origin}`
          : `No request ${modeOfHint(h) === "anonymous" ? "without" : "with"} credentials to ${origin}; its requests use another connection`,
        severity: "warning",
        fix: "Remove unused preconnect or verify it's needed for future resources",
      });
    });
  });

  // A dns-prefetch only resolves the host name, which any request to it uses
  allHints.filter((h) => h.rel === "dns-prefetch").forEach((pc) => {
    const hasResources = loadedResources.some((r) => {
      try {
        return new URL(r.name).hostname === pc.hostname;
      } catch {
        return false;
      }
    });
    if (!hasResources && pc.hostname && firstByKey.get(hintKey(pc)) === pc) {
      issues.push({
        hint: pc,
        code: "unused-preconnect",
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
      code: "too-many-preloads",
      issue: `Too many preloads (${preloads.length}) - they compete for bandwidth`,
      severity: "warning",
      fix: "Limit to 5-6 most critical resources",
    });
  }

  // Get third-party origins that could benefit from preconnect
  const thirdPartyOrigins = new Map();
  // Third-party resources without Timing-Allow-Origin report every size as 0
  let sizeUnknownCount = 0;
  loadedResources.forEach((r) => {
    try {
      const url = new URL(r.name);
      if (url.hostname !== location.hostname) {
        if (!thirdPartyOrigins.has(url.origin)) {
          thirdPartyOrigins.set(url.origin, { count: 0, size: null, types: new Set() });
        }
        const data = thirdPartyOrigins.get(url.origin);
        data.count++;
        // The size stays null while no resource of the origin has a known one
        if (r.transferSize === 0 && r.encodedBodySize === 0 && r.decodedBodySize === 0 && r.duration > 0) sizeUnknownCount++;
        else data.size = (data.size ?? 0) + (r.transferSize || 0);
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
        Source: h.source === "header" ? "Link header" : "HTML",
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
        if (type.rel === "preconnect") {
          row.Used = { used: "✅", unused: "⚠️ No", unknown: "? fetch/XHR" }[h.use];
          row["First use"] = h.firstUse ? `${Math.round(h.firstUse.startTime)} ms` : "-";
        }
      }

      return row;
    });

    console.table(tableData);

    // Elements for inspection
    console.log("%c🔎 Elements:", "font-weight: bold;");
    hints.forEach((h, i) => {
      console.log(`${i + 1}.`, h.element ?? `${h.href} (Link header)`);
    });

    console.groupEnd();
  });

  // Issues
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  if (issues.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Issues Found (${errors.length} errors, ${warnings.length} warnings, ${infos.length} info)`,
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

    if (infos.length > 0) {
      console.log("");
      console.log("%cℹ️ Info:", "font-weight: bold; color: #3b82f6;");
      infos.forEach((issue) => {
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

  const navigationEntry = performance.getEntriesByType("navigation")[0];

  // The list keeps 50 hints: those with an error or a warning first, then in document order; count and details cover all of them
  const MAX_ITEMS = 50;
  const hintRank = (h) => (issues.some((i) => i.hint === h && i.severity === "error") ? 0 : issues.some((i) => i.hint === h) ? 1 : 2);
  const rankedHints = allHints
    .map((h, index) => ({ h, index }))
    .sort((a, b) => hintRank(a.h) - hintRank(b.h) || a.index - b.index)
    .map(({ h }) => h);
  return {
    script: "Resource-Hints",
    status: "ok",
    count: allHints.length,
    corsLimitedAnalysis: sizeUnknownCount > 0,
    details: {
      sizeUnknownCount,
      ignoredHints,
      // The requests to other origins by credentials mode, inferred from the DOM; "unknown" ones
      // (fetch, XMLHttpRequest) leave the preconnects of their origin unjudged
      requestsByCredentials,
      // null when the Link header could not be read
      headerHints: headerHints === null ? null : allHints.filter((h) => h.source === "header").length,
      // Whether the server sent a 103 Early Hints response; null where the browser does not say
      earlyHints: typeof navigationEntry?.firstInterimResponseStart === "number" ? navigationEntry.firstInterimResponseStart > 0 : null,
      byType: Object.fromEntries(hintTypes.map(t => [t.rel, allHints.filter(h => h.rel === t.rel).length])),
      missingPreconnectsCount: missingPreconnects.length,
      missingPreconnects: missingPreconnects.slice(0, 20).map((o) => ({
        origin: o.origin,
        requestCount: o.count,
        sizeBytes: o.size,
        resourceTypes: Array.from(o.types),
        recommendedHint: "preconnect",
      })),
    },
    items: rankedHints.slice(0, MAX_ITEMS).map(h => ({ rel: h.rel, href: h.href, source: h.source, as: h.as, crossorigin: h.crossorigin, fetchpriority: h.fetchpriority, use: h.use ?? null, firstUseUrl: h.firstUse?.url ?? null, firstUseMs: h.firstUse ? Math.round(h.firstUse.startTime) : null })),
    issues: issues.map(i => ({ code: i.code, severity: i.severity, message: `${i.hint.rel}: ${i.issue}. Fix: ${i.fix}`, ...(i.hint.source ? { target: i.hint.href } : {}) })),
  };
})();
