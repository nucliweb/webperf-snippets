import * as z from "zod/v4";
import { schemaSection } from "./documents.js";

// Prompts are templates the user picks (in Claude Code, as /mcp__webperf__audit_lcp). Each one says
// which tools to chain and in what order, and embeds the schema sections the answer needs, so the model
// reads the results with the same reference the skills use.
const text = (value) => ({ role: "user", content: { type: "text", text: value } });
const schemaOf = (snippet) => ({
  role: "user",
  content: { type: "resource", resource: { uri: `webperf://schema/${snippet}`, mimeType: "text/markdown", text: schemaSection(snippet) } },
});

const Url = z.string().describe("The page to audit");
const Viewport = z.enum(["mobile", "desktop"]).optional().describe("mobile by default");
const QUOTE = "Quote the values the tools return; do not estimate or round them up.";

export function registerPrompts(server) {
  server.registerPrompt(
    "audit_lcp",
    {
      title: "Audit LCP",
      description: "Measures the Largest Contentful Paint of a page in the lab and in the field, finds its slowest sub-part and proposes fixes.",
      argsSchema: z.object({ url: Url, viewport: Viewport }),
    },
    ({ url, viewport = "mobile" }) => ({
      messages: [
        text(
          [
            `Audit the Largest Contentful Paint of ${url} on ${viewport}.`,
            "",
            `1. Call run_workflow with url "${url}", workflow "core-web-vitals" and viewport "${viewport}". It returns LCP and CLS, and adds LCP-Subparts with the reason when LCP is over 2.5 s.`,
            `2. Call get_crux for the same URL with formFactor "${viewport === "desktop" ? "desktop" : "phone"}", to compare the lab with what real users get. If it answers that there is no key, say so and go on with the lab data.`,
            '3. If LCP-Subparts did not run, call run_snippet with snippet "LCP-Subparts".',
            "4. If the answers are summaries (detail: summary), call get_details with the runId for LCP and LCP-Subparts: a summary leaves out the LCP element and the sub-parts.",
            "5. Report the LCP value and rating in the lab and in the field, the LCP element, the slowest sub-part and what it means, and the fixes for that sub-part, the most effective first.",
            "",
            `${QUOTE} The result of each snippet is described below.`,
          ].join("\n")
        ),
        schemaOf("LCP"),
        schemaOf("LCP-Subparts"),
      ],
    })
  );

  server.registerPrompt(
    "debug_inp",
    {
      title: "Debug INP",
      description: "Opens a page, clicks on it like a user and finds the slowest interaction, its target and the phase that makes it slow.",
      argsSchema: z.object({
        url: Url,
        selector: z.string().optional().describe("A CSS selector of the element to click, such as #buy"),
        viewport: Viewport,
      }),
    },
    ({ url, selector, viewport = "mobile" }) => ({
      messages: [
        text(
          [
            `Find what makes the interactions slow on ${url} (${viewport}).`,
            "",
            `1. Call open_page with url "${url}", viewport "${viewport}" and track ["INP", "Interactions", "Input-Latency-Breakdown"].`,
            selector
              ? `2. Call interact with a click on "${selector}". Add a few more clicks or key presses if the page has other controls a user would use.`
              : "2. Call interact with clicks on the controls a user would use first: main buttons, links that open menus, form fields. If you cannot tell which ones, ask me.",
            "3. Call read_results; if it answers with summaries, call get_details with its runId for INP and Input-Latency-Breakdown. INP gives the worst interaction and its phases (input delay, processing, presentation); Input-Latency-Breakdown says which phase dominates for each type of event.",
            "4. Call close_page.",
            "5. Report the worst interaction, its target, the dominant phase and the fixes for that phase.",
            "",
            `${QUOTE} The result of INP is described below.`,
          ].join("\n")
        ),
        schemaOf("INP"),
      ],
    })
  );

  server.registerPrompt(
    "audit_page",
    {
      title: "Audit a page",
      description: "Runs the audit and loading workflows on a page and summarizes the issues by severity, with fixes.",
      argsSchema: z.object({ url: Url, viewport: Viewport }),
    },
    ({ url, viewport = "mobile" }) => ({
      messages: [
        text(
          [
            `Audit the loading performance of ${url} on ${viewport}.`,
            "",
            `1. Call run_workflow with url "${url}", workflow "audit" and viewport "${viewport}".`,
            '2. Call run_workflow with the same URL and workflow "loading".',
            "3. Summarize the issues the snippets report, errors first, then warnings, each with the snippet that found it and the fix. Leave out the checks that passed.",
            "",
            `${QUOTE} If a result is unclear, read the resource webperf://schema/{snippet} of that snippet.`,
          ].join("\n")
        ),
      ],
    })
  );
}
