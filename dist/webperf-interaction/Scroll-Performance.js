(() => {
  const TARGET_FRAME_MS = 1000 / 60;
  const DROP_THRESHOLD_MS = TARGET_FRAME_MS * 1.5;
  const RATING = {
    good: {
      icon: "🟢",
      color: "#0CCE6A",
      label: "Good"
    },
    "needs-improvement": {
      icon: "🟡",
      color: "#FFA400",
      label: "Needs Improvement"
    },
    poor: {
      icon: "🔴",
      color: "#FF4E42",
      label: "Poor"
    }
  };
  const fpsRating = fps => fps >= 55 ? "good" : fps >= 40 ? "needs-improvement" : "poor";
  const nonPassiveListeners = [];
  const SCROLL_EVENT_TYPES = new Set([ "scroll", "wheel", "touchstart", "touchmove", "touchend" ]);
  const _origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (SCROLL_EVENT_TYPES.has(type)) {
      const isPassive = options === true ? false : typeof options === "object" && options !== null ? options.passive === true : false;
      if (!isPassive) {
        const entry = {
          type: type,
          element: this.tagName || this.constructor?.name || "unknown",
          id: this.id || "",
          passive: false
        };
        nonPassiveListeners.push(entry);
      }
    }
    return _origAddEventListener.call(this, type, listener, options);
  };
  const sessions = [];
  let currentSession = null;
  let rafId = null;
  let lastFrameTime = null;
  let endTimer = null;
  const trackFrame = now => {
    if (!currentSession) return;
    if (lastFrameTime !== null) {
      const frameTime = now - lastFrameTime;
      currentSession.frames.push(frameTime);
      if (frameTime > DROP_THRESHOLD_MS) currentSession.drops++;
    }
    lastFrameTime = now;
    rafId = requestAnimationFrame(trackFrame);
  };
  const endSession = () => {
    if (!currentSession) return;
    cancelAnimationFrame(rafId);
    const {frames: frames, drops: drops} = currentSession;
    if (frames.length < 2) {
      currentSession = null;
      return;
    }
    const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length;
    const avgFps = 1000 / avgFrameTime;
    const minFps = 1000 / Math.max(...frames);
    const dropRate = drops / frames.length * 100;
    const rating = fpsRating(avgFps);
    RATING[rating];
    const session = {
      avgFps: avgFps,
      minFps: minFps,
      frames: frames.length,
      drops: drops,
      dropRate: dropRate,
      rating: rating
    };
    sessions.push(session);
    if (drops > 0) {
      Math.max(...frames);
    }
    currentSession = null;
    lastFrameTime = null;
  };
  window.addEventListener("scroll", () => {
    if (!currentSession) {
      currentSession = {
        frames: [],
        drops: 0
      };
      lastFrameTime = null;
      rafId = requestAnimationFrame(trackFrame);
    }
    clearTimeout(endTimer);
    endTimer = setTimeout(endSession, 200);
  }, {
    passive: true
  });
  const auditScrollCSS = () => {
    const results = {
      smoothScrollElements: [],
      willChangeElements: [],
      contentVisibilityElements: [],
      overscrollElements: []
    };
    document.querySelectorAll("*").forEach(el => {
      const cs = getComputedStyle(el);
      const label = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : el.className ? `.${String(el.className).trim().split(/\s+/)[0]}` : "");
      if (cs.scrollBehavior === "smooth") results.smoothScrollElements.push(label);
      if (cs.willChange && cs.willChange !== "auto") results.willChangeElements.push({
        element: label,
        value: cs.willChange
      });
      if (cs.contentVisibility && cs.contentVisibility !== "visible") results.contentVisibilityElements.push({
        element: label,
        value: cs.contentVisibility
      });
      if (cs.overscrollBehavior && cs.overscrollBehavior !== "auto") results.overscrollElements.push({
        element: label,
        value: cs.overscrollBehavior
      });
    });
    return results;
  };
  window.getScrollSummary = () => {
    if (sessions.length === 0) void 0; else {
      const allFps = sessions.map(s => s.avgFps);
      allFps.reduce((a, b) => a + b, 0), allFps.length;
      Math.min(...allFps);
      sessions.reduce((a, s) => a + s.drops, 0);
    }
    if (nonPassiveListeners.length === 0) void 0; else {
    }
    const css = auditScrollCSS();
    if (css.contentVisibilityElements.length > 0) void 0; else void 0;
    if (css.smoothScrollElements.length > 0) {
    }
    if (css.willChangeElements.length > 0) {
    }
    if (css.overscrollElements.length > 0) {
    }
    const hasJank = sessions.some(s => s.rating !== "good");
    const hasNonPassive = nonPassiveListeners.length > 0;
    if (hasJank || hasNonPassive) {
      if (hasNonPassive) void 0;
      if (hasJank) {
      }
    }
    const cssAuditResult = auditScrollCSS();
    return {
      script: "Scroll-Performance",
      status: "ok",
      details: {
        nonPassiveListeners: nonPassiveListeners.length,
        cssAudit: {
          smoothScrollElements: cssAuditResult.smoothScrollElements.length,
          willChangeElements: cssAuditResult.willChangeElements.length,
          contentVisibilityElements: cssAuditResult.contentVisibilityElements.length
        },
        sessionCount: sessions.length,
        ...sessions.length > 0 ? {
          avgFps: Math.round(sessions.reduce((a, s) => a + s.avgFps, 0) / sessions.length),
          worstSessionFps: Math.round(Math.min(...sessions.map(s => s.avgFps))),
          totalDrops: sessions.reduce((a, s) => a + s.drops, 0)
        } : {}
      }
    };
  };
  const cssSnapshot = auditScrollCSS();
  return {
    script: "Scroll-Performance",
    status: "tracking",
    details: {
      nonPassiveListeners: nonPassiveListeners.length,
      cssAudit: {
        smoothScrollElements: cssSnapshot.smoothScrollElements.length,
        willChangeElements: cssSnapshot.willChangeElements.length,
        contentVisibilityElements: cssSnapshot.contentVisibilityElements.length
      }
    },
    message: "Scroll performance tracking active. Scroll the page then call getScrollSummary() for FPS data.",
    getDataFn: "getScrollSummary"
  };
})();
