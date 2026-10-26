// How each field of a result is shown, the same in every language: its format, its place among the
// others (a lower order comes first; a field without one keeps its place after them) and whether it is
// hidden. The entries of a snippet win over the general ones under "*". A field without an entry takes
// its format from the suffix of its key (format.js). The words are in locales/.

export default {
  '*': {},
  'Find-render-blocking-resources': {
    shortName: { order: 1 },
    type: { order: 2 },
    responseEndMs: { order: 3 },
    durationMs: { order: 4 },
    sizeBytes: { order: 5 },
    url: { order: 6 },
  },
}
