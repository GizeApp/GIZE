#!/usr/bin/env bash
# Frames + soundtrack -> MP4 (H.264, 60 fps, BT.709, AAC 256k).
#   ./encode.sh [frames_dir] [audio.wav] [out.mp4]   (paths relative to this folder)
set -euo pipefail
cd "$(dirname "$0")"
FRAMES="${1:-frames}"
AUDIO="${2:-soundtrack.wav}"
OUT="${3:-gize-reel.mp4}"
FFMPEG="${FFMPEG:-$(command -v ffmpeg || python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')}"

"$FFMPEG" -y -hide_banner -loglevel warning -nostats \
  -framerate 60 -i "$FRAMES/f_%04d.png" -i "$AUDIO" \
  -vf "noise=c0s=3:c1s=1:c2s=1:allf=t,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 19 -profile:v high -level 4.2 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart -shortest "$OUT"
