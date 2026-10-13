"use client";

import manifest from "../extension/manifest.json";
import { trackEvent } from "../lib/analytics";

// The zip that the release workflow publishes for a tag extension-v<version> (.github/workflows/release-extension.yml)
export function extensionZipUrl(version) {
  return `https://github.com/nucliweb/webperf-snippets/releases/download/extension-v${version}/webperf-snippets-extension-${version}.zip`;
}

// The download of the beta, with an event that counts the downloads alongside those of the release
export function ExtensionDownload() {
  const { version } = manifest;
  return (
    <p className="wp-extension-download">
      <a
        className="wp-extension-download-link"
        href={extensionZipUrl(version)}
        onClick={() => trackEvent("download_extension", { version })}
      >
        Download the extension <span className="wp-extension-download-version">v{version} beta, zip</span>
      </a>
    </p>
  );
}
