#!/usr/bin/env bash
# Frames + soundtrack -> gize-reel.mp4 (H.264 1080p60, BT.709, AAC 256k).
#   ./encode.sh [frames_dir]
set -euo pipefail
cd "$(dirname "$0")"
FRAMES="${1:-frames}"
FFMPEG="${FFMPEG:-$(command -v ffmpeg || python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')}"

"$FFMPEG" -y -hide_banner -loglevel warning -nostats \
  -framerate 60 -i "$FRAMES/f_%04d.png" -i soundtrack.wav \
  -vf "noise=c0s=3:c1s=1:c2s=1:allf=t,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 19 -profile:v high -level 4.2 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart -shortest gize-reel.mp4
