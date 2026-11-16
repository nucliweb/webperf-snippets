import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_TIMEOUT_MS = 5000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const cliVersion = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8")).version;

// Returns an error message when the URL cannot receive a report, or null.
// https is required so the API key is never sent in clear text; local hosts
// are allowed over http for development and tests.
export function validateReportUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return `--report-to must be an https URL, got "${value}"`;
  }
  if (parsed.protocol === "https:") return null;
  if (parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname)) return null;
  return `--report-to must be an https URL (http is allowed only for localhost), got "${value}"`;
}

// POSTs the results to `url`. Never throws and never touches the exit code:
// the caller decides what to do with the outcome. The key is only sent in the
// Authorization header and never appears in a returned message.
export async function reportTo({ url, apiKey, body, timeoutMs = REPORT_TIMEOUT_MS }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, warning: `the endpoint answered ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, regressions: data.ok === false ? (data.regressions ?? []) : [] };
  } catch (err) {
    const reason = err.name === "TimeoutError" ? `no answer within ${timeoutMs}ms` : (err.cause?.code ?? err.message);
    return { ok: false, warning: reason };
  }
}

// The body of a report: one page with what it ran, when, what its results found and how it was
// measured. `values` are the options as given, and `meta` the conditions the caller names. The headers
// of the load are conditions too, and never part of the body.
export function reportBody({ url, values, page, meta }) {
  return {
    url,
    workflow: values.snippet ? null : (values.workflow ?? "core-web-vitals"),
    ...(values.snippet ? { snippet: values.snippet } : {}),
    timestamp: new Date().toISOString(),
    navMs: page.navMs,
    overview: page.overview,
    issues: page.issues,
    results: page.results,
    ...(page.budgets ? { budgets: page.budgets } : {}),
    meta: { ...meta, cli_version: cliVersion },
  };
}

// What to say on stderr about the outcome of reportTo: a warning when the report did not arrive, with
// the origin of the endpoint only, and the regressions the endpoint found. `name` is the combination
// of a matrix
export function reportLines(outcome, { url, name }) {
  if (!outcome.ok) return [`Warning: could not report ${name ?? "results"} to ${new URL(url).origin} (${outcome.warning})`];
  if (outcome.regressions.length === 0) return [];
  const list = outcome.regressions.map((r) => `  - ${typeof r === "string" ? r : JSON.stringify(r)}`).join("\n");
  return [`Regressions detected${name ? ` in ${name}` : ""}:\n${list}`];
}
