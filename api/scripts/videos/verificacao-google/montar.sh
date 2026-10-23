#!/bin/bash
# Junta abertura + demonstração real + encerramento num MP4 1920x1080 para o YouTube.
# Uso: ./montar.sh   (antes: node cartelas.js e node ../gerar.js verificacao-google <esta pasta>)
set -e
cd "$(dirname "$0")"
norm() { ffmpeg -y -loglevel error -i "$1" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x13264C,fps=30,format=yuv420p" \
  -c:v libx264 -preset medium -crf 20 -c:a aac -ar 48000 -ac 2 -b:a 160k "$2"; }
norm abertura.mp4 _1.mp4
norm verificacao-google.mp4 _2.mp4
norm encerramento.mp4 _3.mp4
printf "file '_1.mp4'\nfile '_2.mp4'\nfile '_3.mp4'\n" > _lista.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i _lista.txt -c copy duo-google-calendar-verification.mp4
rm -f _1.mp4 _2.mp4 _3.mp4 _lista.txt
echo "✔ $(pwd)/duo-google-calendar-verification.mp4"
