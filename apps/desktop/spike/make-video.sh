#!/usr/bin/env bash
# SPIKE (T-007): provides the 4K test video for the performance spike.
#   pnpm --filter @dungeon-manager/desktop spike:video                 → generates a synthetic 4K H.264 video (needs ffmpeg)
#   pnpm --filter @dungeon-manager/desktop spike:video /full/path.mp4  → uses your own MP4/WebM map instead (stays local)
# Options: SPIKE_VIDEO_SECONDS (default 20), SPIKE_VIDEO_FPS (default 30; animated maps are often 30, some 60).
# The video is stored in apps/desktop/spike-assets/ (git-ignored) and never committed.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/spike-assets/spike"
LENGTH="${SPIKE_VIDEO_SECONDS:-20}"
FPS="${SPIKE_VIDEO_FPS:-30}"
mkdir -p "$DIR"
tmp="$DIR/.incoming"
rm -f "$tmp"

if [ "$#" -ge 1 ]; then
  if [ ! -f "$1" ]; then
    echo "File not found: $1 (use the full path, or drag the file into the terminal)" >&2
    exit 1
  fi
  base="$(basename "$1")"
  case "$base" in
    *.*) ext="$(printf '%s' "${base##*.}" | tr '[:upper:]' '[:lower:]')" ;;
    *) echo "The file needs an extension (.mp4 or .webm): $1" >&2; exit 1 ;;
  esac
  cp "$1" "$tmp"
else
  if ! command -v ffmpeg >/dev/null; then
    echo "ffmpeg not found. Install it with: brew install ffmpeg" >&2
    exit 1
  fi
  ext="mp4"
  echo "Generating a ${LENGTH}s 4K test video at ${FPS} fps (this can take a minute) …"
  # Moving test pattern plus temporal noise: every frame changes, so the bitrate (~40 Mbit/s)
  # is in the range of real animated 4K maps and the decoder cannot coast.
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=3840x2160:rate=${FPS}" \
    -vf "noise=alls=18:allf=t+u" -t "$LENGTH" \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -b:v 40M -maxrate 50M -bufsize 80M -movflags +faststart -f mp4 \
    "$tmp"
fi

# Replace the previous video only once the new one is complete.
rm -f "$DIR"/map.*
mv "$tmp" "$DIR/map.$ext"
printf '{ "video": "%s" }\n' "map.$ext" > "$DIR/manifest.json"
echo "Test video ready: $DIR/map.$ext"
