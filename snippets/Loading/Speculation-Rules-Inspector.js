// Prerender & Speculation Rules Inspector
// https://webperf-snippets.nucliweb.net

(() => {
  const MAX_ITEMS = 50;
  // Chrome limits eager prerenders per page; more than this is wasted or dropped
  const EAGER_PRERENDER_LIMIT = 10;

  // Activation of a prerendered page is only observable while the snippet listens
  const state = { activated: !document.prerendering, activatedAt: null };
  if (document.prerendering) {
    document.addEventListener(
      'prerenderingchange',
      () => {
        state.activated = true;
        state.activatedAt = Math.round(performance.now());
        console.log('%cPrerendered page activated', 'color: #22c55e; font-weight: bold;');
      },
      { once: true }
    );
  }

  const inspect = () => {
    const issues = [];
    const items = [];
    const actions = {};
    const supported = typeof window.HTMLScriptElement.supports === 'function'
      && window.HTMLScriptElement.supports('speculationrules');

    const [nav] = performance.getEntriesByType('navigation');
    const activationStart = Math.round(nav?.activationStart ?? 0);
    const deliveryType = nav?.deliveryType ?? '';

    const scripts = [...document.querySelectorAll('script[type="speculationrules"]')];

    scripts.forEach((script, index) => {
      let parsed;
      try {
        parsed = JSON.parse(script.textContent);
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `Speculation rules script #${index + 1} is not valid JSON (${e.message}). The browser ignores the whole script.`,
        });
        return;
      }

      for (const [action, rules] of Object.entries(parsed ?? {})) {
        if (!Array.isArray(rules)) continue;
        actions[action] = (actions[action] ?? 0) + rules.length;

        for (const rule of rules) {
          const source = rule.source ?? (rule.where ? 'document' : 'list');
          const urls = Array.isArray(rule.urls) ? rule.urls : [];
          const eagerness = rule.eagerness ?? (source === 'document' ? 'conservative' : 'immediate');
          items.push({
            action,
            source,
            eagerness,
            urls: urls.slice(0, 20),
            urlCount: urls.length,
            where: rule.where ?? null,
            requires: rule.requires ?? [],
            referrerPolicy: rule.referrer_policy ?? null,
            scriptIndex: index,
          });

          const isPrerender = action === 'prerender' || action === 'prerender_until_script';
          if (isPrerender && source === 'list' && (eagerness === 'immediate' || eagerness === 'eager') && urls.length > EAGER_PRERENDER_LIMIT) {
            issues.push({
              severity: 'warning',
              message: `A ${action} rule lists ${urls.length} URLs with eagerness "${eagerness}". Chrome caps eager prerenders, so the extra URLs are not prerendered. Fix: list fewer URLs or use "moderate".`,
            });
          }
          if (isPrerender && source === 'document' && (eagerness === 'immediate' || eagerness === 'eager')) {
            issues.push({
              severity: 'warning',
              message: `A document ${action} rule uses eagerness "${eagerness}", which prerenders matching links without a user signal and can waste bandwidth and CPU. Fix: use "moderate" or "conservative".`,
            });
          }
        }
      }
    });

    if (scripts.length === 0) {
      issues.push({ severity: 'info', message: 'No speculation rules found in the DOM. Rules delivered in the Speculation-Rules HTTP header are not readable from JavaScript.' });
    } else if (items.length === 0 && !issues.some((i) => i.severity === 'error')) {
      issues.push({ severity: 'info', message: 'Speculation rules scripts were found but contain no prefetch or prerender rules.' });
    }
    if (!supported && scripts.length > 0) {
      issues.push({ severity: 'info', message: 'This browser does not support speculation rules, so the rules are ignored.' });
    }
    if (activationStart > 0) {
      issues.push({ severity: 'info', message: `This page was prerendered and activated at ${activationStart}ms. Navigation timings are relative to activationStart.` });
    }

    return {
      script: 'Speculation-Rules-Inspector',
      status: 'ok',
      count: items.length,
      details: {
        supported,
        prerendering: document.prerendering === true,
        activated: state.activated,
        activatedAt: state.activatedAt,
        activationStart,
        deliveryType,
        scriptCount: scripts.length,
        actions,
      },
      items: items.slice(0, MAX_ITEMS),
      issues,
    };
  };

  window.getSpeculationRulesInspection = inspect;
  const result = inspect();

  console.group('Speculation rules');
  console.log(`Prerendering: ${result.details.prerendering}, activationStart: ${result.details.activationStart}ms, deliveryType: "${result.details.deliveryType}"`);
  if (result.items.length > 0) console.table(result.items.map(({ action, source, eagerness, urlCount }) => ({ action, source, eagerness, urlCount })));
  result.issues.forEach((i) => console.log(`[${i.severity}] ${i.message}`));
  console.groupEnd();

  if (document.prerendering) {
    return {
      script: 'Speculation-Rules-Inspector',
      status: 'tracking',
      message: 'This page is prerendering. Call getSpeculationRulesInspection() after activation to see the final timings.',
      getDataFn: 'getSpeculationRulesInspection',
    };
  }
  return result;
})();
