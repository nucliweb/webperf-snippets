import { describe, it, expect } from "vitest";
import { parseHeader } from "../../src/headers.js";

describe("parseHeader", () => {
  it("splits a header at its first colon and trims both parts", () => {
    expect(parseHeader("X-Demo: 1")).toEqual(["X-Demo", "1"]);
    expect(parseHeader("  X-Demo  :   a value  ")).toEqual(["X-Demo", "a value"]);
  });

  it("keeps the colons of the value, as in a URL or a time", () => {
    expect(parseHeader("Referer: https://localhost:3000/a")).toEqual(["Referer", "https://localhost:3000/a"]);
  });

  it("takes a header with an empty value", () => {
    expect(parseHeader("X-Empty:")).toEqual(["X-Empty", ""]);
  });

  it.each(["no colon", ": value", "Bad Name: value", "Náme: value", "X(1): value", ""])('rejects "%s"', (raw) => {
    expect(parseHeader(raw)).toBeNull();
  });
});
