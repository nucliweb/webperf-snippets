// Summary of the JSON lines of profile-noise.mjs, as a Markdown table per load, page and mode.
// Usage: node summary.mjs <file.jsonl>...
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
console.log("| Load | Page | Mode | n | p50 | p90 | max | sd | over p50 + 500 ms | launch p50 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const page of ["late", "product"]) {
    const all = rows.filter((r) => r.page === page).map((r) => r.lcp).sort((a, b) => a - b);
    for (const mode of ["private", "disk", "shm"]) {
      const of = rows.filter((r) => r.page === page && r.mode === mode);
      if (!of.length) continue;
      const v = of.map((r) => r.lcp).sort((a, b) => a - b);
      const l = of.map((r) => r.launchMs).sort((a, b) => a - b);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
      const over = v.filter((x) => x > q(all, 0.5) + 500).length;
      console.log(`| ${basename(file, ".jsonl")} | ${page} | ${mode} | ${v.length} | ${q(v, 0.5)} | ${q(v, 0.9)} | ${v[v.length - 1]} | ${sd.toFixed(1)} | ${over} | ${q(l, 0.5)} |`);
    }
  }
}
