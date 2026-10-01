import { useId, useMemo } from "react";
import { describeSequence } from "./shared";
import { layoutSequence, SEQ_FS, SEQ_LH } from "./sequenceLayout";

// Sequence diagram drawn as inline SVG, with the colors of the `--dg-*` tokens.
//
//   <Sequence
//     title="What the diagram shows"
//     participants={[{ id: "b", label: "Browser" }, { id: "s", label: "Server" }]}
//     steps={[
//       { type: "message", from: "b", to: "s", label: "GET /" },
//       { type: "message", from: "s", to: "b", label: "200 OK", dashed: true },
//       { type: "note", over: ["b", "s"], text: "Spans both lifelines" },   // or left: "b" / right: "s"
//       { type: "block", kind: "alt", label: "Cache hit", steps: [...], else: [{ label: "Cache miss", steps: [...] }] },
//       { type: "block", kind: "rect", tone: "bad", steps: [...] },
//     ]}
//   />
//
// A message from a participant to itself draws a loop. The natural width of the
// diagram can exceed a narrow column: the diagram then scrolls horizontally
// inside its own region instead of shrinking the text.

const MIN_SCALE = 0.84; // smallest scale at which the text stays at 11px or more

function lifelineSegments(head, from, to, boxes) {
  const cuts = boxes
    .filter((b) => head.x > b.x0 && head.x < b.x1)
    .map((b) => [b.y0, b.y1])
    .sort((a, b) => a[0] - b[0]);
  const segments = [];
  let y = from;
  for (const [c0, c1] of cuts) {
    if (c0 > y) segments.push([y, c0]);
    y = Math.max(y, c1);
  }
  if (y < to) segments.push([y, to]);
  return segments;
}

function Lines({ x, y, lines, anchor = "middle", className = "dg-text", size = SEQ_FS, weight }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} className={className}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : SEQ_LH}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export function Sequence({ participants, steps, title = "Sequence diagram" }) {
  const uid = useId().replace(/:/g, "");
  const layout = useMemo(() => layoutSequence({ participants, steps }), [participants, steps]);
  const names = Object.fromEntries(participants.map((p) => [p.id, p.label]));
  const desc = describeSequence(steps, names);
  const markerId = `${uid}m`;
  const titleId = `${uid}t`;
  return (
    <div className="wp-dg">
      <div className="dg-scroll" role="region" aria-label={`${title} (scrollable)`} tabIndex={0}>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-labelledby={`${titleId} ${titleId}d`}
          className="dg-svg"
          style={{ maxWidth: layout.width, minWidth: Math.round(layout.width * MIN_SCALE), margin: "0 auto" }}
        >
          <title id={titleId}>{title}</title>
          <desc id={`${titleId}d`}>{desc}</desc>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M1 1 L9 5 L1 9 z" className="dg-arrowhead" />
            </marker>
          </defs>

          {layout.items
            .filter((it) => it.kind === "frame")
            .map((f, i) => (
              <g key={`f${i}`} className={f.blockKind === "rect" ? `dg-c-${f.tone || "neutral"}` : undefined}>
                {f.blockKind === "rect" ? (
                  <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="8" className="dg-tint" />
                ) : (
                  <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="6" className="dg-frame" />
                )}
              </g>
            ))}

          {layout.heads.map((h) =>
            lifelineSegments(h, layout.lifelineFrom, layout.lifelineTo, layout.labelBoxes).map(([a, b], i) => (
              <line key={`${h.id}${i}`} x1={h.x} y1={a} x2={h.x} y2={b} className="dg-lifeline" />
            )),
          )}

          {layout.items.map((it, i) => {
            if (it.kind === "frame") {
              if (it.blockKind === "rect") return null;
              return (
                <g key={i}>
                  <rect x={it.x} y={it.y} width={54} height={20} rx="4" className="dg-yes" />
                  <text x={it.x + 27} y={it.y + 14} textAnchor="middle" fontSize="11" fontWeight="600" className="dg-muted">
                    {it.blockKind}
                  </text>
                  {it.label && (
                    <text x={it.x + 62} y={it.y + 14} fontSize="11.5" className="dg-muted">
                      [{it.label}]
                    </text>
                  )}
                  {it.dividers.map((d, j) => (
                    <g key={j}>
                      <line x1={it.x} y1={d.y} x2={it.x + it.w} y2={d.y} className="dg-line dg-dash" />
                      {d.label && (
                        <text x={it.x + 10} y={d.y + 17} fontSize="11.5" className="dg-muted">
                          [{d.label}]
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            }
            if (it.kind === "msg") {
              return (
                <g key={i}>
                  <Lines x={it.tx} y={it.ty} lines={it.lines} />
                  <path d={`M${it.x1} ${it.y} H${it.x2}`} className={`dg-line${it.dashed ? " dg-dash" : ""}`} markerEnd={`url(#${markerId})`} />
                </g>
              );
            }
            if (it.kind === "self") {
              return (
                <g key={i}>
                  <path
                    d={`M${it.x} ${it.y} H${it.x + 32} V${it.y + 16} H${it.x + 1}`}
                    className={`dg-line${it.dashed ? " dg-dash" : ""}`}
                    markerEnd={`url(#${markerId})`}
                  />
                  <Lines x={it.tx} y={it.ty} lines={it.lines} anchor="start" />
                </g>
              );
            }
            return (
              <g key={i} className={`dg-c-${it.tone || "neutral"}`}>
                <rect x={it.x} y={it.y} width={it.w} height={it.h} rx="6" className="dg-note" />
                <Lines x={it.x + it.w / 2} y={it.y + 5 + SEQ_FS * 0.95} lines={it.lines} />
              </g>
            );
          })}

          {layout.heads.map((h) => (
            <g key={h.id}>
              <rect x={h.x - h.w / 2} y="0" width={h.w} height={layout.headH} rx={layout.headH / 2} className="dg-plain" />
              <text x={h.x} y={layout.headH / 2 + 4.5} textAnchor="middle" fontSize={SEQ_FS} fontWeight="600" className="dg-text">
                {h.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
