/* The Cardio neon map: a 3D map (grid, blocks, river), a GPS route with an
   elevation curtain that lights up in the RGB range as the runner passes,
   km markers and the runner dot. Used by teasers and the cardio episode. */
import {C,RGB,E,clamp,lerp,prog,glow,rgbLine,rr,txt,hash,gamaAt,mixc,rgba,F} from './engine.js';

const N=900;
export const ROUTE=(()=>{const P=new Float32Array(N*3),cum=new Float32Array(N);
  for(let k=0;k<N;k++){const s=0.15+k/(N-1)*Math.PI*2*0.93;P[k*3]=450*Math.cos(s)+100*Math.cos(3*s+0.6)+40*Math.sin(5*s);P[k*3+1]=270*Math.sin(s)+80*Math.sin(2*s+1.3);P[k*3+2]=Math.max(8,115+70*Math.sin(2*s+0.4)+30*Math.sin(5*s+1.1));}
  for(let k=1;k<N;k++)cum[k]=cum[k-1]+Math.hypot(P[k*3]-P[k*3-3],P[k*3+1]-P[k*3-2]);return{P,cum,len:cum[N-1],n:N};})();
export function xf(x,y,z,cam){const cs=Math.cos(cam.spin),sn=Math.sin(cam.spin),x1=x*cs-y*sn,y1=x*sn+y*cs,D=-z,cp=Math.cos(cam.tilt),sp=Math.sin(cam.tilt);
  const Y=y1*cp+D*sp,Dd=-y1*sp+D*cp,zz=Dd+cam.dist,s=cam.f/Math.max(60,zz);return[cam.cx+x1*s,cam.cy+Y*s,zz,s];}
export function routeAt(u){const{cum,len,n}=ROUTE;let lo=0,hi=n-1;const Lx=u*len;while(hi-lo>1){const m=(lo+hi)>>1;cum[m]<Lx?lo=m:hi=m;}return[lo,clamp((Lx-cum[lo])/Math.max(1e-6,cum[hi]-cum[lo]))];}
// o: {cam, reveal 0..1 (route drawn), run 0..1 (runner progress), gridA, elev 0..1, markers:true}
export function drawMap(c,t,o){const{cam}=o,{P,cum,len,n}=ROUTE,run=o.run??0,rev=o.reveal??1,ga=o.gridA??1,el=o.elev??1;
  if(ga>0){for(let q=0;q<22;q++){const i=Math.floor(hash(q+1)*24)-6,j=Math.floor(hash(q+40)*16)-4,x0=-900+120*i+14,y0=-480+120*j+14,s=92;
      const p=[[x0,y0],[x0+s,y0],[x0+s,y0+s],[x0,y0+s]].map(([x,y])=>xf(x,y,0,cam));c.fillStyle=rgba(q%5?[18,21,27]:mixc([18,21,27],RGB.teal,0.25),ga);c.beginPath();p.forEach((v,k)=>k?c.lineTo(v[0],v[1]):c.moveTo(v[0],v[1]));c.closePath();c.fill();}
    const top=[],bot=[];for(let x=-1800;x<=1800;x+=60){const yc=600+140*Math.sin(x*0.003);top.push(xf(x,yc-38,0,cam));bot.push(xf(x,yc+38,0,cam));}
    c.fillStyle=rgba(RGB.blue,0.12*ga);c.beginPath();top.forEach((p,k)=>k?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));for(let k=bot.length-1;k>=0;k--)c.lineTo(bot[k][0],bot[k][1]);c.closePath();c.fill();
    c.lineWidth=1.2;const seg=(x0,y0,x1,y1)=>{for(let q=0;q<8;q++){const a=xf(lerp(x0,x1,q/8),lerp(y0,y1,q/8),0,cam),b=xf(lerp(x0,x1,(q+1)/8),lerp(y0,y1,(q+1)/8),0,cam);
      c.strokeStyle=rgba(RGB.text2,ga*0.2*(1-clamp((a[2]-1000)/1300)));c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();}};
    for(let i=-5;i<=21;i++)seg(-900+120*i,-1100,-900+120*i,1100);for(let j=-5;j<=13;j++)seg(-1500,-480+120*j,1500,-480+120*j);}
  const pr=[];for(let k=0;k<n;k++){pr.push(xf(P[k*3],P[k*3+1],P[k*3+2]*el,cam));}
  const vis=Math.floor(rev*(n-1));
  for(let k=0;k<vis;k+=3){const g=xf(P[k*3],P[k*3+1],0,cam),passed=cum[k]/len<run;c.strokeStyle=rgba(passed?gamaAt(k/n):RGB.text2,passed?0.4:0.14);c.lineWidth=1;c.beginPath();c.moveTo(g[0],g[1]);c.lineTo(pr[k][0],pr[k][1]);c.stroke();}
  c.lineCap='round';for(let k=0;k<vis;k++){const a=pr[k],b=pr[k+1],s=(a[3]+b[3])/2,passed=cum[k+1]/len<=run;
    if(passed){c.strokeStyle=rgba(gamaAt(k/n));c.lineWidth=4.4*s;}else{c.strokeStyle='rgba(255,255,255,0.4)';c.lineWidth=2.2*s;}c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();}c.lineCap='butt';
  let runner=null;
  if(run>0){c.fillStyle='#fff';c.beginPath();c.arc(pr[0][0],pr[0][1],9,0,7);c.fill();c.fillStyle='#000';c.beginPath();c.arc(pr[0][0],pr[0][1],4,0,7);c.fill();
    if(o.markers!==false)for(let km=1;km<=5;km++){const u=km/5.2;if(run<u)continue;const[k,f]=routeAt(u),x=lerp(pr[k][0],pr[k+1][0],f),y=lerp(pr[k][1],pr[k+1][1],f),pop=E.outBack(clamp((run-u)*14));
      c.strokeStyle=rgba(RGB.text,0.6*pop);c.lineWidth=1.5;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-14*pop);c.stroke();c.save();c.translate(x,y-34*pop);c.scale(pop,pop);c.fillStyle='#fff';rr(c,-34,-18,68,36,18);c.fill();txt(c,`${km} km`,0,6,700,18,'#000','center');c.restore();}
    const[k,f]=routeAt(Math.min(run,0.9999)),x=lerp(pr[k][0],pr[k+1][0],f),y=lerp(pr[k][1],pr[k+1][1],f),col=gamaAt(k/n);runner={x,y,col};
    glow(c,x,y,80,col,0.55);for(let q=0;q<2;q++){const u=((t*2)+q*0.5)%1;c.strokeStyle=rgba(col,(1-u)*0.8);c.lineWidth=2;c.beginPath();c.arc(x,y,13+44*u,0,7);c.stroke();}
    if(!o.noRunnerDot){c.fillStyle='#fff';c.beginPath();c.arc(x,y,12,0,7);c.fill();c.fillStyle=C.blue;c.beginPath();c.arc(x,y,6.5,0,7);c.fill();}}
  return{runner,pr};}
// the neon frame of the Cardio map card
export function neonFrame(c,x,y,w,h,r,p=1,a=1){if(a<=0||p<=0)return;const per=2*(w+h);c.save();c.globalAlpha=a;c.strokeStyle=rgbLine(c,x,y,x+w,y+h);c.lineWidth=3;c.setLineDash([per*p,per]);rr(c,x,y,w,h,r);c.stroke();c.restore();}
