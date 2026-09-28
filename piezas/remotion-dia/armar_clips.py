"""Pasa las grabaciones de la app (cuadros JPG con sus tiempos, de ../youtube-guia/grabacion/frames/solo)
a clips MP4 de 30 fps en public/clips/, que usa el video de Remotion."""
import os, json, glob, subprocess
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
GUIA = os.path.join(HERE, '..', 'youtube-guia', 'grabacion', 'frames', 'solo')
PROPIAS = os.path.join(HERE, 'grabacion', 'frames')          # grabacion/grabar.js: diario que se completa y peso que baja
OUT = os.path.join(HERE, 'public', 'clips')
os.makedirs(OUT, exist_ok=True)
CLIPS = [(GUIA, n) for n in ['racha', 'entrenar', 'descanso', 'finalizar', 'habitos']] + \
        [(PROPIAS, n) for n in ['desayuno', 'almuerzo', 'merienda', 'cena', 'peso']]
for FR, name in CLIPS:
    d = os.path.join(FR, name); m = json.load(open(os.path.join(d, 'times.json')))
    files = sorted(glob.glob(os.path.join(d, '*.jpg'))); ts = np.array(m['times']) - m['start']
    n = int((m['end'] - m['start']) * 30)
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '780x1612', '-r', '30', '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                           os.path.join(OUT, name + '.mp4')], stdin=subprocess.PIPE)
    cache = {}
    for k in range(n):
        i = max(0, int(np.searchsorted(ts, k / 30, side='right')) - 1)
        if i not in cache: cache = {i: Image.open(files[i]).convert('RGB').resize((780, 1612)).tobytes()}
        ff.stdin.write(cache[i])
    ff.stdin.close(); ff.wait()
    print(name, round(n / 30, 1), 's', [round(x['t'], 1) for x in m['marks']])
