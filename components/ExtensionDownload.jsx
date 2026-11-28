"use client";

import manifest from "../extension/manifest.json";
import { trackEvent } from "../lib/analytics";

// The listing of the extension, which Chrome keeps up to date once installed
export const EXTENSION_STORE_URL = "https://chromewebstore.google.com/detail/webperf-snippets/lnoemoojedpphjfjpohipfmmgpjojagk";

// The zip that the release workflow publishes for a tag extension-v<version> (.github/workflows/release-extension.yml)
export function extensionZipUrl(version) {
  return `https://github.com/nucliweb/webperf-snippets/releases/download/extension-v${version}/webperf-snippets-extension-${version}.zip`;
}

// The install from the store, and the zip of the version of the repository to load unpacked, with an
// event for each. The store link names no version: a version reaches the store after its review, later
// than its zip.
export function ExtensionDownload() {
  const { version } = manifest;
  return (
    <p className="wp-extension-download">
      <a className="wp-extension-download-link" href={EXTENSION_STORE_URL} onClick={() => trackEvent("install_extension")}>
        Add to Chrome <span className="wp-extension-download-version">Chrome Web Store</span>
      </a>
      <a className="wp-extension-download-zip" href={extensionZipUrl(version)} onClick={() => trackEvent("download_extension", { version })}>
        Or download the zip of v{version} to load unpacked
      </a>
    </p>
  );
}
