/* Liquid chrome, in WebGL2 (SwiftShader in headless Chromium).
   Pass 1 (half resolution) writes a height field into a float texture: slow domain-warped value-noise
   (the liquid), plus whatever is rising out of it — a mask texture (words, the G; R = tight blur for the
   bevel, G = wide blur for the belly), a rounded-rect slab (the phone) and a ripple ring.
   Pass 2 (full resolution) takes the normal from the height texture and reflects a studio: dark navy
   all round, one broad silver softbox, a thin strip light, a cool floor bounce — which is what makes
   metal read as metal. */
const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .55; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<4;i++){ v += a*noise(p); p = m*p; a *= .42; } return v; }`;

const HFS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform float uT, uFlow, uMaskA, uMelt, uCalm;
uniform vec2 uAsp, uRes;
uniform sampler2D uMask;
uniform vec4 uRip;       // x, y (uv), t0, amplitude
uniform vec4 uPh;        // phone centre x, y (px), half w, half h
uniform vec3 uPh2;       // corner radius (px), amplitude, bevel (px)
${NOISE}
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p)-b+r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
void main(){
  vec2 p = mat2(.8,.6,-.6,.8)*(vUv*uAsp)*vec2(.42,1.05) + vec2(.3,.1);       // stretched along a diagonal: long ribbons
  float t = uFlow;
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2,1.3) - t*.8));
  vec2 r = vec2(fbm(p + 1.8*q + vec2(1.7,9.2) + t*1.1), fbm(p + 1.8*q + vec2(8.3,2.8) - t*.9));
  float f = fbm(p + 1.6*r);
  float rib = 1. - abs(2.*fract(f*2.2 + .15) - 1.);            // contour ridges of the warped field: the ribbons
  rib = rib*rib*(3. - 2.*rib);
  float h = mix(f, .35 + .45*rib, .78);
  h = mix(h, .5, uCalm);
  vec2 muv = vUv;
  if (uMelt > 0.) muv += uMelt*vec2((noise(vUv*vec2(9.,4.) + uT*1.3) - .5)*.035, .10*uMelt*noise(vec2(vUv.x*22., uT*.7)));
  vec4 m = texture(uMask, muv);
  h = mix(h, .5, clamp(m.b*uMaskA*.95, 0., .85));                   // B: a calm pool behind the shape
  h += uMaskA*(.74*m.r + .26*m.g)*.58;                                // R: bevel, G: belly
  vec2 px = vUv*uRes;
  float d = sdBox(px - uPh.xy, uPh.zw, uPh2.x);
  h += uPh2.y*.55*smoothstep(0., uPh2.z, -d);
  if (uRip.w > 0.) { float rd = length((vUv - uRip.xy)*uAsp), a = uT - uRip.z;
    h += .3*uRip.w*sin(rd*70. - a*16.)*exp(-rd*4.)*exp(-a*3.6)*smoothstep(0., .05, a)*smoothstep(a*1.1+.02, a*1.1-.12, rd); }
  o = vec4(h, 0., 0., 1.);
}`;

const SFS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uH; uniform vec2 uTx, uAsp; uniform float uK, uBright, uSweep, uT;
vec3 env(vec3 r){
  vec2 a = r.xy; float l = length(a);
  float y = dot(a, normalize(vec2(-.38,.93)));                                   // "up", tilted toward the top-left
  vec3 sky = mix(vec3(.93,.96,1.), vec3(.50,.58,.76), smoothstep(.22,.95,y));      // silver at the horizon, steel-blue above
  vec3 ground = mix(vec3(.015,.03,.08), vec3(.06,.11,.25), smoothstep(-.95,.12,y));
  vec3 c = mix(ground, sky, smoothstep(.2,.26,y));                                // the crisp horizon: what makes it chrome
  c += vec3(.62,.7,.88)*smoothstep(.035,0.,abs(y + .40))*smoothstep(.12,.32,l);    // a strip light low in the room
  c += vec3(.25,.4,.8)*.35*smoothstep(.5,.95,-dot(a, normalize(vec2(.9,.2))))*smoothstep(.3,.7,l);   // blue bounce from the right
  c = mix(vec3(.025,.045,.11), c, smoothstep(.04,.26,l));                          // facing the lens: deep navy
  c += vec3(.9,.95,1.)*1.3*smoothstep(.03,.0,abs(dot(a, normalize(vec2(.8,1.))) - uSweep))*smoothstep(.1,.35,l);   // a moving sweep
  return c;
}
void main(){
  float hL = texture(uH, vUv - vec2(uTx.x,0.)).r, hR = texture(uH, vUv + vec2(uTx.x,0.)).r;
  float hD = texture(uH, vUv - vec2(0.,uTx.y)).r, hU = texture(uH, vUv + vec2(0.,uTx.y)).r, h = texture(uH, vUv).r;
  vec2 g = vec2((hR-hL)/(2.*uTx.x*uAsp.x), (hU-hD)/(2.*uTx.y*uAsp.y));
  vec3 n = normalize(vec3(-g*uK, 1.));
  vec3 r = reflect(vec3(0.,0.,-1.), n);
  vec3 col = env(r);
  col *= mix(.55, 1.05, smoothstep(.15, .85, h));
  col = col*uBright;
  col = col/(1.+col*.18);                       // soft shoulder for the highlights
  o = vec4(pow(col, vec3(1./1.05)), 1.);
}`;

// a sharp 8-bit coverage canvas per channel -> gaussian blurs in float (three box passes), rows flipped for GL
function boxes(sigma) { const n = 3, wi = Math.sqrt(12 * sigma * sigma / n + 1); let wl = Math.floor(wi); if (wl % 2 === 0) wl--; const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2); }
function boxH(a, b, w, h, r) { const iarr = 1 / (r + r + 1); for (let i = 0; i < h; i++) { let ti = i * w, li = ti, ri = ti + r; const fv = a[ti], lv = a[ti + w - 1]; let val = (r + 1) * fv;
  for (let j = 0; j < r; j++) val += a[ti + Math.min(j, w - 1)]; for (let j = 0; j < w; j++) { val += a[i * w + Math.min(j + r, w - 1)] - (j - r - 1 >= 0 ? a[i * w + j - r - 1] : fv); b[ti++] = val * iarr; } } }
function boxV(a, b, w, h, r) { const iarr = 1 / (r + r + 1); for (let i = 0; i < w; i++) { const fv = a[i], lv = a[i + w * (h - 1)]; let val = (r + 1) * fv;
  for (let j = 0; j < r; j++) val += a[i + Math.min(j, h - 1) * w]; for (let j = 0; j < h; j++) { val += a[i + Math.min(j + r, h - 1) * w] - (j - r - 1 >= 0 ? a[i + (j - r - 1) * w] : fv); b[i + j * w] = val * iarr; } } }
export function gauss(src, w, h, sigma) { if (sigma < 0.5) return src.slice(); let a = src.slice(), b = new Float32Array(src.length);
  for (const r0 of boxes(sigma)) { const r = Math.max(1, Math.round(r0)); boxH(a, b, w, h, r); boxV(b, a, w, h, r); } return a; }
export function floatMask(w, h, channels) {   // channels: [[coverage Float32Array, sigma px], ...] up to 4
  const out = new Float32Array(w * h * 4), bl = channels.map(([c, s]) => gauss(c, w, h, s));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, o = ((h - 1 - y) * w + x) * 4; for (let k = 0; k < bl.length; k++) out[o + k] = bl[k][i]; out[o + 3] = 1; }
  return { w, h, data: out }; }

export function createChrome(W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('no webgl2');
  gl.getExtension('EXT_color_buffer_float');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); U[u.name] = gl.getUniformLocation(p, u.name); } return { p, U }; };
  const PH = prog(HFS), PS = prog(SFS);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const HW = Math.round(W / 2), HH = Math.round(H / 2);
  const tex = (w, h, internal, fmt, type) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  gl.getExtension('OES_texture_float_linear');
  const hTex = tex(HW, HH, gl.RGBA32F, gl.RGBA, gl.FLOAT), fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hTex, 0);
  const mTex = tex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let maskSrc = null;
  return {
    canvas: cv,
    // the mask: a canvas the size of the frame (or smaller), white shapes: R tight blur, G wide blur
    // m: {w, h, data: Float32Array RGBA, rows bottom-up} (see floatMask) — float, so blurred edges don't terrace
    setMask(m) { if (m === maskSrc) return; maskSrc = m; gl.bindTexture(gl.TEXTURE_2D, mTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, m.w, m.h, 0, gl.RGBA, gl.FLOAT, m.data); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); },
    render(s) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, HW, HH); gl.useProgram(PH.p); const U = PH.U;
      gl.uniform1f(U.uT, s.t); gl.uniform1f(U.uFlow, s.flow); gl.uniform1f(U.uMaskA, s.maskA || 0); gl.uniform1f(U.uMelt, s.melt || 0); gl.uniform1f(U.uCalm, s.calm || 0);
      gl.uniform2f(U.uAsp, W / H, 1); gl.uniform2f(U.uRes, W, H);
      const ph = s.phone || { x: 0, y: 0, w: 1, h: 1, r: 1, a: 0, b: 30 }; gl.uniform4f(U.uPh, ph.x, H - ph.y, ph.w / 2, ph.h / 2); gl.uniform3f(U.uPh2, ph.r, ph.a, ph.b);
      const rp = s.rip || { x: 0, y: 0, t0: -9, a: 0 }; gl.uniform4f(U.uRip, rp.x, 1 - rp.y, rp.t0, rp.a);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mTex); gl.uniform1i(U.uMask, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(PS.p); const V = PS.U;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hTex); gl.uniform1i(V.uH, 0);
      gl.uniform2f(V.uTx, 1 / HW, 1 / HH); gl.uniform2f(V.uAsp, W / H, 1); gl.uniform1f(V.uK, s.k ?? 0.95); gl.uniform1f(V.uBright, s.bright ?? 1); gl.uniform1f(V.uSweep, s.sweep ?? -9); gl.uniform1f(V.uT, s.t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return cv;
    },
  };
}
