/* More GIZE app screens for motion pieces (logical 390x844), parametrized by state
   instead of an episode's timeline: Comida, Hábitos, the dark feed with the rest
   notification, the rest ring, the live Cardio HUD and the neon map in any rect.
   Copy and layout follow app/screens (comida.js, habitos.js, cardio.js) and the
   rest notification in app/ui/restnotif.js. The episodes carry their own
   timeline-driven versions of these. */
import {C,RGB,E,clamp,lerp,prog,glow,rr,txt,tw,hash,rgbRing,rgbLine,tick,drawFirma} from './engine.js';
import {appBg,appHeader,bottomNav} from './ui.js';
import {drawMap,routeAt,ROUTE} from './map.js';

export const TEAL='#25E8C8';

/* ---------- Comida ---------- */
export const COMIDA_GOAL={kcal:2100,p:150,c:230,f:65};
// T: {kcal,p,c,f}; cena: [[emoji,name,sub,kcal]]; glowK 0..1
export function comidaScreen(c,t,{T,cena=[],glowK=0,time}={}){appBg(c);
  c.save();c.beginPath();c.rect(0,104,390,668);c.clip();
  txt(c,'‹',30,138,400,22,C.text2,'center');txt(c,'Hoy',195,130,700,16,'#fff','center');txt(c,'30 sep',195,146,500,11,C.text2,'center');txt(c,'›',360,138,400,22,'rgba(143,152,166,0.35)','center');
  {const cx=195,cy=250,r=74,f=Math.min(1,T.kcal/COMIDA_GOAL.kcal);c.save();c.translate(cx,cy);c.strokeStyle='#1C2029';c.lineWidth=11;c.beginPath();c.arc(0,0,r,0,7);c.stroke();
    c.strokeStyle=rgbRing(c,0,0,-Math.PI/2);c.lineCap='round';c.beginPath();c.arc(0,0,r,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0.001,f));c.stroke();c.lineCap='butt';if(glowK>0)glow(c,0,0,110,RGB.blue,0.25*glowK);
    txt(c,String(Math.round(T.kcal)),0,8,800,33,'#fff','center');txt(c,`de ${COMIDA_GOAL.kcal} kcal`,0,30,500,12,C.text2,'center');c.restore();}
  [['Proteína',T.p,COMIDA_GOAL.p],['Carbos',T.c,COMIDA_GOAL.c],['Grasas',T.f,COMIDA_GOAL.f]].forEach(([l,v,g],i)=>{const y=352+i*38;txt(c,l,16,y,600,14,'#fff');txt(c,`${Math.round(v)} / ${g} g`,374,y,500,13,C.text2,'right');
    c.fillStyle=C.surface2;rr(c,16,y+8,358,6,3);c.fill();c.fillStyle=rgbLine(c,16,0,374,0);rr(c,16,y+8,358*Math.min(1,v/g),6,3);c.fill();});
  txt(c,'Editar meta',195,470,600,12,C.text2,'center');
  c.fillStyle=C.surface2;rr(c,16,484,302,44,22);c.fill();c.strokeStyle=C.border;c.lineWidth=1;c.stroke();c.strokeStyle=C.text2;c.lineWidth=1.6;c.beginPath();c.arc(40,504,6,0,7);c.moveTo(44.5,508.5);c.lineTo(49,513);c.stroke();
  txt(c,'Buscar alimento o marca…',58,511,400,14,C.text2);c.fillStyle=C.surface2;rr(c,326,484,48,44,12);c.fill();c.strokeStyle=C.border;c.stroke();barcodeIcon(c,350,502,'#fff');txt(c,'BETA',350,522,800,7,C.blue,'center',0.5);
  const cenaK=cena.reduce((a,x)=>a+parseInt(x[3]),0);
  [['☀️','Desayuno','420 kcal'],['🍽️','Almuerzo','780 kcal'],['🧉','Merienda','260 kcal'],['🌙','Cena',cenaK?`${cenaK} kcal`:'']].forEach(([ic,l,k],i)=>{const y=546+i*40;txt(c,ic,16,y+22,400,15,'#fff');txt(c,l,42,y+22,700,15,'#fff');txt(c,k,318,y+22,500,13,C.text2,'right');
    c.strokeStyle=C.border;c.lineWidth=1;c.beginPath();c.arc(352,y+17,13,0,7);c.stroke();txt(c,'+',352,y+23,500,17,C.text2,'center');c.fillStyle=C.border;c.fillRect(16,y+38,358,1);});
  if(!cena.length)txt(c,'Todavía nada',42,720,400,12,C.text2);
  cena.forEach(([ic,n,s,k],j)=>{const y=710+j*52;c.fillStyle='rgba(47,160,255,0.1)';rr(c,16,y-4,358,46,6);c.fill();txt(c,ic,28,y+22,400,18,'#fff');txt(c,n,58,y+14,600,14,'#fff');txt(c,s,58,y+32,400,10.5,C.text2);txt(c,k,366,y+22,700,13,'#fff','right');});
  c.restore();appHeader(c,{coach:'Martina',streak:5,time});bottomNav(c,3);}
export function barcodeIcon(c,x,y,col){c.fillStyle=col;[0,3,5,9,11,14,17,19].forEach((d,i)=>c.fillRect(x-10+d,y-8,i%3?1.4:2.4,16));}

/* ---------- Hábitos ---------- */
export const HABITS=[{n:'Tomar 2 L de agua',m:'Todos los días'},{n:'Creatina',m:'Todos los días'},{n:'Estirar 10 min',m:'18:45 · Lunes a viernes',coach:1,bell:1},{n:'Meditar 5 min',m:'21:00 · Todos los días',bell:1},{n:'Caminar 8.000 pasos',m:'Todos los días'}];
function bell(c,x,y,on){c.strokeStyle=on?C.blue:C.text2;c.lineWidth=1.6;c.beginPath();c.moveTo(x-6,y+4);c.quadraticCurveTo(x-6,y-8,x,y-8);c.quadraticCurveTo(x+6,y-8,x+6,y+4);c.lineTo(x+8,y+6);c.lineTo(x-8,y+6);c.closePath();c.stroke();c.beginPath();c.arc(x,y+9,2,0,Math.PI);c.stroke();}
// checks: 5 values 0..1 (0.5+ reads as done); flash: 5 values 0..1
export function habitosScreen(c,t,{checks=[0,0,0,0,0],flash=[],time,streak=5,cel=0}={}){appBg(c);const done=checks.filter(v=>v>0.5).length;
  c.save();c.beginPath();c.rect(0,104,390,668);c.clip();
  txt(c,'Daily Checklist',16,148,700,26,'#fff');c.fillStyle=rgbLine(c,16,0,76,0);c.fillRect(16,160,60,3);
  c.fillStyle=C.surface2;rr(c,16,178,318,6,3);c.fill();c.fillStyle=rgbLine(c,16,0,334,0);rr(c,16,178,318*done/5,6,3);c.fill();txt(c,`${done}/5`,374,186,600,12,C.text2,'right');if(cel>0)glow(c,175,181,200,RGB.teal,0.35*cel);
  HABITS.forEach((h,i)=>{const y=200+i*64,on=checks[i]||0,fl=flash[i]||0;c.fillStyle=C.surface;rr(c,16,y,358,56,4);c.fill();c.strokeStyle=fl>0?`rgba(37,232,200,${0.3+0.6*fl})`:C.border;c.lineWidth=1;c.stroke();
    c.fillStyle=C.surface2;rr(c,28,y+14,28,28,8);c.fill();c.strokeStyle='rgba(255,255,255,0.18)';c.stroke();
    if(on>0){c.save();c.translate(42,y+28);c.scale(on,on);c.fillStyle=TEAL;rr(c,-14,-14,28,28,8);c.fill();tick(c,0,0,15,'#000',2.6);c.restore();}
    txt(c,h.n,70,y+25,600,15,on>0.5?C.text2:'#fff');if(on>0.5){c.fillStyle=C.text2;c.fillRect(70,y+20,tw(h.n,600,15)*clamp((on-0.5)*2),1.5);}
    txt(c,h.m,70,y+43,400,11,C.text2);if(h.coach){const x=78+tw(h.m,400,11);c.fillStyle='rgba(166,92,255,0.16)';rr(c,x,y+33,40,14,7);c.fill();txt(c,'coach',x+20,y+43,700,9,C.purple,'center');}
    bell(c,322,y+27,h.bell);if(!h.coach)txt(c,'✕',354,y+33,400,12,C.text2,'center');});
  c.fillStyle=C.surface2;rr(c,16,528,302,48,10);c.fill();c.strokeStyle=C.border;c.stroke();txt(c,'Nueva tarea diaria…',30,557,400,14,C.text2);
  c.fillStyle='#fff';rr(c,326,528,48,48,24);c.fill();c.strokeStyle=rgbRing(c,350,552,t*1.2);c.lineWidth=2;rr(c,327,529,46,46,23);c.stroke();txt(c,'+',350,560,500,22,'#000','center');
  txt(c,'Se reinician solas cada día. Con la campanita elegís qué',195,610,400,11,C.text2,'center');txt(c,'días va cada una y a qué hora te avisa.',195,626,400,11,C.text2,'center');
  c.restore();appHeader(c,{coach:'Martina',streak,time});bottomNav(c,1);}

/* ---------- a generic dark feed + a GIZE notification ---------- */
export function darkFeed(c,t,sc){c.fillStyle='#0B0C0F';c.fillRect(0,0,390,844);
  for(let i=0;i<6;i++){const ii=i+Math.floor(sc/470),yy=92+i*470-(sc%470);if(yy>844||yy<-470)continue;
    c.fillStyle='#22262E';c.beginPath();c.arc(34,yy+24,16,0,7);c.fill();rr(c,60,yy+14,110,10,5);c.fill();rr(c,60,yy+30,70,8,4);c.fill();
    const[a,b]=[['#3A2E4A','#1F3A44'],['#2E3F3A','#44342A'],['#2A3448','#3F2B3C'],['#41352C','#263541']][ii%4],g=c.createLinearGradient(0,yy+52,390,yy+372);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(0,yy+52,390,320);
    c.fillStyle='rgba(255,255,255,0.08)';c.beginPath();c.arc(120+150*hash(ii),yy+180+60*hash(ii+3),70,0,7);c.fill();
    c.strokeStyle='#8F98A6';c.lineWidth=2;c.beginPath();c.arc(30,yy+398,9,0,7);c.stroke();c.beginPath();c.arc(64,yy+398,9,0.4,6.1);c.stroke();c.fillStyle='#22262E';rr(c,18,yy+424,250,9,4);c.fill();rr(c,18,yy+442,160,9,4);c.fill();}
  c.fillStyle='rgba(11,12,15,0.94)';c.fillRect(0,0,390,48);}
export function notifCard(c,y,a,title='¡Descanso terminado! 💪',body='Volvé a la próxima serie.'){if(a<=0)return;c.save();c.globalAlpha=a;c.fillStyle='#1E2129';rr(c,10,y,370,92,22);c.fill();c.strokeStyle='#2B303B';c.lineWidth=1;c.stroke();
  c.fillStyle='#000';c.beginPath();c.arc(40,y+30,14,0,7);c.fill();drawFirma(c,31,y+21,0.16,{wordmark:false});
  txt(c,'GIZE · ahora',62,y+35,500,12,C.text2);txt(c,title,24,y+62,800,16,'#fff');txt(c,body,24,y+82,400,13,C.soft);c.restore();}
// the rest countdown ring (screen space): rem seconds of 120, done 0..1
export function restRing(c,x,y,R,{rem,done=0,a=1,endClock='18:44'}){if(a<=0)return;c.save();c.globalAlpha=a;c.translate(x,y);glow(c,0,0,R*2,done?RGB.teal:RGB.blue,0.18+0.3*done);
  c.strokeStyle='#1C2029';c.lineWidth=R*0.1;c.beginPath();c.arc(0,0,R,0,7);c.stroke();
  if(done<1){c.strokeStyle=rgbRing(c,0,0,-Math.PI/2);c.lineCap='round';c.beginPath();c.arc(0,0,R,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0.001,rem/120));c.stroke();c.lineCap='butt';}
  if(done>0){c.strokeStyle=`rgba(37,232,200,${done})`;c.beginPath();c.arc(0,0,R*(1+0.12*(1-done)),0,7);c.stroke();}
  const r=Math.ceil(rem);txt(c,'DESCANSO',0,-R*0.38,700,R*0.14,C.text2,'center',3);txt(c,`${Math.floor(r/60)}:${String(r%60).padStart(2,'0')}`,0,R*0.2,800,R*0.5,'#fff','center');
  txt(c,`termina ${endClock}`,0,R*0.52,500,R*0.14,C.text2,'center');c.restore();}

/* ---------- Cardio: the neon map in any rect + the live numbers ---------- */
const hms=s=>{s=Math.max(0,Math.floor(s));const p=v=>String(v).padStart(2,'0');return`${p(Math.floor(s/3600))}:${p(Math.floor(s%3600/60))}:${p(s%60)}`;};
export const cardioLive=(u,{secs=1951,km=5.2,kcal=398}={})=>({dur:hms(secs*u),km:(km*u).toFixed(2).replace('.',','),pace:u>0.01?'6:15':'–:–',kcal:String(Math.round(kcal*u))});
// R: {x,y,w,h,r}; cam: {cxOff,cyOff,f,tilt,spin,dist} (offsets in the 1100-wide virtual canvas)
export function mapIn(c,t,R,run,cam,{frame=1}={}){const k=R.w/1100,VH=R.h/k,[ki]=routeAt(Math.min(run,0.9999));
  c.save();c.beginPath();c.roundRect(R.x,R.y,R.w,R.h,R.r??10);c.clip();c.fillStyle='#05070A';c.fillRect(R.x,R.y,R.w,R.h);c.translate(R.x,R.y);c.scale(k,k);glow(c,550,VH/2,900,RGB.blue,0.1);
  drawMap(c,t,{cam:{cx:550+(cam.cxOff||0),cy:VH/2+(cam.cyOff||0),f:cam.f||1400,tilt:cam.tilt??0.98,spin:cam.spin||0,dist:cam.dist||1600},reveal:run>=0.9999?1:(ki+1)/(ROUTE.n-1),run,gridA:1,elev:1});c.restore();
  if(frame>0){c.save();c.globalAlpha=frame;c.strokeStyle=rgbRing(c,R.x+R.w/2,R.y+R.h/2,t*1.2);c.lineWidth=Math.max(1.5,R.w/220);c.beginPath();c.roundRect(R.x,R.y,R.w,R.h,R.r??10);c.stroke();c.restore();}}
// the live numbers panel (screen space), centred at x,y, scale s
export function cardioHud(c,t,x,y,s,u,a,label='CORRER · EN VIVO'){if(a<=0)return;const v=cardioLive(u);
  c.save();c.globalAlpha=a;c.translate(x,y+40*(1-a));c.scale(s,s);c.fillStyle='rgba(8,10,14,0.88)';rr(c,-440,-130,880,260,36);c.fill();c.strokeStyle=rgbRing(c,0,0,t);c.lineWidth=2.5;rr(c,-440,-130,880,260,36);c.stroke();
  const live=label.includes('VIVO'),blink=live?(0.5+0.5*Math.cos(t*7)):1;c.fillStyle=live?`rgba(255,77,77,${blink})`:C.blue;c.beginPath();c.arc(-tw(label,700,22,3)/2-22,-86,7,0,7);c.fill();txt(c,label,0,-78,700,22,C.text2,'center',3);
  txt(c,v.dur,0,0,800,76,'#fff','center');
  [[v.km,'km'],[v.pace,'min/km medio'],[v.kcal,'kcal']].forEach(([val,l],i)=>{const xx=(i-1)*280;txt(c,val,xx,72,800,44,'#fff','center');txt(c,l,xx,104,500,20,C.text2,'center');});c.restore();}
