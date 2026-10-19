// The tasks of the MCP evals. The prompts read like a person asking about a page: they name no tool and
// no snippet, so the evals measure what the agent does with each setup, not whether it follows a recipe.
// Each fixture has a known answer that the report has to give.

export const CASES = [
  {
    id: 'lcp-slow-image',
    fixture: 'lcp-slow-image.html',
    prompt: (url) =>
      `The Largest Contentful Paint of this page is slow: ${url}\n\nFind out why. Tell me which element is the LCP, which part of its loading takes the most time, and what to fix first.`,
    expect: {
      diagnosis: [
        // The product photo is the LCP element
        { id: 'lcp-element', pattern: /product\.png|product photo|<img|\bimg\b|\bimage\b/i },
        // Its 2 s are spent downloading it, not on the server response or the render
        { id: 'slow-phase', pattern: /resource load|load (time|duration)|download|loading the image|image (request|response)/i },
      ],
    },
  },
  {
    id: 'inp-slow-click',
    fixture: 'inp-slow-click.html',
    prompt: (url) =>
      `Users say this page feels slow when they click on it: ${url}\n\nFind which interaction is slow, what makes it slow, and what to fix.`,
    expect: {
      diagnosis: [
        // The "Add to cart" button, not the wishlist
        { id: 'slow-target', pattern: /#add\b|add to cart/i },
        // Its click handler blocks the main thread: processing time
        { id: 'slow-phase', pattern: /processing|event handler|click handler|\bhandler\b|long task|main thread|blocking/i },
      ],
    },
  },
]
