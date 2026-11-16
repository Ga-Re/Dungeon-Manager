#!/usr/bin/env bash
# PostToolUse hook: format the edited file and lint it.
# Lint errors are reported back to Claude (exit 2) so they get fixed immediately.
set -uo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path??"")}catch{}})')"
[ -z "$file" ] || [ ! -f "$file" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Tooling only exists after T-001/T-002; stay silent before that.
[ -d node_modules ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    pnpm exec prettier --write --log-level warn "$file" >/dev/null 2>&1
    if ! out="$(pnpm exec eslint --fix "$file" 2>&1)"; then
      echo "ESLint errors in $file:" >&2
      echo "$out" >&2
      exit 2
    fi
    ;;
  *.json|*.md|*.yml|*.yaml|*.css)
    pnpm exec prettier --write --log-level warn "$file" >/dev/null 2>&1
    ;;
  *.rs)
    command -v rustfmt >/dev/null && rustfmt --edition 2021 "$file" >/dev/null 2>&1
    ;;
esac
exit 0
