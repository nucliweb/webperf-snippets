#!/usr/bin/env bash
# Runs the webperf-snippets CLI for the composite action and exposes the result.
#
# Inputs arrive as WEBPERF_* environment variables, never interpolated into this
# script, so a value with shell syntax stays plain text. The markdown contains
# text taken from the measured page, so it is treated as untrusted:
#  - it goes to $GITHUB_OUTPUT with a random delimiter, so no text in it can end
#    the value early and add outputs;
#  - it is printed between stop-commands markers, so no text in it can run a
#    workflow command such as ::error:: or ::add-mask::.
set -uo pipefail

read -r -a cmd <<< "${WEBPERF_CMD:?WEBPERF_CMD is required}"
args=("${WEBPERF_URL:?WEBPERF_URL is required}" --workflow "${WEBPERF_WORKFLOW:-core-web-vitals}" --markdown)
[ -n "${WEBPERF_BUDGET_LCP:-}" ] && args+=(--budget-lcp "$WEBPERF_BUDGET_LCP")
[ -n "${WEBPERF_BUDGET_CLS:-}" ] && args+=(--budget-cls "$WEBPERF_BUDGET_CLS")

markdown=$("${cmd[@]}" "${args[@]}")
code=$?

random_token() { od -An -N16 -tx1 /dev/urandom | tr -d ' \n'; }

stop_token="webperf_stop_$(random_token)"
echo "::stop-commands::$stop_token"
printf '%s\n' "$markdown"
echo "::$stop_token::"

delimiter="webperf_$(random_token)"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "markdown<<$delimiter"
    printf '%s\n' "$markdown"
    echo "$delimiter"
    echo "exit-code=$code"
  } >> "$GITHUB_OUTPUT"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "$markdown" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "${WEBPERF_FAIL_ON_BUDGET:-true}" = "true" ] && [ "$code" -ne 0 ]; then
  exit "$code"
fi
