import { textWidth, wrapText } from "./shared";

// Deterministic layout for the Sequence component. Column spacing is solved
// from the width of the labels that must fit between lifelines, rows are
// stacked top down, and every drawing primitive comes back with final
// coordinates so the component only renders.

export const SEQ_FS = 12.5;
export const SEQ_LH = 15;
const HEAD_H = 32;
const PAD_X = 12;
const MIN_GAP = 110;
const INDENT = 8;
// A message from the last participant to itself draws its loop and its label to the right of the last
// lifeline, so the label adds its whole width to the diagram. A long label wraps at this width instead.
export const LAST_SELF_LABEL_MAX = 110;

const maxLine = (lines, size, weight) => Math.max(...lines.map((l) => textWidth(l, size, weight)));

export function layoutSequence({ participants, steps }) {
  const index = new Map(participants.map((p, i) => [p.id, i]));
  const heads = participants.map((p) => ({ ...p, w: Math.max(Math.ceil(textWidth(p.label, SEQ_FS, 600) + 28), 72) }));
  const n = heads.length;
  const last = n - 1;
  const gaps = Array.from({ length: Math.max(n - 1, 0) }, (_, k) => Math.max((heads[k].w + heads[k + 1].w) / 2 + 14, MIN_GAP));

  const constraints = []; // the distance between lifelines lo and hi must be at least `need`
  let leftExtra = 0; // space needed between the left edge of the diagram and the first lifeline, so a note that extends left of it stays inside
  let rightExtra = 0; // space needed right of the last lifeline

  const noteSize = (text, maxW) => {
    const lines = wrapText(text, maxW, SEQ_FS);
    return { lines, w: Math.ceil(maxLine(lines, SEQ_FS)) + 20, h: lines.length * SEQ_LH + 10 };
  };
  const columns = (ids) => {
    const cols = ids.map((id) => index.get(id));
    return [Math.min(...cols), Math.max(...cols)];
  };
  const messageLabelWidth = (i, j) => (i === j && i === last ? LAST_SELF_LABEL_MAX : 320);
  const noteAnchor = (s) => s.over ?? s.left ?? s.right;
  const noteIds = (s) => [].concat(noteAnchor(s));

  // Pass 1: collect the width each step needs.
  const measure = (list) => {
    for (const s of list) {
      if (s.type === "message") {
        const i = index.get(s.from);
        const j = index.get(s.to);
        const lines = wrapText(s.label, messageLabelWidth(i, j), SEQ_FS);
        const lw = Math.ceil(maxLine(lines, SEQ_FS));
        if (i === j) {
          const need = 56 + lw;
          if (i === last) rightExtra = Math.max(rightExtra, need);
          else constraints.push({ lo: i, hi: i + 1, need: need + 16 });
        } else {
          constraints.push({ lo: Math.min(i, j), hi: Math.max(i, j), need: lw + 36 });
        }
      } else if (s.type === "note") {
        const [lo, hi] = columns(noteIds(s));
        if (s.over) {
          const { w } = noteSize(s.text, lo === hi ? 360 : 400);
          if (lo === hi) {
            if (lo === 0) leftExtra = Math.max(leftExtra, w / 2);
            if (lo === last) rightExtra = Math.max(rightExtra, w / 2);
          } else {
            constraints.push({ lo, hi, need: w - 28 });
          }
        } else if (s.right) {
          const { w } = noteSize(s.text, 260);
          if (lo === last) rightExtra = Math.max(rightExtra, w + 14);
          else constraints.push({ lo, hi: lo + 1, need: w + 26 });
        } else {
          const { w } = noteSize(s.text, 260);
          if (lo === 0) leftExtra = Math.max(leftExtra, w + 14);
          else constraints.push({ lo: lo - 1, hi: lo, need: w + 26 });
        }
      } else if (s.type === "block") {
        measure(s.steps || []);
        for (const e of s.else || []) measure(e.steps || []);
      }
    }
  };
  measure(steps);

  constraints.sort((a, b) => a.hi - a.lo - (b.hi - b.lo));
  for (const c of constraints) {
    let dist = 0;
    for (let k = c.lo; k < c.hi; k++) dist += gaps[k];
    if (dist < c.need) {
      const add = (c.need - dist) / (c.hi - c.lo);
      for (let k = c.lo; k < c.hi; k++) gaps[k] += add;
    }
  }

  const xs = [PAD_X + Math.max(heads[0].w / 2, leftExtra)];
  for (let k = 0; k < gaps.length; k++) xs.push(xs[k] + gaps[k]);
  const width = Math.ceil(xs[last] + Math.max(heads[last].w / 2, rightExtra) + PAD_X);

  const items = [];
  const labelBoxes = []; // regions where lifelines must not be drawn through text

  // Pass 2: place the steps.
  const place = (list, depth, y0) => {
    let y = y0;
    for (const s of list) {
      if (s.type === "message") {
        const i = index.get(s.from);
        const j = index.get(s.to);
        const lines = wrapText(s.label, messageLabelWidth(i, j), SEQ_FS);
        const lw = maxLine(lines, SEQ_FS);
        if (i === j) {
          const loopTop = y + 6;
          const total = Math.max(lines.length * SEQ_LH, 24);
          const x = xs[i];
          const ty = loopTop + 11 - ((lines.length - 1) * SEQ_LH) / 2 + 2;
          items.push({ kind: "self", x, y: loopTop, dashed: !!s.dashed, lines, tx: x + 40, ty });
          labelBoxes.push({ x0: x + 36, x1: x + 40 + lw, y0: ty - 12, y1: ty + lines.length * SEQ_LH });
          y += total + 14;
        } else {
          const cx = (xs[i] + xs[j]) / 2;
          const ay = y + lines.length * SEQ_LH + 8;
          items.push({ kind: "msg", x1: xs[i], x2: xs[j], y: ay, dashed: !!s.dashed, lines, tx: cx, ty: y + 11 });
          labelBoxes.push({ x0: cx - lw / 2 - 2, x1: cx + lw / 2 + 2, y0: y - 1, y1: y + lines.length * SEQ_LH });
          y = ay + 12;
        }
      } else if (s.type === "note") {
        const [lo, hi] = columns(noteIds(s));
        let x;
        let w;
        let lines;
        if (s.over) {
          const maxW = lo === hi ? 360 : 400;
          const sz = noteSize(s.text, maxW);
          lines = sz.lines;
          if (lo === hi) {
            w = sz.w;
            x = xs[lo] - w / 2;
          } else {
            w = Math.max(xs[hi] - xs[lo] + 28, sz.w);
            x = (xs[lo] + xs[hi]) / 2 - w / 2;
          }
        } else {
          const sz = noteSize(s.text, 260);
          lines = sz.lines;
          w = sz.w;
          x = s.right ? xs[lo] + 14 : xs[lo] - 14 - w;
        }
        const h = lines.length * SEQ_LH + 10;
        items.push({ kind: "note", x, y, w, h, lines, tone: s.tone });
        y += h + 10;
      } else if (s.type === "block") {
        const isRect = s.kind === "rect";
        const left = 4 + depth * INDENT;
        const frame = { kind: "frame", x: left, y, w: width - 2 * left, h: 0, label: s.label, blockKind: s.kind, tone: s.tone, dividers: [] };
        items.push(frame);
        y += isRect ? 10 : 30;
        y = place(s.steps || [], depth + 1, y);
        for (const e of s.else || []) {
          y += 2;
          frame.dividers.push({ y, label: e.label });
          y += 26;
          y = place(e.steps || [], depth + 1, y);
        }
        frame.h = y - frame.y;
        y += 8;
        // Close the frame a little below the last step.
        frame.h += 4;
        y += 4;
      }
    }
    return y;
  };

  const bodyTop = HEAD_H + 16;
  const end = place(steps, 0, bodyTop);
  return {
    width,
    height: Math.ceil(end + 4),
    heads: heads.map((h, i) => ({ ...h, x: xs[i] })),
    headH: HEAD_H,
    lifelineFrom: HEAD_H,
    lifelineTo: Math.ceil(end),
    items,
    labelBoxes,
  };
}
