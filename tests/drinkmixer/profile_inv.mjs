// Quick profile of the inventory: thumbnail build cost, cell render cost, frame times while flinging.
import { spawn } from "node:child_process"; import { findChrome } from "./cdp.mjs"; import { mkdtempSync, rmSync } from "node:fs"; import { join, resolve, dirname } from "node:path"; import { tmpdir } from "node:os"; import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../.."); const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9800 + Math.floor(Math.random() * 100), prof = mkdtempSync(join(tmpdir(), "dmprof-"));
const ch = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + prof, "--no-first-run", "about:blank"], { stdio: "ignore" });
let info; for (let i = 0; i < 50; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0, pend = new Map(), sid; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, s) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId: s })); });
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
sid = (await send("Target.attachToTarget", { targetId, flatten: true })).result.sessionId;
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800);
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sid);
await send("Page.navigate", { url: "file://" + join(ROOT, "docs/drinkmixer/index.html") }, sid); await sleep(800);
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }, sid)).result.result.value;
await ev("localStorage.clear()"); await send("Page.reload", {}, sid); await sleep(800);
console.log(await ev(`(()=>{DrinkMixer.fillInventory(1000);document.querySelector("#invBtn").click();
  const codes=JSON.parse(localStorage.getItem("fw.inv")).items.slice(0,200).map(x=>x[0]);
  let t=performance.now();codes.forEach(c=>thumbURL(c));const per=(performance.now()-t)/200;
  t=performance.now();for(let i=0;i<20;i++)renderCells(true);const rc=(performance.now()-t)/20;
  return "thumb ms/each="+per.toFixed(2)+" renderCells(force, cached)="+rc.toFixed(2)+"ms avg url len="+Math.round(codes.reduce((a,c)=>a+thumbURL(c).length,0)/200);})()`));
console.log(await ev(`new Promise(res=>{const sc=document.querySelector("#invScroll");const max=sc.scrollHeight-sc.clientHeight;let i=0,last=performance.now(),d=[];
  function f(now){d.push(now-last);last=now;sc.scrollTop=Math.min(max,i*(max/120));i++;if(i<=124)requestAnimationFrame(f);else{d=d.slice(3).sort((a,b)=>b-a);res("frames worst="+d.slice(0,5).map(Math.round)+" median="+Math.round(d[d.length>>1]));}}
  requestAnimationFrame(f);})`));
console.log(await ev(`new Promise(res=>{let last=performance.now(),d=[],i=0;function f(now){d.push(now-last);last=now;if(++i<90)requestAnimationFrame(f);else{d=d.slice(3).sort((a,b)=>b-a);res("idle frames (inventory open, no scroll) worst="+d.slice(0,3).map(Math.round)+" median="+Math.round(d[d.length>>1]));}}requestAnimationFrame(f);})`));
console.log(await ev(`new Promise(res=>{document.querySelector("#invClose").click();let last=performance.now(),d=[],i=0;function f(now){d.push(now-last);last=now;if(++i<90)requestAnimationFrame(f);else{d=d.slice(3).sort((a,b)=>b-a);res("idle frames (machine, inventory closed) worst="+d.slice(0,3).map(Math.round)+" median="+Math.round(d[d.length>>1]));}}requestAnimationFrame(f);})`));
ws.close(); ch.kill("SIGTERM"); await sleep(300); rmSync(prof, { recursive: true, force: true });
