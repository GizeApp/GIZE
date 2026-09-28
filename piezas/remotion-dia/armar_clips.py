"""Pasa las grabaciones de la app (cuadros JPG con sus tiempos, de ../youtube-guia/grabacion/frames/solo)
a clips MP4 de 30 fps en public/clips/, que usa el video de Remotion."""
import os, json, glob, subprocess
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, '..', 'youtube-guia', 'grabacion', 'frames', 'solo')
OUT = os.path.join(HERE, 'public', 'clips')
os.makedirs(OUT, exist_ok=True)
for name in ['racha', 'registro', 'comida', 'agua', 'entrenar', 'descanso', 'finalizar', 'habitos', 'progreso']:
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
