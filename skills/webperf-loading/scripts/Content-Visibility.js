// Detect elements with content-visibility: auto and analyze optimization opportunities

function detectContentVisibility() {
  // Create an object to store the results
  const results = {
    autoElements: [],
    hiddenElements: [],
    visibleElements: [],
    nodeArray: [],
  };

  // Get the name of the node
  function getName(node) {
    const name = node.nodeName;
    return node.nodeType === 1 ? name.toLowerCase() : name.toUpperCase().replace(/^#/, "");
  }

  // Get the selector for an element
  function getSelector(node) {
    let sel = "";

    try {
      while (node && node.nodeType !== 9) {
        const el = node;
        const part = el.id
          ? "#" + el.id
          : getName(el) +
            (el.classList &&
            el.classList.value &&
            el.classList.value.trim() &&
            el.classList.value.trim().length
              ? "." + el.classList.value.trim().replace(/\s+/g, ".")
              : "");
        if (sel.length + part.length > 100 - 1) return sel || part;
        sel = sel ? part + ">" + sel : part;
        if (el.id) break;
        node = el.parentNode;
      }
    } catch (err) {
      // Do nothing...
    }
    return sel;
  }

  // Check if element is in viewport
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  // Get element dimensions and position
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
      inViewport: isInViewport(node),
    };
  }

  // Recursively find all elements with content-visibility
  function findContentVisibilityElements(node) {
    const cs = window.getComputedStyle(node);
    const cv = cs["content-visibility"];

    if (cv && cv !== "visible") {
      const info = getElementInfo(node);

      if (cv === "auto") {
        results.autoElements.push(info);
        results.nodeArray.push(node);
      } else if (cv === "hidden") {
        results.hiddenElements.push(info);
      }
    }

    for (let i = 0; i < node.children.length; i++) {
      findContentVisibilityElements(node.children[i]);
    }
  }

  // Run the detection
  findContentVisibilityElements(document.body);

  // Display results
  console.group("🔍 Content-Visibility Detection");

  if (results.autoElements.length === 0 && results.hiddenElements.length === 0) {
    console.log("%cNo content-visibility usage found.", "color: orange; font-weight: bold;");
    console.log("");
    console.log("💡 Consider applying content-visibility: auto to:");
    console.log("   • Footer sections");
    console.log("   • Below-the-fold content");
    console.log("   • Long lists or card grids");
    console.log("   • Tab content that is not initially visible");
    console.log("   • Accordion/collapsible content");
  } else {
    // Auto elements
    if (results.autoElements.length > 0) {
      console.group("✅ content-visibility: auto");
      console.log(`Found ${results.autoElements.length} element(s)`);
      console.table(results.autoElements);
      console.groupEnd();
    }

    // Hidden elements
    if (results.hiddenElements.length > 0) {
      console.group("🔒 content-visibility: hidden");
      console.log(`Found ${results.hiddenElements.length} element(s)`);
      console.table(results.hiddenElements);
      console.groupEnd();
    }

    // Check for missing contain-intrinsic-size
    const missingIntrinsicSize = results.autoElements.filter(
      (el) => el.containIntrinsicSize === "not set" || el.containIntrinsicSize === "none",
    );

    if (missingIntrinsicSize.length > 0) {
      console.group("⚠️ Missing contain-intrinsic-size");
      console.log(
        "%cThese elements lack contain-intrinsic-size, which may cause layout shifts:",
        "color: #f59e0b; font-weight: bold",
      );
      console.table(
        missingIntrinsicSize.map((el) => ({
          selector: el.selector,
          height: el.height + "px",
        })),
      );
      console.log("");
      console.log("💡 Add contain-intrinsic-size to prevent CLS:");
      console.log("   contain-intrinsic-size: auto 500px;");
      console.groupEnd();
    }

    // Nodes for inspection
    console.group("🔎 Elements for inspection");
    console.log("Click to expand and inspect in Elements panel:");
    results.nodeArray.forEach((node, i) => {
      console.log(`${i + 1}. `, node);
    });
    console.groupEnd();
  }

  console.groupEnd();

  return results;
}

// Analyze opportunities for content-visibility optimization
// Options:
//   - threshold: distance from viewport bottom to consider "offscreen" (default: 0)
//   - minHeight: minimum element height in px (default: 100)
//   - minChildren: minimum child elements to be considered (default: 5)
function analyzeContentVisibilityOpportunities(options = {}) {
  const { threshold = 0, minHeight = 100, minChildren = 5 } = options;

  const viewportHeight = window.innerHeight;
  const opportunities = [];
  const processedElements = new Set();

  function getSelector(node) {
    let sel = "";
    try {
      while (node && node.nodeType !== 9) {
        const el = node;
        const name = el.nodeName.toLowerCase();
        const part = el.id
          ? "#" + el.id
          : name +
            (el.classList && el.classList.value && el.classList.value.trim()
              ? "." + el.classList.value.trim().split(/\s+/).slice(0, 2).join(".")
              : "");
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
    // Skip already processed or descendant of processed
    if (processedElements.has(el) || isAncestorProcessed(el)) return;

    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);

    // Skip if already using content-visibility
    if (cs["content-visibility"] && cs["content-visibility"] !== "visible") return;

    // Skip elements not meeting size criteria
    if (rect.height < minHeight || rect.width === 0) return;

    // Check if element is below the viewport + threshold
    const distanceFromViewport = rect.top - viewportHeight;
    if (distanceFromViewport < threshold) return;

    const childCount = el.querySelectorAll("*").length;

    // Skip elements with too few children
    if (childCount < minChildren) return;

    processedElements.add(el);

    opportunities.push({
      selector: getSelector(el),
      height: Math.round(rect.height) + "px",
      distanceFromViewport: Math.round(distanceFromViewport) + "px",
      childElements: childCount,
      estimatedSavings: estimateRenderSavings(childCount),
      element: el,
    });
  }

  // Walk all elements in the DOM
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);

  while (walker.nextNode()) {
    analyzeElement(walker.currentNode);
  }

  // Sort by child count (highest impact first)
  opportunities.sort((a, b) => b.childElements - a.childElements);

  // Display results
  console.group("💡 Content-Visibility Opportunities");
  console.log(
    `%cSettings: threshold=${threshold}px, minHeight=${minHeight}px, minChildren=${minChildren}`,
    "color: #888;",
  );
  console.log("");

  if (opportunities.length === 0) {
    console.log("%c✅ No opportunities found with current settings.", "color: #22c55e; font-weight: bold");
    console.log("Try adjusting: analyzeContentVisibilityOpportunities({ threshold: -200, minHeight: 50, minChildren: 3 })");
  } else {
    console.log(
      `%cFound ${opportunities.length} element(s) that could benefit from content-visibility: auto`,
      "font-weight: bold;",
    );
    console.log("");

    // Show table without element reference
    const tableData = opportunities.slice(0, 20).map(({ element, ...rest }) => rest);
    console.table(tableData);

    if (opportunities.length > 20) {
      console.log(`... and ${opportunities.length - 20} more elements`);
    }

    // Log elements for inspection
    console.log("");
    console.group("🔎 Elements for inspection");
    opportunities.slice(0, 10).forEach((opp, i) => {
      console.log(`${i + 1}. `, opp.element);
    });
    console.groupEnd();

    console.log("");
    console.group("📝 Implementation Example");
    console.log("Add this CSS to optimize rendering:");
    console.log("");
    console.log(
      "%c/* Optimize offscreen content */\n" +
        ".your-selector {\n" +
        "  content-visibility: auto;\n" +
        "  contain-intrinsic-size: auto 500px; /* Use actual height */\n" +
        "}",
      "font-family: monospace; background: #1e1e1e; color: #9cdcfe; padding: 10px; border-radius: 4px;",
    );
    console.groupEnd();
  }

  console.groupEnd();

  return {
    opportunities: opportunities.map(({ element, ...rest }) => rest),
    totalElements: opportunities.length,
    highImpact: opportunities.filter((o) => o.estimatedSavings.startsWith("High")).length,
    elements: opportunities.map((o) => o.element),
  };
}

// Run detection
detectContentVisibility();

console.log(
  "%c\n To find optimization opportunities, run: %canalyzeContentVisibilityOpportunities()",
  "color: #3b82f6; font-weight: bold;",
  "color: #22c55e; font-weight: bold; font-family: monospace;"
);
