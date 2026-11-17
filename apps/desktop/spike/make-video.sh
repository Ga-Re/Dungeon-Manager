#!/usr/bin/env bash
# SPIKE (T-007): provides the 4K test video for the performance spike.
#   pnpm --filter @dungeon-manager/desktop spike:video            → generates a synthetic 4K/30 fps H.264 video (needs ffmpeg)
#   pnpm --filter @dungeon-manager/desktop spike:video <file>     → uses your own MP4/WebM map instead (stays local)
# The video is stored in apps/desktop/spike-assets/ (git-ignored) and never committed.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/spike-assets/spike"
SECONDS_LONG="${SPIKE_VIDEO_SECONDS:-20}"
mkdir -p "$DIR"
rm -f "$DIR"/map.*

if [ "$#" -ge 1 ]; then
  ext="${1##*.}"
  cp "$1" "$DIR/map.$ext"
  name="map.$ext"
else
  if ! command -v ffmpeg >/dev/null; then
    echo "ffmpeg not found. Install it with: brew install ffmpeg" >&2
    exit 1
  fi
  echo "Generating a ${SECONDS_LONG}s 4K test video (this can take a minute) …"
  # Moving test pattern plus temporal noise: every frame changes, so the bitrate (~40 Mbit/s)
  # is in the range of real animated 4K maps and the decoder cannot coast.
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=3840x2160:rate=30" \
    -vf "noise=alls=18:allf=t+u" -t "$SECONDS_LONG" \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -b:v 40M -maxrate 50M -bufsize 80M -movflags +faststart \
    "$DIR/map.mp4"
  name="map.mp4"
fi

printf '{ "video": "%s" }\n' "$name" > "$DIR/manifest.json"
echo "Test video ready: $DIR/$name"
