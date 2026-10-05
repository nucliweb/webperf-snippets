import { defineConfig } from "vitest/config";

// The diagram components use the automatic JSX runtime, like Next.js does, so they can be rendered in tests.
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } } });
