#!/usr/bin/env bash
# PreToolUse hook: block edits to accepted ADRs and secret files.
# Accepted ADRs are superseded by new ADRs, never edited (ADR-0001).
set -uo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path??"")}catch{}})')"
[ -z "$file" ] && exit 0

case "$file" in
  *.env|*.env.*)
    echo "Blocked: secret files must not be edited by the agent." >&2
    exit 2
    ;;
  */docs/adr/0*.md)
    if [ -f "$file" ] && grep -q '^- \*\*Status:\*\* Accepted' "$file"; then
      echo "Blocked: $file is an accepted ADR. Create a new ADR that supersedes it (/new-adr) instead of editing." >&2
      exit 2
    fi
    ;;
esac
exit 0
