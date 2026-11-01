#!/usr/bin/env node
// Echoloc: automated tests. Drives the real docs/echoloc/index.html in headless Chrome (WebGL: the GPU on macOS,
// a virtual X display via xvfb-run on Linux when it is installed).
//
//   node tests/echoloc/run.mjs            run everything
//   node tests/echoloc/run.mjs perf       run only tests whose name contains "perf"
//
// Needs: node >= 22 (built-in WebSocket), Chrome/Chromium (or CHROME=/path/to/chrome). Exit code 0 = all passed.
import {spawn,execSync} from 'node:child_process';
import {findChrome} from '../lib/cdp.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const PAGE='file://'+path.resolve(HERE,'..','..','docs','echoloc','index.html');
const FILTER=process.argv[2]||'';
const PORT=9400+Math.floor(Math.random()*400);
const CHROME=findChrome();
const XVFB=process.platform==='linux'&&(()=>{ try{ execSync('command -v xvfb-run',{stdio:'ignore'}); return true; }catch{ return false; } })();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SHOTS=path.resolve(HERE,'..','..','scratch','screenshots','echoloc'); fs.mkdirSync(SHOTS,{recursive:true});
const shot=async name=>{ const r=await send('Page.captureScreenshot',{format:'png'}); if(r.result?.data) fs.writeFileSync(path.join(SHOTS,name+'.png'),Buffer.from(r.result.data,'base64')); };

// ---------------- tiny CDP client ----------------
const prof=fs.mkdtempSync(path.join(os.tmpdir(),'echo-test-'));
const args=['--no-sandbox','--headless=new','--enable-gpu','--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',`--remote-debugging-port=${PORT}`,'--window-size=1280,720',`--user-data-dir=${prof}`,'--mute-audio','about:blank'];
const chrome=XVFB?spawn('xvfb-run',['-a',CHROME,...args],{stdio:'ignore',detached:true}):spawn(CHROME,args,{stdio:'ignore',detached:true});
const cleanup=()=>{ try{ process.kill(-chrome.pid); }catch{} try{ fs.rmSync(prof,{recursive:true,force:true}); }catch{} };
process.on('exit',cleanup);
let tabs; for(let i=0;i<60&&!tabs;i++){ try{ tabs=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); }catch{ await sleep(250); } }
if(!tabs){ console.error('could not start chrome'); process.exit(2); }
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const pageErrors=[];
ws.onmessage=e=>{ const m=JSON.parse(e.data);
  if(m.id&&pend[m.id]){ pend[m.id](m); delete pend[m.id]; }
  else if(m.method==='Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text); };
const send=(method,params={})=>new Promise(r=>{ const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i,method,params})); });
async function ev(expr){ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error('page: '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));
  return r.result?.result?.value; }
const click=async(x,y)=>{ await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1}); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1}); };
const key=async(code,keyv,text,down=true)=>send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:keyv,text:down?text:undefined,windowsVirtualKeyCode:keyv.length===1?keyv.toUpperCase().charCodeAt(0):code==='Space'?32:16});
const touch=(type,pts)=>send('Input.dispatchTouchEvent',{type,touchPoints:pts});
async function load(mobile=false){
  await send('Runtime.enable'); await send('Page.enable');
  if(mobile){ await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true}); await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); }
  else { await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled',{enabled:false}); }
  await send('Page.navigate',{url:PAGE}); await sleep(1500);
}
// start a game and keep it running even though headless Chrome drops pointer lock
async function startGame(){ await click(640,360); await sleep(400); await ev('(paused=false, document.getElementById("overlay").style.display="none", started)'); }

// ---------------- test runner ----------------
const tests=[]; const T=(name,fn)=>tests.push({name,fn});
const assert=(c,msg)=>{ if(!c) throw new Error(msg); };

// =========================================================== tests
T('boot: page loads, WebGL works, game starts, no errors', async()=>{
  await load(); await shot('desktop_start'); await startGame();
  const r=await ev('({gl:!!gl, started, err:gl.getError(), lvl:!!BX, monsters:monsters.length})');
  assert(r.gl&&r.started&&r.lvl,'game did not start '+JSON.stringify(r)); assert(r.err===0,'GL error '+r.err);
  assert(pageErrors.length===0,'page errors: '+pageErrors.join(' | '));
});

T('start: no auto echo, PRESS SPACE shown, hidden after first echo', async()=>{
  await sleep(1200);
  const a=await ev('[lastEcho, getComputedStyle(document.getElementById("prompt")).display]');
  assert(a[0]===-9,'an echo fired on its own'); assert(a[1]!=='none','prompt not visible at start');
  await key('Space',' ',' '); await key('Space',' ',' ',false); await sleep(100);
  const b=await ev('[lastEcho>0, getComputedStyle(document.getElementById("prompt")).display]');
  assert(b[0],'space did not echo'); assert(b[1]==='none','prompt still visible after echo');
});

T('levelgen: invariants hold over 12 random levels', async()=>{
  const r=await ev(`(()=>{ const bad=[]; const stats=[];
    for(let k=0;k<12;k++){ newGame();
      const st=startCell, dS=bfs(st,walk); let reach=0,wc=0; for(let i=0;i<W*H;i++){ if(walk[i]){ wc++; if(dS[i]>=0) reach++; } }
      if(reach!==wc) bad.push(k+': not all walkable cells connected');
      if(rooms[0].w*rooms[0].h!==Math.max(...rooms.map(r=>r.w*r.h))) bad.push(k+': start room not the biggest');
      const nm=Math.min(...monsters.map(m=>Math.hypot(m.x-player.x,m.z-player.z))); if(nm<25) bad.push(k+': monster '+nm.toFixed(1)+'m from start');
      if(monsters.length<1||monsters.length>6) bad.push(k+': monster count '+monsters.length);
      if(exitDist[st]<0) bad.push(k+': exit unreachable');
      for(let z=1;z<H-1;z++) for(let x=1;x<W-1;x++){ const i=idx(x,z); if(cellType[i]!==T_COR) continue;
        if((cellType[i-1]===T_WALL&&cellType[i+1]===T_WALL)||(cellType[i-W]===T_WALL&&cellType[i+W]===T_WALL)){ bad.push(k+': 1-wide corridor at '+x+','+z); break; } }
      for(const s of signs){ const i=idx(Math.floor(s.x),Math.floor(s.z)); if(!(cellType[i]===T_ROOM||mainCor[i])) bad.push(k+': sign off the main route'); }
      const rv=rooms.filter(r=>r.mat===1).length, cp=rooms.filter(r=>r.mat===2).length; if(rv!==2||cp<1||cp>3) bad.push(k+': materials rv='+rv+' cp='+cp);
      let locks=0; for(let b=0;b<BX.length/7;b++) if(BX[b*7+6]===K_LOCK) locks++; if(locks<8) bad.push(k+': locked door missing');
      if(!(exitCell.some(v=>v))) bad.push(k+': no exit passage');
      stats.push(rooms.length);
    } return {bad:bad.slice(0,8), rooms:stats}; })()`);
  assert(r.bad.length===0, r.bad.join('; '));
});

T('raycast: every hit lands on a real surface (5000 random rays)', async()=>{
  const r=await ev(`(()=>{ let bad=0, n=0, ex='';
    const solidAt=(x,y,z)=>{ if(y<=0) return true; const cx=Math.floor(x),cz=Math.floor(z); if(cx<0||cz<0||cx>=W||cz>=H) return true; const i=cz*W+cx;
      if(cellType[i]===T_WALL||y>=ceilH[i]) return true;
      for(let k=cbS[i];k<cbS[i+1];k++){ const o=cbI[k]*7; if(x>=BX[o]&&x<=BX[o+3]&&y>=BX[o+1]&&y<=BX[o+4]&&z>=BX[o+2]&&z<=BX[o+5]) return true; } return false; };
    for(let k=0;k<5000;k++){ let c; do{ c=(Math.random()*W*H)|0; }while(!walk[c]);
      const ox=c%W+0.2+Math.random()*0.6, oz=((c/W)|0)+0.2+Math.random()*0.6, oy=0.3+Math.random()*1.6;
      const u=Math.random()*2-1, ph=Math.random()*6.283, s=Math.sqrt(1-u*u), dx=s*Math.cos(ph), dy=u, dz=s*Math.sin(ph);
      if(solidAt(ox,oy,oz)) continue; n++;
      const t=cast(ox,oy,oz,dx,dy,dz,60); if(hitKind===0) continue;
      const before=solidAt(ox+dx*(t-0.005),oy+dy*(t-0.005),oz+dz*(t-0.005)), after=solidAt(ox+dx*(t+0.005),oy+dy*(t+0.005),oz+dz*(t+0.005));
      if(before||!after){ bad++; if(!ex) ex=JSON.stringify({ox,oy,oz,dx,dy,dz,t,hitKind,before,after}); } }
    return {n,bad,ex}; })()`);
  assert(r.n>3000,'too few rays tested'); assert(r.bad/r.n<0.003, `${r.bad}/${r.n} rays hit nothing real, e.g. ${r.ex}`);
});

T('detection: echo power / monster echolocation rules', async()=>{
  const setup=(d)=>`(()=>{ monsters.forEach(o=>{o.x=-50;o.z=-50;}); const m=monsters[0]; let ok=false;
     for(let a=0;a<64&&!ok;a++){ const y=a/64*6.283, x=player.x+Math.sin(y)*${d}, z=player.z+Math.cos(y)*${d}; if(walkAt(x,z)&&matAt(x,z)===0&&matAt(player.x,player.z)===0&&(${d}>20||los(player.x,1.6,player.z,x,1.4,z))){ m.x=x;m.z=z;ok=true;} }
     m.state='idle'; m.susp=0; m.spotN=0; m.target=null; m.freezeT=99; player.spd=0; return ok; })()`;
  await ev('(()=>{ for(let k=0;k<20;k++){ newGame(); if(matAt(player.x,player.z)===0) break; } paused=false; return 1; })()');
  const exp=[[5,'hunt'],[14,'alert'],[30,'idle']];
  for(const [d,want] of exp){ assert(await ev(setup(d)),'no spot at '+d+'m'); const got=await ev('(lastEcho=-9, playerEcho(false), monsters[0].state)'); assert(got===want,`echo at ${d}m -> ${got}, expected ${want}`); }
  const pulses=sp=>`(()=>{const m=monsters[0]; const r=[]; for(let k=0;k<2;k++){ m.echoT=0; player.spd=${sp}; updateMonster(m,0.001); r.push(m.state);} return r.join(); })()`;
  await ev(setup(8)); assert(await ev(pulses(0))==='idle,idle','still player was noticed');
  await ev(setup(8)); assert(await ev(pulses(2.4))==='alert,hunt','walking player not caught by 2 pulses');
  await ev(setup(20)); assert(await ev(pulses(2.4))==='idle,idle','walking player noticed from 20m');
});

T('monsters: 1s standing shriek before charging, then slower than player sprint', async()=>{
  const r=await ev(`(()=>{ newGame(); const m=monsters[0]; monsters.length=1;
    let sx=-1,sz=-1; for(let z=2;z<H-2&&sx<0;z++) for(let x=2;x<W-14&&sx<0;x++){ let ok=true; for(let k=0;k<12;k++) for(let w=-1;w<=1;w++) if(!walk[idx(x+k,z+w)]||mat[idx(x+k,z+w)]===1) ok=false; if(ok){sx=x;sz=z;} }
    player.x=sx+0.5; player.z=sz+0.5; player.vx=player.vz=0; m.x=sx+10.5; m.z=sz+0.5;
    enterHunt(m); const sp=[]; for(let i=0;i<150;i++){ now+=1/60; updateMonster(m,1/60); if(dead) break; if(i===30||i===55||i===140) sp.push(Math.hypot(m.vx,m.vz)); }
    return {sp, windupWas:true}; })()`);
  assert(r.sp[0]<0.05,'monster moved during its shriek windup: '+r.sp[0]); assert(r.sp[2]>1.5,'monster never charged: '+r.sp[2]);
  assert(r.sp[2]<5.9*0.7,'monster as fast as player sprint');
});

T('monsters: inertia — slide wide on reversal, lose speed on wall impact', async()=>{
  const r=await ev(`(()=>{ newGame(); const m=monsters[0]; monsters.length=1;
    // find a long straight east-west run of open floor
    let sx=-1,sz=-1; for(let z=2;z<H-2&&sx<0;z++) for(let x=2;x<W-14&&sx<0;x++){ let ok=true; for(let k=0;k<12;k++) for(let w=-1;w<=1;w++) if(!walk[idx(x+k,z+w)]||mat[idx(x+k,z+w)]===1) ok=false; if(ok){sx=x;sz=z;} }
    m.x=sx+6.5; m.z=sz+0.5; m.state='hunt'; m.windup=0; m.heardT=now+99; m.vx=2.8; m.vz=0;
    player.x=sx+0.5; player.z=sz+0.5; m.lastKnown={x:player.x,z:player.z}; const xs=[];
    for(let i=0;i<40;i++){ now+=1/60; updateMonster(m,1/60); xs.push(m.vx); }
    const stillSliding=xs[5]>0.5, reversed=xs[39]<-1;
    // wall slam: run straight at a wall
    let wx=-1,wz=-1; for(let z=2;z<H-2&&wx<0;z++) for(let x=2;x<W-8&&wx<0;x++){ if(walk[idx(x,z)]&&walk[idx(x+1,z)]&&walk[idx(x+2,z)]&&cellType[idx(x+3,z)]===T_WALL&&walk[idx(x,z-1)]&&walk[idx(x,z+1)]){wx=x;wz=z;} }
    m.x=wx+0.5; m.z=wz+0.5; m.vx=2.9; m.vz=0; m.lastKnown={x:wx+10,z:wz+0.5}; m.heardT=-99; m.overshot=true;
    const nd=window.navDir; window.navDir=()=>[1,0]; let peak=0;
    for(let i=0;i<60;i++){ now+=1/60; updateMonster(m,1/60); } const minAfter=Math.hypot(m.vx,m.vz); window.navDir=nd;
    return {stillSliding, reversed, v5:xs[5], v39:xs[39], afterWall:minAfter}; })()`);
  assert(r.stillSliding,'no momentum on reversal (vx after 5 frames '+r.v5+')'); assert(r.reversed,'never turned around ('+r.v39+')');
  assert(r.afterWall<1.5,'kept full speed through a wall: '+r.afterWall);
});

T('monsters: lose you when you outrun them — go to last heard spot, overshoot along your heading, then search', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=1; const m=monsters[0];
    // a long straight run of floor: monster at one end, player heard running east from the middle
    let sx=-1,sz=-1; for(let z=2;z<H-2&&sx<0;z++) for(let x=2;x<W-16&&sx<0;x++){ let ok=true; for(let k=0;k<14;k++) for(let w=-1;w<=1;w++) if(!walk[idx(x+k,z+w)]||mat[idx(x+k,z+w)]===1) ok=false; if(ok){sx=x;sz=z;} }
    m.x=sx+0.5; m.z=sz+0.5; m.state='idle';
    player.x=sx+5.5; player.z=sz+0.5; player.vx=5.9; player.vz=0;
    enterHunt(m); m.windup=0;
    // then the player is gone (far away, standing still -> silent)
    player.x=-500; player.z=-500; player.vx=0; player.vz=0; player.spd=0;
    let maxX=m.x, st=[]; for(let i=0;i<60*14;i++){ now+=1/60; updateMonster(m,1/60); if(m.state==='hunt') maxX=Math.max(maxX,m.x); st.push(m.state); }
    return {heardAt:sx+5.5, maxX, final:m.state, everAlert:st.includes('alert')}; })()`);
  assert(r.maxX>r.heardAt+2,'did not follow past the last heard spot along the heading (max x '+r.maxX.toFixed(1)+' vs '+r.heardAt+')');
  assert(r.maxX<r.heardAt+6.5,'kept chasing far beyond the last clue ('+r.maxX.toFixed(1)+')');
  assert(r.everAlert&&r.final!=='hunt','never gave up the chase: '+r.final);
});

T('monsters: calm ones avoid reverb rooms, hunters follow you in', async()=>{
  const r=await ev(`(()=>{ newGame(); const rr=rooms.find(o=>o.mat===1); const m=monsters[0]; monsters.length=1;
    let sx=null; for(let t=0;t<800&&!sx;t++){ const x=RI(1,W-2),z=RI(1,H-2), i=idx(x,z); if(walk[i]&&mat[i]!==1){ const d=Math.hypot(x-rr.cx,z-rr.cz); if(d>Math.max(rr.w,rr.h)/2+2&&d<Math.max(rr.w,rr.h)/2+8) sx=[x,z]; } }
    m.x=sx[0]+.5; m.z=sx[1]+.5; m.state='alert'; m.target={x:rr.cx,z:rr.cz}; m.lingerT=0; m.freezeT=0;
    player.x=-90; player.z=-90; let entered=false;
    for(let i=0;i<60*12;i++){ now+=1/60; updateMonster(m,1/60); m.freezeT=0; if(matAt(m.x,m.z)===1) entered=true; if(m.state==='idle') break; }
    let c=idx(Math.floor(rr.cx),Math.floor(rr.cz)); for(let t=0;t<50&&!walk[c];t++) c=idx(RI(rr.x+1,rr.x+rr.w-2),RI(rr.z+1,rr.z+rr.h-2));
    player.x=c%W+.5; player.z=((c/W)|0)+.5; player.vx=player.vz=0; enterHunt(m); m.windup=0;
    let huntIn=false; for(let i=0;i<60*20&&!dead;i++){ now+=1/60; if(i%30===0) enterHunt(m); updateMonster(m,1/60); if(matAt(m.x,m.z)===1) huntIn=true; }
    return {entered, huntIn}; })()`);
  assert(!r.entered,'calm monster walked into the reverb room'); assert(r.huntIn,'hunting monster refused to enter');
});

T('restart: dying then restarting fully resets state', async()=>{
  const r=await ev(`(async()=>{ newGame(); paused=false; die(monsters[0]); for(let i=0;i<200;i++){ now+=1/60; update(1/60); }
    const during={dead, shake:+shake.toFixed(3)}; newGame();
    return {during, after:{dead, shake, deathT, killer, staticBoost, keys:Object.values(keys).some(v=>v), flash:document.getElementById('flash').style.opacity}}; })()`);
  assert(r.during.dead&&r.during.shake>0,'death sequence did not run');
  const a=r.after; assert(!a.dead&&a.shake===0&&a.deathT===0&&a.killer===null&&a.staticBoost===0&&!a.keys&&(a.flash==='0'||a.flash===''),'not reset: '+JSON.stringify(a));
});

T('signs: fixed 3D arrows (same world direction from both sides)', async()=>{
  const r=await ev(`(()=>{ newGame(); const s=signs[0]; const nx=-s.dz,nz=s.dx; const res=[];
    for(const k of [1,-1]){ player.x=s.x+nx*2.5*k; player.z=s.z+nz*2.5*k; const before=phead; revealSign(s,now);
      // arrow tip = the bright points farthest along the exit direction, on this face
      let best=-9; for(let i=before;i<phead;i++){ const o=i*9; if(pdata[o+4]<1.3) continue; const along=(pdata[o]-s.x)*s.dx+(pdata[o+2]-s.z)*s.dz; if(along>best) best=along; }
      res.push(best); }
    return res; })()`);
  assert(r[0]>0.35&&r[1]>0.35,'arrow does not point along the exit direction on both faces: '+r);
});

T('materials: reverb bounces many times, carpet absorbs, plain reflects a little', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=0; const out={};
    for(const [m,name] of [[1,'reverb'],[2,'carpet'],[0,'plain']]){ const rr=rooms.filter(o=>(o.mat||0)===m&&o.id!==0)[0]; let c=idx(Math.floor(rr.cx),Math.floor(rr.cz));
      for(let t=0;t<60&&!walk[c];t++) c=idx(RI(rr.x+1,rr.x+rr.w-2),RI(rr.z+1,rr.z+rr.h-2));
      const before=totalW; const o={x:c%W+.5,y:1.6,z:((c/W)|0)+.5,n:4000,maxD:36,speed:24,life:1.5,flags:0,I:1}; o.t0=now; o.left=o.n; emitChunk(o,o.n);
      out[name]=(totalW-before)/4000; }
    return out; })()`);
  assert(r.reverb>3,'reverb room does not reverberate: '+r.reverb.toFixed(2)+' dots/ray');
  assert(r.plain>1.05&&r.plain<1.6,'plain rooms reflect wrong amount: '+r.plain.toFixed(2));
  assert(r.carpet<r.plain,'carpet does not absorb more than plain: '+JSON.stringify(r));
});

T('perf: raycast throughput', async()=>{
  const r=await ev(`(()=>{ newGame(); const N=150000, sp=[]; for(let i=0;i<W*H&&sp.length<40;i+=97) if(walk[i]) sp.push(i);
    let t=performance.now(); for(let i=0;i<N;i++){ const c=sp[i%sp.length], d=((i*2654435761)>>>0)%DIRN*3; cast(c%W+.5,1.6,((c/W)|0)+.5,DIRS[d],DIRS[d+1],DIRS[d+2],36); }
    const casts=N/(performance.now()-t);
    t=performance.now(); let rays=0; for(const c of sp){ const o={x:c%W+.5,y:1.6,z:((c/W)|0)+.5,n:4000,maxD:36,speed:24,life:1.5,flags:0,I:1}; o.t0=now; o.left=o.n; emitChunk(o,o.n); rays+=4000; }
    return {casts:Math.round(casts), emit:Math.round(rays/(performance.now()-t))}; })()`);
  console.log('      casts/ms', r.casts, ' echo rays/ms (incl. bounces+dots)', r.emit);
  assert(r.casts>3000,'raycast too slow: '+r.casts+'/ms'); assert(r.emit>1300,'echo emit too slow: '+r.emit+'/ms');
});

T('perf: echo work is time-sliced within the frame budget', async()=>{
  const r=await ev(`(()=>{ newGame(); echoJobs.length=0; emitEcho({x:player.x,y:1.6,z:player.z,n:60000,maxD:36,speed:24,life:1.5,flags:0,I:1});
    echoBudget=4; let worst=0, frames=0; while(echoJobs.length&&frames<400){ const t=performance.now(); processEchoJobs(); worst=Math.max(worst,performance.now()-t); frames++; }
    return {worst, frames, left:echoJobs.length}; })()`);
  assert(r.left===0,'echo never finished'); assert(r.frames>2,'echo was not spread over frames');
  assert(r.worst<4+3,'a slice blew the budget: '+r.worst.toFixed(2)+'ms');
});

T('perf: worst frame under stress (all monsters hunting + shrieking, sprinting, echo spam)', async()=>{
  await ev(`(()=>{ newGame(); paused=false; window.__FT=[]; const orig=window.__origUpdate||update; window.__origUpdate=orig;
     window.update=function(dt){ const t=performance.now(); orig(dt); __FT.push(performance.now()-t); };
     monsters.forEach(m=>{ m.state='hunt'; m.heardT=now+99; m.lastKnown={x:player.x,z:player.z}; m.windup=0; m.x=player.x+(Math.random()-.5)*20; m.z=player.z+(Math.random()-.5)*20; if(!walkAt(m.x,m.z)){m.x=player.x+6;m.z=player.z;} });
     window.__PF={}; window.__wrapped=window.__wrapped||{};
     for(const nm of ['shriek','sfxShriek','runStepEcho','monsterStep','hearPlayer','sampleMonster','updateMonster','updateDeath','updatePressure','spawnHidden','enterHunt','getNav','emitEcho','die']){
       const f=__wrapped[nm]||window[nm]; __wrapped[nm]=f; window[nm]=function(...a){ const t=performance.now(); const r=f.apply(this,a); const d=performance.now()-t; const e=__PF[nm]||(__PF[nm]={n:0,max:0}); e.n++; if(d>e.max) e.max=d; return r; }; }
     return 1; })()`);
  await key('ShiftLeft','Shift'); await key('KeyW','w','w');
  for(let k=0;k<6;k++){ await key('Space',' ',' '); await key('Space',' ',' ',false); await ev('(dead=false, paused=false, 1)'); await sleep(350); }
  await key('KeyW','w','w',false); await key('ShiftLeft','Shift',undefined,false);
  const r=await ev(`(()=>{ const f=__FT.slice().sort((a,b)=>a-b); window.update=__origUpdate; for(const nm in __wrapped) window[nm]=__wrapped[nm];
    const top=Object.entries(__PF).sort((a,b)=>b[1].max-a[1].max).slice(0,4).map(([k,v])=>k+' '+v.max.toFixed(1)+'ms').join(', ');
    return {n:f.length, med:f[f.length>>1], p95:f[Math.floor(f.length*.95)], max:f[f.length-1], budget:echoBudget, top}; })()`);
  console.log('      slowest single calls:', r.top);
  console.log('      update() ms  median',r.med.toFixed(2),' p95',r.p95.toFixed(2),' max',r.max.toFixed(2),' frames',r.n);
  assert(r.n>20,'too few frames ran'); assert(r.max<12,'worst update frame '+r.max.toFixed(1)+'ms');
});

T('perf: draw window shrinks to zero once all dots have expired', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=0; lastEcho=-9; playerEcho(true); while(echoJobs.length) processEchoJobs(); render();
    const liveNow=liveHist.length?totalW-liveHist[1]:0; const saved=now; now+=30; exitPulseT=99; render(); const liveLater=liveHist.length?totalW-liveHist[1]:0; now=saved; return {liveNow, liveLater}; })()`);
  assert(r.liveNow>5000,'fresh echo not drawn: '+r.liveNow); assert(r.liveLater===0,'expired dots still drawn: '+r.liveLater);
});

T('debug: typing "letmesee" toggles lit view, renders without GL errors', async()=>{
  for(const ch of 'letmesee') await key('Key'+ch.toUpperCase(),ch,ch);
  await sleep(200);
  const a=await ev('(render(), {on:debugView, lit:litCount, err:gl.getError(), mon:buildMonsterMesh()})');
  assert(a.on&&a.lit>10000,'lit view did not turn on '+JSON.stringify(a)); assert(a.err===0,'GL error '+a.err);
  for(const ch of 'letmesee') await key('Key'+ch.toUpperCase(),ch,ch);
  assert(await ev('debugView')===false,'second "letmesee" did not turn it off');
});

T('input: F toggles fullscreen', async()=>{
  await ev('(window.__fs=0, window.goFS=()=>{__fs++;}, 1)');
  await key('KeyF','f','f'); await key('KeyF','f','f',false);
  assert(await ev('__fs')===1,'F did not request fullscreen');
});

T('level102 top bar: shown on top, the start screen sits below it, help text in every language', async()=>{
  const r=await ev(`(()=>{ const b=document.getElementById('l102bar').getBoundingClientRect(), o=document.getElementById('overlay').getBoundingClientRect(), tp=document.getElementById('l102help-text');
    return {bar:b.height>20&&b.top===0, below:o.top>=b.bottom-1, help:!!document.getElementById('l102help'),
      langs:['en','es','de'].every(l=>tp&&tp.content.querySelector('[data-lang="'+l+'"]')&&tp.content.querySelector('[data-lang="'+l+'"]').textContent.length>200)}; })()`);
  assert(r.bar&&r.below&&r.help&&r.langs,JSON.stringify(r));
});

T('help (?) pauses the game, shows how to play + about, Esc closes it; keys do not reach the game meanwhile', async()=>{
  await ev('(paused=false, document.getElementById("overlay").style.display="none", monsters.length=0, 1)');
  await ev('document.getElementById("l102help").click(), 1'); await sleep(100); await shot('desktop_help');
  const r=await ev(`({open:!document.getElementById('l102dlg').hidden, paused, ov:document.getElementById('overlay').style.display, h1:document.querySelector('#overlay h1').textContent,
    how:document.getElementById('l102how').textContent, about:document.getElementById('l102about').innerHTML})`);
  assert(r.open&&r.paused&&r.ov==='flex'&&r.h1==='PAUSED','help did not pause '+JSON.stringify(r).slice(0,300));
  assert(/Space/.test(r.how)&&/every touch on the right side echolocates/.test(r.how),'how-to-play text missing');
  assert(/Luis Quesada/.test(r.about)&&/github\.com\/lquesada\/level102/.test(r.about)&&/GPL/.test(r.about),'about text missing');
  const e0=await ev('lastEcho'); await key('Space',' ',' '); await key('Space',' ',' ',false); await sleep(50);
  assert(await ev('lastEcho')===e0,'Space reached the game while help was open');
  await key('Escape','Escape'); await key('Escape','Escape',undefined,false); await sleep(50);
  assert(await ev('document.getElementById("l102dlg").hidden'),'Esc did not close the help');
});

T('languages: start/pause screens, prompt and help switch EN/ES/DE in place', async()=>{
  const get=()=>ev(`({h1:document.querySelector('#overlay h1').textContent, go:document.querySelector('#overlay .go').textContent, prompt:document.getElementById('prompt').textContent})`);
  await ev('L102.setLang("de"), 1'); const de=await get();
  await ev('L102.setLang("es"), 1'); const es=await get();
  await ev('L102.help(true), 1'); const how=await ev('document.getElementById("l102how").textContent'); await ev('L102.help(false), 1');
  await ev('L102.setLang("en"), 1'); const en=await get();
  assert(de.h1==='PAUSE'&&/KLICKEN/.test(de.go)&&/LEERTASTE/.test(de.prompt),'de '+JSON.stringify(de));
  assert(es.h1==='PAUSA'&&/HAZ CLIC/.test(es.go)&&/ESPACIO/.test(es.prompt),'es '+JSON.stringify(es));
  assert(/Espacio/.test(how),'help not in Spanish');
  assert(en.h1==='PAUSED'&&/CLICK/.test(en.go),'en '+JSON.stringify(en));
  await ev('(paused=false, document.getElementById("overlay").style.display="none", 1)');
});

T('mobile: start tap goes full screen sideways; stick walks, past the outer ring it runs; look drag turns', async()=>{
  await load(true);
  assert(await ev('isTouch'),'touch not detected'); await shot('phone_start');
  await ev('(window.__fs=0, window.goFS=()=>{__fs++;}, 1)');
  await touch('touchStart',[{x:422,y:200,id:1}]); await touch('touchEnd',[]); await sleep(500);
  assert(await ev('started&&__fs===1'),'start tap did not start the game in full screen');
  await ev('(paused=false, document.getElementById("overlay").style.display="none", monsters.length=0, lastEcho=-9, 1)'); await sleep(200);
  const p0=await ev('[player.x,player.z,player.yaw]');
  // walk: knob inside the inner ring
  await touch('touchStart',[{x:120,y:300,id:2}]); for(let i=1;i<=8;i++){ await touch('touchMove',[{x:120,y:300-i*6,id:2}]); await sleep(30); }
  await sleep(200); const walk=await ev('({sprinting, run:stick.run, ring:document.getElementById("stickBase").classList.contains("run")})');
  const p1=await ev('[player.x,player.z]');
  // run: push past the dashed outer ring
  for(let i=1;i<=6;i++){ await touch('touchMove',[{x:120,y:252-i*8,id:2}]); await sleep(30); }
  await ev('(lastEcho=-9, playerEcho(false), lastEcho=-9, 1)'); await sleep(350); await shot('phone_run');
  await sleep(250); const run=await ev('({sprinting, run:stick.run, ring:document.getElementById("stickBase").classList.contains("run")})');
  // look with the right thumb while running (its touch down echoes too)
  await ev('(lastEcho=-9, 1)');
  await touch('touchStart',[{x:120,y:204,id:2},{x:600,y:150,id:6}]);
  for(let i=1;i<=5;i++){ await touch('touchMove',[{x:120,y:204,id:2},{x:600+i*14,y:150,id:6}]); await sleep(30); }
  await touch('touchEnd',[]); await sleep(100);
  const p2=await ev('[player.x,player.z,player.yaw]');
  assert(!walk.sprinting&&!walk.run&&!walk.ring,'walking stick made you run '+JSON.stringify(walk));
  assert(Math.hypot(p1[0]-p0[0],p1[1]-p0[1])>0.2,'stick did not move the player');
  assert(run.sprinting&&run.run&&run.ring,'stick past the outer ring did not run '+JSON.stringify(run));
  assert(Math.abs(p2[2]-p0[2])>0.05,'look drag did not turn');
  assert(await ev('lastEcho')>0,'touching the right side to look did not echo');
});

T('mobile: every touch on the right side echoes, one echo per touch (holding does not repeat), also while running', async()=>{
  await ev('(lastEcho=-9, fatigue=0, 1)');
  const n0=await ev('(window.__echoN=0, window.__pe=window.__pe||playerEcho, playerEcho=function(s){ __echoN++; return __pe(s); }, 0)');
  await touch('touchStart',[{x:650,y:200,id:7}]); await sleep(60);
  const one=await ev('lastEcho>0');
  await sleep(700); await touch('touchEnd',[]);                        // held for a while: still one echo
  const held=await ev('__echoN');
  await sleep(350); await touch('touchStart',[{x:650,y:200,id:7}]); await sleep(40); await touch('touchEnd',[]); await sleep(50);
  const again=await ev('__echoN');
  // while running with the left thumb
  await touch('touchStart',[{x:120,y:300,id:2}]); for(let i=1;i<=8;i++){ await touch('touchMove',[{x:120,y:300-i*13,id:2}]); await sleep(20); }
  await sleep(350); await touch('touchStart',[{x:120,y:196,id:2},{x:650,y:200,id:8}]); await sleep(60);
  const r=await ev('({n:__echoN, sprinting})');
  await touch('touchEnd',[]); await sleep(100); await ev('(playerEcho=__pe, 1)');
  assert(one,'a single touch did not echo'); assert(held===1,'holding repeated the echo: '+held); assert(again===2,'touching again did not echo again: '+again);
  assert(r.n===3&&r.sprinting,'touch while running did not echo, or stopped the run '+JSON.stringify(r));
});

T('mobile: holding the phone upright pauses and asks to turn it sideways', async()=>{
  await ev('(paused=false, document.getElementById("overlay").style.display="none", 1)');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true}); await sleep(400);
  await shot('phone_portrait');
  const r=await ev(`({paused, rot:getComputedStyle(document.getElementById('rotate')).display, txt:document.getElementById('rotT').textContent})`);
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true}); await sleep(400);
  const r2=await ev(`getComputedStyle(document.getElementById('rotate')).display`);
  assert(r.paused&&r.rot==='flex'&&/SIDEWAYS/.test(r.txt),'portrait '+JSON.stringify(r)); assert(r2==='none','notice stayed in landscape');
  await ev('(paused=false, document.getElementById("overlay").style.display="none", 1)');
});

T('exit: never glows on its own; only frame + text turn green from your echo, nothing on the floor', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=0; signs.length=0; const e=exitInfo;
    player.x=e.px+e.nx*6; player.z=e.pz+e.nz*6; if(!walkAt(player.x,player.z)){ player.x=e.px+e.nx*3; player.z=e.pz+e.nz*3; }
    const isGreen=o=>pdata[o+4]>0.5&&pdata[o+4]>2*pdata[o+3];
    const b0=totalW, p0=phead; for(let i=0;i<180;i++){ now+=1/60; update(1/60); processEchoJobs(); }
    let selfGreen=0; for(let k=0,i=p0;k<totalW-b0;k++,i=(i+1)%MAXP){ if(isGreen(i*9)) selfGreen++; }
    const b1=totalW, p1=phead; revealExit(now); let floor=0, green=0; for(let k=0,i=p1;k<totalW-b1;k++,i=(i+1)%MAXP){ const o=i*9; if(isGreen(o)){ green++; const off=(pdata[o]-e.fx)*e.nx+(pdata[o+2]-e.fz)*e.nz; if(pdata[o+1]<0.1&&off>0.08) floor++; } } // on the floor, away from the wall
    return {selfGreen, green, floor}; })()`);
  assert(r.selfGreen===0,'exit emitted '+r.selfGreen+' green dots by itself'); assert(r.green>200,'echo did not reveal the exit'); assert(r.floor===0,r.floor+' green dots on the floor');
});

T('locked door echoes in the normal echo colour (no amber)', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=0; player.yaw+=Math.PI; const b=totalW, p0=phead;
    const o={x:player.x,y:1.6,z:player.z,n:6000,maxD:36,speed:24,life:1.5,flags:0,I:1}; o.t0=now; o.left=o.n; emitChunk(o,o.n);
    let amber=0; for(let k=0,i=p0;k<totalW-b;k++,i=(i+1)%MAXP){ const q=i*9, r=pdata[q+3],g=pdata[q+4],bl=pdata[q+5]; if(r>0.05&&bl<r*0.4&&g<r*0.75) amber++; } return amber; })()`);
  assert(r===0,r+' amber dots from the locked door');
});

T('monsters: long arms — running past a hunter within ~1.4m gets you caught', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=1; const m=monsters[0];
    let sx=-1,sz=-1; for(let z=3;z<H-3&&sx<0;z++) for(let x=2;x<W-14&&sx<0;x++){ let ok=true; for(let k=0;k<12;k++) for(let w=-2;w<=2;w++) if(!walk[idx(x+k,z+w)]) ok=false; if(ok){sx=x;sz=z;} }
    m.x=sx+6.5; m.z=sz+0.5; enterHunt(m); m.windup=0; m.vx=m.vz=0;
    player.x=sx+0.5; player.z=sz+1.9; dead=false; let caught=false;
    for(let i=0;i<120&&!caught;i++){ now+=1/60; player.x+=5.9/60; player.vx=5.9; m.lastKnown={x:player.x,z:player.z}; updateMonster(m,1/60); caught=dead; }
    const res=caught; dead=false; return res; })()`);
  assert(r,'player slipped past a hunting monster at 1.4m');
});

T('fatigue: running echo is sparse and broken, unusable after a few seconds; resting recovers', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=0; fatigue=0;
    echoJobs.length=0; runStepEcho(); const fresh=echoJobs[echoJobs.length-1];
    sprinting=true; playerMoving=true; for(let i=0;i<60*6;i++) updatePressure(1/60); const tired=fatigue;
    echoJobs.length=0; runStepEcho(); const job=echoJobs[echoJobs.length-1];
    sprinting=false; playerMoving=false; for(let i=0;i<60*8;i++) updatePressure(1/60);
    return {tired, freshRays:fresh.n, freshJit:fresh.jit, rays:job.n, jit:job.jit, noisy:(job.flags&F_NOISY)>0, rested:fatigue, spaceRays:ECHO_RAYS}; })()`);
  assert(r.freshRays<r.spaceRays*0.4,'running echo not sparse: '+r.freshRays+' vs '+r.spaceRays);
  assert(r.freshJit>=0.25,'fresh running echo not jagged at all');
  assert(r.tired>0.95,'not exhausted after 6s: '+r.tired); assert(r.jit>3&&r.noisy,'exhausted running echo still readable: '+JSON.stringify(r));
  assert(r.rested===0,'did not recover by resting: '+r.rested);
});

T('fatigue: running echo never reveals signs or the exit (no green)', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=0; fatigue=0; const e=exitInfo; let green=0;
    const spots=[[player.x,player.z],[e.px+e.nx*4,e.pz+e.nz*4],...signs.slice(0,6).map(s=>[s.x+1,s.z])];
    for(const [x,z] of spots){ if(!walkAt(x,z)) continue; player.x=x; player.z=z; const b=totalW, p0=phead; echoJobs.length=0; runStepEcho(); while(echoJobs.length) processEchoJobs();
      for(let k=0,i=p0;k<totalW-b;k++,i=(i+1)%MAXP){ const o=i*9; if(pdata[o+4]>0.4&&pdata[o+4]>2*pdata[o+3]&&pdata[o+4]>1.5*pdata[o+5]) green++; } }
    return green; })()`);
  assert(r===0,r+' green dots from running echoes');
});

T('fatigue: exhausted player can still outrun a charging monster', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=0; fatigue=1; const x0=player.x,z0=player.z; keys.KeyW=true; keys.ShiftLeft=true;
    for(let i=0;i<30;i++){ now+=1/60; update(1/60); } keys.KeyW=false; keys.ShiftLeft=false; return Math.hypot(player.x-x0,player.z-z0)*2; })()`);
  assert(r>4.3,'exhausted sprint too slow to flee: '+r.toFixed(2)+' m/s');
});

T('shrieks: get longer the longer the chase, and keep lighting the area while screaming', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=1; const m=monsters[0]; m.x=player.x+30; m.z=player.z; enterHunt(m); m.windup=0;
    const pulses=c=>{ m.chaseT=c; m.shriekLeft=0; shriekFrame=-1; frameNo++; let n=0; const real=window.shriekPulse; window.shriekPulse=x=>{ n++; };
      shriek(m); const dur=m.shriekLeft; for(let i=0;i<60*7&&m.shriekLeft>0;i++){ now+=1/60; frameNo++; m.chaseT=c; m.state='hunt'; m.heardT=now; m.shriekT=99; updateMonster(m,1/60); } window.shriekPulse=real; return {dur,n}; };
    return {early:pulses(0), late:pulses(40)}; })()`);
  assert(r.early.dur<2.6&&r.late.dur>5,'shriek length does not grow with the chase: '+JSON.stringify(r));
  assert(r.late.n>r.early.n+4,'long shriek does not keep lighting the area: '+JSON.stringify(r));
});

T('shrieks: a hunting monster never goes quiet, even when it has lost earshot of you', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=1; const m=monsters[0]; m.x=player.x+30; m.z=player.z; enterHunt(m);
    let silent=0, longest=0, run=0, total=0, count=0; const real=window.shriek; window.shriek=x=>{ const v=real(x); if(v!==false) count++; return v; };
    for(let i=0;i<60*40;i++){ now+=1/60; frameNo++; m.heardT=-100; m.state='hunt'; m.lastKnown={x:player.x,z:player.z}; m.overshot=false;
      if(Math.hypot(player.x-m.x,player.z-m.z)<8){ m.x=player.x+30; m.z=player.z; }
      updateMonster(m,1/60); if(i>90){ total++; if(!(m.shriekLeft>0)){ silent++; run++; longest=Math.max(longest,run); } else run=0; } }
    window.shriek=real; return {silentFrac:silent/total, longestGap:longest/60, count}; })()`);
  assert(r.count>=6,'monster stopped shrieking during a long chase: '+JSON.stringify(r));
  assert(r.silentFrac<0.03&&r.longestGap<0.3,'gaps in the chase shrieking: '+JSON.stringify(r));
});

T('green fades faster: sign and exit dots are short-lived', async()=>{
  const r=await ev(`(()=>{ newGame(); const p0=phead; revealSign(signs[0],now); revealExit(now); let mx=0; for(let i=p0;i!==phead;i=(i+1)%MAXP) mx=Math.max(mx,pdata[i*9+7]); return mx; })()`);
  assert(r<=1.85,'green dots live too long: '+r);
});

T('debug: signs are readable in letmesee mode (glowing EXIT + arrow geometry on both faces)', async()=>{
  const r=await ev(`(()=>{ debugView=true; buildLitMesh(); const before=litCount; const keep=signs.slice(); signs.length=0; buildLitMesh(); const without=litCount; signs.push(...keep); buildLitMesh(); debugView=false;
    return {perSign:(before-without)/keep.length}; })()`);
  // plate (36 verts) + 2 faces x (EXIT pixels + 3 arrow strokes) x 6 verts
  assert(r.perSign>36+2*(30+3)*6-1,'sign text/arrow geometry missing: '+r.perSign+' verts per sign');
});

T('heat: long chases pull in monsters from across the level', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; heat=0; const hunter=monsters[0]; enterHunt(hunter); hunter.windup=0;
    const others=monsters.slice(1); others.forEach(o=>{o.state='idle';});
    let pulled=0; const before=new Set(); for(let i=0;i<60*70;i++){ now+=1/60; hunter.state='hunt'; hunter.heardT=now; noteHeard(); updatePressure(1/60);   // it keeps hearing you
      for(const o of others) if(o.state!=='idle'&&!before.has(o)){ before.add(o); pulled++; } }
    return {heat, pulled, others:others.length}; })()`);
  assert(r.heat>0.5,'heat did not build during a long chase: '+r.heat); assert(r.pulled>=Math.min(2,r.others),'too few monsters drawn in: '+r.pulled+'/'+r.others);
});

T('exit ambush: arriving hot spawns hidden monsters already moving toward you', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; const e=exitInfo; monsters.length=0;
    let c=-1; for(let t=0;t<400;t++){ const a=Math.random()*6.283, x=e.px+Math.sin(a)*18, z=e.pz+Math.cos(a)*18; if(walkAt(x,z)&&exitDist[idx(Math.floor(x),Math.floor(z))]>=0){ c=[x,z]; break; } }
    player.x=c[0]; player.z=c[1]; heat=0.9;
    for(let i=0;i<60*16;i++){ now+=1/60; updatePressure(1/60); }
    const spawned=monsters.map(m=>({d:Math.hypot(m.x-player.x,m.z-player.z), de:Math.hypot(m.x-e.px,m.z-e.pz), state:m.state}));
    // quiet player near the exit does not trigger it
    newGame(); monsters.length=0; player.x=c[0]; player.z=c[1]; heat=0; for(let i=0;i<60*16;i++){ now+=1/60; updatePressure(1/60); }
    return {spawned, calmSpawns:monsters.length}; })()`);
  assert(r.spawned.length>=2,'no ambush spawned: '+r.spawned.length);
  assert(r.spawned.every(m=>m.d>=9&&m.de<=21),'ambusher spawned too close to the player or far from exit: '+JSON.stringify(r.spawned));
  assert(r.spawned.every(m=>m.state==='alert'||m.state==='hunt'),'ambusher was parked idle');
  assert(r.calmSpawns===0,'ambush triggered without heat');
});


T('hiding: a scream passes on only what the screamer knows; calls never reveal where you hide; the level cools down', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false;
    const [a,b,c]=monsters; const hide={x:player.x,z:player.z};
    // a heard you 10 s ago at an old spot far from where you hide now
    const old={x:player.x+30,z:player.z+30}; a.state='hunt'; a.windup=0; a.lastKnown={...old}; a.heardT=now-10; a.x=player.x+20; a.z=player.z;
    b.state='idle'; b.x=a.x+3; b.z=a.z; c.state='hunt'; c.windup=0; c.lastKnown={x:player.x+5,z:player.z}; c.heardT=now-1; c.x=a.x-3; c.z=a.z;
    shriekFrame=-1; shriek(a);
    const bTold=b.state==='hunt'&&Math.hypot(b.lastKnown.x-old.x,b.lastKnown.z-old.z)<0.01;
    const cKept=c.lastKnown.x===player.x+5;            // c had fresher information: not overwritten by stale news
    // heat calls: you were last heard 15 s ago at the old spot; you are hiding still
    lastNoise={x:old.x,z:old.z,t:now-15}; heat=1; let closest=1e9;
    for(const m of monsters.slice(3)) { m.state='idle'; }
    for(let i=0;i<60*20;i++){ now+=1/60; updatePressure(1/60);
      for(const m of monsters.slice(3)){ const t=m.state==='hunt'?m.lastKnown:m.state==='alert'?m.target:null; if(t) closest=Math.min(closest,Math.hypot(t.x-hide.x,t.z-hide.z)); } }
    // nobody hunting with fresh information and you stay quiet: heat goes down
    monsters.forEach(m=>{ m.state='idle'; }); heat=0.8; lastNoise.t=now-10; for(let i=0;i<60*20;i++){ now+=1/60; updatePressure(1/60); }
    return {bTold, cKept, closest, heat}; })()`);
  assert(r.bTold,'the called monster did not go to the stale spot the screamer knew'); assert(r.cKept,'fresher knowledge was overwritten by a scream');
  assert(r.closest>12,'a heat call pointed a monster at your hiding place: '+r.closest.toFixed(1)+' m');
  assert(r.heat<0.3,'the level did not cool down while you hid: '+r.heat);
});

T('hiding: you can shake off two hunters and hide (they do not keep each other updated on your live position)', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; window.__hearOrig=window.__hearOrig||hearPlayer; hearPlayer=()=>{};   // you make no sound
    const [a,b]=monsters; for(const m of [a,b]){ m.state='hunt'; m.windup=0; m.heardT=now; m.lastKnown={x:player.x,z:player.z}; m.lastDir=null; }
    a.x=player.x+30; a.z=player.z; b.x=player.x-30; b.z=player.z; monsters.slice(2).forEach(m=>{ m.state='idle'; m.x=m.z=-999; });
    const start={x:player.x,z:player.z};
    // you sneak away 15 m (no sound); keep the monsters out of sight lines by not letting them see you move
    player.x+=0; let worst=1e9;
    const hidePos={x:start.x,z:start.z}; player.spd=0;
    // move the player instantly to a far, walkable spot and stand still
    for(let k=0;k<400;k++){ const x=start.x+RI(-25,25)+.5, z=start.z+RI(-25,25)+.5; if(walkAt(x,z)&&Math.hypot(x-start.x,z-start.z)>14){ player.x=hidePos.x=x; player.z=hidePos.z=z; break; } }
    player.px0=player.x; player.pz0=player.z; player.vx=player.vz=0; player.spd=0;
    for(let i=0;i<60*25;i++){ now+=1/60; frameNo++; for(const m of [a,b]){ updateMonster(m,1/60); if(m.state==='hunt') worst=Math.min(worst,Math.hypot(m.lastKnown.x-hidePos.x,m.lastKnown.z-hidePos.z)); } if(dead) break; }
    hearPlayer=__hearOrig;
    return {worst, dead, states:[a.state,b.state]}; })()`);
  assert(r.worst>5,'hunters learned where you hide without hearing you: '+r.worst.toFixed(1)+' m');
});

T('death: shorter; a click (or Space) after a moment skips straight to a new game', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; document.getElementById('overlay').style.display='none'; const m=monsters[0]; die(m);
    for(let i=0;i<60*0.3;i++){ now+=1/60; update(1/60); } const early=canSkipDeath();
    for(let i=0;i<60*0.3;i++){ now+=1/60; update(1/60); } const later=canSkipDeath();
    play(); const restarted=!dead&&started&&document.getElementById('overlay').style.display==='none';
    die(monsters[0]); let tOv=0; for(let i=0;i<60*4;i++){ now+=1/60; update(1/60); if(document.getElementById('overlay').style.display==='flex'){ tOv=deathT; break; } }
    return {early, later, restarted, tOv}; })()`);
  assert(!r.early&&r.later,'skip window wrong '+JSON.stringify(r)); assert(r.restarted,'click did not restart');
  assert(r.tOv>0&&r.tOv<=2.1,'death screen came too late: '+r.tOv);
  await ev('(play(), 1)');
});

T('audio: a dead output (silence) is detected and the audio rebuilt; breathing plays without errors', async()=>{
  const r=await ev(`(async()=>{ initAudio(); await AC.resume(); const n0=resetAudio.n||0; const ac0=AC;
    master.gain.value=0;                       // simulate the output dying
    const t0=performance.now(); while(performance.now()-t0<4000&&(resetAudio.n||0)===n0){ await new Promise(r=>setTimeout(r,100)); }
    const rebuilt=(resetAudio.n||0)>n0&&AC!==ac0&&master.gain.value>0;
    fatigue=1; sfxBreath(0.4,0.6); fatigue=0.3; sfxBreath(0.2,1.1);
    for(let i=0;i<6;i++) sfxShriek([player.x+3,1.8,player.z],2.6,3);   // a chorus: only 2 full voices
    return {rebuilt, full:shriekEnds.length, state:AC.state}; })()`);
  assert(r.rebuilt,'audio was not rebuilt '+JSON.stringify(r)); assert(r.full===2,'scream voices not capped: '+r.full);
});


T('audio is 3D: left/right, front/behind (duller behind), follows your turning, muffled behind walls', async()=>{
  const r=await ev(`(async()=>{ newGame(); paused=false; initAudio(); const realAC=AC, realMaster=master, realRev=revSend;
    // render one noise burst through the game's own chain (dest -> filters -> HRTF panner, listener = camera) offline
    async function hear(dx,dz,yaw,far){ player.yaw=yaw; player.pitch=0; const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=-Math.cos(yaw),rz=Math.sin(yaw);
      const off=new OfflineAudioContext(2,22050,44100); AC=off; master=off.createGain(); master.connect(off.destination); revSend=off.createGain();
      updateListener();
      const k=far||1; const x=player.x+(rx*dx+fx*dz)*k, z=player.z+(rz*dx+fz*dz)*k;
      const g=dest([x,camY,z],1,0); const src=off.createBufferSource(); src.buffer=noiseBuf; src.connect(g); src.start(0); src.stop(0.5);
      const b=await off.startRendering(); AC=realAC; master=realMaster; revSend=realRev;
      const L=b.getChannelData(0),R=b.getChannelData(1); let l=0,rr=0,hi=0,all=0;
      for(let i=1;i<L.length;i++){ l+=L[i]*L[i]; rr+=R[i]*R[i]; const m=(L[i]+R[i]), d=m-(L[i-1]+R[i-1]); hi+=d*d; all+=m*m; }
      return {lr:10*Math.log10(l/rr), bright:hi/all, lp:g._lp.frequency.value}; }
    const y0=player.yaw;
    const right=await hear(1,0,y0), left=await hear(-1,0,y0), front=await hear(0,1,y0), behind=await hear(0,-1,y0);
    const frontLeft=await hear(-0.7,0.7,y0), behindLeft=await hear(-0.7,-0.7,y0), behindRight=await hear(0.7,-0.7,y0);
    // a sound in front of you; turn 90 degrees to the right -> it is now on your left
    const fx=Math.sin(y0),fz=Math.cos(y0); player.yaw=y0; const sx=player.x+fx, sz=player.z+fz;
    async function hearAt(x,z,yaw){ const rx=-Math.cos(yaw),rz=Math.sin(yaw),fx2=Math.sin(yaw),fz2=Math.cos(yaw), dx=x-player.x, dz=z-player.z; return hear(dx*rx+dz*rz, dx*fx2+dz*fz2, yaw); }
    const turned=await hearAt(sx,sz,y0-Math.PI/2);
    // through a wall: find a direction with a wall within 2-6 m
    let wall=null; for(let a=0;a<64&&!wall;a++){ const yaw=a/64*6.283, dx=Math.sin(yaw), dz=Math.cos(yaw);
      for(let d=2;d<=6;d+=0.5){ const x=player.x+dx*(d+1.5), z=player.z+dz*(d+1.5); if(walkAt(x,z)&&!los(player.x,camY,player.z,x,camY,z)){ wall={x,z}; break; } } }
    let open=null; for(let a=0;a<64&&!open;a++){ const yaw=a/64*6.283; const x=player.x+Math.sin(yaw)*3, z=player.z+Math.cos(yaw)*3; if(walkAt(x,z)&&los(player.x,camY,player.z,x,camY,z)) open={x,z}; }
    const thru=wall&&await hearAt(wall.x,wall.z,y0), clear=open&&await hearAt(open.x,open.z,y0);
    player.yaw=y0;
    return {right,left,front,behind,frontLeft,behindLeft,behindRight,turned,thru,clear}; })()`);
  const f=x=>x.toFixed(2);
  console.log('      L-R dB: right',f(r.right.lr),'left',f(r.left.lr),'behind-left',f(r.behindLeft.lr),'behind-right',f(r.behindRight.lr),'| brightness front',f(r.front.bright),'behind',f(r.behind.bright));
  assert(r.right.lr<-6&&r.left.lr>6,'left/right not clear: '+f(r.left.lr)+' / '+f(r.right.lr));
  assert(r.behindLeft.lr>3&&r.behindRight.lr<-3,'behind-left / behind-right not on the correct side');
  assert(r.behind.bright<r.front.bright*0.8&&r.behindLeft.bright<r.frontLeft.bright*0.8,'behind is not duller than in front');
  assert(r.turned.lr>6,'after turning right, a sound that was in front is not on the left: '+f(r.turned.lr));
  assert(!r.thru||!r.clear||(r.thru.lp<1200&&r.clear.lp>4000&&r.thru.bright<r.clear.bright*0.6),'sound behind a wall is not muffled '+JSON.stringify([r.thru,r.clear]));
});


T('monsters: a hand or head poking out past a corner is enough to see its body (not only the chest)', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; const m=monsters[0]; m.state='hunt'; m.runB=1; m.armJ.forEach(a=>{a[0]=a[1]=a[2]=0;});
    let partly=0, hidden=0, visible=0, wrong=0;
    for(let k=0;k<4000&&partly<5;k++){ const a=Math.random()*6.283, d=2+Math.random()*12; m.x=player.x+Math.sin(a)*d; m.z=player.z+Math.cos(a)*d; m.yaw=Math.random()*6.283;
      if(!walkAt(m.x,m.z)) continue;
      const centre=los(player.x,camY,player.z,m.x,1.4,m.z), sees=seesMonster(m);
      if(centre&&!sees) wrong++; if(centre) visible++; else if(sees) partly++; else hidden++; }
    return {partly,hidden,visible,wrong}; })()`);
  assert(r.wrong===0,'visible chest but not seen');
  assert(r.partly>=3,'never saw a monster that only shows a part past a corner '+JSON.stringify(r)); assert(r.hidden>0,'monsters behind walls should stay unseen');
});

T('no uncaught page errors during the whole run', async()=>{ assert(pageErrors.length===0,'page errors: '+pageErrors.slice(0,3).join(' | ')); });

// =========================================================== run
let pass=0, fail=0;
if(FILTER&&!'boot'.includes(FILTER)){ await load(); await startGame(); } // filtered runs still need a live game
for(const t of tests){ if(FILTER&&!t.name.includes(FILTER)) continue;
  const t0=Date.now();
  try{ await t.fn(); pass++; console.log(`PASS ${t.name}  (${Date.now()-t0}ms)`); }
  catch(e){ fail++; console.log(`FAIL ${t.name}  ${e.message}`); } }
console.log(fail?`RESULT: ${fail} FAILED, ${pass} passed`:`RESULT: ALL ${pass} PASSED`);
ws.close(); cleanup(); process.exit(fail?1:0);
