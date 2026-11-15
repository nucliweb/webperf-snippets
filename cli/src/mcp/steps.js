import * as z from "zod/v4";

// A step of interact and of the interactions of run_snippet and run_workflow. --interact-script of the
// CLI takes the same steps from a file, checked by stepsProblem (interactions.js); a test keeps both
// in agreement. The limit of a wait is of the server only: a tool call must answer
export const Step = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({ action: z.literal("hover"), selector: z.string() }),
  z.object({ action: z.literal("type"), selector: z.string(), text: z.string() }),
  z.object({ action: z.literal("scroll"), y: z.number().int().optional().describe("Pixels down, 300 by default") }),
  z.object({ action: z.literal("wait"), ms: z.number().int().min(0).max(10000) }),
]);
