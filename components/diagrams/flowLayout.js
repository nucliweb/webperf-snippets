import { graphlib, layout } from "@dagrejs/dagre";
import { textWidth, wrapText } from "./shared";

// Pure layout for the Flow component. Node sizes are estimated from the label
// text, dagre places the nodes and routes the edges, and this module turns the
// result into plain numbers the component can draw.

export const FS = 13; // node label size
export const SUB = 11.5; // node sub-label size
export const EDGE_FS = 11; // edge label size
export const NOTE_FS = 12;
export const LH = 17;
const SLH = 14.5;
const PADX = 14;
const PADY = 10;
const GROUP_PAD = 14;
const GROUP_TOP = 34;
const MARGIN = 4;

function measureNode(node, cfg) {
  const shape = node.shape || "rect";
  if (shape === "start" || shape === "end") {
    return { ...node, shape, w: 20, h: 20, lines: [], sub: [] };
  }
  const marker = shape === "decision" ? 20 : 0;
  const padX = shape === "pill" ? 20 : PADX;
  const maxText = cfg.maxText - marker;
  const lines = wrapText(node.label ?? node.id, maxText, FS, 500);
  const sub = node.sub ? wrapText(node.sub, maxText, SUB) : [];
  const textW = Math.max(
    ...lines.map((l) => textWidth(l, FS, 500)),
    ...sub.map((l) => textWidth(l, SUB)),
  );
  const w = Math.ceil(Math.max(textW + padX * 2 + marker, 64));
  const minH = shape === "pill" ? 36 : 38;
  const h = Math.max(lines.length * LH + sub.length * SLH + PADY * 2, minH);
  return { ...node, shape, w, h, lines, sub };
}

function measureEdgeLabel(label, maxWidth) {
  if (!label) return null;
  const lines = wrapText(label, maxWidth, EDGE_FS, 600);
  const w = Math.ceil(Math.max(...lines.map((l) => textWidth(l, EDGE_FS, 600))) + 16);
  const h = lines.length * 13 + 8;
  return { lines, w: Math.max(w, 28), h };
}

// Rounded polyline: straight at both ends, quadratic bends through the inner points.
export function smoothPath(points) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  const f = (n) => Math.round(n * 10) / 10;
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${f(pts[0].x)} ${f(pts[0].y)} L${f(pts[1].x)} ${f(pts[1].y)}`;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  const first = mid(pts[0], pts[1]);
  d += ` L${f(first.x)} ${f(first.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    d += ` Q${f(pts[i].x)} ${f(pts[i].y)} ${f(m.x)} ${f(m.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last.x)} ${f(last.y)}`;
}

const GROUP_LABEL_FS = 12.5;

function shiftParts(parts, dx, dy) {
  const mv = (o) => ({ ...o, x: o.x + dx, y: o.y + dy });
  return {
    nodes: parts.nodes.map(mv),
    groups: parts.groups.map(mv),
    notes: parts.notes.map((n) => ({ ...mv(n), link: { x1: n.link.x1 + dx, x2: n.link.x2 + dx, y: n.link.y + dy } })),
    edges: parts.edges.map((e) => ({
      ...e,
      pts: e.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      label: e.label && { ...e.label, x: e.label.x + dx, y: e.label.y + dy },
    })),
  };
}

function boundsOf(parts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x1, y1, x2, y2) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  };
  for (const n of parts.nodes) add(n.x, n.y, n.x + n.w, n.y + n.h);
  for (const gr of parts.groups) add(gr.x, gr.y, gr.x + gr.w, gr.y + gr.h);
  for (const nt of parts.notes) add(nt.x, nt.y, nt.x + nt.w, nt.y + nt.h);
  for (const e of parts.edges) {
    for (const p of e.pts) add(p.x, p.y, p.x, p.y);
    if (e.label) add(e.label.x - e.label.w / 2, e.label.y - e.label.h / 2, e.label.x + e.label.w / 2, e.label.y + e.label.h / 2);
  }
  return { minX, minY, maxX, maxY };
}

// Number of pairs of edges whose routes cross. Edges that meet at a box share an end point, which is
// not a crossing.
function countCrossings(routed) {
  const near = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const cross = (a, b, c, d) => {
    if (near(a, c) || near(a, d) || near(b, c) || near(b, d)) return false;
    return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
  };
  const routes = routed.filter((e) => !e.selfLoop).map((e) => e.pts);
  let count = 0;
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const hit = routes[i].some((p, a) => a > 0 && routes[j].some((q, b) => b > 0 && cross(routes[i][a - 1], p, routes[j][b - 1], q)));
      if (hit) count++;
    }
  }
  return count;
}

// Places pre-measured boxes with dagre. Coordinates come back as top-left corners.
//
// The siblings of a node keep the order of its edges: the first edge goes first, on the left in a top
// down flow and on top in a left to right one. dagre finds the arrangement with the fewest crossings
// and places siblings in whatever order that gives, so the order is only asked for when it costs no
// crossing; the pairs that would cross are left as dagre arranged them, and the whole arrangement is
// mirrored when that follows the edges better.
function place(boxes, edges, cfg) {
  const lr = cfg.direction === "LR";
  const build = () => {
    const g = new graphlib.Graph({ multigraph: true });
    g.setGraph({
      rankdir: lr ? "LR" : "TB",
      nodesep: cfg.nodesep,
      ranksep: cfg.ranksep,
      edgesep: 14,
      marginx: 0,
      marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const b of boxes) g.setNode(b.id, { width: b.w, height: b.h });
    const named = edges.map((e, i) => {
      const label = measureEdgeLabel(e.label, cfg.labelMax);
      const name = `e${i}`;
      g.setEdge(e.from, e.to, { width: label ? label.w : 0, height: label ? label.h : 0, labelpos: "c" }, name);
      return { ...e, label, name };
    });
    return { g, named };
  };

  const solve = (constraints) => {
    const { g, named } = build();
    layout(g, constraints.length > 0 ? { constraints } : undefined);
    const pos = new Map(boxes.map((b) => [b.id, { x: g.node(b.id).x - b.w / 2, y: g.node(b.id).y - b.h / 2 }]));
    const out = named.map((e) => {
      const de = g.edge(e.from, e.to, e.name);
      const common = { dashed: !!e.dashed, arrow: e.arrow !== false, label: e.label && { ...e.label, x: de.x, y: de.y } };
      if (e.from === e.to) {
        // A self loop leaves the right side of its box; dagre only reserves the room for it.
        const b = boxes.find((bx) => bx.id === e.from);
        const p = pos.get(e.from);
        const rx = p.x + b.w;
        const cy = p.y + b.h / 2;
        return {
          ...common,
          pts: [{ x: rx, y: cy - 8 }, { x: rx + 30, y: cy - 8 }, { x: rx + 30, y: cy + 8 }, { x: rx + 1, y: cy + 8 }],
          label: e.label && { ...e.label, x: rx + 36 + e.label.w / 2, y: cy },
          selfLoop: e.from,
        };
      }
      return { ...common, pts: de.points.map((pt) => ({ x: pt.x, y: pt.y })) };
    });
    return { pos, edges: out };
  };

  const base = solve([]);

  // Consecutive siblings, in the order of their edges, that sit on the same rank: only those have an order.
  const targets = new Map();
  for (const e of edges) {
    if (e.from === e.to) continue;
    if (!targets.has(e.from)) targets.set(e.from, []);
    if (!targets.get(e.from).includes(e.to)) targets.get(e.from).push(e.to);
  }
  const size = new Map(boxes.map((b) => [b.id, b]));
  const center = (res, id, axis) => res.pos.get(id)[axis] + (axis === "x" ? size.get(id).w : size.get(id).h) / 2;
  const rankAxis = lr ? "x" : "y";
  const orderAxis = lr ? "y" : "x";
  const pairs = [];
  for (const list of targets.values()) {
    for (let i = 0; i + 1 < list.length; i++) {
      if (Math.abs(center(base, list[i], rankAxis) - center(base, list[i + 1], rankAxis)) < 0.5) pairs.push([list[i], list[i + 1]]);
    }
  }
  if (pairs.length === 0) return base;

  const agreement = (res) => pairs.filter(([a, b]) => center(res, a, orderAxis) < center(res, b, orderAxis)).length;
  if (agreement(base) === pairs.length) return base;

  // Ask for the order of the siblings, but never at the price of a crossing: try every pair at once, and
  // if that crosses edges, add the pairs one at a time and keep each one that does not.
  const limit = countCrossings(base.edges);
  const asConstraints = (list) => list.map(([left, right]) => ({ left, right }));
  const everything = solve(asConstraints(pairs));
  if (countCrossings(everything.edges) <= limit) return everything;
  const accepted = [];
  let current = base;
  for (const pair of pairs) {
    const trial = solve(asConstraints([...accepted, pair]));
    if (countCrossings(trial.edges) <= limit) {
      accepted.push(pair);
      current = trial;
    }
  }

  // A mirror image keeps an arrangement crossing-free (x for a top down flow, y for a left to right one)
  const extent = (id) => (lr ? size.get(id).h : size.get(id).w);
  const mirror = (res) => {
    const coords = [];
    for (const [id, p] of res.pos) coords.push(p[orderAxis], p[orderAxis] + extent(id));
    for (const e of res.edges) for (const pt of e.pts) coords.push(pt[orderAxis]);
    const flip = Math.min(...coords) + Math.max(...coords);
    return {
      pos: new Map([...res.pos].map(([id, p]) => [id, { ...p, [orderAxis]: flip - p[orderAxis] - extent(id) }])),
      edges: res.edges.map((e) => ({
        ...e,
        pts: e.pts.map((pt) => ({ ...pt, [orderAxis]: flip - pt[orderAxis] })),
        label: e.label && { ...e.label, [orderAxis]: flip - e.label[orderAxis] },
      })),
    };
  };

  // The candidate that follows the most pairs wins; on a tie the earlier one does
  const candidates = [current, mirror(base), mirror(current)];
  return candidates.reduce((best, c) => (agreement(c) > agreement(best) ? c : best));
}

// Returns drawing primitives in a coordinate system that starts at (0, 0).
function layoutParts(spec, cfg) {
  const { nodes, edges = [], groups = [], notes = [] } = spec;
  const measured = new Map(nodes.map((n) => [n.id, measureNode(n, cfg)]));
  const groupOf = new Map();
  for (const gr of groups) for (const id of gr.nodes) groupOf.set(id, gr.id);
  const owner = (id) => groupOf.get(id) ?? id; // the box an edge endpoint belongs to
  const sameGroup = (e) => groupOf.has(e.from) && groupOf.get(e.from) === groupOf.get(e.to);

  // Each group is laid out on its own and then placed as one box.
  const inner = new Map();
  const boxes = [];
  for (const gr of groups) {
    const sub = layoutParts(
      { nodes: nodes.filter((n) => gr.nodes.includes(n.id)), edges: edges.filter((e) => sameGroup(e) && groupOf.get(e.from) === gr.id) },
      cfg,
    );
    const b = boundsOf(sub);
    const content = shiftParts(sub, -b.minX, -b.minY);
    const cw = b.maxX - b.minX;
    const ch = b.maxY - b.minY;
    const labelW = textWidth(gr.label, GROUP_LABEL_FS, 600) + 28;
    const w = Math.ceil(Math.max(cw + GROUP_PAD * 2, labelW));
    inner.set(gr.id, { content, offsetX: (w - cw) / 2, w, h: Math.ceil(ch + GROUP_TOP + GROUP_PAD) });
    boxes.push({ id: gr.id, w, h: inner.get(gr.id).h });
  }
  for (const n of nodes) if (!groupOf.has(n.id)) boxes.push({ id: n.id, w: measured.get(n.id).w, h: measured.get(n.id).h });

  const outer = edges
    .filter((e) => !sameGroup(e))
    .map((e) => ({ ...e, from: owner(e.from), to: owner(e.to) }));
  const { pos, edges: placed } = place(boxes, outer, cfg);

  const parts = { nodes: [], groups: [], notes: [], edges: placed };
  for (const gr of groups) {
    const p = pos.get(gr.id);
    const ib = inner.get(gr.id);
    parts.groups.push({ ...gr, x: p.x, y: p.y, w: ib.w, h: ib.h });
    const moved = shiftParts(ib.content, p.x + ib.offsetX, p.y + GROUP_TOP);
    parts.nodes.push(...moved.nodes);
    parts.notes.push(...moved.notes);
    parts.edges.push(...moved.edges);
  }
  for (const n of nodes) {
    if (groupOf.has(n.id)) continue;
    const m = measured.get(n.id);
    const p = pos.get(n.id);
    parts.nodes.push({ ...m, x: p.x, y: p.y });
  }
  // Nodes of groups come first in the array; keep the input order for drawing.
  parts.nodes.sort((a, b) => nodes.findIndex((n) => n.id === a.id) - nodes.findIndex((n) => n.id === b.id));

  const nodeById = new Map(parts.nodes.map((n) => [n.id, n]));
  for (const note of notes) {
    const a = nodeById.get(note.attach);
    const lines = wrapText(note.text, cfg.labelMax, NOTE_FS);
    const w = Math.ceil(Math.max(...lines.map((l) => textWidth(l, NOTE_FS))) + 20);
    const h = lines.length * 15 + 12;
    // A self loop takes the right side of its node, so a note goes to the left then.
    const hasLoop = parts.edges.some((e) => e.selfLoop === note.attach);
    const right = (note.side || "right") === "right" && !hasLoop;
    const x = right ? a.x + a.w + 26 : a.x - 26 - w;
    parts.notes.push({ ...note, lines, x, y: a.y + a.h / 2 - h / 2, w, h, link: { x1: right ? a.x + a.w : a.x, x2: right ? x : x + w, y: a.y + a.h / 2 } });
  }
  return parts;
}

export function layoutFlow(spec, options = {}) {
  const cfg = {
    direction: options.direction === "LR" ? "LR" : "TD",
    maxText: options.maxText ?? 210,
    nodesep: options.nodesep ?? 28,
    ranksep: options.ranksep ?? 46,
    labelMax: options.labelMax ?? 170, // widest edge label or note before it wraps
  };
  const parts = layoutParts(spec, cfg);
  const b = boundsOf(parts);
  const shifted = shiftParts(parts, MARGIN - b.minX, MARGIN - b.minY);
  return {
    width: Math.ceil(b.maxX - b.minX + MARGIN * 2),
    height: Math.ceil(b.maxY - b.minY + MARGIN * 2),
    nodes: shifted.nodes,
    groups: shifted.groups,
    notes: shifted.notes,
    edges: shifted.edges.map((e) => ({ path: smoothPath(e.pts), dashed: e.dashed, arrow: e.arrow, label: e.label })),
  };
}
