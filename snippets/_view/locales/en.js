// The English words of the view: the title of the table of each snippet, and the label of a field
// when its key in words does not say it well. `phrase` reads a field as a sentence around its value,
// at {value}. The entries of a snippet win over the general ones under "*". Another language is a file
// like this one, which falls back to this one for what it does not translate.

export default {
  '*': {
    title: 'Items',
    fields: {},
  },
  'Find-render-blocking-resources': {
    title: 'Render-blocking resources',
    fields: {
      totalBlockingUntilMs: { label: 'Blocked until', phrase: 'Rendering blocked until {value}' },
      shortName: { label: 'File' },
    },
  },
}
