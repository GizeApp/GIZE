/* "CHAU ___" series skeleton (15 s, 128 BPM, loops):
     hook A (problem first): 0–1.9 the mess + the question · 1.9 stamp "CHAU <WORD>" · 2.8 drop
     hook B (result first):  0–1.2 the payoff + a claim · 1.2–1.6 rewind · 1.6 the mess · 1.9 stamp
   then the GIZE side (2.8–11.25) and the end card (11.25–15), tiles flip back to frame 0. */
import {C,RGB,E,clamp,lerp,prog,rgbLine,rr,txt,tw,F,PF,hash,drawFirma,LOGO,riseWords} from './engine.js';
import {phonePoint} from './ui.js';

export const BT=60/128,T_STAMP=4*BT,T_DROP=6*BT,T_PAY=18*BT,T_OUT=24*BT,T_LOOP=14.42,DUR=15;
export const B_RESULT=1.2,B_REWIND=1.62;   // hook B: result until 1.2 s, rewind until 1.62 s

// the question in black boxes, word by word
export function questionBoxes(c,t,L,{lines,times,px}){px=px||(L.fmt==='9x16'?86:74);c.font=F(800,px);const sp=c.measureText(' ').width,lh=px*1.3;let wi=0;
  const y0=L.CY-((lines.length-1)*lh)/2+(L.fmt==='9x16'?-100:0);
  lines.forEach((line,li)=>{const y=y0+li*lh,shown=line.map(w=>[w,times[wi++]]),vis=shown.filter(([,t0])=>t>=t0);if(!vis.length)return;
    const fw=c.measureText(line.join(' ')).width;let cur=0;vis.forEach(([w],k)=>{cur+=c.measureText(w).width+(k?sp:0);});
    const t0=shown[0][1],grow=E.outExpo(prog(t,t0,t0+0.2)),x0=L.CX-(fw+px*0.6)/2;
    c.fillStyle='#000';rr(c,x0,y-px*0.93,(cur+px*0.6)*lerp(0.6,1,grow),px*1.21,px*0.21);c.fill();let x=x0+px*0.3;
    shown.forEach(([w,tw0],k)=>{if(k)x+=sp;const e=E.outBack(prog(t,tw0,tw0+0.22));if(e>0){c.save();c.translate(x,y+14*(1-e));c.globalAlpha=clamp(e*2);c.fillStyle='#fff';c.fillText(w,0,0);c.restore();}x+=c.measureText(w).width;});});}

// the stamp: darken, red diagonal strike, CHAU / <WORD> struck, episode pill, small signature
function fitW(s,w,maxW,start){let px=start;while(px>40&&tw(s,w,px)>maxW)px-=4;return px;}
export function stampTitle(c,t,L,{word,ep,topic}){const u=t-T_STAMP;if(u<0)return;const ex=E.inExpo(prog(t,T_DROP,T_DROP+0.3));
  c.fillStyle=`rgba(0,0,0,${0.74*E.outCubic(clamp(u/0.1))*(1-prog(t,T_DROP,T_DROP+0.3))})`;c.fillRect(-200,-200,L.W+400,L.H+400);
  const se=E.outCubic(clamp(u/0.09));if(se>0&&ex<1){c.save();c.globalAlpha=1-ex;c.strokeStyle=C.danger;c.lineWidth=36;c.lineCap='round';c.beginPath();c.moveTo(-120,L.H*0.85);c.lineTo(lerp(-120,L.W+120,se),lerp(L.H*0.85,L.H*0.16,se));c.stroke();c.restore();}
  const hold=1+0.03*prog(t,T_STAMP+0.25,T_DROP),cS=fitW('CHAU',900,Math.min(820,L.W*0.76),L.fmt==='9x16'?320:270),wS=fitW(word,900,Math.min(940,L.W*0.87),200);
  const yC=L.CY-(L.fmt==='9x16'?100:60);
  {const e=E.outBack(prog(t,T_STAMP+0.03,T_STAMP+0.25)),s=lerp(1.9,1,e)*hold,w=tw('CHAU',900,cS);c.save();c.translate(L.CX,yC);c.scale(s,s);c.rotate(-0.06*(1-e));c.globalAlpha=clamp(e*3);c.font=F(900,cS);c.fillStyle='#fff';
    let x=-w/2;for(let i=0;i<4;i++){const cw=c.measureText('CHAU'[i]).width;c.save();c.translate(x+cw/2+ex*(i-1.5)*420,-ex*(700+i*90));c.rotate(ex*(i-1.5)*0.6);c.fillText('CHAU'[i],-cw/2,0);c.restore();x+=cw;}c.restore();}
  const e=E.outExpo(prog(t,T_STAMP+0.08,T_STAMP+0.4)),w=tw(word,900,wS),y=yC+wS*0.72+60;
  c.save();c.translate(L.CX,y+60*(1-e));c.scale(hold,hold);c.globalAlpha=clamp(e*2);c.font=F(900,wS);c.fillStyle='#C9CDD3';
  let x=-w/2;for(let i=0;i<word.length;i++){const cw=c.measureText(word[i]).width;c.save();c.translate(x+cw/2+ex*(i-word.length/2)*140,ex*(600+hash(i)*500));c.rotate(ex*(hash(i+3)-0.5)*2);c.fillText(word[i],-cw/2,0);c.restore();x+=cw;}
  const le=E.outCubic(prog(t,T_STAMP+0.2,T_STAMP+0.32))*(1-ex);if(le>0){c.strokeStyle=C.danger;c.lineWidth=Math.max(14,wS*0.1);c.lineCap='round';c.beginPath();c.moveTo(-w/2-20,-wS*0.36);c.lineTo(-w/2-20+(w+40)*le,-wS*0.36);c.stroke();}
  c.restore();
  const pe=E.outBack(prog(t,T_STAMP+0.3,T_STAMP+0.55))*(1-ex);if(pe>0){const s=`EP. ${ep} · ${topic}`,pw=tw(s,700,30,5)+64,py=y+100;c.save();c.translate(L.CX,py);c.scale(pe,pe);
    c.strokeStyle='#fff';c.lineWidth=3;rr(c,-pw/2,-34,pw,68,34);c.stroke();txt(c,s,0,11,700,30,'#fff','center',5);c.restore();
    const fa=E.outCubic(prog(t,T_STAMP+0.4,T_STAMP+0.6))*(1-ex),k=0.62;c.save();c.globalAlpha=fa;drawFirma(c,L.CX-LOGO.w*k/2,py+70+16*(1-fa),k);c.restore();}}

// captions on a solid band at the top of the safe area
export function captionBand(c,t,L,caps){for(const cp of caps){if(t<cp.t0-0.05||t>cp.t1+0.3)continue;const inn=prog(t,cp.t0,cp.t0+0.3),out=E.inCubic(prog(t,cp.t1,cp.t1+0.25)),a=E.outCubic(inn)*(1-out);
    const top=L.safe.top,px=L.fmt==='9x16'?72:62,y=top+px+(L.fmt==='9x16'?0:10),h=y+px*1.3*cp.lines.length+60;
    const g=c.createLinearGradient(0,0,0,h+80);g.addColorStop(0,`rgba(0,0,0,${0.94*a})`);g.addColorStop(0.75,`rgba(0,0,0,${0.9*a})`);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,L.W,h+80);
    riseWords(c,{lines:cp.lines,x:L.CX,y,lh:px*1.22,t0:cp.t0,t1:cp.t1,px,key:cp.key});}}

// hook B: "rewind" streaks from the result back to the mess
export function rewindFX(c,t,L,a0=B_RESULT,a1=B_REWIND){if(t<a0||t>a1)return;const u=prog(t,a0,a1),k=Math.sin(Math.PI*u);
  c.save();for(let i=0;i<26;i++){const y=(hash(i+Math.floor(t*40))*L.H)|0,h=2+hash(i+9)*10;c.fillStyle=`rgba(255,255,255,${0.35*k*hash(i+3)})`;c.fillRect(0,y,L.W,h);}
  c.fillStyle=`rgba(0,0,0,${0.35*k})`;c.fillRect(0,0,L.W,L.H);
  const px=L.fmt==='9x16'?64:56;c.globalAlpha=k;txt(c,'◀◀',L.CX,L.CY-px*0.9,800,px,'#fff','center');txt(c,'¿Cómo llegó acá?',L.CX,L.CY+px*0.4,800,px,'#fff','center');c.restore();}

// seamless loop: tiles flip back to the frame-0 world
export function loopWipe(c,t,L,draw0){if(t<T_LOOP)return;const n=L.W>L.H?16:9,m=Math.ceil(L.H/(L.W/n)),s=L.W/n,tiles=[];
  for(let j=0;j<m;j++)for(let i=0;i<n;i++){const st=T_LOOP+((i/(n-1))*0.45+(j/(m-1))*0.55)*0.36,e=E.outCubic(prog(t,st,st+0.18));if(e>0)tiles.push([i*s,j*s,e]);}
  if(!tiles.length)return;c.save();c.beginPath();for(const[x,y,e]of tiles){const h=s*e;c.rect(x,y+s/2-h/2,s+1,h);}c.clip();draw0(c,L);c.restore();}

// the morph: chunks of the mess fly into the phone and land on their UI targets
// chunk = {from:[x,y,w,h] (screen), text, red, to:[x,y,w,h] (logical phone) | null}
export function flyChunks(c,t,chunks,P,{t0=T_DROP+0.1,stagger=0.032,dur=0.5,font=PF,fromRot=0}={}){
  chunks.forEach((ch,i)=>{const s=t0+i*stagger,u=prog(t,s,s+dur);if(t<s||u>=1)return;const e=E.inOutCubic(u);const[fx,fy,fw,fh]=ch.from;const s0={x:fx+fw/2,y:fy+fh/2,w:fw,h:fh};let s1;
    if(ch.to){const p0=phonePoint(P,ch.to[0],ch.to[1]),p1=phonePoint(P,ch.to[0]+ch.to[2],ch.to[1]+ch.to[3]);s1={x:(p0[0]+p1[0])/2,y:(p0[1]+p1[1])/2,w:ch.to[2]*P.s*(P.sx??1),h:ch.to[3]*P.s};}
    else s1={x:s0.x+700,y:s0.y-900,w:s0.w*0.4,h:s0.h*0.4};
    const cx=lerp(s0.x,s1.x,e)+Math.sin(u*Math.PI)*(i%2?160:-160),cy=lerp(s0.y,s1.y,e)-Math.sin(u*Math.PI)*120,w=lerp(s0.w,s1.w,e),h=lerp(s0.h,s1.h,e),rot=Math.sin(u*Math.PI)*(hash(i)-0.5)*1.2+(1-e)*fromRot+e*(P.rot||0);
    const col=[lerp(255,11,E.inOutCubic(clamp(u*1.4))),lerp(255,13,E.inOutCubic(clamp(u*1.4))),lerp(255,17,E.inOutCubic(clamp(u*1.4)))];
    c.save();c.translate(cx,cy);c.rotate(rot);c.fillStyle=`rgb(${col[0]|0},${col[1]|0},${col[2]|0})`;c.fillRect(-w/2,-h/2,w,h);c.strokeStyle=`rgb(${lerp(200,47,e)|0},${lerp(204,160,e)|0},${lerp(210,255,e)|0})`;c.lineWidth=2;c.strokeRect(-w/2,-h/2,w,h);
    if(ch.text&&u<0.55){c.globalAlpha=1-u/0.55;c.font=font(400,Math.max(12,Math.min(28,h*0.45)));c.fillStyle=ch.red?'#C93C3C':'#3F444C';c.fillText(ch.text,-w/2+12,h*0.16);}c.restore();
    if(u>0.85&&ch.to){c.save();c.globalAlpha=(u-0.85)/0.15;const g=c.createRadialGradient(s1.x,s1.y,0,s1.x,s1.y,Math.max(w,h)*0.8);g.addColorStop(0,'rgba(47,160,255,0.35)');g.addColorStop(1,'rgba(47,160,255,0)');c.fillStyle=g;c.fillRect(s1.x-w,s1.y-w,2*w,2*w);c.restore();}});}
export const landTime=(i,t0=T_DROP+0.1,stagger=0.032,dur=0.5)=>t0+i*stagger+dur;

// standard phone choreography: rises in at the drop, pushes in for detail, pulls back
export function phoneRise(t,L,{push=[4.55,5.0],pull=[7.95,8.35],anchorY=600,base=null}={}){
  const b=base||(L.fmt==='9x16'?{y:1085,s:1.6,py:1090,ps:2.3}:{y:L.CY+60,s:1.18,py:L.CY+130,ps:1.75});
  const e=E.outExpo(prog(t,T_DROP,T_DROP+0.62));let y=lerp(L.H+900,b.y,e),rot=0.35*(1-e),sx=lerp(0.5,1,e);
  const p=E.inOutCubic(prog(t,push[0],push[1]))*(1-E.inOutCubic(prog(t,pull[0],pull[1])));
  return{x:L.CX,y:lerp(y,b.py,p),s:lerp(b.s,b.ps,p),rot,sx,ax:195,ay:lerp(422,anchorY,p),dim:0,alpha:t<T_DROP?0:1};}
