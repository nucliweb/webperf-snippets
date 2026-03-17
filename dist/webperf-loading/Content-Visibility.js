function detectContentVisibility() {
  const results = {
    autoElements: [],
    hiddenElements: [],
    visibleElements: [],
    nodeArray: []
  };
  function getName(node) {
    const name = node.nodeName;
    return node.nodeType === 1 ? name.toLowerCase() : name.toUpperCase().replace(/^#/, "");
  }
  function getSelector(node) {
    let sel = "";
    try {
      while (node && node.nodeType !== 9) {
        const el = node;
        const part = el.id ? "#" + el.id : getName(el) + (el.classList && el.classList.value && el.classList.value.trim() && el.classList.value.trim().length ? "." + el.classList.value.trim().replace(/\s+/g, ".") : "");
        if (sel.length + part.length > 100 - 1) return sel || part;
        sel = sel ? part + ">" + sel : part;
        if (el.id) break;
        node = el.parentNode;
      }
    } catch (err) {}
    return sel;
  }
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
  }
  function getElementInfo(node) {
    const rect = node.getBoundingClientRect();
    const cs = window.getComputedStyle(node);
    return {
      selector: getSelector(node),
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
    const missingIntrinsicSize = results.autoElements.filter(el => el.containIntrinsicSize === "not set" || el.containIntrinsicSize === "none");
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
  function getSelector(node) {
    let sel = "";
    try {
      while (node && node.nodeType !== 9) {
        const el = node;
        const name = el.nodeName.toLowerCase();
        const part = el.id ? "#" + el.id : name + (el.classList && el.classList.value && el.classList.value.trim() ? "." + el.classList.value.trim().split(/\s+/).slice(0, 2).join(".") : "");
        if (sel.length + part.length > 80) return sel || part;
        sel = sel ? part + ">" + sel : part;
        if (el.id) break;
        node = el.parentNode;
      }
    } catch (err) {}
    return sel;
  }
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
      selector: getSelector(el),
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
    opportunities.slice(0, 20).map(({element: element, ...rest}) => rest);
    if (opportunities.length > 20) void 0;
    opportunities.slice(0, 10).forEach((opp, i) => {
    });
  }
  return {
    opportunities: opportunities.map(({element: element, ...rest}) => rest),
    totalElements: opportunities.length,
    highImpact: opportunities.filter(o => o.estimatedSavings.startsWith("High")).length,
    elements: opportunities.map(o => o.element)
  };
}

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
    issues: cvResults.autoElements.filter(el => el.containIntrinsicSize === "not set" || el.containIntrinsicSize === "none").map(el => ({
      severity: "warning",
      message: `${el.selector}: missing contain-intrinsic-size (CLS risk)`
    }))
  };
})();
