import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Flow } from "./Flow";
import { layoutFlow } from "./flowLayout";

const TD = { direction: "TD", maxText: 210 };
const LR = { direction: "LR", maxText: 120, ranksep: 40 };

const flow = (extra = {}) => ({
  nodes: [
    { id: "s", shape: "start", label: "Page load" },
    { id: "a", label: "Fetch the resource" },
    { id: "e", shape: "end", label: "Done" },
  ],
  edges: [{ from: "s", to: "a" }, { from: "a", to: "e" }],
  ...extra,
});
const node = (layout, id) => layout.nodes.find((n) => n.id === id);
const firstPoint = (edge) => edge.path.match(/^M(-?[\d.]+) (-?[\d.]+)/).slice(1).map(Number);
const lastPoint = (edge) => edge.path.match(/(-?[\d.]+) (-?[\d.]+)$/).slice(1).map(Number);

describe("start and end shapes with a label", () => {
  it("keep the label and leave room for it in a top down flow", () => {
    const layout = layoutFlow(flow(), TD);
    for (const id of ["s", "e"]) {
      const n = node(layout, id);
      expect(n.lines, id).toHaveLength(1);
      expect(n.h, id).toBeGreaterThan(20);
      expect(n.w, id).toBeGreaterThan(20);
    }
  });

  it("keep drawing a bare dot of 20 by 20 when there is no label", () => {
    const layout = layoutFlow(flow({ nodes: flow().nodes.map(({ label, ...rest }) => (rest.shape ? rest : { ...rest, label })) }), TD);
    for (const id of ["s", "e"]) {
      const n = node(layout, id);
      expect([n.w, n.h, n.lines], id).toEqual([20, 20, []]);
    }
  });

  it("put the dot where the edge meets the shape: the start label above, the end label below", () => {
    const layout = layoutFlow(flow(), TD);
    const start = node(layout, "s");
    const end = node(layout, "e");
    expect(start.side).toBe("top");
    expect(end.side).toBe("bottom");
    // The edge leaves the bottom of the start shape and enters the top of the end shape, on the dot's column
    const [sx, sy] = firstPoint(layout.edges[0]);
    expect(sx).toBeCloseTo(start.x + start.w / 2, 0);
    expect(sy).toBeCloseTo(start.y + start.h, 0);
    const [ex, ey] = lastPoint(layout.edges[1]);
    expect(ex).toBeCloseTo(end.x + end.w / 2, 0);
    expect(ey).toBeCloseTo(end.y, 0);
  });

  it("put the start label on the left and the end label on the right in a left to right flow", () => {
    const layout = layoutFlow(flow({ direction: "LR" }), LR);
    const start = node(layout, "s");
    const end = node(layout, "e");
    expect([start.side, end.side]).toEqual(["left", "right"]);
    expect(start.h).toBe(20);
    expect(start.w).toBeGreaterThan(20);
    const [sx, sy] = firstPoint(layout.edges[0]);
    expect(sx).toBeCloseTo(start.x + start.w, 0);
    expect(sy).toBeCloseTo(start.y + start.h / 2, 0);
    const [ex, ey] = lastPoint(layout.edges[1]);
    expect(ex).toBeCloseTo(end.x, 0);
    expect(ey).toBeCloseTo(end.y + end.h / 2, 0);
  });

  it("wrap a long label", () => {
    const long = "A resource that the browser found in the disk cache and has to validate";
    const layout = layoutFlow(flow({ nodes: [{ id: "s", shape: "start", label: long }, { id: "a", label: "Check" }], edges: [{ from: "s", to: "a" }] }), TD);
    expect(node(layout, "s").lines.length).toBeGreaterThan(1);
  });
});

describe("the Flow component draws the label of a start and an end shape", () => {
  const svg = (spec) => renderToStaticMarkup(<Flow title="A flow" {...spec} />);
  const positions = (markup, text) => {
    // x and y of the <text> whose first tspan holds `text`
    const m = new RegExp(`<text x="(-?[\\d.]+)" y="(-?[\\d.]+)"[^>]*>\\s*<tspan[^>]*>${text}</tspan>`).exec(markup);
    return m && { x: Number(m[1]), y: Number(m[2]) };
  };
  const circles = (markup) => [...markup.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

  it("shows the text as drawn text, not only in the description", () => {
    const markup = svg(flow());
    expect(positions(markup, "Page load")).not.toBeNull();
    expect(positions(markup, "Done")).not.toBeNull();
  });

  it("draws the start label above the dot and the end label below it in a top down flow", () => {
    const markup = svg(flow());
    const [dot, , ring] = circles(markup);
    expect(positions(markup, "Page load").y).toBeLessThan(dot.y);
    expect(positions(markup, "Done").y).toBeGreaterThan(ring.y);
  });

  it("draws the start label left of the dot and the end label right of it in a left to right flow", () => {
    const markup = svg(flow({ direction: "LR" }));
    const [dot, , ring] = circles(markup);
    expect(positions(markup, "Page load").x).toBeLessThan(dot.x);
    expect(positions(markup, "Done").x).toBeGreaterThan(ring.x);
  });

  it("draws nothing extra for a shape without a label", () => {
    const markup = svg(flow({ nodes: [{ id: "s", shape: "start" }, { id: "a", label: "Fetch" }], edges: [{ from: "s", to: "a" }] }));
    // Only the label of the other node is drawn
    expect((markup.match(/<tspan/g) || []).length).toBe(1);
    expect(positions(markup, "Fetch")).not.toBeNull();
  });
});
