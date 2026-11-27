import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ExtensionDownload, extensionZipUrl, EXTENSION_STORE_URL } from "./ExtensionDownload";

const { version } = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));

describe("ExtensionDownload", () => {
  it("links to the listing of the extension in the Chrome Web Store", () => {
    expect(EXTENSION_STORE_URL).toBe("https://chromewebstore.google.com/detail/webperf-snippets/lnoemoojedpphjfjpohipfmmgpjojagk");
    const html = renderToStaticMarkup(<ExtensionDownload />);
    expect(html).toMatch(new RegExp(`<a [^>]*href="${EXTENSION_STORE_URL}"[^>]*>Add to Chrome`));
  });

  it("keeps the zip of the release of the version of the manifest, to load unpacked", () => {
    expect(extensionZipUrl(version)).toBe(
      `https://github.com/nucliweb/webperf-snippets/releases/download/extension-v${version}/webperf-snippets-extension-${version}.zip`
    );
    const html = renderToStaticMarkup(<ExtensionDownload />);
    expect(html).toContain(`href="${extensionZipUrl(version)}"`);
    expect(html).toMatch(new RegExp(`zip of v${version.replace(/\./g, "\\.")}`));
  });
});
