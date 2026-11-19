// How each field of a result is shown, the same in every language: its format, its place among the
// others (a lower order comes first; a field without one keeps its place after them) and whether it is
// hidden. The entries of a snippet win over the general ones under "*". A field without an entry takes
// its format from the suffix of its key (format.js). The words are in locales/.

export default {
  '*': {
    // A CSS selector of an element of the page, which a consumer can make inspectable
    selector: { format: 'selector' },
    element: { format: 'selector' },
    finalElement: { format: 'selector' },
    // The name of a phase, read as its label
    slowestPhase: { format: 'key' },
    // The issues of a row: the issues section of the result lists them already
    issues: { hidden: true },
  },
  'Content-Visibility': {
    // Sizes and distances, numbers of px (width and height together are a size, 984×500)
    height: { format: 'px' },
    top: { format: 'px' },
    distanceFromViewport: { format: 'px' },
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
  'Script-Loading': {
    // The attribute as it is written, so that it does not read as the priority beside it
    fetchpriority: { format: 'attribute' },
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
