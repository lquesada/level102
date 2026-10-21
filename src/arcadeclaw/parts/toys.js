/* ===== TOYS: hand-placed pixel art plush toys (copied from the machine in the reference picture + new ones in the same style) =====
   Sprites are palette strings. "m" = mirrored: each row is the LEFT half and gets mirrored (symmetric toys).
   Letters: o outline, d dark, b base, l light, h shine, m patch (muzzle/belly), k mouth / patch shade, p pink (blush, inner ear),
   n nose, e eye, w eye shine (white), s spikes, plus toy-specific ones. */
const TOYS=(()=>{
  const P={ // palettes: letter + hex
    brown:"o3a1a0c d7a401c ba8622c lcc8848 he8b070 mf0c890 kb07a48 pf590a8 n3a1a0c",
    bigbrown:"o341608 d70381a b9e5a28 lc48244 he4ae6c mf2ca94 kb07a48 pf590a8 n341608",
    red:"o4c0e0a d9c2a1e bd8442f lf27058 hff9c84 mffcab4 kc06a5a pff9ab8 n4c0e0a",
    sky:"o0e2e58 d2e82c4 b64bdf2 la2dcff hd6f0ff mdff3ff k7cb4dc pff9ab8 n0e2e58",
    orange:"o5a2a08 dc46c18 bf4a43a lffc868 hffe0a0 mfbe2b8 kc89a68 pf590a8 nf47aa0 xd8781e",
    purple:"o2e1650 d6e44a8 ba676dc lc8a4f2 he4ccff mecdcff k9a7ac4 pff9ad0 nf47aa0",
    lilac:"o3e2268 d8a64c4 bc39ae8 ldcc0f6 hf0e2ff mf4ecff kb498d8 pff9ad0 nf47aa0",
    gray:"o26262e d6c6c7c ba6a6b4 lcfcfda hececf4 mf4f4f8 k8a8a98 pf590a8 nf47aa0 x7a7a88",
    black:"o0c0c18 d24243a b3a3a50 l5a5a78 h7a7a9c m6e6e8e k24243a pff8ab0 n0c0c18 effd23a w3a2a08",
    fox:"x4a1a06 o4a1a06 db04a12 bf0782a lffa45a hffc890 mfff4e6 kd8b49a pf590a8 nf47aa0",
    pink:"o5a1438 dc0507e bf28ab8 lffb6d6 hffd8ea mffe6f0 kc06890 pff5a94 n5a1438",
    dino:"o0c3214 d1e7a2c b3cb846 l76e070 hb0f4a0 md6f6b0 k1e7a2c s1f8a32 pff9ab8 n0c3214",
    frog:"o0a3810 d22862c b4cc84a l8cf07a hc0ffa8 k0a3810 pff9ab8 wffffff e1b1020",
    carblue:"o0c1648 d22409a b3a6ad8 l6c96f2 hb4ccff gbfe6ff t23232b rc8c8d4 yffe878 zff5a4a",
    carred:"o4a0c08 d9a2418 bd83830 lf26a5a hffa494 gbfe6ff t23232b rc8c8d4 yffe878 zffc84a",
    gold:"o4a3006 db07c10 bf0c232 lffe070 hfffbd0",
    rblue:"o0a2448 d1a64a8 b36a2e4 l86d0ff hd8f2ff",
    rgreen:"o0a3a1a d1c8040 b3ec466 l8cf0a0 hd8ffe0",
    white:"o3a344c dc4c0d4 bf2f0f6 lffffff hffffff mfff0f6 kd8c8dc pf6a0bc",
    peng:"o0c0c18 d1e2034 b2e3048 l4a4c6a mf6f6fa kd6d6e2 yffa62a pff9ab8",
    octo:"o4a0e3a da83a88 be86ac0 lff9ede hffc8ee k4a0e3a pff5aa0",
    steel:"o1e2434 d6e788e ba8b2c4 ld6dcea hf2f4fa z1e2a3a c5cf0ff t38c8c0 rff4a4a",
    duck:"o5a3806 dd8961a bffd23a lfff08a hfffcd0 yff9a2a zc8641a",
    star:"o5a3806 dd8961a bffd23a lfff08a hfffcd0 kc8641a pff9ab8",
    whale:"o0c1c4a d2a52a4 b4a86e0 l86b6ff hc4dcff md6e8ff k0c1c4a pff9ab8 y9ad8ff",
    panda:"a2a2a36 A1a1a24 o1a1a24 d9a9aa8 bf6f6f8 lffffff hffffff mffffff kc8c8d0 pf6a0bc n1a1a24",
    honey:"o5a3406 dc88a1a bf2c040 lffe07a hfff0b0 mfff2d0 kd8a860 pf590a8 n4a2a08",
    pinkbear:"o5a1a3a dc0608a bf49ac0 lffbedc hffdcec mfff0f6 kd8a0b8 pff6a9a n5a1a3a",
    mint:"o0c3a30 d2c9a80 b5cd6b8 l96f0d6 hc8fff0 mecfff8 k8cc8b8 pff9ab8 n0c3a30",
    polar:"o3a4458 dbcc8d8 bf0f6fa lffffff hffffff mffffff kccd4e0 pf6a0bc n3a4458",
    calico:"o3a2a24 dcabaa8 bf6f2ea lffffff hffffff mffffff kd8ccc0 pf590a8 nf47aa0 xf09a3a y3a3030",
    siamese:"o3a2414 d6a4a30 bf2e2c8 lfff4e0 hfffaf0 mfff8ee kc8b090 pf590a8 nf47aa0 x6a4a30 e2a5ac8 wffffff",
    tux:"o0c0c18 d24243a b3a3a50 l5a5a78 h7a7a9c mf4f4f8 kc8c8d0 pff8ab0 n0c0c18",
    pinkcat:"o5a1438 dc0507e bf49ac4 lffbedc hffdcec mfff0f6 kd8a0b8 pff6a9a nf47aa0",
    bluecat:"o0e2a52 d3a6ec0 b6c9eea la4c4ff hd4e4ff meef4ff k9ab0e0 pff9ab8 nf47aa0",
    pinkdino:"o4a1030 dc04a80 bf28ab8 lffb6d6 hffd8ea mffeef6 kc04a80 sc04a80 pff6a9a n4a1030",
    bluedino:"o0c2a52 d2a64c0 b4a92ea l86c0ff hc4e0ff me0f0ff k2a64c0 s2a64c0 pff9ab8 n0c2a52",
    purpledino:"o2e1650 d6a40b0 b9e6ae6 lc8a4f6 he6d0ff mf0e6ff k6a40b0 s6a40b0 pff9ad0 n2e1650",
    orangedino:"o5a2408 dc4601a bf49a3a lffc06a hffe0a0 mfff0d0 kc4601a sc4601a pff9ab8 n5a2408",
    pinkbun:"o5a1a3a de0a0bc bffd2e4 lffeaf2 hffffff mfff6fa kd8a8bc pff6a9a",
    brownbun:"o3a1a0c d8a5430 bc08a5a ldcae80 hf0d0a8 mf6e2cc kb08a68 pf590a8",
    mintjelly:"o0c3a30 d2c9a80 b6ee0c0 la8f6e2 hd8fff4 meafff8 k8cc8b8 pff9ab8 n0c3a30",
    lemon:"o5a4006 dd0a018 bffe04a lfff08a hfffcd0 mfffae0 kd8b860 pff9ab8 n5a4006",
    grape:"o2e1650 d6e44a8 ba676dc lc8a4f2 he4ccff mf0e6ff k9a7ac4 pff9ad0 n2e1650",
    peach:"o5a2a10 dd8743a bffa86a lffcc98 hffe6c8 mfff0e0 kd8a080 pff6a9a n5a2a10",
    axolotl:"o5a1438 dc0507e bf6a0c4 lffc4dc hffe0ee kc0507e pff5a94 wffffff e1b1020",
    cargreen:"o0a3a1a d1c8040 b3ec466 l8cf0a0 hd8ffe0 gbfe6ff t23232b rc8c8d4 yffe878 zff5a4a",
    caryellow:"o5a3806 dd8961a bffd23a lfff08a hfffcd0 gbfe6ff t23232b rc8c8d4 yffffff zff5a4a",
    rpink:"o5a1438 dc0507e bf28ab8 lffc4dc hfff0f6",
    rpurple:"o2e1650 d6e44a8 ba676dc lc8a4f2 hf0e6ff",
    blueghost:"o1e3a5a d8ab4e0 bcfe6ff le8f6ff hffffff mfff0f6 k8ab4e0 pf6a0bc",
    bluoct:"o0e2a52 d2e6ac4 b5a96ee l96c0ff hd0e6ff k0e2a52 pff9ab8",
    pinkstar:"o5a1438 dc0507e bf28ab8 lffc4dc hfff0f6 kc0507e pff6a9a",
    pinkwhale:"o4a1030 dc04a80 bf28ab8 lffb6d6 hffdcec mfff0f6 k4a1030 pff6a9a yffd0e8",
    bluemush:"o0e2a52 d2a52a4 b4a86e0 l86b6ff hc4dcff wffffff mf6e6c6 kc8a87a e1b1020 pff9ab8",
    mush:"o4a0a0c da01e22 be8433e lff7a6a hffb0a0 wffffff mf6e6c6 kc8a87a e1b1020 pff9ab8",
    pig:"o5a1a3a dc0608a bf4a6c0 lffc4dc hffdcec mf47aa0 kc06a8a pff6a9a n5a1a3a",
    koala:"o2a2a36 d6c6c80 ba0a0b4 lc8c8d8 he4e4ee mf0f0f6 k5a5a68 pf6a0bc n23232e",
    lion:"o5a3406 dc88a1a bf2c040 lffe07a hfff0b0 mfff2d0 kd8a860 pf590a8 n4a2a08 xd8781e y9a4a10",
    owl:"o3a1a0c d8a5430 bc08a5a ldcae80 hf0d0a8 mf6ead6 kb08a68 pf590a8 yffa62a zc8641a",
    chick:"o5a3806 dd8961a bffd23a lfff08a hfffcd0 mfff2c0 kc8641a pff9ab8 yff9a2a zc8641a",
    hamster:"o5a2a08 dd8843a bf6b46a lffd29a hffe8c4 mfff6ea kd8a880 pf590a8 n5a2a08",
    sheep:"o3a344c dc4c0d4 bf2f0f6 lffffff hffffff mf6dcc4 kc8a890 pf6a0bc n3a344c x6a5a58",
    elephant:"o1e2a44 d5a7aa8 b8eaed8 lb8d0f0 hdcecff me0ecfa k5a7aa8 pf6a0bc n1e2a44",
    monkey:"o3a1a0c d7a401c ba8622c lcc8848 he8b070 mf6dcb8 kb07a48 pf590a8 n3a1a0c",
    turtle:"o0c3214 d1e7a2c b3cb846 l76e070 hb0f4a0 md6f6b0 k1e7a2c pff9ab8 n0c3214 x8a5a20 yc8943a",
    bee:"o3a2a06 dd8961a bffd23a lfff08a hfffcd0 mdcf0ff k5a3806 pff9ab8 n3a2a06 x3a2a06",
    unicorn:"o4a2a5a dc4a8d8 bf6f0fa lffffff hffffff mfff0f6 kd8c0dc pff9ad0 nf47aa0 yffd23a xb07aff qff9ad0",
    hedgehog:"o3a2414 d6a4a30 b9a7048 lc8a070 he0c098 mf6e2c8 kb09070 pf590a8 n2a1a10 s5a3a20"};
  const BASE="e1b1020 wffffff";
  // per-kind head size/position (fractions of W/H), round = one round body (no separate head), face = its own nose/mouth
  const beak=(put,g)=>{const x=Math.floor(g.cx)-1,y=Math.round(g.fy+g.eh*.5);put(x,y,"y");put(x+1,y,"y");put(x,y+1,"z");put(x+1,y+1,"z");};
  const KIND={
    pig:{face(put,g){const sy=g.ny+.5;for(let y=-2;y<=2;y++)for(let x=-4;x<=3;x++)if(((x+.5)*(x+.5))/16+(y*y)/5<=1)put(g.cx+x,sy+y,"m");put(g.cx-2,sy,"n");put(g.cx+1,sy,"n");put(g.cx-1,sy+3,"k");put(g.cx,sy+3,"k");}},
    koala:{hrx:.38,blush:.28,face(put,g){for(let y=0;y<4;y++)for(let x=-2;x<2;x++)if(!((y===0||y===3)&&(x===-2||x===1)))put(g.cx+x,g.ny-1+y,"n");put(g.cx-1,g.ny+3,"k");put(g.cx,g.ny+3,"k");}},
    lion:{hy:.36,hrx:.33,hry:.24,blush:.24},
    owl:{round:1,cy:.55,rx:.42,ry:.43,fy:.4,ex:.17,face:beak},
    chick:{round:1,cy:.56,rx:.44,ry:.4,fy:.5,face:beak},
    hamster:{round:1,cy:.56,rx:.47,ry:.4,fy:.5},
    bee:{round:1,cy:.6,rx:.4,ry:.36,fy:.46},
    sheep:{hrx:.4,hry:.27,blush:.25},
    elephant:{hrx:.3,blush:.22,face(put,g){for(let y=0;y<8;y++){put(g.cx-1,g.ny-1+y,"l");put(g.cx,g.ny-1+y,"b");}put(g.cx+1,g.ny+6,"b");put(g.cx+1,g.ny+7,"d");}},
    monkey:{hrx:.36,blush:.26},
    turtle:{hy:.3,hrx:.3,hry:.24,blush:.22},
    unicorn:{hy:.44,hry:.25},
    hedgehog:{hrx:.38,hry:.27,blush:.26}};
  /* ---- round plush generator: shapes are drawn at their real size (no stretching), written as palette letters ---- */
  function plush(kind,W,H,opt={}){
    const L=[...Array(H)].map(()=>Array(W).fill(".")),SID=[...Array(H)].map(()=>Array(W).fill(-1));let sid=0;
    const ell=(cx,cy,rx,ry,ch,shade=true)=>{const s=sid++;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const nx=(x+.5-cx)/rx,ny=(y+.5-cy)/ry;if(nx*nx+ny*ny>1)continue;
      let c=ch;if(shade&&ch==="b"){const l=-nx*.55-ny*.8,d=nx*.5+ny*.85;c=d>.68?"d":l>.62?(l>.95?"h":"l"):"b";}L[y][x]=c;SID[y][x]=s;}return s;};
    const tri=(ax,ay,bx,by,qx,qy,ch)=>{const s=sid++;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const px=x+.5,py=y+.5,e=(x1,y1,x2,y2)=>(x2-x1)*(py-y1)-(y2-y1)*(px-x1);
      const a=e(ax,ay,bx,by),b=e(bx,by,qx,qy),c=e(qx,qy,ax,ay);if((a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0)){L[y][x]=ch;SID[y][x]=s;}}return s;};
    const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(y>=0&&y<H&&x>=0&&x<W&&L[y][x]!==".")L[y][x]=c;};
    const put_=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(y>=0&&y<H&&x>=0&&x<W){L[y][x]=c;SID[y][x]=sid;}};
    const cx=W/2,big=W>=32,K=KIND[kind]||{},round=!!K.round;
    // head: round, ~60% of the height; body narrower than the head, paws tucked under
    const hy=H*(K.hy||(kind==="bunny"?.44:.37)),hrx=W*(K.hrx||(kind==="cat"?.45:.44)),hry=H*(K.hry||(kind==="bunny"?.24:.29));
    if(kind==="lion"){ell(cx,hy+hry*.1,hrx*1.42,hry*1.42,"y",false);ell(cx,hy+hry*.06,hrx*1.24,hry*1.24,"x",false);   // mane, two tones
      for(let i=0;i<12;i++){const t=i/12*Math.PI*2;ell(cx+Math.cos(t)*hrx*1.3,hy+hry*.1+Math.sin(t)*hry*1.3,W*.07,W*.07,"y",false);}
      ell(W*.85,H*.8,W*.07,H*.1,"b");ell(W*.89,H*.66,W*.07,W*.07,"y",false);}   // tail with a tuft
    if(kind==="monkey")ell(W*.86,H*.72,W*.08,H*.15,"b");                          // tail
    if(kind==="bee")for(const s of[-1,1])ell(cx+s*W*.34,H*.3,W*.17,H*.13,"m",false);   // wings
    if(kind==="sheep"){for(let i=0;i<9;i++){const t=Math.PI*(1.05+i/8*.9);ell(cx+Math.cos(t)*hrx*.78,hy+Math.sin(t)*hry*.78,W*.15,W*.15,"b");}   // wool puffs
      for(const s of[-1,1])ell(cx+s*hrx*1.02,hy+hry*.3,W*.11,H*.055,"x",false);}   // ears sticking out of the wool
    if(kind==="cat"&&opt.tail!==false){ell(W*.86,H*.66,W*.09,H*.16,"b");}
    let body=-1;
    if(kind==="turtle"){ell(cx,H*.72,W*.44,H*.24,"y",false);body=ell(cx,H*.72,W*.38,H*.2,"x",false);   // shell (the body) with a rim
      for(const[dx,dy]of[[-.24,-.06],[.24,-.06],[0,.02],[-.13,.13],[.13,.13]])ell(cx+dx*W,H*(.72+dy),W*.07,H*.045,"y",false);
      for(const s of[-1,1]){ell(cx+s*W*.42,H*.62,W*.09,H*.08,"b");ell(cx+s*W*.3,H*.93,W*.11,H*.07,"b");}}   // flippers
    else if(!round&&kind!=="blob"&&kind!=="critter"){body=ell(cx,H*.77,W*.33,H*.2,"b");
      const ar=opt.panda?"a":"b";ell(cx-W*.3,H*.73,W*.1,H*.11,ar);ell(cx+W*.3,H*.73,W*.1,H*.11,ar);   // arms
      ell(cx,H*.79,W*.18,H*.13,"m",false);                                                                                   // belly
      const ft=kind==="cat"?"m":kind==="sheep"?"x":"b";ell(cx-W*.17,H*.93,W*.13,H*.07,ft);ell(cx+W*.17,H*.93,W*.13,H*.07,ft);}         // feet
    // ears (behind the head)
    if(kind==="teddy"){for(const s of[-1,1]){ell(cx+s*hrx*.66,hy-hry*.74,W*.135,W*.135,opt.panda?"a":"b");ell(cx+s*hrx*.66,hy-hry*.7,W*.065,W*.065,"p",false);}}
    if(kind==="cat"){for(const s of[-1,1]){tri(cx+s*hrx*.92,hy-hry*1.22,cx+s*hrx*.95,hy-hry*.2,cx+s*hrx*.2,hy-hry*.62,"b");
      tri(cx+s*hrx*.8,hy-hry*.98,cx+s*hrx*.82,hy-hry*.42,cx+s*hrx*.42,hy-hry*.62,"p");}}
    if(kind==="bunny"){for(const s of[-1,1]){ell(cx+s*W*.2,H*.16,W*.11,H*.16,"b");ell(cx+s*W*.2,H*.17,W*.05,H*.12,"p",false);}}
    if(kind==="blob"||kind==="critter"){for(const s of[-1,1])ell(cx+s*W*.28,H*.22,W*.1,W*.1,"b");}
    if(kind==="hamster"||kind==="lion"){const ey=kind==="lion"?hy-hry*.78:H*.22,ex_=kind==="lion"?hrx*.72:W*.3;
      for(const s of[-1,1]){ell(cx+s*ex_,ey,W*.1,W*.1,"b");ell(cx+s*ex_,ey+.5,W*.05,W*.05,"p",false);}}
    if(kind==="pig"||kind==="unicorn")for(const s of[-1,1]){tri(cx+s*hrx*1.02,hy-hry*1.12,cx+s*hrx*.98,hy-hry*.25,cx+s*hrx*.28,hy-hry*.8,"b");
      tri(cx+s*hrx*.9,hy-hry*.9,cx+s*hrx*.86,hy-hry*.45,cx+s*hrx*.5,hy-hry*.72,"p");}
    if(kind==="koala")for(const s of[-1,1]){ell(cx+s*hrx*.92,hy-hry*.5,W*.19,W*.19,"b");ell(cx+s*hrx*.95,hy-hry*.45,W*.1,W*.1,"m",false);}
    if(kind==="elephant")for(const s of[-1,1]){ell(cx+s*hrx*1.05,hy+hry*.05,W*.2,H*.22,"b");ell(cx+s*hrx*1.08,hy+hry*.08,W*.12,H*.14,"p",false);}
    if(kind==="monkey")for(const s of[-1,1]){ell(cx+s*hrx*1.02,hy+hry*.05,W*.12,W*.12,"b");ell(cx+s*hrx*1.04,hy+hry*.05,W*.06,W*.06,"m",false);}
    if(kind==="hedgehog")for(let i=0;i<9;i++){const t=Math.PI*(1.0+i/8),c_=Math.cos(t),s_=Math.sin(t),bx=cx+c_*hrx*.7,by=hy+s_*hry*.7,px=-s_,py=c_;   // spikes all around the top
      tri(bx+c_*hrx*.62,by+s_*hry*.62,bx+px*W*.1,by+py*W*.1,bx-px*W*.1,by-py*W*.1,"s");}
    if(kind==="owl")for(const s of[-1,1])tri(cx+s*W*.4,H*.04,cx+s*W*.38,H*.3,cx+s*W*.12,H*.2,"b");   // ear tufts
    if(kind==="chick")for(const dx of[-1.5,0,1.5])tri(cx+dx,H*.06,cx+dx-1.6,H*.2,cx+dx+1.6,H*.2,"b");   // a little tuft
    if(kind==="bee")for(const s of[-1,1]){for(let j=0;j<4;j++)put_(cx+s*(2+j*.8),H*.22-j*1.2,"o");put_(cx+s*5,H*.22-4.6,"o");put_(cx+s*5.6,H*.22-4.6,"o");}   // antennae
    const head=kind==="blob"||kind==="critter"?ell(cx,H*.56,W*.46,H*.41,"b"):round?ell(cx,H*K.cy,W*K.rx,H*K.ry,"b"):ell(cx,hy,hrx,hry,"b");
    if(kind==="teddy"||kind==="lion"||kind==="koala")ell(cx,hy+hry*.45,W*.16,H*.085,"m",false);                       // muzzle
    if(kind==="sheep"||kind==="hedgehog")ell(cx,hy+hry*.28,hrx*.66,hry*.66,"m",false);   // the face
    if(kind==="monkey"){for(const s of[-1,1])ell(cx+s*W*.12,hy-hry*.08,W*.15,H*.12,"m",false);ell(cx,hy+hry*.45,W*.21,H*.1,"m",false);}
    if(kind==="owl"){for(const s of[-1,1])ell(cx+s*W*.17,H*.4,W*.15,W*.15,"m",false);for(const s of[-1,1])ell(cx+s*W*.37,H*.63,W*.1,H*.2,"d",false);   // eye discs, wings
      ell(cx,H*.74,W*.2,H*.15,"l",false);for(const[dx,dy]of[[-2,0],[2,0],[0,2],[-3,4],[3,4]])put(cx+dx-.5,H*.7+dy,"k");}   // feathered belly
    if(kind==="hamster")for(const s of[-1,1])ell(cx+s*W*.3,H*.68,W*.15,H*.14,"m",false);   // full cheeks
    if(kind==="chick")for(const s of[-1,1])ell(cx+s*W*.43,H*.66,W*.1,H*.16,"l",false);   // little wings
    if(kind==="bee"){const b0=H*K.cy;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=y+.5-b0;if((v>H*.08&&v<H*.16)||(v>H*.25&&v<H*.32))put(x,y,"x");}}   // stripes
    if(kind==="unicorn"){tri(cx,hy-hry*1.7,cx-W*.07,hy-hry*.75,cx+W*.07,hy-hry*.75,"y");   // horn
      for(const[dx,dy,c]of[[-.18,-.95,"x"],[-.32,-.78,"q"],[-.42,-.5,"x"],[-.46,-.18,"q"]])ell(cx+dx*hrx*2.2,hy+dy*hry,W*.09,W*.09,c,false);}   // mane
    // face
    const fy=kind==="blob"||kind==="critter"?H*.5:round?H*K.fy:hy+hry*(K.fy||.08),ex=W*(K.ex||kind==="critter"?.2:.21),eh=big?4:3,ew=big?3:(W<22?2:3);
    for(const s of[-1,1]){const x0=Math.round(cx+s*ex-ew/2);for(let j=0;j<eh;j++)for(let i=0;i<ew;i++)put(x0+i,Math.round(fy-eh/2)+j,"e");put(x0,Math.round(fy-eh/2),"w");
      const bx_=W*(K.blush||.34);put(cx+s*bx_-(s<0?1:0),fy+eh*.5+1,"p");put(cx+s*bx_-(s<0?0:1),fy+eh*.5+1,"p");
      if(opt.panda){for(let j=-1;j<=eh;j++){put(x0-1,Math.round(fy-eh/2)+j,"A");put(x0+ew,Math.round(fy-eh/2)+j+1,"A");}for(let i=0;i<ew;i++)put(x0+i,Math.round(fy-eh/2)+eh,"A");}}
    const c0=Math.floor(cx)-1,c1=Math.floor(cx)-(W%2?0:0),ny=Math.round(fy+eh*.5+(kind==="teddy"?0:0));
    if(K.face)K.face(put,{cx,c0,ny,fy,eh,W,H,hy,hry});
    else{put(c0,ny,"n");put(c0+1,ny,"n");if(W%2)put(c0+2,ny,"n");
    put(c0,ny+1,"k");put(c0+1+(W%2),ny+1,"k");put(c0-1,ny+2,"k");put(c0+2+(W%2),ny+2,"k");if(W%2)put(c0+1,ny+2,"k");}
    // markings
    if(opt.stripes){const t=Math.round(hy-hry*.8);for(const dx of[-2,0,2]){put(cx+dx-.5,t,"x");put(cx+dx-.5,t+1,"x");}put(cx-hrx*.85,fy+1,"x");put(cx+hrx*.85-1,fy+1,"x");put(cx-hrx*.8,fy+3,"x");put(cx+hrx*.8-1,fy+3,"x");}
    if(opt.calico){for(let j=0;j<3;j++)for(let i=0;i<3;i++){put(cx-hrx*.6+i,hy-hry*.55+j,"x");put(cx+hrx*.45+i,hy-hry*.6+j,"y");put(cx-W*.2+i,H*.78+j,"x");}}
    if(opt.siamese){for(let i=-3;i<3;i++){put(cx+i,ny-1,"x");put(cx+i,ny+2,"x");}put(cx-4,ny,"x");put(cx+3,ny,"x");put(cx-4,ny+1,"x");put(cx+3,ny+1,"x");}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x===0||y===0||x===W-1||y===H-1)L[y][x]=".";
    // seams (head over body / arms) + outline
    const R=L.map(r=>r.slice());
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(L[y][x]==="."||SID[y][x]!==head)continue;
      for(const[dx,dy]of[[0,1],[1,0],[-1,0]]){const X=x+dx,Y=y+dy;if(Y<H&&X>=0&&X<W&&L[Y][X]!=="."&&SID[Y][X]!==head&&SID[Y][X]<head&&"ewpnkA".indexOf(L[y][x])<0){R[y][x]="o";break;}}}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(L[y][x]===".")for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<W&&Y<H&&L[Y][X]!=="."){R[y][x]="o";break;}}
    return R.map(r=>r.join(""));
  }
  const S={ /* ---------- templates ---------- */
    teddy:{gen:o=>plush("teddy",26,30,o)},bigteddy:{gen:o=>plush("teddy",34,40,o)},
    cat:{gen:o=>plush("cat",27,29,o)},bigcat:{gen:o=>plush("cat",34,38,o)},
    blob:{gen:o=>plush("blob",24,21,o)},
    pig:{gen:o=>plush("pig",26,28,o)},koala:{gen:o=>plush("koala",28,29,o)},lion:{gen:o=>plush("lion",30,32,o)},owl:{gen:o=>plush("owl",24,28,o)},
    chick:{gen:o=>plush("chick",20,20,o)},hamster:{gen:o=>plush("hamster",24,20,o)},sheep:{gen:o=>plush("sheep",28,30,o)},elephant:{gen:o=>plush("elephant",30,29,o)},
    monkey:{gen:o=>plush("monkey",28,29,o)},turtle:{gen:o=>plush("turtle",28,28,o)},bee:{gen:o=>plush("bee",22,26,o)},unicorn:{gen:o=>plush("unicorn",26,32,o)},
    hedgehog:{gen:o=>plush("hedgehog",28,28,o)},critter:{gen:o=>plush("critter",20,18,o)},bunny:{gen:o=>plush("bunny",22,32,o)},
    dino:{grow:{rows:[1,3,4,5,9,11,13,15,18],cols:[2,4,6,7,9,11,13,15]},r:["...ooooooo............","..obllllbbo...........",".obllbbbbbbo..........","obllbbwebbbbo.........","obbbbbeebbbbo.........",
      "onbbbbbbbbbbbo........",".okkkkbbbbbbbo........","..oommmbbbbbbo........",".....obbbbbbbbo.os....","....obbbbbbbbbbos.....",
      "...obmmmbbbbbbbbos....","..obmmmmmbbbbbbbbso...","..oobmmmmmbbbbbbbbo...","....ommmmmbbbbbbbbbo..","....ommmmmbbbbbbbbbbo.",
      "....obmmmmbbbbbbbdbbbo","....obbmmbbbbbbbddoooo","....obbbbbbbbbbdo.....","....obbbdobbbbbdo.....","....obbbdo.obbbdo.....",
      "...obbbbdo.obbbbdo....","...oooooo..ooooooo...."]},
    bigdino:{grow:{rows:[1,3,4,5,9,11,14,15,17,19,22],cols:[2,4,6,7,9,11,13,15,17,19]},r:["....ooooooooo...............","...ollllllllbo..............","..olllhhllbbbbo.............",".ollbbbbbbbbbbbo............",
      "olbbbwwebbbbbbbbo...........","obbbbweebbbbbbbbo...........","obbbbeeebbbbbbbbbo..........","onbbbbbbbbbbbbbbbo..........",
      "obbppbbbbbbbbbbbbo..s.......",".okkkkkkbbbbbbbbbo.oso......","..ommmmmmbbbbbbbo.osso......","...ooommmmbbbbbbbbosbo......",
      "......oommbbbbbbbbbbbo.s....",".....obbbbbbbbbbbbbbbbosso..","....obmmmbbbbbbbbbbbbbbbo...","...obmmmmmbbbbbbbbbbbbbbbo..",
      "..obbommmmmmbbbbbbbbbbbbo...","..obdommmmmmbbbbbbbbbbbbbo..","...ooommmmmmbbbbbbbbbbbbbbo.",".....ommmmmbbbbbbbbbbbbbbbo.",
      ".....obmmmbbbbbbbbbbbbbbdddo",".....obbbbbbbbbbbbbbbbddoooo","......obbbbbbbbbbbbbbdo.....","......obbbbdobbbbbbbbdo.....",
      ".....obbbbbdo.obbbbbbdo.....","....obbbbbbdo.obbbbbbbdo....","....oooooooo..oooooooooo...."]},
    frog:{m:1,grow:{rows:[1,3,4,6,8,10],cols:[2,3,7,9]},r:["..ooooo....",".owwwwwo...","owwweewoooo","owwweewolll","owwwwwwolll",".owwwwolllb",".oolllllbbb","olllbbbbbbb",
      "olpbbbbbbbb","obbkbbbbbbb","obbbkkkkkkk",".odbbbbbbbb","..oddddbbbb","....ooooooo"]},
    car:{grow:{rows:[3,5,6,7],cols:[3,6,8,9,12,15,18,20]},r:["......ooooooooo.........",".....oggogggggo.........","....oggggoggggggo.......","...obbbbbbbbbbbbbooo....",
      ".oollllllllllllllllllo..","ozbbbbbbbbbbbbbbbbbbbyo.","obbbbbbbbbbbbbbbbbbbbbo.","obbbbbbbbbbbbbbbbbbbbbo.",
      "oddoooodddddddoooodddo..",".oottttoooooootttttoo...","..ottrrtto...ottrrtto...","..otttttto...otttttto...","...oooooo....oooooo....."]},
    ring:{m:1,grow:{rows:[2,5,7,8,10,13],cols:[2,4,6]},r:[".....ooo","...oolll","..olhhbb",".olhbbbb",".olbbooo","olbbo...","olbo....","obbo....","obbo....","obdo....","obdbo...",
      ".odbbooo",".oddbbbb","..oddddd","...ooddd",".....ooo"]},
    ringS:{m:1,grow:{rows:[2,4,6,8],cols:[1,3]},r:["...ooo",".oollh","olhbbb","olbooo","obo...","obo...","odo...","odbooo",".oddbb","..oddd","....oo"]},
    penguin:{m:1,grow:{rows:[2,4,5,8,10,12,14,16],cols:[2,3,5,6]},r:["....ooooo","...obbbbb","..obbbbbb",".obbmmmmm",".obmmwemm",".obmmeemm",".obpmmmyy",".obbmmmmm","obbbbmmmm",
      "obbbmmmmm","obbbmmmmm","obbdmmmmm","obbdmmmmm","obdbmmmmm",".obbbmmmm",".obbbbmmm","..obbbbbb","..oyyyobb","..ooooooo"]},
    octopus:{m:1,grow:{rows:[2,4,5,6,9,12,13],cols:[3,5,7,8]},r:[".....oooooo","...oollllll","..ollllbbbb",".olllbbbbbb",".olbbbbbbbb","olbbbwebbbb","olbbbeebbbb","obbbbeebbbb",
      "obppbbbbbbk","obbbbbbbbbb",".odbbbbbbbb",".obdbbbbbbb","obbobbobbob","obbobbobbob","obdobdobdob","olbolbolbob",".oo.oo.oo.o"]},
    robot:{m:1,grow:{rows:[4,6,8,11,12,14,16,18],cols:[3,5,7]},r:["........r","........o","...oooooo","..ollllll","..olbbbbb","..obzzzzz","..obzcczz","..obzzzzz","..odbbbbb","...oooooo",
      ".ooolllll","oblolbbbb","obbobtttt","obbobtttt","obdobbbbb",".ooobbbbb","...odbbbb","....obbo.","....obbo.","...oddddo","...oooooo"]},
    duck:{grow:{rows:[2,3,5,8,9,11],cols:[4,6,8,9,11,13,15,17]},r:["....oooo............","...ollllo...........","..ollhhllo..........","..olwebbbo..........","..olbebbbo..........",
      "yyyobbbbbo...ooo....","zzzobbbbbbo.oblo....",".oooobbbbbboobbo....","....obbbbbbbbbbbo...","...obllllbbbbbbbbo..",
      "...obllllbbbbbbbbbo.","...obbllbbbbbbbbbo..","....obbbbbbbbbbdo...",".....odbbbbbbddo....","......oooooooooo...."]},
    ghost:{m:1,grow:{rows:[2,4,6,7,9,11,13],cols:[2,4,5,6]},r:["....ooooo","..oolllll",".ollllbbb",".olbbbbbb","olbbbbbbb","olbbwebbb","obbbeebbb","obbbeebbb","obpbbbbbb",
      "obbbbbbbk","obbbbbbbk","obbbbbbbb","obdbbbbbb","obdbbbbbb","obbbbbbbb","obbbbbbbb","obbobbobb",".oo.oo.oo"]},
    star:{m:1,grow:{rows:[3,6,7,8,10,12],cols:[3,5,6,8]},r:[".........o","........ol",".......olb",".......olb","......ollb","oooooollbb","ollllllbbb",".obbbwebbb","..obbeebbb",
      "...opbbbbk","....obbbbb","...obbbbbb","...obbbbdd","..obbdo...",".obddo....",".ooo......"]},
    whale:{grow:{rows:[4,6,7,9,10,11],cols:[3,6,9,12,15,18,20,22]},r:[".................yy.......","................y..y......",".........ooooooooo........",".......oollllllllloo......",
      "......ollhhllllllllllo....","o....olllbbbbbbbbbbbbbo...","oo..olbbbbbbbbbbbwebbbbo..","obo.obbbbbbbbbbbbeebbbbbo.",
      "obbooobbbbbbbbbbbbbbbpbbo.","obbbbbbbbbbbbbbbbbbbbbbkbo",".obbbbmmmmmmmmmmmmmmmkkbo.","..obbmmmmmmmmmmmmmmmmmmo..",
      "...odmmmmmmmmmmmmmmmmdo...",".....oodddddddddddddoo....",".......ooooooooooooo......"]},
    mushroom:{m:1,grow:{rows:[1,3,5,6,10,11],cols:[2,4,6]},r:["....ooooo","..oolllll",".ollwwbbb",".olwwwbbb","olbbwbbbb","olbbbbbww","obbbbbbww","odbbbbbbb",".oddddddd",
      "..ooommmm","....omwem","....ommem","....opmmk","....ommmm","....okmmm",".....oooo"]}};
  // the toys: [id, template, palette(+overrides), EN, ES, DE, mass, grip, extra pixels "x,y,c;..."]
  const DEF=[
    ["bear_brown","teddy","brown","Brown teddy","Osito marrón","Brauner Teddy",1,.9],
    ["cat_orange","cat","orange","Ginger cat","Gato canela","Rote Katze",1,.85,"@stripes"],
    ["blob_blue","blob","sky","Sky jelly","Gominola celeste","Himmelsglibber",.8,.8],
    ["bear_big","bigteddy","bigbrown","Big teddy","Osote","Riesenteddy",1.6,.9],
    ["dino_green","dino","dino","Little dino","Dinosaurio","Kleiner Dino",1,.75],
    ["cat_purple","cat","purple","Purple cat","Gato morado","Lila Katze",1,.85],
    ["cat_gray","cat","gray","Grey cat","Gato gris","Graue Katze",1,.85,"@stripes"],
    ["bear_red","teddy","red","Red bear","Oso rojo","Roter Bär",1,.9],
    ["dino_big","bigdino","dino","Big dino","Dinosaurio grande","Großer Dino",1.7,.7],
    ["cat_ginger_big","bigcat","orange","Big ginger cat","Gatazo canela","Große rote Katze",1.4,.85,"@stripes"],
    ["cat_purple_big","bigcat","purple","Big purple cat","Gatazo morado","Große lila Katze",1.4,.85],
    ["critter_pink","critter","pink","Pink pal","Amiguito rosa","Rosa Freund",.6,.75],
    ["frog_head","frog","frog","Frog head","Cabeza de rana","Froschkopf",.8,.7],
    ["car_blue","car","carblue","Blue racer","Coche azul","Blaues Auto",.9,.45],
    ["car_red","car","carred","Red racer","Coche rojo","Rotes Auto",.9,.45],
    ["ring_gold","ring","gold","Gold ring","Anillo dorado","Goldring",.4,.35],
    ["ring_blue","ring","rblue","Blue ring","Anillo azul","Blauer Ring",.4,.35],
    ["ring_green","ringS","rgreen","Green ring","Anillo verde","Grüner Ring",.35,.35],
    ["cat_lilac","cat","lilac","Lilac kitty","Gatita lila","Fliederkätzchen",1,.85],
    ["bunny","bunny","white","Bunny","Conejito","Häschen",.9,.85],
    ["penguin","penguin","peng","Penguin","Pingüino","Pinguin",1,.8],
    ["octopus","octopus","octo","Octopus","Pulpo","Krake",.9,.8],
    ["robot","robot","steel","Robot","Robot","Roboter",1.2,.6],
    ["duck","duck","duck","Duck","Patito","Entchen",.7,.75],
    ["ghost","ghost","white","Ghost","Fantasmita","Gespenst",.6,.8],
    ["star","star","star","Star plush","Estrella","Sternchen",.6,.7],
    ["whale","whale","whale","Whale","Ballena","Wal",1.1,.7],
    ["mushroom","mushroom","mush","Mushroom","Seta","Pilz",.7,.8],
    ["fox","cat","fox","Fox","Zorrito","Füchslein",1,.85,""],
    ["bear_blue","teddy","sky","Blue bear","Oso azul","Blauer Bär",.9,.9],
    ["cat_black","cat","black","Night cat","Gato negro","Schwarze Katze",1,.85],
    ["panda","teddy","panda","Panda","Panda","Panda",1,.9,"@panda"],
    ["bear_honey","teddy","honey","Honey bear","Osito miel","Honigbär",1,.9],
    ["bear_pink","teddy","pinkbear","Pink bear","Osita rosa","Rosa Bär",1,.9],
    ["bear_mint","teddy","mint","Mint bear","Oso menta","Minzbär",1,.9],
    ["bear_polar","bigteddy","polar","Polar bear","Oso polar","Eisbär",1.5,.9],
    ["cat_calico","cat","calico","Patchy cat","Gato calicó","Glückskatze",1,.85,"@calico"],
    ["cat_siamese","cat","siamese","Cream cat","Gato crema","Cremekatze",1,.85,"@siamese"],
    ["cat_tux","cat","tux","Tuxedo cat","Gato esmoquin","Smokingkatze",1,.85],
    ["cat_pink","cat","pinkcat","Pink cat","Gata rosa","Rosa Katze",1,.85],
    ["cat_blue","bigcat","bluecat","Blue cat","Gato azul","Blaue Katze",1.4,.85],
    ["dino_pink","dino","pinkdino","Pink dino","Dino rosa","Rosa Dino",1,.75],
    ["dino_blue","dino","bluedino","Blue dino","Dino azul","Blauer Dino",1,.75],
    ["dino_purple","bigdino","purpledino","Purple dino","Dino morado","Lila Dino",1.7,.7],
    ["dino_orange","dino","orangedino","Orange dino","Dino naranja","Oranger Dino",1,.75],
    ["bunny_pink","bunny","pinkbun","Pink bunny","Conejita rosa","Rosa Häschen",.9,.85],
    ["bunny_brown","bunny","brownbun","Brown bunny","Conejo marrón","Braunes Häschen",.9,.85],
    ["jelly_mint","blob","mintjelly","Mint jelly","Gominola menta","Minzglibber",.8,.8],
    ["jelly_lemon","blob","lemon","Lemon jelly","Gominola limón","Zitronenglibber",.8,.8],
    ["critter_grape","critter","grape","Grape pal","Amiguito uva","Traubenfreund",.6,.75],
    ["critter_peach","critter","peach","Peach pal","Amiguito melocotón","Pfirsichfreund",.6,.75],
    ["axolotl","frog","axolotl","Axolotl","Ajolote","Axolotl",.8,.7],
    ["car_green","car","cargreen","Green racer","Coche verde","Grünes Auto",.9,.45],
    ["car_yellow","car","caryellow","Yellow racer","Coche amarillo","Gelbes Auto",.9,.45],
    ["ring_pink","ring","rpink","Pink ring","Anillo rosa","Rosa Ring",.4,.35],
    ["ghost_blue","ghost","blueghost","Blue ghost","Fantasmita azul","Blaues Gespenst",.6,.8],
    ["octopus_blue","octopus","bluoct","Blue octopus","Pulpo azul","Blaue Krake",.9,.8],
    ["star_pink","star","pinkstar","Pink star","Estrella rosa","Rosa Sternchen",.6,.7],
    ["whale_pink","whale","pinkwhale","Pink whale","Ballena rosa","Rosa Wal",1.1,.7],
    ["mushroom_blue","mushroom","bluemush","Blue mushroom","Seta azul","Blauer Pilz",.7,.8],
    ["pig","pig","pig","Piglet","Cerdito","Schweinchen",.9,.85],
    ["koala","koala","koala","Koala","Koala","Koala",1,.9],
    ["lion","lion","lion","Lion","León","Löwe",1.1,.85],
    ["owl","owl","owl","Owl","Búho","Eule",.8,.8],
    ["chick","chick","chick","Chick","Pollito","Küken",.5,.75],
    ["hamster","hamster","hamster","Hamster","Hámster","Hamster",.6,.8],
    ["sheep","sheep","sheep","Lamb","Ovejita","Schäfchen",1,.9],
    ["elephant","elephant","elephant","Elephant","Elefante","Elefant",1.2,.85],
    ["monkey","monkey","monkey","Monkey","Monito","Äffchen",1,.85],
    ["turtle","turtle","turtle","Turtle","Tortuga","Schildkröte",1.1,.75],
    ["bee","bee","bee","Bee","Abejita","Bienchen",.6,.8],
    ["unicorn","unicorn","unicorn","Unicorn","Unicornio","Einhorn",1,.85],
    ["hedgehog","hedgehog","hedgehog","Hedgehog","Erizo","Igel",.9,.8]];
  // no longer put in new machines (kept so saved prizes and saved machines still show them)
  const RETIRED=new Set(["ring_gold","ring_blue","ring_green","ring_pink"]);
  // toys of the same shape (only the colour or size differs): a new machine shows each shape once before it repeats one
  const FAM={bigteddy:"teddy",bigcat:"cat",critter:"blob",bigdino:"dino",ringS:"ring"};
  // how cute each one is (0..1): the nicest ones (the picture's best) go to the front of the pile
  const CUTE={bear_big:1,cat_ginger_big:.97,cat_purple_big:.96,bear_brown:.95,panda:.95,cat_orange:.93,dino_big:.92,blob_blue:.92,critter_pink:.92,
    cat_purple:.9,cat_lilac:.9,bear_red:.88,cat_gray:.88,dino_green:.88,bunny:.88,bear_polar:.88,bunny_pink:.87,cat_calico:.86,octopus:.85,
    penguin:.85,frog_head:.82,axolotl:.84,duck:.8,ghost:.8,star:.8,whale:.8,mushroom:.78,fox:.84,bear_blue:.84,cat_black:.8,cat_pink:.84,cat_blue:.85,
    pig:.9,koala:.9,lion:.88,owl:.88,chick:.9,hamster:.9,sheep:.89,elephant:.87,monkey:.87,turtle:.85,bee:.88,unicorn:.9,hedgehog:.88,
    car_blue:.55,car_red:.55,car_green:.5,car_yellow:.5,ring_gold:.45,ring_blue:.42,ring_green:.4,ring_pink:.42,ring_purple:.4,robot:.7};

  const pal=s=>{const o={};for(const t of(BASE+" "+s).split(" ").filter(Boolean)){o[t[0]]=t.slice(1).trim();}if(!o.a)o.a=o.b;if(!o.A)o.A=o.d;return o;};
  const mir=r=>r+[...r].reverse().join("");
  function grow(rows,g,m){if(!g)return rows;const W=rows[0].length,cs=new Set(g.cols||[]);if(m)for(const c of g.cols||[])cs.add(W-1-c);
    const rs=new Set(g.rows||[]),out=[];rows.forEach((r,y)=>{const nr=[...r].map((ch,x)=>cs.has(x)?ch+ch:ch).join("");out.push(nr);if(rs.has(y))out.push(nr);});return out;}
  // template -> full rows (mirrored halves, then the toy's extra pixels, then the size growth)
  function build(name,extra){const t=S[name];if(t.gen){const o={};if(extra&&extra[0]==="@")for(const k of extra.slice(1).split(","))o[k]=1;return t.gen(o);}
    const rows=(t.m?t.r.map(mir):t.r.slice()).map(r=>[...r]);
    if(extra)for(const q of extra.split(";")){const[x,y,c]=q.split(",");if(rows[+y])rows[+y][+x]=c;}
    return grow(rows.map(r=>r.join("")),t.grow,!!t.m);}
  // collision circles from the sprite's filled rows: 1-3 circles following the silhouette
  function partsOf(rows){const H=rows.length,W=rows[0].length,cx=W/2,cy=H/2,band=[[0,.42],[.38,.72],[.68,1]],out=[];
    for(const[a,b]of band){let x0=W,x1=-1,y0=H,y1=-1;for(let y=Math.floor(a*H);y<Math.ceil(b*H);y++)for(let x=0;x<W;x++)if(rows[y][x]!=="."){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
      if(x1<0)continue;out.push({x:(x0+x1+1)/2-cx,y:(y0+y1+1)/2-cy,r:Math.max(2.5,Math.min(x1-x0+1,(y1-y0+1)*1.25)/2)});}
    return out;}
  const L=DEF.map(([id,tpl,pk,en,es,de,mass,grip,extra])=>{
    const R=build(tpl,extra);
    return{id,name:{en,es,de},w:R[0].length,h:R.length,rows:R,pal:pal(P[pk]),parts:partsOf(R),mass,grip,cute:CUTE[id]!=null?CUTE[id]:.75,shape:FAM[tpl]||tpl,retired:RETIRED.has(id)};});

  const hex=h=>[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  const cache={},byId={};for(const t of L)byId[t.id]=t;
  function bake(t){
    const W=t.w,H=t.h,mk=()=>{const c=document.createElement("canvas");c.width=W;c.height=H;return c;};
    const n=mk(),hc=mk(),a=n.getContext("2d").createImageData(W,H),b=hc.getContext("2d").createImageData(W,H);
    const filled=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&t.rows[y][x]!==".";
    const solid=(x,y)=>filled(x,y)&&t.rows[y][x]!=="o";
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const ch=t.rows[y][x];if(ch===".")continue;let c=hex(t.pal[ch]||"ff00ff");const p=(y*W+x)*4;
      if("oewnk".indexOf(ch)<0){ // volume: a soft round falloff to the lower right, and a cool rim light on the inner right/bottom edge
        const nx=(x+.5-W/2)/(W/2),ny=(y+.5-H/2)/(H/2),f=Math.max(0,nx*.45+ny*.75);c=c.map(v=>v*(1-.16*f*f));
        if(solid(x,y)&&(!solid(x+1,y)||!solid(x,y+1))&&nx+ny>.2)c=c.map((v,i)=>v+([226,236,255][i]-v)*.28);}
      a.data[p]=c[0];a.data[p+1]=c[1];a.data[p+2]=c[2];a.data[p+3]=255;
      // highlight: a little lighter + warm glowing rim (the toy under the claw)
      const rim=!filled(x-1,y)||!filled(x+1,y)||!filled(x,y-1)||!filled(x,y+1);
      const l=rim?[255,240,140]:c.map(v=>v+(255-v)*.28);b.data[p]=l[0];b.data[p+1]=l[1];b.data[p+2]=l[2];b.data[p+3]=255;}
    n.getContext("2d").putImageData(a,0,0);hc.getContext("2d").putImageData(b,0,0);
    return cache[t.id]={n,h:hc,W,H,sh:[]};}
  // darker copies for back rows (shade 0..1, 4 steps)
  function shaded(s,q){if(s.sh[q])return s.sh[q];const c=document.createElement("canvas");c.width=s.W;c.height=s.H;const x=c.getContext("2d");
    x.drawImage(s.n,0,0);x.globalCompositeOperation="source-atop";x.fillStyle="rgba(14,10,40,"+(q*.15)+")";x.fillRect(0,0,s.W,s.H);return s.sh[q]=c;}
  const get=id=>cache[id]||bake(byId[id]);
  // turned toys: RotSprite-style, so outlines stay whole (a plain canvas rotate of tiny pixel art drops and doubles
  // pixels). Scale2x three times (8x, keeps diagonals smooth), rotate there, take the centre sample of each pixel.
  const STEPS=32,DEAD=.13;   // 32 angles per turn (cached lazily); nearly upright toys are drawn upright
  // edges are decided on the palette letters (K), the shaded colours (C) just follow
  function up2(K,C,W,H){const k=new Uint8Array(W*H*4),o=new Uint32Array(W*H*4),W2=W*2,at=(x,y)=>x<0||y<0||x>=W||y>=H?-1:y*W+x,kk=i=>i<0?0:K[i];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const e=y*W+x,b=at(x,y-1),d=at(x-1,y),f=at(x+1,y),h=at(x,y+1),B=kk(b),D=kk(d),F=kk(f),Hh=kk(h);let s0=e,s1=e,s2=e,s3=e;
      if(B!==Hh&&D!==F){if(D===B)s0=d;if(B===F)s1=f;if(D===Hh)s2=d;if(Hh===F)s3=f;}
      const i=2*y*W2+2*x,put=(j,s)=>{k[j]=s<0?0:K[s];o[j]=s<0?0:C[s];};put(i,s0);put(i+1,s1);put(i+W2,s2);put(i+W2+1,s3);}return[k,o];}
  function turned(c,t,k){const r=c._r||(c._r=[]);if(r[k])return r[k];const W=t.w,H=t.h;
    if(!c._u){let C=new Uint32Array(c.getContext("2d").getImageData(0,0,W,H).data.buffer),K=new Uint8Array(W*H),w=W,h=H;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){const ch=t.rows[y][x];K[y*W+x]=ch==="."?0:ch.charCodeAt(0);}
      for(let i=0;i<3;i++){[K,C]=up2(K,C,w,h);w*=2;h*=2;}c._u=C;}
    const U=c._u,W8=W*8,th=k/STEPS*Math.PI*2,co=Math.cos(th),si=Math.sin(th),ow=Math.ceil(Math.abs(W*co)+Math.abs(H*si))+2,oh=Math.ceil(Math.abs(W*si)+Math.abs(H*co))+2;
    const o=document.createElement("canvas");o.width=ow;o.height=oh;const id=o.getContext("2d").createImageData(ow,oh),O=new Uint32Array(id.data.buffer);
    const cx=W>>1,cy=H>>1,dx0=ow>>1,dy0=oh>>1;
    for(let j=0;j<oh;j++)for(let i=0;i<ow;i++){const dx=i+.5-dx0,dy=j+.5-dy0,sx=dx*co+dy*si+cx,sy=-dx*si+dy*co+cy;
      if(sx<0||sy<0||sx>=W||sy>=H)continue;O[j*ow+i]=U[((sy*8)|0)*W8+((sx*8)|0)];}
    o.getContext("2d").putImageData(id,0,0);return r[k]={c:o,x:dx0,y:dy0};}
  return{
    list:L.map(t=>({id:t.id,name:t.name,w:t.w,h:t.h,parts:t.parts,mass:t.mass,grip:t.grip,cute:t.cute,shape:t.shape,retired:t.retired})),
    draw(ctx,id,x,y,angle,opts={}){const s=get(id),q=Math.round(Math.max(0,Math.min(1,opts.shade||0))*4),c=opts.highlight?s.h:q?shaded(s,q):s.n;ctx.save();ctx.imageSmoothingEnabled=false;
      if(opts.alpha!=null)ctx.globalAlpha*=opts.alpha;ctx.translate(Math.round(x),Math.round(y));
      let k=0;if(angle&&Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))>DEAD)k=((Math.round(angle/(Math.PI*2)*STEPS)%STEPS)+STEPS)%STEPS;
      if(k){const r=turned(c,byId[id],k);ctx.drawImage(r.c,-r.x,-r.y);}else ctx.drawImage(c,-(s.W>>1),-(s.H>>1));ctx.restore();},
    big(id,scale){const s=get(id),c=document.createElement("canvas");c.width=s.W*scale;c.height=s.H*scale;const x=c.getContext("2d");x.imageSmoothingEnabled=false;x.drawImage(s.n,0,0,c.width,c.height);return c;},
    _rows:id=>byId[id].rows};
})();
