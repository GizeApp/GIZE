/* =====================================================================
   GIZE motion kit — shared engine for every reel/teaser/ad.
   A piece is a pure function draw(ctx, t, L) of time; the harness adds
   sub-frame motion blur, bloom, lens CA, vignette, camera hits, the
   ?play preview, and a cue sheet (window.getCues) that lib/sound.py
   turns into the soundtrack. Formats: ?fmt=9x16 | 4x5 | 16x9.
   ===================================================================== */
import './orb.js';   // globalThis.GizeOrb: the logo's orb
export const C={bg:'#000000',surface:'#0B0D11',surface2:'#12151B',border:'#1C2029',text:'#FFFFFF',text2:'#8F98A6',
  blue:'#2FA0FF',blueDeep:'#0072BB',purple:'#A65CFF',pink:'#FF3DAE',teal:'#25E8C8',danger:'#FF4D4D',gold:'#FFC940',soft:'#C8CDD5'};
export const RGB={text:[255,255,255],text2:[143,152,166],blue:[47,160,255],purple:[166,92,255],pink:[255,61,174],teal:[37,232,200],gold:[255,201,64],surface:[11,13,17],danger:[255,77,77]};
export const GAMA=[RGB.blue,RGB.purple,RGB.pink,RGB.teal];
export const rgba=(a,al=1)=>`rgba(${a[0]|0},${a[1]|0},${a[2]|0},${al})`;
export const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export const F=(w,px)=>`${w} ${px}px Outfit, "Noto Color Emoji", sans-serif`;
export const PF=(w,px)=>`${w} ${px}px "Liberation Sans", Arial, sans-serif`;   // the generic "before" world

/* ---------------- math & easing ---------------- */
export const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const prog=(t,a,b)=>clamp((t-a)/(b-a));
export const E={
  inQuad:x=>x*x,outQuad:x=>1-(1-x)*(1-x),inCubic:x=>x*x*x,outCubic:x=>1-(1-x)**3,
  inOutCubic:x=>x<.5?4*x*x*x:1-(-2*x+2)**3/2,inOutSine:x=>(1-Math.cos(Math.PI*x))/2,inExpo:x=>x<=0?0:2**(10*x-10),outExpo:x=>x>=1?1:1-2**(-10*x),
  inOutExpo:x=>x<=0?0:x>=1?1:x<.5?2**(20*x-10)/2:(2-2**(-20*x+10))/2,
  outBack:x=>{const c1=1.70158,c3=c1+1;return 1+c3*(x-1)**3+c1*(x-1)**2},inBack:x=>{const c1=1.70158;return(c1+1)*x**3-c1*x*x},
};
export const spring=(dt,f=2.2,z=6)=>dt<=0?0:1-Math.exp(-z*dt)*Math.cos(2*Math.PI*f*dt);
export const wobble=(dt,f=3,z=8)=>dt<=0?0:Math.exp(-z*dt)*Math.sin(2*Math.PI*f*dt);
export const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453123;return s-Math.floor(s);};
export function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function keys(t,k){if(t<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++){if(t<k[i][0]){const a=k[i-1],b=k[i];return lerp(a[1],b[1],(t-a[0])/(b[0]-a[0]));}}return k[k.length-1][1];}
export function ekeys(t,k){if(t<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++){if(t<k[i][0]){const a=k[i-1],b=k[i];return lerp(a[1],b[1],E.inOutCubic((t-a[0])/(b[0]-a[0])));}}return k[k.length-1][1];}
export function gamaAt(u){u=clamp(u);const x=u*3,i=Math.min(2,Math.floor(x));return mixc(GAMA[i],GAMA[i+1],x-i);}
export const invIOC=y=>y<.5?Math.cbrt(y/4):1-Math.cbrt(2-2*y)/2;

/* ---------------- drawing helpers ---------------- */
export const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export const MC=mk(8,8).getContext('2d');
export function reset(c){c.globalAlpha=1;c.globalCompositeOperation='source-over';c.lineCap='butt';c.lineJoin='miter';c.setLineDash([]);c.lineDashOffset=0;c.textAlign='left';c.textBaseline='alphabetic';c.letterSpacing='0px';c.filter='none';c.shadowColor='transparent';c.shadowBlur=0;}
export function bg(c,col,L){c.fillStyle=col;c.fillRect(-800,-800,(L?.W||4000)+1600,(L?.H||4000)+1600);}
export function glow(c,x,y,r,rgb,a){if(a<=0.002||r<=0)return;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(rgb,a));g.addColorStop(1,rgba(rgb,0));c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
export function rgbLine(c,x0,y0,x1,y1){const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,C.blue);g.addColorStop(1/3,C.purple);g.addColorStop(2/3,C.pink);g.addColorStop(1,C.teal);return g;}
export function rgbRing(c,x,y,a0){const g=c.createConicGradient(a0,x,y);g.addColorStop(0,C.blue);g.addColorStop(.25,C.purple);g.addColorStop(.5,C.pink);g.addColorStop(.75,C.teal);g.addColorStop(1,C.blue);return g;}
export function rr(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
export function txt(c,s,x,y,w,px,col,al='left',ls=0){c.font=F(w,px);c.fillStyle=col;c.textAlign=al;if(ls)c.letterSpacing=ls+'px';c.fillText(s,x,y);if(ls)c.letterSpacing='0px';c.textAlign='left';}
export function tw(s,w,px,ls=0){MC.font=F(w,px);MC.letterSpacing=ls+'px';const v=MC.measureText(s).width;MC.letterSpacing='0px';return v;}
export function fitSize(s,w,maxW,start,min=20){let px=start;while(px>min&&tw(s,w,px)>maxW)px-=2;return px;}
export function tick(c,x,y,s,col,lw){c.strokeStyle=col;c.lineWidth=lw;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(x-0.42*s,y+0.02*s);c.lineTo(x-0.12*s,y+0.32*s);c.lineTo(x+0.45*s,y-0.3*s);c.stroke();c.lineCap='butt';c.lineJoin='miter';}
export function tap(c,x,y,t,t0){const u=t-t0;if(u<-0.06||u>0.45)return;const e=E.outCubic(clamp(u/0.45));c.fillStyle=`rgba(255,255,255,${0.35*(1-e)*(u<0?0:1)})`;c.beginPath();c.arc(x,y,10+30*e,0,7);c.fill();
  if(u<0.12){c.fillStyle='rgba(255,255,255,0.45)';c.beginPath();c.arc(x,y,16,0,7);c.fill();}}
export function playTri(c,x,y,s,col='#fff'){c.fillStyle=col;c.beginPath();c.moveTo(x,y-s);c.lineTo(x+s*1.4,y);c.lineTo(x,y+s);c.fill();}
// words rise out of a mask line by line (captions, headlines)
export function riseWords(c,{lines,x,y,lh,t0,t1=1e9,px,weight=800,col='#fff',align='center',stagger=0.045,key=null}){
  c.font=F(weight,px);let wi=0;lines.forEach((line,li)=>{const yy=y+li*lh,words=line.split(' '),sp=c.measureText(' ').width,lw=c.measureText(line).width;let xx=align==='center'?x-lw/2:x;
    c.save();c.beginPath();c.rect(-2000,yy-px*1.05,6000,px*1.45);c.clip();
    words.forEach((w,k)=>{const d=t0+wi*stagger,e=E.outExpo(prog(T_NOW,d,d+0.4)),o=E.inExpo(prog(T_NOW,t1+k*0.02,t1+0.22+k*0.02));c.fillStyle=col;c.fillText(w,xx,yy+(1-e)*px*1.2-o*px*1.6);xx+=c.measureText(w).width+sp;wi++;});c.restore();
    if(key&&key[0]===li){const kx=(align==='center'?x-lw/2:x)+c.measureText(line.slice(0,line.indexOf(key[1]))).width,kw=c.measureText(key[1].replace(/[.!?]$/,'')).width,ke=E.outExpo(prog(T_NOW,t0+0.3,t0+0.7))*(1-E.inCubic(prog(T_NOW,t1,t1+0.25)));
      if(ke>0){c.fillStyle=rgbLine(c,kx,0,kx+kw,0);c.fillRect(kx,yy+px*0.22,kw*ke,Math.max(4,px*0.08));}}});}
export let T_NOW=0;   // time of the sub-frame being drawn (for helpers above)

/* ---------------- formats & layout ---------------- */
export const FORMATS={
  '9x16':{W:1080,H:1920,safe:{top:250,bottom:1480,left:60,right:960}},   // Reels UI: top bar, caption & buttons
  '4x5': {W:1080,H:1350,safe:{top:70,bottom:1280,left:60,right:1020}},
  '16x9':{W:1920,H:1080,safe:{top:70,bottom:1010,left:90,right:1830}},
};
export function params(){const q=new URLSearchParams(location.search);return{fmt:q.get('fmt')||'9x16',hook:q.get('hook')||'a',cta:q.get('cta')||'hype',play:q.has('play'),alpha:q.get('alpha')==='1'};}
export function layout(fmt){const f=FORMATS[fmt]||FORMATS['9x16'];const s=f.safe;return{fmt,W:f.W,H:f.H,CX:f.W/2,CY:f.H/2,safe:s,
  sc:(s.top+s.bottom)/2,sh:s.bottom-s.top,sw:s.right-s.left,tall:f.H/f.W>1.5,wide:f.W>f.H};}

/* ---------------- brand logo: the G and the orb (brand/logo/gize-firma-horizontal.svg, lib/orb.js) ---------------- */
export const LOGO={};
export async function loadLogo(){
  const url=new URL('../../brand/logo/gize-firma-horizontal.svg',import.meta.url);
  const svg=new DOMParser().parseFromString(await (await fetch(url)).text(),'image/svg+xml').documentElement;
  const vb=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);LOGO.w=vb[2];LOGO.h=vb[3];
  const arc=svg.querySelector(':scope > path'),n=arc.getAttribute('d').match(/[-\d.]+/g).map(Number);
  const[x0,y0,r,,,fA,fS,x1,y1]=n,hx=(x0-x1)/2,hy=(y0-y1)/2,sg=fA!==fS?1:-1,co=sg*Math.sqrt(Math.max(0,(r*r*r*r-r*r*hy*hy-r*r*hx*hx)/(r*r*hy*hy+r*r*hx*hx)));
  const cx=co*hy+(x0+x1)/2,cy=-co*hx+(y0+y1)/2,a0=Math.atan2(y0-cy,x0-cx),a1=Math.atan2(y1-cy,x1-cx),sweep=((a1-a0)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  LOGO.arc={cx,cy,r,a0,a1,len:r*sweep,w:+arc.getAttribute('stroke-width'),path:new Path2D(arc.getAttribute('d'))};
  const ci=svg.querySelector('.o-esfera circle')||svg.querySelector('circle');LOGO.dot={x:+ci.getAttribute('cx'),y:+ci.getAttribute('cy'),r:+ci.getAttribute('r'),fill:C.blue};   // the orb's place
  const g=svg.querySelector('g[transform]'),m=g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)\s*scale\(([-\d.]+),([-\d.]+)\)/);
  LOGO.wm={tx:+m[1],ty:+m[2],sx:+m[3],sy:+m[4],letters:[...g.querySelectorAll('path')].map(p=>({p:new Path2D(p.getAttribute('d')),tx:+p.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]}))};
}
// the orb at (x,y) radius r in canvas units: halo, then (if given) the G's tint via strokeG, then the sphere.
// o: {pal, k (halo strength), light, sx, sy, halo:false, tint:false}
export const ORB_K=1.5;   // the reels' halo: a little more than the vector logo, like the original PNG
export function drawOrb(c,x,y,r,o={},strokeG=null){const q={k:ORB_K,...o};if(o.halo!==false)GizeOrb.halo(c,x,y,r,q);if(strokeG&&o.tint!==false)GizeOrb.tint(c,x,y,r,q,strokeG);GizeOrb.body(c,x,y,r,q);}
export const orbRing=(c,x,y,o)=>GizeOrb.ring(c,x,y,o);
// a dark G (a light ground) gets the paler halo
const darkInk=s=>{const m=/^#([0-9a-f]{6})$/i.exec(s);if(!m)return false;const v=parseInt(m[1],16);return 0.2126*(v>>16)+0.7152*((v>>8)&255)+0.0722*(v&255)<128;};
// o: {color, mono, arcP 0..1, dot:false|{x,y,sx,sy}, wordmark:false, symbol:false, dy:[per-letter, logo units],
//     orb:{pal,k,light,halo,tint} (how the orb is drawn; mono draws a flat dot in the logo's colour instead)}
export function drawFirma(c,x,y,k,o={}){
  const col=o.color||C.text,A=LOGO.arc,D=LOGO.dot;c.save();c.translate(x,y);c.scale(k,k);
  if(o.symbol!==false){const p=o.arcP??1,d=o.dot===false?null:typeof o.dot==='object'?o.dot:{x:D.x,y:D.y,sx:1,sy:1},orb=o.mono?null:{light:darkInk(col),...o.orb,sx:d?.sx??1,sy:d?.sy??1};
    const strokeG=()=>{if(p>=1)c.stroke(A.path);else if(p>0){c.setLineDash([A.len*p,A.len*2]);c.beginPath();c.arc(A.cx,A.cy,A.r,A.a1,A.a0,true);c.stroke();c.setLineDash([]);}};
    c.lineWidth=A.w;c.lineCap='round';
    if(d&&orb&&orb.halo!==false)GizeOrb.halo(c,d.x,d.y,D.r,{k:ORB_K,...orb});
    c.strokeStyle=col;strokeG();
    if(d&&orb){if(p>0&&orb.tint!==false)GizeOrb.tint(c,d.x,d.y,D.r,{k:ORB_K,...orb},strokeG);GizeOrb.body(c,d.x,d.y,D.r,orb);}
    else if(d){c.fillStyle=col;c.beginPath();c.ellipse(d.x,d.y,D.r*d.sx,D.r*d.sy,0,0,7);c.fill();}}
  if(o.wordmark!==false){const M=LOGO.wm;c.fillStyle=col;M.letters.forEach((Lt,i)=>{c.save();c.translate(0,o.dy?o.dy[i]:0);c.translate(M.tx,M.ty);c.scale(M.sx,M.sy);c.translate(Lt.tx,0);c.fill(Lt.p);c.restore();});}
  c.restore();
}
export function makeBall(yRest,y0,tDrop,tImp,e){
  const T=tImp-tDrop,g=2*(yRest-y0)/(T*T);const imp=[tImp],vim=[g*T];let v=g*T,tt=tImp;
  for(;;){v*=e;const Tb=2*v/g;if(Tb<0.016)break;tt+=Tb;imp.push(tt);vim.push(v);}
  return{yRest,imp,vim,rest:tt,
    phys(t){if(t<tImp){const u=Math.max(0,t-tDrop);return{y:y0+0.5*g*u*u,vy:g*u};}
      for(let k=0;k<imp.length-1;k++){if(t<imp[k+1]){const u=t-imp[k],vv=vim[k+1];return{y:yRest-(vv*u-0.5*g*u*u),vy:-(vv-g*u)};}}return{y:yRest,vy:0};},
    squash(t,w=0.024,amp=0.55){let s=0;for(let k=0;k<imp.length;k++){const d=(t-imp[k])/w;if(d>-3&&d<3)s+=Math.min(amp*0.92,amp*vim[k]/vim[0])*Math.exp(-d*d);}return s;}};
}

/* ---------------- harness ---------------- */
export function createReel(o){
  const P=params(),L=layout(P.fmt),FPS=o.fps||60,DUR=o.dur;
  const cv=document.getElementById('out');cv.width=L.W;cv.height=L.H;cv.style.aspectRatio=`${L.W}/${L.H}`;
  const ctx=cv.getContext('2d',{willReadFrequently:true});const W=L.W,H=L.H;
  // alpha mode (?alpha=1 or o.alpha): transparent frames for overlays: premultiplied blur, no CA / bloom / vignette
  const ALPHA=!!(o.alpha||P.alpha);const acc=new Float32Array(W*H*(ALPHA?4:3));let OUT=null;const BW=Math.round(W/4),BH=Math.round(H/4),BS=mk(BW,BH),bs=BS.getContext('2d',{willReadFrequently:true}),BS2=mk(BW,BH),bs2=BS2.getContext('2d');let BIMG=null;
  const hits=o.hits||[],fast=o.fast||[],XO=new Int16Array(W);
  const camFX=t=>{let x=0,y=0,s=1;for(const[ti,amp,p]of hits){const u=t-ti;if(u<0||u>0.7)continue;const at=1-Math.exp(-u*90),d=Math.exp(-u*9)*at;x+=amp*d*Math.sin(u*97+ti*13);y+=amp*d*Math.sin(u*83+ti*7+1.3);s+=p*Math.exp(-u*11)*at;}return{x,y,s};};
  const draw=(t)=>{T_NOW=t;ctx.setTransform(1,0,0,1,0,0);reset(ctx);if(ALPHA)ctx.clearRect(0,0,W,H);const fx=camFX(t);ctx.setTransform(fx.s,0,0,fx.s,L.CX*(1-fx.s)+fx.x,L.CY*(1-fx.s)+fx.y);o.draw(ctx,t,L,P);
    ctx.setTransform(1,0,0,1,0,0);reset(ctx);if(o.overlay)o.overlay(ctx,t,L,P);ctx.setTransform(1,0,0,1,0,0);reset(ctx);};
  const postAlpha=sub=>{const d0=OUT.data;for(let i=0,j=0;i<d0.length;i+=4,j+=4){const a=acc[j+3];if(a<=0){d0[i]=d0[i+1]=d0[i+2]=d0[i+3]=0;continue;}d0[i]=acc[j]/a;d0[i+1]=acc[j+1]/a;d0[i+2]=acc[j+2]/a;d0[i+3]=a/sub;}
    ctx.setTransform(1,0,0,1,0,0);reset(ctx);ctx.putImageData(OUT,0,0);};
  const post=(f,sub)=>{const t=f/FPS,inv=1/sub,d0=OUT.data;let ca=0.8;for(const[ti,amp]of hits){const u=t-ti;if(u>=0&&u<0.25)ca=Math.max(ca,amp*0.45*Math.exp(-u*14));}
    for(let x=0;x<W;x++)XO[x]=Math.round(ca*(x-L.CX)/L.CX);
    for(let y=0;y<H;y++){const rb=y*W;let oi=y*W*4;for(let x=0;x<W;x++,oi+=4){const d=XO[x];let xr=x-d,xb=x+d;xr=xr<0?0:xr>=W?W-1:xr;xb=xb<0?0:xb>=W?W-1:xb;
      d0[oi]=acc[(rb+xr)*3]*inv;d0[oi+1]=acc[(rb+x)*3+1]*inv;d0[oi+2]=acc[(rb+xb)*3+2]*inv;d0[oi+3]=255;}}
    ctx.setTransform(1,0,0,1,0,0);reset(ctx);ctx.putImageData(OUT,0,0);
    const amt=o.bloom?o.bloom(t):0.35;if(amt>0.01){const d=BIMG.data,thr=0.55*255;
      for(let by=0;by<BH;by++)for(let bx=0;bx<BW;bx++){let r=0,g=0,b=0;for(let sy=0;sy<4;sy+=2)for(let sx=0;sx<4;sx+=2){const i=((Math.min(H-1,by*4+sy+1))*W+Math.min(W-1,bx*4+sx+1))*4;r+=d0[i];g+=d0[i+1];b+=d0[i+2];}
        r/=4;g/=4;b/=4;const l=0.2126*r+0.7152*g+0.0722*b,k=l>thr?(l-thr)/(255-thr):0,j=(by*BW+bx)*4;d[j]=r*k;d[j+1]=g*k;d[j+2]=b*k;d[j+3]=255;}
      bs.putImageData(BIMG,0,0);ctx.save();ctx.globalCompositeOperation='lighter';ctx.imageSmoothingQuality='high';
      for(const[rad,a]of[[2,0.5],[7,0.45],[18,0.4]]){bs2.clearRect(0,0,BW,BH);bs2.filter=`blur(${rad}px)`;bs2.drawImage(BS,0,0);bs2.filter='none';ctx.globalAlpha=amt*a;ctx.drawImage(BS2,0,0,W,H);}ctx.restore();}
    const va=o.vignette?o.vignette(t):0.35,R=Math.hypot(W,H)/2,vg=ctx.createRadialGradient(L.CX,L.CY,R*0.45,L.CX,L.CY,R*1.05);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,`rgba(0,0,0,${va})`);ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);};
  const subsFor=t=>{for(const[a,b]of fast)if(t>=a&&t<=b)return 24;return 10;};
  window.REEL={W,H,FPS,DUR,fmt:P.fmt,hook:P.hook,cta:P.cta};
  window.renderFrame=(f,opt={})=>{const t=f/FPS,sub=opt.sub||subsFor(t),sh=0.5;acc.fill(0);
    for(let s=0;s<sub;s++){const ts=Math.max(0,(f+(sub===1?0:((s+0.5)/sub-0.5)*sh))/FPS);draw(ts);
      const d=ctx.getImageData(0,0,W,H).data;if(ALPHA){for(let i=0;i<d.length;i+=4){const a=d[i+3];acc[i]+=d[i]*a;acc[i+1]+=d[i+1]*a;acc[i+2]+=d[i+2]*a;acc[i+3]+=a;}}
      else for(let i=0,j=0;i<d.length;i+=4,j+=3){acc[j]+=d[i];acc[j+1]+=d[i+1];acc[j+2]+=d[i+2];}}
    if(ALPHA)postAlpha(sub);else post(f,sub);return cv.toDataURL('image/png');};
  window.getCues=()=>({dur:DUR,cues:(typeof o.cues==='function'?o.cues(L,P):o.cues)||[]});
  window.READY=false;
  (async()=>{await Promise.all([400,500,600,700,800,900].map(w=>document.fonts.load(F(w,100))));await loadLogo();if(o.init)await o.init(L,P);
    OUT=ctx.createImageData(W,H);BIMG=bs.createImageData(BW,BH);window.READY=true;
    if(P.play){let t0=performance.now();document.body.addEventListener('click',()=>{t0=performance.now();});const loop=()=>{draw(((performance.now()-t0)/1000)%DUR);requestAnimationFrame(loop);};loop();}})();
  return{L,P,ctx};
}
