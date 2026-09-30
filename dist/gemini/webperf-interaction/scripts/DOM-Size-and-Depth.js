(() => {
  const THRESHOLDS = {
    warnNodes: 800,
    errorNodes: 1400,
    maxDepth: 32,
    maxChildren: 60
  };
  const MAX_ITEMS = 50;
  const SELECTOR_LEVELS = 4;
  const selectorFor = el => {
    const parts = [];
    let node = el;
    let truncated = false;
    while (node && node.nodeType === 1) {
      if (parts.length === SELECTOR_LEVELS) {
        truncated = true;
        break;
      }
      let part = node.localName;
      if (node.id) {
        parts.unshift(`${part}#${window.CSS.escape(node.id)}`);
        break;
      }
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/)[0] : "";
      if (cls) part += `.${window.CSS.escape(cls)}`;
      parts.unshift(part);
      const parent = node.parentNode;
      if (parent && parent.nodeType === 11 && parent.host) {
        parts.unshift(">>>");
        node = parent.host;
        continue;
      }
      node = node.parentElement;
    }
    return (truncated ? "... > " : "") + parts.join(" > ").replace(/> >>> >/g, ">>>");
  };
  let totalElements = 0;
  let maxDepth = 0;
  let deepest = null;
  let shadowRoots = 0;
  const parents = [];
  const stack = [ document.documentElement, 1 ];
  while (stack.length) {
    const depth = stack.pop();
    const el = stack.pop();
    totalElements++;
    if (depth > maxDepth) {
      maxDepth = depth;
      deepest = el;
    }
    const roots = [ el ];
    if (el.shadowRoot) {
      shadowRoots++;
      roots.push(el.shadowRoot);
    }
    for (const root of roots) {
      const kids = root.children;
      if (kids.length) parents.push({
        el: el,
        root: root,
        children: kids.length,
        depth: depth
      });
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i], depth + 1);
    }
  }
  const ranked = parents.sort((a, b) => b.children - a.children || a.depth - b.depth);
  const widest = ranked[0] ?? null;
  const widestSelector = widest ? selectorFor(widest.el) + (widest.root !== widest.el ? " (shadow root)" : "") : null;
  const items = ranked.slice(0, 10).map(p => ({
    selector: selectorFor(p.el) + (p.root !== p.el ? " (shadow root)" : ""),
    children: p.children,
    depth: p.depth
  }));
  const issues = [];
  if (totalElements > THRESHOLDS.errorNodes) issues.push({
    severity: "error",
    message: `${totalElements} nodes exceeds ${THRESHOLDS.errorNodes}; a large DOM slows style recalculation and layout on every interaction`
  }); else if (totalElements > THRESHOLDS.warnNodes) issues.push({
    severity: "warning",
    message: `${totalElements} nodes exceeds ${THRESHOLDS.warnNodes}; a large DOM increases style recalculation and layout cost`
  });
  if (maxDepth > THRESHOLDS.maxDepth) issues.push({
    severity: "warning",
    message: `DOM depth of ${maxDepth} exceeds ${THRESHOLDS.maxDepth}; deep trees make style and layout work costlier (deepest: ${selectorFor(deepest)})`
  });
  if (widest && widest.children > THRESHOLDS.maxChildren) issues.push({
    severity: "warning",
    message: `${widestSelector} has ${widest.children} children, above ${THRESHOLDS.maxChildren}; consider virtualizing or paginating the list`
  });
  const deepestElement = deepest ? selectorFor(deepest) : null;
  if (widest) void 0;
  issues.forEach(i => {});
  if (items.length) void 0;
  return {
    script: "DOM-Size-and-Depth",
    status: "ok",
    count: items.length,
    issues: issues,
    items: items.slice(0, MAX_ITEMS),
    details: {
      totalElements: totalElements,
      maxDepth: maxDepth,
      maxChildren: widest ? widest.children : 0,
      widestParent: widestSelector,
      deepestElement: deepestElement,
      shadowRoots: shadowRoots,
      thresholds: THRESHOLDS
    }
  };
})();
