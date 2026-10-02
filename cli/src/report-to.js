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
