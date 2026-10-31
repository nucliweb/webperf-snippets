import { describe, it, expect } from "vitest";
import { parseFieldExtras, subPartsView, navigationView } from "../../src/crux.js";

// A record of the daily CrUX API as it answers for an origin: the sub-parts of an image LCP, the
// resource type of the LCP, the round trip time and the navigation types
const RECORD = {
  metrics: {
    largest_contentful_paint: { percentiles: { p75: 3096 } },
    largest_contentful_paint_image_time_to_first_byte: { percentiles: { p75: 1527 } },
    largest_contentful_paint_image_resource_load_delay: { percentiles: { p75: 324 } },
    largest_contentful_paint_image_resource_load_duration: { percentiles: { p75: 556 } },
    largest_contentful_paint_image_element_render_delay: { percentiles: { p75: 534 } },
    largest_contentful_paint_resource_type: { fractions: { text: 0.7575, image: 0.2425 } },
    round_trip_time: { percentiles: { p75: 216 } },
    navigation_types: {
      fractions: { back_forward: 0.0639, back_forward_cache: 0.0817, prerender: 0.0025, navigate: 0.8016, navigate_cache: 0, reload: 0.0503, restore: 0 },
    },
  },
};

// The result of LCP-Subparts in the lab, an image LCP unless url is null
const lab = (subParts, url = "hero.jpg") => [{ id: "LCP-Subparts", script: "LCP-Subparts", status: "ok", details: { url, subParts } }];

describe("parseFieldExtras", () => {
  it("reads the sub-parts of an image LCP, the share of image LCPs, the round trip time and the navigation types", () => {
    expect(parseFieldExtras(RECORD)).toEqual({
      subParts: { ttfb: 1527, resourceLoadDelay: 324, resourceLoadTime: 556, elementRenderDelay: 534 },
      lcpImageShare: 0.2425,
      roundTripTime: 216,
      navigationTypes: { navigate: 0.8016, back_forward_cache: 0.0817, back_forward: 0.0639, reload: 0.0503, prerender: 0.0025 },
    });
  });

  it("leaves out what the record does not have", () => {
    expect(parseFieldExtras({ metrics: { largest_contentful_paint: { percentiles: { p75: 2000 } } } })).toEqual({});
  });
});

describe("subPartsView", () => {
  const extras = parseFieldExtras(RECORD);

  it("puts each field p75 next to the lab value, with a note where the field is much slower or the lab is", () => {
    const view = subPartsView(extras, lab({
      ttfb: { value: 400 },
      resourceLoadDelay: { value: 300 },
      resourceLoadTime: { value: 900 },
      elementRenderDelay: { value: 200 },
    }));
    expect(view.rows).toEqual([
      { part: "ttfb", label: "TTFB", field: 1527, lab: 400, note: "real users wait longer for the server: network distance (RTT p75 216 ms), the CDN or cache misses the lab does not see" },
      { part: "resourceLoadDelay", label: "Load delay", field: 324, lab: 300, note: null },
      { part: "resourceLoadTime", label: "Load duration", field: 556, lab: 900, note: "the lab is slower than users: check the CPU and network throttling of the lab" },
      { part: "elementRenderDelay", label: "Render delay", field: 534, lab: 200, note: "slower devices or more main-thread work in the field" },
    ]);
  });

  it("says that the sub-parts describe only the loads with an image LCP, and that their p75 do not add up", () => {
    expect(subPartsView(extras, lab({})).caveats).toEqual([
      "The field sub-parts describe the 24% of loads whose LCP is an image.",
      "Each p75 is taken on its own, so the sub-parts do not add up to the p75 of LCP.",
    ]);
  });

  it("needs a difference of 1.5 times and 100 ms to note it", () => {
    const rows = subPartsView({ subParts: { ttfb: 280, resourceLoadDelay: 400, resourceLoadTime: 1000, elementRenderDelay: 80 } }, lab({
      ttfb: { value: 150 },
      resourceLoadDelay: { value: 100 },
      resourceLoadTime: { value: 700 },
      elementRenderDelay: { value: 20 },
    })).rows;
    // 280 against 150: 1.87 times but 130 ms, noted; 1000 against 700: 300 ms but 1.43 times, not noted;
    // 80 against 20: four times but 60 ms, not noted
    expect(rows.map((r) => r.note !== null)).toEqual([true, true, false, false]);
    expect(rows[1].note).toBe('the lab finds the image sooner: preload it or give it fetchpriority="high", or users run more scripts before it');
  });

  it("compares only TTFB and render delay when the LCP of the lab is not an image, and says why", () => {
    const view = subPartsView(extras, lab({ ttfb: { value: 400 }, resourceLoadDelay: { value: 0 }, resourceLoadTime: { value: 0 }, elementRenderDelay: { value: 530 } }, null));
    expect(view.rows.map((r) => [r.label, r.lab, r.note !== null])).toEqual([
      ["TTFB", 400, true],
      ["Load delay", null, false],
      ["Load duration", null, false],
      ["Render delay", 530, false],
    ]);
    expect(view.caveats).toContain("The LCP of the lab is not an image, so it has no load delay or duration to compare.");
  });

  it("shows the field values alone when the lab did not run LCP-Subparts, and nothing without field sub-parts", () => {
    expect(subPartsView(extras, []).rows.map((r) => [r.field, r.lab, r.note])).toEqual([
      [1527, null, null],
      [324, null, null],
      [556, null, null],
      [534, null, null],
    ]);
    expect(subPartsView({}, lab({}))).toBeNull();
  });
});

describe("navigationView", () => {
  it("lists the navigation types by share, and points to the bfcache snippet when over 5 % come back without it", () => {
    expect(navigationView(parseFieldExtras(RECORD))).toEqual({
      line: "Navigations: navigate 80%, back/forward cache 8%, back/forward 6%, reload 5%, prerender 0.3%",
      hint: "6% of the visits come back without the back/forward cache: run Back-Forward-Cache to see what blocks it.",
    });
  });

  it("gives no hint when few visits come back without the cache, and nothing without navigation types", () => {
    const few = { navigationTypes: { navigate: 0.95, back_forward: 0.03, back_forward_cache: 0.02 } };
    expect(navigationView(few).hint).toBeNull();
    expect(navigationView({})).toBeNull();
  });
});
