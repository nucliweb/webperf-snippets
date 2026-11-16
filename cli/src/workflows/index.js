import { cwvWorkflow } from "./cwv.js";
import { auditWorkflow } from "./audit.js";
import { loadingWorkflow } from "./loading.js";
import { interactionWorkflow } from "./interaction.js";

// The workflow of a run that names none
export const DEFAULT_WORKFLOW = "core-web-vitals";

// The workflows by the name --workflow and the run_workflow tool of the MCP server take
export const WORKFLOWS = {
  "core-web-vitals": cwvWorkflow,
  audit: auditWorkflow,
  loading: loadingWorkflow,
  interaction: interactionWorkflow,
};
