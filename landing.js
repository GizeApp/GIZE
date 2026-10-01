(function(){
  var hero=document.getElementById('top'), cv=document.getElementById('fx'), hint=document.getElementById('hint');
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LOW=matchMedia('(pointer:coarse)').matches||innerWidth<820;

  // =============== 1) Hero: vidrio esmerilado que se limpia (WebGL) ===============
  // Solo en el hero; deja de dibujarse cuando sale de pantalla. En celular: menos
  // resolución, 30 cuadros por segundo y menos muestras. Si igual no llega, baja solo.
  (function(){
    if(!hero||!cv) return;
    var gl=null; try{ gl=cv.getContext('webgl',{antialias:false,alpha:false,premultipliedAlpha:false}); }catch(e){}
    if(!gl){ cv.style.display='none'; if(hint) hint.style.display='none'; return; }
    var RS=LOW?.5:Math.min(window.devicePixelRatio||1,1);
    var sc=document.createElement('canvas'), sx=sc.getContext('2d');
    var arc=new Path2D('M81.53,62.74 A34,34 0 1 1 67,20.55');
    var COLS=['#2FA0FF','#A65CFF','#FF3DAE','#25E8C8'];
    var blobs=[], gLayer, dotSpr, GS=0, DS=0, L=null;
    function layout(W,H){ var port=H>W*1.05; return port?{S:Math.min(W*.56,H*.27),cx:W*.56,cy:H*.22}:{S:Math.min(H*.8,W*.5),cx:W*.64,cy:H*.47}; }
    // Lo caro (degradés y resplandores) se dibuja una vez por tamaño.
    function sprites(){
      L=layout(sc.width,sc.height); var S=L.S;
      blobs=COLS.map(function(c){ var b=document.createElement('canvas'); b.width=b.height=128; var x=b.getContext('2d');
        var g=x.createRadialGradient(64,64,0,64,64,64); g.addColorStop(0,c); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,128,128); return b; });
      GS=Math.ceil(S*1.3); gLayer=document.createElement('canvas'); gLayer.width=gLayer.height=GS; var gx=gLayer.getContext('2d');
      gx.translate((GS-S)/2,(GS-S)/2); gx.scale(S/100,S/100); gx.shadowColor='rgba(255,255,255,.35)'; gx.shadowBlur=S*.06;
      gx.lineWidth=20; gx.lineCap='round'; gx.strokeStyle='#F4F6FA'; gx.stroke(arc);
      // El orbe de la marca (brand/logo/gize-marca-blanca.svg): resplandor de color, esfera de
      // degradés, sombra del borde y el reflejo blanco arriba a la izquierda.
      DS=Math.ceil(S*1.1); dotSpr=document.createElement('canvas'); dotSpr.width=dotSpr.height=DS; var dx=dotSpr.getContext('2d');
      dx.translate(DS/2,DS/2); dx.scale(S/100,S/100);
      var R=9.6, rg=function(x,y,r,stops){ var g=dx.createRadialGradient(x*R,y*R,0,x*R,y*R,r*R); stops.forEach(function(s){ g.addColorStop(s[0],s[1]); }); return g; };
      [[-.5,.15,'34,198,200',.6],[0,-.5,'84,104,232',.3],[.5,.1,'210,60,180',.5]].forEach(function(h){
        dx.fillStyle=rg(h[0],h[1],3.2,[[.28,'rgba('+h[2]+','+h[3]+')'],[.55,'rgba('+h[2]+','+(h[3]*.35)+')'],[1,'rgba('+h[2]+',0)']]); dx.fillRect(-50,-50,100,100); });
      dx.save(); dx.beginPath(); dx.arc(0,0,R,0,Math.PI*2); dx.clip();
      dx.fillStyle=rg(-.1,-.15,1.1,[[0,'#CBCCF2'],[1,'#9AA2E0']]); dx.fillRect(-R,-R,2*R,2*R);
      [[-.55,.55,1,'27,205,182'],[-.75,-.1,.85,'69,192,226'],[-.15,-.85,.9,'110,142,244'],[.6,-.55,.95,'154,85,238'],[.72,.3,.88,'224,58,174']].forEach(function(c){
        dx.fillStyle=rg(c[0],c[1],c[2],[[0,'rgba('+c[3]+',1)'],[.45,'rgba('+c[3]+',.72)'],[1,'rgba('+c[3]+',0)']]); dx.fillRect(-R,-R,2*R,2*R); });
      dx.fillStyle=rg(-.1,-.42,1.45,[[.6,'rgba(16,10,38,0)'],[.84,'rgba(16,10,38,.28)'],[1,'rgba(16,10,38,.7)']]); dx.fillRect(-R,-R,2*R,2*R);
      dx.fillStyle=rg(-.4,-.45,.6,[[0,'rgba(255,255,255,.22)'],[1,'rgba(255,255,255,0)']]); dx.fillRect(-R,-R,2*R,2*R);
      dx.restore(); dx.save(); dx.translate(-.39*R,-.47*R); dx.rotate(-24*Math.PI/180); dx.scale(1,.625);
      dx.fillStyle=rg(0,0,.2,[[.55,'#fff'],[1,'rgba(255,255,255,0)']]); dx.beginPath(); dx.arc(0,0,.2*R,0,Math.PI*2); dx.fill(); dx.restore();
    }
    function drawScene(t){
      var W=sc.width,H=sc.height;
      sx.globalCompositeOperation='source-over'; sx.globalAlpha=1; sx.fillStyle='#050608'; sx.fillRect(0,0,W,H);
      sx.globalCompositeOperation='lighter'; sx.globalAlpha=.4; var R=Math.max(W,H)*.55;
      for(var i=0;i<4;i++){ var x=W*(.5+.38*Math.sin(t*.00011*(i+2)+i*1.7)), y=H*(.5+.34*Math.cos(t*.00013*(i+1.5)+i*2.3)); sx.drawImage(blobs[i],x-R,y-R,R*2,R*2); }
      sx.globalAlpha=1; sx.globalCompositeOperation='source-over';
      var S=L.S; sx.save(); sx.translate(L.cx,L.cy+Math.sin(t*.0006)*H*.012); sx.rotate(Math.sin(t*.0003)*.05);
      sx.drawImage(gLayer,-GS/2,-GS/2); var d=DS*(1+.07*Math.sin(t*.0024)); sx.drawImage(dotSpr,S*.106-d/2,-d/2,d,d); sx.restore();
    }
    var TAPS=LOW?5:9;
    var VS='attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
    var FS_T='precision mediump float;varying vec2 v;uniform sampler2D prev;uniform vec2 a,b;uniform float r,s,asp,t;'+
      'float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);return length(pa-ba*h);}'+
      'void main(){vec2 n=vec2(sin(v.y*11.+t*1.7),cos(v.x*9.-t*1.3))*.0018;float o=texture2D(prev,v+n+vec2(0.,.0004)).r;o=max(o*.988-.0022,0.);'+
      'float d=seg(vec2(v.x*asp,v.y),vec2(a.x*asp,a.y),vec2(b.x*asp,b.y));o=min(1.,o+smoothstep(r,r*.15,d)*s*.38);gl_FragColor=vec4(o,o,o,1.);}';
    var FS_O='precision mediump float;varying vec2 v;uniform sampler2D scene,trail;uniform vec2 res,tres;uniform float t,cell;'+
      'float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}'+
      'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}'+
      'vec3 pal(float x){x=fract(x)*4.;vec3 c1=vec3(.184,.627,1.),c2=vec3(.651,.361,1.),c3=vec3(1.,.239,.682),c4=vec3(.145,.91,.784);return x<1.?mix(c1,c2,x):x<2.?mix(c2,c3,x-1.):x<3.?mix(c3,c4,x-2.):mix(c4,c1,x-3.);}'+
      'void main(){vec2 tp=1./tres;float m=texture2D(trail,v).r;'+
      'vec2 g=vec2(texture2D(trail,v+vec2(tp.x*2.,0.)).r-texture2D(trail,v-vec2(tp.x*2.,0.)).r,texture2D(trail,v+vec2(0.,tp.y*2.)).r-texture2D(trail,v-vec2(0.,tp.y*2.)).r);'+
      'vec2 q=v*res/cell;vec2 ug=v+vec2(vn(q)-.5,vn(q+17.3)-.5)*.03;vec3 acc=vec3(0.);float jit=h(v*res+fract(t))*6.2831;'+
      'for(int i=0;i<'+TAPS+';i++){float fi=float(i);float an=fi*2.39996+jit;float rr=sqrt((fi+.5)/'+TAPS+'.)*.02;acc+=texture2D(scene,ug+vec2(cos(an),sin(an))*rr*vec2(res.y/res.x,1.)).rgb;}'+
      'vec3 glass=acc/'+TAPS+'.*.86+.045;vec3 sharp=texture2D(scene,v-g*.09).rgb;'+
      'vec3 col=mix(glass,sharp,smoothstep(.16,.52,m+(vn(v*res/5.)-.5)*.1));'+
      'col+=smoothstep(.06,.2,m)*(1.-smoothstep(.2,.42,m))*pal(v.x*.5+v.y*.35+t*.05)*.3;'+
      'col+=(h(v*res+fract(t*7.))-.5)*.04;col*=mix(.72,1.,smoothstep(1.2,.35,length(v-vec2(.55,.5))));gl_FragColor=vec4(col,1.);}';
    function sh(type,src){ var o=gl.createShader(type); gl.shaderSource(o,src); gl.compileShader(o); if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    function prog(fs){ var p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,VS)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs)); gl.bindAttribLocation(p,0,'p'); gl.linkProgram(p); return p; }
    var pT,pO; try{ pT=prog(FS_T); pO=prog(FS_O); }catch(e){ console.error(e); cv.style.display='none'; return; }
    function U(p,n){ return gl.getUniformLocation(p,n); }
    var uT={prev:U(pT,'prev'),a:U(pT,'a'),b:U(pT,'b'),r:U(pT,'r'),s:U(pT,'s'),asp:U(pT,'asp'),t:U(pT,'t')};
    var uO={scene:U(pO,'scene'),trail:U(pO,'trail'),res:U(pO,'res'),tres:U(pO,'tres'),t:U(pO,'t'),cell:U(pO,'cell')};
    var buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    function tex(w,h){ var t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(w) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null); return t; }
    function fbo(t){ var f=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0); return f; }
    var sceneTex=tex(), W=0,H=0,TW=0,TH=0,tA,tB,fA,fB;
    function fit(){
      var r=hero.getBoundingClientRect(); W=Math.max(2,Math.round(r.width*RS)); H=Math.max(2,Math.round(r.height*RS)); cv.width=W; cv.height=H;
      var k=Math.min(1,(LOW?480:900)/W); sc.width=Math.round(W*k); sc.height=Math.round(H*k); sprites();
      TW=LOW?128:192; TH=Math.max(48,Math.round(TW*H/W)); tA=tex(TW,TH); tB=tex(TW,TH); fA=fbo(tA); fB=fbo(tB); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    fit(); var rt; addEventListener('resize',function(){ clearTimeout(rt); rt=setTimeout(fit,150); });

    var ptr=null,last=-1e9,prev=null,touched=false;
    function setPtr(e){ var r=hero.getBoundingClientRect(); ptr={x:(e.clientX-r.left)/r.width,y:1-(e.clientY-r.top)/r.height}; last=performance.now();
      if(!touched){ touched=true; if(hint) setTimeout(function(){ hint.classList.add('off'); },1400); } }
    hero.addEventListener('pointermove',setPtr,{passive:true}); hero.addEventListener('pointerdown',setPtr,{passive:true});
    function auto(t){ var s=t*.001, port=H>W*1.05; return {x:(port?.55:.62)+(port?.3:.26)*Math.sin(s*.53)+.07*Math.sin(s*1.7), y:(port?.74:.5)+(port?.16:.26)*Math.sin(s*.71+1.)+.06*Math.cos(s*1.9)}; }

    function draw(t){
      var user=(t-last)<2200&&ptr, cur=user?ptr:auto(t); if(!prev) prev=cur;
      drawScene(t); gl.bindTexture(gl.TEXTURE_2D,sceneTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sc);
      gl.useProgram(pT); gl.bindFramebuffer(gl.FRAMEBUFFER,fB); gl.viewport(0,0,TW,TH);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tA); gl.uniform1i(uT.prev,0);
      gl.uniform2f(uT.a,prev.x,prev.y); gl.uniform2f(uT.b,cur.x,cur.y); gl.uniform1f(uT.r,H>W?.11:.085); gl.uniform1f(uT.s,user?1:.8);
      gl.uniform1f(uT.asp,W/H); gl.uniform1f(uT.t,t*.001); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      var x=tA; tA=tB; tB=x; x=fA; fA=fB; fB=x;
      gl.useProgram(pO); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,W,H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,sceneTex); gl.uniform1i(uO.scene,0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,tA); gl.uniform1i(uO.trail,1);
      gl.uniform2f(uO.res,W,H); gl.uniform2f(uO.tres,TW,TH); gl.uniform1f(uO.t,t*.001); gl.uniform1f(uO.cell,16*RS);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4); prev=cur;
    }
    if(reduce){ for(var i=0;i<90;i++) draw(4000+i*33); if(hint) hint.style.display='none'; return; }
    // Solo se anima mientras el hero se ve y la pestaña está abierta.
    var on=true, running=false, lastDraw=0, slow=0, frames=0;
    function loop(t){
      if(!on||document.hidden){ running=false; return; }
      if(!LOW||t-lastDraw>=30){
        var dt=lastDraw?t-lastDraw:0; lastDraw=t; draw(t);
        if(dt){ frames++; if(dt>(LOW?50:34)) slow++; if(frames>=60){ if(slow>30&&RS>.35){ RS=Math.max(.35,RS*.8); fit(); } frames=0; slow=0; } }
      }
      requestAnimationFrame(loop);
    }
    function start(){ if(!running&&on&&!document.hidden){ running=true; lastDraw=0; requestAnimationFrame(loop); } }
    if('IntersectionObserver' in window) new IntersectionObserver(function(es){ on=es[0].isIntersecting; start(); }).observe(hero);
    document.addEventListener('visibilitychange',start); start();
  })();

  // =============== 2) Scroll: franja de palabras ===============
  // Solo trabaja cuando se scrollea (no en cada cuadro) y con posiciones medidas al
  // cambiar el tamaño, sin pedirle al navegador que mida la página a cada rato.
  var rows=[].slice.call(document.querySelectorAll('.mq-row'));
  var geo=null, ticking=false;
  function measure(){
    var y=scrollY, R=function(el){ var r=el.getBoundingClientRect(); return {top:r.top+y,bottom:r.bottom+y,h:r.height}; };
    geo={rows:rows.map(function(r){ return {top:R(r).top,w:r.scrollWidth}; })}; update();
  }
  function update(){
    ticking=false; if(!geo||reduce) return;
    var y=scrollY, vh=innerHeight;
    rows.forEach(function(row,k){ var g=geo.rows[k], sp=+row.dataset.speed; if(Math.abs(g.top-y-vh*.5)>vh*1.5) return;
      row.style.transform='translate3d('+((g.top-y-vh)*sp-(sp>0?0:g.w*.25))+'px,0,0)'; });
  }
  addEventListener('scroll',function(){ if(!ticking){ ticking=true; requestAnimationFrame(update); } },{passive:true});
  var mt; addEventListener('resize',function(){ clearTimeout(mt); mt=setTimeout(measure,150); });
  addEventListener('load',measure); if(document.fonts&&document.fonts.ready) document.fonts.ready.then(measure);
  measure();

  // =============== Cómo funciona: piezas de la app que se pueden tocar ===============
  var dCopy=document.getElementById('dCopy'), dCode=document.getElementById('dCode');
  if(dCopy&&dCode) dCopy.addEventListener('click',function(){
    var done=function(){ dCopy.textContent='¡Copiado!'; setTimeout(function(){ dCopy.textContent='Copiar'; },1600); };
    try{ navigator.clipboard.writeText(dCode.textContent).then(done,function(){ selectCode(); }); }catch(e){ selectCode(); }
    function selectCode(){ var r=document.createRange(); r.selectNodeContents(dCode); var sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); dCopy.textContent='Seleccionado'; setTimeout(function(){ dCopy.textContent='Copiar'; },1600); }
  });
  var dCheck=document.getElementById('dCheck'), dOk=document.getElementById('dOk');
  if(dCheck) dCheck.addEventListener('click',function(){ var on=dCheck.getAttribute('aria-pressed')!=='true'; dCheck.setAttribute('aria-pressed',String(on));
    if(dOk) dOk.textContent=on?'¡Serie hecha! Tu coach ya la ve.':'Tocá el tilde para marcarla.'; if(on&&navigator.vibrate) navigator.vibrate(30); });
  var dChart=document.getElementById('dChart');
  if(dChart){ var tog=function(){ dChart.classList.toggle('up'); }; dChart.addEventListener('click',tog); dChart.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); tog(); } }); }

  // =============== 3) Brillo que sigue al mouse en las tarjetas (solo con mouse) ===============
  if(matchMedia('(hover:hover)').matches) document.addEventListener('pointermove',function(e){ var c=e.target.closest&&e.target.closest('.spot'); if(!c) return;
    var r=c.getBoundingClientRect(); c.style.setProperty('--mx',(e.clientX-r.left)+'px'); c.style.setProperty('--my',(e.clientY-r.top)+'px'); },{passive:true});
})();

// El service worker de la app (scope /GIZE/) también cubre la landing: así Chrome permite
// instalar GIZE desde acá (el ícono abre la app, start_url del manifest).
if("serviceWorker" in navigator) addEventListener("load",function(){ navigator.serviceWorker.register("sw.js",{scope:"./",updateViaCache:"none"}).catch(function(){}); });
