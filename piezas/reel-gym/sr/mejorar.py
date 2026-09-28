"""Mejora el video de Lautaro (WhatsApp, 464×832) con Real-ESRGAN realesr-general-x4v3 (+50 % del modelo
«sin ruido»): limpia la compresión y reconstruye detalle, 4× y después a 1080 de ancho.
Salida: src/gimnasio-lautaro-hd.mp4 (1080×1936, casi sin pérdida). Tarda ~6 s por cuadro en CPU.
Pesos: https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0 (realesr-general-x4v3.pth y -wdn-)."""
import os, sys, subprocess, time
import numpy as np, torch
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import srvgg
W_DIR = os.environ.get('PESOS', HERE)
SRC = os.path.join(HERE, '..', 'src', 'gimnasio-lautaro.mp4')
OUT = os.path.join(HERE, '..', 'src', 'gimnasio-lautaro-hd.mp4')
torch.set_num_threads(os.cpu_count())
m = srvgg.load(os.path.join(W_DIR, 'realesr-general-x4v3.pth'), os.path.join(W_DIR, 'realesr-general-wdn-x4v3.pth'), .5)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, 832, 464, 3)
ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1080x1936', '-r', '30', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv444p', OUT], stdin=subprocess.PIPE)
t0 = time.time()
for i, a in enumerate(fr):
    x = torch.from_numpy(a.copy()).permute(2, 0, 1)[None].float() / 255
    with torch.inference_mode(): y = m(x)[0].clamp(0, 1).permute(1, 2, 0).numpy()
    im = Image.fromarray((y * 255 + .5).astype(np.uint8)).resize((1080, 1936), Image.LANCZOS)
    ff.stdin.write(im.tobytes())
    if i % 20 == 0: print(i, len(fr), round(time.time() - t0), 's', flush=True)
ff.stdin.close(); ff.wait(); print('ok', OUT)
