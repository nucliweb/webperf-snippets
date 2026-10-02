import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanSpec } from "../../lib/strip-emoji";
import { layoutFlow } from "./flowLayout";

// The two layouts the Flow component draws and swaps with a container query (see planLayouts in Flow.jsx)
const WIDE = { TD: { direction: "TD", maxText: 210 }, LR: { direction: "LR", maxText: 120, ranksep: 40 } };
const COMPACT = { direction: "TD", maxText: 112, nodesep: 10, ranksep: 40, labelMax: 110 };
const layoutsOf = (spec) => {
  const dir = spec.direction === "LR" ? "LR" : "TD";
  return [
    { name: "wide", axis: dir === "LR" ? "y" : "x", layout: layoutFlow(spec, WIDE[dir]), dir },
    { name: "compact", axis: "x", layout: layoutFlow(spec, COMPACT), dir: "TD" },
  ];
};
const node = (layout, id) => layout.nodes.find((n) => n.id === id);
const sameRank = (layout, dir, a, b) => {
  const [p, q] = [node(layout, a), node(layout, b)];
  return Math.abs(dir === "LR" ? p.x + p.w / 2 - (q.x + q.w / 2) : p.y + p.h / 2 - (q.y + q.h / 2)) < 1;
};

// For every node, the children of its first edge go before the children of the next one
function siblingsOutOfOrder(spec, { layout, axis, dir }) {
  const targets = new Map();
  for (const e of spec.edges || []) {
    if (e.from === e.to) continue;
    if (!targets.has(e.from)) targets.set(e.from, []);
    if (!targets.get(e.from).includes(e.to)) targets.get(e.from).push(e.to);
  }
  const wrong = [];
  for (const [parent, kids] of targets) {
    for (let i = 0; i + 1 < kids.length; i++) {
      if (!sameRank(layout, dir, kids[i], kids[i + 1])) continue; // nothing to order across ranks
      if (!(node(layout, kids[i])[axis] < node(layout, kids[i + 1])[axis])) wrong.push(`${parent}: ${kids[i]} before ${kids[i + 1]}`);
    }
  }
  return wrong;
}

// Edge routes come back as SVG paths; their numbers are the points of the route. Two edges that meet
// at a box share an end point, which is not a crossing.
const route = (path) => {
  const nums = path.match(/-?\d+(\.\d+)?/g).map(Number);
  return Array.from({ length: Math.floor(nums.length / 2) }, (_, i) => ({ x: nums[i * 2], y: nums[i * 2 + 1] }));
};
const near = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
const turn = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const segmentsCross = (a, b, c, d) =>
  !(near(a, c) || near(a, d) || near(b, c) || near(b, d)) && turn(a, b, c) !== turn(a, b, d) && turn(c, d, a) !== turn(c, d, b);
function crossingEdges(layout) {
  const routes = layout.edges.map((e) => route(e.path));
  const crossing = [];
  routes.forEach((r1, i) =>
    routes.slice(i + 1).forEach((r2, k) => {
      if (r1.some((p, a) => a > 0 && r2.some((q, b) => b > 0 && segmentsCross(r1[a - 1], p, r2[b - 1], q)))) crossing.push(`${i}/${i + 1 + k}`);
    }),
  );
  return crossing;
}

const decision = (extra = {}) => ({
  nodes: [
    { id: "Q", label: "Critical?", shape: "decision" },
    { id: "Yes", label: "Inline it" },
    { id: "No", label: "Defer it" },
  ],
  edges: [
    { from: "Q", to: "Yes", label: "Yes" },
    { from: "Q", to: "No", label: "No" },
  ],
  ...extra,
});

describe("the order of the siblings follows the order of the edges", () => {
  it("puts the first edge on the left in a top down flow, in the wide and the compact layout", () => {
    for (const l of layoutsOf(decision())) {
      expect(node(l.layout, "Yes").x, l.name).toBeLessThan(node(l.layout, "No").x);
    }
  });

  it("puts the first edge on top in a left to right flow", () => {
    const [wide] = layoutsOf(decision({ direction: "LR" }));
    expect(node(wide.layout, "Yes").y).toBeLessThan(node(wide.layout, "No").y);
  });

  it("keeps three siblings in the order of their edges", () => {
    const spec = {
      nodes: [{ id: "Q", label: "Which?" }, { id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }],
      edges: [{ from: "Q", to: "C" }, { from: "Q", to: "A" }, { from: "Q", to: "B" }],
    };
    for (const l of layoutsOf(spec)) {
      const xs = ["C", "A", "B"].map((id) => node(l.layout, id).x);
      expect(xs, l.name).toEqual([...xs].sort((a, b) => a - b));
    }
  });

  it("does not depend on the order the nodes are declared in", () => {
    const flipped = decision({ nodes: [...decision().nodes].reverse() });
    for (const l of layoutsOf(flipped)) {
      expect(node(l.layout, "Yes").x, l.name).toBeLessThan(node(l.layout, "No").x);
    }
  });

  it("orders every decision of a tree, not only the first", () => {
    const spec = {
      nodes: [
        { id: "A", label: "A?", shape: "decision" },
        { id: "B", label: "B?", shape: "decision" },
        { id: "C", label: "C?", shape: "decision" },
        { id: "b1", label: "b1" }, { id: "b2", label: "b2" }, { id: "c1", label: "c1" }, { id: "c2", label: "c2" },
      ],
      edges: [
        { from: "A", to: "B", label: "Yes" }, { from: "A", to: "C", label: "No" },
        { from: "B", to: "b1", label: "Yes" }, { from: "B", to: "b2", label: "No" },
        { from: "C", to: "c1", label: "Yes" }, { from: "C", to: "c2", label: "No" },
      ],
    };
    for (const l of layoutsOf(spec)) expect(siblingsOutOfOrder(spec, l), l.name).toEqual([]);
  });

  it("copes with children on different ranks, a repeated edge and a self loop", () => {
    const spec = {
      nodes: [{ id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }],
      edges: [{ from: "A", to: "B" }, { from: "A", to: "C" }, { from: "A", to: "C" }, { from: "B", to: "C" }, { from: "B", to: "B" }],
    };
    for (const l of layoutsOf(spec)) {
      expect(l.layout.nodes).toHaveLength(3);
      expect(l.layout.edges).toHaveLength(5);
    }
  });
});

// Every <Flow /> of the docs pages
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

function flowsOf(source) {
  const out = [];
  for (let from = 0; ; ) {
    const at = source.indexOf("<Flow", from);
    if (at < 0) return out;
    const props = {};
    let i = at + 5;
    while (i < source.length) {
      while (/\s/.test(source[i])) i++;
      if (source.startsWith("/>", i)) {
        i += 2;
        break;
      }
      const name = /^([a-zA-Z]+)=/.exec(source.slice(i));
      if (!name) break;
      i += name[0].length;
      if (source[i] === '"') {
        const end = source.indexOf('"', i + 1);
        props[name[1]] = source.slice(i + 1, end);
        i = end + 1;
      } else {
        let depth = 0;
        let j = i;
        for (; j < source.length; j++) {
          if (source[j] === '"') j = source.indexOf('"', j + 1);
          else if (source[j] === "{") depth++;
          else if (source[j] === "}" && --depth === 0) break;
        }
        props[name[1]] = new Function(`return ${source.slice(i + 1, j)}`)();
        i = j + 1;
      }
    }
    out.push(props);
    from = i;
  }
}

describe("every Flow diagram in the pages", () => {
  const diagrams = walk("pages")
    .filter((f) => f.endsWith(".mdx"))
    .flatMap((f) => flowsOf(readFileSync(f, "utf8")).map((spec, n) => ({ id: `${f.replace(/^pages\//, "")} #${n}`, spec: cleanSpec(spec) })));

  it("finds the diagrams", () => {
    expect(diagrams.length).toBeGreaterThanOrEqual(20);
  });

  it.each(diagrams.map((d) => [d.id, d.spec]))("%s draws its siblings in the order of its edges", (_id, spec) => {
    for (const l of layoutsOf(spec)) expect(siblingsOutOfOrder(spec, l), l.name).toEqual([]);
  });

  // Asking for the order of the siblings must never cost a crossing: forcing every pair at once makes
  // edges cross in six of these diagrams, so the pairs that would cross keep dagre's arrangement.
  it.each(diagrams.map((d) => [d.id, d.spec]))("%s draws no crossing edges", (_id, spec) => {
    for (const { layout, name } of layoutsOf(spec)) expect(crossingEdges(layout), name).toEqual([]);
  });

  it.each(diagrams.map((d) => [d.id, d.spec]))("%s has no overlapping nodes", (_id, spec) => {
    for (const { layout, name } of layoutsOf(spec)) {
      const overlaps = [];
      layout.nodes.forEach((a, i) =>
        layout.nodes.slice(i + 1).forEach((b) => {
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${a.id}/${b.id}`);
        }),
      );
      expect(overlaps, name).toEqual([]);
    }
  });
});
