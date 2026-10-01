import { Icon } from "../Icon";

const RATING_COLOR = { good: "#22c55e", "needs-improvement": "#f59e0b", poor: "#ef4444" };
const RATING_EMOJI = { good: "🟢", "needs-improvement": "🟡", poor: "🔴" };

function formatValue(value, unit) {
  if (unit === "ms") return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
  if (unit === "score") return value.toFixed(4);
  return String(value);
}

const SUB_PARTS = [
  ["TTFB", "ttfb"],
  ["Resource Load Delay", "resourceLoadDelay"],
  ["Resource Load Time", "resourceLoadTime"],
  ["Element Render Delay", "elementRenderDelay"],
];

export function CWVRenderer({ result }) {
  const color = RATING_COLOR[result.rating] ?? "#6b7280";
  const sp = result.details?.subParts;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px" }}>
        <span style={{ fontSize: "2rem" }}>{RATING_EMOJI[result.rating] ? <Icon emoji={RATING_EMOJI[result.rating]} /> : "·"}</span>
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold", color }}>
            {formatValue(result.value, result.unit)}
          </div>
          <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            {result.rating} · {result.script ?? result.metric}
          </div>
        </div>
      </div>

      {result.details?.element && (
        <div style={{ background: "rgba(128,128,128,0.08)", borderRadius: "6px", padding: "8px 12px", fontSize: "0.8rem", marginBottom: "16px" }}>
          <span style={{ color: "#6b7280" }}>Element: </span>
          <code style={{ wordBreak: "break-all" }}>{result.details.element}</code>
        </div>
      )}

      {sp && (
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: "600", marginBottom: "8px" }}>LCP Sub-Parts</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(128,128,128,0.2)" }}>
                {["Phase", "Value", "%", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Phase" ? "left" : "right", padding: "6px 8px", color: "#6b7280", fontWeight: "normal" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUB_PARTS.map(([label, key]) => {
                const info = sp[key];
                if (!info) return null;
                return (
                  <tr key={key} style={{ borderBottom: "1px solid rgba(128,128,128,0.1)" }}>
                    <td style={{ padding: "6px 8px" }}>{label}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px" }}>{info.value}ms</td>
                    <td style={{ textAlign: "right", padding: "6px 8px" }}>{info.percent}%</td>
                    <td style={{ textAlign: "right", padding: "6px 8px" }}><Icon emoji={info.overTarget ? "🔴" : "✅"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {result.details.slowestPhase && (
            <div style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "8px" }}>
              → Slowest: <strong>{result.details.slowestPhase}</strong>
            </div>
          )}
        </div>
      )}

      {result.reason && (
        <div style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "12px" }}>↳ {result.reason}</div>
      )}
    </div>
  );
}
