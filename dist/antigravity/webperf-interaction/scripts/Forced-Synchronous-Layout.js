(() => {
  let isDirty = false;
  let lastMutationTime = 0;
  let rafPending = false;
  const fslEvents = [];
  const restorations = [];
  const getElementDesc = el => {
    let desc = el.tagName.toLowerCase();
    if (el.id) desc += `#${el.id}`;
    if (el.className && typeof el.className === "string" && el.className.trim()) desc += `.${el.className.trim().split(/\s+/).join(".")}`;
    return desc;
  };
  const markDirty = () => {
    isDirty = true;
    lastMutationTime = performance.now();
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      isDirty = false;
      rafPending = false;
    });
  };
  const domTokenListProto = DOMTokenList.prototype;
  [ "add", "remove", "toggle", "replace" ].forEach(method => {
    const orig = domTokenListProto[method];
    domTokenListProto[method] = function(...args) {
      markDirty();
      return orig.apply(this, args);
    };
    restorations.push(() => domTokenListProto[method] = orig);
  });
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (name === "class" || name === "style") markDirty();
    return origSetAttribute.call(this, name, value);
  };
  restorations.push(() => Element.prototype.setAttribute = origSetAttribute);
  const cssStyleDeclarationProto = CSSStyleDeclaration.prototype;
  const origSetProperty = cssStyleDeclarationProto.setProperty;
  cssStyleDeclarationProto.setProperty = function(...args) {
    markDirty();
    return origSetProperty.apply(this, args);
  };
  restorations.push(() => cssStyleDeclarationProto.setProperty = origSetProperty);
  const cssTextDescriptor = Object.getOwnPropertyDescriptor(cssStyleDeclarationProto, "cssText");
  if (cssTextDescriptor?.set) {
    Object.defineProperty(cssStyleDeclarationProto, "cssText", {
      ...cssTextDescriptor,
      set(value) {
        markDirty();
        cssTextDescriptor.set.call(this, value);
      }
    });
    restorations.push(() => Object.defineProperty(cssStyleDeclarationProto, "cssText", cssTextDescriptor));
  }
  const warnFSL = (propName, accessType, el) => {
    if (!isDirty) return;
    const elapsed = (performance.now() - lastMutationTime).toFixed(2);
    const elDesc = el instanceof Element ? getElementDesc(el) : "unknown";
    const stack = (new Error).stack;
    fslEvents.push({
      property: propName,
      accessType: accessType,
      element: elDesc,
      sinceLastMutationMs: parseFloat(elapsed),
      stack: stack
    });
  };
  const interceptProp = (proto, propName, accessType) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, propName);
    if (!descriptor) return;
    const {get: origGet, set: origSet} = descriptor;
    const newDescriptor = {
      configurable: true,
      enumerable: descriptor.enumerable
    };
    if (origGet) newDescriptor.get = function() {
      if (accessType === "read" || accessType === "readwrite") warnFSL(propName, "read", this);
      return origGet.call(this);
    };
    if (origSet) newDescriptor.set = function(value) {
      if (accessType === "write" || accessType === "readwrite") warnFSL(propName, "write", this);
      origSet.call(this, value);
    };
    Object.defineProperty(proto, propName, newDescriptor);
    restorations.push(() => Object.defineProperty(proto, propName, descriptor));
  };
  const elementReadProps = [ "clientTop", "clientLeft", "clientWidth", "clientHeight", "scrollWidth", "scrollHeight" ];
  const elementReadWriteProps = [ "scrollTop", "scrollLeft" ];
  elementReadProps.forEach(p => interceptProp(Element.prototype, p, "read"));
  elementReadWriteProps.forEach(p => interceptProp(Element.prototype, p, "readwrite"));
  const htmlElementReadProps = [ "offsetTop", "offsetLeft", "offsetWidth", "offsetHeight" ];
  htmlElementReadProps.forEach(p => interceptProp(HTMLElement.prototype, p, "read"));
  const origGetBCR = Element.prototype.getBoundingClientRect;
  const getBCRDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
  Element.prototype.getBoundingClientRect = function() {
    warnFSL("getBoundingClientRect()", "read", this);
    return origGetBCR.call(this);
  };
  restorations.push(() => Object.defineProperty(Element.prototype, "getBoundingClientRect", getBCRDescriptor));
  window.getFSLSummary = () => {
    if (fslEvents.length === 0) {
      return {
        script: "Forced-Synchronous-Layout",
        status: "ok",
        count: 0,
        details: {},
        items: [],
        issues: []
      };
    }
    const byProperty = fslEvents.reduce((acc, e) => {
      acc[e.property] = (acc[e.property] || 0) + 1;
      return acc;
    }, {});
    const byElement = fslEvents.reduce((acc, e) => {
      acc[e.element] = (acc[e.element] || 0) + 1;
      return acc;
    }, {});
    return {
      script: "Forced-Synchronous-Layout",
      status: "ok",
      count: fslEvents.length,
      details: {
        byProperty: byProperty,
        byElement: byElement,
        fastestSinceLastMutationMs: Math.min(...fslEvents.map(e => e.sinceLastMutationMs))
      },
      items: Object.values(fslEvents.reduce((acc, e) => {
        const key = `${e.property}|${e.accessType}|${e.element}`;
        if (!acc[key]) acc[key] = {
          property: e.property,
          accessType: e.accessType,
          element: e.element,
          count: 0,
          fastestSinceLastMutationMs: e.sinceLastMutationMs
        };
        acc[key].count++;
        acc[key].fastestSinceLastMutationMs = Math.min(acc[key].fastestSinceLastMutationMs, e.sinceLastMutationMs);
        return acc;
      }, {})).sort((a, b) => b.count - a.count).slice(0, 50),
      issues: Object.entries(byProperty).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([property, count]) => ({
        severity: count > 5 ? "error" : "warning",
        message: `${property} triggered ${count} forced synchronous layout${count > 1 ? "s" : ""}. Read layout properties before writing to the DOM.`
      }))
    };
  };
  window.stopFSLDetector = () => {
    restorations.forEach(restore => restore());
    restorations.length = 0;
    delete window.getFSLSummary;
    delete window.stopFSLDetector;
  };
  return {
    script: "Forced-Synchronous-Layout",
    status: "tracking",
    count: 0,
    details: {
      interceptedProperties: [ ...elementReadProps, ...elementReadWriteProps, ...htmlElementReadProps, "getBoundingClientRect()" ]
    },
    message: "FSL Detector active. Reproduce the interaction then call getFSLSummary() to inspect results.",
    getDataFn: "getFSLSummary",
    stopFn: "stopFSLDetector"
  };
})();
