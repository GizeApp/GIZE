/* Shared bits for the trend reels (trends/*.html): wrapped text, a layout scale per format, confetti. */
import {E,clamp,prog,hash,F} from '../lib/engine.js';

// k scales type and cards so 4:5 keeps the same composition as 9:16
export const kOf=L=>L.fmt==='4x5'?0.86:1;
export function wrap(c,s,maxW,w,px){c.font=F(w,px);const out=[];let cur='';for(const word of s.split(' ')){const t=cur?cur+' '+word:word;if(c.measureText(t).width>maxW&&cur){out.push(cur);cur=word;}else cur=t;}if(cur)out.push(cur);return out;}
// draw wrapped lines centred on x, first baseline at y
export function lines(c,s,x,y,maxW,w,px,col,lh=1.12,align='center'){const L=wrap(c,s,maxW,w,px);c.font=F(w,px);c.fillStyle=col;c.textAlign=align;L.forEach((l,i)=>c.fillText(l,x,y+i*px*lh));c.textAlign='left';return L.length;}
const CONF=['#2FA0FF','#A65CFF','#FF3DAE','#25E8C8','#FFFFFF','#FFC940'];
// a burst of paper from (x,y): flies up and out, tumbles, falls
export function confetti(c,t,t0,x,y,{n=90,spread=1,dur=2.2}={}){const u=t-t0;if(u<0||u>dur)return;
  for(let i=0;i<n;i++){const a=-Math.PI/2+(hash(i)-0.5)*2.4,v=(700+900*hash(i+11))*spread,g=1500,px=x+Math.cos(a)*v*u*0.9,py=y+Math.sin(a)*v*u+0.5*g*u*u,r=u*(4+8*hash(i+3))+i;
    const al=1-clamp((u-dur*0.65)/(dur*0.35));c.save();c.globalAlpha=al;c.translate(px,py);c.rotate(r);c.scale(1,Math.cos(u*(6+6*hash(i+5))));c.fillStyle=CONF[i%CONF.length];c.fillRect(-9,-5,18,10);c.restore();}}
export const pop=(t,t0,d=0.35)=>E.outBack(clamp((t-t0)/d));
