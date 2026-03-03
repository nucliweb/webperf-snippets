#!/bin/bash
# PostToolUse hook: runs ESLint with the prefer-dynamic-import-with-feature-guard
# rule on any JS/JSX file that Claude just wrote or edited.

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | node -e "
  process.stdin.setEncoding('utf8')
  let data = ''
  process.stdin.on('data', chunk => data += chunk)
  process.stdin.on('end', () => {
    try {
      const parsed = JSON.parse(data)
      process.stdout.write(parsed.tool_input?.file_path || '')
    } catch {}
  })
")

# Only lint JS/JSX files
if [[ -z "$FILE_PATH" ]] || [[ ! "$FILE_PATH" =~ \.(js|jsx)$ ]]; then
  exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

CONFIG="$(cd "$(dirname "$0")/.." && pwd)/eslint.config.cjs"

result=$(npx eslint --config "$CONFIG" "$FILE_PATH" 2>&1)

if [[ -n "$result" ]]; then
  echo "$result"
  exit 1
fi

exit 0
