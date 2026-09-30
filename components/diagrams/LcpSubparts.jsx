import { useId } from "react";

// Diagrams for the LCP subparts page, drawn as inline SVG so they follow the
// palette of the interactive demos and switch with the light and dark theme.
// Colors come from the `--dg-*` tokens in `styles/globals.css`. Each diagram has
// a wide and a narrow layout; a container query in the same file shows the one
// that fits the width of the column.

const PHASES = {
  ttfb: { name: "TTFB", note: ["Server", "response"] },
  delay: { name: "Load delay", note: ["Resource", "discovery"] },
  load: { name: "Load time", note: ["Download", "resource"] },
  render: { name: "Render delay", note: ["Paint", "element"] },
};
const ORDER = ["ttfb", "delay", "load", "render"];

// Joins wrapped lines back into one, without a stray space after a hyphen break
const joinLines = (lines) => lines.reduce((a, l) => (a.endsWith("-") ? a + l : a + " " + l));

const FIXES = {
  ttfb: { question: "TTFB > 800 ms?", items: [["Use a CDN"], ["Enable caching"], ["Optimize the server"]] },
  delay: {
    question: "Load delay > 10%?",
    items: [["Preload the", "LCP image"], ["Remove render-", "blocking resources"], ["Inline critical CSS"]],
  },
  load: {
    question: "Load time > 40%?",
    items: [["Compress images"], ["Use WebP or AVIF"], ["Use responsive", "images"]],
  },
  render: {
    question: "Render delay > 10%?",
    items: [["Defer non-critical", "JavaScript"], ["Avoid client-side", "rendering"], ["Set fetchpriority", "to high"]],
  },
};

function Defs({ id }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M1 1 L9 5 L1 9 z" className="dg-arrowhead" />
      </marker>
    </defs>
  );
}

function Lines({ x, y, lines, lh = 15, className = "", anchor = "middle", size = 12 }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} className={className}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/* ── The four phases of LCP ─────────────────────────────────────────────── */

function PhasesWide({ uid }) {
  const y = 12, h = 76, cy = y + h / 2;
  let x = 2;
  const items = [{ kind: "start", w: 92 }, ...ORDER.map((k) => ({ kind: k, w: 112 })), { kind: "end", w: 72 }];
  const gap = 12;
  return (
    <svg viewBox="0 0 684 100" role="img" aria-labelledby={`${uid}-t1`} className="dg-svg">
      <title id={`${uid}-t1`}>The four phases of LCP, in order: time to first byte, load delay, load time and render delay</title>
      {items.map((n, i) => {
        const nx = x;
        x += n.w + gap;
        const cx = nx + n.w / 2;
        const arrow = i < items.length - 1 && (
          <path d={`M${nx + n.w + 2} ${cy} H${nx + n.w + gap - 2}`} className="dg-line" markerEnd={`url(#${uid}-m)`} />
        );
        if (n.kind === "start") {
          return (
            <g key={i}>
              <rect x={nx} y={y} width={n.w} height={h} rx={h / 2} className="dg-plain" />
              <Lines x={cx} y={cy - 2} lines={["Navigation", "start"]} className="dg-muted" />
              {arrow}
            </g>
          );
        }
        if (n.kind === "end") {
          return (
            <g key={i} className="dg-c-accent">
              <rect x={nx} y={y} width={n.w} height={h} rx={h / 2} className="dg-node" />
              <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" className="dg-text dg-title">LCP</text>
              <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" className="dg-ok">✓ complete</text>
            </g>
          );
        }
        const p = PHASES[n.kind];
        return (
          <g key={i} className={`dg-c-${n.kind}`}>
            <rect x={nx} y={y} width={n.w} height={h} rx="10" className="dg-node" />
            <text x={cx} y={cy - 9} textAnchor="middle" fontSize="13.5" className="dg-text dg-title">{p.name}</text>
            <Lines x={cx} y={cy + 9} lines={p.note} lh={13} size={11} className="dg-muted" />
            {arrow}
          </g>
        );
      })}
    </svg>
  );
}

function PhasesNarrow({ uid }) {
  const w = 300, h = 50, gap = 20;
  const items = [{ kind: "start" }, ...ORDER.map((k) => ({ kind: k })), { kind: "end" }];
  const total = items.length * h + (items.length - 1) * gap;
  return (
    <svg viewBox={`0 0 ${w + 4} ${total + 4}`} role="img" aria-labelledby={`${uid}-t2`} className="dg-svg dg-svg--narrow">
      <title id={`${uid}-t2`}>The four phases of LCP, in order: time to first byte, load delay, load time and render delay</title>
      {items.map((n, i) => {
        const y = 2 + i * (h + gap), cy = y + h / 2, cx = 2 + w / 2;
        const arrow = i < items.length - 1 && (
          <path d={`M${cx} ${y + h + 2} V${y + h + gap - 2}`} className="dg-line" markerEnd={`url(#${uid}-n)`} />
        );
        if (n.kind === "start") {
          return (
            <g key={i}>
              <rect x="2" y={y} width={w} height={h} rx={h / 2} className="dg-plain" />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" className="dg-muted">Navigation start</text>
              {arrow}
            </g>
          );
        }
        if (n.kind === "end") {
          return (
            <g key={i} className="dg-c-accent">
              <rect x="2" y={y} width={w} height={h} rx={h / 2} className="dg-node" />
              <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" className="dg-text dg-title">
                LCP <tspan className="dg-ok" fontSize="12" fontWeight="500">✓ complete</tspan>
              </text>
            </g>
          );
        }
        const p = PHASES[n.kind];
        return (
          <g key={i} className={`dg-c-${n.kind}`}>
            <rect x="2" y={y} width={w} height={h} rx="10" className="dg-node" />
            <text x="18" y={cy - 3} fontSize="14" className="dg-text dg-title">{p.name}</text>
            <text x="18" y={cy + 13} fontSize="11.5" className="dg-muted">{joinLines(p.note)}</text>
            {arrow}
          </g>
        );
      })}
    </svg>
  );
}

export function LcpPhasesDiagram() {
  const uid = useId().replace(/:/g, "");
  return (
    <div className="wp-dg">
      <div className="dg-wide">
        <PhasesWide uid={uid} />
        <svg width="0" height="0" aria-hidden="true" focusable="false"><Defs id={`${uid}-m`} /></svg>
      </div>
      <div className="dg-narrow">
        <PhasesNarrow uid={uid} />
        <svg width="0" height="0" aria-hidden="true" focusable="false"><Defs id={`${uid}-n`} /></svg>
      </div>
    </div>
  );
}

/* ── Optimization decision tree ─────────────────────────────────────────── */

function TreeWide({ uid }) {
  const colW = 160, gap = 12, W = 4 * colW + 3 * gap;
  const qY = 84, qH = 44, cardY = 192, lh = 15, pad = 12;
  const cards = ORDER.map((k) => {
    let yy = pad + 11;
    const rows = FIXES[k].items.map((lines) => {
      const row = { lines, y: yy };
      yy += lines.length * lh + 7;
      return row;
    });
    return { k, rows, h: yy - 7 + pad };
  });
  const cardH = Math.max(...cards.map((c) => c.h));
  const H = cardY + cardH + 4;
  const rootW = 210, rootX = W / 2 - rootW / 2;
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 2}`} role="img" aria-labelledby={`${uid}-t3`} className="dg-svg">
      <title id={`${uid}-t3`}>Optimization decision tree: find the slowest LCP phase, then apply the fixes listed under it</title>
      <rect x={rootX} y="2" width={rootW} height="34" rx="17" className="dg-plain" />
      <text x={W / 2} y="24" textAnchor="middle" fontSize="13" className="dg-text dg-title">Identify the slowest phase</text>
      {cards.map((c, i) => {
        const x = i * (colW + gap), cx = x + colW / 2;
        return (
          <g key={c.k} className={`dg-c-${c.k}`}>
            <path d={`M${W / 2} 36 V60 H${cx} V${qY - 2}`} className="dg-line" markerEnd={`url(#${uid}-tm)`} />
            <rect x={x} y={qY} width={colW} height={qH} rx="10" className="dg-node" />
            <text x={cx} y={qY + 26} textAnchor="middle" fontSize="13" className="dg-text dg-title">{FIXES[c.k].question}</text>
            <path d={`M${cx} ${qY + qH + 2} V${cardY - 2}`} className="dg-line" markerEnd={`url(#${uid}-tm)`} />
            <rect x={cx - 17} y={qY + qH + 20} width="34" height="20" rx="10" className="dg-yes" />
            <text x={cx} y={qY + qH + 34} textAnchor="middle" fontSize="11" className="dg-muted dg-title">Yes</text>
            <rect x={x} y={cardY} width={colW} height={cardH} rx="10" className="dg-card" />
            {c.rows.map((r, j) => (
              <g key={j}>
                <text x={x + 14} y={cardY + r.y} fontSize="12" className="dg-ok dg-title">✓</text>
                <Lines x={x + 30} y={cardY + r.y} lines={r.lines} anchor="start" lh={lh} className="dg-text" />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function TreeNarrow({ uid }) {
  const W = 316, spineX = 12, qX = 30, qW = W - qX, qH = 38, yesH = 30, lh = 15, pad = 12, between = 22;
  let y = 52;
  const groups = ORDER.map((k) => {
    const items = FIXES[k].items.map(joinLines);
    const cardH = pad * 2 + items.length * lh + (items.length - 1) * 7;
    const g = { k, y, items, cardH, qY: y, cardY: y + qH + yesH };
    y += qH + yesH + cardH + between;
    return g;
  });
  const H = y - between + 4;
  const lastMid = groups[groups.length - 1].qY + qH / 2;
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 2}`} role="img" aria-labelledby={`${uid}-t4`} className="dg-svg dg-svg--narrow">
      <title id={`${uid}-t4`}>Optimization decision tree: find the slowest LCP phase, then apply the fixes listed under it</title>
      <rect x="2" y="2" width="210" height="34" rx="17" className="dg-plain" />
      <text x="107" y="24" textAnchor="middle" fontSize="13" className="dg-text dg-title">Identify the slowest phase</text>
      <path d={`M${spineX} 36 V${lastMid}`} className="dg-line" />
      {groups.map((g) => (
        <g key={g.k} className={`dg-c-${g.k}`}>
          <path d={`M${spineX} ${g.qY + qH / 2} H${qX - 2}`} className="dg-line" markerEnd={`url(#${uid}-nm)`} />
          <rect x={qX} y={g.qY} width={qW} height={qH} rx="10" className="dg-node" />
          <text x={qX + qW / 2} y={g.qY + 24} textAnchor="middle" fontSize="13" className="dg-text dg-title">{FIXES[g.k].question}</text>
          <path d={`M${qX + 22} ${g.qY + qH + 2} V${g.cardY - 2}`} className="dg-line" markerEnd={`url(#${uid}-nm)`} />
          <rect x={qX + 34} y={g.qY + qH + 5} width="34" height="20" rx="10" className="dg-yes" />
          <text x={qX + 51} y={g.qY + qH + 19} textAnchor="middle" fontSize="11" className="dg-muted dg-title">Yes</text>
          <rect x={qX} y={g.cardY} width={qW} height={g.cardH} rx="10" className="dg-card" />
          {g.items.map((t, j) => (
            <g key={j}>
              <text x={qX + 14} y={g.cardY + pad + 11 + j * (lh + 7)} fontSize="12" className="dg-ok dg-title">✓</text>
              <text x={qX + 30} y={g.cardY + pad + 11 + j * (lh + 7)} fontSize="12" className="dg-text">{t}</text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function LcpDecisionTree() {
  const uid = useId().replace(/:/g, "");
  return (
    <div className="wp-dg">
      <div className="dg-wide">
        <TreeWide uid={uid} />
        <svg width="0" height="0" aria-hidden="true" focusable="false"><Defs id={`${uid}-tm`} /></svg>
      </div>
      <div className="dg-narrow">
        <TreeNarrow uid={uid} />
        <svg width="0" height="0" aria-hidden="true" focusable="false"><Defs id={`${uid}-nm`} /></svg>
      </div>
    </div>
  );
}
