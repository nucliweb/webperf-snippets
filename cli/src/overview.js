import { issueList, overviewOf, summarizeIssues } from "./view.js";

// What the results of a page found, as the export of the audit of the extension does (snippets/_view/
// report.js): how many snippets have errors, warnings or nothing to fix, and every issue in one list,
// errors first, with the id of its step and the path of its snippet.

// The path of the snippet of each result, by its id: the snippet of --snippet, named as it was given,
// the steps of the workflow and the follow-ups the decision tree can add. A step wins over a follow-up of
// the same id, which runs the same snippet.
export function pathsOfRun({ items = [], workflow, rules = [] }) {
  const followUps = rules.flatMap((rule) => [rule.append].flat());
  const paths = new Map([...followUps, ...(workflow?.steps ?? []), ...items].map((step) => [step.id, step.path]));
  return (result) => paths.get(result.id);
}

export const reportOf = (results, pathOf) => ({ overview: overviewOf(results.map(summarizeIssues)), issues: issueList(results, pathOf) });
