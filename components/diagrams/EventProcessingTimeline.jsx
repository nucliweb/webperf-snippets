import { useId } from "react";

// Timeline of the key phases of a page load, drawn as inline SVG with the
// `--dg-*` tokens of `styles/globals.css`. It has a wide layout (labels on the
// left, bars on a shared time axis) and a narrow one (label above each bar); a
// container query in the same file shows the one that fits the column.

const SECTIONS = [
  {
    name: "Network",
    tone: "ttfb",
    rows: [
      ["Redirect", 0, 50],
      ["DNS Lookup", 50, 80],
      ["TCP Connection", 80, 120],
      ["SSL/TLS", 120, 180],
      ["Request/Response", 180, 350],
    ],
  },
  {
    name: "Processing",
    tone: "render",
    rows: [
      ["DOM Processing", 350, 500],
      ["DOMContentLoaded", 500, 520],
      ["Resources Loading", 520, 800],
      ["Load Event", 800, 820],
    ],
  },
];
const MAX = 800;
const TICKS = [0, 100, 200, 300, 400, 500, 600, 700, 800];
const TITLE =
  "Page load timeline in milliseconds: the network phases run from 0 to 350 (redirect, DNS lookup, TCP connection, SSL/TLS, request and response), then the processing phases run from 350 to 820 (DOM processing, DOMContentLoaded, resources loading, load event)";

function Layout({ uid, narrow }) {
  const W = narrow ? 320 : 684;
  const labelW = narrow ? 0 : 150;
  const padR = narrow ? 16 : 22;
  const plotX = narrow ? 8 : labelW + 10;
  const plotW = W - plotX - padR;
  const rowH = narrow ? 40 : 26;
  const barH = narrow ? 14 : 16;
  const headH = 26;
  const x = (t) => plotX + (t / MAX) * plotW;
  let y = 4;
  const blocks = SECTIONS.map((sec) => {
    const head = y;
    y += headH;
    const rows = sec.rows.map((r) => {
      const row = { label: r[0], from: r[1], to: r[2], y };
      y += rowH;
      return row;
    });
    y += 6;
    return { ...sec, head, rows };
  });
  const axisY = y + 4;
  const H = axisY + 40;
  const gridTop = 4 + headH;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby={`${uid}-${narrow ? "n" : "w"}`}
      className={`dg-svg${narrow ? " dg-svg--narrow" : ""}`}
    >
      <title id={`${uid}-${narrow ? "n" : "w"}`}>{TITLE}</title>
      {TICKS.map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={gridTop - 4} y2={axisY} className="dg-lifeline" />
      ))}
      {blocks.map((b) => (
        <g key={b.name} className={`dg-c-${b.tone}`}>
          <text x={narrow ? 8 : 4} y={b.head + 17} fontSize="12.5" fontWeight="600" className="dg-text">
            {b.name}
          </text>
          {b.rows.map((r) => {
            const bx = x(r.from);
            const bw = Math.max(((r.to - r.from) / MAX) * plotW, 3);
            const by = narrow ? r.y + 18 : r.y + (rowH - barH) / 2;
            return (
              <g key={r.label}>
                <text
                  x={narrow ? plotX : labelW}
                  y={narrow ? r.y + 12 : r.y + rowH / 2 + 4}
                  textAnchor={narrow ? "start" : "end"}
                  fontSize={narrow ? 12 : 12.5}
                  className="dg-text"
                >
                  {r.label}
                </text>
                <rect x={bx} y={by} width={bw} height={barH} rx="4" className="dg-node" />
              </g>
            );
          })}
        </g>
      ))}
      <line x1={plotX} x2={plotX + plotW} y1={axisY} y2={axisY} className="dg-line" />
      {TICKS.filter((t) => !narrow || t % 200 === 0).map((t) => (
        <text key={t} x={x(t)} y={axisY + 16} textAnchor="middle" fontSize="11" className="dg-muted">
          {t}
        </text>
      ))}
      <text x={plotX + plotW / 2} y={axisY + 32} textAnchor="middle" fontSize="11" className="dg-muted">
        Time (ms)
      </text>
    </svg>
  );
}

export function EventProcessingTimeline() {
  const uid = useId().replace(/:/g, "");
  return (
    <div className="wp-dg">
      <div className="dg-wide">
        <Layout uid={uid} />
      </div>
      <div className="dg-narrow">
        <Layout uid={uid} narrow />
      </div>
    </div>
  );
}
