// The pages the CLI measures: http and https only, local servers included. It loads a URL in a browser
// and returns what the snippets read from it, so a file:// URL would hand the files of the machine to
// whoever reads the result, an agent among them; javascript:, data: and chrome:// are not pages to
// measure either. The command line, the matrix file and the MCP server share this rule.
export function isHttpUrl(value) {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  return ["http:", "https:"].includes(new URL(value).protocol);
}
