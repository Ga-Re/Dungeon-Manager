#!/usr/bin/env bash
# SPIKE (T-007): provides the test videos for the performance spike – a 4K version and,
# if ffmpeg is installed, a 1080p version of the same content.
#   pnpm --filter @dungeon-manager/desktop spike:video                 → generates a synthetic 4K H.264 video (needs ffmpeg)
#   pnpm --filter @dungeon-manager/desktop spike:video /full/path.mp4  → uses your own MP4/WebM map instead (stays local)
# Options: SPIKE_VIDEO_SECONDS (default 40), SPIKE_VIDEO_FPS (default 30; animated maps are often 30, some 60).
# The videos are stored in apps/desktop/spike-assets/ (git-ignored) and never committed.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/spike-assets/spike"
# 40 s: longer than warm-up + measurement, so the loop restart never falls into a measurement.
LENGTH="${SPIKE_VIDEO_SECONDS:-40}"
FPS="${SPIKE_VIDEO_FPS:-30}"
mkdir -p "$DIR"
uhd_tmp="$DIR/.incoming-uhd"
fhd_tmp="$DIR/.incoming-fhd.mp4"
rm -f "$uhd_tmp" "$fhd_tmp"
has_ffmpeg=false
command -v ffmpeg >/dev/null && has_ffmpeg=true

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
  cp "$1" "$uhd_tmp"
else
  if [ "$has_ffmpeg" != true ]; then
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
    "$uhd_tmp"
fi

fhd_name=null
if [ "$has_ffmpeg" = true ]; then
  echo "Creating the 1080p version …"
  ffmpeg -hide_banner -loglevel error -y -i "$uhd_tmp" -an \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease" \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -b:v 12M -maxrate 15M -bufsize 24M -movflags +faststart -f mp4 \
    "$fhd_tmp"
  fhd_name='"map-1080.mp4"'
else
  echo "ffmpeg not found: skipping the 1080p version (brew install ffmpeg to include it)."
fi

# Replace the previous videos only once the new ones are complete.
rm -f "$DIR"/map.* "$DIR"/map-*
mv "$uhd_tmp" "$DIR/map-2160.$ext"
[ -f "$fhd_tmp" ] && mv "$fhd_tmp" "$DIR/map-1080.mp4"
printf '{ "uhd": "%s", "fhd": %s }\n' "map-2160.$ext" "$fhd_name" > "$DIR/manifest.json"
echo "Test videos ready in $DIR"
