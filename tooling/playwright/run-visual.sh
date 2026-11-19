#!/usr/bin/env bash
# Runs the screenshot tests inside the pinned Playwright image (deterministic rendering).
# The image tag must match the @playwright/test version in package.json.
# Always amd64 (emulated on Apple Silicon via Docker Desktop): the image is multi-arch, and
# arm64 Chromium may render slightly differently from the golden images made on amd64 CI.
# Extra arguments are passed to Playwright, e.g. `pnpm test:visual --update-snapshots`.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# The renderer harness is bundled on the host: the container then only opens static pages and
# never runs a native bundler binary built for another OS (macOS host, Linux container).
pnpm --dir "$ROOT" exec turbo run build --filter=@dungeon-manager/test-fixtures^... --output-logs=errors-only
pnpm --dir "$ROOT" --filter @dungeon-manager/test-fixtures build:harness
# The DM-window harness (T-130a) for the zone-layout screenshot, likewise built on the host.
pnpm --dir "$ROOT" exec turbo run build --filter=@dungeon-manager/desktop^... --output-logs=errors-only
pnpm --dir "$ROOT" --filter @dungeon-manager/desktop build:e2e

exec docker run --rm --ipc=host --platform linux/amd64 \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e CI \
  -v "$ROOT":/work -w /work \
  "$IMAGE" \
  node_modules/.bin/playwright test --config tooling/playwright/visual.config.js "$@"
