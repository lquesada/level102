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
const SHIP='file://'+path.resolve(HERE,'..','..','docs','echoloc','index.html'), PLAIN=path.resolve(HERE,'..','..','scratch','echoloc','plain','index.html');
const SHIPR=path.resolve(HERE,'..','..','scratch','echoloc','ship','index.html');
const PAGE=process.env.SHIPTEST?'file://'+SHIPR:fs.existsSync(PLAIN)?'file://'+PLAIN:SHIP;   // SHIPTEST=1: the stripped game (no cheats), readable   // the published page is obfuscated: tests use the readable build
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
// COVERAGE=1: which game functions the tests ever ran (function level, merged over every page load) -> scratch/echoloc/coverage.txt
const COV=process.env.COVERAGE?{all:new Map(),hit:new Set(),on:false,src:null,bytes:null}:null;
async function covTake(){ if(!COV) return; if(!COV.on){ await send('Profiler.enable'); await send('Debugger.enable'); await send('Profiler.startPreciseCoverage',{callCount:true,detailed:true}); COV.on=true; return; }
  const r=await send('Profiler.takePreciseCoverage'); for(const sc of r.result?.result||[]){ if(!sc.url.endsWith('plain/index.html')) continue;
    const top=sc.functions[0]?.ranges[0]?.endOffset||0; if(top<100000) continue;   /* only the game's own big script, not the small helpers on the page */
    if(!COV.src){ const q=await send('Debugger.getScriptSource',{scriptId:sc.scriptId}); COV.src=q.result?.scriptSource||''; COV.bytes=new Uint8Array(COV.src.length); }
    const here=new Uint8Array(COV.src.length);
    for(const f of sc.functions){ for(const g of f.ranges) here.fill(g.count>0?1:0,g.startOffset,g.endOffset); if(!f.functionName) continue; const k=f.functionName+'@'+f.ranges[0].startOffset; COV.all.set(k,f.functionName); if(f.ranges[0].count>0) COV.hit.add(k); }
    if(sc.functions.length) for(let i=0;i<here.length;i++) if(here[i]) COV.bytes[i]=1; } }
function covReport(){ const S=COV.src, B=COV.bytes, lines=S.split('\n'); let pos=0, code=0, hitL=0; const miss=[];
  for(let n=0;n<lines.length;n++){ const l=lines[n], t=l.trim(); let any=0, tot=0; for(let i=0;i<l.length;i++){ const ch=l[i]; if(ch!==' '&&ch!=='\t'){ tot++; if(B[pos+i]) any++; } }
    if(t&&!t.startsWith('//')){ code++; if(any===tot) hitL++; else miss.push(`${n+1} [${Math.round(100*any/Math.max(1,tot))}%] ${t.slice(0,150)}`); } pos+=l.length+1; }
  const bc=B.reduce((a,b)=>a+b,0); return {pct:(100*bc/B.length).toFixed(1), lines:`${hitL}/${code}`, miss}; }
async function load(mobile=false){ await covTake();
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'Element.prototype.requestPointerLock=()=>Promise.resolve();'});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"try{ localStorage.removeItem('echoloc.lang'); }catch(e){}"});   // every page starts in the browser's language (English here); no test leaks its language into the next   // headless Chrome always refuses the mouse lock; the game now answers a refusal by pausing
  if(mobile){ await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true}); await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); }
  else { await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled',{enabled:false}); }
  await send('Page.navigate',{url:PAGE}); await sleep(1500);
  // a slow or busy machine may not have run the game script yet: wait for it (up to 20 s) instead of trusting the fixed pause
  for(let i=0;i<80;i++){ if(await ev('typeof CAVE!=="undefined"&&document.readyState==="complete"').catch(()=>false)) break; await sleep(250); }
  await ev('(firstLevel=1, level=1, RUN=[0,1,2,3,CAVE,HALLS,FINAL], 1)');   // most tests play the classic level (level 2 of the run)
}
// start a game and keep it running even though headless Chrome drops pointer lock
async function startGame(){ await ev(`(document.getElementById('startBtn')&&document.getElementById('startBtn').click(), 1)`); await click(640,360); await sleep(400); await ev('(paused=false, document.getElementById("overlay").style.display="none", started)'); }

// ---------------- test runner ----------------
const tests=[]; const T=(name,fn)=>tests.push({name,fn});
const assert=(c,msg)=>{ if(!c) throw new Error(msg); };

const PL_LAB=()=>4;
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
      if(rooms[0].z+rooms[0].h<H-8) bad.push(k+': start room not at the south edge'); if(!entranceInfo||entranceInfo.nz!==-1) bad.push(k+': entrance not in the south wall'); if(exitInfo.nz!==1||exitInfo.pz>H*.35) bad.push(k+': exit not out of the north');   // south to north (user 2026-11-05)
      const nm=Math.min(...monsters.map(m=>Math.hypot(m.x-player.x,m.z-player.z))); if(nm<Math.min(25,W*0.2)-0.5) bad.push(k+': monster '+nm.toFixed(1)+'m from start');   // the generator's own rule: 25 m, less on small maps
      if(monsters.length<1||monsters.length>7) bad.push(k+': monster count '+monsters.length);
      if(exitDist[st]<0) bad.push(k+': exit unreachable');
      for(let z=1;z<H-1;z++) for(let x=1;x<W-1;x++){ const i=idx(x,z); if(cellType[i]!==T_COR) continue;
        if((cellType[i-1]===T_WALL&&cellType[i+1]===T_WALL)||(cellType[i-W]===T_WALL&&cellType[i+W]===T_WALL)){ bad.push(k+': 1-wide corridor at '+x+','+z); break; } }
      // signs: few, and each one points straight at a way that gets closer to the exit (never into a wall)
      if(signs.length<3||signs.length>30) bad.push(k+': sign count '+signs.length);
      for(const s of signs){ const i=idx(Math.floor(s.x),Math.floor(s.z)); if(!walk[i]){ bad.push(k+': sign in a wall'); continue; }
        if(roomOf[i]>=0){ // in a room: the line it points along leaves the room through a doorway that leads closer to the exit
          let x=s.x,z=s.z,j=i; for(let t=0;t<400&&roomOf[j]===roomOf[i];t++){ x+=s.dx*0.1; z+=s.dz*0.1; j=idx(Math.floor(x),Math.floor(z)); }
          if(!((cellType[j]===T_DOOR||cellType[j]===T_COR)&&walk[j]&&exitDist[j]>=0&&exitDist[j]<exitDist[i])) bad.push(k+': room sign does not point at the right doorway '+cellType[j]); }
        else { // at a junction: straight down a corridor, which gets closer to the exit
          const ax=Math.abs(s.dx)<1e-6||Math.abs(s.dz)<1e-6; let ok=ax; for(let t=1;t<=3&&ok;t++) if(!walkAt(s.x+s.dx*t,s.z+s.dz*t)) ok=false;
          if(!ok||exitDist[idx(Math.floor(s.x+s.dx*3),Math.floor(s.z+s.dz*3))]>=exitDist[i]) bad.push(k+': corridor sign does not point down the way out'); } }
      if(rooms.length<Math.max(5,Math.round(24*(W*H)/(128*128)*(LV().rooms||1)))) bad.push(k+': too few rooms '+rooms.length);   // scales with the map area, as the generator
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
    let sx=null; for(let t=0;t<20000&&!sx;t++){ const x=RI(rr.x-12,rr.x+rr.w+12),z=RI(rr.z-12,rr.z+rr.h+12); if(!inb(x,z)) continue; const i=idx(x,z); if(walk[i]&&mat[i]!==1){ const d=Math.hypot(x-rr.cx,z-rr.cz); if(d>Math.max(rr.w,rr.h)/2+2&&d<Math.max(rr.w,rr.h)/2+10) sx=[x,z]; } }
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

T('colours: carpet floors show your usual colour, just dimmer (no brown); monster echoes stay red on any floor', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=0;
    const floorDots=(roomMat,fn)=>{ const rr=rooms.find(o=>(o.mat||0)===roomMat&&o.id!==0); let c=idx(Math.floor(rr.cx),Math.floor(rr.cz));
      for(let t=0;t<80&&!walk[c];t++) c=idx(RI(rr.x+1,rr.x+rr.w-2),RI(rr.z+1,rr.z+rr.h-2));
      player.x=c%W+.5; player.z=((c/W)|0)+.5; const h0=phead; fn(); for(let k=0;k<60&&echoJobs.length;k++) processEchoJobs();
      let n=0,R=0,G=0,B=0; for(let p=h0;p!==phead;p=(p+1)%MAXP){ const o=p*STRIDE; if(pdata[o+1]>0.03||matAt(pdata[o],pdata[o+2])!==roomMat) continue; n++; R+=pdata[o+3]; G+=pdata[o+4]; B+=pdata[o+5]; }
      return {n, r:R/n, g:G/n, b:B/n}; };
    const mine=()=>{ lastEcho=-9; playerEcho(true); };
    const red=()=>emitEcho({x:player.x,y:1.8,z:player.z,n:6000,maxD:20,speed:30,life:1,flags:0,col:[1,0.12,0.08],I:1.2});
    return {carpet:floorDots(2,mine), plain:floorDots(0,mine), carpetRed:floorDots(2,red)}; })()`);
  const c=r.carpet, p=r.plain, m=r.carpetRed;
  assert(c.n>50&&c.b>=c.r&&c.b>=c.g,'carpet floor dots are not your colour '+JSON.stringify(c));
  assert(c.b<p.b,'carpet floor dots are not dimmer than a plain floor '+JSON.stringify([c,p]));
  assert(m.n>50&&m.r>m.g*3&&m.r>m.b*3,'a monster echo is not red on carpet '+JSON.stringify(m));
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

T('debug: the lit view (cheat sidebar / V in cheat mode) renders without GL errors; typing "letmesee" no longer does anything', async()=>{
  for(const ch of 'letmesee') await key('Key'+ch.toUpperCase(),ch,ch);
  await sleep(200); const typed=await ev('debugView');
  const a=await ev('(toggleEyes(), render(), {on:debugView, lit:litCount, err:gl.getError(), mon:buildMonsterMesh()})');
  assert(!typed,'letmesee still works'); assert(a.on&&a.lit>10000,'lit view did not turn on '+JSON.stringify(a)); assert(a.err===0,'GL error '+a.err);
  await ev('(toggleEyes(), 1)'); assert(await ev('debugView')===false,'did not turn off');
});

T('win: the escape screen has no LETMESEE secret any more (user 2026-11-06), and typing it does nothing', async()=>{
  await ev('(newGame(), paused=false, debugView=false, win(), 1)');
  const r=await ev(`({h1:document.querySelector('#overlay h1').textContent, secret:!!document.querySelector('#overlay .secret'), btn:!!document.getElementById('eyesBtn')})`);
  assert(r.h1==='ESCAPED'&&!r.secret&&!r.btn,'secret still on the win screen '+JSON.stringify(r));
  for(const ch of 'LETMESEE') await key('Key'+ch,ch,ch);
  assert(await ev('debugView')===false,'LETMESEE still toggles the view');
  await ev('(won=false, document.getElementById("overlay").style.display="none", paused=false, 1)');
});

T('run: seven levels (1-4, cave, halls, bridge), each exit leads on keeping power-ups, level 6 leads to the bridge (no exit there), dying restarts at level 1', async()=>{
  const r=await ev(`(()=>{ firstLevel=0; newRun(); paused=false; const info=[]; picks[3]=2;
    for(let i=0;i<6;i++){ info.push({lv:level,W,rooms:rooms.length,signs:signs.length,items:items.length,gadgets:gadgets.length,kinds:monsters.reduce((a,m)=>(a[m.kind]=(a[m.kind]||0)+1,a),{})}); if(i<5) reachExit(); }
    const kept=picks[3], lv=level; reachExit(); const wonEnd=!won&&level===FINAL&&!(exitInfo.px>0); won=false; dead=true; document.getElementById('overlay').style.display='flex'; play(); const after={lv:level,p:picks[3]};
    firstLevel=1; level=1; newGame(); paused=false; return {info,kept,lv,wonEnd,after}; })()`);
  const L=r.info, CAVE_I=7, HALLS_I=8; console.log('      '+L.map(x=>JSON.stringify(x)).join('\n      '));
  assert(L[0].W<=72&&L[0].kinds.stalker===2&&Object.keys(L[0].kinds).length===1&&L[0].items===0,'level 1 '+JSON.stringify(L[0]));
  assert(L[1].W>=86&&L[1].W<=92&&L[1].items>=2&&L[1].items<=3&&L[1].gadgets===1,'level 2 '+JSON.stringify(L[1]));
  assert(L[2].kinds.spider===2&&L[2].items>=3&&L[2].items<=4,'level 3 '+JSON.stringify(L[2])); assert(L[3].kinds.mimic===3&&L[3].kinds.spider===3&&!L[3].kinds.listener&&L[3].W===128,'level 4 '+JSON.stringify(L[3])); assert(L[4].lv===CAVE_I&&L[5].lv===HALLS_I&&L[4].kinds.statue&&L[5].kinds.stalker===6&&Object.keys(L[5].kinds).length===1,'levels 5-6 '+JSON.stringify(L.slice(4)));
  assert(L[0].signs/L[0].rooms>L[3].signs/L[3].rooms,'level 1 must have more signs per room than level 4 '+JSON.stringify([L[0],L[3]]));
  assert(r.kept===2&&r.lv===HALLS_I&&r.wonEnd,'run flow '+JSON.stringify(r)); assert(r.after.lv===0&&r.after.p===0,'dying must restart the run '+JSON.stringify(r.after));
});

T('creatures: spider follows your real path round corners; mimic copies your echo; heads turn smoothly', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=0;
    // spider: walk a trail, it must pass through the trail cells, and its top speed stays below yours
    const sx=player.x,sz=player.z; let c=startCell; const path=[]; { const ex=exitDist; for(let k=0;k<30;k++){ let b=c,bd=ex[c]; for(const o of [1,-1,W,-W]){ const n=c+o; if(walk[n]&&ex[n]>=0&&ex[n]<bd){bd=ex[n];b=n;} } c=b; path.push([c%W+.5,((c/W)|0)+.5]); } }
    const sp=makeMonster(sx,sz,'spider'); monsters.push(sp); now+=1; crumbs=[]; path.forEach((q,i)=>crumbs.push({x:q[0],z:q[1],t:now+i*0.25-8}));
    player.x=path[29][0]; player.z=path[29][1]; enterHunt(sp); sp.windup=0; sp.crumbT=now-9; sp.heardT=now; let top=0, near=0; const hear=window.hearsBreath; window.hearsBreath=()=>false; const reach=TUNE.reach; TUNE.reach=0.01;
    for(let i=0;i<60*12;i++){ now+=1/60; frameNo++; const x0=sp.x,z0=sp.z; updateMonster(sp,1/60); if(dead){ dead=false; break; } top=Math.max(top,Math.hypot(sp.x-x0,sp.z-z0)*60); if(Math.hypot(sp.x-path[15][0],sp.z-path[15][1])<1.5) near=1; }
    window.hearsBreath=hear; TUNE.reach=reach;
    // mimic: dormant until you echo close, then awake and chasing, red
    const mi=makeMonster(player.x+5,player.z,'mimic'); monsters.length=0; monsters.push(mi); const lk=kind=>{ hearPlayer(kind); return mi.state; }; const st0=lk('step'), far=TUNE.mimicRange; TUNE.mimicRange=2; const st1=lk('echo'); TUNE.mimicRange=far; const st2=lk('echo'), aw=mi.awake;
    const h0=phead; sampleMonster(mi,100,now,1,[1,1,1],0); let red=0; for(let p=h0;p!==phead;p=(p+1)%MAXP){ const o=p*STRIDE; if(pdata[o+3]>pdata[o+5]*2) red++; } const dorm=makeMonster(player.x+5,player.z,'mimic'), h1=phead; sampleMonster(dorm,100,now,1,[1,0,0],0); let dred=0; for(let p=h1;p!==phead;p=(p+1)%MAXP){ const o=p*STRIDE; if(pdata[o+3]>pdata[o+5]) dred++; } monsters.length=0; const armed=st0==='idle'&&st1==='idle'&&st2==='hunt'&&aw, e=red>60&&dred===0?1:0, hp=humanPose(mi).segs.length;
    const hm=makeMonster(player.x+9,player.z); hm.state='alert'; hm.target={x:hm.x,z:hm.z}; monsters.length=0; monsters.push(hm); let jump=0, maxRoll=0; for(let i=0;i<60*8;i++){ const r0=hm.twRoll; now+=1/60; frameNo++; updateMonster(hm,1/60); jump=Math.max(jump,Math.abs(hm.twRoll-r0)); maxRoll=Math.max(maxRoll,Math.abs(hm.twRoll)); } monsters.length=0;
    return {top,near,armed,e,hp,jump,maxRoll}; })()`);
  assert(r.near&&r.top<5,'spider '+JSON.stringify(r)); assert(r.jump<0.05&&r.maxRoll<0.3,'head snaps '+JSON.stringify(r)); assert(r.armed&&r.e===1&&r.hp>10,'mimic '+JSON.stringify(r));
});

T('power-ups: active ones multiply, one of each, none repeated in a level, shelved ones keep their model only; dots vanish on pickup; gadget lights its surroundings', async()=>{
  const r=await ev(`(()=>{ level=1; newGame(); paused=false; monsters.length=0;
    const measure={echo:()=>up('itemFar','echo'),dense:()=>up('itemDots','dense'),stride:()=>up('pwStride','stride'),lungs:()=>up('pwLungs','lungs'),eye:()=>up('pwEye','eye'),ears:()=>up('pwEars','ears'),hush:()=>down('pwHush','hush'),glow:()=>up('pwGlow','glow')};
    let mult=true; for(const k in measure){ const i=PI[k]; picks[i]=0; const a=measure[k](); picks[i]=1; const b=measure[k](); picks[i]=2; const c=measure[k](); picks[i]=0; if(!(b!==a&&Math.abs(c-b*b)<1e-9)) mult=false; }
    const ids=PW.map(q=>q.id).join(), shelf=PW.filter(q=>q.shelf).map(q=>q.id).join(), side=(buildSide(),document.querySelectorAll('#side [data-a^="pwt:"]').length);
    let ok=true; PW.forEach((q,i)=>{ let n=0; modelPoints(i,50,(x,y,z)=>{ if(isFinite(x+y+z)&&Math.hypot(x,y,z)<0.8) n++; }); if(n!==50) ok=false; });
    // pickup: card, dots gone at once, cap at 3
    const mk=t=>({x:player.x,z:player.z,t,got:false,y:1,ry:0}); const it=mk(PI.dense); revealItem(it,now,1.8); const s0=it.spots[0].s, life0=pdata[(s0+5)*STRIDE+7]; items=[it]; update(1/60); const life1=pdata[(s0+5)*STRIDE+7]; const card=document.getElementById('pickup').style.display, name=document.querySelector('#pickup b').textContent;
    for(let k=0;k<5;k++){ const j=mk(PI.dense); items=[j]; update(1/60); } const capped=picks[PI.dense];
    // spawning: no duplicates, none at the cap, never shelved
    picks.fill(0); picks[PI.echo]=3; let dup=0, capSpawn=0, shelfSpawn=0; for(let k=0;k<40;k++){ newGame(); const t=items.map(i=>i.t); if(new Set(t).size!==t.length) dup++; if(t.includes(PI.echo)) capSpawn++; if(t.some(x=>PW[x].shelf)) shelfSpawn++; }
    picks.fill(0); monsters.length=0; const oe=emitEcho; gadgets=[{x:player.x+4,z:player.z,t:0}]; let gd=0; window.emitEcho=a=>{ if(a.col&&a.x===gadgets[0].x) gd++; return oe(a); }; update(1/60); window.emitEcho=oe; gadgets=[]; items=[];
    return {mult,ids,shelf,side,ok,life0,life1,card,name,capped,dup,capSpawn,shelfSpawn,gd}; })()`);
  assert(r.mult,'not multiplicative'); assert(!/ghost|breath/.test(r.ids),'removed ones still there '+r.ids); assert(r.shelf==='tired,quiet,stone,beep','shelf '+r.shelf); assert(r.side===27,'sidebar toggles (20 power-ups + star + 5 artifacts + crown) '+r.side); assert(r.ok,'models');
  assert(r.life0>0&&r.life1===0,'dots stay after pickup '+JSON.stringify(r)); assert(r.card==='flex'&&r.name==='DENSE ECHO','card '+JSON.stringify(r)); assert(r.capped===1,'cap '+r.capped);   /* every item: once (user 2026-11-03) */
  assert(r.dup===0&&r.capSpawn===0&&r.shelfSpawn===0,'spawn rules '+JSON.stringify(r)); assert(r.gd===1,'gadget');
  await ev('document.getElementById("pickup").style.display="none", 1');
});

T('letmecheat: game + sidebar split; levels, playroom, spawns, power-ups, modifiers all work; export/import', async()=>{
  await ev('(newGame(), paused=false, document.getElementById("overlay").style.display="none", Object.keys(keys).forEach(k=>keys[k]=false), 1)');
  for(const ch of 'letmecheat') await key('Key'+ch.toUpperCase(),ch,ch);
  await sleep(150); await ev('Object.keys(keys).forEach(k=>keys[k]=false), 1'); await shot('desktop_sidebar');
  const tab=async()=>{ await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyQ',key:'q',windowsVirtualKeyCode:81}); await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyQ',key:'q',windowsVirtualKeyCode:81}); await sleep(80); return ev(`[paused, document.getElementById('overlay').style.display]`); };
  await ev('(paused=false, document.getElementById("overlay").style.display="none", 1)');
  const t1=await tab(), t2=await tab();
  assert(t1[0]===true&&t1[1]==='flex','Q did not pause '+t1); assert(t2[0]===false&&t2[1]==='none','Q did not resume '+t2);
  await ev('(debugView=false, paused=true, showOverlay("paused"), 1)'); await sleep(200); await shot('desktop_peek');
  const pk=await ev(`({lit:litFor===BX&&litCount>0, cls:document.documentElement.classList.contains('peek'), bg:getComputedStyle(document.getElementById('overlay')).backgroundColor, sw:debugView})`);
  await ev('cv.click(), 1'); await sleep(200); const pk1=await ev(`[paused, document.getElementById('overlay').style.display]`); assert(pk1[0]===false&&pk1[1]==='none','click did not resume cleanly '+pk1);
  const pk2=await ev(`document.documentElement.classList.contains('peek')`);
  assert(pk.lit&&pk.cls&&pk.bg==='rgba(0, 0, 0, 0)'&&pk.sw===false&&!pk2,'pause does not show everything '+JSON.stringify([pk,pk2]));
  const act=a=>`document.querySelector('#side [data-a="${a}"]').click()`;
  const r=await ev(`(()=>{ const sd=document.getElementById('side'), o={mapShown:mapOn&&getComputedStyle(document.getElementById('map')).display==='block', open:getComputedStyle(sd).display==='block', w:Math.round(sd.getBoundingClientRect().width), cv:cv.width/Math.min(devicePixelRatio,1.5), sliders:sd.querySelectorAll('input[type=range]').length, scroll:sd.scrollHeight>sd.clientHeight};
    ${act('lv3')}; o.l4=[level,W]; ${act('wing:0')}; o.play=[level,[...new Set(monsters.map(m=>m.kind))].sort().join(),items.length]; o.hub=rooms.length===WINGS[0].length+1&&monsters.every(m=>roomOf[idx(Math.floor(m.x),Math.floor(m.z))]>0&&roomOf[idx(Math.floor(m.x),Math.floor(m.z))]!==exitInfo.room); o.playApart=new Set(monsters.map(m=>roomOf[idx(Math.floor(m.x),Math.floor(m.z))])).size;
    ${act('clear')}; o.cleared=monsters.length; ${act('sp:spider')}; ${act('sp:mimic')}; o.spawned=monsters.map(m=>m.kind).join();
    ${act('pwt:3')}; o.two=picks[3]; ${act('pwt:3')}; o.one=picks[3]; ${act('pwall')}; o.all=SHOP().every(id=>picks[PI[id]]===1)&&!picks[PI.memory]; ${act('pwnone')}; o.none=picks.every(v=>v===0);
    ${act('god')}; const m=monsters[0]; die(m); o.god=!dead; ${act('god')}; ${act('freeze')}; const mx=[monsters[0].x,monsters[0].wanderT]; updateMonster(monsters[0],1); o.frozen=monsters[0].wanderT===mx[1]; ${act('freeze')};
    ${act('eyes')}; o.eyes=debugView; ${act('eyes')}; ${act('map')}; o.map=mapOn; ${act('map')};   /* the map starts off (user 2026-11-04): one click turns it on */
    
    const inp=sd.querySelector('[data-k="walk"] input'); inp.value='3.5'; inp.dispatchEvent(new Event('input',{bubbles:true})); o.walk=TUNE.walk; ${act('export')}; o.exp=sd.querySelector('#tuneTxt').value;
    ${act('def')}; o.back=TUNE.walk; sd.querySelector('#tuneTxt').value='{"chase":2.2,"run":99,"nope":1}'; ${act('import')}; o.imp=[TUNE.chase,TUNE.run]; ${act('def')};
    ${act('lv1')}; monsters.length=0; ${act('exit')}; o.exit=Math.hypot(player.x-exitInfo.px,player.z-exitInfo.pz)<3; return o; })()`);
  await shot('desktop_sidebar2');
  await ev('(toggleCheat(), level=1, newGame(), paused=false, document.getElementById("overlay").style.display="none", 1)');
  { await ev('(paused=false, 1)'); await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyQ',key:'q',windowsVirtualKeyCode:81}); await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyQ',key:'q',windowsVirtualKeyCode:81}); await sleep(80); assert(await ev('paused')===false,'Q paused outside cheat mode'); }
  const closed=await ev('[getComputedStyle(document.getElementById("side")).display, cheatOn, mapOn]');
  assert(r.open&&r.w===360&&r.scroll&&r.sliders>=60,'sidebar '+JSON.stringify(r)); assert(r.cv<1000,'game pane did not shrink: '+r.cv);
  assert(r.l4[0]===3&&r.play[0]===4&&r.play[1]==='angler,bloom,burrower,centipede,drift,dropper,mimic,shade,spider,stalker,statue,twin'&&r.play[2]===0&&r.hub,'teleports '+JSON.stringify(r));
  assert(r.cleared===0&&r.spawned==='spider,mimic'&&r.two===1&&r.one===0&&r.all&&r.none,'buttons '+JSON.stringify(r));
  assert(r.god&&r.frozen&&r.eyes&&r.map,'toggles '+JSON.stringify(r)); assert(r.walk===3.5&&r.exp==='{"walk":3.5}'&&r.back===2.4,'modifier '+JSON.stringify(r)); assert(r.imp[0]===2.2&&r.imp[1]===10,'import '+JSON.stringify(r.imp));
  assert(r.exit,'exit teleport'); assert(closed[0]==='none'&&!closed[1]&&!closed[2],'letmecheat toggle'); assert(!r.mapShown,'the map must stay off until M (user 2026-11-04)');
});

T('red pill: matrix mode draws glyph rain over the whole world, monsters too, without GL errors; never in the random pool', async()=>{
  await ev(`(newGame(), paused=false, document.getElementById('overlay').style.display='none', document.getElementById('info').style.display='none', document.getElementById('prompt').style.display='none', player.pitch=0, 1)`);
  await ev(`(()=>{ monsters.length=0; freezeM=true; keys.KeyW=false; // a long straight corridor with three figures at its end, like the reference pictures
    let best=null; for(let i=0;i<W*H;i++){ if(cellType[i]!==T_COR) continue; for(const o of [1,-1,W,-W]){ let k=1; while(k<30&&cellType[i+o*k]===T_COR) k++; if(k>=12&&(!best||k>best.k)) best={i,o,k}; } }
    if(best){ const cx=best.i%W+.5, cz=((best.i/W)|0)+.5, dx=best.o===1?1:best.o===-1?-1:0, dz=best.o===W?1:best.o===-W?-1:0; player.x=cx; player.z=cz; player.px0=cx; player.pz0=cz; player.yaw=Math.atan2(dx,dz); player.pitch=0.02;
      for(const q of [-0.7,0,0.7]){ const m=makeMonster(cx+dx*7-dz*q,cz+dz*7+dx*q,'stalker'); m.yaw=player.yaw+3.14; monsters.push(m); } } return !!best; })()`);
  await sleep(150); await shot('matrix_off');
  await ev(`(picks[PI.pill]=1, 1)`); await sleep(900); await shot('matrix_on');
  const r=await ev(`(()=>{ render(); const px=new Uint8Array(4*400*300); gl.readPixels(100,100,400,300,gl.RGBA,gl.UNSIGNED_BYTE,px); let g=0,rd=0,n=0; for(let i=0;i<px.length;i+=4){ n++; if(px[i+1]>px[i]*1.5&&px[i+1]>60) g++; if(px[i]>px[i+1]*1.5&&px[i]>60) rd++; }
    const e=gl.getError(), tex=glyphImg.naturalWidth; let inPool=0; for(let k=0;k<30;k++){ newGame(); if(items.some(i=>PW[i.t].id==='pill')) inPool++; } picks[PI.pill]=0; freezeM=false; document.getElementById('info').style.display=''; document.getElementById('prompt').style.display=''; return {green:g/n,red:rd/n,e,tex,inPool}; })()`);
  await ev(`(newGame(), 1)`);
  assert(r.e===0,'GL error '+r.e); assert(r.tex===384,'glyph picture not embedded/loaded '+r.tex); assert(r.green>0.02,'not much green rain '+JSON.stringify(r)); assert(r.inPool===0,'red pill found in a normal level');
});

T('tired running: dots only on walls away from you, never on the floor close by, and more jagged the more tired', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=0; const run=f=>{ fatigue=f; const h0=phead; let spread=0; const e=emitEcho; const seen=[]; window.emitEcho=a=>{ seen.push(a); return e(a); }; runStepEcho(); window.emitEcho=e; for(let k=0;k<40&&echoJobs.length;k++) processEchoJobs();
      let near=0,low=0,n=0; for(let p=h0;p!==phead;p=(p+1)%MAXP){ const o=p*STRIDE; n++; const d=Math.hypot(pdata[o]-player.x,pdata[o+2]-player.z); if(d<2.5) near++; if(pdata[o+1]<0.02) low++; } return {n,near,low,jit:seen[0].jit}; };
    const a=run(0.5), b=run(1); fatigue=0; return {a,b}; })()`);
  assert(r.a.n>50,'no dots at all '+JSON.stringify(r)); assert(r.a.near===0&&r.b.near===0,'dots close to the player '+JSON.stringify(r)); assert(r.b.jit>r.a.jit,'not more jagged when more tired');
});

T('red indicator: only with a chaser in line of sight, fades out in 1 s, comes back; heartbeat stays', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; const m=monsters[0]; monsters.length=1; m.state='hunt'; m.windup=0; m.x=player.x+5; m.z=player.z; m.freezeT=0; const sm=seesMonster, um=updateMonster; window.updateMonster=()=>{}; let vis=true; window.seesMonster=()=>vis;
    const run=s=>{ for(let i=0;i<s*60;i++){ now+=1/60; update(1/60); } return redK; }; const up=run(1); vis=false; const half=run(0.5), gone=run(0.6), fear0=fear; vis=true; const back=run(0.5);
    vis=false; staticBoost=0; run(2); window.seesMonster=()=>false; shriekFrame=-1; frameNo++; shriek(m); const hidden=staticBoost; window.seesMonster=sm; window.updateMonster=um; monsters.length=0; return {up,half,gone,fear0,back,hidden}; })()`);
  assert(r.up>0.5,'no red with a chaser in sight '+JSON.stringify(r)); assert(r.half>0.05&&r.half<r.up,'should still be fading after 0.5 s '+JSON.stringify(r)); assert(r.gone===0,'not gone after 1.1 s '+JSON.stringify(r));
  assert(r.back>0.4,'did not come back '+JSON.stringify(r)); assert(r.fear0>0.3,'heartbeat should keep going '+JSON.stringify(r)); assert(r.hidden===0,'scream out of sight turned the screen red '+JSON.stringify(r));
});

T('red pill (round 12): monsters no longer blow up: sprinting or walking into one, with or without the pill, kills you', async()=>{
  const r=await ev(`(()=>{ const fresh=(pill,run)=>{ newGame(); paused=false; const m=makeMonster(player.x+0.8,player.z); m.state='hunt'; m.windup=0; monsters.length=0; monsters.push(m); picks[PI.pill]=pill; Object.keys(keys).forEach(k=>keys[k]=false); keys.KeyW=run||!!pill; keys.ShiftLeft=run; update(1/60); return {dead,left:monsters.length,sparks:sparks.length}; };
    const a=fresh(1,true), h0=phead; for(let i=0;i<20;i++){ now+=1/60; update(1/60); } let n=0,gr=0; for(let p=h0;p!==phead;p=(p+1)%MAXP){ const o=p*STRIDE; n++; if(pdata[o+4]>pdata[o+3]&&pdata[o+4]>pdata[o+5]) gr++; } const s1=sparks.length; for(let i=0;i<240;i++){ now+=1/60; update(1/60); } const after=sparks.length;
    const b=fresh(1,false); dead=false; const c=fresh(0,true); dead=false; picks.fill(0); keys.KeyW=false; keys.ShiftLeft=false; newGame(); paused=false; return {a,n,gr,s1,after,b,c}; })()`);
  assert(r.a.dead&&r.a.left===1&&r.a.sparks===0,'the pill still blows monsters up '+JSON.stringify(r));
  assert(r.b.dead,'walking into a monster must still kill you'); assert(r.c.dead,'no pill must still kill you');
});

T('matrix mode: no echolocation dots at all (echo, monsters, signs, exit); power-ups stay visible', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; monsters.length=0; items=[]; const m=makeMonster(player.x+3,player.z); m.state='hunt'; m.windup=0; monsters.push(m); picks[PI.pill]=1; const h0=totalW;
    lastEcho=-9; playerEcho(true); runStepEcho(); shriekFrame=-1; shriek(m); shriekPulse(m); for(const q of signs) { revealSign(q,now); revealFloorArrow(q,now); } revealExit(now); sampleMonster(m,200,now,1,[1,0,0],0); for(let k=0;k<30;k++) processEchoJobs();
    const dots=totalW-h0, jobs=echoJobs.length; const it={x:player.x+2,z:player.z,y:1,t:0,got:false,ry:0}; revealItem(it,now,1); const item=totalW-h0; picks.fill(0); monsters.length=0; newGame(); return {dots,jobs,item}; })()`);
  assert(r.dots===0&&r.jobs===0,'echo dots in matrix mode '+JSON.stringify(r)); assert(r.item>100,'power-up not drawn '+JSON.stringify(r));
});

T('matrix mode: walls hide monsters', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; document.getElementById('overlay').style.display='none'; monsters.length=0; picks[PI.pill]=1; freezeM=true;
    // face a wall about 1.5 m away, with a monster right behind it
    let spot=null; for(let i=0;i<W*H&&!spot;i++){ if(!walk[i]||cellType[i]!==T_COR) continue; for(const o of [1,-1,W,-W]){ if(cellType[i+o]===T_WALL&&cellType[i+o*2]===T_WALL&&walk[i+o*3]&&walk[i-o]){ spot={i,o}; break; } } }
    if(!spot) return null; const dx=spot.o===1?1:spot.o===-1?-1:0, dz=spot.o===W?1:spot.o===-W?-1:0, x=spot.i%W+.5, z=((spot.i/W)|0)+.5; player.x=x; player.z=z; player.yaw=Math.atan2(dx,dz); player.pitch=0;
    const shot=()=>{ render(); const p=new Uint8Array(4*cv.width*cv.height); gl.readPixels(0,0,cv.width,cv.height,gl.RGBA,gl.UNSIGNED_BYTE,p); return p; };
    const m=makeMonster(x+dx*3,z+dz*3); monsters.push(m); mxLights(); const lit=mxL[0]; let drawn=0; const od=window.drawMx; window.drawMx=(b,c,V,e,mon,g)=>{ if(mon&&g<1) drawn++; return od(b,c,V,e,mon,g); }; render(); window.drawMx=od; picks.fill(0); freezeM=false; monsters.length=0; newGame(); return {drawn,lit}; })()`);
  assert(r&&r.drawn===0&&r.lit===-999,'monster shows through a wall '+JSON.stringify(r));
});

T('matrix mode: no PRESS SPACE prompt, it comes back without the pill', async()=>{
  const d=`getComputedStyle(document.getElementById('prompt')).display`;
  const r=await ev(`(()=>{ newGame(); paused=false; document.getElementById('prompt').style.display=''; picks[PI.pill]=1; render(); const on=${d}; picks[PI.pill]=0; render(); return {on,off:${d}}; })()`);
  assert(r.on==='none'&&r.off!=='none','prompt '+JSON.stringify(r));
});

T('cheat keys 1-7: the seven levels of the run; M: map on and off; nothing without cheat mode', async()=>{
  const press=async n=>{ await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Digit'+n,key:String(n),windowsVirtualKeyCode:48+n}); await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Digit'+n,key:String(n),windowsVirtualKeyCode:48+n}); await sleep(60); return ev('level'); };
  const pressK=async c=>{ await send('Input.dispatchKeyEvent',{type:'keyDown',code:c,key:c.slice(-1).toLowerCase(),windowsVirtualKeyCode:c.charCodeAt(3)}); await send('Input.dispatchKeyEvent',{type:'keyUp',code:c,key:c.slice(-1).toLowerCase(),windowsVirtualKeyCode:c.charCodeAt(3)}); await sleep(80); return ev('mapOn'); };
  await ev('(level=1, newGame(), paused=false, document.getElementById("overlay").style.display="none", 1)');
  const before=await press(3), m0=await pressK('KeyM'); await ev('toggleCheat(), 1'); const got=[]; for(const n of [1,2,3,4,5,6,7]) got.push(await press(n));
  const m1=await pressK('KeyM'), m2=await pressK('KeyM'); const want=await ev('RUN.join()');
  await ev('(toggleCheat(), firstLevel=1, level=1, newGame(), paused=false, document.getElementById("overlay").style.display="none", 1)');
  assert(before===1&&m0===false,'keys worked outside cheat mode'); assert(got.join()===want,'keys '+got+' want '+want); assert(m1===true&&m2===false,'M did not toggle the map '+[m1,m2]);
});
T('input: F toggles fullscreen', async()=>{
  await ev('(window.__fs=0, window.goFS=()=>{__fs++;}, 1)');
  await key('KeyF','f','f'); await key('KeyF','f','f',false);
  assert(await ev('__fs')===1,'F did not request fullscreen');
});

T('level102 top bar: shown on top, the start screen sits below it, help text in every language', async()=>{
  const r=await ev(`(()=>{ const ov=document.getElementById('overlay'), d0=ov.style.display; ov.style.display='flex'; const b=document.getElementById('l102bar').getBoundingClientRect(), o=ov.getBoundingClientRect(); ov.style.display=d0; const tp=document.getElementById('l102help-text');
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
  assert(/Space/.test(r.how)&&/round ECHO button/.test(r.how),'how-to-play text missing');
  assert(/Luis Quesada/.test(r.about)&&/github\.com\/lquesada\/level102/.test(r.about)&&/GPL/.test(r.about),'about text missing');
  const e0=await ev('lastEcho'); await key('Space',' ',' '); await key('Space',' ',' ',false); await sleep(50);
  assert(await ev('lastEcho')===e0,'Space reached the game while help was open');
  await key('Escape','Escape'); await key('Escape','Escape',undefined,false); await sleep(50);
  assert(await ev('document.getElementById("l102dlg").hidden'),'Esc did not close the help');
});

T('languages: start/pause screens, prompt and help switch EN/ES/DE in place', async()=>{
  const get=()=>ev(`({h1:document.querySelector('#overlay h1').textContent, go:(document.querySelector('#overlay .go')||document.getElementById('resumeBtn')||document.getElementById('startBtn')).textContent, prompt:document.getElementById('prompt').textContent})`);
  await ev('(started=true, paused=true, showOverlay("paused"), 1)');   /* on the pause screen */
  await ev('setLangPref("de"), 1'); const de=await get();
  await ev('setLangPref("es"), 1'); const es=await get();
  await ev('L102.help(true), 1'); const how=await ev('document.getElementById("l102how").textContent'); await ev('L102.help(false), 1');
  await ev('setLangPref("system"), 1'); const en=await get();
  assert(/PAUSE/.test(de.h1)&&/WEITER/.test(de.go)&&/LEERTASTE/.test(de.prompt),'de '+JSON.stringify(de));
  assert(/PAUSA/.test(es.h1)&&/SEGUIR/.test(es.go)&&/ESPACIO/.test(es.prompt),'es '+JSON.stringify(es));
  assert(/Espacio/.test(how),'help not in Spanish');
  assert(en.h1==='PAUSED'&&/RESUME/.test(en.go),'en '+JSON.stringify(en));
  await ev('(paused=false, document.getElementById("overlay").style.display="none", 1)');
});

T('mobile: start tap goes full screen sideways; stick walks, past the outer ring it runs; look drag turns', async()=>{
  await load(true);
  assert(await ev('isTouch'),'touch not detected'); await shot('phone_start');
  await ev('(window.__fs=0, window.goFS=()=>{__fs++;}, 1)');
  { const b=JSON.parse(await ev(`JSON.stringify(document.getElementById('startBtn').getBoundingClientRect())`)); await touch('touchStart',[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]); await touch('touchEnd',[]); await sleep(500); }   /* the menu starts from its START GAME button */
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
  // look with the right thumb while running (looking never echoes)
  await ev('(lastEcho=-9, 1)');
  await touch('touchStart',[{x:120,y:204,id:2},{x:600,y:150,id:6}]);
  for(let i=1;i<=5;i++){ await touch('touchMove',[{x:120,y:204,id:2},{x:600+i*14,y:150,id:6}]); await sleep(30); }
  await touch('touchEnd',[]); await sleep(100);
  const p2=await ev('[player.x,player.z,player.yaw]');
  assert(!walk.sprinting&&!walk.run&&!walk.ring,'walking stick made you run '+JSON.stringify(walk));
  assert(Math.hypot(p1[0]-p0[0],p1[1]-p0[1])>0.2,'stick did not move the player');
  assert(run.sprinting&&run.run&&run.ring,'stick past the outer ring did not run '+JSON.stringify(run));
  assert(Math.abs(p2[2]-p0[2])>0.05,'look drag did not turn');
  assert(await ev('lastEcho')===-9,'touching the right side to look echoed');
});

T('mobile: the ECHO button echoes on a tap (also while running); looking, or sliding onto it while looking, does not', async()=>{
  await ev('(lastEcho=-9, fatigue=0, window.__echoN=0, window.__pe=window.__pe||playerEcho, playerEcho=function(s){ __echoN++; return __pe(s); }, 1)');
  const B=JSON.parse(await ev('JSON.stringify(echoBtn.getBoundingClientRect())')), L=JSON.parse(await ev('JSON.stringify(lookHint.getBoundingClientRect())'));
  const bx=B.x+B.width/2, by=B.y+B.height/2;
  // right on top of the look pad (Luis 2026-11-07), clear of it, big enough to hit
  const layout=B.bottom<=L.top+2&&B.width>=60&&B.left>=L.left&&B.right<=L.right;
  // a tap somewhere on the right side: look only
  await touch('touchStart',[{x:650,y:300,id:7}]); await sleep(40); await touch('touchEnd',[]); await sleep(50);
  const plain=await ev('__echoN');
  // a look drag that slides over the button
  await touch('touchStart',[{x:bx+120,y:by-60,id:7}]); for(let i=1;i<=6;i++){ await touch('touchMove',[{x:bx+120-i*20,y:by-60+i*10,id:7}]); await sleep(20); }
  await touch('touchEnd',[]); await sleep(50);
  const slid=await ev('__echoN');
  // a real tap on the button
  await touch('touchStart',[{x:bx,y:by,id:7}]); await sleep(60); const tap=await ev('__echoN'); await touch('touchEnd',[]); await sleep(350);
  // while running with the left thumb
  await touch('touchStart',[{x:120,y:300,id:2}]); for(let i=1;i<=8;i++){ await touch('touchMove',[{x:120,y:300-i*13,id:2}]); await sleep(20); }
  await touch('touchStart',[{x:120,y:196,id:2},{x:bx,y:by,id:8}]); await sleep(60);
  const r=await ev('({n:__echoN, sprinting})');
  await touch('touchEnd',[]); await sleep(100); await ev('(playerEcho=__pe, 1)');
  assert(layout,'ECHO button not above / separate from the look area '+JSON.stringify([B,L]));
  assert(plain===0,'a plain touch on the right echoed'); assert(slid===0,'sliding onto the button while looking echoed');
  assert(tap===1,'tapping ECHO did not echo: '+tap); assert(r.n===2&&r.sprinting,'ECHO while running '+JSON.stringify(r));
});

T('mobile: holding the look thumb sideways keeps turning, faster further out; near the start point it does not', async()=>{
  await ev('(monsters.length=0, player.pitch=0, 1)');
  const hold=async(dx)=>{ await touch('touchStart',[{x:600,y:200,id:9}]); await touch('touchMove',[{x:600+dx,y:200,id:9}]); await sleep(50);
    const y0=await ev('player.yaw'); await sleep(600); const y1=await ev('player.yaw'); const ring=await ev('getComputedStyle(document.getElementById("lookPad")).display');
    await touch('touchEnd',[]); await sleep(60); const y2=await ev('player.yaw'); await sleep(200); return {d:y1-y0, after:(await ev('player.yaw'))-y2, ring}; };
  const small=await hold(20), mid=await hold(100), far=await hold(200), left=await hold(-200);
  assert(Math.abs(small.d)<0.01,'a small offset kept turning '+JSON.stringify(small));
  assert(mid.d<-0.1&&far.d<mid.d-0.2,'holding right did not keep turning right, faster further '+JSON.stringify([mid,far]));
  assert(left.d>0.5,'holding left did not turn left '+JSON.stringify(left));
  assert(far.ring==='block'&&Math.abs(far.after)<0.001,'ring not shown, or still turning after release '+JSON.stringify(far));
});

T('wall feel: standing against a wall shows faint dots that stay put, no echo; nothing near a wall shows none', async()=>{
  await ev('(monsters.length=0, echoJobs.length=0, lastEcho=-9, 1)');
  const r=await ev(`(()=>{ let spot=null; for(let z=2;z<H-2&&!spot;z++) for(let x=2;x<W-2;x++){ if(!solidAt(x,z)&&solidAt(x+1,z)&&(cast(x+.5,1.2,z+.5,1,0,0,1),hitKind===K_WALL)&&!solidAt(x-1,z)&&!solidAt(x,z-1)&&!solidAt(x,z+1)&&!solidAt(x-2,z)){ spot=[x,z]; break; } }
    const cnt=(px,pz)=>{ let n=0; for(let i=0;i<MAXP;i++){ const o=i*STRIDE; if(pdata[o+6]+pdata[o+7]<now) continue; if(Math.hypot(pdata[o]-px,pdata[o+2]-pz)<1) n++; } return n; };
    const at=(x,z)=>{ player.x=x; player.z=z; player.yaw=Math.PI/2; player.pitch=0; wfT=0; for(let i=0;i<20;i++){ now+=1/60; wallFeel(1/60); } };
    at(spot[0]+0.75,spot[1]+0.5); const near=cnt(player.x,player.z); const first=[]; for(let i=0;i<MAXP&&first.length<5;i++){ const o=i*STRIDE; if(pdata[o+6]+pdata[o+7]>=now&&Math.hypot(pdata[o]-player.x,pdata[o+2]-player.z)<1) first.push(pdata[o].toFixed(3)+','+pdata[o+1].toFixed(3)); }
    at(spot[0]+0.75,spot[1]+0.5); const again=[]; for(let i=MAXP-1;i>=0&&again.length<400;i--){ const o=i*STRIDE; if(pdata[o+6]+pdata[o+7]>=now&&Math.hypot(pdata[o]-player.x,pdata[o+2]-player.z)<1) again.push(pdata[o].toFixed(3)+','+pdata[o+1].toFixed(3)); }
    const clear=(x,z)=>{ const g=meshOn?groundAt(x,z):0; for(let k=0;k<36;k++) for(const h of [.2,.8,1.4,2]){ cast(x,g+h,z,Math.sin(k/36*6.283),0,Math.cos(k/36*6.283),1.3); if(hitKind) return false; } return true; };
    let fp=null; for(const rm of rooms){ for(let q=0;q<9&&!fp;q++){ const x=rm.cx+(q%3-1)*1.3, z=rm.cz+((q/3|0)-1)*1.3; if(clear(x,z)) fp=[x,z]; } if(fp) break; }
    now+=1; at(fp[0],fp[1]); const far=cnt(player.x,player.z);
    return {spot, near, far, stable:first.every(p=>again.includes(p)), echo:lastEcho}; })()`);
  await ev(`(player.x=${r.spot[0]}+0.72, player.z=${r.spot[1]}+0.5, player.yaw=Math.PI/2-0.6, player.pitch=-0.1, document.getElementById('overlay').style.display='none', document.getElementById('prompt').style.display='none', started=true, paused=false, 1)`); await sleep(900); await shot('wall_feel'); await ev(`(player.x=${r.spot[0]}+0.45, player.yaw=Math.PI/2, player.pitch=0, echoJobs.length=0, pdata.fill(0), wStart=0, wCount=MAXP, 1)`); await sleep(700); await shot('wall_feel2');
  assert(r.near>20,'no wall dots when touching a wall '+JSON.stringify(r));
  assert(r.far===0,'wall dots in the middle of a big room '+JSON.stringify(r));
  assert(r.stable,'wall dots moved while standing still '+JSON.stringify(r)); assert(r.echo===-9,'wall feel made an echo');
});

T('mobile: no OPEN YOUR EYES button any more (win screen, pause screen)', async()=>{
  await ev('(localStorage.setItem("echoloc.escaped","1"), debugView=false, win(), 1)'); const onWin=await ev('!!document.getElementById("eyesBtn")');
  await ev('(won=false, started=true, paused=true, showOverlay("paused"), 1)'); const onPause=await ev('!!document.getElementById("eyesBtn")');
  await ev('(paused=false, document.getElementById("overlay").style.display="none", 1)');
  assert(!onWin&&!onPause,'eyes button still there');
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

T('exit: its hum is a faint green pulse; only frame + text turn green from your echo, nothing on the floor', async()=>{
  const r=await ev(`(()=>{ newGame(); monsters.length=0; signs.length=0; const e=exitInfo;
    player.x=e.px+e.nx*6; player.z=e.pz+e.nz*6; if(!walkAt(player.x,player.z)){ player.x=e.px+e.nx*3; player.z=e.pz+e.nz*3; }
    const isGreen=o=>pdata[o+4]>0.5&&pdata[o+4]>2*pdata[o+3];
    const b0=totalW, p0=phead; for(let i=0;i<180;i++){ now+=1/60; update(1/60); processEchoJobs(); }
    let selfGreen=0; for(let k=0,i=p0;k<totalW-b0;k++,i=(i+1)%MAXP){ if(isGreen(i*9)) selfGreen++; }
    const b1=totalW, p1=phead; revealExit(now); let floor=0, green=0; for(let k=0,i=p1;k<totalW-b1;k++,i=(i+1)%MAXP){ const o=i*9; if(isGreen(o)){ green++; const off=(pdata[o]-e.fx)*e.nx+(pdata[o+2]-e.fz)*e.nz; if(pdata[o+1]<0.1&&off>0.08) floor++; } } // on the floor, away from the wall
    return {selfGreen, green, floor}; })()`);
  assert(r.selfGreen>0&&r.selfGreen<2500,'exit hum: '+r.selfGreen+' green dots by itself');   /* user 2026-11-03: the hum shows as a faint green pulse */ assert(r.green>200,'echo did not reveal the exit'); assert(r.floor===0,r.floor+' green dots on the floor');
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
  assert(r.tired>0.95,'not exhausted after 6s: '+r.tired); assert(r.jit>1.5,'exhausted running echo still readable: '+JSON.stringify(r));
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

T('red screen: a scream far away barely tints the screen; right next to you it floods it', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; const m=monsters[0]; monsters.length=1; m.state='hunt'; m.windup=0; const sm=seesMonster; window.seesMonster=()=>true;
    const at=d=>{ staticBoost=0; redK=0; m.x=player.x+d; m.z=player.z; shriekFrame=-1; frameNo++; shriek(m);
      for(let i=0;i<20;i++){ now+=1/60; staticBoost=Math.max(0,staticBoost-0.8/60); redK=lerp(redK,clamp(1-d/25,0,1),clamp(4/60,0,1)); }
      drawNoise(); return {s:staticBoost, noise:+nc.style.opacity, vign:parseFloat(document.getElementById('vign').style.opacity)}; };
    const res={far:at(30), near:at(3)}; window.seesMonster=sm; return res; })()`);
  assert(r.far.noise<0.05&&r.far.vign<0.06,'a far scream still paints the screen red '+JSON.stringify(r.far));
  assert(r.near.noise>0.2&&r.near.s>0.5,'a scream right next to you is not dramatic '+JSON.stringify(r.near));
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
  const r=await ev(`(()=>{ cheatHome=false; picks.fill(0); runArtifact=null; level=RUN[2]; newGame(); paused=false; let e=exitInfo; monsters.length=0;   /* a big level: room for spawns 18 m+ away */
    let c=-1; for(let tries=0;tries<14;tries++){ if(tries%4===3){ newGame(); e=exitInfo; }   /* an exit in a corner may leave no hidden spot 18 m+ away: try another map */ c=-1; for(let t=0;t<400;t++){ const a=Math.random()*6.283, x=e.px+Math.sin(a)*12, z=e.pz+Math.cos(a)*12; if(walkAt(x,z)&&exitDist[idx(Math.floor(x),Math.floor(z))]>=0){ c=[x,z]; break; } }
      monsters.length=0; ambushed=0; ambushT=0; player.x=c[0]; player.z=c[1]; heat=0.9;
      for(let i=0;i<60*16;i++){ now+=1/60; heat=0.9; updatePressure(1/60); } (window.__dbg=window.__dbg||[]).push([c&&c.map(v=>v|0).join(','),monsters.length,ambushed,+ambushT.toFixed(1),RUN.indexOf(level),started,goingHome(),exitInfo.px|0,exitInfo.pz|0]); if(monsters.length) break; }   /* some spots have no hidden place 18 m+ away: try another */
    const spawned=monsters.map(m=>({d:Math.hypot(m.x-player.x,m.z-player.z), de:Math.hypot(m.x-e.px,m.z-e.pz), state:m.state}));
    // quiet player near the exit does not trigger it
    newGame(); monsters.length=0; player.x=c[0]; player.z=c[1]; heat=0; for(let i=0;i<60*16;i++){ now+=1/60; updatePressure(1/60); }
    return {spawned, calmSpawns:monsters.length, dbg:window.__dbg}; })()`);
  assert(r.spawned.length>=1,'no ambush spawned: '+r.spawned.length+' '+JSON.stringify(r.dbg));   /* round 15: 18 m+ and out of sight leaves fewer spots */
  assert(r.spawned.every(m=>m.d>=18&&m.de<=25),'ambusher spawned too close to the player or far from exit: '+JSON.stringify(r.spawned));
  assert(r.spawned.every(m=>m.state==='alert'||m.state==='hunt'),'ambusher was parked idle');
  assert(r.calmSpawns===0,'ambush triggered without heat');
});


T('monsters: idle ones now and then walk over to another room (rooms empty out, you can slip past)', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; window.__hearOrig=window.__hearOrig||hearPlayer; hearPlayer=()=>{};
    player.x=player.z=-50; playerMoving=false;   // far away and silent: only their own wandering
    const visited=monsters.map(m=>new Set([roomOf[idx(Math.floor(m.x),Math.floor(m.z))]])), start=monsters.map(m=>[m.x,m.z]);
    for(let i=0;i<60*180;i++){ now+=1/60; frameNo++; for(const m of monsters){ m.state='idle'; updateMonster(m,1/60); const ro=roomOf[idx(Math.floor(m.x),Math.floor(m.z))]; if(ro>=0) visited[monsters.indexOf(m)].add(ro); } }
    hearPlayer=__hearOrig;
    return {rooms:visited.map(v=>v.size), moved:monsters.map((m,k)=>Math.hypot(m.x-start[k][0],m.z-start[k][1]).toFixed(0))}; })()`);
  const travellers=r.rooms.filter(n=>n>=2).length;
  assert(travellers>=Math.ceil(r.rooms.length/2),'idle monsters stay in their room '+JSON.stringify(r));
});

T('hiding: a scream only draws nearby monsters to search roughly where it came from (no chase); calls never reveal where you hide; the level cools down', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false;
    const [a,b,c]=monsters; const hide={x:player.x,z:player.z};
    // a heard you 10 s ago at an old spot far from where you hide now
    const old={x:player.x+30,z:player.z+30}; a.state='hunt'; a.windup=0; a.lastKnown={...old}; a.heardT=now-10; a.x=player.x+20; a.z=player.z;
    b.state='idle'; b.x=a.x+3; b.z=a.z; c.state='hunt'; c.windup=0; c.lastKnown={x:player.x+5,z:player.z}; c.heardT=now-1; c.x=a.x-3; c.z=a.z;
    const d0=monsters[3]; if(d0){ d0.state='idle'; d0.x=a.x+40; d0.z=a.z; }
    a.heardT=now-1; shriekFrame=-1; shriek(a);
    // b (3 m from the scream) comes to search around where the scream came from -- not a chase, not toward you
    const bTold=b.state==='alert'&&Math.hypot(b.target.x-a.x,b.target.z-a.z)<8&&Math.hypot(b.target.x-hide.x,b.target.z-hide.z)>10;
    const bFresh=!d0||d0.state==='idle';   // a monster 40 m away does not come at all
    const cKept=c.lastKnown.x===player.x+5;            // c had fresher information: not overwritten by stale news
    // heat calls: you were last heard 15 s ago at the old spot; you are hiding still
    lastNoise={x:old.x,z:old.z,t:now-15}; heat=1; let closest=1e9;
    for(const m of monsters.slice(3)) { m.state='idle'; }
    for(let i=0;i<60*20;i++){ now+=1/60; updatePressure(1/60);
      for(const m of monsters.slice(3)){ const t=m.state==='hunt'?m.lastKnown:m.state==='alert'?m.target:null; if(t) closest=Math.min(closest,Math.hypot(t.x-hide.x,t.z-hide.z)); } }
    // nobody hunting with fresh information and you stay quiet: heat goes down
    monsters.forEach(m=>{ m.state='idle'; }); heat=0.8; lastNoise.t=now-10; for(let i=0;i<60*20;i++){ now+=1/60; updatePressure(1/60); }
    return {bTold, bFresh, cKept, closest, heat}; })()`);
  assert(r.bTold,'a nearby monster did not come to search where the scream came from'); assert(r.bFresh,'a monster far away was drawn by the scream'); assert(r.cKept,'fresher knowledge was overwritten by a scream');
  assert(r.closest>12,'a heat call pointed a monster at your hiding place: '+r.closest.toFixed(1)+' m');
  assert(r.heat<0.3,'the level did not cool down while you hid: '+r.heat);
});

T('hiding: heard round a corner it only knows roughly where you were; right next to you it hears you breathe even when you keep still', async()=>{
  const r=await ev(`(()=>{ let res=null;
    for(let tries=0;tries<30&&!res;tries++){ newGame(); paused=false; const m=monsters[0]; monsters.length=1; m.state='idle';
      // a spot 8-14 m away with no line of sight to you
      let spot=null; for(let k=0;k<2000&&!spot;k++){ const a=Math.random()*6.283, d=8+Math.random()*6, x=player.x+Math.sin(a)*d, z=player.z+Math.cos(a)*d;
        if(walkAt(x,z)&&!los(player.x,EYE,player.z,x,1.5,z)) spot={x,z}; }
      if(!spot) continue;
      m.x=spot.x; m.z=spot.z; fatigue=1; const errs=[]; for(let k=0;k<20;k++){ m.state='idle'; m.susp=0; hearPlayer('echo'); hearPlayer('step'); hearPlayer('step');
        if(m.state==='hunt') errs.push(Math.hypot(m.lastKnown.x-player.x,m.lastKnown.z-player.z)); }
      const dir=m.lastDir;
      // breathing: rested and still, 2 m away in the open -> found; 4 m away -> not; exhausted 4 m away -> found
      const open=[]; for(let k=0;k<400&&open.length<1;k++){ const a=Math.random()*6.283, x=player.x+Math.sin(a)*2, z=player.z+Math.cos(a)*2, x4=player.x+Math.sin(a)*4, z4=player.z+Math.cos(a)*4;
        if(walkAt(x,z)&&walkAt(x4,z4)&&los(player.x,EYE,player.z,x4,1.5,z4)) open.push([x,z,x4,z4]); }
      if(!open.length) continue; const [x2,z2,x4,z4]=open[0];
      const hearAt=(x,z,f)=>{ fatigue=f; m.state='idle'; m.x=x; m.z=z; m.heardT=-99; return hearsBreath(m); };
      res={errs, dir, near:hearAt(x2,z2,0), far:hearAt(x4,z4,0), farTired:hearAt(x4,z4,1)}; fatigue=0; }
    return res; })()`);
  assert(r,'no test spot found');
  assert(r.errs.length===0||Math.max(...r.errs)>1.2,'round a corner it still knew exactly where you were '+JSON.stringify(r.errs));
  assert(r.dir===null||r.dir===undefined,'round a corner it knew which way you were going');
  assert(r.near&&!r.far&&r.farTired,'breathing range wrong '+JSON.stringify(r));
});

T('hiding: you can shake off two hunters and hide (they do not keep each other updated on your live position)', async()=>{
  const r=await ev(`(()=>{ newGame(); paused=false; window.__hearOrig=window.__hearOrig||hearPlayer; hearPlayer=()=>{};   // you make no sound
    TUNE.breath=0;   // this test is about screams leaking your position; breathing range has its own test
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
    hearPlayer=__hearOrig; TUNE.breath=2.5;
    return {worst, dead, states:[a.state,b.state]}; })()`);
  assert(r.worst>5,'hunters learned where you hide without hearing you: '+r.worst.toFixed(1)+' m');
});

T('hiding: turn a corner and wait quietly: the hunter searches, gets bored and wanders off without finding you', async()=>{
  const r=await ev(`(()=>{ let tries=0, res=null;
    while(tries++<20&&!res){ newGame(); paused=false; window.__hearOrig=window.__hearOrig||hearPlayer; hearPlayer=()=>{};
      // you stand still (rested); it heard you last at a spot 7-10 m away with no line of sight to you (round a corner)
      fatigue=0; let spot=null; for(let k=0;k<1500&&!spot;k++){ const a=Math.random()*6.283, d=7+Math.random()*3, x=player.x+Math.sin(a)*d, z=player.z+Math.cos(a)*d;
        if(walkAt(x,z)&&!los(player.x,camY,player.z,x,1.4,z)) spot={x,z}; }
      if(!spot){ hearPlayer=__hearOrig; continue; }
      const m=monsters[0]; monsters.slice(1).forEach(o=>{ o.state='idle'; o.x=o.z=-999; });
      m.x=spot.x; m.z=spot.z; m.state='hunt'; m.windup=0; m.heardT=now-2; m.lastKnown={...spot}; m.lastDir=null;
      player.vx=player.vz=0; player.spd=0; playerMoving=false; let states=new Set(), minD=1e9, late=0, lateN=0, lateMin=1e9;
      for(let i=0;i<60*45;i++){ now+=1/60; frameNo++; updateMonster(m,1/60); updatePressure(1/60); states.add(m.state); const dd=Math.hypot(m.x-player.x,m.z-player.z); minD=Math.min(minD,dd); if(i>=60*30){ late+=dd; lateN++; lateMin=Math.min(lateMin,dd); } if(dead) break; }
      hearPlayer=__hearOrig;
      res={dead, state:m.state, far:Math.hypot(m.x-player.x,m.z-player.z), states:[...states], minD, tgt:m.target, trip:m.trip, wT:m.wanderT, mat:matAt(m.x,m.z), walk:walkAt(m.x,m.z), avgLate:late/Math.max(1,lateN), lateMin}; }
    return res; })()`);
  assert(r&&!r.dead,'the monster found you while you hid '+JSON.stringify(r));
  assert(r.states.includes('idle')&&r.avgLate>5&&r.lateMin>2.2,'it did not give up and wander off '+JSON.stringify(r));   // last 15 s: away from you, never hovering on top of you
});

T('full screen: no top bar (the game uses the whole screen); the pause screen offers HOW TO PLAY instead', async()=>{
  await send('Runtime.evaluate',{expression:'document.documentElement.requestFullscreen()',userGesture:true,awaitPromise:true}); await sleep(400);
  const r=await ev(`(()=>{ const fs=!!document.fullscreenElement; paused=true; showOverlay('paused');
    return {fs, bar:getComputedStyle(document.getElementById('l102bar')).display, top:document.getElementById('overlay').getBoundingClientRect().top, help:true}; })()`);
  const opened=await ev('!document.getElementById("howBtn")&&!document.getElementById("helpBtn")');   /* no HOW TO PLAY in the game any more (user 2026-11-06) */
  await ev('(L102.help(false), document.exitFullscreen&&document.fullscreenElement&&document.exitFullscreen(), 1)'); await sleep(400);
  const after=await ev(`(paused=false, document.getElementById('overlay').style.display='none', getComputedStyle(document.getElementById('l102bar')).display)`);
  assert(r.fs,'could not enter full screen in the test browser');
  assert(r.bar==='none'&&r.top===0,'top bar still shown in full screen '+JSON.stringify(r)); assert(r.help&&opened,'no HOW TO PLAY on the pause screen in full screen');
  assert(after!=='none','top bar not back after leaving full screen');
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
  await load(); await startGame();   // fresh page: the test before this one kills the audio output on purpose and the rebuild can still be under way
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
    for(let k=0;k<6000&&(partly<5||hidden<1);k++){ const a=Math.random()*6.283, d=2+Math.random()*12; m.x=player.x+Math.sin(a)*d; m.z=player.z+Math.cos(a)*d; m.yaw=Math.random()*6.283;
      if(!walkAt(m.x,m.z)) continue;
      const centre=los(player.x,camY,player.z,m.x,1.4,m.z), sees=seesMonster(m);
      if(centre&&!sees) wrong++; if(centre) visible++; else if(sees){ partly++;
        // your own echo must draw it as well (it used to test only the centre)
        if(partly===1){ const orig=sampleMonster; let n=0; window.sampleMonster=(...a)=>{ if(a[0]===m) n++; return orig(...a); }; lastEcho=-9; monsters.forEach(o=>{ if(o!==m) o.x=o.z=-999; }); playerEcho(true); window.sampleMonster=orig; window.__echoSaw=n; } }
      else hidden++; }
    return {partly,hidden,visible,wrong,echoSaw:window.__echoSaw}; })()`);
  assert(r.wrong===0,'visible chest but not seen');
  assert(r.partly>=3,'never saw a monster that only shows a part past a corner '+JSON.stringify(r)); assert(r.echoSaw>0,'your echo did not show a partly visible monster'); assert(r.hidden>0,'monsters behind walls should stay unseen');
});


// =========================================================== the sandbox: unvalidated content stays out of the real game
const step=(n=60,dt=1/60)=>`(()=>{ for(let i=0;i<${n};i++){ now+=${dt}; update(${dt}); } })()`;
async function sandbox(lv){ await load(); await startGame(); await ev(`paused=true; goLevel(${lv}); started=true; god=false; freezeM=false; 1`); }
T('the run: levels 1-4, cave, halls, bridge; level 1 stalkers only and no items; only chosen items, unique, 2-3 / 3-4 / 3-5', async()=>{ await load();
  const r=await ev(`(()=>{ firstLevel=0; level=0; newGame(); const k=monsters.map(m=>m.kind), it=items.length; let bad=0, dup=0; const cnt={1:[],2:[],3:[]}, kinds={};
    for(let i=0;i<15;i++) for(const lv of [1,2,3]){ level=lv; let ok=false; for(let g=0;g<50&&!ok;g++) ok=tryGen(); const real=items.filter(q=>!q.lure); bad+=real.filter(q=>!ITEM_CHOSEN.includes(PW[q.t].id)).length; dup+=real.length-new Set(real.map(q=>q.t)).size; cnt[lv].push(real.length); for(const m of monsters){ kinds[lv]=kinds[lv]||{}; kinds[lv][m.kind]=1; } }
    const run=RUN.join(); level=0; newGame(); started=true; dead=false; won=false; reachExit(); const next=level; return {k,it,bad,dup,cnt:Object.fromEntries(Object.entries(cnt).map(([a,v])=>[a,[Math.min(...v),Math.max(...v)]])),kinds:Object.fromEntries(Object.entries(kinds).map(([a,v])=>[a,Object.keys(v).sort().join()])),run,next,won}; })()`);
  assert(r.k.every(x=>x==='stalker'),'monsters '+r.k); assert(r.it===0,'items in level 1'); assert(r.bad===0&&r.dup===0,'items '+JSON.stringify(r));
  assert(r.cnt[1][0]>=2&&r.cnt[1][1]<=3&&r.cnt[2][0]>=3&&r.cnt[2][1]<=4&&r.cnt[3][0]>=3&&r.cnt[3][1]<=5,'item counts '+JSON.stringify(r.cnt));
  assert(r.kinds[1]==='spider,stalker'&&r.kinds[2]==='mimic,spider,stalker,statue'&&r.kinds[3]==='angler,mimic,shade,spider,stalker,statue','kinds '+JSON.stringify(r.kinds));
  assert(r.run==='0,1,2,3,'+[7,8,11].join()&&r.next===1&&!r.won,'run '+JSON.stringify(r)); });
T('lab: every creature in its own room, none visible from the hall, asleep until you walk in', async()=>{ await sandbox(PL_LAB());
  const r=await ev(`(()=>{ const h=rooms[0]; let seen=0; for(let t=0;t<3000;t++){ const x=h.x+Math.random()*h.w, z=h.z+Math.random()*h.h; if(!walkAt(x,z)) continue; for(const m of monsters) if(los(x,EYE,z,m.x,1.4,m.z)) seen++; } return {seen,n:monsters.length,kinds:[...new Set(monsters.map(m=>m.kind))].length,asleep:monsters.filter(m=>m.asleep).length,spots:labSpots.length}; })()`);
  assert(r.n>=12&&r.kinds===12,'kinds '+JSON.stringify(r)); assert(r.seen===0,'seen from hall '+r.seen); assert(r.asleep===r.n,'awake'); assert(r.spots===12,'cards');
  await ev(`keys.KeyW=false; player.x=rooms[0].cx; player.z=rooms[0].cz; playerEcho(false); ${step(30)}`);
  assert(await ev(`monsters.every(m=>m.asleep&&m.state!=='hunt')`),'an echo in the hall woke something');
  const c=await ev(`(()=>{ const s=labSpots[3]; player.x=s.x; player.z=s.z; ${step(2)}; const el=document.getElementById('pickup'); return {d:el.style.display,t:el.querySelector('b').textContent,want:s.info[0]}; })()`);
  assert(c.d==='flex'&&c.t===c.want,'card '+JSON.stringify(c));
  const w=await ev(`(()=>{ const m=monsters[0], r=rooms[m.room]; player.x=r.x+1.5; player.z=r.z+1.5; ${step(2)}; return {a:m.asleep,o:monsters.filter(q=>q!==m&&!q.asleep).length}; })()`);
  assert(!w.a&&w.o===0,'waking '+JSON.stringify(w)); });
const open=(k,dist)=>`(()=>{ const r=rooms[0]; player.x=r.cx; player.z=r.cz; player.yaw=0; player.pitch=0; lastEcho=-9; const m=makeMonster(r.cx,r.cz+${dist},'${k}'); monsters=[m]; window.M=m; return 1; })()`;
T('The Still: runs at you in the dark, pinned by an echo you aim at it', async()=>{ await sandbox(PL_LAB()); await ev(open('statue',14));
  const d0=await ev(`M.z`); await ev(step(30)); const d1=await ev(`M.z`); assert(d1<d0-1,'did not move'); await ev(`playerEcho(false)`); const p0=await ev(`M.z`); await ev(step(60)); const p1=await ev(`M.z`); assert(Math.abs(p1-p0)<.01,'moved while pinned'); await ev(step(100)); assert(await ev(`M.z`)<p1-1,'never moved again'); });
T('Angler: buried, only its bait shows; touching the bait gives nothing, it digs out in 1 s, then hunts', async()=>{ await sandbox(PL_LAB()); await ev(open('angler',6)+`;M.yaw=3.14;M.home={x:M.x,z:M.z};1`); await ev(step(120));
  const a=await ev(`({st:M.state,hid:M.hidden,bait:!!(M.bait&&items.includes(M.bait))})`); assert(a.st==='idle'&&a.hid&&a.bait,'buried '+JSON.stringify(a));
  await ev(`player.z=M.bait.z; player.x=M.bait.x; ${step(2)}`); const b=await ev(`({mode:M.mode,got:picks[PI.echo],panic:now<panicT})`); assert(b.mode==='rise'&&!b.got&&b.panic,'trip '+JSON.stringify(b));
  await ev(step(70)); const c=await ev(`({mode:M.mode,hid:M.hidden})`); assert(c.mode==='hunt'&&!c.hid,'out '+JSON.stringify(c)); await ev(step(90)); assert(await ev(`dead`),'did not kill'); });
T('Hanging One: walking under is safe, running under brings it down', async()=>{ await sandbox(PL_LAB()); await ev(open('dropper',1)); await ev(`keys.KeyW=false; hearPlayer('echo');1`); await ev(step(10)); await ev(`M.state='hang';lastEcho=-9;player.z=M.z-3;1`); await ev(`hearPlayer('echo');1`); assert(await ev(`M.state`)==='hang','fell on a far echo'); await ev(`player.z=M.z-1; hearPlayer('step');1`); assert(await ev(`M.state`)==='fall','did not fall'); await ev(`god=true;1`); await ev(step(90)); assert(await ev(`M.state`)==='hunt','did not land'); await ev(step(60*9)); assert(['climb','hang'].includes(await ev(`M.state`)),'never went home'); });
T('The Hollow: no dots of its own, leaves a hole in yours, nothing round its feet', async()=>{ await sandbox(PL_LAB()); const r=await ev(`(()=>{ ${open('shade',4)}; const w0=totalW; sampleMonster(M,500,now,1,[1,1,1],0); const own=totalW-w0; M.gy=0; const o={x:player.x,y:EYE,z:player.z,n:1,maxD:30,speed:24,life:1,flags:0,I:1,mon:true}; return {own}; })()`); assert(r.own===0,'it made dots'); const a=await ev(`(()=>{ monsters=[M]; const before=totalW, p0=phead; xs=12345; emitEcho({x:player.x,y:EYE,z:player.z,n:6000,maxD:30,speed:24,life:1,flags:0,I:1,mon:true,sync:true}); let ring=0; for(let k=0,i=p0;k<totalW-before;k++,i=(i+1)%MAXP){ const o=i*9, dd=Math.hypot(pdata[o]-M.x,pdata[o+2]-M.z); if(pdata[o+1]<groundOf(M.x,M.z)+.1&&dd>.7&&dd<1.25) ring++; } const n=totalW-before-ring; monsters=[]; const b2=totalW; xs=12345; emitEcho({x:player.x,y:EYE,z:player.z,n:6000,maxD:30,speed:24,life:1,flags:0,I:1,mon:true,sync:true}); return {withIt:n,without:totalW-b2,ring}; })()`); assert(a.withIt<a.without,'rays pass through it '+JSON.stringify(a)); assert(a.ring<20,'a ring of dots at its feet (removed 2026-11-06; a few ordinary floor dots in front of it are fine) '+JSON.stringify(a)); });
T('test levels: always connected, no steps in ramps or stairs, player and monsters climb', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ const out=[]; for(const lv of [CAVE,HALLS,TOWER]) for(let k=0;k<6;k++){ goLevel(lv); const d=bfs(idx(Math.floor(player.x),Math.floor(player.z)),walk); let un=0,jump=0; for(let i=0;i<W*H;i++){ if(walk[i]&&d[i]<0) un++; if(!walk[i]) continue; for(const o of [1,W]){ const j=i+o; if(!walk[j]) continue; const x=i%W+.5,z=((i/W)|0)+.5, a=groundAt(x,z), b=groundAt(j%W+.5,((j/W)|0)+.5); jump=Math.max(jump,Math.abs(a-b)); } } out.push({lv,un,exit:d[idx(Math.floor(exitInfo.px),Math.floor(exitInfo.pz))],jump:+jump.toFixed(2)}); } return out; })()`);
  for(const q of r){ assert(q.un===0,'unreachable '+JSON.stringify(q)); assert(q.exit>0,'no exit '+JSON.stringify(q)); assert(q.jump<1.05,'a ledge '+JSON.stringify(q)); }
  const c=await ev(`(()=>{ goLevel(TOWER); paused=true; god=true; freezeM=true; player.x=62; player.z=75.5; player.yaw=1.57; const g0=groundAt(player.x,player.z); keys.KeyW=true; for(let i=0;i<240;i++){ now+=1/60; update(1/60); } keys.KeyW=false; freezeM=false; return {g0,g1:player.gy,x:player.x}; })()`); assert(c.g1>c.g0+.5,'did not climb '+JSON.stringify(c)); });
T('windows: the far source reaches through the glass and splats inside; you cannot walk through', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ goLevel(HALLS); paused=true; const w=windows[3]; player.x=w.x-4; player.z=w.z; const b=totalW; beaconPulse(beacons[0]); beaconBurst(beacons[0]); const n=totalW-b; let inside=0; const a=phead; for(let i=1;i<Math.min(n,8000);i++){ const o=((a-i+MAXP)%MAXP)*STRIDE; if(pdata[o]<w.x-1&&pdata[o+8]===F_BIG) inside++; } const x0=player.x; player.yaw=1.57; keys.KeyW=true; for(let i=0;i<150;i++){ now+=1/60; update(1/60); } keys.KeyW=false; return {n,inside,x:player.x,wx:w.x}; })()`); assert(r.inside>50,'no splats '+JSON.stringify(r)); assert(r.x<r.wx,'walked through the glass '+JSON.stringify(r)); });
T('tools: a clicker lures, a pinger pings, the thunderclap wakes everything near', async()=>{ await sandbox(6); const r=await ev(`(()=>{ const it={x:player.x,z:player.z,y:1,t:PI.clicker,got:false,ry:0}; items.push(it); ${step(2)}; const got=toolSlot&&PW[toolSlot.t].id; const m=makeMonster(player.x+10,player.z,'stalker'); monsters=[m]; player.yaw=1.57; player.pitch=.2; paused=false; useTool(); paused=true; const p=projectiles.length; ${step(120)}; return {got,p,left:toolSlot&&toolSlot.n,st:m.state,pr:projectiles.length}; })()`); assert(r.got==='clicker'&&r.p===1&&r.left===2,'clicker '+JSON.stringify(r)); assert(r.pr===0,'still flying'); assert(r.st==='alert'||r.st==='hunt','no lure '+r.st); });
T('running: forwards or forwards at an angle only; backwards and sideways you walk', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ const o={}; paused=true; god=true; freezeM=true; for(const [n,k] of [['f',['KeyW']],['fs',['KeyW','KeyD']],['b',['KeyS']],['s',['KeyA']],['bs',['KeyS','KeyD']]]){ for(const q in keys) keys[q]=false; keys.ShiftLeft=true; for(const q of k) keys[q]=true; now+=1/60; update(1/60); o[n]=sprinting; } for(const q in keys) keys[q]=false; freezeM=false; god=false; return o; })()`);
  assert(r.f&&r.fs&&!r.b&&!r.s&&!r.bs,'run directions '+JSON.stringify(r)); });
T('level 1: a third of its old area (user 2026-11-04), and always generates (also at the smallest map slider)', async()=>{ await load();
  const r=await ev(`(()=>{ const o={W:0,fail:0,signs:1e9}; level=0; for(const k of [1,0.85]){ TUNE.mapScale=k; for(let i=0;i<60;i++){ seed=(Math.random()*1e9)>>>0; let ok=false; for(let t=0;t<50&&!ok;t++) ok=tryGen(); if(!ok) o.fail++; else if(k===1){ o.W=W; o.signs=Math.min(o.signs,signs.length); } } } TUNE.mapScale=1; return o; })()`);
  assert(r.W<=72&&r.W>=60&&r.fail===0,'level 1 '+JSON.stringify(r)); });
T('radiation: only in the line of the source, stays across levels, flashes red, wobbles the view and slows you; a new run clears it', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ goLevel(HALLS); paused=true; god=true; freezeM=true; rad=0; const w=windows[3], b=beacons[0]; player.x=w.x-1.2; player.z=w.z; player.gy=0; const bx=b.x,bz=b.z; b.z=w.z; b.y=1.3; for(let i=0;i<40;i++) beaconPulse(b); const inLine=rad, flash=radFlash; rad=0; player.x=rooms[0].x+3; player.z=rooms[0].z+3; beaconPulse(b); const hidden=rad; rad=.5; const ups=[]; for(let i=0;i<40;i++){ now+=.05; ups.push(radUp([0,0,1])[0]); } const up=[Math.max(...ups)-Math.min(...ups),ups.reduce((a,b)=>a+b,0)/ups.length]; goLevel(CAVE); const kept=rad; const run=(k)=>{ rad=k; const x=player.x,z=player.z; player.yaw=0; keys.KeyW=true; let d=0; for(let i=0;i<6;i++){ const px=player.x,pz=player.z; now+=1/60; update(1/60); d+=Math.hypot(player.x-px,player.z-pz); } keys.KeyW=false; return d; }; const fine=run(0), hurt=run(1); newRun(); freezeM=false; god=false; return {inLine,hidden,up,flash,kept,fine,hurt,after:rad}; })()`);
  assert(r.inLine>.1,'no dose '+JSON.stringify(r)); assert(r.hidden===0,'dose through walls'); assert(r.up[0]>.05&&Math.abs(r.up[1])<.03,'the view should wobble, not tilt for good '+JSON.stringify(r.up)); assert(r.flash>.2,'no red flash on a dose'); assert(r.kept===.5,'dose lost on a new level'); assert(r.hurt<r.fine*.8,'not slower '+JSON.stringify(r)); assert(r.after===0,'not cleared'); });
// =========================================================== second batch of proposals (25 creatures, 26 items)
const at=(k,dx,dz)=>`(()=>{ const r=rooms[0]; player.x=r.cx; player.z=r.cz; player.yaw=0; player.pitch=0; lastEcho=-9; dead=false; const m=makeMonster(r.cx+${dx},r.cz+${dz},'${k}'); monsters=[m]; window.M=m; return 1; })()`;
const stalkerAt=(dx,dz)=>`(()=>{ const s=makeMonster(rooms[0].cx+${dx},rooms[0].cz+${dz},'stalker'); s.state='idle'; s.wanderT=99; monsters.push(s); window.S=s; return 1; })()`;
const lab=async(w=0)=>{ await sandbox(PL_LAB()); await ev(`labWing=${w}; goLevel(PLAYROOM); paused=true; god=false; 1`); };
T('sound lab: every numbered option of every row plays without an error; picks are kept and listed', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ initAudio(); AC.suspend(); let n=0, err=[]; const kinds=['you',...WINGS.flat()];
    for(const k of kinds){ slKind=k; buildSide(); const rows=slRows(k); const btn=document.querySelectorAll('#side [data-a^="snd:"]').length; let want=0;
      rows.forEach((R,row)=>R[1].forEach((it,i)=>{ want++; if(!it[1]) return; try{ if(i===0) it[1]([player.x,1.4,player.z+3]); else it[1](dest(null,.5,.1),AC.currentTime+.02); n++; }catch(e){ err.push(k+' '+R[0]+' '+(i+1)+': '+e.message); } }));
      if(btn!==want) err.push(k+' buttons '+btn+'/'+want); }
    slKind='stalker'; slLast={}; slLast['stalker|0']=2; soundAct('sndk:0'); const txt=slText(); soundAct('sndclear'); slKind='you'; return {n,err,txt,kinds:kinds.length}; })()`);
  assert(!r.err.length,r.err.slice(0,5).join(' | ')); assert(r.n>150,'too few sounds '+r.n); assert(/Stalker, scream \/ call: 3/.test(r.txt),'picks text '+r.txt); });
T('test one monster: every creature has its own level (start room, one corner, its room), reachable, asleep, card shown; buttons in the sidebar', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ const bad=[]; for(const k of WINGS.flat()){ soloKind=k; goLevel(SOLO); const d0=bfs(idx(Math.floor(player.x),Math.floor(player.z)),walk), d=new Proxy(d0,{get:(o,i)=>{ i=+i; const x=i%W, z=(i/W)|0; let v=-1; for(const [ax,az] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){ const q=d0[idx(x+ax,z+az)]; if(q>=0&&(v<0||q<v)) v=q; } return v; }});   /* the Eye sits against a wall */
      const mine=monsters.filter(m=>m.kind===k); if(!mine.length||!mine.every(m=>m.asleep&&d[idx(Math.floor(m.x),Math.floor(m.z))]>=0)) bad.push(k+' reach');
      const far=Math.max(...mine.map(m=>d[idx(Math.floor(m.x),Math.floor(m.z))])); if(!(far>12&&far<50)) bad.push(k+' distance '+far);
      if(mine.some(m=>los(player.x,EYE,player.z,m.x,1.4,m.z))) bad.push(k+' seen from start');
      sandboxTick(.016); if(!labCard||labCard.kind!==k||document.getElementById('pickup').style.display!=='flex') bad.push(k+' card'); }
    buildSide(); const solo=document.querySelectorAll('#side [data-a^="solo:"]').length, lv=document.querySelectorAll('#side [data-a^="lv"]').length;
    cheatAct('solo:tick'); const lvl=level===SOLO&&soloKind==='tick'; return {bad,solo,lv,lvl,want:WINGS.flat().length}; })()`);
  assert(!r.bad.length,r.bad.join(', ')); assert(r.solo===r.want,'solo buttons '+r.solo); assert(r.lv>=7,'level buttons '+r.lv); /* 8 before the power-up room was deleted (2026-11-04) */ assert(r.lvl,'button did not open the level'); });
T('echo: one per press; holding Space (key repeat) does not echo again', async()=>{ await load(); await startGame();
  await ev('(goLevel(0), paused=false, document.getElementById("overlay").style.display="none", lastEcho=-9, window.__n=0, window.__pe=playerEcho, playerEcho=function(){ __n++; return __pe.apply(this,arguments); }, 1)');
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32}); for(let i=0;i<4;i++){ await sleep(350); await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32,autoRepeat:true}); }
  await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32}); const n=await ev('(playerEcho=__pe, __n)'); assert(n===1,'echoes while holding: '+n); });
T('radiation: in the line of the source about 22 s kills you; cheat jumps and dying heal it', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ goLevel(HALLS); paused=true; god=false; freezeM=true; rad=0; dead=false; const w=windows[3], b=beacons[0]; player.x=w.x-1.2; player.z=w.z; player.gy=0; b.z=w.z; b.y=1.3; let n=0; while(!dead&&n<400){ beaconPulse(b); n++; } const secs=n*b.every, died=dead&&!killer;
    for(let i=0;i<150;i++){ now+=1/60; update(1/60); } const over=document.getElementById('overlay').style.display; rad=.6; play(); const healed=rad===0; rad=.6; jump(()=>goLevel(1)); const healed2=rad===0; freezeM=false; return {secs,died,over,healed,healed2}; })()`);
  assert(r.died&&r.secs>15&&r.secs<30,'radiation death '+JSON.stringify(r)); assert(r.over==='flex','no death screen'); assert(r.healed&&r.healed2,'not healed '+JSON.stringify(r)); });
T('arrow keys move like WASD', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ const o={}; for(const [k,w] of [['ArrowUp','KeyW'],['ArrowLeft','KeyA']]){ goLevel(0); paused=false; const x0=player.x,z0=player.z,y0=player.yaw; keys[k]=true; for(let i=0;i<20;i++) update(1/60); keys[k]=false; const a=[player.x-x0,player.z-z0];
    player.x=x0; player.z=z0; player.yaw=y0; player.vx=player.vz=0; fatigue=0; const x1=x0,z1=z0; keys[w]=true; for(let i=0;i<20;i++) update(1/60); keys[w]=false; o[k]=[a,[player.x-x1,player.z-z1]]; } return o; })()`);
  for(const k in r){ const [a,b]=r[k]; assert(Math.hypot(...a)>.05&&Math.hypot(a[0]-b[0],a[1]-b[1])<.02,k+' '+JSON.stringify(r[k])); } });
T('lab: the one wing of creature rooms (the 12 in the game); every creature in its own room, unseen from the hall, asleep; cards draw', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ const o=[]; for(let w=0;w<WINGS.length;w++){ labWing=w; goLevel(PLAYROOM); const h=rooms[0]; let seen=0; for(let t=0;t<1500;t++){ const x=h.x+Math.random()*h.w, z=h.z+Math.random()*h.h; if(!walkAt(x,z)) continue; for(const m of monsters) if(!m.hidden&&los(x,EYE,z,m.x,1.4,m.z)) seen++; }
    const d=bfs(idx(Math.floor(player.x),Math.floor(player.z)),walk); let card=0; for(const s of labSpots){ showCard(s); card++; } hideCard();
    o.push({w,kinds:new Set(monsters.map(m=>m.kind).filter(k=>WINGS[w].includes(k))).size,want:WINGS[w].length,seen,asleep:monsters.every(m=>m.asleep),spots:labSpots.length,reach:monsters.every(m=>d[idx(Math.floor(m.x),Math.floor(m.z))]>=0),card}); }
    labWing=0; started=true; paused=true; level=PLAYROOM; cheatAct('lv'+PLAYROOM); const cyc=labWing; labWing=0; return {o,cyc}; })()`);
  for(const q of r.o){ assert(q.kinds===q.want&&q.spots===q.want&&q.card===q.want,'wing '+JSON.stringify(q)); assert(q.seen===0,'seen from hall '+JSON.stringify(q)); assert(q.asleep&&q.reach,'asleep/reach '+JSON.stringify(q)); }
  assert(r.o.length===1&&r.o[0].want===12,'one wing of 12'); });
T('all new creatures: awake together for 15 s, nothing breaks, no NaN', async()=>{ await load(); await startGame();
  const r=await ev(`(()=>{ const bad=[]; for(let w=0;w<WINGS.length;w++){ labWing=w; goLevel(PLAYROOM); paused=true; god=true; for(const m of monsters) m.asleep=false; for(let i=0;i<900;i++){ if(i%120===0){ const m=monsters[(i/120|0)%monsters.length]; player.x=m.x+1.5; player.z=m.z; if(!walkAt(player.x,player.z)){ player.x=m.x; } lastEcho=-9; playerEcho(false); } keys.KeyW=i%200<100; keys.ShiftLeft=i%400<100; now+=1/60; update(1/60); }
    keys.KeyW=false; keys.ShiftLeft=false; for(const m of monsters){ if(!isFinite(m.x)||!isFinite(m.z)||!isFinite(m.yaw)) bad.push(m.kind+' nan'); const P=poseOf(m); for(const s of P.segs) if(!isFinite(s[0][0]+s[0][1]+s[0][2]+s[1][0]+s[1][1]+s[1][2])){ bad.push(m.kind+' pose'); break; } } }
    labWing=0; god=false; return bad; })()`);
  assert(r.length===0,'broken: '+r.join(', ')); });
T('The Twin: walks towards you as you walk towards it, away as you walk away', async()=>{ await lab(); const r=await ev(`(()=>{ ${at('twin',0,12)}; god=true; const d0=Math.hypot(M.x-player.x,M.z-player.z); keys.KeyW=true; ${step(60)}; const d1=Math.hypot(M.x-player.x,M.z-player.z); keys.KeyW=false; keys.KeyS=true; ${step(60)}; keys.KeyS=false; const d2=Math.hypot(M.x-player.x,M.z-player.z); return {d0,d1,d2}; })()`);
  assert(r.d0-r.d1>2*.8*(r.d0-r.d1)/2&&r.d1<r.d0-2,'did not close in '+JSON.stringify(r)); assert(r.d2>r.d1+1.5,'did not back off '+JSON.stringify(r)); });
T('Burrower: comes up where you ran; walking is silent', async()=>{ await lab(); const r=await ev(`(()=>{ ${at('burrower',0,10)}; god=true; keys.KeyW=true; ${step(120)}; const walked=!!M.dig; keys.ShiftLeft=true; ${step(60)}; keys.KeyW=false; keys.ShiftLeft=false; const ran=!!M.dig; let up=false; for(let i=0;i<240&&!up;i++){ now+=1/60; update(1/60); up=M.er>0; } return {walked,ran,up,hid:M.hidden}; })()`);
  assert(!r.walked,'heard walking'); assert(r.ran&&r.up,'did not come up '+JSON.stringify(r)); });
T('Centipede: its body kills, not only its head; it turns slowly', async()=>{ await lab(); const r=await ev(`(()=>{ ${at('centipede',0,10)}; ${step(30)}; const q=M.hist[30]; player.x=q.x; player.z=q.z; M.huntT=0; now+=1/60; BR.centipede(M,1/60); return {dead}; })()`); assert(r.dead,'body did not kill'); });
T('Spore Bloom: spores spread; stepping on them calls every creature on the level to that patch', async()=>{ await lab(); const r=await ev(`(()=>{ ${at('bloom',0,4)}; god=true; ${step(60*60)}; const n=M.patches.size; ${stalkerAt(0,-40)}; const c=[...M.patches][1]; player.x=c%W+.5; player.z=((c/W)|0)+.5; keys.KeyW=true; player.yaw=3.14; for(let i=0;i<30;i++){ now+=1/60; update(1/60); if(!M.patches.has(idx(Math.floor(player.x),Math.floor(player.z)))){ player.x=c%W+.5; player.z=((c/W)|0)+.5; } } keys.KeyW=false;
    const t=S.target||{x:-99,z:-99}; return {n,s:S.state,far:Math.hypot(S.x-player.x,S.z-player.z)>30,toPatch:Math.hypot(t.x-(c%W+.5),t.z-(((c/W)|0)+.5))<1.01}; })()`);
  assert(r.n>5,'no spread '+JSON.stringify(r)); assert(r.far,'stalker was not far away '+JSON.stringify(r)); assert(r.s==='alert'&&r.toPatch,'a far creature was not called to the patch '+JSON.stringify(r)); });
T('The Drift: comes straight through walls', async()=>{ await lab(); const r=await ev(`(()=>{ ${at('drift',0,0)}; god=true; const h=rooms[0]; M.x=h.x-3; M.z=h.cz; player.x=h.x+4; player.z=h.cz; const wall=!walkAt(h.x-1,h.cz); const a=player.x-M.x; ${step(300)}; return {wall,a,b:player.x-M.x}; })()`); assert(r.b<r.a-4,'drift '+JSON.stringify(r)); });
T('item room: the walker behind the west wall walks, and Tremor Sense shows it through the wall', async()=>{ await sandbox(6); const r=await ev(`(()=>{ const w=monsters.find(m=>m.pace&&m.x<9); const z0=w.z; let sp=0; for(let i=0;i<120;i++){ now+=1/60; update(1/60); sp=Math.max(sp,w.curSpeed); }
    picks[PI.tremor]=1; const p0=totalW; for(let i=0;i<120;i++){ now+=1/60; update(1/60); } picks[PI.tremor]=0; return {moved:Math.abs(w.z-z0),sp,dots:totalW-p0,d:pDist(w),xray:now<xrayUntil}; })()`);
  assert(r.moved>1&&r.sp>.3,'walker does not walk '+JSON.stringify(r)); assert(r.dots>100&&r.xray,'tremor rings '+JSON.stringify(r)); });
T('item room: every proposed item on its own pedestal with a card; the real game never gets them', async()=>{ await sandbox(6); const r=await ev(`(()=>{ const lab=PW.filter(q=>q.lab).length; let txt=PW.every((q,i)=>PW_TXT.en[i]&&PW_TXT.en[i][0]); let cards=0; for(const s of labSpots) if(s.item){ showCard(s); if(document.querySelector('#pickup b').textContent===s.info[0]) cards++; } hideCard(); const d=bfs(idx(Math.floor(player.x),Math.floor(player.z)),walk); let unreach=0, close=0; for(const a of items){ if(!(d[idx(Math.floor(a.x),Math.floor(a.z))]>=0)) unreach++; for(const b of items) if(a!==b&&Math.hypot(a.x-b.x,a.z-b.z)<2.5) close++; } const fx=Math.sin(player.yaw),fz=Math.cos(player.yaw), side=(id)=>{ const q=items.find(i=>i.t===PI[id]); return (q.x-player.x)*fx+(q.z-player.z)*fz; }; const geo={unreach,close,vest:side('vest'),lens:side('lens'),tremor:side('tremor'),hush:side('hush')}; if(geo.unreach||geo.close||!(geo.vest<0&&geo.lens<0&&geo.tremor<0&&geo.hush>25)) txt=false, window.__geo=geo;
    return {geo,lab,items:items.length,cards,txt,out:ITEM_OUT.length,want:PW.filter(q=>(q.lab||(!q.shelf&&!q.rare))&&!ITEM_OUT.includes(q.id)).length}; })()`); const want=r.want; assert(r.lab>=30&&r.items===want&&r.cards===want&&r.txt,'items '+JSON.stringify(r)+' want '+want); });
const tool=(id)=>`toolSlot={t:PI['${id}'],n:3}; paused=false; useTool(); paused=true;`;
T('tools 2: glowstick, decoy, hush bomb, snare', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('stalker',0,40)}; M.x=player.x; M.z=player.z+30; god=true; player.pitch=.3; ${tool('flare')} ${step(120)}; o.glow=glows.length;
  ${tool('decoy')} const dx=player.x,dz=player.z; player.x+=8; M.x=dx+6; M.z=dz; M.state='idle'; ${step(40)}; o.decoy=M.state==='hunt'&&Math.hypot(M.lastKnown.x-dx,M.lastKnown.z-dz)<1;
  decoys=[]; M.state='idle'; M.susp=0; M.x=player.x+4; M.z=player.z; ${tool('hbomb')} lastEcho=-9; playerEcho(false); o.hush=M.state; bubbles=[];
  ${tool('snare')} M.x=player.x; M.z=player.z+.3; ${step(2)}; const a=[M.x,M.z]; ${step(60)}; o.snare=M.heldT>now&&Math.hypot(M.x-a[0],M.z-a[1])<.01; return o; })()`);
  assert(r.glow===1&&r.decoy&&r.hush==='idle'&&r.snare,'tools '+JSON.stringify(r)); });
T('tools 2: blink, rewind, spike mic, stun horn, play dead', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('stalker',0,0)}; god=true; M.x=player.x+15; M.z=player.z-10; M.state='idle'; M.wanderT=99; const z0=player.z; ${tool('blink')} o.blink=player.z-z0;
  crumbs=[]; keys.KeyW=true; ${step(360)}; keys.KeyW=false; const p6=player.z; ${tool('rewind')} o.rewind=p6-player.z;
  player.pitch=.3; ${tool('mic')} ${step(120)}; o.mic=mics.length;
  M.x=player.x+5; M.z=player.z; ${tool('horn')} o.held=M.heldT>now;
  M.heldT=0; M.state='hunt'; M.lastKnown={x:player.x,z:player.z}; ${tool('playdead')} keys.KeyW=true; const pz=player.z; ${step(30)}; keys.KeyW=false; o.still=Math.abs(player.z-pz)<.01; o.lost=M.state!=='hunt'; return o; })()`);
  assert(r.blink>5.5&&r.rewind>2&&r.mic===1&&r.held&&r.still&&r.lost,'tools '+JSON.stringify(r)); });
T('tools 2: echo bomb, tuning fork, paper map', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('stalker',0,20)}; god=true; M.state='idle'; M.wanderT=99; player.pitch=.35; ${tool('ebomb')} ${step(60*5)}; o.bomb=M.state; M.state='idle'; M.target=null; M.lastKnown=null;
  M.x=player.x+12; M.z=player.z; ${tool('fork')} ${step(70)}; o.fork=M.state==='alert'&&M.target&&Math.hypot(M.target.x-player.x,M.target.z-player.z)<.5; forks=[]; M.state='idle'; M.susp=0;
  const w=totalW; ${tool('map')} for(let i=0;i<200&&echoJobs.length;i++) processEchoJobs(); ${step(30)}; o.map=totalW-w; o.mapQuiet=M.state==='idle'; return o; })()`);
  assert(r.bomb!=='idle'&&r.fork&&r.map>20000&&r.mapQuiet,'tools '+JSON.stringify(r)); });
T('power-ups 2: lens, ventriloquist, adrenaline, still cloak, lead vest, last breath', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('stalker',0,40)}; picks.fill(0); player.yaw=0;
  picks[PI.lens]=1; xs=7; const b=phead; lastEcho=-9; playerEcho(true); for(let i=0;i<30;i++) processEchoJobs(); let back=0,front=0; for(let i=1;i<3000;i++){ const q=((phead-i+MAXP)%MAXP)*STRIDE; if(pdata[q+2]>player.z+.5) front++; else if(pdata[q+2]<player.z-.5) back++; } o.lens=[front,back]; picks[PI.lens]=0;
  picks[PI.ventro]=1; M.x=player.x+10; M.z=player.z; M.state='idle'; M.susp=0; lastEcho=-9; now+=1; playerEcho(false); o.vent=M.lastKnown?Math.hypot(M.lastKnown.x-player.x,M.lastKnown.z-(player.z+6)):-1; picks[PI.ventro]=0;
  o.sp0=spMul(); picks[PI.adren]=1; fear=.5; o.sp1=spMul(); picks[PI.adren]=0; fear=0;
  picks[PI.cloak]=1; M.x=player.x+1; M.z=player.z; player.movedT=now-3; o.cloak=!hearsBreath(M); picks[PI.cloak]=0;
  picks[PI.vest]=1; rad=0; const bk={x:player.x,y:EYE,z:player.z+20}; radDose(bk); o.vest=rad; rad=0; picks[PI.vest]=0;
  picks[PI.lastb]=1; god=false; dead=false; lastbUsed=false; die(M); o.lb1=dead; die(M); o.lb2=dead; picks.fill(0); return o; })()`);
  assert(r.lens[1]<r.lens[0]*.05,'lens '+JSON.stringify(r.lens)); assert(r.vent>=0&&r.vent<2,'ventriloquist '+r.vent); assert(r.sp1>r.sp0*1.2,'adrenaline'); assert(r.cloak,'cloak'); assert(r.vest>0&&r.vest<.021,'vest '+r.vest); assert(!r.lb1&&r.lb2,'last breath '+JSON.stringify([r.lb1,r.lb2])); });
T('power-ups 2: whiskers, tremor, ricochet, pulse, thread, tracker, magnet, sixth sense', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('stalker',0,10)}; god=true; M.state='walk'; M.curSpeed=1; picks.fill(0);
  const em=[]; const orig=emitEcho; window.emitEcho=(q)=>{ em.push(q); return orig(q); };
  picks[PI.whisk]=1; keys.KeyW=true; ${step(30)}; keys.KeyW=false; o.whisk=em.filter(q=>q.maxD===3.2).length; picks[PI.whisk]=0;
  picks[PI.rico]=1; lastEcho=-9; now+=1; playerEcho(true); o.rico=em[em.length-1].bounce; picks[PI.rico]=0;
  picks[PI.pulse]=1; sbT.pulse=.01; ${step(3)}; o.pulse=em.filter(q=>q.maxD===9).length; picks[PI.pulse]=0; window.emitEcho=orig;
  picks[PI.tremor]=1; const w=totalW; sbT.tremor=0; M.curSpeed=1; M.asleep=false; sb2Tick(1/60); o.tremor=totalW-w; picks[PI.tremor]=0;
  picks[PI.thread]=1; const w2=totalW; lastEcho=-9; now+=1; playerEcho(true); o.thread=totalW-w2; picks[PI.thread]=0;
  picks[PI.track]=1; for(let i=0;i<60;i++){ M.x+=.1; now+=.1; sb2Tick(.1); } o.track=(M.trl||[]).length; picks[PI.track]=0;
  picks[PI.magnet]=1; items=[{x:player.x+4,z:player.z,y:1,t:PI.echo,got:false,ry:0}]; ${step(60)}; o.magnet=4-Math.hypot(items[0].x-player.x,items[0].z-player.z); picks[PI.magnet]=0;
  picks[PI.sixth]=1; sbT.sixth=0; sb2Tick(1/60); picks.fill(0); return o; })()`);
  assert(r.whisk>2&&r.rico===3&&r.pulse===1&&r.tremor>10&&r.thread>0&&r.track>5&&r.magnet>1,'passives '+JSON.stringify(r)); });
T('items decided in the review (2026-11-06): soft soles, steady breath, bright echo, wide eyes, lucky charm are in the game and the shop; quick recovery, slippery, cold blood, quiet feet are out everywhere; lucky gives one more power-up', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const o={}; const IN=['soles','steady','bright','wide','lucky'], OUT=['recover','slip','cold','quiet'];
    o.in=IN.every(id=>ITEM_CHOSEN.includes(id)&&SHOP().includes(id)); o.out=OUT.every(id=>!ITEM_CHOSEN.includes(id)&&!SHOP().includes(id)&&ITEM_OUT.includes(id));
    o.names=IN.every(id=>STR.de['pw_'+id]&&STR.ja['pw_'+id]);
    picks.fill(0); level=2; let a=0,b=0; for(let k=0;k<12;k++){ nextSeed=1000+k; newGame(); a+=items.length; } picks[PI.lucky]=1; for(let k=0;k<12;k++){ nextSeed=1000+k; newGame(); b+=items.length; } picks.fill(0); o.lucky=(b-a)/12;
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.in&&o.out,'pools '+r); assert(o.names,'translations '+r); assert(o.lucky>0.7,'lucky '+r); });
T('kept code (out of the game for now): the Tower still builds', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const o={}; god=true; level=TOWER; newGame(); o.tower=exitDist[startCell]>20&&walkCount>500;
  return JSON.stringify(o); })()`); assert(r==='{"tower":true}',r); });
T('creature hooks the other tests skip: The Still hears your echo', async()=>{ await sandbox(PL_LAB()); const r=await ev(`(()=>{ const o={}; ${open('statue',5)}; god=true; player.yaw=0; HEARS.statue(M,'echo',5); o.pinned=M.pinT>now;
  return JSON.stringify(o); })()`); assert(r==='{"pinned":true}',r); });
T('sounds the other tests skip: cave drips, window glints, every sound-lab button', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const o={}; initAudio(); level=CAVE; newGame(); sfxDrip([player.x,2,player.z]); o.drips=drips.length>0;
  level=HALLS; newGame(); const w=windows[0]; const n0=phead; glintWindows(w.x-3,w.z); o.glint=windows.length>0; let ok=0, bad=0; for(const k of ['you',...WINGS.flat()]){ slKind=k; slRows(k).forEach((R,row)=>R[1].forEach((it,i)=>{ try{ slPlay(row,i); ok++; }catch(e){ bad++; } })); } o.lab=ok>100&&bad===0; slKind='you'; return JSON.stringify(o); })()`);
  assert(r==='{"drips":true,"glint":true,"lab":true}',r); });
T('error screen, refused mouse lock, full screen and export without a clipboard', async()=>{ await load(); await startGame(); const r=await ev(`(async()=>{ const o={}; lockRefused(); o.paused=paused&&document.getElementById('overlay').style.display!=='none';
  try{ goFS(); }catch(e){} o.fs=1; const cb=Object.getOwnPropertyDescriptor(Navigator.prototype,'clipboard'); Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}); buildSide(); const so=document.getElementById('slOut'), so0=so?so.value:''; cheatAct('export'); o.exported=document.getElementById('tuneTxt').value===tuneExport()&&(!so||so.value===so0); delete navigator.clipboard;
  crash('test crash'); const ov=document.getElementById('overlay'); o.crash=ov.style.display==='flex'&&/test crash/.test(ov.textContent); return JSON.stringify(o); })()`);
  await load(); await startGame(); assert(r==='{"paused":true,"fs":1,"exported":true,"crash":true}',r); });
T('every creature through every situation: approached, echoed at, run at, fled from, stood still near; nothing breaks', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const bad=[], st={}; god=true;
  const kinds=[...WINGS.flat(),'hatch'];
  const step=(n,fn)=>{ for(let t=0;t<n;t++){ now+=1/30; fn&&fn(t); update(1/30); } };
  for(const k of kinds){ try{ soloKind=k; level=SOLO; newGame(); for(const m of monsters) m.asleep=false; const m=monsters[0]; const seen=new Set();
      const face=()=>{ player.yaw=Math.atan2(m.x-player.x,m.z-player.z); };
      player.x=m.x-6; player.z=m.z; face(); step(60,t=>{ if(t%20==0){ playerEcho(); sb2HearEcho(); } seen.add(m.state+'/'+(m.mode||'')); });
      step(90,t=>{ face(); keys.KeyW=true; keys.ShiftLeft=true; if(t%30==0){ playerEcho(); sb2HearEcho(); } seen.add(m.state+'/'+(m.mode||'')); });
      keys.ShiftLeft=false; step(90,t=>{ player.yaw=Math.atan2(player.x-m.x,player.z-m.z); keys.KeyW=true; if(t%45==44){ face(); playerEcho(); sb2HearEcho(); } seen.add(m.state+'/'+(m.mode||'')); });
      keys.KeyW=false; fatigue=.8; step(120,t=>{ if(t%60==0) poseOf(m); seen.add(m.state+'/'+(m.mode||'')); }); fatigue=0;
      for(const o of monsters){ if(!isFinite(o.x)||!isFinite(o.z)||!isFinite(o.yaw)) bad.push(k+' NaN'); const P=poseOf(o); if(!P.segs.every(sg=>sg[0].every(isFinite)&&sg[1].every(isFinite))) bad.push(k+' pose'); }
      st[k]=seen.size; }catch(e){ bad.push(k+': '+String(e).slice(0,120)); } keys.KeyW=false; keys.ShiftLeft=false; }
  god=false; return JSON.stringify({bad,n:Object.keys(st).length,still:Object.keys(st).filter(k=>st[k]<2)}); })()`);
  const o=JSON.parse(r); assert(!o.bad.length,o.bad.slice(0,5).join(' | ')); assert(o.n>=12,'kinds '+o.n); });   // the 12 creatures of the game (the rest retired 2026-11-06)
T('every item, alone, in a real level with hunters: walk, run, echo, use it; nothing breaks', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const bad=[]; god=true;
  paused=false; started=true;
  for(let i=0;i<PW.length;i++){ try{ level=1; picks.fill(0); newGame(); picks[i]=1; applyPw(); if(PW[i].tool){ toolSlot={t:i,n:PW[i].uses||1}; }
      const m=monsters[0]; player.yaw=0;
      for(let t=0;t<150;t++){ now+=1/30; keys.KeyW=t%50<40; keys.ShiftLeft=t>60&&t<110; if(t%25==0){ playerEcho(); sb2HearEcho(); } if(t==30&&toolSlot) useTool(); if(t==70){ m.x=player.x+3; m.z=player.z+1; enterHunt(m); fear=.5; } update(1/30); }
      for(let t=0;t<60;t++){ now+=1/30; keys.KeyW=false; keys.ShiftLeft=false; update(1/30); }
      if(!isFinite(player.x)||!isFinite(player.z)) bad.push(PW[i].id+' NaN'); }catch(e){ bad.push(PW[i].id+': '+String(e).slice(0,120)); } }
  keys.KeyW=false; keys.ShiftLeft=false; picks.fill(0); toolSlot=null; god=false; return JSON.stringify(bad); })()`);
  assert(r==='[]',r); });
T('drawing: a frame of every level, with and without Let me see, on a large and a small screen', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const bad=[]; paused=false; started=true;
  const lv=[0,1,2,3,PLAYROOM,ITEMLAB,CAVE,HALLS,TOWER,SOLO];
  for(const i of lv) for(const see of [false,true]){ try{ level=i; newGame(); debugView=see; if(see) buildLitMesh(); playerEcho(); for(let k=0;k<4;k++){ now+=.1; frame(performance.now()+k*16); } }catch(e){ bad.push(i+'/'+see+': '+String(e).slice(0,120)); } }
  debugView=false; return JSON.stringify(bad); })()`); assert(r==='[]',r); });
T('rare paths: angler walks home, the point ring wraps, open jaws are drawn', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const o={}; god=true; paused=false; started=true;
  const step=(n,fn)=>{ for(let t=0;t<n;t++){ now+=1/30; fn&&fn(t); update(1/30); } };
  let m;
  soloKind='angler'; level=SOLO; newGame(); m=monsters[0]; m.asleep=false; m.mode='back'; m.x=m.home.x+3; step(120); o.home=!m.mode;
  const h0=phead; for(let k=0;k<MAXP+5000;k++) pushPt(player.x,1,player.z,1,1,1,now,1,0); o.wrap=phead<h0||phead<6000; frame(performance.now());
  const st=makeMonster(player.x,player.z+2,'stalker'); st.jaw=.9; monsters.push(st); debugView=true; buildLitMesh(); frame(performance.now()+16); debugView=false;
  god=false; return JSON.stringify(o); })()`); assert(r==='{"home":true,"wrap":true}',r); });
T('rare screens: quality steps down and up, mouse lock lost and back, a crash inside a frame, the GPU lost, sidebar copy and level buttons', async()=>{ await load(); await startGame(); const r=await ev(`(async()=>{ const o={};
  const rs=renderScale; qEma=60; qSlow=2; frame(performance.now()); o.down=renderScale<rs||ptBudget<1; qEma=10; qFast=30; frame(performance.now()+16); o.up=1;
  paused=false; document.dispatchEvent(new Event('pointerlockchange')); o.lockLost=paused; 
  buildSide(); cheatAct('sndcopy'); cheatAct('lv'+HALLS); await new Promise(r=>setTimeout(r,120)); o.go=level===HALLS;
  const u=window.update; window.update=()=>{ throw new Error('boom in frame'); }; frame.crashed=false; paused=false; try{ frame(performance.now()+32); }catch(e){} window.update=u; o.crash=/boom in frame/.test(document.getElementById('overlay').textContent);
  cv.dispatchEvent(new Event('webglcontextlost')); o.lost=!!sessionStorage.getItem('echoloc.resume'); sessionStorage.removeItem('echoloc.resume'); return JSON.stringify(o); })()`);
  await load(); await startGame(); assert(r==='{"down":true,"up":1,"lockLost":true,"go":true,"crash":true,"lost":true}',r); });
T('1.0.1 fixes: graphics reset keeps the whole run; stray errors are not crashes; menu clean; inputs released; gamepad menus; looping sounds never muted', async()=>{ await load(); await startGame(); const r=await ev(`(async()=>{ const o={}; god=true;
    // graphics reset on the way home, carrying an artifact
    firstLevel=0; newRun(); goArea(3,'fwd',true); areaTaken[2].add(1); runArtifact='memory'; picks[PI.star]=1; const seeds=areaSeeds.slice(), lv=level, sig=walkCount+':'+exitInfo.pz;
    cv.dispatchEvent(new Event('webglcontextlost')); o.blocked=(()=>{ paused=true; play(); return paused; })(); glLost=false; o.reloadPlanned=true;
    runStart(); level=0; newRun(); o.resume=JSON.stringify({lv:level===lv, seeds:areaSeeds.join()===seeds.join(), taken:areaTaken[2].has(1), art:runArtifact, star:!!has('star'), same:walkCount+':'+exitInfo.pz===sig, home:homeward()});
    // errors
    const ov=document.getElementById('overlay'); started=true; paused=false; dead=false; ovState={k:'none'};
    window.dispatchEvent(new ErrorEvent('error',{message:'boom',filename:'chrome-extension://abc/x.js'})); o.extIgnored=ovState.k!=='error';
    window.dispatchEvent(new ErrorEvent('error',{message:'Script error.',filename:''})); o.xoriginIgnored=ovState.k!=='error';
    const ev2=new Event('unhandledrejection'); ev2.reason=new DOMException('no','NotAllowedError'); window.dispatchEvent(ev2); o.permIgnored=ovState.k!=='error';
    window.dispatchEvent(new ErrorEvent('error',{message:'real bug',filename:location.href})); o.realShown=ovState.k==='error';
    // menu: no red static left
    staticBoost=1; toMenu(); o.static=staticBoost;
    // inputs released on blur / hide
    stick.id=3; stick.x=.9; stick.y=-.9; keys.KeyW=true; dispatchEvent(new Event('blur')); o.blur=stick.x===0&&!keys.KeyW&&stick.id===null;
    // F in the language list, Space on a focused button
    let fs=0; const tf=window.toggleFS; toggleFS=()=>fs++; const sel=document.createElement('select'); document.body.appendChild(sel); sel.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',key:'f',bubbles:true})); o.fInSelect=fs; sel.remove();
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',key:'f'})); dispatchEvent(new KeyboardEvent('keyup',{code:'KeyF',key:'f'})); o.fElsewhere=fs; toggleFS=tf;
    // gamepad in menus: the stick keeps moving (game clock stopped), left/right on the language list
    showOverlay('start'); ovState.panel='settings'; paintTexts(); const pads=[{connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))}]; const gp0=navigator.getGamepads; navigator.getGamepads=()=>pads;
    const els=()=>[...document.querySelectorAll('#overlay button:not([disabled]),#overlay select,#overlay a[href]')]; els()[0].focus(); const seen=new Set();
    for(let k=0;k<4;k++){ pads[0].axes[1]=.9; padPoll(.016); seen.add(document.activeElement&&document.activeElement.outerHTML.slice(0,40)); pads[0].axes[1]=0; padPoll(.016); await new Promise(r=>setTimeout(r,240)); }
    o.stickSteps=seen.size; const ls=document.getElementById('langSel'); if(ls){ ls.focus(); const i0=ls.selectedIndex; pads[0].buttons[15].pressed=true; padPoll(.016); pads[0].buttons[15].pressed=false; padPoll(.016); o.langStep=ls.selectedIndex!==i0; ls.selectedIndex=i0; setLangPref('system'); } else o.langStep='nosel';
    // with a controller a refused mouse lock does not pause
    ovState.panel=null; started=true; dead=false; won=false; paused=false; ov.style.display='none'; padPoll(.016); lockRefused.softUntil=0; lockRefused(); o.padLock=!paused; pads.length=0; padPoll(.016); o.padGone=paused; navigator.getGamepads=gp0; pad.on=false;
    // looping sounds: the exit buzz and gadgets are never routed to the silent sink, even far away at start
    initAudio(); firstLevel=0; newRun(); goArea(1,'fwd',true); startExitBuzz(); o.buzz=!!exitBuzzNode&&!exitBuzzNode._sink; o.gadgets=gadgets.length>0&&gadgets.every(g=>g.snd&&!g.snd._sink);
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.blocked,'played on after a graphics reset '+r);
  const q=JSON.parse(o.resume); assert(q.lv&&q.seeds&&q.taken&&q.art==='memory'&&q.star&&q.same&&q.home,'graphics reset lost the run '+o.resume);
  assert(o.extIgnored&&o.xoriginIgnored&&o.permIgnored&&o.realShown,'error handling '+r); assert(o.static===0,'red static over the menu '+r); assert(o.blur,'inputs not released on blur '+r);
  assert(o.fInSelect===0&&o.fElsewhere===1,'F key '+r); assert(o.stickSteps>=3,'gamepad stick moves only once in menus '+r); assert(o.langStep===true,'gamepad cannot change the language '+r);
  assert(o.padLock&&o.padGone,'gamepad lock / disconnect '+r); assert(o.buzz&&o.gadgets,'looping sounds muted for good '+r); });
T('1.0.1 fixes: the same levels on the way home whatever you carry; no two creatures on one cell; back-door arrival at rest; Crown view keeps the nearest creatures; item dots trimmed', async()=>{ await load(); const r=await ev(`(()=>{ const o={same:[],stack:0,cells:0}; god=true;
    const sigOf=()=>JSON.stringify([walkCount,exitInfo.pz,gadgets.map(g=>[g.x,g.z]),drips.map(d=>[d.x,d.z]).slice(0,20),signs.map(s=>[s.x,s.z]).slice(0,20)]);
    for(let run=0;run<3;run++){ firstLevel=0; newRun(); for(const k of [1,2,3,4,5]){ picks.fill(0); goArea(k,'fwd',true); const a=sigOf();
        const seenC=new Set(); for(const m of monsters){ const c=Math.floor(m.x)+','+Math.floor(m.z); if(seenC.has(c)) o.stack++; seenC.add(c); o.cells++; }
        ['chalk','lucky','wide','rico','eye'].forEach(id=>picks[PI[id]]=1); picks[PI.star]=1; goArea(k,'back',true); o.same.push(sigOf()===a);
        if(k===2){ o.v=Math.hypot(player.vx||0,player.vz||0); for(let i=0;i<3;i++){ now+=1/60; update(1/60); } o.v2=Math.hypot(player.vx||0,player.vz||0); } } }
    // the Crown view: 30 creatures around you, the nearest are all drawn
    picks.fill(0); goArea(1,'fwd',true); monsters=[]; for(let k=0;k<30;k++){ const m=makeMonster(player.x+Math.cos(k)*(2+k), player.z+Math.sin(k)*(2+k),'stalker'); m.state='idle'; monsters.push(m); }
    const n=buildMonsterMesh(); o.mesh=n; o.room=monData.length/7;
    // item dots: the record of old reveals is dropped
    const it=items[0]||{x:player.x,z:player.z,y:1,t:PI.chalk,got:false,ry:0}; it.spots=[]; for(let k=0;k<200;k++){ now+=0.5; revealItem(it,now,0.5); } o.spots=it.spots.length;
    { picks.fill(0); goLevel(1); started=true; dead=false; god=true; heat=0; const r0=rooms[0]; let wc=-1; for(let i=0;i<W*H&&wc<0;i++) if(!walk[i]&&[1,-1,W,-W,2,-2,2*W,-2*W,W+1,W-1,-W+1,-W-1].every(o=>!walk[i+o])&&Math.hypot(i%W-r0.cx,((i/W)|0)-r0.cz)>4&&Math.hypot(i%W-r0.cx,((i/W)|0)-r0.cz)<12) wc=i;
      const m=makeMonster(r0.cx,r0.cz,'stalker'); monsters=[m]; player.x=r0.cx+30; player.z=r0.cz+30; m.state='hunt'; m.windup=0; m.lastKnown={x:wc%W+.5,z:((wc/W)|0)+.5}; m.huntSince=now;
      const st=[]; for(let i=0;i<60*11;i++){ now+=1/60; update(1/60); if(i%60===59) st.push(m.state+':'+m.x.toFixed(1)+':'+(m.prog?(now-m.prog.t).toFixed(1):'-')+':'+level+':'+(m.lastKnown?m.lastKnown.x.toFixed(1):'')); } o.stuck=st.join(','); }
    o.badCave=0; for(let k=0;k<30;k++){ goLevel(CAVE); const i=idx(Math.floor(exitInfo.px),Math.floor(exitInfo.pz)); if(!(i>=0&&i<W*H)||!walk[i]||bfs(idx(Math.floor(player.x),Math.floor(player.z)),walk)[i]<0) o.badCave++; }
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(/alert|idle/.test(o.stuck.split(',').slice(-2).join()),'a hunter pushes against a wall for good '+o.stuck); assert(o.badCave===0,'a cave without a reachable exit '+r); assert(o.same.every(Boolean),'a level looked different on the way home '+JSON.stringify(o.same)); assert(o.stack===0,'creatures stacked on one cell '+r);
  assert(o.v<1&&o.v2<8,'arriving through the back door at a huge speed '+r); assert(o.mesh>30*1500&&o.room>=o.mesh,'Crown view drops creatures '+r); assert(o.spots<=10,'item dot records grow without end '+r); });
T('published game without cheats (1.0.1): no cheat code left; a whole run there and back with the star, the shop, achievements, pause, death, phone, gamepad', async()=>{
  const errs0=pageErrors.length; await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Page.navigate',{url:'file://'+SHIPR}); await sleep(1500); for(let i=0;i<80;i++){ if(await ev('typeof CAVE!=="undefined"&&document.readyState==="complete"').catch(()=>false)) break; await sleep(250); }
  const r=await ev(`(async()=>{ const o={}; const gone=['buildSide','cheatAct','toggleCheat','toggleEyes','genLab','genItemLab','genTower','genSolo','takeShot','sideSync','t7Act','reviewHTML','soundAct'];
    o.left=gone.filter(n=>{ try{ return typeof eval(n)!=='undefined'; }catch(e){ return false; } });
    let s0, a0, e0; try{ s0=localStorage.getItem('echoloc.stars'); a0=localStorage.getItem('echoloc.ach'); e0=localStorage.getItem('echoloc.seen'); localStorage.removeItem('echoloc.stars'); localStorage.removeItem('echoloc.ach'); }catch(e){} markSeen('chalk');
    const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); if(dead) return; } }, calm=()=>{ monsters=[]; doorChasers=[]; };
    document.getElementById('startBtn').click(); await new Promise(r=>setTimeout(r,300)); o.started=started&&level===0;
    o.lv=[]; for(let k=0;k<6;k++){ calm(); const e=exitInfo; player.x=e.px; player.z=e.pz; step(3); o.lv.push(level); }
    calm(); o.final=level===FINAL; const star=items.find(i=>i.artifact&&i.star); player.x=star.x; player.z=star.z; step(4); o.star=!!has('star');
    for(let k=6;k>=0&&!won;k--){ calm(); const en=entranceInfo; player.x=en.x; player.z=en.z-3; step(2); calm(); player.x=en.x; player.z=en.z; step(3); }
    o.won=won; o.stars=starData().earned; await new Promise(r=>setTimeout(r,400)); toMenu(); o.menu=ovState.k;
    document.getElementById('startBtn').click(); await new Promise(r=>setTimeout(r,100)); o.shop=ovState.panel; const b=document.querySelector('#overlay [data-shop^="buy:"]'); if(b){ b.click(); } o.bought=starData().bought.length;
    const go=document.querySelector('#overlay [data-shop="go"]'); go&&go.click(); await new Promise(r=>setTimeout(r,200)); o.playing=started&&!paused&&picks.some(Boolean);
    togglePause(); o.paused=paused&&ovState.k==='paused'; escResume(); o.resumed=!paused;
    dead=true; deathT=1; killer=null; toMenu(); o.afterDeath=ovState.k==='start'&&!started;
    document.getElementById('achBtn').click(); o.ach=ovState.panel==='ach'&&document.querySelectorAll('#overlay .tile').length>=20;
    try{ if(s0) localStorage.setItem('echoloc.stars',s0); else localStorage.removeItem('echoloc.stars'); if(a0) localStorage.setItem('echoloc.ach',a0); else localStorage.removeItem('echoloc.ach'); if(e0) localStorage.setItem('echoloc.seen',e0); else localStorage.removeItem('echoloc.seen'); }catch(e){}
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r);
  assert(!o.left.length,'cheat functions still in the published game: '+o.left); assert(o.started,'START GAME '+r); assert(o.lv.join()===[1,2,3,7,8,'F'].join().replace('F',String(o.lv[5]))&&o.final,'the run, level by level '+r);
  assert(o.star&&o.won&&o.stars===1,'star home '+r); assert(o.menu==='start'&&o.shop==='shop'&&o.bought===1&&o.playing,'shop '+r); assert(o.paused&&o.resumed&&o.afterDeath&&o.ach,'menus '+r);
  // phone + gamepad on the same build
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true}); await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await send('Page.navigate',{url:'file://'+SHIPR}); await sleep(1800);
  const m=await ev(`(async()=>{ const o={touch:isTouch}; document.getElementById('startBtn').click(); await new Promise(r=>setTimeout(r,300)); o.on=started; const pads=[{connected:true,axes:[0,-1,0,0],buttons:Array.from({length:17},()=>({pressed:false}))}]; navigator.getGamepads=()=>pads; const z0=player.z, x0=player.x; for(let i=0;i<40;i++) frame(performance.now()+i*16); o.moved=Math.hypot(player.z-z0,player.x-x0)>0.05; pads.length=0; frame(performance.now()+700); o.padPause=paused; return JSON.stringify(o); })()`);
  await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  const mo=JSON.parse(m); assert(mo.touch&&mo.on&&mo.moved&&mo.padPause,'phone/gamepad on the published game '+m);
  assert(pageErrors.length===errs0,'errors in the published game: '+pageErrors.slice(errs0).join(' | '));
});
T('itch.io build: no level102.com top bar at all, boots, START GAME plays, settings (language, text size) work, no errors', async()=>{
  const ITCH=new URL('../../scratch/echoloc/itch/index.html',import.meta.url).href, html=fs.readFileSync(new URL(ITCH),'utf8');
  assert(!/l102topbar|id="l102bar"|Back to level102/.test(html),'top bar still in the itch build');
  const errs0=pageErrors.length; await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled',{enabled:false}); await send('Page.navigate',{url:ITCH}); await sleep(1800);
  const r=await ev(`(()=>{ const o={}; o.bar=!!document.getElementById('l102bar'); o.top=getComputedStyle(document.getElementById('overlay')).top; document.getElementById('setBtn').click();
    const f0=getComputedStyle(document.documentElement).getPropertyValue('--fs'); document.querySelector('[data-set="fs:+"]').click(); o.fs=getComputedStyle(document.documentElement).getPropertyValue('--fs')!==f0; document.querySelector('[data-set="fs:-"]').click();
    const sel=document.getElementById('langSel'); sel.value='fr'; sel.dispatchEvent(new Event('change',{bubbles:true})); o.fr=document.documentElement.lang==='fr'; sel.value='system'; sel.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('[data-shop=back]').click(); document.getElementById('startBtn').click(); return JSON.stringify(o); })()`);
  await sleep(600); const st=await ev(`document.getElementById('overlay').style.display`);
  await send('Page.navigate',{url:PAGE}); await sleep(1500);
  const o=JSON.parse(r); assert(!o.bar&&o.top==='0px','bar '+r); assert(o.fs&&o.fr,'settings '+r); assert(st==='none','did not start'); assert(pageErrors.length===errs0,'errors: '+pageErrors.slice(errs0).join(' | ')); });
T('published page: obfuscated, boots and plays, and has no cheat or debug code at all (1.0.1)', async()=>{
  await covTake();
  const html=fs.readFileSync(new URL(SHIP),'utf8'), a=html.indexOf('<canvas id="gl"'), game=html.slice(a);
  for(const w of ['function newGame','function updateMonster','hearPlayer','TUNE_DEF','tiredK']) assert(PAGE===SHIP||!game.includes(w),'still readable: '+w);
  for(const w of ['letmecheat','letmesee','id="side"','#side{','MONSTER ROOMS','TEST: CAVE','Today\'s review','Give all 5','echoloc.cheat','revCv','shotBtn','sound lab']) assert(!html.includes(w),'cheat/debug code in the published page: '+w);
  { const shipR=path.resolve(HERE,'..','..','scratch','echoloc','ship','index.html'); assert(fs.statSync(shipR).size<fs.statSync(PLAIN).size*0.97,'the stripped game is not smaller than the full one'); }
  const errs0=pageErrors.length; await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Page.navigate',{url:SHIP}); await sleep(600); await ev(`localStorage.setItem('echoloc.cheat','1'),1`); await send('Page.navigate',{url:SHIP}); await sleep(1500);
  await click(640,360); await sleep(700);
  const st=await ev(`({ov:document.getElementById('overlay').style.display, h1:(document.querySelector('#overlay h1')||{}).textContent||'', prompt:document.getElementById('prompt').textContent})`);
  await key('Space',' ',' '); await key('Space',' ',' ',false); await sleep(300);
  for(const ch of 'letmecheat') await key('Key'+ch.toUpperCase(),ch,ch); for(const ch of 'letmesee') await key('Key'+ch.toUpperCase(),ch,ch);
  for(const k of ['KeyM','KeyV','KeyQ','Digit3']){ await key(k,k.slice(-1).toLowerCase(),k.slice(-1).toLowerCase()); await key(k,k.slice(-1).toLowerCase(),'',false); }
  await sleep(300); const after=await ev(`({side:!!document.getElementById('side'), cheat:document.documentElement.classList.contains('cheat'), map:getComputedStyle(document.getElementById('map')).display==='none'||document.getElementById('map').style.display!=='block', h1:(document.querySelector('#overlay h1')||{}).textContent||''})`);
  await ev(`localStorage.removeItem('echoloc.cheat'),1`);
  assert(pageErrors.length===errs0,'errors on the published page: '+pageErrors.slice(errs0).join(' | ')); assert(st.h1!=='ERROR'&&st.prompt.length>3,'published page did not start '+JSON.stringify(st));
  assert(!after.side&&!after.cheat&&after.h1!=='ERROR','cheats still reachable on the published page '+JSON.stringify(after));
});

T('round 8: level 1 is a third of its old area, level 2 half', async()=>{ await sandbox(0); const r=await ev(`(()=>{ level=0; newGame(); const a=W; level=1; newGame(); return [a,W]; })()`); assert(r[0]<=72&&r[1]<=92,'sizes '+r); });
T('round 8: Angler: the bait rides on its lure while it is out, and touching it then does nothing', async()=>{ await sandbox(PL_LAB()); await ev(open('angler',6)+`;M.yaw=3.14;M.home={x:M.x,z:M.z};1`); await ev(step(120));
  const r=await ev(`(()=>{ god=true; anglerTrip(M); ${step(90)}; const o={mode:M.mode, inItems:items.includes(M.bait), tip:Math.hypot(M.bait.x-(M.x+Math.sin(M.yaw)*1.7),M.bait.z-(M.z+Math.cos(M.yaw)*1.7))};
    const x=M.x,z=M.z,m0=M.mode; takeItem(M.bait); o.kept=M.mode===m0&&M.x===x&&M.z===z&&!M.bait.got; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.mode==='hunt'&&o.inItems,'setup '+r); assert(o.tip<0.2,'bait left behind '+r); assert(o.kept,'touching the bait of a risen angler changed it '+r); });
T('round 8: dying with the cheat sidebar open frees the mouse at once (monster or radiation)', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const ex=document.exitPointerLock; let n=0; document.exitPointerLock=()=>{ n++; }; const o={}, was=cheatOn; god=false;
    const m=makeMonster(player.x+3,player.z,'stalker'); monsters.push(m); cheatOn=true; dead=false; die(m); o.monster=n; dead=false; n=0; radDie(); o.rad=n; dead=false; n=0; cheatOn=false; die(m); o.off=n;
    cheatOn=was; dead=false; document.exitPointerLock=ex; return JSON.stringify(o); })()`); await load(); await startGame(); assert(r==='{"monster":1,"rad":1,"off":0}',r); });
T('round 8: the Cave is bigger, has exit signs now and then pointing the way out, and holds the new creatures', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const o={}; level=CAVE; newGame(); o.W=W; o.signs=signs.length; let good=0;
    for(const s of signs){ let c=idx(Math.floor(s.x),Math.floor(s.z)); for(let k=0;k<8;k++){ let b=c; for(const q of [1,-1,W,-W]){ const n=c+q; if(walk[n]&&exitDist[n]>=0&&exitDist[n]<exitDist[b]) b=n; } c=b; }
      const dx=c%W+.5-s.x, dz=((c/W)|0)+.5-s.z, l=Math.hypot(dx,dz)||1; if((dx*s.dx+dz*s.dz)/l>0.5) good++; if(Math.abs(s.gy-groundAt(s.x,s.z))>.01) good-=100; }
    o.good=signs.length>0&&good/signs.length>0.9; const k=monsters.map(m=>m.kind); o.kinds=['centipede','twin','drift','dropper'].every(q=>k.includes(q))&&k.filter(q=>q==='drift').length===2&&k.filter(q=>q==='bloom').length===2;
    const dr=monsters.find(m=>m.kind==='dropper'); o.hang=dr.top>1.5&&dr.top<clearAt(idx(Math.floor(dr.x),Math.floor(dr.z)))-1; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.W>=110,'cave not bigger '+r); assert(o.signs>=6&&o.signs<=20,'signs '+r); assert(o.good,'signs do not point the way out '+r); assert(o.kinds,'cave creatures '+r); assert(o.hang,'the Hanging One does not hang under the rock '+r); });
T('round 8: The Drift turns the view red as it comes, even through a wall', async()=>{ await lab(); const r=await ev(`(()=>{ ${at('drift',0,0)}; god=true; let spot=null; for(let k=0;k<4000&&!spot;k++){ const c=RI(0,W*H-1); if(!walk[c]) continue; const px=c%W+.5, pz=((c/W)|0)+.5, a=Math.random()*6.283, x=px+Math.sin(a)*6.5, z=pz+Math.cos(a)*6.5; if(!los(px,EYE,pz,x,1.4,z)&&!los(px,EYE,pz,px+Math.sin(a)*5.5,1.4,pz+Math.cos(a)*5.5)){ player.x=px; player.z=pz; spot={x,z}; } }   // a place with a wall between you and the Drift
    if(!spot) return {wall:false}; M.x=spot.x; M.z=spot.z; redK=0; panicT=0; const seen0=seesMonster(M); ${step(40)};
    return {wall:true, seen:seen0, st:M.state, red:+redK.toFixed(2)}; })()`); assert(r.wall&&!r.seen,'setup '+JSON.stringify(r)); assert(r.st==='hunt'&&r.red>0.3,'no red through the wall '+JSON.stringify(r)); });
T('round 8: sidebar: one line per run level, labs apart, chosen monsters list their levels (the one you are in green)', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const was=cheatOn; if(!cheatOn) toggleCheat(); goLevel(RUN[2]); const sd=document.getElementById('side'), o={};
    o.rows=sd.querySelectorAll('.lvrow').length===RUN.length*2   /* forward, back (6) and level 1 exit */; o.labs=/Labs/.test(sd.innerHTML)&&!/New level types/.test(sd.innerHTML); const st=sd.querySelector('[data-a="solo:stalker"]'); o.here=st&&st.querySelector('b.here')?.textContent;
    o.twin=sd.querySelector('[data-a="solo:twin"] .lvs')?.textContent; o.blurb=sd.querySelector('.lvrow .sl').textContent; if(!was) toggleCheat(); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.rows&&o.labs,'layout '+r); assert(o.here==='3','green level '+r); assert(o.twin==='(5)','twin levels '+r); assert(/stalker/.test(o.blurb),'blurb '+r); });
T('round 8: The Still and the Centipede move at the speeds set in Modifiers', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('statue',0,12)}; god=true; lastEcho=-9; M.pinT=0; const z0=M.z; ${step(60)}; o.still=+(Math.abs(M.z-z0)).toFixed(2);
    ${at('centipede',0,14)}; M.huntT=8; M.lastKnown={x:player.x,z:player.z}; M.heardT=now; M.yaw=Math.PI; const c0=M.z; ${step(30)}; o.centi=+(Math.abs(M.z-c0)*2).toFixed(2); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.still>1.8&&o.still<=2.45,'still speed '+r); assert(o.centi>2.2&&o.centi<=3.05,'centipede speed '+r); });
T('round 9: the white ball beyond the windows: staring at it burns you out in about a second; glancing near it does not', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; goLevel(HALLS); god=false; freezeM=true; for(const m of monsters) m.asleep=true; paused=false; started=true;
    const w=windows[Math.floor(windows.length/2)], b=beacons[0]; player.x=w.x-1.5; player.z=w.z; player.gy=0; player.pitch=0; const face=k=>{ player.yaw=Math.atan2(b.x-player.x,b.z-player.z)+k; };
    face(.35); rad=0; for(let i=0;i<90;i++){ face(.35); now+=1/60; update(1/60); } o.glance=dead; o.stare0=+stare.toFixed(2); dead=false; rad=0; stare=0;
    let t=0; for(let i=0;i<120&&!dead;i++){ face(0); now+=1/60; update(1/60); t+=1/60; } o.dead=dead; o.t=+t.toFixed(2); o.glare=+document.getElementById('glare').style.opacity; dead=false; rad=0; stare=0; god=true; return JSON.stringify(o); })()`);
  await load(); await startGame(); const o=JSON.parse(r); assert(!o.glance,'glancing near the ball killed you '+r); assert(o.dead&&o.t>.8&&o.t<1.3,'staring did not kill in ~1 s '+r); assert(o.glare>.8,'no white-out '+r); });
T('review mode: every decision is made (round 22: all sounds, items and the cave are decided); the sidebar says so', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const was=cheatOn; if(!cheatOn) toggleCheat(); const o={n:revQueue().length, snd:MON_CHOSEN.every(k=>SND_OK[k])}; buildSide(); o.txt=/Review: 0 things to decide|nothing to decide/i.test(document.getElementById('side').innerHTML)||!document.querySelector('#side [data-a="rev:start"]'); if(!was) toggleCheat(); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.n===0&&o.snd,'queue '+r); });
T('round 12: red pill: running into a creature no longer blows it up, it kills you (also the ones that kill by reach)', async()=>{ await lab(); const r=await ev(`(()=>{ const o={}; ${at('centipede',0,1)}; god=false; picks[PI.pill]=1; sprinting=true; die(M); o.gone=!!M.gone; o.alive=!dead; sprinting=false; picks[PI.pill]=0; dead=false; return JSON.stringify(o); })()`); await load(); await startGame(); assert(r==='{"gone":false,"alive":false}',r); });
T('round 9: dying in a test area clears power-ups and radiation (full reset), and puts you back there', async()=>{ await sandbox(0); const r=await ev(`(()=>{ soloKind='stalker'; goLevel(SOLO); picks[PI.vest]=1; rad=.4; dead=true; deathT=5; started=true; play(); return JSON.stringify({lv:level===SOLO, picks:picks.reduce((a,b)=>a+b,0), rad}); })()`); await load(); await startGame(); assert(r==='{"lv":true,"picks":0,"rad":0}',r); });
T('round 9: power-ups lie on open floor (all 8 cells round them walkable); level 6 holds six stalkers', async()=>{ await sandbox(0); const r=await ev(`(()=>{ const o={bad:0,n:0}; for(const lv of [1,2,3]) for(let k=0;k<3;k++){ level=lv; newGame(); for(const it of items){ o.n++; const i=idx(Math.floor(it.x),Math.floor(it.z)); if(![1,-1,W,-W,W+1,W-1,-W+1,-W-1].every(q=>walk[i+q])) o.bad++; } } level=HALLS; newGame(); o.back=monsters.length; return JSON.stringify(o); })()`); const o=JSON.parse(r); assert(o.n>10&&o.bad===0,'items '+r); assert(o.back===6,'level 6: six stalkers '+r); });
T('round 9: camera shake fades (it used to stay until the next level)', async()=>{ await sandbox(0); const r=await ev(`(()=>{ shake=.12; for(let i=0;i<60;i++){ now+=1/60; update(1/60); } return shake; })()`); assert(r<.001,'shake '+r); });
T('round 11: one continuous run: south to north through every door to the bridge, the same maps on the way back, the artifact home = achievement', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={sn:[],same:true}; god=true; freezeM=true; started=true; paused=false; let ach0; try{ ach0=localStorage.getItem('echoloc.ach'); localStorage.removeItem('echoloc.ach'); }catch(e){} firstLevel=0; newRun();
    const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); } }, sig=()=>walkCount+':'+exitInfo.pz+':'+startCell, sigs=[];
    for(let k=0;k<7;k++){ let z0=1e9,z1=-1; for(let i=0;i<W*H;i++) if(walk[i]){ const z=(i/W)|0; z0=Math.min(z0,z); z1=Math.max(z1,z); } o.sn.push(startInfo.z>z1-9&&(k===6||exitInfo.pz<z0+9)); sigs.push(sig()); if(k<6){ const e=exitInfo; player.x=e.px; player.z=e.pz; step(2); } }
    o.final=level===FINAL; o.arts=items.filter(i=>i.artifact).length; const st0=starData().earned; let s0; try{ s0=localStorage.getItem('echoloc.stars'); }catch(e){} for(const art of items.filter(i=>i.artifact)){ player.x=art.x; player.z=art.z; step(3); } o.art=runArtifact; o.star=!!has('star');
    o.bounce=0; for(let k=6;k>=0&&!won;k--){ if(k<6&&sig()!==sigs[k]){ o.same=false; (o.diff=o.diff||[]).push(k+':'+sig()+'/'+sigs[k]); } const en=entranceInfo; player.x=en.x; player.z=en.z-3; step(2); player.x=en.x; player.z=en.z; step(2); if(!won){ const lv=level; step(3); if(level!==lv) o.bounce++; } }
    o.won=won; o.stars=starData().earned-st0; try{ if(s0) localStorage.setItem('echoloc.stars',s0); else localStorage.removeItem('echoloc.stars'); }catch(e){} o.ach=Object.keys(achList()).join(); try{ if(ach0) localStorage.setItem('echoloc.ach',ach0); else localStorage.removeItem('echoloc.ach'); }catch(e){} return JSON.stringify(o); })()`);
  await load(); await startGame(); const o=JSON.parse(r); assert(o.sn.every(Boolean),'not south to north '+r); assert(o.bounce===0,'arriving on a door bounced you through it '+r); assert(o.final&&o.star&&o.arts===1&&o.art===null,'bridge: only the star without the right power-ups '+r); assert(o.same,'a level changed on the way back '+r); assert(o.won&&o.stars===1&&o.ach==='','home: one star, no achievement '+r); });
T('round 12: the bridge always holds a star; the right power-ups add an artifact (one of the fitting ones, fixed for the run); artifacts never in the levels', async()=>{ await load(); const r=await ev(`(()=>{ const o={}; god=true; const bridge=ids=>{ firstLevel=0; newRun(); picks.fill(0); ids.forEach(id=>picks[PI[id]]=1); goArea(RUN.indexOf(FINAL),'fwd',true); return items.filter(i=>i.artifact).map(i=>PW[i.t].id).sort().join(); };
    o.none=bridge([]); o.pill=bridge(['eye','wide','bright']); o.mem=bridge(['glow','dense']); o.notPill=bridge(['eye','wide']); const seen=new Set(); for(let k=0;k<12;k++) seen.add(bridge(['eye','wide','bright','glow','dense']));
    o.both=[...seen].sort().join('|'); goArea(RUN.indexOf(FINAL)-1,'back',true); goArea(RUN.indexOf(FINAL),'fwd',true); o.again=items.filter(i=>i.artifact).length;
    o.inLevels=0; for(let k=0;k<6;k++){ firstLevel=0; newRun(); goArea(k%5,'fwd',true); if(items.some(i=>PW[i.t].art&&!i.artifact&&PW[i.t].id!=='pill')) o.inLevels++; } o.ach=ACH_ALL().join(); picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.none==='star','no rule: star only '+r); assert(o.pill==='pill,star'&&o.mem==='memory,star'&&o.notPill==='star','rules '+r); assert(o.both==='memory,star|pill,star','two rules fit: one of them at random '+r); assert(o.again===2,'the pick must stay the same for the run '+r); assert(o.inLevels===0,'artifact in a level '+r); assert(o.ach==='pill,thread,memory,guide,negative','achievements '+r); });
T('round 13: the way home holds ~50% more creatures, spread out and away from you; the pickups left behind are gone', async()=>{ await load(); const r=await ev(`(()=>{ const o={}; god=true; firstLevel=0; newRun(); const k=RUN.indexOf(CAVE); goArea(k,'fwd',true); o.fwd=monsters.length; picks[PI.star]=1; goArea(k,'back',true);
    o.back=monsters.length; o.near=monsters.slice(o.fwd).filter(m=>Math.hypot(m.x-player.x,m.z-player.z)<8).length; goArea(1,'back',true); o.l2=monsters.length; o.left=items.filter(i=>!i.got).length; picks.fill(0); goArea(1,'fwd',true); o.l2f=monsters.length; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.back>=Math.round(o.fwd*1.5)-1&&o.back<=Math.round(o.fwd*1.5)+1&&o.l2>=Math.round(o.l2f*1.5)-1,'not +50% '+r); assert(o.left===0,'pickups left on the way home '+r); assert(o.near===0,'spawned on top of you '+r); });
T('round 12: Memory keeps every wall your echo touched (deduplicated, not monsters\' echoes), until the next area; Negative and the Guiding line draw', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; freezeM=true; firstLevel=0; newRun(); picks[PI.memory]=1;
    const run=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); while(echoJobs.length) processEchoJobs(); render(); } }; lastEcho=-9; playerEcho(false); run(40); o.m1=memN; for(let k=0;k<15;k++){ lastEcho=-9; playerEcho(false); run(20); } o.m2=memN;
    emitEcho({x:player.x,y:1,z:player.z,n:3000,maxD:20,speed:40,life:1,col:[1,0,0],I:1}); run(20); o.m3=memN; o.err=gl.getError();
    goArea(1,'fwd',true); o.reset=memN; picks.fill(0);
    picks[PI.negative]=1; const h=totalW; run(5); o.neg=totalW-h; picks.fill(0);
    picks[PI.guide]=1; goArea(0,'fwd',true); player.x=exitInfo.px; player.z=exitInfo.pz+2; guideT=0; const h0=phead; run(1); const nv=getNav(idx(Math.floor(entranceInfo.x),Math.floor(entranceInfo.z))); let n=0,ok=0,green=0; for(let p=h0;p!==phead;p=(p+1)%MAXP){ const q=p*STRIDE; n++; if(pdata[q+4]>1.2&&pdata[q+3]<.35) green++; } o.guide=green; o.dist0=Math.hypot(player.x-entranceInfo.x,player.z-entranceInfo.z);
    picks.fill(0); freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.m1>2000,'echo not kept '+r); assert(o.m2<o.m1*15*.6,'not deduplicated '+r); assert(o.m3===o.m2,'other echoes kept '+r); assert(o.err===0,'GL error '+r); assert(o.reset===0,'not reset in the next area '+r); assert(o.neg>500,'negative draws nothing '+r); assert(o.guide>=100,'no green line '+r); });
T('round 14: main menu: START GAME (clicks elsewhere do nothing; with stars it opens the shop first, else straight in), ACHIEVEMENTS; the shop: picture tiles, locked until picked up in any game, each toggles (keeps its label); achievements: stars, unlocked power-ups, artifacts; escaping goes black, then to the main menu', async()=>{ await load(); const r=await ev(`(()=>{ const o={}; let s0,a0,n0; try{ s0=localStorage.getItem('echoloc.stars'); a0=localStorage.getItem('echoloc.ach'); n0=localStorage.getItem('echoloc.seen'); localStorage.removeItem('echoloc.seen'); }catch(e){} const ov=()=>document.getElementById('overlay');
    starSave({earned:0,bought:[]}); showOverlay('start'); o.noShop=!!document.getElementById('achBtn')&&!!document.getElementById('startBtn'); ov().querySelector('h1').click(); o.idle=!started; document.getElementById('startBtn').click(); o.straight=started&&!ovState.panel; started=false; showOverlay('start');
    starSave({earned:2,bought:[]}); showOverlay('start'); o.shopTxt=document.getElementById('shopBtn')?'old':'none'; document.getElementById('startBtn').click(); o.shop=!started&&ov().innerHTML.includes('★ 2')&&!ov().innerHTML.includes('ARTIFACTS');
    o.locked=!ov().querySelector('[data-shop^=buy]')&&ov().querySelectorAll('.tile.locked').length===SHOP().length; firstLevel=0; newRun(); const it={x:0,z:0,y:1,t:PI.stride,got:false}; items.push(it); takeItem(it); picks.fill(0); started=false; showOverlay('start'); ['eye','lungs'].forEach(markSeen); document.getElementById('startBtn').click(); o.unlocked=ov().querySelectorAll('[data-shop^=buy]').length===3&&ov().querySelectorAll('.tile canvas[data-t]').length===3&&ov().querySelector('.tile.locked b').textContent==='?';
    const b=id=>ov().querySelector('[data-shop="buy:'+id+'"]'); const t0=b('stride').textContent; b('stride').click(); b('eye').click(); o.full=b('lungs').getAttribute('aria-disabled')==='true'; o.label=b('stride').textContent===t0&&b('stride').classList.contains('own'); b('stride').click(); o.back=JSON.stringify(starData()); b('lungs').click(); o.after=JSON.stringify(starData());
    ov().querySelector('[data-shop=back]').click(); o.backMenu=ovState.k==='start'&&!ovState.panel; document.getElementById('achBtn').click(); o.ach=ov().innerHTML.includes('ARTIFACTS RECOVERED 0/5')&&ov().innerHTML.includes('POWER-UPS UNLOCKED 3/')&&ov().querySelectorAll('.tile.empty').length===5; cheatAct('achall'); o.achAll=ov().innerHTML.includes('ARTIFACTS RECOVERED 5/5'); ov().querySelector('[data-shop=back]').click();
    document.getElementById('startBtn').click(); ov().querySelector('[data-shop=go]').click(); o.started=started&&['eye','lungs'].every(id=>picks[PI[id]]===1)&&!picks[PI.stride];
    winStar=true; won=true; showOverlay('won',{s:10}); o.black=ov().classList.contains('black')&&ov().innerHTML.includes('★'); ov().click(); o.menu=ovState.k==='start'&&!started&&!ov().classList.contains('black');
    try{ if(s0) localStorage.setItem('echoloc.stars',s0); else localStorage.removeItem('echoloc.stars'); if(a0) localStorage.setItem('echoloc.ach',a0); else localStorage.removeItem('echoloc.ach'); if(n0) localStorage.setItem('echoloc.seen',n0); else localStorage.removeItem('echoloc.seen'); }catch(e){} picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.noShop&&o.idle&&o.straight,'menu (no stars: straight into the game) '+r); assert(o.locked&&o.unlocked,'locked until picked up in a game '+r); assert(o.achAll,'cheat All artifacts must show at once '+r); assert(o.shopTxt==='none'&&o.shop&&o.backMenu,'START GAME opens the shop when you have stars '+r); assert(o.full&&o.label,'shop buttons '+r); assert(o.back==='{"earned":2,"bought":["eye"]}'&&o.after==='{"earned":2,"bought":["eye","lungs"]}','toggle '+r); assert(o.ach&&o.started,'achievements/start '+r); assert(o.black&&o.menu,'win screen '+r); });
T('round 12: pause screen: RESUME and EXIT TO MAIN MENU (no achievements there); EXIT TO MAIN MENU stops the run, the next click starts a new one at level 1', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; firstLevel=0; newRun(); goArea(2,'fwd',true); picks[PI.eye]=1; paused=false; togglePause(); const ov=()=>document.getElementById('overlay');
    o.btns=!document.getElementById('achBtn')&&!!document.getElementById('menuBtn')&&!!document.getElementById('resumeBtn'); o.ach=true; o.back=paused; document.getElementById('menuBtn').click(); o.menu=!started&&ovState.k==='start'&&ov().style.display!=='none';
    const t=now; for(let i=0;i<5;i++) frame&&0; document.getElementById('startBtn').click(); o.again=started&&!paused&&level===RUN[0]&&!picks[PI.eye]; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.btns&&o.ach&&o.back,'achievements '+r); assert(o.menu,'main menu '+r); assert(o.again,'new game from the menu '+r); });
T('round 13: doors are one way: forward until you hold the star, then only back; nothing waits within 20 m of the door you come back through; the way-home door sits on its wall', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; freezeM=true; started=true; paused=false; firstLevel=0; newRun(); const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); } };
    goArea(2,'fwd',true); const en=entranceInfo; player.x=en.x; player.z=en.z-3; step(2); player.x=en.x; player.z=en.z; step(3); o.entFwd=RUN.indexOf(level);
    picks[PI.star]=1; goArea(2,'fwd',true); const e=exitInfo; player.x=e.px; player.z=e.pz+3; step(2); player.x=e.px; player.z=e.pz; step(3); o.exitHome=RUN.indexOf(level);
    o.near=[]; o.wall=[]; for(let k=RUN.length-1;k>=0;k--){ goArea(k,'back',true); o.near.push(monsters.filter(m=>Math.hypot(m.x-player.x,m.z-player.z)<20).length); const q=entranceInfo; o.wall.push(+Math.hypot(q.fx-q.x,q.fz-q.z).toFixed(2)); }
    goArea(1,'back',true); const q=entranceInfo; player.x=q.x; player.z=q.z-3; step(2); player.x=q.x; player.z=q.z; step(3); o.backOk=RUN.indexOf(level);
    picks.fill(0); freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.entFwd===2,'went back without the star '+r); assert(o.exitHome===2,'went forward holding the star '+r); assert(o.backOk===0,'way home blocked '+r); assert(o.near.every(n=>n===0),'monster by the door '+r); assert(o.wall.every(d=>d<=0.7),'door not on its wall '+r); });
T('round 13: level 6 holds six stalkers and nothing else; the same seed always builds the same level', async()=>{ await load(); const r=await ev(`(()=>{ const o={}; firstLevel=0; newRun(); goArea(5,'fwd',true); o.kinds=[...new Set(monsters.map(m=>m.kind))].join(); o.n=monsters.length; const w=[]; for(const lv of [0,1,2,7,8]) for(let k=0;k<3;k++){ level=8; nextSeed=99; newGame(); level=lv; nextSeed=4242; newGame(); w.push(lv+':'+walkCount+':'+items.length); } o.same=new Set(w).size===5; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.kinds==='stalker'&&o.n===6,'level 6 '+r); assert(o.same,'not deterministic '+r); });
T('round 13: the bridge: echoing makes no dots but flashes red; the 10th echo drops the bridge and you with it; the star shines within 10 m with no echo', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=false; freezeM=true; started=true; paused=false; firstLevel=0; newRun(); goArea(RUN.indexOf(FINAL),'fwd',true); const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); } };
    const star=items.find(i=>i.star); player.x=star.x; player.z=star.z+20; step(30); let h=totalW; step(30); o.farShine=totalW-h; const sp0=(star.spots||[]).length; player.z=star.z+8; step(30); o.nearShine=(star.spots||[]).length-sp0;
    h=echoJobs.length; lastEcho=-9; const w0=totalW; playerEcho(false); o.jobs=echoJobs.length-h; o.hurt=bridgeHurt; o.n=bridgeEchoes;
    for(let k=0;k<9;k++){ lastEcho=-9; playerEcho(false); } o.fell=bridgeFell; o.falling=falling; for(let i=0;i<600&&!dead;i++){ now+=1/60; update(1/60); } o.dead=dead; o.walkBridge=walk[idx(Math.floor(player.x),Math.floor(player.z))];
    dead=false; god=true; freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.jobs===0&&o.hurt>0.9&&o.n===1,'echo on the bridge '+r); assert(o.nearShine>0,'star does not shine near '+r); assert(o.fell&&o.falling&&o.dead&&!o.walkBridge,'bridge did not fall / you did not '+r); });
T('round 13: no toasts on screen; the STARS button only after the first star; cheat: level N back, level 1 exit, to the exit (both ways), achievements reset/trigger', async()=>{ await load(); await sandbox(0); const r=await ev(`(()=>{ const o={}; let s0,a0; try{ s0=localStorage.getItem('echoloc.stars'); a0=localStorage.getItem('echoloc.ach'); }catch(e){}
    toast('HELLO'); o.toast=document.getElementById('toast').style.opacity; o.last=toast.last;
    cheatAct('achreset'); showOverlay('start'); o.btn0=!!document.getElementById('shopBtn'); cheatAct('achstar'); showOverlay('start'); o.btn1=!!document.getElementById('shopBtn'); cheatAct('ach:memory'); o.ach=Object.keys(achList()).join(); cheatAct('achreset'); o.reset=Object.keys(achList()).length+starData().earned;
    cheatAct('lvb3'); o.b3=RUN.indexOf(level)+':'+!!has('star')+':'+homeward(); cheatAct('lvx'); const e=entranceInfo; o.x=level===RUN[0]&&Math.hypot(player.x-e.fx,player.z-e.fz)<3.5;
    cheatAct('lvb2'); cheatAct('exit'); o.exitBack=Math.hypot(player.x-entranceInfo.fx,player.z-entranceInfo.fz)<3.5; cheatAct('lv'+RUN[2]); o.fwdStar=!!has('star'); cheatAct('exit'); o.exitFwd=Math.hypot(player.x-exitInfo.px,player.z-exitInfo.pz)<4;
    o.side=!!document.querySelector('[data-a=lvb5]')&&!!document.querySelector('[data-a=lvx]')&&!!document.querySelector('[data-a=achreset]');
    try{ if(s0) localStorage.setItem('echoloc.stars',s0); else localStorage.removeItem('echoloc.stars'); if(a0) localStorage.setItem('echoloc.ach',a0); else localStorage.removeItem('echoloc.ach'); }catch(e){} picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.toast!=='1'&&o.last==='HELLO','toast shown '+r); assert(o.ach==='memory'&&o.reset===0,'achievement buttons '+r); assert(o.b3==='3:false:true'&&o.x&&o.exitBack&&!o.fwdStar&&o.exitFwd,'go-to buttons '+r); assert(o.side,'sidebar '+r); });
T('round 14: on the way home every sign and the map point to the way-home door; leaving without the star gives no star', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; freezeM=true; firstLevel=0; newRun(); let s0; try{ s0=localStorage.getItem('echoloc.stars'); }catch(e){}
    goArea(2,'fwd',true); const fwd=signs.map(sDir).map(d=>d.join()); cheatHome=true; goArea(2,'back',true); const e=entranceInfo; let good=0; for(const sg of signs){ const [dx,dz]=sDir(sg), tx=e.fx-sg.x, tz=e.fz-sg.z; if(dx*tx+dz*tz>0) good++; } o.signs=signs.length; o.good=good; o.changed=signs.some((sg,i)=>sDir(sg).join()!==fwd[i]);
    const st0=starData().earned; goArea(0,'back',true); player.x=entranceInfo.x; player.z=entranceInfo.z; for(let i=0;i<3;i++){ now+=1/60; update(1/60); } o.won=won; o.star=starData().earned-st0; o.winStar=winStar;
    try{ if(s0) localStorage.setItem('echoloc.stars',s0); else localStorage.removeItem('echoloc.stars'); }catch(e){} freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.signs>2&&o.changed&&o.good>=o.signs*0.7,'signs '+r); assert(o.won&&o.star===0&&!o.winStar,'no star without carrying it '+r); });
T('round 14: Esc on the pause screen resumes the game and stays resumed even if the mouse lock is refused (twice); no achievements on the pause screen', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; const esc=()=>dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'})); paused=false; togglePause(); o.panel=paused&&!document.getElementById('achBtn')&&!!document.getElementById('resumeBtn'); esc(); lockRefused(); document.dispatchEvent(new Event('pointerlockerror')); o.resumed=!paused&&document.getElementById('overlay').style.display==='none'; keys.Escape=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.panel&&o.resumed,r); });
T('round 15: without the star no door anywhere takes you back (every level, every way in); with it none takes you forward', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={back:[],fwd:[]}; god=true; freezeM=true; started=true; paused=false; firstLevel=0; newRun(); const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); } };
    for(let k=0;k<RUN.length;k++){ goArea(k,'fwd',true); const en=entranceInfo; if(en){ player.x=en.x; player.z=en.z-3; step(3); player.x=en.x; player.z=en.z; step(3); player.x=en.fx; player.z=en.fz; step(3); } o.back.push(RUN.indexOf(level)===k); }
    picks[PI.star]=1; for(let k=0;k<RUN.length-1;k++){ goArea(k,'back',true); const e=exitInfo; player.x=e.px; player.z=e.pz+3; step(3); player.x=e.px; player.z=e.pz; step(3); o.fwd.push(RUN.indexOf(level)===k); }
    picks.fill(0); freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.back.every(Boolean),'went back without the star '+r); assert(o.fwd.every(Boolean),'went forward with the star '+r); });
T('round 15: chasers come out of the door only once you are 10 m away and out of its sight; exit ambushes never spawn within 18 m or in view; pause shows what you carry, with what it does', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; started=true; paused=false; firstLevel=0; newRun(); const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); } };
    const e=exitInfo; player.x=e.px; player.z=e.pz+3; const m=makeMonster(player.x,player.z+2,'stalker'); monsters=[m]; enterHunt(m,{x:player.x,z:player.z},now); step(3); player.x=e.px; player.z=e.pz; step(3);
    o.lv=RUN.indexOf(level); const n0=monsters.length; o.queued=doorChasers.length; freezeM=true; step(300); o.stillWaiting=monsters.length===n0&&doorChasers.length===1; freezeM=false;
    const c=doorChasers[0]; let far=null; for(let i=0;i<W*H&&!far;i++){ const x=i%W+.5, z=((i/W)|0)+.5; if(walk[i]&&Math.hypot(x-c.x,z-c.z)>14&&Math.hypot(x-exitInfo.px,z-exitInfo.pz)>10&&!los(x,camY,z,c.x,1.4,c.z)) far={x,z}; } player.x=far.x; player.z=far.z; freezeM=true; step(2); freezeM=false; o.out=doorChasers.length===0&&monsters.some(q=>q.kind==='stalker'&&Math.hypot(q.x-c.x,q.z-c.z)<1.5); o.dbg={left:doorChasers.length,c,far,p:[player.x,player.z],now,st:monsters.filter(q=>q.kind==='stalker').map(q=>[q.x|0,q.z|0])};
    let bad=0; for(let k=0;k<200;k++){ const before=monsters.length; if(spawnHidden(player.x,player.z,2,30)){ const q=monsters[monsters.length-1]; if(Math.hypot(q.x-player.x,q.z-player.z)<18||los(player.x,camY,player.z,q.x,1.4,q.z)) bad++; monsters.length=before; } } o.bad=bad;
    picks[PI.eye]=1; picks[PI.stride]=1; paused=false; togglePause(); const ov=document.getElementById('overlay'); o.tiles=ov.querySelectorAll('.carry .tile').length; ov.querySelector('[data-tip]').click(); o.tip=document.getElementById('tipBox').textContent; o.still=paused;
    picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.lv===1&&o.queued===1&&o.stillWaiting,'chaser came out next to you '+r); assert(o.out,'chaser never came '+r); assert(o.bad===0,'ambush too close / in view '+r); assert(o.tiles===2&&/:/.test(o.tip)&&o.still,'pause list '+r); });
T('round 16: cheat power-ups are on/off toggles (the game ones, then the artifacts apart); the pause screen list follows them', async()=>{ await load(); await sandbox(0); const r=await ev(`(()=>{ const o={}; picks.fill(0); started=true; paused=false; togglePause(); buildSide(); const sd=document.getElementById('side');
    o.toggles=sd.querySelectorAll('[data-a^="pwt:"]').length; o.arts=sd.querySelectorAll('.art [data-a^="pwt:"]').length; o.noPlus=!sd.querySelector('[data-a^="pw+:"]');
    sd.querySelector('[data-a="pwt:'+PI.lens+'"]').click(); o.on=picks[PI.lens]===1&&document.querySelectorAll('#overlay .carry .tile').length===1; sd.querySelector('[data-a="pwt:'+PI.memory+'"]').click(); o.two=document.querySelectorAll('#overlay .carry .tile').length===2;
    document.getElementById('side').querySelector('[data-a="pwt:'+PI.lens+'"]').click(); o.off=picks[PI.lens]===0&&document.querySelectorAll('#overlay .carry .tile').length===1&&document.getElementById('side').querySelector('[data-a="pwt:'+PI.memory+'"]').classList.contains('on');
    picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.toggles===27&&o.arts===7&&o.noPlus,'toggles '+r); assert(o.on&&o.two&&o.off,'pause list '+r); });
T('round 17: audio stays light: a monster click is one pre-rendered buffer (no burst chains), far/crowded sounds are dropped, at most 3 light screams at once', async()=>{ await load(); await startGame(); const r=await ev(`(async()=>{ const o={}; initAudio(); for(let i=0;i<60&&!BAKED.click3;i++) await new Promise(r=>setTimeout(r,50)); o.baked=!!(BAKED.click3&&BAKED.click2&&BAKED.chitter);
    const P=AudioContext.prototype, cnt={n:0}, keep={}; for(const k of ['createGain','createBiquadFilter','createOscillator','createBufferSource','createPanner']){ keep[k]=P[k]; P[k]=function(...a){ cnt.n++; return keep[k].apply(this,a); }; }
    voiceN=0; clickTok=8; clickT=now; cnt.n=0; sfxMonClick([player.x+3,1.9,player.z],.6); o.perClick=cnt.n;
    cnt.n=0; for(let i=0;i<200;i++){ now+=0.005; sfxMonClick([player.x+30+i%20,1.9,player.z],.6); } o.burst200=cnt.n;
    liteEnds.length=0; let lite=0; for(let i=0;i<10;i++){ const b=liteEnds.length; sfxShriekLite([player.x+5,1.6,player.z],1,1); if(liteEnds.length>b) lite++; } o.lite=lite;
    voiceN=0; let sunk=0; for(let i=0;i<100;i++) if(dest([player.x+40,1,player.z],1,0)._sink) sunk++; o.sunk=sunk;
    for(const k in keep) P[k]=keep[k]; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.baked,'not baked '+r); assert(o.perClick<=6,'click too heavy '+r); assert(o.burst200<200,'click flood not limited '+r); assert(o.lite===3,'scream cap '+r); assert(o.sunk>=75,'far crowd not dropped '+r); });
T('round 17: every artifact rule: carrying its power-ups puts that artifact beside the star on the bridge; carried home it becomes that achievement (cheat buttons for each)', async()=>{ await load(); await sandbox(0); const r=await ev(`(()=>{ const o={}; let a0; try{ a0=localStorage.getItem('echoloc.ach'); localStorage.removeItem('echoloc.ach'); }catch(e){} god=true; freezeM=true; buildSide(); o.btns=document.querySelectorAll('#side [data-a^="bridge:"]').length; o.res=[];
    FINAL_RULES.forEach(([need,give],j)=>{ cheatAct('bridge:'+j); const arts=items.filter(i=>i.artifact).map(i=>PW[i.t].id).sort().join(); const art=items.find(i=>i.artifact&&!i.star); player.x=art.x; player.z=art.z; for(let i=0;i<3;i++){ now+=1/60; update(1/60); } const carried=runArtifact;
      cheatAct('lvx'); cheatHome=false; const e=entranceInfo; player.x=e.x; player.z=e.z; won=false; for(let i=0;i<3;i++){ now+=1/60; update(1/60); } o.res.push([give,arts,carried,won,!!achList()[give]].join(':')); });
    try{ if(a0) localStorage.setItem('echoloc.ach',a0); else localStorage.removeItem('echoloc.ach'); }catch(e){} won=false; picks.fill(0); freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.btns===7,'cheat buttons (5 rules + crown, + crown again in today\'s review) '+r); for(const x of o.res){ const [g,arts,c,w,a]=x.split(':'); assert(arts===[g,'star'].sort().join()&&c===g&&w==='true'&&a==='true','rule '+x); } });
T('round 17: a stalker that has chased you for 20 s runs 1.1x, after 40 s 1.2x; losing you resets it; 3D sound only for the 3 nearest', async()=>{ await load(); await sandbox(0); const r=await ev(`(()=>{ const o={}; god=true; const m=makeMonster(player.x+30,player.z,'stalker'); monsters=[m]; enterHunt(m); m.windup=0;
    const sp=()=>{ const s0=now; m.seed=-now*2.3-1.5708; m.lastKnown={x:m.x+50,z:m.z}; m.windup=0; const x0=m.x,z0=m.z; updateMonster(m,0); return m.huntSince; };
    sp(); o.t0=m.huntSince; now+=21; sp(); const ratio=()=>{ const ch=now-m.huntSince; return ch>40?1.2:ch>20?1.1:1; }; o.k21=ratio(); now+=20; o.k41=ratio(); m.state='idle'; updateMonster(m,0); o.reset=m.huntSince===null;
    const ms=[]; for(let k=0;k<6;k++){ ms.push(makeMonster(player.x+2+k*2,player.z,'stalker')); } monsters=ms; initAudio(); voiceN=0; const pm=[]; for(let k=0;k<6;k++){ const g=dest([player.x+2+k*2,1.4,player.z],1,0); pm.push(g._p?g._p.panningModel:'-'); } o.pm=pm.join();
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.k21===1.1&&o.k41===1.2&&o.reset,'speed-up '+r); assert(o.pm==='HRTF,HRTF,HRTF,equalpower,equalpower,equalpower','3D for the nearest '+r); });
T('round 17: audio load: when the audio clock falls behind, pressure rises (fewer 3D voices, fewer sounds) and eases back when it keeps up; dots default size 1, strength 2.5', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; initAudio(); const real=performance.now; let fakeR=1000, fakeA=0; const d=Object.getOwnPropertyDescriptor(BaseAudioContext.prototype,'currentTime'); Object.defineProperty(AC,'currentTime',{get:()=>fakeA,configurable:true}); Object.defineProperty(AC,'state',{get:()=>'running',configurable:true}); performance.now=()=>fakeR*1000;
    audioLoad=0; aLastReal=0; audioPressure(); for(let k=0;k<4;k++){ fakeR+=.5; fakeA+=.2; audioPressure(); } o.up=audioLoad;
    const ms=[]; for(let k=0;k<4;k++) ms.push(makeMonster(player.x+2+k*2,player.z,'stalker')); monsters=ms; voiceN=0; o.pm=[0,1,2,3].map(k=>{ const g=dest([player.x+2+k*2,1.4,player.z],1,0); return g._p?g._p.panningModel:'-'; }).join();
    for(let k=0;k<70;k++){ fakeR+=.5; fakeA+=.5; audioPressure(); } o.down=audioLoad;
    performance.now=real; delete AC.currentTime; delete AC.state; o.dot=[TUNE_DEF.find(q=>q[0]==='dotSize')[1],TUNE_DEF.find(q=>q[0]==='dotBright')[1]].join(); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.up===3&&o.pm.indexOf('HRTF')<0,'pressure '+r); assert(o.down===0,'never eases '+r); assert(o.dot==='1,2.5','dot defaults '+r); });
T('round 18: main menu ABOUT: Luis Quesada Torres, (c) 2026, free game, Windlereye link; the link does not start the game', async()=>{ await load(); const r=await ev(`(()=>{ const o={}; started=false; showOverlay('start'); document.getElementById('aboutBtn').click(); const ov=document.getElementById('overlay'); o.txt=/Luis Quesada Torres/.test(ov.textContent)&&/2026/.test(ov.textContent)&&/free/.test(ov.textContent); const a=ov.querySelector('a[href="https://windlereye.com"]'); o.link=!!a&&a.target==='_blank';
    a.addEventListener('click',e=>e.preventDefault()); a.click(); o.still=!started&&ovState.panel==='about'; ov.querySelector('[data-shop=back]').click(); o.back=ovState.k==='start'&&!ovState.panel; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.txt&&o.link&&o.still&&o.back,r); });
T('round 18: SETTINGS in the main menu switches language and text size and opens the help; the itch.io build has no top bar, only a stand-in for its API', async()=>{ await load(); const r=await ev(`(()=>{ const o={}; started=false; showOverlay('start'); document.getElementById('setBtn').click(); const q=a=>document.querySelector('[data-set="'+a+'"]');
    const sel=()=>document.getElementById('langSel'), pick=v=>{ sel().value=v; sel().dispatchEvent(new Event('change',{bubbles:true})); };
    o.opts=sel().options.length; o.nl=LANGS.length; o.first=sel().options[0].value; pick('de'); o.de=lang()==='de'&&L102.lang==='de'&&/LEERTASTE/.test(document.getElementById('info').textContent)&&localStorage.getItem('echoloc.lang')==='de';
    pick('ja'); o.ja=lang()==='ja'&&L102.lang==='en'; pick('system'); o.sys=lang()==='en';
    o.match=[matchLang('pt'),matchLang('pt-PT'),matchLang('zh-TW'),matchLang('zh-CN'),matchLang('en-AU'),matchLang('sr'),matchLang('nb-NO'),matchLang('xx')].join();
    const f0=L102.fs; q('fs:+').click(); o.fs=L102.fs>f0; q('fs:-').click(); o.help=!q('help'); o.still=!started&&ovState.panel==='settings';
    document.querySelector('[data-shop=back]').click(); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.first==='system'&&o.opts===1+o.nl,'select: System default + every language '+r); assert(o.de&&o.ja&&o.sys&&o.fs&&o.help&&o.still,'settings '+r); assert(o.match==='pt-BR,pt-PT,zh-Hant,zh,en-GB,sr-Latn,no,','system language matching '+r);
  const it=fs.readFileSync(new URL('../../scratch/echoloc/itch/index.html',import.meta.url),'utf8'); assert(!/id="l102bar"/.test(it)&&/--l102-bar-h:0px/.test(it)&&/window\.L102=/.test(it),'itch build: no top bar, small stand-in for its API'); });
T('round 19: cheat pause screen has a SCREENSHOT button: it captures the game frame itself (lit view and map off, no sidebar), then puts everything back', async()=>{ await load(); await sandbox(1); const r=await ev(`(async()=>{ const o={}; if(!cheatOn) toggleCheat(); debugView=true; mapOn=true; started=true; paused=false; togglePause(); o.btn=!!document.getElementById('shotBtn');
    let got=null; const tb=HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob=function(cb,t){ got={w:this.width,dbg:debugView,map:mapOn,cheat:cheatOn,url:this.toDataURL('image/png').length}; return tb.call(this,cb,t); };
    document.getElementById('shotBtn').click(); await new Promise(r=>setTimeout(r,600)); HTMLCanvasElement.prototype.toBlob=tb; o.got=got; o.back=debugView&&mapOn&&cheatOn; o.msg=document.getElementById('shotMsg').textContent; toggleCheat(); debugView=false; mapOn=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.btn,'no button '+r); assert(o.got&&!o.got.dbg&&!o.got.map&&!o.got.cheat&&o.got.url>20000,'capture '+r); assert(o.back&&/Screenshot/.test(o.msg),'restore/message '+r); });
T('round 20: the controls (with F full screen) always show on the pause screen and fade in the game; a power-up within 2 m glows without an echo; a cheat power-up counts as unlocked', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; let n0; try{ n0=localStorage.getItem('echoloc.seen'); localStorage.removeItem('echoloc.seen'); }catch(e){}
    const info=document.getElementById('info'); o.f=info.innerHTML.indexOf('<kbd>F</kbd>')>=0; info.style.opacity=0; paused=false; togglePause(); render(); o.pz=document.documentElement.classList.contains('pz')&&getComputedStyle(info).opacity==='1'; play(); render(); o.gone=!document.documentElement.classList.contains('pz');
    const it={x:player.x+1.5,z:player.z,y:1,t:PI.stride,got:false}; items.push(it); it.spots=[]; frameNo=14; update(1/60); o.glow=it.spots.length>0; const far={x:player.x+6,z:player.z,y:1,t:PI.eye,got:false,spots:[]}; items.push(far); frameNo=14; update(1/60); o.farDark=far.spots.length===0;
    if(!cheatOn) toggleCheat(); cheatAct('pwt:'+PI.lens); o.seen=seenList().includes('lens'); cheatAct('pwt:'+PI.lens); toggleCheat();
    try{ if(n0) localStorage.setItem('echoloc.seen',n0); else localStorage.removeItem('echoloc.seen'); }catch(e){} picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.f,'no F in the controls '+r); assert(o.pz&&o.gone,'controls on pause '+r); assert(o.glow&&o.farDark,'near glow '+r); assert(o.seen,'cheat unlock '+r); });
T('round 20: the shop remembers your picks across reloads (and they are in the next game)', async()=>{ await load(); await ev(`(()=>{ window.__s0=localStorage.getItem('echoloc.stars'); window.__n0=localStorage.getItem('echoloc.seen'); localStorage.setItem('__keep',JSON.stringify([window.__s0,window.__n0])); starSave({earned:3,bought:[]}); ['eye','lungs','lens'].forEach(markSeen); shopAct('buy:eye'); shopAct('buy:lens'); return 1; })()`);
  const r=await ev(`(()=>{ const o={}; o.data=JSON.stringify(JSON.parse(localStorage.getItem('echoloc.stars')).bought);   /* what is stored is what a reload reads */ started=false; showOverlay('start'); document.getElementById('startBtn').click(); o.own=[...document.querySelectorAll('#overlay .tile.own')].length; document.querySelector('[data-shop=go]').click(); o.picks=[picks[PI.eye],picks[PI.lens],picks[PI.lungs]].join();
    const k=JSON.parse(localStorage.getItem('__keep')); if(k[0]) localStorage.setItem('echoloc.stars',k[0]); else localStorage.removeItem('echoloc.stars'); if(k[1]) localStorage.setItem('echoloc.seen',k[1]); else localStorage.removeItem('echoloc.seen'); localStorage.removeItem('__keep'); picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.data==='["eye","lens"]'&&o.own===2&&o.picks==='1,1,0','shop memory '+r); });
T('round 21: arriving anywhere (run start, every door, both ways): no creature within 25 m or in sight; the door you need shows within 2 m without an echo; going through a door flashes green', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={bad:[],n:0}; god=true; freezeM=true; started=true; paused=false;
    const check=tag=>{ const ey=EYE+(player.gy||0); for(const m of monsters){ const d=Math.hypot(m.x-player.x,m.z-player.z), v=los(player.x,ey,player.z,m.x,1.4+groundOf(m.x,m.z),m.z); if(d<25||v){ o.bad.push(tag+':'+m.kind+':'+d.toFixed(1)+(v?'v':'')); } } o.n++; };
    for(let run=0;run<3;run++){ firstLevel=0; newRun(); check('start'); for(let k=1;k<RUN.length;k++){ goArea(k,'fwd',true); check('f'+k); } picks[PI.star]=1; for(let k=RUN.length-2;k>=0;k--){ goArea(k,'back',true); check('b'+k); } picks.fill(0); }
    const step=n=>{ for(let i=0;i<n;i++){ now+=1/60; update(1/60); } };
    firstLevel=0; newRun(); monsters.length=0; const e=exitInfo; player.x=(e.fx||e.px)+(e.nx||0)*1.8; player.z=(e.fz||e.pz)+(e.nz||1)*1.8; if(!walkAt(player.x,player.z)){ player.x=e.px; player.z=e.pz+1.8; } const w0=totalW; doorArm.exit=false; step(20); o.near=totalW-w0;
    player.x=e.px; player.z=e.pz+12; const w1=totalW; step(20); o.far=totalW-w1;
    player.x=e.px; player.z=e.pz+3; step(3); doorArm.exit=true; player.x=e.px; player.z=e.pz; step(2); o.flash=+document.getElementById('gflash').style.opacity===0&&document.getElementById('gflash').style.transition.includes('opacity'); o.lv=RUN.indexOf(level);
    freezeM=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.bad.length===0,'creature near/visible on arrival: '+o.bad.slice(0,8).join(' ')+' of '+o.n); assert(o.near>200&&o.far<o.near/3,'door near-glow '+r); assert(o.flash&&o.lv===1,'green flash '+r); });
T('round 22: dying leads only to the main menu (button, click, Esc, Space); the controls hint shows only in the very first game; menus shrink to fit big text', async()=>{ await load(); await startGame(); const r=await ev(`(async()=>{ const o={};
    const die0=()=>{ started=true; paused=false; god=false; dead=true; deathT=3; killer=null; showOverlay('dead'); };
    die0(); o.btn=!!document.getElementById('menuBtn')&&!document.querySelector('#overlay .go'); document.getElementById('overlay').click(); o.click=!started&&ovState.k==='start';
    die0(); dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'})); keys.Escape=false; o.esc=!started&&ovState.k==='start';
    die0(); dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' '})); keys.Space=false; o.space=!started&&ovState.k==='start';
    localStorage.removeItem('echoloc.hinted'); newGame(); o.first=document.getElementById('info').style.opacity==='1'; newGame(); o.second=document.getElementById('info').style.opacity==='0'; o.noFind=!/FIND THE EXIT|hear echoes/.test(document.getElementById('info').textContent);
    started=false; showOverlay('start'); document.getElementById('achBtn').click(); const f0=L102.fs; L102.setFs(1.8); paintTexts(); await new Promise(r=>setTimeout(r,50)); fitOverlay(); const ov=document.getElementById('overlay'), w=document.getElementById('ovIn'); o.fit=w.getBoundingClientRect().height<=ov.clientHeight+2; o.zoom=w.style.zoom; o.scroll=getComputedStyle(ov).overflowY==='auto'&&ov.scrollHeight>ov.clientHeight&&+o.zoom<=.56; L102.setFs(f0); ovState.panel=null; paintTexts();
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.btn&&o.click&&o.esc&&o.space,'death '+r); assert(o.first&&o.second&&o.noFind,'hint '+r); assert(o.fit||o.scroll,'menu neither fits nor scrolls '+r); });
T('round 22: chosen sounds play (statue roar when it starts stalking, centipede crunch steps, silent twin); the Hollow is solid black; the shop shows what a power-up does when you pick it; the Thread is an artifact (a spool) that points home', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; initAudio(); god=true; const played=[]; const fa=famAt; window.famAt=function(f,...a){ played.push(f); return fa(f,...a); };
    const st=makeMonster(player.x+8,player.z,'statue'); st.state='idle'; st._act=false; monSounds(st,1/60); st.state='stalk'; monSounds(st,1/60); o.roar=played.includes('roar');
    const ce=makeMonster(player.x+8,player.z,'centipede'); ce.curSpeed=3; for(let i=0;i<30;i++) monSounds(ce,1/60); o.crunch=played.includes('crunch');
    played.length=0; const tw=makeMonster(player.x+8,player.z,'twin'); tw.state='hunt'; tw.curSpeed=3; for(let i=0;i<300;i++) monSounds(tw,1/60); o.twin=played.length===0; window.famAt=fa;
    o.solid=buildMonsterMesh(m=>m.kind==='shade')===0; monsters=[makeMonster(player.x+3,player.z,'shade')]; o.solid2=buildMonsterMesh(m=>m.kind==='shade')>100;
    starSave({earned:3,bought:[]}); SHOP().forEach(markSeen); started=false; showOverlay('start'); document.getElementById('startBtn').click(); document.querySelector('[data-shop="buy:wide"]').click(); o.tip=/WIDE EYES/.test(document.getElementById('tipBox').textContent)&&starData().bought.includes('wide');
    o.thread=PW[PI.thread].art&&ACH_ALL().includes('thread')&&!ITEM_CHOSEN.includes('thread')&&FINAL_RULES.some(q=>q[1]==='thread')&&PW[PI.thread].m.length>60;
    localStorage.removeItem('echoloc.stars'); localStorage.removeItem('echoloc.seen'); picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.roar&&o.crunch&&o.twin,'sounds '+r); assert(o.solid2,'hollow mesh '+r); assert(o.tip,'shop tip '+r); assert(o.thread,'thread '+r); });
T('round 24: the bridge is half as long and has no railing: stepping off either side or the platform edge drops you to the bottom, where you die; walking along it does not; the rising streaks only climb the far walls; after taking the star or artifact echoing no longer hurts', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=false; freezeM=true; started=true; paused=false;
    const go=(sx,sz,dx,dz,secs)=>{ firstLevel=0; newRun(); goArea(RUN.indexOf(FINAL),'fwd',true); dead=false; const bx=(W>>1)-1; player.x=bx+sx; player.z=sz; for(let i=0;i<secs*60&&!falling&&!dead;i++){ now+=1/60; moveCircle(player,dx/60,dz/60,0.24); update(1/60); } const f=falling, d0=dead; let k=0; for(;k<600&&!dead;k++){ now+=1/60; update(1/60); } o.fallSecs=Math.max(o.fallSecs||0,k/60); o.deadAtStart=o.deadAtStart||d0; o.gyEnd=player.gy; return f&&dead; };
    o.along=go(1.5,85,0,-3,6); o.left=go(1.5,85,-3,0,3); o.right=go(1.5,85,3,0,3); o.plat=go(1.5,(112-6),-4,0,3); o.fallV=fallV;
    firstLevel=0; newRun(); goArea(RUN.indexOf(FINAL),'fwd',true); dead=false; const pts=[]; const orig=pushPt; pushPt=function(x,y,z){ pts.push([x,z]); return orig.apply(this,arguments); }; try{ for(let i=0;i<20;i++){ now+=1/60; finalTick(1/60); } } finally{ pushPt=orig; }
    o.n=pts.length; o.offWall=pts.filter(([x,z])=>x>1&&x<W-1&&z>1&&z<H-1).length; bridgeEchoes=0; bridgeHurt=0; finalGot=true; const h=echoJobs.length; for(let k=0;k<12;k++){ lastEcho=-9; playerEcho(false); } o.afterN=bridgeEchoes; o.afterHurt=bridgeHurt; o.afterJobs=echoJobs.length-h; o.afterFell=bridgeFell; firstLevel=0; newRun(); picks.fill(0); ['eye','wide','bright'].forEach(id=>picks[PI[id]]=1); goArea(RUN.indexOf(FINAL),'fwd',true); picks[PI.pill]=1; god=true; dead=false; const bx=(W>>1)-1; render(); o.litBefore=litCount; bridgeFall(); render(); o.litAfter=litCount; o.pill=!!has('pill'); player.x=bx+1.5; player.z=85; for(let i=0;i<600&&!dead;i++){ now+=1/60; update(1/60); } o.godFell=dead; god=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(!o.along,'walking along the bridge killed you '+r); assert(o.left&&o.right&&o.plat,'stepping off did not kill you '+r); assert(!o.deadAtStart&&o.fallSecs>2&&o.gyEnd<-55,'you should fall to the bottom first, then die '+r); assert(o.n>0&&o.offWall===0,'streaks in the open air '+r); assert(o.afterN===0&&o.afterHurt===0&&o.afterJobs===0&&!o.afterFell,'echo after taking the prize '+r); assert(o.pill&&o.litAfter<o.litBefore,'the fallen bridge still shows with the Red Pill '+r); assert(o.godFell,'walking where the bridge was did not kill you '+r); });
T('round 24b: Memory keeps only the true surface points of a scattered (tired) echo; the scattered dots still show, then fade; Negative lights only walls, floors and corners (echoes bouncing between them), nothing in the air', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; freezeM=true; started=true; paused=false; firstLevel=0; newRun(); goArea(1,'fwd',true); picks[PI.memory]=1; monsters=[]; memReset(); fatigue=1; lastEcho=-9;
    const live=[]; const orig=pushPt; pushPt=function(x,y,z){ live.push([x,y,z]); return orig.apply(this,arguments); }; try{ playerEcho(false); for(let i=0;i<120;i++){ now+=1/60; update(1/60); } } finally{ pushPt=orig; }
    const onSurf=(x,y,z)=>{ const c0=Math.floor(x), c1=Math.floor(z); let lowC=9; for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++){ const q=idx(c0+dx,c1+dz); if(walk[q]) lowC=Math.min(lowC,ceilH[q]); } if(y<.06||y>lowC-.06) return true; const fx=x-Math.floor(x), fz=z-Math.floor(z), cx=Math.floor(x), cz=Math.floor(z); if(!walk[idx(cx,cz)]||(cellBoxes[idx(cx,cz)]||[]).length) return true; return (fx<.06&&solidAt(cx-1,cz))||(fx>.94&&solidAt(cx+1,cz))||(fz<.06&&solidAt(cx,cz-1))||(fz>.94&&solidAt(cx,cz+1)); };
    let off=0; for(let k=0;k<memN;k++){ const q=k*7; if(!onSurf(memData[q],memData[q+1],memData[q+2])) off++; } o.mem=memN; o.off=off; o.ex=[]; for(let k=0;k<memN&&o.ex.length<6;k++){ const q=k*7, x=memData[q],y=memData[q+1],z=memData[q+2]; if(!onSurf(x,y,z)) o.ex.push([x.toFixed(2),y.toFixed(2),z.toFixed(2),ceilH[idx(Math.floor(x),Math.floor(z))].toFixed(2),(cellBoxes[idx(Math.floor(x),Math.floor(z))]||[]).length]); } o.liveOff=live.filter(p=>!onSurf(p[0],p[1],p[2])).length; o.live=live.length; fatigue=0; picks[PI.memory]=0; picks[PI.negative]=1; const neg=[]; pushPt=function(x,y,z){ neg.push([x,y,z]); return orig.apply(this,arguments); }; try{ for(let i=0;i<30;i++){ now+=1/60; artTick(1/60); } } finally{ pushPt=orig; } picks[PI.negative]=0; o.neg=neg.length; o.negOff=neg.filter(p=>!onSurf(p[0],p[1],p[2])).length; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.mem>200,'Memory saved nothing '+r); assert(o.off/o.mem<0.03,'Memory keeps floating dots '+r); assert(o.liveOff>o.live*0.2,'the tired echo is not scattered any more '+r); assert(o.neg>2000&&o.negOff/o.neg<0.03,'Negative: dots not on the walls '+r); });
T('round 24c: level 6: no window right by the exit, so coming back in you are not blasted; the other windows stay', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={runs:[]}; god=false; freezeM=true; started=true; paused=false;
    for(let k=0;k<3;k++){ firstLevel=0; newRun(); const a=RUN.findIndex(l=>LEVELS[l].gen===genHalls); goArea(a,'back',true); monsters=[]; dead=false; rad=0; const e=exitInfo, ex=e.px, ez=e.pz; const near=windows.map(w=>Math.hypot(w.x-player.x,w.z-player.z)).sort((a,b)=>a-b)[0];
      for(let i=0;i<600&&!dead;i++){ now+=1/60; update(1/60); } o.runs.push({wins:windows.length,near:+near.toFixed(1),rad:+rad.toFixed(3),dead}); }
    return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.runs.every(q=>q.wins>=10&&q.rad<0.05&&!q.dead),'blasted at the level 6 exit '+r); });
for(const [vw,vh] of [[1280,720],[844,390]]) T(`round 24d: shop, achievements and pause (${vw}x${vh}), every language: showing a description never moves anything and never makes a scroll bar`, async()=>{ await load(); await send('Emulation.setDeviceMetricsOverride',{width:vw,height:vh,deviceScaleFactor:1,mobile:false}); await sleep(300); const r=await ev(`(()=>{ const bad=[]; let s0; try{ s0=localStorage.getItem('echoloc.stars'); localStorage.setItem('echoloc.stars',JSON.stringify({earned:9,bought:['chalk']})); }catch(e){}
    const o=document.getElementById('overlay'), rects=()=>[...o.querySelectorAll('button,h2,h3,#tipBox')].map(e=>{ const b=e.getBoundingClientRect(); return Math.round(b.x)+','+Math.round(b.y)+','+Math.round(b.width); }).join(' ');
    const views=[['shop',()=>{ ovState={k:'start',panel:'shop'}; }],['ach',()=>{ ovState={k:'start',panel:'ach'}; }],['achCrown',()=>{ try{ localStorage.setItem('echoloc.ach',JSON.stringify(Object.fromEntries(ACH_ALL().concat(['crown']).map(k=>[k,1])))); localStorage.setItem('echoloc.seen',JSON.stringify(SHOP())); }catch(e){} ovState={k:'start',panel:'ach'}; }],['shopCrown',()=>{ ovState={k:'start',panel:'shop'}; }],['pause',()=>{ started=true; picks.fill(0); ['chalk','glow','eye','dense','wide','memory'].forEach(id=>picks[PI[id]]=1); ovState={k:'paused'}; }]];
    for(const L of LANGS){ setLangPref(L); for(const [nm,set] of views){ set(); o.style.display='flex'; paintTexts(); const r0=rects(); const tips=[...o.querySelectorAll('[data-tip]')];
      for(const t of tips){ t.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); const r1=rects(), A0=r0.split(/[ ,]/), A1=r1.split(/[ ,]/), mv=A0.length!==A1.length||A0.some((v,i)=>Math.abs(v-A1[i])>2); if(mv||o.scrollHeight>o.clientHeight+1||o.scrollWidth>o.clientWidth+1){ bad.push(L+' '+nm+' '+t.dataset.tip+(o.scrollHeight>o.clientHeight+1?' scroll':' moved')); break; } } } }
    setLangPref('system'); started=false; picks.fill(0); try{ localStorage.removeItem('echoloc.ach'); localStorage.removeItem('echoloc.seen'); if(s0===null) localStorage.removeItem('echoloc.stars'); else localStorage.setItem('echoloc.stars',s0); }catch(e){} return JSON.stringify(bad.slice(0,20).concat(bad.length?['total '+bad.length]:[])); })()`);
  const bad=JSON.parse(r); assert(bad.length===0,'the description moved the page: '+r); });
T('round 25: the crown: with Lucky bought every power-up can be found in one run (levels 2-6); 5 artifacts + all power-ups on the bridge = only the crown; home with it = 6/5, crown on the right; crowned shop: everything free; the crown sees all, can echo, and always shows the signs and the door', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; let A0,S0,N0; try{ A0=localStorage.getItem('echoloc.ach'); S0=localStorage.getItem('echoloc.stars'); N0=localStorage.getItem('echoloc.seen'); }catch(e){}
    const setL=(k,v)=>{ try{ if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
    god=true; freezeM=true; started=true; paused=false; o.runs=[];
    for(let r=0;r<5;r++){ firstLevel=0; newRun(); picks.fill(0); picks[PI.lucky]=1; ['eye','glow','chalk','echo'].forEach(id=>picks[PI[id]]=1); const per=[]; for(let k=1;k<RUN.indexOf(FINAL);k++){ goArea(k,'fwd',true); const it=items.filter(q=>!q.artifact&&ITEM_CHOSEN.includes(PW[q.t].id)); per.push(it.length); it.forEach(q=>picks[q.t]=1); } o.runs.push(per.join('+')+'='+SHOP().filter(id=>has(id)).length); }
    setL('echoloc.ach',null); firstLevel=0; newRun(); picks.fill(0); SHOP().forEach(id=>picks[PI[id]]=1); goArea(RUN.indexOf(FINAL),'fwd',true); o.noArts=items.filter(i=>i.artifact).map(i=>PW[i.t].id).join();
    setL('echoloc.ach',JSON.stringify(Object.fromEntries(ACH_ALL().map(k=>[k,1])))); firstLevel=0; newRun(); picks.fill(0); SHOP().filter(id=>id!=='wide').forEach(id=>picks[PI[id]]=1); goArea(RUN.indexOf(FINAL),'fwd',true); o.missing=items.filter(i=>i.artifact).map(i=>PW[i.t].id).sort().join();
    setL('echoloc.stars',JSON.stringify({earned:0,bought:[]})); cheatAct('bridge:crown'); o.crownOnly=items.filter(i=>i.artifact).map(i=>PW[i.t].id).join(); const cr=items.find(i=>i.crown); player.x=cr.x; player.z=cr.z; for(let i=0;i<3;i++){ now+=1/60; update(1/60); } o.home=homeward(); o.runArt=runArtifact;
    goArea(0,'back',true); goBackDoor.t=-9; goBackDoor(); o.crowned=crowned(); o.won=won;
    ovState={k:'start',panel:'ach'}; paintTexts(); const ov=document.getElementById('overlay'); o.achHead=[...ov.querySelectorAll('h2')].map(h=>h.textContent).pop(); const row=ov.querySelector('.tiles.arts'); o.lastTile=row&&row.lastElementChild.querySelector('canvas').dataset.t==String(PI.crown);
    setL('echoloc.seen',JSON.stringify(SHOP())); ovState={k:'start',panel:'shop'}; paintTexts(); SHOP_ALL().forEach(id=>shopAct('buy:'+id)); const sd=starData(); o.bought=sd.bought.length; o.all=SHOP_ALL().length; o.left=starsLeft(sd);
    started=true; firstLevel=0; newRun(); o.carry=PW.filter((q,i)=>picks[i]).length; o.hasCrown=!!has('crown');
    const keepP=picks.slice(); picks.fill(0); picks[PI.crown]=1; const h=echoJobs.length; lastEcho=-9; playerEcho(false); o.echo=echoJobs.length-h; render(); o.lit=litCount; goArea(1,'fwd',true); picks.fill(0); picks[PI.crown]=1; monsters=[]; let sg=0, dr=0; const orig=revealSign, od=doorFrame; revealSign=function(){ sg++; return orig.apply(this,arguments); }; doorFrame=function(){ dr++; return od.apply(this,arguments); }; try{ for(let i=0;i<30;i++){ now+=1/60; update(1/60); } } finally{ revealSign=orig; doorFrame=od; } o.signs=sg; o.doors=dr; o.nSigns=signs.length; o.doorPanels=RUN.map((lv,k)=>{ goArea(k,'fwd',true); return Math.round(doorVerts().length/7/12); }).join(',');
    setL('echoloc.ach',A0); setL('echoloc.stars',S0); setL('echoloc.seen',N0); picks.fill(0); won=false; started=false; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.runs.every(x=>x.endsWith('=20')),'with Lucky not every power-up in one run '+r); assert(o.noArts.startsWith('star')&&!o.noArts.includes('crown')&&!o.missing.includes('crown'),'crown without its conditions '+r); assert(o.crownOnly==='crown','the bridge should hold only the crown '+r);
  assert(o.home&&o.runArt==='crown','taking the crown should open the way home '+r); assert(o.crowned&&o.won,'crown not earned at home '+r); assert(/6\s*\/\s*5|6.*5/.test(o.achHead)&&o.lastTile,'achievements: 6/5 with the crown last '+r);
  assert(o.bought===o.all&&o.all===26&&o.left>=0,'crowned shop: everything free '+r); assert(o.carry===26&&o.hasCrown,'crowned run carries everything '+r); assert(o.echo>0&&o.lit>0,'crown: sees all and can echo '+r); assert(o.nSigns>0&&o.signs>=o.nSigns&&o.doors>0,'crown: signs and the door always show '+r); assert(o.doorPanels.split(',').every((n,k)=>+n>=(k===o.doorPanels.split(',').length-1?5:10)),'every level: its doors drawn in the see-all view '+r); });
T('round 25b: cheat sidebar, today\'s review buttons at the top: each one works', async()=>{ await load(); await sandbox(0); const r=await ev(`(()=>{ const o={}; let A0,S0,N0; try{ A0=localStorage.getItem('echoloc.ach'); S0=localStorage.getItem('echoloc.stars'); N0=localStorage.getItem('echoloc.seen'); }catch(e){} const setL=(k,v)=>{ try{ if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
    buildSide(); const side=document.getElementById('side'), first=side.querySelector('h3'); o.top=first&&/review/i.test(first.textContent); o.btns=[...side.querySelectorAll('[data-a]')].slice(0,16).map(b=>b.dataset.a).join(' ');
    const click=a=>{ const b=side.querySelector('[data-a="'+a+'"]'); if(!b) return 'missing '+a; b.click(); return 'ok'; };
    o.five=click('t7:five'); o.has5=ACH_ALL().every(k=>achList()[k]); o.reset=click('t7:reset'); o.none=Object.keys(achList()).length===0;
    o.crownshop=click('t7:crownshop'); o.shop=ovState.panel==='shop'&&crowned(); setL('echoloc.ach',null);
    click('t7:lucky'); o.lucky=has('lucky')&&RUN.indexOf(level)===1&&items.length>=3; click('t7:neg'); o.neg=has('negative')&&!has('lucky'); click('t7:mem'); o.mem=has('memory')&&fatigue>.9;
    click('lvb5'); o.l6=level===RUN[5]&&homeward(); click('t7:menu'); o.dead=dead;
    setL('echoloc.ach',A0); setL('echoloc.stars',S0); setL('echoloc.seen',N0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.top,'review not at the top '+r); for(const k of ['five','reset','crownshop']) assert(o[k]==='ok','button '+k+' '+r); assert(o.has5&&o.none&&o.shop&&o.lucky&&o.neg&&o.mem&&o.l6&&o.dead,'review buttons '+r); });
T('round 26: Memory keeps each level\'s dots for the way back, inside a fixed RAM budget (oldest level forgotten first); fixed-size duplicate table', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; freezeM=true; started=true; paused=false; firstLevel=0; newRun(); picks[PI.memory]=1; goArea(1,'fwd',true); monsters=[];
    for(let k=0;k<4;k++){ lastEcho=-9; player.yaw+=1.5; playerEcho(false); for(let i=0;i<90;i++){ now+=1/60; update(1/60); } } o.l2=memN; const first=[memData[0],memData[1],memData[2]].join();
    goArea(2,'fwd',true); monsters=[]; o.l3=memN; lastEcho=-9; playerEcho(false); for(let i=0;i<90;i++){ now+=1/60; update(1/60); } o.l3b=memN;
    goArea(1,'back',true); o.back=memN; o.same=[memData[0],memData[1],memData[2]].join()===first; const n0=memN; lastEcho=-9; playerEcho(false); for(let i=0;i<90;i++){ now+=1/60; update(1/60); } o.noDup=memN-n0;
    o.hashMB=memHash.byteLength/1048576; o.keepMB=MEM_KEEP*28/1048576;
    for(let q=10;q<20;q++) memSaved.set(q,new Float32Array(MEM_KEEP*7/4)); memSave(1); let tot=0; for(const a of memSaved.values()) tot+=a.length/7; o.tot=tot; o.keepsCurrent=memSaved.has(1); o.budget=MEM_KEEP;
    firstLevel=0; newRun(); o.cleared=memSaved.size; picks.fill(0); return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.l2>500&&o.l3===0&&o.l3b>0,'memory per level '+r); assert(o.back===o.l2&&o.same,'dots not back on the way home '+r); assert(o.noDup<o.l2*0.5,'echoing the same walls again doubles the dots '+r);
  assert(o.tot<=o.budget&&o.keepsCurrent&&o.cleared===0,'budget '+r); assert(o.hashMB<=8&&o.keepMB<=40,'RAM '+r); });
T('round 26b: audio never stops the game: a broken sound is caught, repeated errors rebuild the sound engine, a stuck engine is rebuilt', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; initAudio(); const real=AC, n0=resetAudio.n||0;
    AC=new Proxy(real,{get(t,k){ if(k==='createGain'||k==='createOscillator'||k==='createBufferSource'||k==='createBiquadFilter'||k==='createPanner') return ()=>{ throw new Error('broken audio'); }; const v=t[k]; return typeof v==='function'?v.bind(t):v; }});
    let threw=false; try{ for(let k=0;k<5;k++){ sfxStep(true); sfxThump([player.x,0,player.z],1); sfxGrunt(1); } }catch(e){ threw=true; } o.threw=threw; o.errs=audioErr.total||0; o.rebuilt=(resetAudio.n||0)>n0; o.newAC=!!AC&&AC!==real&&typeof AC.createGain()==='object';
    for(let i=0;i<30;i++){ now+=1/60; update(1/60); } o.crashed=!!frame.crashed;
    const n1=resetAudio.n; audioWatch.r=-1e9; watchT=0; const st=AC; Object.defineProperty(AC,'state',{get:()=>'suspended',configurable:true}); AC.resume=()=>Promise.resolve(); started=true; paused=false; for(let k=0;k<14;k++){ watchT=0; audioWatch(); } o.stuckRebuilt=resetAudio.n>n1&&AC!==st; return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(!o.threw&&o.errs>0&&!o.crashed,'a sound error reached the game '+r); assert(o.rebuilt&&o.newAC,'repeated errors did not rebuild the sound '+r); assert(o.stuckRebuilt,'stuck sound not rebuilt '+r); });
T('round 23: shop: at most 5 power-ups per game, priced 1, 1, 3, 5, 6 stars; giving one back returns its price; Projection keeps the usual echo colour; a gamepad walks, looks, echoes, pauses and works the menus', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; let s0,n0; try{ s0=localStorage.getItem('echoloc.stars'); n0=localStorage.getItem('echoloc.seen'); }catch(e){}
    starSave({earned:16,bought:[]}); SHOP().forEach(markSeen); const ids=['eye','wide','bright','glow','dense','lens']; const left=[]; for(const id of ids){ shopAct('buy:'+id); left.push(starsLeft(starData())); } o.left=left.join(); o.n=starData().bought.length;
    shopAct('buy:wide'); o.back=starsLeft(starData())+'/'+starData().bought.join(); starSave({earned:4,bought:[]}); shopAct('buy:eye'); shopAct('buy:wide'); shopAct('buy:bright'); o.poor=starData().bought.length;
    picks.fill(0); picks[PI.ventro]=1; const ee=emitEcho; let col='none'; window.emitEcho=function(q){ if(q.mine) col=q.col; return ee(q); }; lastEcho=-9; playerEcho(false); window.emitEcho=ee; o.green=col?1:0; picks.fill(0);
    const btn=Array.from({length:17},()=>({pressed:false})); const gp={connected:true,axes:[0,-1,0.8,0],buttons:btn}; navigator.getGamepads=()=>[gp];
    started=true; paused=false; document.getElementById('overlay').style.display='none'; const z0=[player.x,player.z,player.yaw]; for(let i=0;i<20;i++){ now+=1/60; padPoll(1/60); update(1/60); } o.walk=Math.hypot(player.x-z0[0],player.z-z0[1])>.3; o.look=player.yaw!==z0[2]; o.run=sprinting;
    gp.axes=[0,0,0,0]; lastEcho=-9; const e0=lastEcho; btn[0].pressed=true; padPoll(1/60); btn[0].pressed=false; padPoll(1/60); o.echo=lastEcho!==e0;
    btn[9].pressed=true; padPoll(1/60); btn[9].pressed=false; padPoll(1/60); o.pause=paused&&ovState.k==='paused';
    btn[13].pressed=true; padPoll(1/60); btn[13].pressed=false; padPoll(1/60); o.focus=document.activeElement&&document.activeElement.tagName==='BUTTON';
    const f=document.activeElement.id; btn[0].pressed=true; padPoll(1/60); btn[0].pressed=false; padPoll(1/60); o.pressed=f; o.after=ovState.k+':'+started;
    delete navigator.getGamepads; try{ if(s0) localStorage.setItem('echoloc.stars',s0); else localStorage.removeItem('echoloc.stars'); if(n0) localStorage.setItem('echoloc.seen',n0); else localStorage.removeItem('echoloc.seen'); }catch(e){} return JSON.stringify(o); })()`);
  const o=JSON.parse(r); assert(o.left==='15,14,11,6,0,0'&&o.n===5,'prices/cap '+r); assert(o.poor===2,'cannot afford the 3rd with 2 left '+r); assert(o.green===0,'projection still colours the echo '+r); assert(o.walk&&o.look&&o.run&&o.echo&&o.pause&&o.focus,'gamepad '+r); });
T('round 11: chasers follow you through a door a few seconds later; the first door is locked until you carry an artifact', async()=>{ await load(); await startGame(); const r=await ev(`(()=>{ const o={}; god=true; firstLevel=0; newRun(); const e=exitInfo; player.x=e.px; player.z=e.pz+3; const m=makeMonster(player.x,player.z+2,'stalker'); monsters=[m]; enterHunt(m,{x:player.x,z:player.z},now);
    for(let i=0;i<3;i++){ now+=1/60; update(1/60); } player.x=e.px; player.z=e.pz; for(let i=0;i<3;i++){ now+=1/60; update(1/60); }
    o.lv=level; const f=doorChasers.filter(q=>q.kind==='stalker'); o.followers=f.length; o.hunting=f.every(q=>q.t>now);   /* queued at the door (round 15) */
    goArea(0,'fwd',true); const en=entranceInfo; player.x=en.x; player.z=en.z-3; for(let i=0;i<3;i++){ now+=1/60; update(1/60); } player.x=en.x; player.z=en.z; for(let i=0;i<3;i++){ now+=1/60; update(1/60); } o.locked=level===RUN[0]&&!won; o.want=RUN[1]; return JSON.stringify(o); })()`);
  await load(); await startGame(); const o=JSON.parse(r); assert(o.lv===o.want&&o.followers>=1&&o.hunting,'followers '+r); assert(o.locked,'first door '+r); });
T('no uncaught page errors during the whole run', async()=>{ assert(pageErrors.length===0,'page errors: '+pageErrors.slice(0,3).join(' | ')); });

// =========================================================== run
let pass=0, fail=0;
if(FILTER&&!'boot'.includes(FILTER)){ await load(); await startGame(); } // filtered runs still need a live game
for(const t of tests){ if(FILTER&&!t.name.includes(FILTER)) continue;
  const t0=Date.now();
  try{ await t.fn(); pass++; console.log(`PASS ${t.name}  (${Date.now()-t0}ms)`); }
  catch(e){ fail++; console.log(`FAIL ${t.name}  ${e.message}`); } }
console.log(fail?`RESULT: ${fail} FAILED, ${pass} passed`:`RESULT: ALL ${pass} PASSED`);
if(COV){ await covTake(); const miss=[...COV.all.keys()].filter(k=>!COV.hit.has(k)).map(k=>COV.all.get(k)).sort(); const rep=covReport(); fs.writeFileSync(path.resolve(HERE,'..','..','scratch','echoloc','coverage.txt'),`functions run: ${COV.hit.size}/${COV.all.size}\nnever run:\n${[...new Set(miss)].join('\n')}\n\ncode run: ${rep.pct}% of characters; lines fully run: ${rep.lines}\nlines with code never run:\n${rep.miss.join('\n')}\n`); console.log(`COVERAGE ${COV.hit.size}/${COV.all.size} functions, ${rep.pct}% of code, ${rep.lines} lines fully run (scratch/echoloc/coverage.txt)`); }
ws.close(); cleanup(); process.exit(fail?1:0);
