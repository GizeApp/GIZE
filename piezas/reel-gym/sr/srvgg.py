"""SRVGGNetCompact (Real-ESRGAN realesr-general-x4v3), la misma arquitectura que el repo original,
escrita acá para no depender de basicsr."""
import torch, torch.nn as nn, torch.nn.functional as F

class SRVGGNetCompact(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList([nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)])
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1)); self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(upscale)
    def forward(self, x):
        out = x
        for m in self.body: out = m(out)
        out = self.upsampler(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode='nearest')

def load(path_general, path_wdn=None, denoise=0.5):
    """denoise 0..1: mezcla de pesos entre el modelo general y el de «sin ruido» (como el -dn del original)."""
    a = torch.load(path_general, map_location='cpu', weights_only=True); a = a.get('params', a)
    if path_wdn is not None:
        b = torch.load(path_wdn, map_location='cpu', weights_only=True); b = b.get('params', b)
        a = {k: (1 - denoise) * a[k] + denoise * b[k] for k in a}
    m = SRVGGNetCompact(); m.load_state_dict(a, strict=True); m.eval()
    return m
