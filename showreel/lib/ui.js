/* GIZE app UI kit for motion pieces: a generic phone and the real app screens,
   rebuilt from app/screens + css (layouts, copy, colors), in logical 390x844.
   Screens are pure functions of time driven by a small "script" object. */
import {C,RGB,E,clamp,lerp,prog,glow,rgbLine,rgbRing,rr,txt,tw,tick,tap,playTri,hash,wobble,drawFirma,F} from './engine.js';

export const PW=390,PH=844;
export function withPhone(c,P,fn){c.save();c.translate(P.x,P.y);c.rotate(P.rot||0);c.scale(P.s*(P.sx??1),P.s);c.translate(-(P.ax??195),-(P.ay??422));fn();c.restore();}
export function phonePoint(P,x,y){const dx=(x-(P.ax??195))*P.s*(P.sx??1),dy=(y-(P.ay??422))*P.s,cs=Math.cos(P.rot||0),sn=Math.sin(P.rot||0);return[P.x+dx*cs-dy*sn,P.y+dx*sn+dy*cs];}
export function device(c,P,screenFn,t){if((P.alpha??1)<=0)return;c.save();c.globalAlpha=P.alpha??1;
  const g=phonePoint(P,195,422);glow(c,g[0],g[1],520*P.s/1.4,RGB.blue,0.16*(P.alpha??1));
  withPhone(c,P,()=>{c.fillStyle='#0D1015';rr(c,-15,-15,PW+30,PH+30,64);c.fill();c.strokeStyle='#2B303B';c.lineWidth=2;c.stroke();
    c.fillStyle='#1B1F27';c.fillRect(PW+15,150,4,70);c.fillRect(-19,130,4,44);c.fillRect(-19,190,4,70);
    c.save();rr(c,0,0,PW,PH,50);c.clip();screenFn(c,t);c.fillStyle='#000';c.beginPath();c.arc(195,20,7,0,7);c.fill();
    if(P.dim>0){c.fillStyle=`rgba(0,0,0,${P.dim})`;c.fillRect(0,0,PW,PH);}c.restore();});
  c.restore();}
export function statusBar(c,time='18:42',col='#fff'){txt(c,time,30,31,600,15,col);c.fillStyle=col;for(let i=0;i<4;i++)c.fillRect(300+i*6,26-i*3,4,5+i*3);
  c.strokeStyle=col;c.lineWidth=1.5;rr(c,332,17,26,13,4);c.stroke();c.fillRect(335,20,17,7);c.fillRect(359,21,2,5);}
export function appBg(c){c.fillStyle='#000';c.fillRect(0,0,PW,PH);glow(c,-30,90,430,RGB.blue,0.40);glow(c,420,820,440,RGB.pink,0.34);}
export function ringRect(c,x,y,w,h,r,lw=1.5,a0=0){c.strokeStyle=rgbRing(c,x+w/2,y+h/2,a0);c.lineWidth=lw;rr(c,x,y,w,h,r);c.stroke();}
export function navIcon(c,k,x,y,col){c.strokeStyle=col;c.fillStyle=col;c.lineWidth=1.8;c.lineCap='round';c.lineJoin='round';c.beginPath();
  if(k===0){c.moveTo(x-8,y);c.lineTo(x+8,y);c.stroke();c.fillRect(x-11,y-6,3,12);c.fillRect(x+8,y-6,3,12);c.fillRect(x-14,y-3,2,6);c.fillRect(x+12,y-3,2,6);}
  else if(k===1){c.roundRect(x-9,y-9,18,18,4);c.stroke();tick(c,x,y,13,col,1.8);}
  else if(k===2){c.arc(x,y+1,9,0,7);c.stroke();c.beginPath();c.moveTo(x,y+1);c.lineTo(x+4,y-3);c.moveTo(x-3,y-11);c.lineTo(x+3,y-11);c.stroke();}
  else if(k===3){c.arc(x-3.5,y+2,6.5,Math.PI*0.6,Math.PI*1.9);c.arc(x+3.5,y+2,6.5,Math.PI*1.1,Math.PI*0.4);c.closePath();c.stroke();c.beginPath();c.moveTo(x,y-5);c.quadraticCurveTo(x+2,y-10,x+6,y-11);c.stroke();}
  else if(k===4){c.moveTo(x-10,y+8);c.lineTo(x-4,y+1);c.lineTo(x+1,y+5);c.lineTo(x+10,y-7);c.stroke();}
  else{c.arc(x,y,4,0,7);c.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;c.beginPath();c.moveTo(x+Math.cos(a)*6.5,y+Math.sin(a)*6.5);c.lineTo(x+Math.cos(a)*9.5,y+Math.sin(a)*9.5);c.stroke();}}
  c.lineCap='butt';c.lineJoin='miter';}
export const TABS=['Entreno','Hábitos','Cardio','Comida','Progreso','Ajustes'];
export function bottomNav(c,active=0){c.fillStyle='rgba(6,9,17,0.92)';c.fillRect(0,772,PW,72);c.fillStyle=C.border;c.fillRect(0,772,PW,1);
  TABS.forEach((l,i)=>{const x=32.5+i*65,on=i===active,col=on?'#fff':C.text2;navIcon(c,i,x,796,col);txt(c,l,x,826,600,11,col,'center');if(on){c.fillStyle=C.blue;c.fillRect(x-13,776,26,2);}});}
export function appHeader(c,{coach='Martina',streak=5}={}){statusBar(c);drawFirma(c,18,54,0.34,{wordmark:false});
  if(coach){txt(c,coach,292,74,700,14,'#fff','right');txt(c,'TU COACH',292,88,700,9.5,C.text2,'right',1.2);
    c.fillStyle=C.surface2;c.beginPath();c.arc(318,76,18,0,7);c.fill();c.strokeStyle=rgbRing(c,318,76,0);c.lineWidth=2;c.stroke();c.strokeStyle='#fff';c.lineWidth=1.6;rr(c,310,69,16,12,4);c.stroke();}
  c.fillStyle=C.surface2;rr(c,342,62,40,28,14);c.fill();txt(c,`🔥${streak}`,362,81,700,13,'#fff','center');}
export function exRow(c,y,n,name,right,a=1,ring=0){c.save();c.globalAlpha*=a;c.fillStyle=C.surface;rr(c,16,y,358,52,4);c.fill();ringRect(c,16,y,358,52,4,1.5,ring);
  c.fillStyle=C.surface2;rr(c,28,y+15,22,22,6);c.fill();txt(c,String(n),39,y+31,700,12,'#fff','center');
  c.font=F(700,14);let nm=name;while(c.measureText(nm).width>196)nm=nm.slice(0,-2)+'…';txt(c,nm,60,y+31,700,14,'#fff');
  txt(c,right,350,y+31,600,12,C.text2,'right');c.strokeStyle=C.text2;c.lineWidth=1.6;c.beginPath();c.moveTo(356,y+23);c.lineTo(360,y+28);c.lineTo(364,y+23);c.stroke();c.restore();}
export const valAt=(arr,t)=>{let v='';for(const[t0,s]of arr||[])if(t>=t0)v=s;return v;};
export function prChip(c,x,y,t,t0,label='🏆 PR +2,5 kg'){const u=t-t0;if(u<0||u>1.9)return;const pop=E.outBack(clamp(u/0.25)),out=1-E.inCubic(prog(u,1.6,1.9));
  const sw=prog(u,0,0.45);if(sw>0&&sw<1){const g=c.createLinearGradient(28+sw*420-80,0,28+sw*420+80,0);g.addColorStop(0,'rgba(255,201,64,0)');g.addColorStop(0.5,'rgba(255,201,64,0.45)');g.addColorStop(1,'rgba(255,201,64,0)');c.fillStyle=g;c.fillRect(28,y+8,334,44);}
  c.save();c.globalAlpha*=out;c.translate(x,y);c.scale(pop,pop);c.fillStyle=C.gold;rr(c,-64,-15,128,30,15);c.fill();txt(c,label,0,6,800,13,'#000','center');c.restore();
  for(let i=0;i<16;i++){const a=hash(i)*Math.PI*2,sp=40+hash(i+7)*90,e=E.outCubic(prog(u,0,0.6)),xx=x+Math.cos(a)*sp*e,yy=y+Math.sin(a)*sp*e;c.fillStyle=`rgba(255,201,64,${(1-e)*out})`;c.fillRect(xx-2,yy-2,4,4);}}
export function restBar(c,t,s,end,hide){const a=E.outExpo(prog(t,s,s+0.25))*(1-E.inCubic(prog(t,hide,hide+0.18)));if(a<=0)return;const y=714+40*(1-a);
  c.save();c.globalAlpha=a;glow(c,195,y+25,190,RGB.blue,0.22);c.fillStyle=C.surface2;rr(c,12,y,366,50,4);c.fill();c.strokeStyle=C.blue;c.lineWidth=1;c.stroke();
  const rem=120*(1-prog(t,s+0.02,end));
  if(t<end){txt(c,'DESCANSO',26,y+30,700,11,C.text2,'left',1);const r=Math.ceil(rem);txt(c,`${Math.floor(r/60)}:${String(r%60).padStart(2,'0')}`,112,y+33,800,20,'#fff');
    txt(c,'×',360,y+32,400,20,C.text2,'right');c.fillStyle=C.blueDeep;c.fillRect(13,y+46,364*(1-rem/120),3);}
  else{txt(c,'¡Descanso terminado! 💪',26,y+31,800,15,'#fff');txt(c,'Cerrar',360,y+31,700,13,C.blue,'right');c.fillStyle=C.blueDeep;c.fillRect(13,y+46,364,3);}
  c.restore();}

/* ---------- Entreno (app/screens/entreno.js) driven by a script S ----------
 S = {rev(key)->0..1, scroll(t), clock0, sets:[{kg:[[t,v]],reps:[[t,v]],ck,focusKg:[a,b],focusReps:[a,b]}], pr:{t,label}, rest:{s,end,hide},
      collapse, ex:[[name,right]...] (5 rows; index 1 is the open card), card:{name,last,propose,target,note,goal,rir}, doneBase, taps:[[x,y,t]]} */
export function entreno(c,t,S){
  appBg(c);const sc=S.scroll?S.scroll(t):0,rv=k=>S.rev?S.rev(k,t):1;
  c.save();c.beginPath();c.rect(0,104,PW,668);c.clip();c.translate(0,-sc);
  let a=rv('banner');if(a>0){c.globalAlpha=a;c.fillStyle=C.blue;c.fillRect(16,114,3,26);txt(c,'Rutina asignada por tu coach',28,132,600,12,C.text2);c.globalAlpha=1;}
  a=rv('tabs');if(a>0){c.globalAlpha=a;let x=16;for(const[l,on]of[['Torso',1],['Piernas',0],['Full body',0]]){const w=tw(l,700,14)+28;c.fillStyle=C.surface2;rr(c,x,150,w,36,10);c.fill();c.strokeStyle=on?'rgba(255,255,255,0.55)':C.border;c.lineWidth=1.2;c.stroke();txt(c,l,x+14,173,700,14,on?'#fff':C.text2);x+=w+8;}
    txt(c,'Torso',16,226,700,26,'#fff');c.globalAlpha=1;}
  const nDone=(S.doneBase??3)+S.sets.filter(s=>t>=s.ck).length;
  a=rv('pill');if(a>0){c.globalAlpha=a;const secs=Math.floor((S.clock0??754)+Math.max(0,t-3.3)+(S.rest?120*prog(t,S.rest.s+0.02,S.rest.end):0));
    c.fillStyle=C.surface2;rr(c,16,240,358,40,20);c.fill();ringRect(c,16,240,358,40,20,1.5,1);const pd=0.55+0.45*Math.sin(t*Math.PI*2/1.6);c.fillStyle=`rgba(255,255,255,${pd})`;c.beginPath();c.arc(118,260,4,0,7);c.fill();
    txt(c,'Entrenando hace',130,265,500,14,'#fff');txt(c,`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`,248,265,800,14,'#fff');
    for(const[l,x,w]of[['✓ Finalizar',16,175],['Cancelar',199,175]]){c.fillStyle=C.surface2;rr(c,x,288,w,32,16);c.fill();ringRect(c,x,288,w,32,16,1.2,2);txt(c,l,x+w/2,309,700,12,'#fff','center');}
    c.fillStyle=C.surface2;rr(c,16,338,220,8,4);c.fill();c.fillStyle=rgbLine(c,16,0,236,0);rr(c,16,338,220*nDone/21,8,4);c.fill();txt(c,`${nDone}/21 series`,248,347,600,12,C.text2);txt(c,'Limpiar',374,347,600,12,C.text2,'right');c.globalAlpha=1;}
  a=rv('ex0');if(a>0)exRow(c,364,1,S.ex[0][0],S.ex[0][1],a,0);
  const col0=S.collapse??1e9,ch=lerp(456,52,E.inOutCubic(prog(t,col0+0.17,col0+0.36))),y0=426,K=S.card;
  a=rv('card');
  if(a>0){const col=prog(t,col0+0.17,col0+0.3);
    if(col<1){c.save();c.globalAlpha=a*(1-col);c.translate(195,y0+ch/2);c.scale(1-0.03*col,1-0.03*col);c.translate(-195,-(y0+ch/2)-4*col);
      c.fillStyle=C.surface;rr(c,16,y0,358,456,4);c.fill();ringRect(c,16,y0,358,456,4,1.5,3);
      c.fillStyle=C.surface2;rr(c,28,y0+16,22,22,6);c.fill();txt(c,'2',39,y0+32,700,12,'#fff','center');txt(c,K.name,60,y0+33,600,16,'#fff');
      c.strokeStyle=C.text2;c.lineWidth=1.6;c.beginPath();c.moveTo(356,y0+31);c.lineTo(360,y0+26);c.lineTo(364,y0+31);c.stroke();
      c.fillStyle=C.surface2;rr(c,28,y0+54,58,20,3);c.fill();txt(c,K.rir||'RIR 2-0',57,y0+68,700,11,'#fff','center');c.font='italic 500 11px Outfit';c.fillStyle=C.text2;c.fillText(K.goal||'Progreso en carga',96,y0+68);
      const lvHi=S.hiLast?Math.sin(Math.PI*prog(t,S.hiLast[0],S.hiLast[1])):0;if(lvHi>0){c.fillStyle=`rgba(47,160,255,${0.22*lvHi})`;rr(c,22,y0+84,346,46,8);c.fill();}
      txt(c,`LA VEZ PASADA (${S.card.lastDate||'23 SEP'})`,28,y0+98,700,9,C.text2,'left',1);c.strokeStyle=C.border;c.lineWidth=1.2;rr(c,262,y0+84,98,22,11);c.stroke();txt(c,'Usar estos pesos',311,y0+99,700,10,'#fff','center');
      let x=28;for(const[s,b]of K.last){txt(c,s,x,y0+120,b?700:400,12,b?'#fff':C.text2);x+=tw(s,b?700:400,12);}
      c.fillStyle=C.surface2;rr(c,28,y0+132,334,36,10);c.fill();txt(c,'Tu coach propone',42,y0+155,400,12,C.text2);txt(c,K.propose,42+tw('Tu coach propone ',400,12),y0+155,700,12,'#fff');
      S.sets.forEach((st,i)=>{const y=y0+178+i*52,kg=valAt(st.kg,t),reps=valAt(st.reps,t),done=t>=st.ck;
        c.fillStyle=C.surface2;rr(c,28,y+10,24,24,6);c.fill();txt(c,String(i+1),40,y+27,700,12,C.text2,'center');
        const fk=st.focusKg&&t>=st.focusKg[0]&&t<st.focusKg[1],fr=st.focusReps&&t>=st.focusReps[0]&&t<st.focusReps[1];
        for(const[xx,w,v,unit,f]of[[62,86,kg,'kg',fk],[174,62,reps,'reps',fr]]){c.fillStyle=C.surface2;rr(c,xx,y+2,w,40,4);c.fill();c.strokeStyle=f?C.blue:'rgba(255,255,255,0.14)';c.lineWidth=f?1.6:1;c.stroke();
          txt(c,v,xx+w-8,y+29,700,18,'#fff','right');if(f&&Math.floor(t*4)%2===0){c.fillStyle=C.blue;c.fillRect(xx+w-6,y+12,1.6,22);}txt(c,unit,xx+w+4,y+29,500,11,C.text2);}
        c.fillStyle=C.surface2;rr(c,268,y+12,40,20,5);c.fill();txt(c,K.target,288,y+26,700,12,C.text2,'center');
        const ce=done?E.outBack(prog(t,st.ck,st.ck+0.2)):0;c.fillStyle=C.surface2;rr(c,318,y,44,44,10);c.fill();c.strokeStyle='rgba(255,255,255,0.14)';c.lineWidth=1;c.stroke();
        if(ce>0){c.save();c.translate(340,y+22);c.scale(ce,ce);c.fillStyle='#fff';rr(c,-22,-22,44,44,10);c.fill();tick(c,0,0,22,'#000',3.2);c.restore();}
        if(i===0&&S.pr)prChip(c,296,y-8,t,S.pr.t,S.pr.label);});
      c.fillStyle=C.surface;rr(c,28,y0+338,334,48,6);c.fill();c.fillStyle=rgbLine(c,0,y0+338,0,y0+386);c.fillRect(28,y0+338,2,48);
      txt(c,'NOTA DE TU COACH',40,y0+356,700,9,C.text2,'left',1);txt(c,K.note,40,y0+375,400,12,C.soft);
      c.fillStyle=C.surface2;rr(c,28,y0+398,210,42,10);c.fill();c.strokeStyle='rgba(255,255,255,0.14)';c.stroke();txt(c,'Iniciar descanso',142,y0+424,700,14,'#fff','center');playTri(c,72,y0+419,7);
      c.fillStyle=C.surface2;rr(c,248,y0+398,114,42,10);c.fill();c.stroke();txt(c,'2:00',305,y0+418,700,17,'#fff','center');txt(c,'CAMBIAR',305,y0+433,700,9.5,C.text2,'center',0.5);
      const fl=Math.sin(Math.PI*prog(t,col0,col0+0.22));if(fl>0){c.fillStyle=`rgba(47,160,255,${0.35*fl})`;rr(c,16,y0,358,456,4);c.fill();}
      c.restore();}
    if(col>0){c.globalAlpha=a*E.outCubic(col);exRow(c,y0,2,K.name,S.collapsedRight||'✓ 32,5 kg × 9',1,1);c.globalAlpha=1;}}
  const yb=y0+ch+10;
  for(let i=2;i<5;i++){const ra=rv('ex'+i);if(ra>0)exRow(c,yb+(i-2)*60,i+1,S.ex[i][0],S.ex[i][1],ra,i);}
  a=rv('save');if(a>0){const gy=yb+3*60+12;c.globalAlpha=a;c.fillStyle='#fff';rr(c,16,gy,358,50,25);c.fill();ringRect(c,15,gy-1,360,52,26,2,t*Math.PI*2/5);txt(c,'✓  Guardar entreno de hoy',195,gy+31,700,15,'#000','center');c.globalAlpha=1;}
  for(const[x,y,t0]of S.taps||[])tap(c,x,y,t,t0);
  c.restore();
  a=rv('header');c.globalAlpha=a;appHeader(c,S.headerOpts||{});c.globalAlpha=1;
  if(S.rest)restBar(c,t,S.rest.s,S.rest.end,S.rest.hide);
  a=rv('nav');c.globalAlpha=a;bottomNav(c,0);c.globalAlpha=1;
}
export const entrenoGeom={cardY:426,setY:i=>426+178+i*52,checkX:340,restBtn:[142,426+419],saveY:(ch=52)=>426+ch+10+3*60+12+25};
