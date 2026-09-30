const SEVERITY_COLOR = { error: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
const SEVERITY_ICON = { error: "✗", warning: "⚠", info: "ℹ" };

const IGNORED_COLS = new Set(["raw", "html", "element", "selector"]);

export function AuditRenderer({ result }) {
  const errors = (result.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (result.issues ?? []).filter((i) => i.severity === "warning");
  const statusIcon = errors.length ? "🔴" : warnings.length ? "🟡" : "🟢";

  const items = result.items ?? [];
  const columns = items.length > 0
    ? Object.keys(items[0]).filter((k) => !IGNORED_COLS.has(k)).slice(0, 5)
    : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px" }}>
        <span style={{ fontSize: "1.5rem" }}>{statusIcon}</span>
        <div>
          <div style={{ fontWeight: "600" }}>{result.script}</div>
          {result.count != null && (
            <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>{result.count} item(s)</div>
          )}
        </div>
      </div>

      {result.corsLimitedAnalysis === true && (
        <p style={{ color: "#f59e0b", fontSize: "0.875rem", margin: "0 0 16px" }}>
          ⚠ Partial analysis: cross-origin resources without Timing-Allow-Origin hid their sizes or timings, so the totals are a lower bound.
        </p>
      )}

      {result.issues?.length > 0 ? (
        <section style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: "600", marginBottom: "8px" }}>Issues</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {result.issues.map((issue, i) => (
              <li key={i} style={{ color: SEVERITY_COLOR[issue.severity] ?? "#6b7280", padding: "4px 0", fontSize: "0.875rem" }}>
                {SEVERITY_ICON[issue.severity] ?? "·"} {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p style={{ color: "#22c55e", marginBottom: "24px" }}>✅ No issues found</p>
      )}

      {items.length > 0 && columns.length > 0 && (
        <section>
          <div style={{ fontSize: "0.875rem", fontWeight: "600", marginBottom: "8px" }}>
            Items ({items.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(128,128,128,0.2)" }}>
                  {columns.map((col) => (
                    <th key={col} style={{ textAlign: "left", padding: "6px 8px", color: "#6b7280", fontWeight: "normal" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(128,128,128,0.1)" }}>
                    {columns.map((col) => (
                      <td key={col} style={{ padding: "6px 8px", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {String(item[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result.reason && (
        <div style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "12px" }}>↳ {result.reason}</div>
      )}
    </div>
  );
}
