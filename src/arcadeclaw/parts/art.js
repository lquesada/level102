/* ================= ART: the claw machine cabinet, claw, control panel and the arcade behind it =================
   Everything is pixel art at 192x342 base pixels (see CONTRACT.md). Static parts are baked once into offscreen
   canvases; each frame only the animated bits are drawn (background lights, kids, claw, LEDs, joystick, button, coin). */
const ART=(()=>{
  const W=192,H=342;
  const mk=(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");x.imageSmoothingEnabled=false;return[c,x];};
  // ---------- palette (taken from the picture) ----------
  const P={
    out:"#2a1408",wd0:"#4a2610",wd1:"#6b3a1a",wd2:"#8c4f24",wd3:"#a8642f",wd4:"#c27c3e",wd5:"#d99a5a",wd6:"#ecbb7f",
    mq:"#0b0d1c",mq2:"#151a33",
    m0:"#1c1f27",m1:"#3a3f4a",m2:"#5d6470",m3:"#8b939f",m4:"#b9c1cb",m5:"#e3e8ee",m6:"#ffffff",
    bg0:"#0c0f2a",bg1:"#151a44",bg2:"#1f2560",bg3:"#2c3478",bg4:"#3a3f8a",flr:"#0e1028",
    pink:"#ff3c8e",grn:"#3dff74",cyan:"#3ee6ff",red:"#ff2e4f",yel:"#ffd84d",blu:"#3f6dff",pur:"#a24bff",org:"#ff8a1f",
    led0:"#0a0a10",ledT:"#ffffff",ledDim:"#3b3f4c",
    b0:"#0d4a1f",b1:"#178a34",b2:"#27b84a",b3:"#5fe07a",b4:"#b8ffc7",
    j0:"#6a0a10",j1:"#b8141c",j2:"#e5262d",j3:"#ff7a7a",j4:"#ffd0d0",
    coin0:"#8a5a00",coin1:"#d89a10",coin2:"#ffd23a",coin3:"#fff1a8"};
  // ---------- tiny pixel helpers ----------
  const R=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x|0,y|0,w|0,h|0);};
  const dot=(c,x,y,col,s=1)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),s,s);};
  function line(c,x0,y0,x1,y1,col,s=1){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy;c.fillStyle=col;const h=(s/2)|0;
    for(let i=0;i<2000;i++){c.fillRect(x0-h,y0-h,s,s);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
  function disc(c,cx,cy,r,col){c.fillStyle=col;for(let y=-r;y<=r;y++){const w=Math.floor(Math.sqrt(r*r-y*y+r*.8));c.fillRect(Math.round(cx-w),Math.round(cy+y),2*w+1,1);}}
  function oval(c,cx,cy,rx,ry,col){c.fillStyle=col;for(let y=-ry;y<=ry;y++){const w=Math.floor(rx*Math.sqrt(Math.max(0,1-(y*y)/(ry*ry+.6))));c.fillRect(Math.round(cx-w),Math.round(cy+y),2*w+1,1);}}
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  // ---------- pixel fonts ----------
  const F5={A:"01110,10001,10001,11111,10001,10001,10001",R:"11110,10001,10001,11110,10010,10001,10001",C:"01110,10001,10000,10000,10000,10001,01110",
    D:"11110,10001,10001,10001,10001,10001,11110",E:"11111,10000,10000,11110,10000,10000,11111",L:"10000,10000,10000,10000,10000,10000,11111",
    W:"10001,10001,10001,10101,10101,11011,10001",G:"01110,10001,10000,10111,10001,10001,01111",B:"11110,10001,10001,11110,10001,10001,11110",
    O:"11111,10001,10001,10001,10001,10001,11111",I:"11111,00100,00100,00100,00100,00100,11111",N:"10001,11001,10101,10011,10001,10001,10001",
    P:"11110,10001,10001,11110,10000,10000,10000",Y:"10001,10001,01010,00100,00100,00100,00100","1":"00100,01100,00100,00100,00100,00100,01110",
    "=":"00000,00000,11111,00000,11111,00000,00000"," ":"00000,00000,00000,00000,00000,00000,00000"};
  const F3={C:"111,100,100,100,111",R:"110,101,110,101,101",E:"111,100,110,100,111",D:"110,101,101,101,110",I:"111,010,010,010,111",T:"111,010,010,010,010",
    S:"111,100,111,001,111",":":"000,010,000,010,000"," ":"000,000,000,000,000",
    "0":"111,101,101,101,111","1":"010,110,010,010,111","2":"111,001,111,100,111","3":"111,001,111,001,111","4":"101,101,111,001,001",
    "5":"111,100,111,001,111","6":"111,100,111,101,111","7":"111,001,010,010,010","8":"111,101,111,101,111","9":"111,101,111,001,111"};
  const glyph=(F,ch)=>(F[ch]||F[" "]).split(",");
  function text(c,F,str,x,y,col,sc=1,gap=1){let cx=x;for(const ch of str){const g=glyph(F,ch);for(let r=0;r<g.length;r++)for(let k=0;k<g[r].length;k++)if(g[r][k]==="1")R(c,cx+k*sc,y+r*sc,sc,sc,col);cx+=(g[0].length)*sc+gap;}return cx;}
  const textW=(F,str,sc=1,gap=1)=>{let w=0;for(const ch of str)w+=glyph(F,ch)[0].length*sc+gap;return w-gap;};
  // outlined text: dark outline around every lit pixel
  function textOut(c,F,str,x,y,col,out,sc=1,gap=1){for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[1,1],[-1,1],[1,-1],[-1,-1]])text(c,F,str,x+dx,y+dy,out,sc,gap);return text(c,F,str,x,y,col,sc,gap);}

  // ---------- geometry (measured from the picture: its pixels / ~2.98) ----------
  const GEOM={glass:{x0:15,y0:54,x1:180,y1:258},railY:64,clawMinX:30,clawMaxX:164,clawHomeX:96,clawTopY:84,
    floorY:252,floorAt:x=>252,wallL:16,wallR:179,chute:{x0:26,x1:75,y0:209,y1:255,z1:14,topY:195},dropX:50,
    joystick:{cx:51,cy:276,r:19},grab:{x0:108,y0:273,x1:159,y1:296},coin:{x0:15,y0:302,x1:47,y1:339},prizes:{x0:159,y0:306,x1:183,y1:331},credits:{x0:71,y0:261,x1:121,y1:274},
    pivotDY:9,depth:50,depthRise:1,bridgeRise:.22,floorBackY:202,backL:20,backR:175};   // depth: z range (0 = front glass); a toy/claw at z is drawn z*depthRise higher;
                                                    // the gantry bridge (above eye level) only shifts z*bridgeRise
  const G=GEOM.glass;

  // ---------- 1) arcade room behind the glass: baked base (walls, machines, neon glow) + animated bits ----------
  const[bg,bx]=mk(W,H);
  const mix=(a,b,u)=>{const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16),f=(s)=>[(s>>16)&255,(s>>8)&255,s&255],x=f(A),y=f(B);return"rgb("+x.map((v,i)=>Math.round(v+(y[i]-v)*u)).join()+")";};
  const dith=(c,x,y,w,h,col,ph=0)=>{c.fillStyle=col;for(let j=0;j<h;j++)for(let i=(j+ph)&1;i<w;i+=2)c.fillRect(x+i,y+j,1,1);};
  // glow halo: concentric dithered ellipses (soft, out of focus, but still pixel art)
  function halo(c,cx,cy,rx,ry,col,a){c.globalAlpha=a*.35;oval(c,cx,cy,rx,ry,col);c.globalAlpha=a*.5;oval(c,cx,cy,Math.round(rx*.6),Math.round(ry*.6),col);c.globalAlpha=a;oval(c,cx,cy,Math.round(rx*.3),Math.round(ry*.3),col);c.globalAlpha=1;}
  function neonLine(c,x0,y0,x1,y1,col,k){c.globalAlpha=.07*k;line(c,x0,y0,x1,y1,col,6);c.globalAlpha=.16*k;line(c,x0,y0,x1,y1,col,3);
    c.globalAlpha=.45+.15*k;line(c,x0,y0,x1,y1,mix(col,"#ffffff",.35),1);c.globalAlpha=1;}
  // machines: [x, top, w, h, body, screen, marquee, far(0 near..1 far), game]
  const MACH=[
    [57,124,13,62,"#1c1a3e","#2ad1ff","#ffd84d",.85,2],[100,121,14,64,"#1c1a3e","#3f6dff","#ff3c8e",.9,1],[86,126,12,58,"#1a1a3c","#b24bff","#3dff74",.95,3],
    [40,112,18,74,"#24164a","#1e74ff","#3ee6ff",.55,1],[138,114,19,72,"#2a1240","#ff2e4f","#ffd84d",.5,0],
    [15,98,24,88,"#2b1450","#ff2fa0","#ff3c8e",.15,0],[158,100,22,86,"#152a48","#2bff7a","#3ee6ff",.15,2],
    [64,138,15,48,"#2a2410","#ffcc33","#ff8a1f",.35,3],[118,134,15,52,"#13283e","#33e0ff","#3f6dff",.35,1]];
  function machine(c,m){const[x,top,w,h,body,scr,mq,far]=m,hz=far;
    const B=mix(body,"#2a2a70",hz*.6);R(c,x,top,w,h,B);R(c,x,top,1,h,mix(B,"#ffffff",.12));R(c,x+w-1,top,1,h,mix(B,"#000000",.4));
    R(c,x+1,top+1,w-2,4,mix(mq,"#2a2a70",hz*.5));R(c,x+1,top+1,w-2,1,mix(mq,"#ffffff",.5));                      // lit marquee
    const sx=x+2,sy=top+7,sw=w-4,sh=Math.max(8,Math.round(h*.32));R(c,sx-1,sy-1,sw+2,sh+2,"#07070f");            // screen bezel
    R(c,x+1,sy+sh+2,w-2,3,mix(B,"#ffffff",.08));R(c,x,sy+sh+5,w,1,mix(B,"#000",.5));                               // control ledge
    return{sx,sy,sw,sh};}
  const SCR=[];
  (function(){
    // walls: saturated purple/blue, lighter where the neon hits
    for(let y=G.y0;y<G.y1;y++){const u=(y-G.y0)/(G.y1-G.y0);R(bx,G.x0,y,G.x1-G.x0,1,u<.2?mix("#140c38","#2a1a66",u/.2):u<.6?mix("#2a1a66","#22246e",(u-.2)/.4):mix("#22246e","#120f30",(u-.6)/.4));}
    // ceiling panels + light glows (baked, the pulse is animated)
    for(let x=G.x0;x<G.x1;x+=14)R(bx,x,G.y0,1,30,"#1f1650");
    halo(bx,90,96,34,11,"#ff3c8e",.22);halo(bx,30,104,16,8,"#3dff74",.18);halo(bx,150,84,26,7,"#3ee6ff",.22);halo(bx,148,118,24,6,"#ff2e4f",.18);halo(bx,50,70,22,6,"#a24bff",.18);
    // far machines first, then haze, then nearer ones
    const order=MACH.map((m,i)=>i).sort((a,b)=>MACH[b][7]-MACH[a][7]);
    let hazed=false;
    for(const i of order){const m=MACH[i];if(!hazed&&m[7]<.6){bx.globalAlpha=.28;dith(bx,G.x0,100,G.x1-G.x0,90,"#5a58c8");bx.globalAlpha=1;hazed=true;}SCR[i]=machine(bx,m);}
    // arcade floor with coloured reflections
    for(let y=176;y<G.y1;y++)R(bx,G.x0,y,G.x1-G.x0,1,mix("#1a1650","#0c0b24",Math.min(1,(y-176)/20)));
    for(const[x,col]of[[27,"#ff2fa0"],[49,"#1e74ff"],[148,"#ff2e4f"],[168,"#2bff7a"],[70,"#ffcc33"],[125,"#33e0ff"]])halo(bx,x,181,8,3,col,.35);
    // bokeh: soft out-of-focus light dots
    for(let i=0;i<26;i++){const x=G.x0+Math.floor(rnd()*(G.x1-G.x0)),y=G.y0+Math.floor(rnd()*60),col=["#ff3c8e","#3ee6ff","#ffd84d","#a24bff","#3dff74"][i%5];bx.globalAlpha=.18;disc(bx,x,y,2,col);bx.globalAlpha=1;}
  })();
  const NEON=[[54,86,120,108,"#ff3c8e",0],[15,94,46,112,"#3dff74",1.7],[116,82,178,76,"#3ee6ff",3.1],[110,114,180,119,"#ff2e4f",.6],[24,70,74,66,"#a24bff",2.4],[124,95,176,101,"#3f6dff",4.2],[62,100,96,90,"#ff8a1f",5.1]];
  // tiny game graphics on a screen
  function screen(c,s,col,game,t,seedn,far){const{sx,sy,sw,sh}=s,f=Math.floor(t*3+seedn*5);
    c.globalAlpha=.75-far*.3;R(c,sx,sy,sw,sh,col);c.globalAlpha=.65;R(c,sx,sy,sw,sh,"#000");c.globalAlpha=.7-far*.3;
    const lit=mix(col,"#ffffff",.7);
    if(game===0){for(let r=0;r<2;r++)for(let k=0;k<sw-2;k+=3)if(((k+r+f)&3)!==0)R(c,sx+1+k+((f>>1)&1),sy+1+r*2,2,1,lit);R(c,sx+((f*2)%(sw-2))+1,sy+sh-2,2,1,"#fff");}
    else if(game===1){const bx2=sx+1+Math.abs(((f*2)%(2*(sw-3)))-(sw-3)),by2=sy+1+Math.abs((f%(2*(sh-3)))-(sh-3));R(c,bx2,by2,1,1,"#fff");R(c,sx+1,sy+sh-2,3,1,lit);R(c,sx+sw-4,sy+2+(f%4),1,3,lit);}
    else if(game===2){for(let k=0;k<sw;k+=2)R(c,sx+k,sy+sh-1-((k*7+f)%4),1,1+((k*7+f)%4),lit);R(c,sx+2,sy+2,2,2,"#ffef80");}
    else{for(let k=0;k<4;k++)R(c,sx+1+((k*5+f)%(sw-2)),sy+1+((k*3+f*2)%(sh-2)),1,1,lit);R(c,sx+(sw>>1)-1,sy+(sh>>1),3,2,"#fff");}
    c.globalAlpha=1;}
  function room(c,t){
    for(const[a0,b0,a1,b1,col,ph]of NEON){const k=.7+.3*Math.sin(t*.8+ph);neonLine(c,a0,b0,a1,b1,col,k);}
    for(let i=0;i<MACH.length;i++){const m=MACH[i];screen(c,SCR[i],m[5],m[8],t,i,m[7]);
      // screen light spilling onto the wall/floor in front, and blinking buttons
      c.globalAlpha=.05+.02*Math.sin(t*1.2+i);oval(c,SCR[i].sx+(SCR[i].sw>>1),SCR[i].sy+(SCR[i].sh>>1),SCR[i].sw,SCR[i].sh,m[5]);c.globalAlpha=1;
      const by=SCR[i].sy+SCR[i].sh+3;for(let k=0;k<3;k++)if(((Math.floor(t*1.2)+k+i)%3)!==0)dot(c,m[0]+2+k*3,by,["#ff3b3b","#ffd21f","#29b6ff"][k]);}
    kids(c,t);
    // push the arcade back: less saturation, a dark purple/navy wash (the toys, claw and machine stay the focus)
    c.globalCompositeOperation="saturation";c.globalAlpha=.45;R(c,G.x0,G.y0,G.x1-G.x0,G.y1-G.y0,"#808080");c.globalCompositeOperation="source-over";
    c.globalAlpha=.48;R(c,G.x0,G.y0,G.x1-G.x0,G.y1-G.y0,"#0a0920");c.globalAlpha=1;
  }
  // a kid at a machine, in profile; dir +1 faces right; lit on the facing side by the screen colour
  function kid(c,x,y,dir,hair,shirt,pants,lite,t,ph,pony){
    const b=Math.round(Math.sin(t*1.1+ph)*.6),arm=Math.sin(t*3+ph)>0?1:0,sh=mix(shirt,"#000000",.35),hl=mix(shirt,lite,.55),skin="#e2a27c",skinS="#b97556";
    // legs + shoes
    R(c,x-3,y-14,3,14,pants);R(c,x+1,y-14,3,14,mix(pants,"#000",.3));R(c,x-4+(dir>0?1:0),y-1,5,2,"#121220");R(c,x+(dir>0?1:0),y-1,5,2,"#121220");
    // torso with shading: back side dark, front side lit by the screen
    const ty=y-30+b;for(let r=0;r<16;r++){const w=r<3?10+r:13-((r>11)?1:0);const x0=x-((w/2)|0);R(c,x0,ty+r,w,1,shirt);R(c,dir>0?x0:x0+w-3,ty+r,3,1,sh);R(c,dir>0?x0+w-2:x0,ty+r,2,1,hl);}
    // back arm (behind) and front arm reaching to the controls
    line(c,x-dir*2,ty+4,x+dir*6,ty+11,sh,3);
    line(c,x+dir*3,ty+3,x+dir*9,ty+9-arm,shirt,3);line(c,x+dir*4,ty+3,x+dir*9,ty+8-arm,hl,1);R(c,x+dir*10-1,ty+8-arm,3,2,skin);
    // neck, head in profile (nose, eye, ear), hair
    R(c,x-1,ty-2,3,3,skinS);const hx=x+dir,hy=ty-8;
    oval(c,hx,hy,5,6,skin);R(c,hx+dir*5,hy,1,2,skin);dot(c,hx+dir*6,hy+1,skin);                      // nose
    dot(c,hx+dir*3,hy-1,"#1b1020");dot(c,hx+dir*4,hy+3,skinS);                                        // eye, mouth
    oval(c,hx-dir*2,hy-3,5,4,hair);R(c,hx-dir*6+(dir>0?0:-0),hy-3,3,7,hair);R(c,hx-dir*1-2,hy-7,6,1,mix(hair,"#ffffff",.25));
    if(pony){line(c,hx-dir*6,hy-2,hx-dir*9,hy+5,hair,3);}
    dot(c,hx-dir*1,hy+1,skinS);                                                                        // ear
    c.globalAlpha=.35;R(c,dir>0?hx+3:hx-5,hy-4,3,9,lite);c.globalAlpha=1;                                 // screen light on the face
  }
  function kids(c,t){kid(c,80,190,-1,"#6a3a18","#2f9a58","#2a3058","#ffcc33",t,0,true);kid(c,112,188,1,"#1e140e","#2f62b8","#22263f","#33e0ff",t,2,false);}

  // ---------- 2) cabinet inside: back posts, floor plate, chute box back ----------
  const[ins,ix]=mk(W,H);
  (function(){
    // inside seen from slightly above: floor plane narrowing and rising to the back, low back wall, converging side glass
    const FB=GEOM.floorBackY,FF=GEOM.floorY,BL=GEOM.backL,BR=GEOM.backR;
    R(ix,G.x0,G.y0,G.x1-G.x0,3,P.wd0);R(ix,G.x0,G.y0+3,G.x1-G.x0,1,"rgba(0,0,0,.35)");
    // side glass faces (left/right strips between the front and back corners) + back corner edges
    ix.globalAlpha=.18;R(ix,G.x0,G.y0+4,BL-G.x0,FB-G.y0-4,"#9fb6ff");R(ix,BR,G.y0+4,G.x1-BR,FB-G.y0-4,"#9fb6ff");ix.globalAlpha=1;
    R(ix,BL,G.y0+4,1,FB-G.y0-4,P.m3);R(ix,BR,G.y0+4,1,FB-G.y0-4,P.m2);
    // low back wall behind the pile
    R(ix,BL,FB-15,BR-BL+1,15,"#232745");R(ix,BL,FB-15,BR-BL+1,1,"#4a5080");R(ix,BL,FB-14,BR-BL+1,1,"#30355c");R(ix,BL,FB-1,BR-BL+1,1,"#151829");
    for(let x=BL+8;x<BR;x+=16)R(ix,x,FB-12,1,10,"#1b1e38");
    // floor: felt, darker at the back, with a faint perspective grid
    for(let y=FB;y<G.y1;y++){const u=Math.min(1,(y-FB)/(FF-FB)),xl=Math.round(BL-(BL-G.x0)*u),xr=Math.round(BR+(G.x1-BR)*u);
      const c0=[16,18,30],c1=[38,44,66],col="rgb("+c0.map((v,i)=>Math.round(v+(c1[i]-v)*u)).join()+")";R(ix,xl,y,xr-xl+1,1,col);
      for(let x=xl+((y*3)&3);x<=xr;x+=4)if(((x*7+y*13)%11)===0)dot(ix,x,y,"rgba(255,255,255,.06)");}
    ix.globalAlpha=.16;for(let z=10;z<GEOM.depth;z+=10){const y=FF-z,u=(y-FB)/(FF-FB),xl=Math.round(BL-(BL-G.x0)*u),xr=Math.round(BR+(G.x1-BR)*u);R(ix,xl,y,xr-xl+1,1,"#8f9ad8");}
    for(let i=0;i<=9;i++){const xf=G.x0+(G.x1-G.x0)*i/9,xb=BL+(BR-BL)*i/9;line(ix,xb,FB,xf,FF,"#8f9ad8",1);}ix.globalAlpha=1;
    R(ix,G.x0,FF,G.x1-G.x0,1,"rgba(255,255,255,.12)");
    // front-to-back side rails the bridge rides on
    for(const x of[17,172]){R(ix,x,G.y0+1,4,GEOM.railY-G.y0+5,P.m0);R(ix,x+1,G.y0+1,2,GEOM.railY-G.y0+4,P.m2);R(ix,x+1,G.y0+1,1,GEOM.railY-G.y0+4,P.m4);}
  })();
  // prize box back (its own layer: toys behind the box are drawn before it, so they never look as if inside it)
  const[chb,cb_]=mk(W,H);
  (function(){const C=GEOM.chute,top=C.topY;
    // prize box (3D glass box): back face, inside, opening rim at the back, right side face
    cb_.globalAlpha=.5;R(cb_,C.x0,top,C.x1-C.x0,C.y1-top,"#141a30");cb_.globalAlpha=1;
    R(cb_,C.x0,top,C.x1-C.x0,2,P.m3);R(cb_,C.x0,top,C.x1-C.x0,1,P.m5);R(cb_,C.x0,top,1,C.y0-top,P.m3);R(cb_,C.x1-1,top,1,C.y0-top,P.m2);
    R(cb_,C.x0+2,C.y1-4,C.x1-C.x0-4,3,"#0b0d16");                       // the trapdoor
  })();
  // chute front glass (after toys)
  const[chf,cx_]=mk(W,H);
  (function(){const C=GEOM.chute,w=C.x1-C.x0,h=C.y1-C.y0,top=C.topY;
    // top face (the opening): rim edges in front, the inside darker
    cx_.globalAlpha=.1;R(cx_,C.x0,top,w,C.y0-top,"#cfe6ff");cx_.globalAlpha=1;
    // right side face: a narrow glass slab
    cx_.globalAlpha=.22;R(cx_,C.x1,top+2,3,C.y1-top-2,"#cfe6ff");cx_.globalAlpha=1;R(cx_,C.x1+3,top+2,1,C.y1-top-2,P.m1);line(cx_,C.x1-1,top,C.x1+3,top+2,P.m4,1);
    // front face
    cx_.globalAlpha=.16;R(cx_,C.x0,C.y0,w,h,"#cfe6ff");cx_.globalAlpha=1;
    R(cx_,C.x0,C.y0,w,2,P.m4);R(cx_,C.x0,C.y0,w,1,P.m5);R(cx_,C.x0,C.y0,2,h,P.m3);R(cx_,C.x1-2,C.y0,2,h,P.m2);R(cx_,C.x0,C.y1-2,w,2,P.m2);
    R(cx_,C.x0-1,top,1,C.y1-top,P.m0);R(cx_,C.x0,top,1,C.y0-top,P.m4);R(cx_,C.x1,C.y0,1,h,P.m0);
    cx_.globalAlpha=.45;for(let i=0;i<14;i++){dot(cx_,C.x0+6+i,C.y0+5+i*2,"#fff");dot(cx_,C.x0+7+i,C.y0+5+i*2,"#fff");}
    for(let i=0;i<8;i++)dot(cx_,C.x0+22+i,C.y0+5+i*3,"#fff");cx_.globalAlpha=1;})();

  // ---------- 3) gantry rails (static) ----------
  const[rail,rx]=mk(W,H);
  (function(){const y=GEOM.railY;
    line(rx,24,y+1,16,y+12,P.m0,4);line(rx,24,y+1,16,y+12,P.m3,2);line(rx,168,y+1,177,y+12,P.m0,4);line(rx,168,y+1,177,y+12,P.m3,2);
    R(rx,20,y-3,153,7,P.m0);R(rx,21,y-2,151,5,P.m2);R(rx,21,y-2,151,1,P.m4);R(rx,21,y+2,151,1,P.m1);
    for(let x=26;x<170;x+=12)R(rx,x,y,2,1,P.m3);
    R(rx,18,y-4,6,9,P.m1);R(rx,169,y-4,6,9,P.m1);R(rx,19,y-3,4,1,P.m4);R(rx,170,y-3,4,1,P.m4);})();

  // ---------- 4) claw sprites (cached by how open it is) ----------
  const CW=64,COX=32;
  function prong(c,pts,dark,mid,hi){for(let i=0;i<pts.length-1;i++)line(c,pts[i][0]+COX,pts[i][1],pts[i+1][0]+COX,pts[i+1][1],dark,5);
    for(let i=0;i<pts.length-1;i++)line(c,pts[i][0]+COX,pts[i][1],pts[i+1][0]+COX,pts[i+1][1],mid,3);
    for(let i=0;i<pts.length-2;i++)line(c,pts[i][0]+COX-1,pts[i][1]-1,pts[i+1][0]+COX-1,pts[i+1][1]-1,hi,1);
    const e=pts[pts.length-1];disc(c,e[0]+COX,e[1],2,dark);dot(c,e[0]+COX,e[1]-1,mid);}
  const sideP=o=>[[-5,17],[-10-12*o,29],[-9-15*o,45],[-3-16*o,55],[-1-15*o,56]];
  const clawCache=new Map();
  function clawSprite(o){const q=Math.round(o*16);let s=clawCache.get(q);if(s)return s;o=q/16;
    const[bk,bkx]=mk(CW,64),[fr,frx]=mk(CW,64);
    const L=sideP(o),Rr=L.map(([x,y])=>[-x,y]);
    prong(bkx,L,P.m0,P.m3,P.m5);prong(bkx,Rr,P.m0,P.m3,P.m4);
    // hub (front layer): rod top, cylinder with bands, bottom cap, pivots
    R(frx,COX-3,0,7,3,P.m0);R(frx,COX-2,0,5,3,P.m3);R(frx,COX-1,0,1,3,P.m5);
    R(frx,COX-8,2,17,14,P.m0);R(frx,COX-7,3,15,12,P.m3);R(frx,COX-7,3,4,12,P.m4);R(frx,COX-6,3,1,12,P.m5);R(frx,COX+4,3,4,12,P.m2);R(frx,COX+7,3,1,12,P.m1);
    R(frx,COX-7,7,15,1,P.m1);R(frx,COX-7,11,15,1,P.m1);R(frx,COX-7,8,15,1,P.m4);R(frx,COX-7,12,15,1,P.m4);
    R(frx,COX-10,15,21,5,P.m0);R(frx,COX-9,16,19,3,P.m2);R(frx,COX-9,16,19,1,P.m4);R(frx,COX+5,17,4,2,P.m1);
    disc(frx,COX-7,19,2,P.m0);disc(frx,COX+7,19,2,P.m0);dot(frx,COX-7,19,P.m4);dot(frx,COX+7,19,P.m4);
    // front prong: straight down with a hook
    prong(frx,[[0,18],[1,34],[0,48],[2,54],[5,55]],P.m0,P.m3,P.m5);
    s={back:bk,front:fr};clawCache.set(q,s);return s;}

  // ---------- 5) glass reflections ----------
  const[refl,flx]=mk(W,H);
  (function(){flx.fillStyle="#fff";flx.globalAlpha=.05;for(let y=G.y0;y<G.y1;y++){const x=Math.round(150-(y-G.y0)*.62);flx.fillRect(x,y,9,1);flx.fillRect(x+13,y,2,1);}
    flx.globalAlpha=.035;for(let y=G.y0+30;y<G.y1;y++){const x=Math.round(186-(y-G.y0)*.5);flx.fillRect(x,y,4,1);}
    flx.globalAlpha=.12;line(flx,G.x0+2,G.y0+4,G.x0+2,G.y1-3,"#fff",1);line(flx,G.x1-3,G.y0+4,G.x1-3,G.y1-3,"#000",1);flx.globalAlpha=1;})();

  // ---------- 6) cabinet frame (wood), with the glass window cut out ----------
  const[frame,fx]=mk(W,H);
  (function(){
    // body
    R(fx,1,1,W-2,H-1,P.wd2);
    // top rounded corners and outline
    R(fx,0,3,1,H-3,P.out);R(fx,W-1,3,1,H-3,P.out);R(fx,3,0,W-6,1,P.out);dot(fx,1,1,P.out);dot(fx,2,1,P.out);dot(fx,1,2,P.out);dot(fx,W-2,1,P.out);dot(fx,W-3,1,P.out);dot(fx,W-2,2,P.out);
    fx.clearRect(0,0,1,3);fx.clearRect(0,0,3,1);fx.clearRect(W-1,0,1,3);fx.clearRect(W-3,0,3,1);
    // side planks: light left edge, dark right edge, grain
    const plank=(x,y,w,h)=>{R(fx,x,y,w,h,P.wd3);R(fx,x,y,1,h,P.wd5);R(fx,x+1,y,1,h,P.wd4);R(fx,x+w-1,y,1,h,P.wd1);R(fx,x+w-2,y,1,h,P.wd2);
      for(let i=0;i<h/9;i++){const gy=y+3+Math.floor(rnd()*(h-6)),gx=x+2+Math.floor(rnd()*(w-5));R(fx,gx,gy,1,2+Math.floor(rnd()*5),P.wd2);}};
    plank(1,1,14,H-2);plank(W-15,1,14,H-2);
    // top beam above/around the marquee
    R(fx,15,1,W-30,52,P.wd3);R(fx,15,1,W-30,1,P.wd5);R(fx,15,2,W-30,1,P.wd4);
    for(let i=0;i<14;i++)R(fx,20+Math.floor(rnd()*150),4+Math.floor(rnd()*46),3+Math.floor(rnd()*6),1,P.wd2);
    // band under the marquee (lighter lip) and shadow onto the glass top
    R(fx,15,47,W-30,7,P.wd4);R(fx,15,47,W-30,1,P.wd6);R(fx,15,52,W-30,2,P.wd1);
    // window bevel
    R(fx,G.x0-2,G.y0-1,G.x1-G.x0+4,1,P.out);R(fx,G.x0-2,G.y0,2,G.y1-G.y0,P.out);R(fx,G.x1,G.y0,2,G.y1-G.y0,P.wd1);R(fx,G.x0-3,G.y0,1,G.y1-G.y0,P.wd1);R(fx,G.x1+2,G.y0,1,G.y1-G.y0,P.wd4);
    // ledge under the glass + control panel
    R(fx,1,258,W-2,4,P.wd5);R(fx,1,258,W-2,1,P.wd6);R(fx,1,261,W-2,1,P.wd2);
    R(fx,1,262,W-2,33,P.wd3);for(let i=0;i<10;i++)R(fx,4+Math.floor(rnd()*184),264+Math.floor(rnd()*28),4+Math.floor(rnd()*8),1,P.wd2);
    R(fx,15,262,1,33,P.wd2);R(fx,W-16,262,1,33,P.wd2);
    // lip above the lower panel
    R(fx,1,295,W-2,5,P.wd5);R(fx,1,295,W-2,1,P.wd6);R(fx,1,299,W-2,1,P.wd1);R(fx,1,300,W-2,1,P.out);
    // lower panel (darker planks)
    R(fx,1,301,W-2,H-302,P.wd2);for(let x=1;x<W;x+=24){R(fx,x,301,1,H-302,P.wd1);R(fx,x+1,301,1,H-302,P.wd3);}
    for(let i=0;i<16;i++)R(fx,3+Math.floor(rnd()*186),304+Math.floor(rnd()*34),1,3+Math.floor(rnd()*6),P.wd1);
    R(fx,1,H-3,W-2,2,P.wd1);R(fx,1,H-1,W-2,1,P.out);
    // window hole
    fx.clearRect(G.x0,G.y0,G.x1-G.x0,G.y1-G.y0);
    // marquee frame + panel
    R(fx,18,12,156,33,P.out);R(fx,19,13,154,31,P.m1);R(fx,19,13,154,1,P.m4);R(fx,19,43,154,1,P.m0);R(fx,19,13,1,31,P.m3);R(fx,172,13,1,31,P.m0);
    R(fx,22,16,148,25,P.mq);R(fx,22,16,148,1,"#000");R(fx,23,17,146,1,P.mq2);
    for(let x=24;x<168;x+=2)dot(fx,x,39,P.mq2);
    // credits panel (frame; the digits are animated)
    const K=GEOM.credits;R(fx,K.x0,K.y0,K.x1-K.x0,K.y1-K.y0,P.out);R(fx,K.x0+1,K.y0+1,K.x1-K.x0-2,K.y1-K.y0-2,P.led0);R(fx,K.x0+1,K.y1-2,K.x1-K.x0-2,1,"#1a1c26");
    // joystick base plate (stick + ball animated)
    oval(fx,51,290,13,5,P.out);oval(fx,51,289,12,4,P.m1);oval(fx,51,288,11,3,P.m2);oval(fx,51,288,7,2,P.m0);R(fx,44,287,6,1,P.m4);
    // GRAB button well
    const B=GEOM.grab;R(fx,B.x0,B.y0+2,B.x1-B.x0,B.y1-B.y0-1,P.out);R(fx,B.x0+1,B.y1-3,B.x1-B.x0-2,3,"#3a2010");
    // coin plate
    const Cn=GEOM.coin;R(fx,Cn.x0+2,Cn.y0+2,Cn.x1-Cn.x0-4,Cn.y1-Cn.y0-4,P.out);R(fx,Cn.x0+3,Cn.y0+3,Cn.x1-Cn.x0-6,Cn.y1-Cn.y0-6,P.m2);
    R(fx,Cn.x0+3,Cn.y0+3,Cn.x1-Cn.x0-6,1,P.m4);R(fx,Cn.x0+3,Cn.y0+3,1,Cn.y1-Cn.y0-6,P.m4);R(fx,Cn.x1-4,Cn.y0+3,1,Cn.y1-Cn.y0-6,P.m1);R(fx,Cn.x0+3,Cn.y1-4,Cn.x1-Cn.x0-6,1,P.m1);
    for(const[sx,sy]of[[Cn.x0+5,Cn.y0+5],[Cn.x1-7,Cn.y0+5],[Cn.x0+5,Cn.y1-7],[Cn.x1-7,Cn.y1-7]]){dot(fx,sx,sy,P.m0);dot(fx,sx+1,sy+1,P.m4);}
    R(fx,29,309,5,13,P.m0);R(fx,30,310,3,11,"#050507");R(fx,29,309,5,1,P.m1);           // coin slot
    // coin return: little down arrow
    R(fx,28,326,7,1,P.m1);line(fx,31,326,31,331,P.m0,1);line(fx,28,328,31,331,P.m0,1);line(fx,34,328,31,331,P.m0,1);
    // "<- 1 COIN = 1 PLAY"
    const ay=321;R(fx,52,ay-1,8,4,P.out);line(fx,49,ay+1,54,ay-4,P.out,2);line(fx,49,ay+1,54,ay+6,P.out,2);
    R(fx,52,ay,8,2,"#fff");line(fx,50,ay+1,54,ay-3,"#fff",1);line(fx,50,ay,54,ay+4,"#fff",1);line(fx,51,ay+1,54,ay-2,"#fff",1);line(fx,51,ay+1,54,ay+4,"#fff",1);
    textOut(fx,F5,"1 COIN = 1 PLAY",63,ay-3,"#fff",P.out,1,1);
  })();
  // marquee letters, one canvas each (animated brightness)
  const MQ=[["A","#ff3b3b"],["R","#ff8a1f"],["C","#ffd21f"],["A","#3fdc4a"],["D","#29b6ff"],["E","#a35cff"],[" ",""],["C","#ffd21f"],["L","#3fdc4a"],["A","#29b6ff"],["W","#ff4fd2"]];
  const shade=(hex,f)=>{const n=parseInt(hex.slice(1),16),r=n>>16,g=(n>>8)&255,b=n&255,m=v=>Math.max(0,Math.min(255,Math.round(f>1?v+(255-v)*(f-1):v*f)));return"rgb("+m(r)+","+m(g)+","+m(b)+")";};
  // marquee font: blocky 11x16 letters built from 3 px strokes, 1 px dark outline, drop shadow, light top edges
  const LW=11,LH=16,S3=3,MID=7;
  const MF={A:[[1,0,LW-2,S3],[0,1,S3,LH-1],[LW-S3,1,S3,LH-1],[0,MID,LW,S3]],
    R:[[0,0,LW-1,S3],[0,0,S3,LH],[LW-S3,1,S3,MID],[0,MID,LW-1,S3],[LW-S3-2,MID+S3,S3,2],[LW-S3-1,MID+S3+2,S3,2],[LW-S3,MID+S3+4,S3,LH-(MID+S3+4)]],
    C:[[1,0,LW-1,S3],[0,1,S3,LH-2],[1,LH-S3,LW-1,S3]],
    D:[[0,0,LW-2,S3],[0,0,S3,LH],[0,LH-S3,LW-2,S3],[LW-S3,1,S3,LH-2]],
    E:[[0,0,LW,S3],[0,0,S3,LH],[0,MID,LW-2,S3],[0,LH-S3,LW,S3]],
    L:[[0,0,S3,LH],[0,LH-S3,LW,S3]],
    W:[[0,0,S3,LH-1],[LW-S3,0,S3,LH-1],[4,6,S3,LH-6],[1,LH-S3,LW-2,S3]]};
  const letters=MQ.map(([ch,col])=>{if(ch===" ")return null;const[c,x]=mk(LW+4,LH+5);
    const[m,mx]=mk(LW,LH);mx.fillStyle="#fff";for(const[a,b,w,h]of MF[ch])mx.fillRect(a,b,w,h);
    const md=mx.getImageData(0,0,LW,LH).data,on=(px,py)=>px>=0&&py>=0&&px<LW&&py<LH&&md[(py*LW+px)*4+3]>0;
    for(let py=-1;py<=LH;py++)for(let px=-1;px<=LW;px++){let near=false;for(let dy=-1;dy<=1&&!near;dy++)for(let dx=-1;dx<=1;dx++)if(on(px+dx,py+dy)){near=true;break;}
      if(near){R(x,px+2,py+3,1,1,"rgba(0,0,0,.5)");}}                                                 // drop shadow
    for(let py=-1;py<=LH;py++)for(let px=-1;px<=LW;px++){let near=false;for(let dy=-1;dy<=1&&!near;dy++)for(let dx=-1;dx<=1;dx++)if(on(px+dx,py+dy)){near=true;break;}
      if(near)R(x,px+1,py+1,1,1,"#000");}                                                             // outline
    for(let py=0;py<LH;py++)for(let px=0;px<LW;px++)if(on(px,py))R(x,px+1,py+1,1,1,!on(px,py-1)?shade(col,1.6):!on(px,py+1)?shade(col,.62):col);
    return c;});
  const MQX=(()=>{let w=0;for(const[ch]of MQ)w+=ch===" "?5:LW+2;return Math.round(96-(w-2)/2)-1;})();

  // ---------- control panel (animated) ----------
  function panel(c,s){
    // credits LEDs
    const K=GEOM.credits,n=Math.max(0,Math.min(9,s.credits|0)),lit=n>0,fl=s.creditsFlash||0;
    const col=lit?(fl>0&&Math.floor(s.t*12)%2?P.yel:P.ledT):P.ledDim;
    if(lit){c.globalAlpha=.25+.25*fl;R(c,K.x0+1,K.y0+1,K.x1-K.x0-2,K.y1-K.y0-2,"#3a3a20");c.globalAlpha=1;}
    const str="CREDITS: "+n,tw=textW(F3,str);text(c,F3,str,Math.round((K.x0+K.x1-tw)/2),K.y0+4,col);
    // joystick: stick tilts with joyX, red ball on top
    // joyY: +1 = pushed to the back (leans away: ball higher and a bit smaller), -1 = pulled to the front (ball lower, bigger)
    const jx=Math.max(-1,Math.min(1,s.joyX||0)),jyy=Math.max(-1,Math.min(1,s.joyY||0)),bxx=51+Math.round(jx*7),
      byy=263+Math.round(Math.abs(jx)*2)-Math.round(jyy*6)+(jyy<0?Math.round(-jyy*3):0),br=10+(jyy<-.3?1:jyy>.3?-1:0);
    line(c,51,287,bxx,byy+6,P.m0,4);line(c,51,287,bxx,byy+6,P.m2,2);line(c,50,286,bxx-1,byy+6,P.m4,1);
    disc(c,bxx,byy,br,P.out);disc(c,bxx,byy,br-1,P.j1);disc(c,bxx-1,byy-1,br-2,P.j2);disc(c,bxx-2,byy-2,br-5,"#f04545");disc(c,bxx-3,byy-4,2,P.j3);dot(c,bxx-5,byy-6,P.j4,2);
    R(c,bxx+4,byy+5,3,1,P.j0);R(c,bxx-4,byy+8,8,1,P.j0);
    // GRAB button (pressed: sunk 2px; busy: dimmer, pulsing)
    const B=GEOM.grab,dn=s.grabDown?2:0,busy=!!s.busy,bw=B.x1-B.x0,bh=B.y1-B.y0-4;
    const pulse=busy?.5+.5*Math.sin(s.t*8):1;
    const pill=(x,y,w,h,col)=>{R(c,x+3,y,w-6,h,col);R(c,x+1,y+1,w-2,h-2,col);R(c,x,y+3,w,h-6,col);};
    if(!dn)pill(B.x0+1,B.y0+3,bw-2,bh+1,"#0a3516");
    pill(B.x0+1,B.y0+dn,bw-2,bh,P.b0);pill(B.x0+2,B.y0+1+dn,bw-4,bh-2,busy?"#1d6e36":P.b1);
    pill(B.x0+3,B.y0+2+dn,bw-6,Math.round((bh-4)*.55),busy?(pulse>.5?"#2c9a49":"#23843d"):P.b2);
    R(c,B.x0+7,B.y0+2+dn,bw-14,1,busy?"#5fc47a":P.b3);R(c,B.x0+4,B.y0+4+dn,2,3,busy?"#5fc47a":P.b4);
    const gtxt=(col,ox,oy)=>{text(c,F5,"GRAB",ox,oy,col,1,2);text(c,F5,"GRAB",ox+1,oy,col,1,2);};
    const gw=textW(F5,"GRAB",1,2)+1,gx=Math.round(B.x0+(bw-gw)/2),gy=B.y0+Math.round((bh-7)/2)+dn;
    for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[1,1],[-1,1]])gtxt(P.b0,gx+dx,gy+dy);gtxt(busy?"#d8ffe0":"#fff",gx,gy);
    if(dn){c.globalAlpha=.25;R(c,B.x0+2,B.y0+dn,bw-4,bh,"#000");c.globalAlpha=1;}
    // prizes button: chunky pink button with a little plush bear, number badge, pressed state, glow after a win
    {const Q=GEOM.prizes,dn=s.prizesDown?2:0,w=Q.x1-Q.x0,h=Q.y1-Q.y0,nw=s.prizeNew||0;
      if(nw>0){c.globalAlpha=.55*nw;R(c,Q.x0-3,Q.y0-2,w+6,h+5,P.yel);c.globalAlpha=.35*nw;R(c,Q.x0-5,Q.y0-4,w+10,h+9,P.yel);c.globalAlpha=1;}
      const sq=(x,y,ww,hh,col)=>{R(c,x+2,y,ww-4,hh,col);R(c,x,y+2,ww,hh-4,col);R(c,x+1,y+1,ww-2,hh-2,col);};
      sq(Q.x0,Q.y0+2,w,h-1,P.out);if(!dn)sq(Q.x0+1,Q.y0+3,w-2,h-2,"#5a1236");
      sq(Q.x0+1,Q.y0+dn,w-2,h-3,"#8a1e52");sq(Q.x0+2,Q.y0+1+dn,w-4,h-5,"#c2387a");sq(Q.x0+3,Q.y0+1+dn,w-6,Math.round((h-5)*.5),"#e2559a");
      R(c,Q.x0+5,Q.y0+1+dn,w-10,1,"#ff9ccc");dot(c,Q.x0+3,Q.y0+3+dn,"#ffd0e6");
      // bear: ears, head, muzzle, eyes, nose
      const bx2=Q.x0+(w>>1),by2=Q.y0+12+dn;
      disc(c,bx2-5,by2-5,3,P.out);disc(c,bx2+5,by2-5,3,P.out);disc(c,bx2-5,by2-5,2,"#a0642c");disc(c,bx2+5,by2-5,2,"#a0642c");dot(c,bx2-5,by2-5,"#e0a070");dot(c,bx2+5,by2-5,"#e0a070");
      oval(c,bx2,by2+1,7,6,P.out);oval(c,bx2,by2+1,6,5,"#a0642c");R(c,bx2-4,by2-3,3,1,"#c8844a");
      oval(c,bx2,by2+3,3,2,"#ecc89a");dot(c,bx2-3,by2,"#1a0d05");dot(c,bx2+3,by2,"#1a0d05");R(c,bx2-1,by2+2,2,1,"#1a0d05");
      // badge with the count
      const n=Math.max(0,Math.min(99,s.prizes|0));
      if(n>0){const str=String(n),tw=textW(F3,str),bw=tw+4,bxx=Q.x1-bw+3,byy=Q.y0-3;
        R(c,bxx,byy,bw,9,P.out);R(c,bxx+1,byy+1,bw-2,7,"#e5262d");R(c,bxx+1,byy+1,bw-2,1,"#ff7a7a");text(c,F3,str,bxx+2,byy+2,"#fff");}}
    // coin going into the slot: face-on, then edge-on and down into the slot
    const ct=s.coinT;
    if(ct!=null&&ct>=0&&ct<1){const sx=31,top=309;
      if(ct<.55){const u=ct/.55,y=Math.round(292+u*16);disc(c,sx,y,5,P.coin0);disc(c,sx,y,4,P.coin1);disc(c,sx-1,y-1,3,P.coin2);dot(c,sx-2,y-2,P.coin3,2);R(c,sx-1,y-1,1,3,P.coin1);}
      else{const u=(ct-.55)/.45,y=Math.round(304+u*12),hh=Math.max(0,top+11-y);R(c,sx-1,y,3,Math.min(11,hh>0?Math.min(11,top-y+11):0),P.coin1);
        if(y<top){R(c,sx-1,y,3,top-y,P.coin2);}dot(c,sx-1,y,P.coin3);}}
  }

  // ---------- the whole frame ----------
  // z: 0 = front glass .. GEOM.depth = back. The bridge rides back (a little higher); the claw is drawn z*depthRise higher.
  const bridgeDY=z=>Math.round(z*GEOM.bridgeRise);
  function grip(s){const pv=GEOM.pivotDY,o=Math.max(0,Math.min(1,s.clawOpen||0)),a=s.clawAngle||0,z=Math.max(0,Math.min(GEOM.depth,s.clawZ||0));
    const py=GEOM.railY-bridgeDY(z)+pv,L=Math.max(4,s.clawY-z*GEOM.depthRise-py);
    const hx=s.clawX+Math.sin(a)*L,hy=py+Math.cos(a)*L,ty=54,ca=Math.cos(a),sa=Math.sin(a);
    return{x:hx-sa*ty,y:hy+ca*ty,z,spread:3+16*o,hubX:hx,hubY:hy,angle:a,pivotY:py};}
  function drawScene(ctx,s,layers){
    ctx.imageSmoothingEnabled=false;const t=s.t||0;
    ctx.drawImage(bg,0,0);room(ctx,t);ctx.drawImage(ins,0,0);
    // layers.box: GAME draws the prize box itself (ART.drawBox) at its depth among the toys
    if(!(layers&&layers.box))ctx.drawImage(chb,0,0);
    if(layers&&layers.toys)layers.toys(ctx);
    if(!(layers&&layers.box))ctx.drawImage(chf,0,0);
    // gantry, carriage, cable + coil, claw
    const g=grip(s),bd=bridgeDY(g.z);
    ctx.drawImage(rail,0,-bd);if(g.z>1){ctx.globalAlpha=Math.min(.35,g.z/GEOM.depth*.35);ctx.fillStyle="#000";ctx.fillRect(16,GEOM.railY-bd-4,161,9);ctx.globalAlpha=1;}
    const ry=GEOM.railY-bd,cx=Math.round(s.clawX),hx=g.hubX,hy=g.hubY,a=g.angle;
    R(ctx,cx-14,ry-7,29,15,P.m0);R(ctx,cx-13,ry-6,27,13,P.m2);R(ctx,cx-13,ry-6,27,2,P.m4);R(ctx,cx-13,ry-6,2,13,P.m4);R(ctx,cx+11,ry-6,3,13,P.m1);R(ctx,cx-13,ry+5,27,2,P.m1);
    R(ctx,cx-9,ry-2,4,3,P.m1);R(ctx,cx+5,ry-2,4,3,P.m1);dot(ctx,cx-8,ry-2,P.m4);dot(ctx,cx+6,ry-2,P.m4);
    R(ctx,cx-4,ry+7,9,3,P.m0);R(ctx,cx-3,ry+7,7,2,P.m3);
    const px0=cx,py0=ry+GEOM.pivotDY;
    // coiled power cable from the carriage's left to the hub
    {const ax=cx-10,ay=ry+7,bx2=hx-6,by2=hy+5,n=Math.max(6,Math.round(Math.hypot(bx2-ax,by2-ay)/2.5)),dx=(bx2-ax)/n,dy=(by2-ay)/n,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
      let lx=ax,ly=ay;for(let i=1;i<=n;i++){const w=(i%2?2:-2)*(i<n?1:0),x=ax+dx*i+nx*w,y=ay+dy*i+ny*w;line(ctx,lx,ly,x,y,P.m0,2);line(ctx,lx,ly,x,y,i%2?P.m3:P.m1,1);lx=x;ly=y;}}
    // centre cable/rod
    line(ctx,px0,py0,hx,hy+1,P.m0,3);line(ctx,px0,py0,hx,hy+1,P.m3,1);
    const sp=clawSprite(s.clawOpen||0);
    // layers.claw (optional) draws the rotated sprite itself (GAME: at screen resolution, so the swinging claw has no moire)
    const drawClaw=img=>{if(layers&&layers.claw)layers.claw(ctx,img,hx,hy,a,COX);else{ctx.save();ctx.translate(Math.round(hx),Math.round(hy));ctx.rotate(a);ctx.drawImage(img,-COX,0);ctx.restore();}};
    drawClaw(sp.back);
    if(layers&&layers.held)layers.held(ctx,g.x,g.y,a);
    drawClaw(sp.front);
    if(layers&&layers.front)layers.front(ctx);   // toys in front of the claw (depth order), under the glass reflection
    ctx.drawImage(refl,0,0);
    ctx.drawImage(frame,0,0);
    // marquee: letters shimmer in a rainbow wave
    let x=MQX;for(let i=0;i<MQ.length;i++){if(!letters[i]){x+=5;continue;}const k=.5+.5*Math.sin(t*3-i*.6);
      ctx.drawImage(letters[i],x,19);if(k>.8){ctx.globalAlpha=(k-.8)*2.5;ctx.globalCompositeOperation="lighter";ctx.drawImage(letters[i],x,19);ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;}x+=LW+2;}
    panel(ctx,s);
  }
  return{W,H,GEOM,drawScene,drawBox:(ctx,front)=>ctx.drawImage(front?chf:chb,0,0),clawGrip:grip,P};
})();
