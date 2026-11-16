// Preloaded with `node --import`, it makes Playwright impossible to find, for import and for require,
// as on a machine where the peer dependency is not installed.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "playwright" || specifier.startsWith("playwright/")) {
      throw Object.assign(new Error(`Cannot find package 'playwright' imported from ${context.parentURL}`), { code: "ERR_MODULE_NOT_FOUND" });
    }
    return nextResolve(specifier, context);
  },
});
