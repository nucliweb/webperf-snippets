# 2. The MCP server is a subcommand of the CLI, over stdio

Date: 2026-10-18
Status: accepted

## Context

With Chrome DevTools MCP, an agent that runs a snippet reads its source (11 KB at the median) and sends it back as the argument of `evaluate_script`. An MCP server of our own lets the agent ask for a snippet by name (`run_snippet`, `run_workflow`) and get the result object, with the same runner, snippets and workflows as the CLI.

The server could ship as a subcommand of the `webperf-snippets` package or as a separate package, such as `webperf-snippets-mcp`.

## Decision

The MCP server is a subcommand of the CLI, `npx webperf-snippets mcp`, with its code in `cli/src/mcp/`. It talks to the client over the stdio transport.

## Reason

- The server imports the runner, the snippets and the workflows of the same package. The CLI exposes no programmatic API (`package.json` only declares `bin`), so a separate package would need a new public API to keep stable, or a copy of the runner and the snippets.
- One package keeps one version, one release workflow (the `cli-v*` tag) and one npm publishing setup, for a project with one maintainer.
- One command installs it in any client that launches local servers, for example `claude mcp add webperf -- npx -y webperf-snippets mcp`. People who already use the CLI install nothing else.
- stdio fits a local server: the client starts it as a child process and exchanges JSON-RPC messages through its standard input and output, and the server opens Chromium on the same machine, as the CLI does. It needs no port and no authentication. With Streamable HTTP, the other transport of the [specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), the server is an independent process that serves several clients over HTTP; running it locally would need it to bind to localhost, validate the `Origin` header against DNS rebinding and authenticate its clients.

## Consequences

- The tools of the MCP server are a second public interface of the package, under the same version as the CLI flags: an incompatible change in a tool needs a major version of the package.
- People who only use the CLI also install the MCP SDK.
- `bin.js` tells the `mcp` subcommand apart from a URL in the first argument.
- Over stdio, standard output only carries MCP messages: the server and the code it calls write logs and progress to standard error, never with `console.log`.
- If the server needs its own release pace, it can move to a separate package later, with a new ADR.
