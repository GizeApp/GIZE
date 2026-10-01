/* The orb: the iridescent sphere that is the G's dot (brand/BRAND.md), drawn the way scripts/logos.mjs draws it in
   vector: radial gradients only, no filters, so it costs the same at any size on every frame.
   A classic script that sets globalThis.GizeOrb, so the older standalone pages can load it with <script src>;
   lib/engine.js imports it for the rest.
     GizeOrb.halo(c,x,y,r,o)   the coloured light round it (draw it before the G, so the G sits on it)
     GizeOrb.tint(c,x,y,r,o,stroke)  that light on the G: stroke() strokes the G with the current strokeStyle
     GizeOrb.body(c,x,y,r,o)   the sphere; o.sx, o.sy squash it (the ball landing)
   o: {pal:'original'|'azul'|'rosa', k: halo strength (1 = the vector logo), light: on a light ground (paler halo)} */
(()=>{
// palettes as in scripts/logos.mjs: bi lower left, iz left, ar top, ad top right, de right, nu the light centre,
// base the sphere under it all, so the rim's shade; halo the three lights round it
const PAL={
  original:{bi:'#1BCDB6',iz:'#45C0E2',ar:'#6E8EF4',ad:'#9A55EE',de:'#E03AAE',nu:'#CBCCF2',base:'#9AA2E0',so:'#100A26',halo:['#22C6C8','#5468E8','#D23CB4']},
  azul:{bi:'#29C2EC',iz:'#3FA3F2',ar:'#5B7CF2',ad:'#8E5CF5',de:'#2B3FC0',nu:'#C8D8FA',base:'#7D9BEA',so:'#0A1033',halo:['#29C2EC','#3F7FF2','#8E5CF5']},
  rosa:{bi:'#FF8CBE',iz:'#FF4F9E',ar:'#DE6CEA',ad:'#B84CF0',de:'#E23DB4',nu:'#F4C6E6',base:'#DE78C0',so:'#3A0A26',halo:['#FF7DB8','#D65CF5','#E84DBE']}};
const HALO=[[0,.3,-.4,.15],[1,.12,0,-.4],[2,.26,.4,.1]];   // [colour, alpha, dx, dy] in radii
const TAU=Math.PI*2,pal=o=>PAL[o&&o.pal]||PAL.original;
const rgba=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${Math.max(0,Math.min(1,a))})`;
function rad(c,x,y,r,stops){const g=c.createRadialGradient(x,y,0,x,y,r);stops.forEach(([o,col])=>g.addColorStop(o,col));return g;}
const haloGrad=(c,x,y,r,col,a)=>rad(c,x,y,r*2.2,[[.3,rgba(col,a)],[.52,rgba(col,a*.45)],[.76,rgba(col,a*.12)],[1,rgba(col,0)]]);
function halo(c,x,y,r,o={}){const p=pal(o),a=(o.k??1)*(o.light?.55:1);if(a<=0)return;
  for(const[i,al,dx,dy]of HALO){const hx=x+dx*r,hy=y+dy*r;c.fillStyle=haloGrad(c,hx,hy,r,p.halo[i],al*a);c.beginPath();c.arc(hx,hy,r*2.2,0,TAU);c.fill();}}
function tint(c,x,y,r,o,stroke){const p=pal(o),a=(o.k??1)*(o.light?.55:1);if(a<=0)return;
  for(const[i,al,dx,dy]of HALO){c.strokeStyle=haloGrad(c,x+dx*r,y+dy*r,r*1.25,p.halo[i],al*a);stroke();}}
function body(c,x,y,r,o={}){const p=pal(o);c.save();c.translate(x,y);c.scale(o.sx??1,o.sy??1);
  const disc=f=>{c.fillStyle=f;c.beginPath();c.arc(0,0,r,0,TAU);c.fill();};
  disc(rad(c,-.1*r,-.15*r,1.1*r,[[0,p.nu],[1,p.base]]));
  for(const[col,dx,dy,rr]of[[p.bi,-.55,.55,1],[p.iz,-.75,-.1,.85],[p.ar,-.15,-.85,.9],[p.ad,.6,-.55,.95],[p.de,.72,.3,.88]])
    disc(rad(c,dx*r,dy*r,rr*r,[[0,rgba(col,1)],[.45,rgba(col,.72)],[1,rgba(col,0)]]));
  disc(rad(c,-.05*r,-.1*r,.55*r,[[0,rgba(p.nu,.6)],[1,rgba(p.nu,0)]]));
  disc(rad(c,-.1*r,-.42*r,1.45*r,[[.6,rgba(p.so,0)],[.84,rgba(p.so,.28)],[1,rgba(p.so,.7)]]));   // rim shade, heavier below
  disc(rad(c,0,0,r,[[.78,rgba(p.so,0)],[1,rgba(p.so,.22)]]));
  disc(rad(c,-.4*r,-.45*r,.6*r,[[0,'rgba(255,255,255,.22)'],[1,'rgba(255,255,255,0)']]));
  c.translate(-.39*r,-.47*r);c.rotate(-24*Math.PI/180);c.scale(.2*r,.125*r);c.fillStyle=rad(c,0,0,1,[[.55,'#fff'],[1,'rgba(255,255,255,0)']]);c.beginPath();c.arc(0,0,1,0,TAU);c.fill();   // the glint
  c.restore();}
// halo + sphere: the orb on its own (the dot travelling, the ball bouncing)
function ball(c,x,y,r,o={}){halo(c,x,y,r,{k:1.5,...o});body(c,x,y,r,o);}
// a ring in the orb's colours (impact ripples, outlines): a conic sweep through its five lights
function ring(c,x,y,o={}){const p=pal(o),g=c.createConicGradient(-Math.PI*0.75,x,y);[p.ar,p.ad,p.de,p.bi,p.iz,p.ar].forEach((s,i)=>g.addColorStop(i/5,s));return g;}
globalThis.GizeOrb={PAL,halo,tint,body,ball,ring,rgba};
})();
