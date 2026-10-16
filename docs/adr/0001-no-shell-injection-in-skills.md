# 1. No shell command injection in SKILL.md

Date: 2026-03-18
Status: accepted
Discussion: [#68](https://github.com/nucliweb/webperf-snippets/issues/68)

## Context

Claude Code supports the `` !`command` `` syntax in skills, which runs a shell command when the skill is invoked and injects its output into the prompt. The WebPerf Skills could use it to inline the JavaScript of a snippet at invocation time, so the agent would not have to read the script file separately.

## Decision

The skills do not use the `` !`command` `` syntax.

## Reason

The syntax is exclusive to Claude Code. The skills follow the Agent Skills format so that any agent that supports it can use them, including the Gemini and Antigravity versions generated in `dist/`. A Claude Code dependency would break that compatibility.

## Consequences

The scripts stay as standalone files in `scripts/` of each skill, referenced by name in `SKILL.md`, and the agent reads them on demand. `scripts/generate-skills.js` keeps generating them that way.
