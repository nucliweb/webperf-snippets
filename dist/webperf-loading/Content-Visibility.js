function uniqueSelector(el) {
  const root = el.getRootNode();
  const matchesOne = selector => {
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
    let part = tag + Array.from(node.classList).slice(0, 2).map(c => `.${window.CSS.escape(c)}`).join("");
    const siblings = node.parentNode ? Array.from(node.parentNode.children) : [ node ];
    if (siblings.filter(s => s.matches(part)).length > 1) part += `:nth-of-type(${siblings.filter(s => s.localName === tag).indexOf(node) + 1})`;
    parts.unshift(part);
    if (matchesOne(parts.join(" > "))) break;
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function lacksIntrinsicSize(value) {
  return !/\d/.test(value);
}

function detectContentVisibility() {
  const results = {
    autoElements: [],
    hiddenElements: [],
    visibleElements: [],
    nodeArray: []
  };
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
  }
  function getElementInfo(node) {
    const rect = node.getBoundingClientRect();
    const cs = window.getComputedStyle(node);
    return {
      selector: uniqueSelector(node),
      contentVisibility: cs["content-visibility"],
      containIntrinsicSize: cs["contain-intrinsic-size"] || "not set",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top + window.scrollY),
      inViewport: isInViewport(node)
    };
  }
  function findContentVisibilityElements(node) {
    const cs = window.getComputedStyle(node);
    const cv = cs["content-visibility"];
    if (cv && cv !== "visible") {
      const info = getElementInfo(node);
      if (cv === "auto") {
        results.autoElements.push(info);
        results.nodeArray.push(node);
      } else if (cv === "hidden") results.hiddenElements.push(info);
    }
    for (let i = 0; i < node.children.length; i++) findContentVisibilityElements(node.children[i]);
  }
  findContentVisibilityElements(document.body);
  if (results.autoElements.length === 0 && results.hiddenElements.length === 0) {
  } else {
    if (results.autoElements.length > 0) {
    }
    if (results.hiddenElements.length > 0) {
    }
    const missingIntrinsicSize = results.autoElements.filter(el => lacksIntrinsicSize(el.containIntrinsicSize));
    if (missingIntrinsicSize.length > 0) {
    }
    results.nodeArray.forEach((node, i) => {
    });
  }
  return results;
}

function analyzeContentVisibilityOpportunities(options = {}) {
  const {threshold: threshold = 0, minHeight: minHeight = 100, minChildren: minChildren = 5} = options;
  const viewportHeight = window.innerHeight;
  const opportunities = [];
  const processedElements = new Set;
  function estimateRenderSavings(childCount) {
    const baseMs = childCount * 0.2;
    if (baseMs < 5) return "Low (~" + baseMs.toFixed(1) + "ms)";
    if (baseMs < 20) return "Medium (~" + baseMs.toFixed(1) + "ms)";
    return "High (~" + baseMs.toFixed(1) + "ms)";
  }
  function isAncestorProcessed(el) {
    let parent = el.parentElement;
    while (parent) {
      if (processedElements.has(parent)) return true;
      parent = parent.parentElement;
    }
    return false;
  }
  function analyzeElement(el) {
    if (processedElements.has(el) || isAncestorProcessed(el)) return;
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    if (cs["content-visibility"] && cs["content-visibility"] !== "visible") return;
    if (rect.height < minHeight || rect.width === 0) return;
    const distanceFromViewport = rect.top - viewportHeight;
    if (distanceFromViewport < threshold) return;
    const childCount = el.querySelectorAll("*").length;
    if (childCount < minChildren) return;
    processedElements.add(el);
    opportunities.push({
      selector: uniqueSelector(el),
      height: Math.round(rect.height) + "px",
      distanceFromViewport: Math.round(distanceFromViewport) + "px",
      childElements: childCount,
      estimatedSavings: estimateRenderSavings(childCount),
      element: el
    });
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
  while (walker.nextNode()) analyzeElement(walker.currentNode);
  opportunities.sort((a, b) => b.childElements - a.childElements);
  if (opportunities.length === 0) {
  } else {
    opportunities.slice(0, 20).map(opportunity => ({
      selector: opportunity.selector,
      height: opportunity.height,
      distanceFromViewport: opportunity.distanceFromViewport,
      childElements: opportunity.childElements,
      estimatedSavings: opportunity.estimatedSavings
    }));
    if (opportunities.length > 20) void 0;
    opportunities.slice(0, 10).forEach((opp, i) => {
    });
  }
  return {
    opportunities: opportunities.map(opportunity => ({
      selector: opportunity.selector,
      height: opportunity.height,
      distanceFromViewport: opportunity.distanceFromViewport,
      childElements: opportunity.childElements,
      estimatedSavings: opportunity.estimatedSavings
    })),
    totalElements: opportunities.length,
    highImpact: opportunities.filter(o => o.estimatedSavings.startsWith("High")).length,
    elements: opportunities.map(o => o.element)
  };
}

window.analyzeContentVisibilityOpportunities = analyzeContentVisibilityOpportunities;

(() => {
  const cvResults = detectContentVisibility();
  return {
    script: "Content-Visibility",
    status: "ok",
    count: cvResults.autoElements.length + cvResults.hiddenElements.length,
    details: {
      autoCount: cvResults.autoElements.length,
      hiddenCount: cvResults.hiddenElements.length
    },
    items: [ ...cvResults.autoElements.map(el => ({
      ...el,
      type: "auto"
    })), ...cvResults.hiddenElements.map(el => ({
      ...el,
      type: "hidden"
    })) ],
    issues: [ ...cvResults.autoElements.filter(el => lacksIntrinsicSize(el.containIntrinsicSize)).map(el => ({
      code: "missing-intrinsic-size",
      severity: "warning",
      message: `${el.selector}: missing contain-intrinsic-size (CLS risk)`,
      target: el.selector
    })), ...cvResults.autoElements.length + cvResults.hiddenElements.length === 0 ? [ {
      code: "not-used",
      severity: "info",
      message: "No content-visibility usage found. Consider content-visibility: auto on below-the-fold sections to reduce the initial render cost."
    } ] : [] ]
  };
})();
