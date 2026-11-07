#!/usr/bin/env node
// Echoloc balance simulations: bots play the real game code at full speed (no drawing, no sound) and report how it went.
//   node tests/echoloc/sim.mjs [games=200] ['{"chase":3}']     second argument: letmechoose export string
// Bots know the shortest way out, so these are comparisons between settings, not predictions for a human player.
import {spawn} from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {findChrome} from '../lib/cdp.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)), PLAIN=path.resolve(HERE,'..','..','scratch','echoloc','plain','index.html'), PAGE='file://'+(fs.existsSync(PLAIN)?PLAIN:path.resolve(HERE,'..','..','docs','echoloc','index.html'));
const GAMES=+(process.argv[2]||200), TUNING=process.argv[3]||'{}', PORT=9800+Math.floor(Math.random()*150);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)), prof=fs.mkdtempSync(path.join(os.tmpdir(),'echo-sim-'));
const ARGS=['--no-sandbox','--headless=new','--enable-gpu','--ignore-gpu-blocklist','--mute-audio',`--remote-debugging-port=${PORT}`,`--user-data-dir=${prof}`,'about:blank'], XVFB=process.platform==='linux'&&fs.existsSync('/usr/bin/xvfb-run');   // Linux: WebGL needs Chrome under xvfb (as run.mjs)
const chrome=XVFB?spawn('xvfb-run',['-a',findChrome(),...ARGS],{stdio:'ignore',detached:true}):spawn(findChrome(),ARGS,{stdio:'ignore',detached:true});
process.on('exit',()=>{ try{ process.kill(-chrome.pid); }catch{} try{ fs.rmSync(prof,{recursive:true,force:true}); }catch{} });
let tabs; for(let i=0;i<60&&!tabs;i++){ try{ tabs=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); }catch{ await sleep(250); } }
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage=e=>{ const m=JSON.parse(e.data); if(pend[m.id]){ pend[m.id](m); delete pend[m.id]; } };
const send=(method,params={})=>new Promise(r=>{ const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i,method,params})); });
const ev=async x=>{ const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true}); if(r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text); return r.result.result.value; };
await send('Runtime.enable'); await send('Page.navigate',{url:PAGE}); await sleep(1500);
await ev(`(()=>{ ${process.env.PATCH||''}; window.SIM_PICKS=${process.env.PICKS||'{}'}; tuneImport(${JSON.stringify(TUNING)}); window.emitEcho=()=>[]; window.sampleMonster=()=>{}; window.revealSign=()=>{}; window.revealFloorArrow=()=>{}; window.revealExit=()=>{}; window.revealItem=()=>{};
  window.simGame=(policy,lv)=>{ level=lv; picks.fill(0); for(const k in SIM_PICKS) picks[PI[k]]=SIM_PICKS[k]; newGame(); started=true; paused=true; const DT=1/30, MAX=600; let nextEcho=0, t0=now, chased=0, caught=0, stuck=0, lp=[player.x,player.z], lostT=0;
    for(const it of items) it.got=true;
    while(now-t0<MAX&&!dead&&!won){ now+=DT;
      const c=idx(Math.floor(player.x),Math.floor(player.z)); let g=c; for(let s=0;s<5;s++){ let b=g,bd=exitDist[g]; for(const o of [1,-1,W,-W]){ const n=g+o; if(walk[n]&&exitDist[n]>=0&&exitDist[n]<bd){bd=exitDist[n];b=n;} } if(b===g) break; if(s>0&&!clearPath(player.x,player.z,b%W+.5,((b/W)|0)+.5)) break; g=b; }
      player.yaw=Math.atan2(g%W+.5-player.x,((g/W)|0)+.5-player.z);
      const hunters=monsters.filter(m=>m.state==='hunt'), near=hunters.reduce((a,m)=>Math.min(a,Math.hypot(m.x-player.x,m.z-player.z)),1e9), sees=hunters.some(m=>los(m.x,1.5,m.z,player.x,EYE,player.z));
      if(hunters.length) chased+=DT;
      let go=true, run=false;
      if(policy==='runner') run=hunters.length>0;
      if(policy==='hider'&&hunters.length){ run=sees||near<9; go=run; }
      if(policy==='explorer'&&fatigue>0.2) go=false;
      if(policy==='explorer'&&hunters.length){ run=true; go=true; }
      keys.KeyW=go; keys.ShiftLeft=run;
      if(now>=nextEcho&&!hunters.length){ nextEcho=now+(policy==='explorer'?2.5:5); playerEcho(true); hearPlayer('echo'); lastEcho=-9; }
      if(Math.hypot(player.x-exitInfo.px,player.z-exitInfo.pz)<1.2){ won=true; break; }
      update(DT);
      if(Math.hypot(player.x-lp[0],player.z-lp[1])<0.01&&go){ if(++stuck>90){ player.yaw+=Math.random()*3; stuck=0; } } else stuck=0; lp=[player.x,player.z]; }
    keys.KeyW=false; keys.ShiftLeft=false; const w=won; won=false; return {won:w, dead, killer:killer&&killer.kind, time:now-t0, chased}; };
  return 1; })()`);
const q=(a,p)=>{ const s=[...a].sort((x,y)=>x-y); return s.length?s[Math.floor((s.length-1)*p)]:0; };
const TARGET=['90%','60-70%','40-50%','25-35%'];
console.log(`games per bot, per level: ${GAMES}  tuning: ${TUNING}`);
console.log('level  bot       escaped caught timeout time(med) chased(med)  killers');
for(const lv of (process.env.LEVELS||'0,1,2,3').split(',').map(Number)){ let best=0;
  for(const p of ['walker','runner','hider','explorer']){ const R=[];
    for(let i=0;i<GAMES;i+=10) R.push(...await ev(`Array.from({length:${Math.min(10,GAMES-i)}},()=>simGame(${JSON.stringify(p)},${lv}))`));
    const pc=n=>(100*n/R.length).toFixed(0).padStart(3)+'%', w=R.filter(r=>r.won), kill={}; R.forEach(r=>{ if(r.dead) kill[r.killer]=(kill[r.killer]||0)+1; });
    best=Math.max(best,w.length/R.length);
    console.log(String(lv+1).padEnd(6),p.padEnd(9),pc(w.length).padEnd(7),pc(R.filter(r=>r.dead).length).padEnd(6),pc(R.filter(r=>!r.won&&!r.dead).length).padEnd(7),(q(w.map(r=>r.time),.5).toFixed(0)+'s').padEnd(9),(q(R.map(r=>r.chased),.5).toFixed(0)+'s').padEnd(12),JSON.stringify(kill)); }
  console.log(`       best bot ${(best*100).toFixed(0)}%   target ${TARGET[lv]}`); }
ws.close(); process.exit(0);
