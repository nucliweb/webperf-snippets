// DOM Size and Depth
// https://webperf-snippets.net

(() => {
  // Lighthouse "Avoid an excessive DOM size" thresholds
  const THRESHOLDS = { warnNodes: 800, errorNodes: 1400, maxDepth: 32, maxChildren: 60 };
  const MAX_ITEMS = 50;
  const SELECTOR_LEVELS = 4;

  // Short selector for reporting: stops at the nearest id, at most SELECTOR_LEVELS levels
  // up, and marks open shadow root boundaries with ">>>". Never returns DOM nodes.
  const selectorFor = (el) => {
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

  // @shared uniqueSelector
  // A CSS selector that matches only el in its document (or shadow root): its id when it is unique,
  // otherwise a path of tag, classes and :nth-of-type() that goes up to the nearest ancestor with a
  // unique id, or to the root, and stops as soon as it matches one element.
  function uniqueSelector(el) {
    const root = el.getRootNode();
    const matchesOne = (selector) => {
      try {
        return root.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    };
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.id && matchesOne(`#${window.CSS.escape(node.id)}`)) {
        parts.unshift(`#${window.CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      let part = tag + Array.from(node.classList).slice(0, 2).map((c) => `.${window.CSS.escape(c)}`).join("");
      const siblings = node.parentNode ? Array.from(node.parentNode.children) : [node];
      if (siblings.filter((s) => s.matches(part)).length > 1) {
        part += `:nth-of-type(${siblings.filter((s) => s.localName === tag).indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (matchesOne(parts.join(" > "))) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  // @end-shared uniqueSelector

  // An element of the document by its unique selector, which Inspect can select; one inside a shadow
  // root by the short path above, which marks the boundary
  const inspectableSelectorFor = (el) => (el.getRootNode() === document ? uniqueSelector(el) : selectorFor(el));

  // Iterative walk (explicit stack) so very deep trees cannot overflow the call stack.
  // Depth counts <html> as level 1 and continues through open shadow roots.
  let totalElements = 0;
  let maxDepth = 0;
  let deepest = null;
  let shadowRoots = 0;
  const parents = [];
  const stack = [document.documentElement, 1];

  while (stack.length) {
    const depth = stack.pop();
    const el = stack.pop();
    totalElements++;
    if (depth > maxDepth) {
      maxDepth = depth;
      deepest = el;
    }
    const roots = [el];
    if (el.shadowRoot) {
      shadowRoots++;
      roots.push(el.shadowRoot);
    }
    for (const root of roots) {
      const kids = root.children;
      if (kids.length) parents.push({ el, root, children: kids.length, depth });
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i], depth + 1);
    }
  }

  const ranked = parents
    .sort((a, b) => b.children - a.children || a.depth - b.depth);
  const widest = ranked[0] ?? null;
  const widestSelector = widest ? inspectableSelectorFor(widest.el) + (widest.root !== widest.el ? " (shadow root)" : "") : null;

  const items = ranked.slice(0, 10).map((p) => ({
    selector: inspectableSelectorFor(p.el) + (p.root !== p.el ? " (shadow root)" : ""),
    children: p.children,
    depth: p.depth,
  }));

  const issues = [];
  if (totalElements > THRESHOLDS.errorNodes) {
    issues.push({
      code: "too-many-nodes",
      severity: "error",
      message: `${totalElements} nodes exceeds ${THRESHOLDS.errorNodes}; a large DOM slows style recalculation and layout on every interaction`,
    });
  } else if (totalElements > THRESHOLDS.warnNodes) {
    issues.push({
      code: "too-many-nodes",
      severity: "warning",
      message: `${totalElements} nodes exceeds ${THRESHOLDS.warnNodes}; a large DOM increases style recalculation and layout cost`,
    });
  }
  if (maxDepth > THRESHOLDS.maxDepth) {
    issues.push({
      code: "too-deep",
      severity: "warning",
      message: `DOM depth of ${maxDepth} exceeds ${THRESHOLDS.maxDepth}; deep trees make style and layout work costlier (deepest: ${selectorFor(deepest)})`,
    });
  }
  if (widest && widest.children > THRESHOLDS.maxChildren) {
    issues.push({
      code: "too-many-children",
      severity: "warning",
      message: `${widestSelector} has ${widest.children} children, above ${THRESHOLDS.maxChildren}; consider virtualizing or paginating the list`,
    });
  }

  const deepestElement = deepest ? selectorFor(deepest) : null;

  // Human output
  console.group("%cDOM size and depth", "font-weight: bold; font-size: 14px;");
  console.log(`Elements: ${totalElements} (warn > ${THRESHOLDS.warnNodes}, error > ${THRESHOLDS.errorNodes})`);
  console.log(`Max depth: ${maxDepth} (limit ${THRESHOLDS.maxDepth}) at ${deepestElement}`);
  if (widest) console.log(`Widest parent: ${widestSelector} with ${widest.children} children (limit ${THRESHOLDS.maxChildren})`);
  console.log(`Open shadow roots traversed: ${shadowRoots}`);
  issues.forEach((i) => console.warn(`${i.severity}: ${i.message}`));
  if (items.length) console.table(items);
  console.groupEnd();

  // Agent output
  return {
    script: "DOM-Size-and-Depth",
    status: "ok",
    count: items.length,
    issues,
    items: items.slice(0, MAX_ITEMS),
    details: {
      totalElements,
      maxDepth,
      maxChildren: widest ? widest.children : 0,
      widestParent: widestSelector,
      deepestElement,
      shadowRoots,
      thresholds: THRESHOLDS,
    },
  };
})();
