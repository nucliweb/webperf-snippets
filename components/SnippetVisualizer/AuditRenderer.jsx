import { describeResult } from "../../snippets/_view/index.js";
import { Icon } from "../Icon";

// A result read through its view (snippets/_view/), as the panel of the extension and the reports of
// the CLI read it: the title of its table, its details and its columns with labels, formats and order.
// React escapes every value, all of which come from the inspected page.

const SEVERITY = ["error", "warning", "info"];
const SEVERITY_ICON = { error: "✗", warning: "⚠", info: "ℹ" };
const bySeverity = (list) => [...list].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));

const RATING = { good: "Good", "needs-improvement": "Needs improvement", poor: "Poor" };
const STATUS = { ok: "OK", tracking: "Tracking", error: "Error", unsupported: "Unsupported" };

const rowId = (i) => `wp-viz-row-${i}`;

// A table inside a cell or a field folds, so the table around it keeps its width
function NestedTable({ field }) {
  return (
    <details className="wp-viz-nested">
      <summary>{field.text}</summary>
      <Table view={field} />
    </details>
  );
}

// A cell or a field of the view in its format
function Value({ field }) {
  switch (field.format) {
    case "selector":
      return <code className="wp-viz-selector">{field.text}</code>;
    case "url":
      return (
        <span className="wp-viz-url" title={field.href}>
          {field.text}
        </span>
      );
    case "distribution":
      if (field.parts.length === 0) return field.text;
      return field.parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && " · "}
          {p.label} <b>{p.text}</b>
        </span>
      ));
    case "table":
      return <NestedTable field={field} />;
    case "flags":
      return field.flags.map((flag) => (
        <span key={flag} className="wp-viz-flag">
          {flag}
        </span>
      ));
    case "fields":
      return (
        <dl className="wp-viz-fields wp-viz-nested">
          {field.fields.map((f) => (
            <Field key={f.key} field={f} />
          ))}
        </dl>
      );
    case "boolean":
      // In a table a true value is a mark and a false one is empty
      return field.text === "✓" ? <Icon emoji="✓" /> : field.text;
    default:
      return field.text;
  }
}

function Field({ field }) {
  return (
    <>
      <dt>{field.label}</dt>
      <dd>
        <Value field={field} />
      </dd>
    </>
  );
}

// A number aligns to the right, and a long text, a URL or a selector, wraps
const cellClass = (cell) =>
  typeof cell.value === "number"
    ? "wp-viz-num"
    : ["url", "selector", "flags", "table"].includes(cell.format) || cell.text.length > 40
      ? "wp-viz-long"
      : undefined;

// The issues of a row, as dots of their severity at the start of its first cell
function Dots({ issues }) {
  if (!issues?.length) return null;
  return (
    <span className="wp-viz-dots">
      {bySeverity(issues).map((issue, i) => (
        <span key={i} className={`wp-viz-dot wp-viz-dot-${issue.severity}`} title={issue.message} />
      ))}
    </span>
  );
}

function Table({ view, rowIds = false }) {
  const { columns, constants, rows } = view;
  return (
    <>
      {constants.length > 0 && (
        <p className="wp-viz-constants">
          {constants.map((c, i) => (
            <span key={c.key}>
              {i > 0 && " · "}
              {c.label} <b>{c.text}</b>
            </span>
          ))}
        </p>
      )}
      <div className="wp-viz-table">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              // The rows of the table of the result have an id, which an issue about one of them links to
              <tr key={i} id={rowIds ? rowId(i) : undefined}>
                {row.cells.map((cell, c) => (
                  <td key={cell.key} className={cellClass(cell)}>
                    {c === 0 && <Dots issues={row.issues} />}
                    <Value field={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Issues({ issues }) {
  const counts = SEVERITY.map((s) => [s, issues.filter((i) => i.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}${n === 1 || s === "info" ? "" : "s"}`)
    .join(", ");
  return (
    <section className="wp-viz-section">
      <h3>
        Issues <span className="wp-viz-count">{counts}</span>
      </h3>
      <ul className="wp-viz-issues">
        {bySeverity(issues).map((issue, i) => (
          <li key={i} className={`wp-viz-issue-${issue.severity}`}>
            {SEVERITY_ICON[issue.severity] ? <Icon emoji={SEVERITY_ICON[issue.severity]} /> : "· "}
            {/* An issue about a row of the table leads to it */}
            {issue.row === undefined ? issue.message : <a href={`#${rowId(issue.row)}`}>{issue.message}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// A field with a phrase reads as a sentence, before the list of the others
function Details({ details }) {
  const phrases = details.filter((f) => f.phrase);
  const fields = details.filter((f) => !f.phrase);
  return (
    <section className="wp-viz-section">
      <h3>Details</h3>
      {phrases.map((f) => (
        <p key={f.key} className="wp-viz-phrase">
          {f.phrase.before}
          <strong>
            <Value field={f} />
          </strong>
          {f.phrase.after}
        </p>
      ))}
      {fields.length > 0 && (
        <dl className="wp-viz-fields">
          {fields.map((f) => (
            <Field key={f.key} field={f} />
          ))}
        </dl>
      )}
    </section>
  );
}

export function AuditRenderer({ result }) {
  const view = describeResult(result);
  const errors = view.issues.filter((i) => i.severity === "error");
  const warnings = view.issues.filter((i) => i.severity === "warning");
  const statusEmoji = errors.length ? "🔴" : warnings.length ? "🟡" : "🟢";
  const shown = view.rows.length;

  return (
    <div className="wp-viz">
      <div className="wp-viz-head">
        <span className="wp-viz-head-icon">
          <Icon emoji={statusEmoji} />
        </span>
        <div>
          <div className="wp-viz-script">{result.script}</div>
          {(result.count != null || result.rating) && (
            <div className="wp-viz-caption">
              {[result.count != null && `${result.count} item(s)`, result.rating && (RATING[result.rating] ?? result.rating)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* "ok" means the snippet ran, not that the page is fine, so only the other states show */}
      {result.status && result.status !== "ok" ? (
        <p className={`wp-viz-status wp-viz-status-${result.status}`}>
          {STATUS[result.status] ?? result.status}
          {result.error ? `: ${result.error}` : ""}
          {view.message ? `. ${view.message}` : ""}
        </p>
      ) : (
        view.message && <p className="wp-viz-note">{view.message}</p>
      )}

      {result.corsLimitedAnalysis === true && (
        <p className="wp-viz-cors">
          <Icon emoji="⚠" />
          Partial analysis: cross-origin resources without Timing-Allow-Origin hid their sizes or timings, so the totals are a
          lower bound.
        </p>
      )}

      {view.issues.length > 0 ? (
        <Issues issues={view.issues} />
      ) : (
        result.status !== "tracking" && (
          <p className="wp-viz-clean">
            <Icon emoji="✅" />
            No issues found
          </p>
        )
      )}

      {shown > 0 && view.columns.length > 0 && (
        <section className="wp-viz-section">
          <h3>
            {view.title}{" "}
            <span className="wp-viz-count">{typeof result.count === "number" && result.count > shown ? `${shown} of ${result.count}` : shown}</span>
          </h3>
          <Table view={view} rowIds />
        </section>
      )}

      {view.details.length > 0 && <Details details={view.details} />}

      {view.recommendations.length > 0 && (
        <section className="wp-viz-section">
          <h3>Recommendations</h3>
          <ol className="wp-viz-recommendations">
            {view.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
      )}

      {result.reason && <div className="wp-viz-caption wp-viz-reason">↳ {result.reason}</div>}
    </div>
  );
}
