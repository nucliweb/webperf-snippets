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
workflow="${WEBPERF_WORKFLOW:-core-web-vitals}"
args=("${WEBPERF_URL:?WEBPERF_URL is required}" --workflow "$workflow" --markdown)

# Adds a budget flag when its input has a value. "auto", the default of LCP and CLS, means the default
# value with the core-web-vitals workflow, the one that measures them, and no budget with the others:
# the CLI rejects a budget of a metric the workflow does not measure.
budget() {
  local option=$1 value=$2 default=${3:-}
  if [ "$value" = "auto" ]; then
    [ "$workflow" = "core-web-vitals" ] && value=$default || value=""
  fi
  [ -n "$value" ] && args+=("$option" "$value")
  return 0
}
budget --budget-lcp "${WEBPERF_BUDGET_LCP:-}" 2500
budget --budget-fcp "${WEBPERF_BUDGET_FCP:-}"
budget --budget-ttfb "${WEBPERF_BUDGET_TTFB:-}"
budget --budget-cls "${WEBPERF_BUDGET_CLS:-}" 0.1
budget --budget-inp "${WEBPERF_BUDGET_INP:-}"

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
