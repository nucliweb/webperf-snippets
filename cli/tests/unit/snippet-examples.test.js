import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, checkResult } from "../helpers/contract.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNIPPETS = resolve(HERE, "../../../snippets");

const categoriesWithExamples = CATEGORIES.filter((category) =>
  existsSync(join(SNIPPETS, category, "examples.json"))
);

describe("captured snippet examples", () => {
  it("includes captured examples for CoreWebVitals", () => {
    expect(categoriesWithExamples).toContain("CoreWebVitals");
  });

  for (const category of categoriesWithExamples) {
    describe(category, () => {
      const snippetNames = readdirSync(join(SNIPPETS, category))
        .filter((file) => file.endsWith(".js"))
        .map((file) => file.slice(0, -3))
        .sort();
      const { examples } = JSON.parse(
        readFileSync(join(SNIPPETS, category, "examples.json"), "utf8")
      );

      it("has an example for every snippet in the category and no stale entries", () => {
        expect(Object.keys(examples).sort()).toEqual(snippetNames);
      });

      for (const name of snippetNames) {
        it(`${name} matches its snippet name, has status ok, and satisfies the return contract`, () => {
          const example = examples[name];
          expect(example).toBeDefined();
          expect(example.script).toBe(name);
          expect(example.status).toBe("ok");
          const violations = checkResult(`${category}/${name}`, {
            json: JSON.stringify(example),
            inPage: [],
            wasUndefined: false,
          });
          expect([...violations]).toEqual([]);
        });
      }
    });
  }
});
