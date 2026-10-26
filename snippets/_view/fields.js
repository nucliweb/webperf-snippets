// How each field of a result is shown, the same in every language: its format, its place among the
// others (a lower order comes first; a field without one keeps its place after them) and whether it is
// hidden. The entries of a snippet win over the general ones under "*". A field without an entry takes
// its format from the suffix of its key (format.js). The words are in locales/.

export default {
  '*': {
    // A CSS selector of an element of the page, which a consumer can make inspectable
    selector: { format: 'selector' },
    element: { format: 'selector' },
    lcpElement: { format: 'selector' },
    finalElement: { format: 'selector' },
    // The name of a phase, read as its label
    slowestPhase: { format: 'key' },
    // The issues of a row: the issues section of the result lists them already
    issues: { hidden: true },
  },
  'Find-Above-The-Fold-Lazy-Loaded-Images': {
    // Its top and left in px: the distance from the edge of the viewport says what matters
    position: { hidden: true },
  },
  'Input-Latency-Breakdown': {
    // The same as its rows, one per event type
    eventTypes: { hidden: true },
  },
  INP: {
    phases: { format: 'phases' },
  },
  'Find-render-blocking-resources': {
    shortName: { order: 1 },
    type: { order: 2 },
    responseEndMs: { order: 3 },
    durationMs: { order: 4 },
    sizeBytes: { order: 5 },
    url: { order: 6 },
  },
}
