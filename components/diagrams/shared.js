// Helpers shared by the diagram components: text measurement, wrapping and
// accessible descriptions. Everything here is pure, so a layout computed on the
// server matches the one computed in the browser and hydration stays clean.

const NARROW = new Set("iljtf.,:;'|!()[]/ I`".split(""));
const MEDIUM_NARROW = new Set("rsJ-\"*".split(""));
const WIDE = new Set("mw".split(""));
const EXTRA_WIDE = new Set("MW@".split(""));

// Approximate advance of one character, in em, for a UI sans-serif font.
function charEm(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0xfe0f || cp === 0x200d) return 0;
  if (cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff)) return 1.2;
  if (cp >= 0x2190 && cp < 0x2600) return 0.95;
  if (NARROW.has(ch)) return 0.3;
  if (MEDIUM_NARROW.has(ch)) return 0.4;
  if (WIDE.has(ch)) return 0.82;
  if (EXTRA_WIDE.has(ch)) return 0.94;
  if (ch >= "A" && ch <= "Z") return 0.66;
  if (ch >= "0" && ch <= "9") return 0.58;
  return 0.54;
}

export function textWidth(text, size = 13, weight = 400) {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  // Calibrated against system-ui in Chrome, which measures about 4% wider than the table above.
  return em * size * (weight >= 500 ? 1.06 : 1.04);
}

// Splits text on explicit line breaks, then wraps every line at word boundaries
// so that it stays within maxWidth. A single word longer than maxWidth stays whole.
export function wrapText(text, maxWidth, size = 13, weight = 400) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    const words = raw.split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, weight) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

export const flat = (text) => String(text).replace(/\s*\n\s*/g, " ");

export function describeFlow({ nodes, edges }) {
  const label = new Map(nodes.map((n) => [n.id, flat(n.label || n.id)]));
  const steps = edges.map((e) => {
    const name = (id) => label.get(id) || id;
    return `${name(e.from)} to ${name(e.to)}${e.label ? ` (${flat(e.label)})` : ""}`;
  });
  return `Connections: ${steps.join("; ")}.`;
}

export function describeSequence(steps, names = {}) {
  const parts = [];
  const walk = (list) => {
    for (const s of list) {
      if (s.type === "message") parts.push(`${names[s.from] || s.from} to ${names[s.to] || s.to}: ${flat(s.label)}`);
      else if (s.type === "note") parts.push(`Note: ${flat(s.text)}`);
      else if (s.type === "block") {
        if (s.kind !== "rect" && s.label) parts.push(`${s.kind} ${flat(s.label)}`);
        walk(s.steps || []);
        for (const e of s.else || []) {
          parts.push(`else ${flat(e.label || "")}`.trim());
          walk(e.steps || []);
        }
      }
    }
  };
  walk(steps);
  return `Steps: ${parts.join("; ")}.`;
}
