import { describe, it, expect } from "vitest";
import { cleanSpec } from "../../lib/strip-emoji";
import { layoutSequence, LAST_SELF_LABEL_MAX } from "./sequenceLayout";
import { textWidth, wrapText } from "./shared";

const SEQ_FS = 12.5;
// Width of the content column of a docs page at desktop size, and the smallest scale the component
// draws a sequence at (MIN_SCALE in Sequence.jsx). A diagram whose natural width times that scale is
// wider than the column scrolls inside its region.
const DESKTOP_COLUMN = 672;
const MIN_SCALE = 0.84;

const layout = (spec) => layoutSequence(cleanSpec(spec));
const lineWidth = (lines) => Math.max(...lines.map((l) => textWidth(l, SEQ_FS)));
const selfLoop = (result) => result.items.find((i) => i.kind === "self");

const participants = [
  { id: "A", label: "Alpha" },
  { id: "B", label: "Beta" },
];

describe("a message from the last participant to itself", () => {
  const long = "a label that is long enough to take more than one line when it is drawn";

  it("wraps its label so the loop does not push the diagram wide", () => {
    const loop = selfLoop(layout({ participants, steps: [{ type: "message", from: "B", to: "B", label: long }] }));
    expect(loop.lines.length).toBeGreaterThan(1);
    expect(lineWidth(loop.lines)).toBeLessThanOrEqual(LAST_SELF_LABEL_MAX);
  });

  it("is narrower than the same label drawn without the limit", () => {
    const wrappedAt320 = wrapText(long, 320, SEQ_FS);
    const result = layout({ participants, steps: [{ type: "message", from: "B", to: "B", label: long }] });
    expect(lineWidth(selfLoop(result).lines)).toBeLessThan(lineWidth(wrappedAt320));
    // The width needed to the right of the last lifeline follows the wrapped label, not the long one
    const rightOfLastLifeline = result.width - result.heads[1].x;
    expect(rightOfLastLifeline).toBeLessThan(56 + lineWidth(wrappedAt320));
  });

  it("keeps a short label on one line", () => {
    const loop = selfLoop(layout({ participants, steps: [{ type: "message", from: "B", to: "B", label: "check" }] }));
    expect(loop.lines).toEqual(["check"]);
  });

  it("keeps the label of every other participant wrapped at 320 px, as before", () => {
    const text = "a label of a moderate length for a loop on the first participant";
    const loop = selfLoop(layout({ participants, steps: [{ type: "message", from: "A", to: "A", label: text }] }));
    expect(loop.lines).toEqual(wrapText(text, 320, SEQ_FS));
  });

  it("draws the label inside the diagram", () => {
    const result = layout({ participants, steps: [{ type: "message", from: "B", to: "B", label: long }] });
    const loop = selfLoop(result);
    expect(loop.tx + lineWidth(loop.lines)).toBeLessThanOrEqual(result.width);
  });
});

// The sequence of pages/Interaction/Forced-Synchronous-Layout.mdx
describe("the Forced-Synchronous-Layout sequence", () => {
  const spec = {
    participants: [
      { id: "JS", label: "JavaScript" },
      { id: "MO", label: "MutationObserver" },
      { id: "RAF", label: "requestAnimationFrame" },
      { id: "Det", label: "FSL Detector" },
    ],
    steps: [
      { type: "message", from: "JS", to: "JS", label: "classList.toggle(...)" },
      { type: "message", from: "MO", to: "Det", label: "mutation fired → isDirty = true" },
      { type: "message", from: "Det", to: "RAF", label: "schedule clean (isDirty = false)" },
      { type: "message", from: "JS", to: "Det", label: "element.scrollTop = 0" },
      { type: "message", from: "Det", to: "Det", label: "isDirty? YES → \u26a0\ufe0f warn FSL" }, // the emoji is stripped, as the component does
      { type: "message", from: "RAF", to: "Det", label: "callback fires → isDirty = false" },
      { type: "note", over: "Det", text: "Next access after rAF: no warning" },
    ],
  };

  it("fits the content column of a desktop page without scrolling", () => {
    expect(layout(spec).width * MIN_SCALE).toBeLessThanOrEqual(DESKTOP_COLUMN);
  });
});
