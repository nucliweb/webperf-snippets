import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ExtensionDownload, extensionZipUrl } from "./ExtensionDownload";

const { version } = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));

describe("ExtensionDownload", () => {
  it("links to the zip of the release of the version of the manifest", () => {
    expect(extensionZipUrl(version)).toBe(
      `https://github.com/nucliweb/webperf-snippets/releases/download/extension-v${version}/webperf-snippets-extension-${version}.zip`
    );
    const html = renderToStaticMarkup(<ExtensionDownload />);
    expect(html).toContain(`href="${extensionZipUrl(version)}"`);
  });

  it("says which version it downloads", () => {
    const html = renderToStaticMarkup(<ExtensionDownload />);
    expect(html).toMatch(new RegExp(`Download the extension.*${version.replace(/\./g, "\\.")}`));
  });
});
