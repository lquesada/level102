/* ===================== Arcade Claw: game (state, input, 3D physics, claw, pointer, fisheye, UI) =====================
   World coordinates: x = left/right, y = "flat" height measured downwards like the screen at the front glass
   (floor at G.floorY), z = depth (0 front glass .. G.depth back wall). Screen: sx = x, sy = y - z*G.depthRise. */
(function(){
const BW=ART.W,BH=ART.H,G=ART.GEOM;
const D=G.depth||40,RISE=G.depthRise==null?.6:G.depthRise;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* ---------- text (everything outside the machine; the machine's own labels stay English) ---------- */
const STR={
  en:{prizes:"Your prizes",prizesAria:n=>`Your prizes: ${n}`,prizesEmpty:"Nothing yet. Grab a toy!",close:"Close",name:"Arcade Claw",hint:"Tap the coin slot, move the joystick, then press GRAB!",congrats:"Congrats!",got:n=>`You got ${n}!`,
      again:"Keep playing",slip:"Oh no, it slipped!",miss:"Nothing this time. Try again!",noCredit:"Insert a coin first!",full:"9 credits is the most!",empty:"The machine is empty! Reset it in Your prizes to play again.",reset:"Reset",resetAsk:"Start over from scratch? Your prizes are cleared and the machine is filled up again.",resetNo:"Cancel",resetYes:"Yes, reset",resetDone:"New game! The machine is full again.",noSave:"Can't save here: your progress is lost when you leave.",
      screen:"Claw machine. Coin slot: C key. Joystick: arrow keys. Grab: space."},
  es:{prizes:"Tus premios",prizesAria:n=>`Tus premios: ${n}`,prizesEmpty:"Todavía nada. ¡Atrapa un peluche!",close:"Cerrar",name:"Máquina de Gancho",hint:"Toca la ranura de monedas, mueve la palanca y pulsa GRAB.",congrats:"¡Enhorabuena!",got:n=>`¡Te llevas ${n}!`,
      again:"Seguir jugando",slip:"¡Oh, no, se ha escapado!",miss:"Esta vez nada. ¡Prueba otra vez!",noCredit:"¡Primero mete una moneda!",full:"¡9 créditos como máximo!",empty:"¡La máquina está vacía! Reiníciala en Tus premios para volver a jugar.",reset:"Reiniciar",resetAsk:"¿Empezar de cero? Se borran tus premios y la máquina se vuelve a llenar.",resetNo:"Cancelar",resetYes:"Sí, reiniciar",resetDone:"¡Partida nueva! La máquina vuelve a estar llena.",noSave:"Aquí no se puede guardar: perderás tu progreso al salir.",
      screen:"Máquina de gancho. Ranura: tecla C. Palanca: flechas. Agarrar: barra espaciadora."},
  de:{prizes:"Deine Preise",prizesAria:n=>`Deine Preise: ${n}`,prizesEmpty:"Noch nichts. Schnapp dir ein Plüschtier!",close:"Schließen",name:"Greifautomat",hint:"Tippe auf den Münzschlitz, beweg den Joystick und drück GRAB!",congrats:"Glückwunsch!",got:n=>`Du hast ${n} gewonnen!`,
      again:"Weiterspielen",slip:"Oh nein, abgerutscht!",miss:"Diesmal nichts. Versuch's nochmal!",noCredit:"Wirf zuerst eine Münze ein!",full:"Mehr als 9 Credits gehen nicht!",empty:"Der Automat ist leer! Starte ihn unter „Deine Preise“ neu, um wieder zu spielen.",reset:"Neu starten",resetAsk:"Ganz von vorn anfangen? Deine Preise werden gelöscht und der Automat wird wieder gefüllt.",resetNo:"Abbrechen",resetYes:"Ja, neu starten",resetDone:"Neues Spiel! Der Automat ist wieder voll.",noSave:"Speichern geht hier nicht: Dein Fortschritt geht beim Verlassen verloren.",
      screen:"Greifautomat. Münzschlitz: Taste C. Joystick: Pfeiltasten. Greifen: Leertaste."}};
const T=()=>STR[L102.lang]||STR.en;
const tname=t=>(t.name&&(t.name[L102.lang]||t.name.en))||t.id;

/* ---------- canvases: scene at 192x342 -> fisheye -> shown with nearest-neighbour ---------- */
const scene=document.createElement("canvas");scene.width=BW;scene.height=BH;
const sx=scene.getContext("2d");sx.imageSmoothingEnabled=false;
const screen=$("screen"),ox=screen.getContext("2d");screen.width=BW;screen.height=BH;
// crisp fisheye: the scene is first blown up with whole-pixel blocks (GPU), then the barrel warp is drawn in small tiles at
// the screen's real resolution. Pixels bend slightly instead of being dropped or doubled (no broken letters).
const big=document.createElement("canvas"),bx=big.getContext("2d");let BK=1,TILES=[];
const FK=.075;   // barrel strength
function barrel(u,v){const cx=BW/2,cy=BH/2,R=Math.hypot(cx,cy),dx=(u-cx)/R,dy=(v-cy)/R,f=(1-FK)+FK*(dx*dx+dy*dy);return[cx+dx*f*R,cy+dy*f*R];}
function buildTiles(OW,OH){BK=Math.max(1,Math.ceil(OW/BW));big.width=BW*BK;big.height=BH*BK;bx.imageSmoothingEnabled=false;
  TILES=[];const TX=18,TY=32;
  for(let j=0;j<TY;j++)for(let i=0;i<TX;i++){const x0=Math.round(OW*i/TX),x1=Math.round(OW*(i+1)/TX),y0=Math.round(OH*j/TY),y1=Math.round(OH*(j+1)/TY);
    const c=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y])=>barrel(x/OW*BW,y/OH*BH));
    const sx0=Math.min(c[0][0],c[2][0]),sx1=Math.max(c[1][0],c[3][0]),sy0=Math.min(c[0][1],c[1][1]),sy1=Math.max(c[2][1],c[3][1]);
    TILES.push([sx0*BK,sy0*BK,(sx1-sx0)*BK,(sy1-sy0)*BK,x0,y0,x1-x0,y1-y0]);}}
// barrel ("fisheye") lookup: output pixel -> source pixel; subtle, the centre bulges a little like the picture
const LUT=new Int32Array(BW*BH);
(function(){const K=.075,cx=BW/2,cy=BH/2,R=Math.hypot(cx,cy);
  for(let y=0;y<BH;y++)for(let x=0;x<BW;x++){const dx=(x+.5-cx)/R,dy=(y+.5-cy)/R,r2=dx*dx+dy*dy,f=(1-K)+K*r2;
    const X=Math.round(cx+dx*f*R-.5),Y=Math.round(cy+dy*f*R-.5);LUT[y*BW+x]=X<0||Y<0||X>=BW||Y>=BH?-1:Y*BW+X;}})();
// the scene is drawn in layers: whatever is in `scene` is blown up into `big` (the first one replaces it), then `scene` is
// cleared for the next layer. The claw is drawn straight into `big` between layers: its pixels are blown up first and
// then rotated at full resolution (smooth edges), so the swinging claw has no moire.
let firstLayer=true;const cbuf=document.createElement("canvas"),cbx=cbuf.getContext("2d");
function flushLayer(){bx.imageSmoothingEnabled=false;bx.globalCompositeOperation=firstLayer?"copy":"source-over";bx.drawImage(scene,0,0,BW*BK,BH*BK);
  bx.globalCompositeOperation="source-over";firstLayer=false;sx.save();sx.setTransform(1,0,0,1,0,0);sx.clearRect(0,0,BW,BH);sx.restore();}
function drawClawHi(img,hx,hy,a,cox){flushLayer();const w=img.width*BK,h=img.height*BK;
  if(cbuf.width!==w||cbuf.height!==h){cbuf.width=w;cbuf.height=h;}else cbx.clearRect(0,0,w,h);
  cbx.imageSmoothingEnabled=false;cbx.drawImage(img,0,0,w,h);
  bx.save();bx.translate(hx*BK,hy*BK);bx.rotate(a);bx.imageSmoothingEnabled=true;bx.drawImage(cbuf,-cox*BK,0);bx.restore();}
function present(){flushLayer();firstLayer=true;ox.imageSmoothingEnabled=false;
  for(const t of TILES)ox.drawImage(big,t[0],t[1],t[2],t[3],t[4],t[5],t[6],t[7]);}

/* ---------- random: rng = looks / placement, roll = the grab outcome (tests can seed it) ---------- */
let rng=Math.random,roll=Math.random;

/* ---------- physics: toys are rigid bodies made of spheres (rotation only in the screen plane) ---------- */
const GRAV=520,REST=0,MU=.9,TIP_R=2.5,SLOP=.25,VMAX=260,WMAX=9,STEP=1/240;
// heavy plush: no bounce, grippy, they stop rolling when they rest on something, slightly tilted toys sit back up,
// and they fall asleep quickly (a sleeping toy only wakes for a real push)
const SQUASH=.35,ROLL=.93,SLIDE=.97,RIGHT=120,UPRIGHT=.75,SLEEP_V=7,SLEEP_T=.35,WAKE_J=6;
let bodies=[],nextId=1;
function makeBody(t,x,y,z,a){const parts=(t.parts&&t.parts.length?t.parts:[{x:0,y:0,r:Math.min(t.w,t.h)*.42}]).map(p=>({x:p.x,y:p.y,r:p.r}));
  let I=0;for(const p of parts)I+=p.r*p.r*.4+p.x*p.x+p.y*p.y;const m=t.mass||1;I=I/parts.length*m;
  const br=Math.max(...parts.map(p=>Math.hypot(p.x,p.y)+p.r));
  return{id:nextId++,t,x,y,z,a:a==null?(rng()-.5)*.5:a,vx:0,vy:0,vz:0,w:0,m,im:1/m,ii:1/I,parts,br,sleep:0,held:false,gone:false,_wp:null};}
function worldParts(b){const c=Math.cos(b.a),s=Math.sin(b.a);return b.parts.map(p=>({x:b.x+p.x*c-p.y*s,y:b.y+p.x*s+p.y*c,z:b.z,r:p.r}));}
const floorY=x=>typeof G.floorAt==="function"?G.floorAt(x):G.floorY;
const kinematic=b=>b.held||b.rising;
const wallL=z=>G.wallL+((G.backL==null?G.wallL:G.backL)-G.wallL)*clamp(z/D,0,1),wallR=z=>G.wallR+((G.backR==null?G.wallR:G.backR)-G.wallR)*clamp(z/D,0,1);
function impulse(b,px,py,jx,jy,jz){if(kinematic(b))return;b.vx+=jx*b.im;b.vy+=jy*b.im;b.vz+=jz*b.im;b.w+=((px-b.x)*jy-(py-b.y)*jx)*b.ii;}
function velAt(b,px,py){return[b.vx-b.w*(py-b.y),b.vy+b.w*(px-b.x),b.vz];}
// contact on body b at point p with normal n (from the other thing into b), depth d; o = other body or null (+ its velocity)
function contact(b,px,py,pz,nx,ny,nz,d,o,ov){
  const va=velAt(b,px,py);let rx=va[0],ry=va[1],rz=va[2];
  if(o){const vb=velAt(o,px,py);rx-=vb[0];ry-=vb[1];rz-=vb[2];}else if(ov){rx-=ov[0];ry-=ov[1];rz-=ov[2];}
  const vn=rx*nx+ry*ny+rz*nz;
  if(o){if(b.mv&&o.sleep)o.sleep=0;else if(o.mv&&b.sleep)b.sleep=0;}   // a moving toy wakes the ones it touches (nothing floats)
  const kA=!kinematic(b),kB=o&&!kinematic(o),imA=kA?b.im:0,iiA=kA?b.ii:0,imB=kB?o.im:0,iiB=kB?o.ii:0;
  const ra=(px-b.x)*ny-(py-b.y)*nx,rb=o?(px-o.x)*ny-(py-o.y)*nx:0,k=imA+imB+ra*ra*iiA+rb*rb*iiB;
  if(k<=0)return;
  const corr=Math.min(1.5,Math.max(0,d-SLOP)*.4)/k;   // gentle position correction with slop, capped (no pops)
  if(kA){b.x+=nx*corr*imA;b.y+=ny*corr*imA;b.z+=nz*corr*imA;}if(kB){o.x-=nx*corr*imB;o.y-=ny*corr*imB;o.z-=nz*corr*imB;}
  if(vn>=0)return;
  const jn=-(1+REST)*vn/k;impulse(b,px,py,nx*jn,ny*jn,nz*jn);if(o)impulse(o,px,py,-nx*jn,-ny*jn,-nz*jn);
  // friction along the sliding direction
  let tx=rx-vn*nx,ty=ry-vn*ny,tz=rz-vn*nz;const tl=Math.hypot(tx,ty,tz);
  if(tl>1e-4){tx/=tl;ty/=tl;tz/=tl;const ta=(px-b.x)*ty-(py-b.y)*tx,tb=o?(px-o.x)*ty-(py-o.y)*tx:0,kt=imA+imB+ta*ta*iiA+tb*tb*iiB;
    if(kt>0){let jt=-tl/kt;const mx=MU*jn;jt=Math.max(jt,-mx);impulse(b,px,py,tx*jt,ty*jt,tz*jt);if(o)impulse(o,px,py,-tx*jt,-ty*jt,-tz*jt);}}
  if(ny<-.5)b.ground=true;if(o&&ny>.5)o.ground=true;   // resting on something below
  if(jn>WAKE_J*(o?Math.min(b.m,o.m):b.m)){b.sleep=0;if(o)o.sleep=0;}}
// the box walls, floor, glass ceiling, and the prize box (a block on the left, all the way back)
function statics(b,P){
  const r=P.r,fy=floorY(P.x),C=G.chute;
  if(P.y+r>fy&&!b.inChute&&!b.rising)contact(b,P.x,fy,P.z,0,-1,0,P.y+r-fy,null);
  const wl=wallL(P.z),wr=wallR(P.z);   // the side walls converge towards the back
  if(P.x-r<wl)contact(b,wl,P.y,P.z,1,0,0,wl-(P.x-r),null);
  if(P.x+r>wr)contact(b,wr,P.y,P.z,-1,0,0,P.x+r-wr,null);
  const rz=r*SQUASH;   // plush squashes flat against the front glass and the back wall
  if(P.z-rz<0)contact(b,P.x,P.y,0,0,0,1,rz-P.z,null);
  if(P.z+rz>D)contact(b,P.x,P.y,D,0,0,-1,P.z+rz-D,null);
  const top=G.glass.y0+2+P.z*RISE;if(P.y-r<top)contact(b,P.x,top,P.z,0,1,0,top-(P.y-r),null);
  if(!b.inChute){
    if(P.z-r<BOXZ+BOXM&&P.x+r>C.x0&&P.x-r<C.x1&&P.y+r>C.y0){/* the box (and just behind it) is solid for the pile */const dTop=P.y+r-C.y0,dRight=C.x1-(P.x-r);
      if(P.z>=BOXZ){   // behind the box there is nothing to sit on (a toy resting there floated, out of reach): it slides back or right
        const dBack=BOXZ+BOXM-(P.z-rz);if(dBack>0){if(P.x>C.x1-1&&dRight<dBack)contact(b,C.x1,P.y,P.z,1,0,0,dRight,null);else contact(b,P.x,P.y,BOXZ+BOXM,0,0,1,dBack,null);}}
      else if(P.x>C.x1-1&&dRight<dTop)contact(b,C.x1,P.y,P.z,1,0,0,dRight,null);else contact(b,P.x,C.y0,P.z,0,-1,0,dTop,null);}}
  else{if(P.x-r<C.x0+1)contact(b,C.x0+1,P.y,P.z,1,0,0,C.x0+1-(P.x-r),null);if(P.x+r>C.x1-1)contact(b,C.x1-1,P.y,P.z,-1,0,0,P.x+r-(C.x1-1),null);}}
function physStep(dt){
  for(const b of bodies){if(kinematic(b)||b.sleep>SLEEP_T){b.ground=false;continue;}b.vy+=GRAV*dt;b.vx*=.999;b.vz*=.995;b.w*=.99;
    if(b.ground){b.w*=ROLL;b.vx*=SLIDE;b.vz*=SLIDE;const a=Math.atan2(Math.sin(b.a),Math.cos(b.a));if(Math.abs(a)<UPRIGHT)b.w-=a*RIGHT*dt;}b.ground=false;
    const v=Math.hypot(b.vx,b.vy,b.vz);if(v>VMAX){const k=VMAX/v;b.vx*=k;b.vy*=k;b.vz*=k;}b.w=clamp(b.w,-WMAX,WMAX);   // no flying off
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.a+=b.w*dt;}
  for(let it=0;it<3;it++){   // three solver passes; sleeping pairs are still checked so overlaps never get stuck
  for(const b of bodies)b._wp=worldParts(b);
  for(let i=0;i<bodies.length;i++){const A=bodies[i];
    for(let j=i+1;j<bodies.length;j++){const B=bodies[j];if(kinematic(A)&&kinematic(B))continue;if(A.inChute||B.inChute)continue;   // inside the prize box: falls freely
      const dx=B.x-A.x,dy=B.y-A.y,dz=B.z-A.z,R=A.br+B.br;if(dx*dx+dy*dy+dz*dz>R*R)continue;
      for(const P of A._wp)for(const Q of B._wp){const ex=Q.x-P.x,ey=Q.y-P.y,ez=Q.z-P.z,rr=P.r+Q.r,d2=ex*ex+ey*ey+ez*ez;if(d2>=rr*rr||d2<1e-6)continue;
        const d=Math.sqrt(d2),nx=-ex/d,ny=-ey/d,nz=-ez/d,f=P.r/rr,cx=P.x+ex*f,cy=P.y+ey*f,cz=P.z+ez*f;
        if(kinematic(A))contact(B,cx,cy,cz,-nx,-ny,-nz,rr-d,null,[A.vx,A.vy,A.vz]);
        else if(kinematic(B))contact(A,cx,cy,cz,nx,ny,nz,rr-d,null,[B.vx,B.vy,B.vz]);
        else contact(A,cx,cy,cz,nx,ny,nz,rr-d,B);}}}}
  const prongs=clawProngs();
  for(const b of bodies){if(b.held)continue;
    const C=G.chute;
    // a toy the claw let go of over the prize box drops in (checked before the box top can stop it)
    if(b.fromClaw&&!b.inChute&&b.x>C.x0-6&&b.x<C.x1+6&&b.y>C.y0-b.br-14&&b.y<C.y0+6){b.inChute=true;   // mostly over the opening: guide it in
      const m=Math.min(b.br*.6,(C.x1-C.x0)/2-2);b.x=clamp(b.x,C.x0+m,C.x1-m);b.vx*=.3;}
    if(b.rising){b.y-=22*dt;b.vy=-22;b.vx=b.vz=b.w=0;if(b.y+b.lowest<=floorY(b.x)){b.rising=false;b.vy=0;}}
    for(const P of worldParts(b)){statics(b,P);
      if(b!==claw.target)for(const c of prongs){   // prong = kinematic capsule from the knuckle to the tip
        const sx_=c.bx-c.ax,sy_=c.by-c.ay,L2=sx_*sx_+sy_*sy_,t=L2>0?clamp(((P.x-c.ax)*sx_+(P.y-c.ay)*sy_)/L2,0,1):0,qx=c.ax+sx_*t,qy=c.ay+sy_*t;
        const ex=P.x-qx,ey=P.y-qy,ez=P.z-c.z,rr=P.r+TIP_R,d2=ex*ex+ey*ey+ez*ez;
        if(d2<rr*rr&&d2>1e-6){const d=Math.sqrt(d2);contact(b,qx+ex/d*TIP_R,qy+ey/d*TIP_R,c.z+ez/d*TIP_R,ex/d,ey/d,ez/d,rr-d,null,c.v);b.sleep=0;}}}
    const sp=Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.vz)+Math.abs(b.w)*6;b.mv=sp>=SLEEP_V;if(!b.mv&&!b.rising)b.sleep+=dt;else b.sleep=0;
    if(b.sleep>SLEEP_T){b.vx=b.vy=b.vz=b.w=0;}
    if(b.inChute&&b.y-b.br*.3>C.y1&&!b.gone){b.gone=true;onWon(b);}}
  bodies=bodies.filter(b=>!b.gone);}

/* ---------- the pile, composed like the picture: the cutest in a front row facing us, a second row a bit further
   back, and a back row peeking over (also behind the prize box). ~20 toys, small overlaps only. ---------- */
const START_TOYS=34,BOXZ=G.chute.z1||D*.5,BOXM=8;   // BOXM: toys right behind the box would look as if inside it   // the prize box only fills the front of the depth: toys sit behind it
function shuffled(a){const c=a.slice();for(let i=c.length-1;i>0;i--){const j=(rng()*(i+1))|0;[c[i],c[j]]=[c[j],c[i]];}return c;}
const lowest=t=>Math.max(...(t.parts&&t.parts.length?t.parts:[{y:0,r:Math.min(t.w,t.h)*.42}]).map(p=>p.y+p.r));
const halfW=t=>Math.max(...(t.parts&&t.parts.length?t.parts:[{x:0,r:Math.min(t.w,t.h)*.42}]).map(p=>Math.abs(p.x)+p.r));
const depthR=t=>Math.max(...(t.parts&&t.parts.length?t.parts:[{r:8}]).map(p=>p.r));
function placeRow(toys,x0,x1,z,i){ // a tidy row: standing up, tallest in the middle, evenly spaced and centred
  const row=[];[...toys].sort((p,q)=>q.h-p.h).forEach((t,k)=>k%2?row.push(t):row.unshift(t));
  const ws=row.map(halfW),sum=ws.reduce((a,b)=>a+2*b,0),gap=Math.min(4,(x1-x0-sum)/Math.max(1,row.length-1));
  let x=x0+Math.max(0,(x1-x0-sum-gap*(row.length-1))/2);
  row.forEach((t,k)=>{x+=ws[k];const a=(rng()-.5)*(i<2?.06:.2),zz=z+(gap<0?(k%2?1.5:-1.5):0);
    bodies.push(makeBody(t,x,floorY(x)-lowest(t)-.3,zz,a));x+=ws[k]+gap;});}
// how many toys fit in a width with ~20% overlap; a shape already in the machine only comes back when no new shape fits
let shapes=new Map();
function takeRow(src,used,w,k,max=99){const out=[];let acc=0;
  for(const most of[1,2,99])for(const t of src){const sh=t.shape||t.id;if(out.length>=max)break;if(used.has(t.id)||(shapes.get(sh)||0)>=most)continue;const tw=2*halfW(t)*k;if(acc+tw>w&&out.length)continue;if(acc+tw>w)break;out.push(t);used.add(t.id);shapes.set(sh,(shapes.get(sh)||0)+1);acc+=tw;}
  return out;}
// the top of whatever is under x at depth z (toys or the floor), for stacking a toy of half width hw on it
function surface(x,z,hw,skip){let top=floorY(x);for(const b of bodies){if(skip.has(b)||Math.abs(b.z-z)>11||Math.abs(b.x-x)>halfW(b.t)*.7+hw*.5)continue;for(const P of worldParts(b))top=Math.min(top,P.y-P.r);}return top;}
function spawnPile(n){const L=TOYS.list.filter(t=>!t.retired).sort((a,b)=>(b.cute||0)-(a.cute||0)),used=new Set(),C=G.chute,R0=Math.max(...L.map(depthR),8);
  const x0=z=>z<BOXZ+BOXM+R0?C.x1+2:wallL(z)+1,x1=z=>wallR(z)-1;shapes=new Map();
  // the floor: four standing rows from the front glass to the back wall; the cutest (not too big) in the two front rows
  const small=L.filter(t=>t.h<=32),zf=R0*SQUASH+.5,zb=D-R0*SQUASH-.5,zs=[0,1,2,3].map(i=>zf+(zb-zf)*i/3);
  zs.forEach((z,i)=>placeRow(takeRow(i<2?small:shuffled(L),used,x1(z)-x0(z),i<2?1:.95,Math.max(2,n-bodies.length-2*(3-i))),x0(z),x1(z),z,i));settle(.5);
  // then ONE layer on top, only towards the back (nestled between the back rows)
  const rest=shuffled(L.filter(t=>!used.has(t.id)));let count=bodies.length;
  for(const z of[(zs[2]+zs[3])/2,(zs[1]+zs[2])/2]){if(count>=n)break;const row=takeRow(rest,used,x1(z)-x0(z)-8,1,n-count);if(!row.length)break;
    placeRow(row,x0(z)+4,x1(z)-4,z,3);const nw=new Set(bodies.slice(-row.length));for(const b of nw){b.y=surface(b.x,b.z,halfW(b.t),nw)-lowest(b.t)-.5;}
    count+=row.length;settle(.45);}}
function settle(sec){ // gentle: strong damping so the rows stay rows
  for(let t=0;t<sec;t+=STEP){physStep(STEP);for(const b of bodies){b.vx*=.9;b.vy*=.94;b.vz*=.85;b.w*=.9;}}   // short and damped: they lean and push, but stay tidy-ish
  for(const b of bodies){b.vx=b.vy=b.vz=b.w=0;b.sleep=1;}}
/* ---------- the claw: moves in x (left/right) and z (back/front), swings as a 2D pendulum ---------- */
const PARK={x:G.dropX,z:G.chute.z1?G.chute.z1/2:D*.3};   // like a real machine: the claw waits over the prize box
const claw={x:PARK.x,y:G.clawTopY,z:PARK.z,target:null,closeTo:0,spreadV:0,slipped:false,vx:0,vy:0,vz:0,angX:0,angXV:0,angZ:0,angZV:0,open:0,mode:"idle",timer:0,held:null,holdOff:[0,0,0],holdA:0,willDrop:false,dropAt:0,dropT:99,holdP:1,got:false};
const MAXV=58,MAXVZ=34,ACC=220,DOWN=46,UP=42;
let joyX=0,joyY=0,keyX=0,keyY=0,ptrJoy=null,grabFlash=0,now=0;
let credits=0,creditsFlash=0,coinT=-1,coinQ=0;
const jx=()=>clamp(joyX||keyX,-1,1),jy=()=>clamp(joyY||keyY,-1,1);
function clawState(){const L=12+(claw.y-G.clawTopY);
  return{t:now,clawX:claw.x,clawY:claw.y,clawZ:clamp(claw.z+Math.sin(claw.angZ)*Math.min(8,L*.25),0,D),clawAngle:claw.angX,clawOpen:claw.open,
    joyX:jx(),joyY:jy(),grabDown:grabFlash>0,credits,creditsFlash,coinT,busy:claw.mode!=="idle",prizes:prizeCount(),prizesDown:prizesDown>0,prizeNew};}
// prong tips in world coordinates (ART gives screen coordinates; the claw at depth z is drawn z*RISE higher)
function grip(st){const g=ART.clawGrip(st||clawState());return{x:g.x,y:g.y+g.z*RISE,z:g.z,spread:g.spread};}
function clawTips(){const g=grip();return[{x:g.x-g.spread,y:g.y,z:g.z,r:TIP_R},{x:g.x+g.spread,y:g.y,z:g.z,r:TIP_R}];}
function clawProngs(){const st=clawState(),a=ART.clawGrip(st),g=grip(st),hy=a.hubY+a.z*RISE,sv=claw.spreadV||0;
  return[{ax:a.hubX-3,ay:hy+6,bx:g.x-g.spread,by:g.y,z:g.z,v:[claw.vx-sv,claw.vy,claw.vz]},{ax:a.hubX+3,ay:hy+6,bx:g.x+g.spread,by:g.y,z:g.z,v:[claw.vx+sv,claw.vy,claw.vz]}];}
// what is right under the claw: the toy and the height of the surface (for the red pointer)
function below(){const g=grip();let top=floorY(g.x),hit=null;
  for(const b of bodies){if(b.held||b.inChute)continue;for(const P of (b._wp||worldParts(b))){const dx=P.x-g.x,dz=P.z-g.z,q=P.r*P.r-dx*dx-dz*dz;if(q<=0)continue;const ty=P.y-Math.sqrt(q);if(ty<top&&ty>g.y-2){top=ty;hit=b;}}}
  return{x:g.x,y:top,z:g.z,b:hit,tipY:g.y};}
function startGrab(){
  if(claw.mode!=="idle"||busyPrize())return;
  if(credits<=0){nudge();return;}
  credits--;creditsFlash=1;grabFlash=.25;claw.mode="opening";claw.timer=0;claw.slipped=false;claw.got=false;hideHint();}
// no credit: the coin slot blinks and the hint comes back
let coinBlink=0,hintT=0;function nudge(){coinBlink=2.5;$("toast").classList.remove("on");hintOff=false;$("hint").classList.remove("off");clearTimeout(hintT);hintT=setTimeout(hideHint,3500);}
const canMove=()=>credits>0||coinT>=0;
// a real pendulum on the moving trolley: only the trolley's acceleration swings it. ART rotates the claw clockwise for a
// positive angle (its bottom goes LEFT), so speeding up to the right gives a positive angle: the claw lags behind, then follows.
function swing(dt,ax,az){const L=12+(claw.y-G.clawTopY),gL=300/L;
  claw.angXV+=(-gL*Math.sin(claw.angX)+(ax/L)*Math.cos(claw.angX)*.45-1.3*claw.angXV)*dt;claw.angX=clamp(claw.angX+claw.angXV*dt,-.35,.35);
  claw.angZV+=(-gL*Math.sin(claw.angZ)-(az/L)*Math.cos(claw.angZ)*.45-1.3*claw.angZV)*dt;claw.angZ=clamp(claw.angZ+claw.angZV*dt,-.35,.35);}
function steer(tx,tz){const ax=clamp((clamp((tx-claw.x)*3,-MAXV*.9,MAXV*.9)-claw.vx)*6,-ACC,ACC),az=clamp((clamp((tz-claw.z)*3,-MAXVZ,MAXVZ)-claw.vz)*6,-ACC,ACC);return[ax,az];}
function clawUpdate(dt){
  let ax,az;
  const mv=claw.mode==="test"||claw.mode==="idle"&&canMove();   // no coin, no moving (touching the joystick puts one in)
  if(claw.mode==="idle"||claw.mode==="test"){ax=clamp(((mv?jx():0)*MAXV-claw.vx)*7,-ACC,ACC);az=clamp(((mv?jy():0)*MAXVZ-claw.vz)*7,-ACC,ACC);}
  else if(claw.mode==="carry")[ax,az]=steer(PARK.x,PARK.z);
  else{ax=clamp(-claw.vx*7,-ACC,ACC);az=clamp(-claw.vz*7,-ACC,ACC);}
  claw.vx+=ax*dt;claw.vz+=az*dt;let nx=claw.x+claw.vx*dt,nz=claw.z+claw.vz*dt;
  if(nx<G.clawMinX){nx=G.clawMinX;claw.vx=0;ax=0;}if(nx>G.clawMaxX){nx=G.clawMaxX;claw.vx=0;ax=0;}
  if(nz<0){nz=0;claw.vz=0;az=0;}if(nz>D){nz=D;claw.vz=0;az=0;}claw.x=nx;claw.z=nz;
  swing(dt,ax,az);
  claw.timer+=dt;const prevY=claw.y,prevOpen=claw.open;
  switch(claw.mode){
    case"opening":claw.open=Math.min(1,claw.open+dt*3);if(claw.open>=1){claw.mode="down";claw.timer=0;}break;
    case"down":{claw.y+=DOWN*dt;   // no made-up wobble: it only swings from real motion
      // go down until the prong tips reach around the middle of the toy below (or the floor)
      if(claw.timer<.05||!claw.target)claw.target=below().b;const tipY=grip().y,goal=claw.target?claw.target.y:floorY(claw.x)-3;
      if(tipY>=goal||tipY>=floorY(claw.x)-3||claw.timer>5){claw.mode="closing";claw.timer=0;
        claw.target=between();claw.closeTo=claw.target?clamp((halfW(claw.target.t)*.72-3)/16,0,.85):0;}break;}
    case"closing":claw.open=Math.max(claw.closeTo,claw.open-dt*1.6);if(claw.open<=claw.closeTo){claw.mode="grip";claw.timer=0;tryGrip();claw.target=null;}break;
    case"grip":if(claw.timer>.35){claw.mode="up";claw.timer=0;}break;
    case"up":claw.y-=UP*dt;
      if(claw.held&&claw.willDrop&&claw.y<claw.dropAt)loseGrip(T().slip);
      if(claw.y<=G.clawTopY){claw.y=G.clawTopY;claw.mode="carry";claw.timer=0;if(!claw.held&&!claw.slipped)toast(T().miss);}break;
    case"carry":if(claw.held&&claw.willDrop&&claw.timer>claw.dropT)loseGrip(T().slip);
      if(Math.abs(claw.x-PARK.x)<.8&&Math.abs(claw.vx)<6&&Math.abs(claw.z-PARK.z)<1.5){claw.mode="release";claw.timer=0;}break;
    case"release":claw.open=Math.min(1,claw.open+dt*2.5);if(claw.held&&claw.open>.4)release();if(claw.timer>1.1){claw.mode="close2";claw.timer=0;}break;
    case"close2":claw.open=Math.max(0,claw.open-dt*2);if(claw.open<=0){claw.mode="idle";claw.timer=0;}break;   // parked over the prize box
    case"test":break;}
  claw.vy=(claw.y-prevY)/dt;claw.spreadV=(claw.open-prevOpen)/dt*16;
  if(claw.held){const g=grip(),b=claw.held,c=Math.cos(claw.angX),s=Math.sin(claw.angX);
    const tx=g.x+claw.holdOff[0]*c-claw.holdOff[1]*s,ty=g.y+claw.holdOff[0]*s+claw.holdOff[1]*c,tz=g.z+claw.holdOff[2];
    b.vx=(tx-b.x)/dt;b.vy=(ty-b.y)/dt;b.vz=(tz-b.z)/dt;b.x=tx;b.y=ty;b.z=tz;b.a+=((claw.holdA+claw.angX)-b.a)*Math.min(1,dt*8);b.w=0;}}
function tryGrip(){const st=clawState(),gc=grip(st),go=grip(Object.assign({},st,{clawOpen:1})),g={x:gc.x,y:Math.max(gc.y,go.y),z:gc.z,spread:go.spread};let best=null,bs=-1;
  for(const b of bodies){if(b.inChute)continue;let inside=0;
    for(const P of worldParts(b)){if(Math.abs(P.x-g.x)<g.spread+P.r*.3&&Math.abs(P.z-g.z)<P.r+3&&P.y>g.y-P.r-10&&P.y<g.y+P.r+6)inside+=P.r;}
    if(inside>0){const centred=1-Math.min(1,Math.hypot(b.x-g.x,(b.z-g.z)*1.3)/(g.spread+3));const score=inside*(.4+centred);if(score>bs){bs=score;best=b;}}}
  if(!best){claw.held=null;return;}
  const centred=1-Math.min(1,Math.hypot(best.x-g.x,(best.z-g.z)*1.3)/(g.spread+3)),gr=best.t.grip==null?.6:best.t.grip;
  claw.holdP=clamp(.15+.85*centred*gr+.15,0,.95);
  // 1 in 3: the claw opens on the way; otherwise it depends on how centred it grabbed and how grippy the toy is
  const cheat=roll()<1/3,slips=roll()>claw.holdP;claw.willDrop=cheat||slips;
  claw.dropAt=slips&&!cheat?g.y-6-rng()*6:G.clawTopY+10+rng()*30;claw.dropT=cheat?.2+rng()*.8:99;
  best.held=true;best.sleep=0;claw.held=best;const c=Math.cos(-claw.angX),s=Math.sin(-claw.angX),ox_=clamp(best.x-g.x,-2,2),oy_=clamp(best.y-gc.y,-5,3);
  claw.holdOff=[ox_*c-oy_*s,ox_*s+oy_*c,clamp(best.z-g.z,-2,2)];claw.holdA=clamp(best.a-claw.angX,-.25,.25);   // middle of the toy between the tips
  for(const b of bodies)if(Math.abs(b.x-g.x)<b.br+30&&Math.abs(b.z-g.z)<b.br+16)b.sleep=0;}   // only the toys around the claw wake up
// the toy that sits between the open prongs right now (the one to close around)
function between(){const st=clawState(),g=grip(Object.assign({},st,{clawOpen:1}));let best=null,bs=-1;
  for(const b of bodies){if(b.inChute||b.held)continue;let inside=0;
    for(const P of worldParts(b))if(Math.abs(P.x-g.x)<g.spread&&Math.abs(P.z-g.z)<P.r+3&&Math.abs(P.y-g.y)<P.r+8)inside+=P.r;
    if(inside>bs){bs=inside;best=inside>0?b:best;}}
  return best;}
function loseGrip(msg){const b=claw.held;if(!b)return;claw.slipped=true;b.fromClaw=claw.x<G.chute.x1+4;b.held=false;b.sleep=0;b.w=(rng()-.5)*3;claw.held=null;claw.willDrop=false;claw.open=.6;
  setTimeout(()=>{if(claw.mode!=="release")claw.open=0;},250);if(msg)toast(msg);}
function release(){const b=claw.held;if(!b)return;b.fromClaw=true;b.held=false;b.sleep=0;b.vx=claw.vx;b.vy=10;b.vz=0;claw.held=null;}

/* ---------- coins, credits ---------- */
function insertCoin(){if(busyPrize())return;coinBlink=0;if(credits+coinQ+(coinT>=0?1:0)>=9){toast(T().full);return;}hideHint();if(coinT<0)coinT=0;else coinQ++;}
function coinUpdate(dt){if(coinT>=0){coinT+=dt/.6;if(coinT>=1){coinT=-1;credits=Math.min(9,credits+1);creditsFlash=1;if(coinQ>0){coinQ--;coinT=0;}}}
  creditsFlash=Math.max(0,creditsFlash-dt*1.2);prizeNew=Math.max(0,prizeNew-dt*.5);prizesDown=Math.max(0,prizesDown-dt);grabFlash=Math.max(0,grabFlash-dt);coinBlink=Math.max(0,coinBlink-dt);}

/* ---------- won ---------- */
let lastPrize=null,wins=0;
/* prizes won (saved with the game, see save()); newest first */
let won=[],prizeNew=0,prizesDown=0;
function addPrize(t){const e=won.find(w=>w.t.id===t.id);if(e){e.n++;won=[e,...won.filter(w=>w!==e)];}else won.unshift({t,n:1});prizeNew=1;paintPrizesBtn();if(!$("prizesDlg").hidden)renderPrizes();}   // the open list updates itself
const prizeCount=()=>won.reduce((a,w)=>a+w.n,0);
function paintPrizesBtn(){const b=$("prizesBtn"),T_=T();b.setAttribute("aria-label",T_.prizesAria(prizeCount()));b.title=T_.prizes;}
function openPrizes(){if(busyPrize())return;prizesDown=.25;askReset(false);renderPrizes();$("prizesDlg").hidden=false;setTimeout(()=>$("pzClose").focus(),30);}
function renderPrizes(){const T_=T(),g=$("pzGrid");g.textContent="";$("pzTitle").textContent=T_.prizes;$("pzClose").textContent=T_.close;$("pzReset").textContent=T_.reset;$("pzReset").disabled=claw.mode!=="idle";
  $("pzAskT").textContent=T_.resetAsk;$("pzNo").textContent=T_.resetNo;$("pzYes").textContent=T_.resetYes;
  $("pzEmpty").textContent=T_.prizesEmpty;$("pzEmpty").hidden=won.length>0;
  for(const w of won){const it=document.createElement("div");it.className="it";const c=TOYS.big(w.t.id,3),nm=document.createElement("span");nm.textContent=tname(w.t);
    it.append(c,nm);if(w.n>1){const n=document.createElement("span");n.className="n";n.textContent="×"+w.n;it.append(n);}g.append(it);}}
function closePrizes(){if($("prizesDlg").hidden)return;$("prizesDlg").hidden=true;$("prizesBtn").focus({preventScroll:true});}
$("prizesBtn").addEventListener("click",openPrizes);$("pzClose").addEventListener("click",closePrizes);
// reset (asks first): the whole game starts again, prizes cleared, the machine full, and that is saved
function askReset(on){$("pzAsk").hidden=!on;$("pzRow").hidden=on;document.querySelector("#prizesDlg .card").classList.toggle("asking",on);if(on)$("pzNo").focus();}
$("pzReset").addEventListener("click",()=>{if(claw.mode==="idle")askReset(true);});
$("pzNo").addEventListener("click",()=>{askReset(false);$("pzReset").focus();});
$("pzYes").addEventListener("click",()=>{resetGame();askReset(false);closePrizes();toast(T().resetDone);});
function resetGame(){won=[];wins=0;lastPrize=null;prizeNew=0;credits=0;coinQ=0;coinT=-1;claw.held=null;claw.target=null;bodies=[];
  spawnPile(START_TOYS);settle(1.4);paintPrizesBtn();save(true);}
$("prizesDlg").addEventListener("click",e=>{if(e.target.id==="prizesDlg")closePrizes();});
addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("pzAsk").hidden)$("pzNo").click();else if(!$("prizesDlg").hidden)closePrizes();else if(!$("prize").hidden)$("pOk").click();}});
function onWon(b){claw.got=true;lastPrize=b.t;wins++;addPrize(b.t);save(true);const P=$("prize"),T_=T();$("pTitle").textContent=T_.congrats;$("pText").textContent=T_.got(tname(b.t));
  $("pOk").textContent=T_.again;const big=TOYS.big(b.t.id,6),ic=$("pIcon");ic.width=big.width;ic.height=big.height;
  const ix=ic.getContext("2d");ix.imageSmoothingEnabled=false;ix.drawImage(big,0,0);P.hidden=false;setTimeout(()=>$("pOk").focus(),50);
  }   // no new toys: the machine slowly empties (only Reset, in the prizes, fills it again)
const empty=()=>!bodies.some(b=>!b.inChute&&!b.gone);

const busyPrize=()=>!$("prize").hidden||!$("prizesDlg").hidden;
$("pOk").addEventListener("click",()=>{$("prize").hidden=true;screen.focus({preventScroll:true});if(empty())toast(T().empty);});

/* ---------- input: map screen points back through the fisheye to machine pixels ---------- */
function toMachine(e){const r=screen.getBoundingClientRect();const u=Math.floor((e.clientX-r.left)/r.width*BW),v=Math.floor((e.clientY-r.top)/r.height*BH);
  if(u<0||v<0||u>=BW||v>=BH)return null;const j=LUT[v*BW+u];return j<0?null:[j%BW,(j/BW)|0];}
const pad=(R,n)=>({x0:R.x0-n,y0:R.y0-n,x1:R.x1+n,y1:R.y1+n});
const inRect=(p,R)=>p&&p[0]>=R.x0&&p[0]<=R.x1&&p[1]>=R.y0&&p[1]<=R.y1;
screen.addEventListener("pointerdown",e=>{const p=toMachine(e);if(!p)return;const J=G.joystick;
  if(Math.hypot(p[0]-J.cx,p[1]-J.cy)<J.r+6){if(!canMove()&&claw.mode==="idle")insertCoin();else hideHint();ptrJoy={id:e.pointerId,x0:e.clientX,y0:e.clientY};try{screen.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return;}
  if(inRect(p,pad(G.grab,4))){startGrab();e.preventDefault();return;}
  if(inRect(p,pad(G.coin,4))){insertCoin();e.preventDefault();return;}});
screen.addEventListener("pointermove",e=>{if(!ptrJoy||e.pointerId!==ptrJoy.id)return;const r=screen.getBoundingClientRect(),k=r.width/BW;
  joyX=clamp((e.clientX-ptrJoy.x0)/k/8,-1,1);joyY=clamp(-(e.clientY-ptrJoy.y0)/k/8,-1,1);});   // stick up = back
const endJoy=e=>{if(ptrJoy&&e.pointerId===ptrJoy.id){ptrJoy=null;joyX=joyY=0;}};
screen.addEventListener("pointerup",endJoy);screen.addEventListener("pointercancel",endJoy);
const keys=new Set();const keyAxes=()=>{keyX=(keys.has("ArrowRight")?1:0)-(keys.has("ArrowLeft")?1:0);keyY=(keys.has("ArrowUp")?1:0)-(keys.has("ArrowDown")?1:0);};
addEventListener("keydown",e=>{if(e.target.closest&&e.target.closest("#l102bar,#prize"))return;
  if(e.key.startsWith("Arrow")){keys.add(e.key);keyAxes();if(!canMove()&&claw.mode==="idle"&&!e.repeat)insertCoin();else hideHint();e.preventDefault();}
  else if(e.key===" "||e.key==="Enter"){if(!busyPrize()){startGrab();e.preventDefault();}}
  else if(e.key==="c"||e.key==="C"){insertCoin();}});
addEventListener("keyup",e=>{if(keys.delete(e.key))keyAxes();});
addEventListener("blur",()=>{keys.clear();keyAxes();joyX=joyY=0;ptrJoy=null;});

/* ---------- hint, toast, texts ---------- */
let hintOff=false;function hideHint(){if(!hintOff){hintOff=true;$("hint").classList.add("off");}}
let toastT=0;function toast(m){const el=$("toast");el.textContent=m;el.classList.add("on");clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove("on"),2200);}
function paintTexts(){const T_=T();document.title=T_.name;$("hint").textContent=T_.hint;screen.setAttribute("aria-label",T_.screen);paintPrizesBtn();if(!$("prizesDlg").hidden)renderPrizes();
  if(!$("prize").hidden&&lastPrize){$("pTitle").textContent=T_.congrats;$("pText").textContent=T_.got(tname(lastPrize));$("pOk").textContent=T_.again;}}
addEventListener("l102:lang",paintTexts);

/* ---------- layout: biggest crisp (integer device-pixel) scale that fits ---------- */
function layout(){const st=$("stage").getBoundingClientRect(),dpr=devicePixelRatio||1;
  // crisp whole device-pixel scale when that loses little; otherwise use the space
  let k=Math.min(st.width*dpr/BW,st.height*dpr/BH);if(k>=1&&Math.floor(k)/k>=.85)k=Math.floor(k);const w=BW*k/dpr,h=BH*k/dpr,L=(st.width-w)/2,Tp=(st.height-h)/2;
  Object.assign(screen.style,{width:w+"px",height:h+"px",left:L+"px",top:Tp+"px"});
  {const OW=Math.max(BW,Math.round(w*dpr)),OH=Math.max(BH,Math.round(h*dpr));if(!TILES.length||screen.width!==OW||screen.height!==OH){screen.width=OW;screen.height=OH;buildTiles(OW,OH);}}
  placePrizesBtn();
  // the hint sits beside the machine when there is room, else on top of the marquee for a moment
  const hs=$("hint").style;if(L>=170){Object.assign(hs,{left:(L/2)+"px",right:"auto",margin:"0",width:"",top:(Tp+h*.42)+"px",maxWidth:(L-24)+"px",transform:"translate(-50%,-50%)"});}
  else Object.assign(hs,{left:"0",right:"0",margin:"0 auto",width:"fit-content",top:"10px",maxWidth:"min(92%,460px)",transform:"none"});}
function placePrizesBtn(){const R=G.prizes,b=$("prizesBtn");if(!R){b.style.display="none";return;}
  const st=$("stage").getBoundingClientRect(),a=machineToClient(R.x0,R.y0),c=machineToClient(R.x1,R.y1);
  Object.assign(b.style,{display:"",left:(a[0]-st.left-2)+"px",top:(a[1]-st.top-2)+"px",width:(c[0]-a[0]+4)+"px",height:(c[1]-a[1]+4)+"px"});}
// machine pixel -> client point (inverse of the fisheye lookup)
function machineToClient(mx,my){let best=-1,bd=1e9;for(let i=0;i<LUT.length;i++){const j=LUT[i];if(j<0)continue;const d=Math.abs(j%BW-mx)+Math.abs(((j/BW)|0)-my);if(d<bd){bd=d;best=i;if(!d)break;}}
  const r=screen.getBoundingClientRect();return[r.left+(best%BW+.5)*r.width/BW,r.top+(((best/BW)|0)+.5)*r.height/BH];}
addEventListener("resize",layout);

/* ---------- drawing the toys back to front, with the pointer at its depth ---------- */
function drawPointer(ctx,u){const blink=(now*3.2%1)<.62,sy0=Math.round(u.tipY-u.z*RISE+3),sy1=Math.round(u.y-u.z*RISE),x=Math.round(u.x);
  ctx.fillStyle="rgba(0,0,0,.3)";ctx.beginPath();ctx.ellipse(x+.5,sy1,6,2,0,0,Math.PI*2);ctx.fill();   // soft shadow on the surface below
  if(blink&&sy1>sy0){ctx.fillStyle="#ff2a3a";ctx.fillRect(x,sy0,1,sy1-sy0);ctx.fillStyle="#ffb0b6";ctx.fillRect(x,sy1-1,1,1);}}
/* depth order, back to front: toys behind the claw (layers.toys), the claw's back prongs, the toys right between the prongs
   and the held one (layers.held), the front prong, then the toys in front of it (layers.front). The prize box is drawn at its
   own depth (BOXZ) in whichever of those two lists it falls: its back face, the toys falling inside it, its front glass. */
const MIDZ=6;   // toys up to this far in front of the claw are inside its reach: behind the front prong
let frontQ=[],midQ=[],boxLater=false,hlToy=null;
function drawToy(ctx,b){const opts={highlight:b===hlToy,shade:clamp(b.z/D,0,1)*.55},X=Math.round(b.x),Y=Math.round(b.y-b.z*RISE);
  if(!b.rising){const by=Math.round(b.y+lowest(b.t)*Math.cos(b.a)-b.z*RISE);ctx.fillStyle="rgba(8,4,20,.32)";ctx.beginPath();ctx.ellipse(X+.5,by-.5,halfW(b.t)*.8,2.2,0,0,Math.PI*2);ctx.fill();}   // soft contact shadow
  if(b.rising){ctx.save();ctx.beginPath();ctx.rect(0,0,BW,Math.round(floorY(b.x)-b.z*RISE));ctx.clip();TOYS.draw(ctx,b.t.id,X,Y,b.a,opts);ctx.restore();}
  else TOYS.draw(ctx,b.t.id,X,Y,b.a,opts);}
function screenBox(b){const hw=halfW(b.t)+2,X=b.x,Y=b.y-b.z*RISE;return{x0:X-hw,x1:X+hw,y0:Y-b.br-2,y1:Y+b.br+2};}
const overlap=(A,B)=>A.x0<B.x1&&B.x0<A.x1&&A.y0<B.y1&&B.y0<A.y1;
function clawBox(){const a=ART.clawGrip(clawState());let R={x0:Math.min(a.hubX,a.x)-a.spread-6,x1:Math.max(a.hubX,a.x)+a.spread+6,y0:a.hubY-4,y1:a.y+4};
  if(claw.held){const h=screenBox(claw.held);R={x0:Math.min(R.x0,h.x0),x1:Math.max(R.x1,h.x1),y0:Math.min(R.y0,h.y0),y1:Math.max(R.y1,h.y1)};}return R;}
const byDepth=(a,b)=>b.z-a.z||a.y-b.y;
function drawBox(ctx){ART.drawBox(ctx,false);for(const b of bodies.filter(b=>b.inChute&&!b.held).sort(byDepth))drawToy(ctx,b);ART.drawBox(ctx,true);}
// toys back to front; the prize box goes in before the first toy in front of its back face, the pointer before the first toy in front of it
function drawList(ctx,list,box,u){let drew=!u;
  for(const b of list){if(box&&b.z<BOXZ){drawBox(ctx);box=false;}if(!drew&&b.z<u.z){drawPointer(ctx,u);drew=true;}drawToy(ctx,b);}
  if(!drew)drawPointer(ctx,u);if(box)drawBox(ctx);}
const layers={box:true,
  toys(ctx){const showP=claw.mode==="idle"||claw.mode==="opening"||claw.mode==="down";const u=showP?below():null;hlToy=u&&u.b;
    const gz=ART.clawGrip(clawState()).z,zc=gz-1,R=clawBox(),back=[];frontQ=[];midQ=[];
    for(const b of bodies.filter(b=>!b.held&&!b.inChute).sort(byDepth)){
      if(b.z>=zc)back.push(b);else if((b===claw.target||gz-b.z<MIDZ)&&overlap(screenBox(b),R))midQ.push(b);else frontQ.push(b);}
    boxLater=BOXZ<zc;drawList(ctx,back,!boxLater,u);},
  front(ctx){drawList(ctx,frontQ,boxLater,null);},
  claw(ctx,img,hx,hy,a,cox){drawClawHi(img,hx,hy,a,cox);},
  held(ctx){for(const b of midQ)drawToy(ctx,b);const b=claw.held;if(b)TOYS.draw(ctx,b.t.id,Math.round(b.x),Math.round(b.y-b.z*RISE),b.a,{shade:clamp(b.z/D,0,1)*.55});}};
/* ---------- main loop ---------- */
let last=performance.now(),acc=0,raf=0;const perf={frames:0,sum:0,max:0,reset(){this.frames=this.sum=this.max=0;}};
/* ---------- saved game (localStorage "arcadeclaw.save", versioned): prizes, credits and where every toy is.
   Saved when everything rests with the claw idle, right after a win, and when leaving (mid-grab: the last resting
   state, so a reload goes back to just before that grab). Loading validates everything (ids, numbers, ranges). ---------- */
const SAVE_KEY="arcadeclaw.save";let saveT=0,lastSaved="",saveWarned=false;
function save(force){const toys=bodies.filter(b=>!b.inChute&&!b.gone).map(b=>[b.t.id,+b.x.toFixed(2),+b.y.toFixed(2),+b.z.toFixed(2),+b.a.toFixed(3)]);
  const s=JSON.stringify({v:1,credits:Math.min(9,credits+coinQ+(coinT>=0?1:0)),won:won.map(w=>[w.t.id,w.n]),toys});if(s===lastSaved&&!force)return;
  try{localStorage.setItem(SAVE_KEY,s);lastSaved=s;}catch(_){if(!saveWarned){saveWarned=true;toast(T().noSave);}}}
function load(){let d;try{d=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");}catch(_){return false;}
  if(!d||typeof d!=="object"||d.v!==1||!Array.isArray(d.toys)||!Array.isArray(d.won))return false;
  const byId={};for(const t of TOYS.list)byId[t.id]=t;const num=(v,a,b)=>typeof v==="number"&&Number.isFinite(v)&&v>=a&&v<=b;
  const toys=[];for(const r of d.toys.slice(0,120)){if(!Array.isArray(r)||!Object.prototype.hasOwnProperty.call(byId,r[0]))continue;const[id,x,y,z,a]=r;
    if(!num(x,0,BW)||!num(y,0,BH)||!num(z,-5,D+5)||!num(a,-1e3,1e3))continue;toys.push([byId[id],x,y,clamp(z,0,D),a]);}
  if(d.toys.length&&!toys.length)return false;   // nothing usable: start a fresh machine
  const prizes=[];for(const r of d.won.slice(0,500)){if(!Array.isArray(r)||!Object.prototype.hasOwnProperty.call(byId,r[0])||!Number.isInteger(r[1])||r[1]<1||r[1]>9999)continue;if(!prizes.some(p=>p.t.id===r[0]))prizes.push({t:byId[r[0]],n:r[1]});}
  bodies=toys.map(([t,x,y,z,a])=>{const b=makeBody(t,clamp(x,wallL(z)+2,wallR(z)-2),Math.min(y,floorY(x)),z,a);b.sleep=1;return b;});settle(.25);
  // older versions let toys rest on a shelf right behind the prize box, floating out of reach: wake them so they slide off and fall
  const C=G.chute;for(const b of bodies)if(b.z>=BOXZ&&b.x+b.br>C.x0&&b.x-b.br<C.x1&&b.y+lowest(b.t)<floorY(b.x)-3&&worldParts(b).some(P=>P.z-P.r*SQUASH<BOXZ+BOXM))b.sleep=0;
  won=prizes;wins=prizes.reduce((a,p)=>a+p.n,0);credits=Number.isInteger(d.credits)?clamp(d.credits,0,9):0;lastSaved=JSON.stringify(d);paintPrizesBtn();return true;}
function frame(t){raf=0;const t0=performance.now();let dt=Math.min(.05,(t-last)/1000);last=t;now+=dt;
  coinUpdate(dt);acc+=dt;let n=0;const h=STEP;while(acc>=h&&n<10){clawUpdate(h);physStep(h);acc-=h;n++;}if(n===10)acc=0;
  sx.setTransform(1,0,0,1,0,0);sx.imageSmoothingEnabled=false;sx.clearRect(0,0,BW,BH);ART.drawScene(sx,clawState(),layers);
  if(coinBlink>0&&(now*4%1)<.55){const R=G.coin;sx.strokeStyle="#ffe14a";sx.lineWidth=1;sx.strokeRect(R.x0-1.5,R.y0-1.5,R.x1-R.x0+3,R.y1-R.y0+3);sx.strokeStyle="rgba(255,225,74,.45)";sx.strokeRect(R.x0-2.5,R.y0-2.5,R.x1-R.x0+5,R.y1-R.y0+5);}   // "insert a coin" nudge
  present();
  if((saveT+=dt)>1){saveT=0;if(claw.mode==="idle"&&!claw.held&&bodies.every(b=>b.sleep>SLEEP_T&&!b.inChute))save();}
  const ft=performance.now()-t0;perf.frames++;perf.sum+=ft;if(ft>perf.max)perf.max=ft;
  if(!document.hidden)raf=requestAnimationFrame(frame);}
addEventListener("pagehide",()=>{if(claw.mode==="idle")save();});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&claw.mode==="idle")save();if(!document.hidden&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}});

/* ---------- start ---------- */
paintTexts();layout();if(!load()){spawnPile(START_TOYS);settle(1.4);}else if(empty())setTimeout(()=>toast(T().empty),600);raf=requestAnimationFrame(frame);

/* test hooks */
window.AC={get credits(){return credits;},get mode(){return claw.mode;},get wins(){return wins;},
  claw:()=>({x:claw.x,y:claw.y,z:claw.z,angX:claw.angX,angZ:claw.angZ,open:claw.open,held:!!claw.held}),
  coin:insertCoin,grab:startGrab,joy(x,y){joyX=x;joyY=y||0;},seed(seq){let i=0;roll=()=>seq[i++%seq.length];},unseed(){roll=Math.random;},
  aimAtToy(){const c=bodies.filter(b=>!b.held&&!b.inChute&&!b.rising&&b.x>G.chute.x1+10&&b.x>G.clawMinX&&b.x<G.clawMaxX).sort((a,b)=>(a.y-a.br)-(b.y-b.br))[0];if(!c)return null;claw.x=c.x;claw.z=clamp(c.z,0,D);claw.vx=claw.vz=0;return c.t.id;},   // tests only
  parked:()=>Math.abs(claw.x-PARK.x)<1.5&&Math.abs(claw.z-PARK.z)<2&&claw.y<=G.clawTopY+.5,nudged:()=>coinBlink>0,
  pose(){const b=claw.held;if(!b)return null;const g=grip();return{dx:b.x-g.x,dy:b.y-g.y,dz:b.z-g.z,spread:g.spread,half:halfW(b.t)};},
  depthRows(){return bodies.map(b=>+b.z.toFixed(1));},
  sweep(y){claw.mode="test";claw.open=1;claw.y=y;claw.x=G.clawMinX;claw.z=D*.5;claw.vx=claw.vz=0;},endTest(){claw.mode="idle";claw.open=0;claw.y=G.clawTopY;},
  health(){let nan=0,maxOv=0;for(const b of bodies){if(![b.x,b.y,b.z,b.vx,b.vy,b.vz,b.a].every(Number.isFinite))nan++;}
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const A=worldParts(bodies[i]),B=worldParts(bodies[j]);
      for(const P of A)for(const Q of B){const ov=P.r+Q.r-Math.hypot(P.x-Q.x,P.y-Q.y,P.z-Q.z);if(ov>maxOv)maxOv=ov;}}
    return{nan,maxOv:+maxOv.toFixed(2)};},
  aimBehindFront(){for(const b of bodies.filter(b=>!b.held&&!b.inChute&&b.z>D*.35&&b.x>G.clawMinX+4&&b.x<G.clawMaxX-4).sort((a,c)=>c.z-a.z)){
      const f=bodies.find(o=>o!==b&&o.z<b.z-8&&overlap(screenBox(o),screenBox(b)));if(f){claw.x=b.x;claw.z=clamp(b.z,0,D);claw.vx=claw.vz=0;return b.t.id;}}return null;},
  // pixels where a front toy and the held toy overlap on screen: does the scene show the front toy? (render each alone and compare)
  depthCheck(){const h=claw.held;if(!h)return null;const fronts=bodies.filter(o=>o!==h&&!o.held&&o.z<h.z-3&&overlap(screenBox(o),screenBox(h)));if(!fronts.length)return{checked:0,ok:0};
    const one=b=>{const c=document.createElement("canvas");c.width=BW;c.height=BH;const x=c.getContext("2d");x.imageSmoothingEnabled=false;TOYS.draw(x,b.t.id,Math.round(b.x),Math.round(b.y-b.z*RISE),b.a,{shade:clamp(b.z/D,0,1)*.55,highlight:b===hlToy});return x.getImageData(0,0,BW,BH).data;};
    const H=one(h),lo=document.createElement("canvas");lo.width=BW;lo.height=BH;const lx=lo.getContext("2d");lx.imageSmoothingEnabled=false;lx.drawImage(big,0,0,BW,BH);const S=lx.getImageData(0,0,BW,BH).data;let checked=0,ok=0,bad=0;
    for(const f of fronts){const F=one(f);for(let i=0;i<F.length;i+=4){if(F[i+3]<250||H[i+3]<250)continue;if(Math.abs(F[i]-H[i])+Math.abs(F[i+1]-H[i+1])+Math.abs(F[i+2]-H[i+2])<60)continue;checked++;
      const dF=Math.abs(S[i]-F[i])+Math.abs(S[i+1]-F[i+1])+Math.abs(S[i+2]-F[i+2]),dH=Math.abs(S[i]-H[i])+Math.abs(S[i+1]-H[i+1])+Math.abs(S[i+2]-H[i+2]);if(dF<dH)ok++;else if(dH<24)bad++;}}
    return{checked,ok,bad};},   // bad = the held toy shows through a toy that is in front of it
  prizes:()=>won.map(w=>[w.t.id,w.n]),addPrizeTest(id){const t=TOYS.list.find(x=>x.id===id);if(t)addPrize(t);},
  inBox:()=>bodies.filter(b=>!b.fromClaw&&!b.held&&b.x+halfW(b.t)*.5>G.chute.x0&&b.x-halfW(b.t)*.5<G.chute.x1&&b.z<BOXZ+BOXM&&b.y>G.chute.y0-4).map(b=>b.t.id),
  ids:()=>bodies.filter(b=>!b.held&&!b.inChute).map(b=>b.t.id),
  shapes(){const c={};for(const b of bodies)c[b.t.shape]=(c[b.t.shape]||0)+1;return{retired:bodies.filter(b=>b.t.retired).length,shapes:Object.keys(c).length,most:Math.max(0,...Object.values(c))};},
  drawSets:()=>({front:frontQ.map(b=>b.t.id),mid:midQ.map(b=>b.t.id),target:claw.target&&!claw.target.held?claw.target.t.id:null,boxLater,clawZ:ART.clawGrip(clawState()).z,boxZ:BOXZ}),
  emptyTest(){bodies=bodies.filter(b=>b.held||b.inChute);},saveNow(){save(true);},SAVE_KEY,
  toys:()=>bodies.length,state:()=>bodies.filter(b=>!b.held&&!b.inChute).map(b=>[b.x,b.y,b.z,b.a,b.sleep>SLEEP_T?1:0]),rising:()=>bodies.filter(b=>b.rising).length,
  outside(){let c=0;for(const b of bodies){if(b.inChute||b.rising)continue;for(const P of worldParts(b)){if(P.x<wallL(P.z)-2||P.x>wallR(P.z)+2||P.y>floorY(P.x)+3||P.z<-2||P.z>D+2||P.y-P.r<G.glass.y0-3)c++;}}return c;},
  below:()=>{const u=below();return{y:u.y,tipY:u.tipY,id:u.b&&u.b.t.id};},
  front:()=>bodies.filter(b=>b.z<D*.45).map(b=>b.t.cute||0),back:()=>bodies.filter(b=>b.z>=D*.45).map(b=>b.t.cute||0),
  // machine pixel -> a client point on screen (inverse of the fisheye) for tests
  toScreen(mx,my){let best=-1,bd=1e9;for(let i=0;i<LUT.length;i++){const j=LUT[i];if(j<0)continue;const d=Math.abs(j%BW-mx)+Math.abs(((j/BW)|0)-my);if(d<bd){bd=d;best=i;if(!d)break;}}
    const r=screen.getBoundingClientRect();return[r.left+(best%BW+.5)*r.width/BW,r.top+(((best/BW)|0)+.5)*r.height/BH];},
  prize:()=>lastPrize&&lastPrize.id,dialog:()=>!$("prize").hidden,perf,
  dbg:()=>bodies.filter(b=>b.fromClaw||b.held).map(b=>({id:b.t.id,x:+b.x.toFixed(1),y:+b.y.toFixed(1),z:+b.z.toFixed(1),inChute:!!b.inChute})),G,BW,BH,D,RISE};
})();
