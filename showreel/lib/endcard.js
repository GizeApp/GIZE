/* The GIZE end card, shared by every piece: RGB rule, wordmark rising from
   behind it, the G drawn like a pen stroke, the blue dot dropping in as the
   G's dot, then the call to action for the current phase:
     cta=hype   "Muy pronto" · "para iPhone y Android" · [Seguí @gize.app]
     cta=launch "Ya está disponible" · "en App Store y Google Play" · [Descargala gratis]
     cta=trial  "Probalo 14 días gratis" · "sin tarjeta" · [Link en la bio]          */
import {C,RGB,E,clamp,lerp,prog,glow,rgbLine,rgbRing,rr,txt,tw,fitSize,drawFirma,makeBall,wobble,LOGO,F} from './engine.js';

export const CTA={
  hype:{big:'Muy pronto',small:'para iPhone y Android',pill:'Seguí @gize.app'},
  launch:{big:'Ya está disponible',small:'en App Store y Google Play',pill:'Descargala gratis'},
  trial:{big:'Probalo 14 días gratis',small:'sin tarjeta',pill:'Link en la bio'},
};
const LAND=0.9375;   // dot lands two beats (128 BPM) after the card starts

export function endcardGeom(L){const k=L.fmt==='4x5'?1.85:L.fmt==='16x9'?1.75:2.3;const fw=LOGO.w*k,fh=LOGO.h*k;
  const blockH=fh+26+(L.fmt==='16x9'?300:330);const top=L.sc-blockH/2+(L.fmt==='9x16'?30:0);
  const x=L.CX-fw/2,y=top,line=y+fh+26;return{k,x,y,line,fw,dotX:x+LOGO.dot.x*k,dotY:y+LOGO.dot.y*k,dotR:LOGO.dot.r*k};}

export function endcardBall(L,t0,y0=-160){const g=endcardGeom(L);return makeBall(g.dotY,y0,t0+LAND-0.39,t0+LAND,0.3);}
export const ENDCARD_LAND=LAND;

// dot: 'drop' (falls from dropY0) | 'static' | 'none' ; arc: 'draw' (pen stroke) | 'static'
export function endcard(c,t,t0,L,{cta='hype',rule='full',dot='drop',arc='draw',dropY0=-160}={}){
  if(t<t0-0.02)return;const g=endcardGeom(L),K=g.k,T=CTA[cta]||CTA.hype,bl=endcardBall(L,t0,dropY0);
  const re=E.outExpo(prog(t,t0,t0+0.5));let x1,x2;
  if(rule==='full'){x1=lerp(-80,g.x-30,re);x2=lerp(L.W+80,g.x+g.fw+30,re);}else{const m=L.CX,h=(g.fw/2+30)*re;x1=m-h;x2=m+h;}
  c.fillStyle=rgbLine(c,x1,0,x2,0);c.fillRect(x1,g.line-2,x2-x1,4);
  const dy=LOGO.wm.letters.map((Lt,i)=>{const s=t0+0.05+i*0.06,e=E.outExpo(prog(t,s,s+0.7));const lx=g.x+(LOGO.wm.tx+(Lt.tx+180)*LOGO.wm.sx)*K,dd=Math.abs(lx-g.dotX);
    const rec=bl.imp.reduce((a,ti,q)=>a+5*(bl.vim[q]/bl.vim[0])*Math.exp(-dd/500)*wobble(t-ti-dd/2600,3.2,9),0);return(1-e)*110+rec/K;});
  c.save();c.beginPath();c.rect(-100,-100,L.W+200,g.line-3+100);c.clip();drawFirma(c,g.x,g.y,K,{symbol:false,dy});c.restore();
  const ap=arc==='static'?1:E.inOutCubic(prog(t,t0+0.1,t0+0.6));let dd=false;
  if(dot==='static')dd=undefined;
  else if(dot==='drop'&&t>=t0+LAND-0.39){const ph=bl.phys(t),sq=bl.squash(t),st=Math.min(0.5,0.5*Math.abs(ph.vy)/bl.vim[0])*Math.max(0,1-sq*4),sy=(1-sq)*(1+st),sx=1/Math.sqrt(sy),r=g.dotR;
    let y=ph.y+r*(1-sy);y=Math.min(y,bl.yRest+r-r*sy);dd={x:LOGO.dot.x,y:(y-g.y)/K,sx,sy};}
  drawFirma(c,g.x,g.y,K,{wordmark:false,arcP:ap,dot:dd});
  if(dot==='drop')for(let q=0;q<bl.imp.length;q++){const v=t-bl.imp[q];if(v<0||v>0.7)continue;const e=E.outCubic(v/0.7),s=bl.vim[q]/bl.vim[0];c.strokeStyle=C.blue;c.lineWidth=3;c.globalAlpha=(1-e)*0.9*s;c.beginPath();c.arc(g.dotX,bl.yRest,g.dotR+10+170*e*s,0,7);c.stroke();}c.globalAlpha=1;
  const bigPx=fitSize(T.big,800,Math.min(900,L.sw*0.92),L.fmt==='16x9'?92:96);
  c.save();c.beginPath();c.rect(-100,g.line+3,L.W+200,L.H);c.clip();c.textAlign='center';
  const ce=E.outExpo(prog(t,t0+1.0,t0+1.55));c.font=F(800,bigPx);c.fillStyle='#fff';c.fillText(T.big,L.CX,g.line+bigPx+18-(1-ce)*(bigPx+140));
  c.restore();
  // the small line rises from below in its own lane, so it never crosses the big one
  const se=E.outExpo(prog(t,t0+1.15,t0+1.65));if(se>0){c.save();c.beginPath();c.rect(-100,g.line+bigPx+36,L.W+200,80);c.clip();c.textAlign='center';c.font=F(400,40);c.fillStyle=C.soft;c.fillText(T.small,L.CX,g.line+bigPx+78+(1-se)*70);c.restore();}
  const be=E.outBack(prog(t,t0+1.3,t0+1.7)),bp=E.inOutCubic(prog(t,t0+1.3,t0+1.9));
  if(be>0){const bw=tw(T.pill,700,34)+110,bh=84,by=g.line+bigPx+190;c.save();c.translate(L.CX,by);const s=lerp(0.85,1,be);c.scale(s,s);c.globalAlpha=clamp(be*1.5);
    const per=2*(bw-bh)+Math.PI*bh;c.fillStyle='#fff';rr(c,-bw/2,-bh/2,bw,bh,bh/2);c.fill();c.strokeStyle=rgbRing(c,0,0,t*Math.PI*2/5);c.lineWidth=4;c.setLineDash([per*bp,per]);rr(c,-bw/2-3,-bh/2-3,bw+6,bh+6,bh/2+3);c.stroke();c.setLineDash([]);
    txt(c,T.pill,0,12,700,34,'#000','center');c.restore();}
}
export function endcardBg(c,t,t0,L,a=1){c.fillStyle='#000';c.globalAlpha=a;c.fillRect(-800,-800,L.W+1600,L.H+1600);
  [[0.2,0.3],[0.8,0.25],[0.75,0.75],[0.25,0.8]].forEach(([px,py],i)=>glow(c,L.W*(px+0.05*Math.sin(t*0.6+i)),L.H*(py+0.03*Math.cos(t*0.5+i)),Math.max(L.W,L.H)*0.38,[RGB.blue,RGB.purple,RGB.pink,RGB.teal][i],0.18*E.outCubic(prog(t,t0,t0+0.8))));c.globalAlpha=1;}
// the sounds the card makes (see lib/sound.py)
export function endcardCues(L,t0,{dot='drop',arc='draw',dropY0=-160}={}){const bl=endcardBall(L,t0,dropY0);const cues=[...(arc==='draw'?[{t:t0+0.06,s:'pen'}]:[]),{t:t0+1.02,s:'whoosh',d:0.3,f0:600,f1:3000,g:0.15},{t:t0+1.3,s:'pop'},{t:t0+1.3,s:'shimmer'}];
  if(dot==='drop'){if(dropY0<0)cues.push({t:t0+LAND-0.39,s:'whistle',d:0.39});bl.imp.forEach((ti,k)=>cues.push({t:ti,s:'bloop',k,v:bl.vim[k]/bl.vim[0]}));}
  return cues;}
export const ENDCARD_SETTLE=2.1;   // seconds until the card is fully built
