import { useId, useMemo } from "react";
import { cleanSpec, stripEmoji } from "../../lib/strip-emoji";
import { describeFlow } from "./shared";
import { layoutFlow, LH, FS, SUB, EDGE_FS, NOTE_FS } from "./flowLayout";

// Declarative flow diagram drawn as inline SVG. Nodes are laid out with dagre,
// colors come from the `--dg-*` tokens in `styles/globals.css`, and the diagram
// follows the light and dark theme.
//
//   <Flow
//     direction="TD"            // "TD" (top down, default) or "LR" (left to right)
//     title="What the diagram shows"
//     nodes={[{ id: "a", label: "Line one\nLine two", sub: "Muted second block", shape: "rect", tone: "good" }]}
//     edges={[{ from: "a", to: "b", label: "Yes", dashed: false }]}
//     groups={[{ id: "g", label: "Group title", tone: "bad", nodes: ["a", "b"] }]}
//     notes={[{ attach: "a", text: "Side note", side: "right" }]}
//   />
//
// Siblings: the nodes a node points to are drawn in the order of its edges, the first edge on the left
// in a top down flow and on top in a left to right one, so `Yes` before `No` reads as written. The
// order is never bought with a crossing edge: a pair that could only be ordered by crossing edges
// keeps the arrangement without crossings, and children that sit on different ranks have no order.
//
// Shapes: rect (default), pill, decision (accent border and a diamond marker),
// start and end (small dot and ring, for state diagrams).
// Tones: neutral (default), info, good, warn, bad, violet, ttfb, delay, load, render.
//
// A wide layout would shrink its text on a narrow column, so the component also
// lays the graph out top down with narrower nodes. A container query in
// `globals.css` (the `dg-bp-*` classes) swaps between the two layouts.

const BREAKPOINTS = [400, 480, 560, 640, 720, 800];
const NARROW_COLUMN = 340; // approximate width of the content column on a phone
const MIN_SCALE = 0.84; // smallest scale at which the text stays at 11px or more

function planLayouts(spec) {
  const direction = spec.direction === "LR" ? "LR" : "TD";
  const primary = layoutFlow(spec, direction === "LR" ? { direction, maxText: 120, ranksep: 40 } : { direction, maxText: 210 });
  if (direction === "TD" && primary.width * MIN_SCALE <= NARROW_COLUMN) return { primary };
  const compact = layoutFlow(spec, { direction: "TD", maxText: 112, nodesep: 10, ranksep: 40, labelMax: 110 });
  const need = primary.width * MIN_SCALE;
  const bp = BREAKPOINTS.find((b) => b >= need) ?? BREAKPOINTS[BREAKPOINTS.length - 1];
  return { primary, compact, bp };
}

function Lines({ x, y, lines, lh, size, className, anchor = "middle", weight }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} className={className}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function NodeShape({ n }) {
  const tone = n.tone || (n.shape === "decision" ? "info" : "neutral");
  const cx = n.x + n.w / 2;
  if (n.shape === "start") {
    return <circle cx={cx} cy={n.y + n.h / 2} r="7" className="dg-dot" />;
  }
  if (n.shape === "end") {
    return (
      <g>
        <circle cx={cx} cy={n.y + n.h / 2} r="9" className="dg-ring" />
        <circle cx={cx} cy={n.y + n.h / 2} r="5" className="dg-dot" />
      </g>
    );
  }
  const rx = n.shape === "pill" ? n.h / 2 : 10;
  const box =
    n.shape === "decision" ? "dg-node dg-decision" : tone === "neutral" ? "dg-plain" : "dg-node";
  const total = n.lines.length * LH + n.sub.length * 14.5;
  const top = n.y + (n.h - total) / 2;
  const textX = cx + (n.shape === "decision" ? 10 : 0);
  return (
    <g className={`dg-c-${tone}`}>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={rx} className={box} />
      {n.shape === "decision" && (
        <text x={n.x + 15} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize="11" className="dg-mark" aria-hidden="true">
          ◆
        </text>
      )}
      <Lines x={textX} y={top + FS * 0.95} lines={n.lines} lh={LH} size={FS} weight={500} className="dg-text" />
      {n.sub.length > 0 && (
        <Lines x={textX} y={top + n.lines.length * LH + SUB * 0.95} lines={n.sub} lh={14.5} size={SUB} className="dg-muted" />
      )}
    </g>
  );
}

function FlowSvg({ layout, markerId, titleId, title, desc, compact }) {
  const minWidth = compact && layout.width * MIN_SCALE > NARROW_COLUMN ? Math.round(layout.width * MIN_SCALE) : undefined;
  const svg = (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-labelledby={`${titleId} ${titleId}d`}
      className="dg-svg"
      style={{ maxWidth: layout.width, minWidth, margin: "0 auto" }}
    >
      <title id={titleId}>{title}</title>
      <desc id={`${titleId}d`}>{desc}</desc>
      <g>
        {layout.groups.map((gr) => (
          <g key={gr.id} className={`dg-c-${gr.tone || "neutral"}`}>
            <rect x={gr.x} y={gr.y} width={gr.w} height={gr.h} rx="12" className="dg-group" />
            <text x={gr.x + 14} y={gr.y + 22} fontSize="12.5" fontWeight="600" className="dg-text">
              {gr.label}
            </text>
          </g>
        ))}
        {layout.edges.map((e, i) => (
          <path
            key={i}
            d={e.path}
            className={`dg-line${e.dashed ? " dg-dash" : ""}`}
            markerEnd={e.arrow ? `url(#${markerId})` : undefined}
          />
        ))}
        {layout.notes.map((nt, i) => (
          <line key={`nl${i}`} x1={nt.link.x1} y1={nt.link.y} x2={nt.link.x2} y2={nt.link.y} className="dg-line dg-dash" />
        ))}
        {layout.nodes.map((n) => (
          <NodeShape key={n.id} n={n} />
        ))}
        {layout.notes.map((nt, i) => (
          <g key={`n${i}`} className="dg-c-neutral">
            <rect x={nt.x} y={nt.y} width={nt.w} height={nt.h} rx="8" className="dg-note" />
            <Lines x={nt.x + nt.w / 2} y={nt.y + 6 + NOTE_FS * 0.95} lines={nt.lines} lh={15} size={NOTE_FS} className="dg-text" />
          </g>
        ))}
        {layout.edges.map(
          (e, i) =>
            e.label && (
              <g key={`l${i}`}>
                <rect
                  x={e.label.x - e.label.w / 2}
                  y={e.label.y - e.label.h / 2}
                  width={e.label.w}
                  height={e.label.h}
                  rx={Math.min(e.label.h / 2, 10)}
                  className="dg-yes"
                />
                <Lines
                  x={e.label.x}
                  y={e.label.y - (e.label.lines.length * 13) / 2 + EDGE_FS * 0.95}
                  lines={e.label.lines}
                  lh={13}
                  size={EDGE_FS}
                  weight={600}
                  className="dg-muted"
                />
              </g>
            ),
        )}
      </g>
    </svg>
  );
  if (minWidth === undefined) return svg;
  return (
    <div className="dg-scroll" role="region" aria-label={`${title} (scrollable)`} tabIndex={0}>
      {svg}
    </div>
  );
}

export function Flow({ direction = "TD", nodes: rawNodes, edges: rawEdges = [], groups: rawGroups = [], notes: rawNotes = [], title: rawTitle = "Flow diagram" }) {
  const uid = useId().replace(/:/g, "");
  // Emojis in the labels would draw with the system emoji font; the tone says the same.
  const { nodes, edges, groups, notes } = useMemo(
    () => cleanSpec({ nodes: rawNodes, edges: rawEdges, groups: rawGroups, notes: rawNotes }),
    [rawNodes, rawEdges, rawGroups, rawNotes],
  );
  const title = stripEmoji(rawTitle);
  const plan = useMemo(
    () => planLayouts({ direction, nodes, edges, groups, notes }),
    [direction, nodes, edges, groups, notes],
  );
  const desc = describeFlow({ nodes, edges });
  const markerId = `${uid}m`;
  return (
    <div className={`wp-dg dg-flow${plan.bp ? ` dg-bp-${plan.bp}` : ""}`}>
      <div className="dg-v-primary">
        <FlowSvg layout={plan.primary} markerId={markerId} titleId={`${uid}p`} title={title} desc={desc} />
      </div>
      {plan.compact && (
        <div className="dg-v-compact">
          <FlowSvg layout={plan.compact} markerId={markerId} titleId={`${uid}c`} title={title} desc={desc} compact />
        </div>
      )}
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9 z" className="dg-arrowhead" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
