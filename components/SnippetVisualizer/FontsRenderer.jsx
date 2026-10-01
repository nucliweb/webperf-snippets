import { Icon } from "../Icon";

const DISPLAY_WARN = new Set(["auto", "unknown"]);

const TABLE_STYLE = { width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" };
const TH_STYLE = { textAlign: "left", padding: "6px 8px", color: "#6b7280", fontWeight: "normal", borderBottom: "1px solid rgba(128,128,128,0.2)" };
const TD_STYLE = { padding: "6px 8px", borderBottom: "1px solid rgba(128,128,128,0.1)" };

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "0.875rem", fontWeight: "600", marginBottom: "8px" }}>{title}</div>
      {children}
    </section>
  );
}

export function FontsRenderer({ result }) {
  const d = result.details ?? {};
  const summary = [
    { label: "Preloaded", count: d.preloadedCount ?? 0, color: "#8b5cf6" },
    { label: "Loaded", count: d.loadedCount ?? 0, color: "#3b82f6" },
    { label: "Used above fold", count: d.usedAboveFoldCount ?? 0, color: "#22c55e" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: "32px", paddingBottom: "24px", flexWrap: "wrap" }}>
        {summary.map(({ label, count, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: "bold", color }}>{count}</div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{label}</div>
          </div>
        ))}
      </div>

      {result.items?.length > 0 && (
        <Section title="Loaded Fonts">
          <table style={TABLE_STYLE}>
            <thead>
              <tr>{["Family", "Weight", "Style", "Display"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {result.items.map((f, i) => (
                <tr key={i}>
                  <td style={TD_STYLE}>{f.family}</td>
                  <td style={TD_STYLE}>{f.weight}</td>
                  <td style={TD_STYLE}>{f.style}</td>
                  <td style={{ ...TD_STYLE, color: DISPLAY_WARN.has(f.display) ? "#f59e0b" : "inherit" }}>
                    {DISPLAY_WARN.has(f.display) ? <><Icon emoji="⚠️" />{f.display}</> : f.display}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {result.usedFonts?.length > 0 && (
        <Section title="Used Above Fold">
          <table style={TABLE_STYLE}>
            <thead>
              <tr>{["Family", "Weight", "Style", "Elements"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {[...result.usedFonts].sort((a, b) => b.elements - a.elements).map((f, i) => (
                <tr key={i}>
                  <td style={TD_STYLE}>{f.family}</td>
                  <td style={TD_STYLE}>{f.weight}</td>
                  <td style={TD_STYLE}>{f.style}</td>
                  <td style={TD_STYLE}>{f.elements}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Issues">
        {result.issues?.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {result.issues.map((issue, i) => (
              <li key={i} style={{ color: issue.severity === "error" ? "#ef4444" : "#f59e0b", padding: "4px 0", fontSize: "0.875rem" }}>
                <Icon emoji={issue.severity === "error" ? "✗" : "⚠"} />{issue.message}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#22c55e", margin: 0 }}><Icon emoji="✅" />Font loading looks optimized</p>
        )}
      </Section>
    </div>
  );
}
