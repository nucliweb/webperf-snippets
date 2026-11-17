// Detect elements with content-visibility: auto and analyze optimization opportunities

(() => {
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

  // An element with content-visibility: auto has no size before it first renders unless
  // contain-intrinsic-size gives one, so the page moves when it does. content-visibility: auto adds auto
  // to contain-intrinsic-size, so Chrome reports an element with no size as "auto none", also when the CSS
  // says none: what counts is whether the value has a length, as in "auto 500px".
  function lacksIntrinsicSize(value) {
    return !/\d/.test(value);
  }

  function detectContentVisibility() {
    // Create an object to store the results
    const results = {
      autoElements: [],
      hiddenElements: [],
      visibleElements: [],
      nodeArray: [],
    };

    // @shared isInViewport
    // Whether el has a size and some of it is inside the viewport
    function isInViewport(el) {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }
    // @end-shared isInViewport

    // What the report says of an element with content-visibility: its values, size and position
    function contentVisibilityInfo(node) {
      const rect = node.getBoundingClientRect();
      const cs = window.getComputedStyle(node);

      return {
        selector: uniqueSelector(node),
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
        const info = contentVisibilityInfo(node);

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
        (el) => lacksIntrinsicSize(el.containIntrinsicSize),
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

    function estimateRenderSavings(childCount) {
      const baseMs = childCount * 0.2;
      if (baseMs < 5) return "Low (~" + baseMs.toFixed(1) + "ms)";
      if (baseMs < 20) return "Medium (~" + baseMs.toFixed(1) + "ms)";
      return "High (~" + baseMs.toFixed(1) + "ms)";
    }

    // Whether el is an opportunity, and whether what it holds is left out: an element that already has
    // content-visibility skips the rendering of its content, and inside an opportunity only the
    // opportunity itself is proposed.
    function analyzeElement(el) {
      const cs = window.getComputedStyle(el);
      if (cs["content-visibility"] && cs["content-visibility"] !== "visible") return { skipContent: true };

      const rect = el.getBoundingClientRect();

      // Skip elements not meeting size criteria
      if (rect.height < minHeight || rect.width === 0) return { skipContent: false };

      // Check if element is below the viewport + threshold
      const distanceFromViewport = rect.top - viewportHeight;
      if (distanceFromViewport < threshold) return { skipContent: false };

      const childCount = el.querySelectorAll("*").length;

      // Skip elements with too few children
      if (childCount < minChildren) return { skipContent: false };

      opportunities.push({
        height: Math.round(rect.height) + "px",
        distanceFromViewport: Math.round(distanceFromViewport) + "px",
        childElements: childCount,
        estimatedSavings: estimateRenderSavings(childCount),
        element: el,
      });
      return { skipContent: true };
    }

    // The element after el in document order, past its content when skipContent
    function nextElement(el, skipContent) {
      if (!skipContent && el.firstElementChild) return el.firstElementChild;
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (node.nextElementSibling) return node.nextElementSibling;
      }
      return null;
    }

    // Walk the elements of the body once, each one read once. The content of an element that is left
    // out is not read at all, so the walk does not make the browser render what content-visibility skips.
    for (let el = document.body.firstElementChild; el; ) {
      el = nextElement(el, analyzeElement(el).skipContent);
    }

    // Sort by child count (highest impact first)
    opportunities.sort((a, b) => b.childElements - a.childElements);

    // A selector for the opportunities the result and the console show, the first 50: on a deep page
    // each one queries the document once per level, and the rest would be read for nothing
    const SHOWN = 50;
    opportunities.forEach((opportunity, i) => {
      opportunity.selector = i < SHOWN ? uniqueSelector(opportunity.element) : "";
    });

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
      const tableData = opportunities.slice(0, 20).map((opportunity) => ({
        selector: opportunity.selector,
        height: opportunity.height,
        distanceFromViewport: opportunity.distanceFromViewport,
        childElements: opportunity.childElements,
        estimatedSavings: opportunity.estimatedSavings,
      }));
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

    // The shape of every result (snippets/SCHEMA.md). The elements themselves are in the console,
    // above: a DOM node is not data a script or an agent can read
    return {
      script: "Content-Visibility",
      status: "ok",
      count: opportunities.length,
      details: {
        highImpact: opportunities.filter((o) => o.estimatedSavings.startsWith("High")).length,
        threshold,
        minHeight,
        minChildren,
      },
      items: opportunities.slice(0, SHOWN).map((opportunity) => ({
        selector: opportunity.selector,
        height: opportunity.height,
        distanceFromViewport: opportunity.distanceFromViewport,
        childElements: opportunity.childElements,
        estimatedSavings: opportunity.estimatedSavings,
      })),
      issues: [],
    };
  }

  window.analyzeContentVisibilityOpportunities = analyzeContentVisibilityOpportunities;

  // Run detection
  const cvResults = detectContentVisibility();
  console.log(
    "%c\n To find optimization opportunities, run: %canalyzeContentVisibilityOpportunities()",
    "color: #3b82f6; font-weight: bold;",
    "color: #22c55e; font-weight: bold; font-family: monospace;"
  );
  return {
    script: "Content-Visibility",
    status: "ok",
    count: cvResults.autoElements.length + cvResults.hiddenElements.length,
    details: {
      autoCount: cvResults.autoElements.length,
      hiddenCount: cvResults.hiddenElements.length,
    },
    items: [
      ...cvResults.autoElements.map(el => ({ ...el, type: "auto" })),
      ...cvResults.hiddenElements.map(el => ({ ...el, type: "hidden" })),
    ],
    issues: [
      ...cvResults.autoElements
        .filter(el => lacksIntrinsicSize(el.containIntrinsicSize))
        .map(el => ({ code: "missing-intrinsic-size", severity: "warning", message: `${el.selector}: missing contain-intrinsic-size (CLS risk)`, target: el.selector })),
      ...(cvResults.autoElements.length + cvResults.hiddenElements.length === 0
        ? [{ code: "not-used", severity: "info", message: "No content-visibility usage found. Consider content-visibility: auto on below-the-fold sections to reduce the initial render cost." }]
        : []),
    ],
  };
})();
