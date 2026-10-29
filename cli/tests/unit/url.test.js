import { describe, it, expect } from "vitest";
import { isHttpUrl } from "../../src/url.js";

describe("isHttpUrl", () => {
  it("accepts an http or https URL, local servers included", () => {
    for (const url of ["https://example.com/", "http://example.com/page?q=1", "http://localhost:3000", "http://127.0.0.1:8080/x", "HTTPS://EXAMPLE.COM"]) {
      expect(isHttpUrl(url), url).toBe(true);
    }
  });

  it("refuses another protocol, which would read the machine of the user or run code", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<h1>x</h1>", "chrome://settings", "ftp://example.com/", "view-source:https://example.com"]) {
      expect(isHttpUrl(url), url).toBe(false);
    }
  });

  it("refuses what is not a URL", () => {
    for (const url of ["example.com", "", "http//example.com", undefined, null, 42]) {
      expect(isHttpUrl(url), String(url)).toBe(false);
    }
  });
});
