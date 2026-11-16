#!/usr/bin/env bash
# Runs the screenshot tests inside the pinned Playwright image (deterministic rendering).
# The image tag must match the @playwright/test version in package.json.
# Extra arguments are passed to Playwright, e.g. `pnpm test:visual --update-snapshots`.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

exec docker run --rm --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e CI \
  -v "$ROOT":/work -w /work \
  "$IMAGE" \
  node_modules/.bin/playwright test --config tooling/playwright/visual.config.js "$@"
