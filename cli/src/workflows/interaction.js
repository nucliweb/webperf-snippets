// Interaction performance workflow. The Interaction snippets record what happens while the page is
// used, so this workflow runs a set of interactions (the steps of --interact-script, or a scroll of
// its own) and reads the snippets afterwards.
//
// A step flagged needsInput measures clicks and key presses; when the interactions have neither, the
// step is skipped with a reason instead of failing for lack of data.
export const interactionWorkflow = {
  id: "interaction",
  title: "Interaction Performance",
  // Used without --interact-script. Clicks belong to each site, so the default only scrolls.
  defaultInteractions: [
    { action: "scroll", y: 600 },
    { action: "wait", ms: 300 },
    { action: "scroll", y: 600 },
    { action: "wait", ms: 300 },
    { action: "scroll", y: 600 },
    { action: "wait", ms: 300 },
    { action: "scroll", y: -1800 },
    { action: "wait", ms: 500 },
  ],
  steps: [
    { id: "long-tasks", path: "Interaction/LongTask" },
    { id: "long-frames", path: "Interaction/Long-Animation-Frames" },
    { id: "scroll", path: "Interaction/Scroll-Performance" },
    { id: "layout-shifts", path: "Interaction/Layout-Shift-Loading-and-Interaction" },
    { id: "forced-layout", path: "Interaction/Forced-Synchronous-Layout" },
    { id: "interactions", path: "Interaction/Interactions", needsInput: true },
    { id: "input-latency", path: "Interaction/Input-Latency-Breakdown", needsInput: true },
  ],
};
