# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/nucliweb/webperf-snippets/security/advisories/new), not in a public issue. The report reaches the maintainer only, and the advisory stays private until a fix is published.

Include what is affected (a snippet, the CLI, the GitHub Action, the DevTools extension, the Agent Skills or the website), the steps to reproduce it and the impact you expect. Use a local page or a domain reserved for documentation (`example.com`) in the steps, never a real site you do not own.

The maintainer answers within 7 days and keeps you informed until the issue is fixed or closed.

## Scope

| Component | Supported version |
| --- | --- |
| Snippets on [webperf-snippets.net](https://webperf-snippets.net) and in `snippets/` | The `main` branch |
| CLI ([`webperf-snippets`](https://www.npmjs.com/package/webperf-snippets) on npm) and the GitHub Action | The latest release |
| DevTools extension (beta) | The latest release |
| Agent Skills | The `main` branch |

Snippets run in the page you paste them into, with the permissions of that page, and the CLI and the Action open the URL you give them in a headless Chromium. A report is in scope when a snippet, the CLI, the Action, the extension or a skill does something beyond that: sends data to a third party, runs code the page did not provide, exposes the storage state or credentials passed to the CLI, or lets a crafted page escape the browser sandbox through them.
