// Drives docs/drinkmixer/index.html in headless Chrome over the DevTools protocol (no extra packages).
// Usage (from the repo root): node tests/drinkmixer/run_cujs.mjs [phone|land|desktop|all] [en|es|de|all]
//   all / all (the default) runs the main journey in every language at every size (one Chrome per language, in
//   parallel), then extras.mjs (languages, text size, top bar) share.mjs (names, share links), leftovers.mjs (what stays in the glass after DRINK) and share_pic.mjs (the shared picture), then visuals.mjs
//   (every ingredient visible); `... extras` runs only those three.
import { spawn } from "node:child_process";
import { findChrome } from "./cdp.mjs";
import { LEAKS, LAYOUT } from "./i18n_checks.mjs";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PAGE = "file://" + join(ROOT, "docs/drinkmixer/index.html");
const SHOTS = join(ROOT, "scratch/screenshots/drinkmixer"); mkdirSync(SHOTS, { recursive: true });
const which = process.argv[2] || "all", langArg = process.argv[3] || "all";
const LANG_OS = { en: "en-US", es: "es-ES", de: "de-DE" };
if (which === "extras" || langArg === "all") {
  // orchestrate: one child process per language (+ the extras), in parallel; print their results and one RESULT line
  // the three journeys run side by side; the extras (which run three Chromes themselves) afterwards, so timing checks
  // (pour checklist, scroll frame times) are not starved of CPU
  const kids = new Set();
  const run = a => new Promise(res => { let o = ""; const c = spawn(process.execPath, a, { cwd: ROOT }); kids.add(c);
    const t = setTimeout(() => c.kill("SIGTERM"), 18 * 60000); // children clean up their Chrome on SIGTERM
    c.stdout.on("data", d => o += d); c.stderr.on("data", d => o += d); c.on("close", code => { clearTimeout(t); kids.delete(c); res({ o, code }); }); });
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { for (const c of kids) c.kill("SIGTERM"); setTimeout(() => process.exit(1), 2000); });
  const outs = which === "extras" ? [] : await Promise.all(Object.keys(LANG_OS).map(l => run([join(HERE, "run_cujs.mjs"), which, l])));
  outs.push(...await Promise.all([run([join(HERE, "extras.mjs")]), run([join(HERE, "share.mjs")]), run([join(HERE, "leftovers.mjs")])]));
  outs.push(await run([join(HERE, "share_pic.mjs")])); // after the parallel batch: it renders big pictures
  outs.push(await run([join(HERE, "visuals.mjs")])); // alone: it measures scrolling smoothness
  let pass = 0, fail = 0;
  for (const { o, code } of outs) { for (const l of o.split("\n")) { if (l.startsWith("PASS ")) pass++; else if (l.startsWith("FAIL ")) fail++; if (/^(PASS|FAIL|note:) /.test(l)) console.log(l); }
    if (code && !/^FAIL /m.test(o)) { fail++; console.log("FAIL child crashed: " + o.slice(-400)); } }
  console.log(fail ? `RESULT: ${fail} FAILED, ${pass} passed` : `RESULT: ALL ${pass} PASSED`);
  process.exit(fail ? 1 : 0);
}
const LANG = langArg, OS_LANG = LANG_OS[LANG];
const VIEWS = { phone: [360, 740, true], land: [740, 360, true], desktop: [1280, 800, false] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), "dmprof-"));
const chrome = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + prof,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--allow-file-access-from-files", "--mute-audio", "--lang=" + OS_LANG, "about:blank"], { stdio: "ignore" });
console.log("chrome pid", chrome.pid);
// never leave Chrome behind, never hang: stop on Ctrl-C / SIGTERM, and give up after 15 minutes
const stopNow = why => { results.push("FAIL harness: " + why); fails++; try { chrome.kill("SIGKILL"); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {}
  console.log(results.join("\n")); console.log(`RESULT: ${fails} FAILED`); process.exit(1); };
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stopNow("stopped by " + sig));
setTimeout(() => stopNow("run took longer than 15 min"), 15 * 60000).unref();
let results = [], fails = 0;
const ok = (name, cond, extra) => { results.push((cond ? "PASS " : "FAIL ") + LANG + "_" + name + (extra ? "  " + extra : "")); if (!cond) fails++; };

let ws, idc = 0, pend = new Map(), sid, errors = [], external = [];
function send(method, params = {}, s = sid, ms = 45000) {
  const id = ++idc; ws.send(JSON.stringify({ id, method, params, sessionId: s || undefined }));
  return new Promise((res, rej) => { pend.set(id, { res, rej, method }); // a call that never answers fails the run instead of hanging it
    setTimeout(() => { if (pend.has(id)) { pend.delete(id); rej(new Error("timeout: " + method + " " + JSON.stringify(params).slice(0, 80))); } }, ms).unref(); });
}
async function connect() {
  let info;
  for (let i = 0; i < 50; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(p.method + ": " + m.error.message)) : p.res(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push("exception: " + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) errors.push("console." + m.params.type + ": " + m.params.args.map(a => a.value || a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push("log: " + m.params.entry.text);
    if (m.method === "Network.requestWillBeSent") { const u = m.params.request.url; if (!u.startsWith("file:") && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u); }
  };
}
async function newPage(w, h, mobile) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null);
  ({ sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, null));
  await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  // the OS language, as the browser reports it to the page (navigator.languages) before it loads
  const ua = (await send("Browser.getVersion", {}, null)).userAgent.replace("HeadlessChrome", "Chrome");
  await send("Emulation.setUserAgentOverride", { userAgent: ua, acceptLanguage: OS_LANG + "," + LANG });
  await send("Emulation.setLocaleOverride", { locale: OS_LANG });
  return targetId;
}
async function ev(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + expr + " -> " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; }
let touch = false; const touchRetries = [];
async function tap(sel, label) {
  const box = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
  if (!box) { ok("tap target exists: " + (label || sel), false); return false; }
  await sleep(60);
  const b2 = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  let viaMouse = !touch;
  if (touch) {
    try {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b2.x, y: b2.y }] }, sid, 8000);
      await sleep(40);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, sid, 8000);
    } catch (e) { // headless Chrome under heavy load can lose a touch acknowledgement: cancel it and click instead
      touchRetries.push(label || sel); await send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }, sid, 8000).catch(() => {}); viaMouse = true; }
  }
  if (viaMouse) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: b2.x, y: b2.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: b2.x, y: b2.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b2.x, y: b2.y, button: "left", clickCount: 1 });
  }
  await sleep(140);
  return true;
}
async function shot(name) { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, name + ".png"), Buffer.from(data, "base64")); }
async function waitFor(expr, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(100); } return false; }
const st = () => ev("DrinkMixer.state()");

async function layoutChecks(tag) {
  const r = await ev(LAYOUT);
  ok(tag + ": no horizontal page overflow, no page scroll", !r.overflowX && !r.pageScroll);
  ok(tag + ": machine fits the viewport", r.machineFits);
  ok(tag + ": tap targets >= 44px (top bar exempt)", r.small.length === 0, r.small.slice(0, 6).join("; "));
  ok(tag + ": no text spilling out of controls", r.clipped.length === 0, r.clipped.slice(0, 4).join("; "));
  ok(tag + ": no word split in the middle", r.broken.length === 0, [...new Set(r.broken)].slice(0, 6).join("; "));
  ok(tag + ": top bar one row, game UI below it", r.barOneRow && r.underBar);
  if (LANG !== "en") { const leaks = await ev(LEAKS); ok(tag + ": no English text on screen", leaks.length === 0, leaks.slice(0, 6).join(" | ")); }
}
const say = (key, vars) => ev(`i18n(${JSON.stringify(key)},${JSON.stringify(vars || {})})`);

async function runView(vname) {
  const [w, h, mobile] = VIEWS[vname]; touch = mobile;
  errors = []; external = [];
  const tid = await newPage(w, h, mobile);
  await send("Page.navigate", { url: PAGE }); await sleep(800);
  await ev("localStorage.clear()"); await send("Page.reload"); await sleep(900);
  const P = vname + "_";
  ok(P + "page language is " + LANG + " (OS language " + OS_LANG + ")", (await ev("document.documentElement.lang")) === LANG && (await ev("L102.lang")) === LANG);
  // CUJ-1
  let s = await st();
  ok(P + "CUJ-1 first look: step 1, soda preselected", s.step === 0 && s.order.startsWith("soda|"));
  ok(P + "CUJ-12 sound off by default", (await ev(`document.querySelector("#soundBtn").getAttribute("aria-pressed")`)) === "false");
  await shot(LANG + "_" + P + "01_first");
  await layoutChecks(P + "choose");
  // CUJ-2
  await tap('[data-act=product][data-id=boba]');
  s = await st(); ok(P + "CUJ-2 bubble tea selected", s.order.startsWith("boba|"));
  ok(P + "CUJ-10 tapioca added for bubble tea", s.order.split("|")[7] === "tapioca");
  await tap('[data-act=next]');
  // CUJ-3 flavours: as many as you like (a 5th is fine), numbered in pour order; filters; Wild last
  ok(P + "CUJ-3 Popular filter is the default", (await ev(`document.querySelector("[data-act=cat][aria-pressed=true]").dataset.id`)) === "popular");
  await tap('[data-act=cat][data-id=tea]'); await tap('[data-act=flavour][data-id=taro]');
  await tap('[data-act=cat][data-id=fruit]'); await tap('[data-act=flavour][data-id=mango]'); await tap('[data-act=flavour][data-id=strawberry]'); await tap('[data-act=flavour][data-id=lychee]');
  await tap('[data-act=flavour][data-id=peach]');
  s = await st(); ok(P + "CUJ-3 no limit: a 5th flavour is added, in pick order", s.order.split("|")[1] === "taro,mango,strawberry,lychee,peach", s.order);
  ok(P + "CUJ-3 the tray numbers all five", (await ev(`document.querySelectorAll(".tray .pick").length`)) === 5);
  await tap('[data-act=flavour][data-id=peach]');
  await shot(LANG + "_" + P + "02_flavours");
  await tap('[data-act=unflavour][data-id=strawberry]'); s = await st(); ok(P + "CUJ-3 remove from tray", s.order.split("|")[1] === "taro,mango,lychee");
  await tap('[data-act=flavour][data-id=strawberry]');
  await tap('[data-act=cat][data-id=popular]');
  ok(P + "CUJ-23 wild flavours hidden under Popular", !(await ev(`!!document.querySelector('[data-act=flavour][data-id=tamarind]')`)));
  await tap('[data-act=cat][data-id=wild]');
  ok(P + "CUJ-23 Wild filter shows the odd ones", await ev(`!!document.querySelector('[data-act=flavour][data-id=tamarind]')`));
  await tap('[data-act=cat][data-id=all]');
  ok(P + "CUJ-23 All lists the wild ones last", await ev(`(()=>{const ids=[...document.querySelectorAll("[data-act=flavour]")].map(b=>FL[b.dataset.id].cat==="wild");return ids.indexOf(true)>0&&ids.slice(ids.indexOf(true)).every(Boolean);})()`));
  await tap('[data-act=next]');
  // CUJ-4 Mix page: base, mix style, ice amount + shape, size
  await tap('[data-act=base][data-id=milk]'); await tap('[data-act=mix][data-id=spiral]'); await tap('[data-act=l2][data-id="4"]'); await tap('[data-act=icetype][data-id=crushed]'); await tap('[data-act=size][data-id=L]');
  s = await st(); ok(P + "CUJ-4 base/mix/ice/size", /^boba\|taro,mango,lychee,strawberry\|3\|4\|L\|spiral\|/.test(s.order) && s.order.split("|")[11] === "milk" && s.order.split("|")[13] === "crushed", s.order);
  await shot(LANG + "_" + P + "03_mix");
  await tap('[data-act=next]');
  // CUJ-24 Taste page: sweetener, sweetness, popping candy, rim, then the daring twists at the end
  await tap('[data-act=sweet][data-id=honey]');
  ok(P + "CUJ-24 several sweeteners at once", (await st()).order.split("|")[8] === "sugar,honey");
  await tap('[data-act=sweet][data-id=sugar]'); await tap('[data-act=sugar][data-id="4"]'); await tap('[data-act=popc][data-id="1"]'); await tap('[data-act=rim][data-id=rainbow]');
  ok(P + "CUJ-24 daring twists sit below the classics", await ev(`(()=>{const d=document.querySelector(".daring"),r=document.querySelector("[data-act=rim]");return d&&r.getBoundingClientRect().top<d.getBoundingClientRect().top})()`));
  await tap('[data-act=sour][data-id="2"]'); await tap('[data-act=spicy][data-id="3"]'); await tap('[data-act=salty][data-id="1"]');
  s = await st(); const f = s.order.split("|"); ok(P + "CUJ-24 taste saved in the recipe", f[2] === "4" && f[8] === "honey" && f[9] === "rainbow" && f[14] === "2" && f[15] === "3" && f[16] === "1" && f[17] === "1", s.order);
  await shot(LANG + "_" + P + "03b_taste");
  await tap('[data-act=next]');
  // CUJ-5
  await tap('[data-act=boost][data-id=vitc]'); await tap('[data-act=boost][data-id=b12]');
  s = await st(); ok(P + "CUJ-5 boosts", s.order.split("|")[6] === "vitc,b12");
  await tap('[data-act=next]');
  // CUJ-6 toppings: no limit, creams stack, Wild and Crazy hidden by default
  ok(P + "CUJ-23 wild toppings hidden under Popular", !(await ev(`!!document.querySelector('[data-act=topping][data-id=chiliflakes]')`)));
  for (const t of ["whipped", "sprinkles", "f_straw", "cherry", "scoop_van", "crystal", "stars", "f_blue", "hearts"]) await tap(`[data-act=topping][data-id=${t}]`);
  await tap('[data-act=topping][data-id=chips]'); // 11 with the tapioca: no limit
  s = await st(); ok(P + "CUJ-6 no limit: eleven toppings combined", s.order.split("|")[7].split(",").length === 11, s.order);
  await tap('[data-act=topping][data-id=whipped]'); await tap('[data-act=topping][data-id=chocwhip]'); await tap('[data-act=topping][data-id=strawwhip]');
  s = await st(); ok(P + "CUJ-6 creams stack (two at once)", s.order.split("|")[7].split(",").filter(x => /whip/.test(x)).join() === "chocwhip,strawwhip", s.order);
  ok(P + "CUJ-6 crazy toys hidden under Popular", !(await ev(`!!document.querySelector('[data-act=topping][data-id=goldfish]')`)));
  await tap('[data-act=tcat][data-id=crazy]');
  ok(P + "CUJ-6 Crazy filter shows the toys", await ev(`!!document.querySelector('[data-act=topping][data-id=goldfish]')&&[...document.querySelectorAll("[data-act=topping]")].every(b=>TO[b.dataset.id].crazy)`));
  ok(P + "CUJ-6 only fitting toppings shown (no lemon for bubble tea)", !(await ev(`!!document.querySelector('[data-act=topping][data-id=lemon]')`)));
  await tap('[data-act=tcat][data-id=fruit]');
  ok(P + "CUJ-6 topping category filter", await ev(`[...document.querySelectorAll("[data-act=topping]")].every(b=>TO[b.dataset.id].kind==="fruit")`));
  await tap('[data-act=tcat][data-id=popular]');
  await shot(LANG + "_" + P + "04_toppings");
  await tap('[data-act=next]');
  // CUJ-7
  const rec = await ev(`document.querySelector(".receipt").innerText`);
  const nTop = (await st()).order.split("|")[7].split(",").length;
  const wantRec = LANG === "en" ? ["Bubble Tea", "Taro", "Mango", "Vitamin C", "+ " + (nTop - 6) + " more", "Vanilla Scoop", "Honey 100%", "Milk base", "Spiral", "crushed ice", "Sour", "Spicy: Very hot", "Rainbow rim"]
    : await ev(`[PRODUCTS.boba.name,FL.taro.name,FL.mango.name,BO.vitc.name,i18n("more",{n:${nTop - 6}}),TO.scoop_van.name,i18n("sweetAmt",{sw:SWEETENERS[1][1],amt:"100%",pct:true}),
        i18n("baseOf",{b:BASES.find(b=>b[0]==="milk")[1]}),MIXES[2][1],iceWord("crushed"),SOUR[2],i18n("spicyOf",{x:SPICY[3]}),i18n("rimOf",{x:RIMS[2][1]})]`);
  ok(P + "CUJ-7 receipt lists choices", wantRec.every(x => rec.includes(x)), wantRec.filter(x => !rec.includes(x)).join(", ") + " :: " + rec.replace(/\s+/g, " ").slice(0, 300));
  ok(P + "CUJ-24 sour face and chili badges on the order card", await ev(`document.querySelectorAll(".receipt .tb svg").length>=3`));
  await shot(LANG + "_" + P + "05_order");
  await layoutChecks(P + "order");
  // CUJ-8
  await tap('[data-act=pour]');
  ok(P + "CUJ-8 pour started", (await st()).phase === "pour");
  ok(P + "CUJ-8 checklist in " + LANG, (await ev(`document.querySelector("#plist li").textContent`)) === (await say("evCup")));
  await sleep(3200);
  const okCount = await ev(`document.querySelectorAll("#plist li.ok").length`);
  ok(P + "CUJ-8 checklist advancing", okCount >= 3, "ok=" + okCount);
  await shot(LANG + "_" + P + "06_pouring");
  await layoutChecks(P + "pouring");
  const served = await waitFor(`DrinkMixer.state().phase==="served"`, 20000);
  ok(P + "CUJ-8/9 reaches served", served);
  await sleep(500); await shot(LANG + "_" + P + "07_served");
  await layoutChecks(P + "served");
  // CUJ-16 save
  await tap('[data-act=save]');
  s = await st(); ok(P + "CUJ-16 save adds to the collection", s.inv === 1);
  ok(P + "CUJ-16 save button disabled after saving", await ev(`document.querySelector("[data-act=save]").disabled`));
  // CUJ-17 drink
  await tap('[data-act=drink]'); await sleep(1000); await shot(LANG + "_" + P + "08_drinking");
  const eat = await ev(`(()=>{const g=document.querySelector("#gEat");const masked=[...document.querySelectorAll("#dyn [mask]")].length;return{y:+g.getAttribute("y1"),masked}})()`);
  ok(P + "CUJ-17 eat mask sweeping over the contents", eat.masked >= 3 && eat.y > 0, JSON.stringify(eat));
  await sleep(450); await shot(LANG + "_" + P + "08b_drinking_later");
  ok(P + "CUJ-17 drink animation then clean glass", await waitFor(`DrinkMixer.state().phase==="choose"`, 5000));
  s = await st(); ok(P + "CUJ-17 clean glass keeps the treat, empties the recipe", s.order.startsWith("boba||") && s.step === 0, s.order);
  await sleep(800); await shot(LANG + "_" + P + "09_clean_glass");
  // CUJ-11 surprise + skip + reset (CUJ-18)
  await tap('#surpriseBtn'); s = await st(); ok(P + "CUJ-11 surprise -> order step with a flavour", s.step === 6 && s.order.split("|")[1].length > 0, s.order);
  await tap('[data-act=pour]'); await sleep(400); await tap('[data-act=skip]');
  ok(P + "CUJ-8 skip", await waitFor(`DrinkMixer.state().phase==="served"`, 3000));
  await tap('[data-act=reset]'); await sleep(900); await shot(LANG + "_" + P + "10_sink");
  ok(P + "CUJ-18 reset -> sink -> clean glass", await waitFor(`DrinkMixer.state().phase==="choose"`, 5000));
  // CUJ-14 soft-serve
  await tap('[data-act=product][data-id=soft]'); await tap('[data-step="1"]'); await tap('[data-act=cat][data-id=all]');
  await tap('[data-act=flavour][data-id=vanilla]'); await tap('[data-act=flavour][data-id=strawberry]'); await tap('[data-act=flavour][data-id=matcha]');
  await tap('[data-step="2"]'); await tap('[data-act=l2][data-id="5"]'); await tap('[data-act=size][data-id=waffle]');
  await tap('[data-step="5"]'); for (const t of ["sauce_choc", "sprinkles", "f_blue", "cherry", "wafer", "macaron", "lolly"]) await tap(`[data-act=topping][data-id=${t}]`);
  await tap('[data-step="6"]'); await tap('[data-act=pour]'); await sleep(2600); await shot(LANG + "_" + P + "11_soft_pouring");
  await waitFor(`DrinkMixer.state().phase==="served"`, 20000); await sleep(400); await shot(LANG + "_" + P + "12_soft_served");
  await tap('[data-act=save]');
  // float: soda + cola + chocolate scoop, mega bubbles
  await tap('[data-act=reset]'); await waitFor(`DrinkMixer.state().phase==="choose"`, 5000);
  await tap('[data-act=product][data-id=soda]'); await tap('[data-step="1"]'); await tap('[data-act=cat][data-id=all]'); await tap('[data-act=flavour][data-id=cola]'); await tap('[data-act=flavour][data-id=cherry]');
  await tap('[data-step="2"]'); await tap('[data-act=l2][data-id="5"]');
  await tap('[data-step="5"]'); await tap('[data-act=tcat][data-id=all]'); for (const t of ["scoop_choc", "lemon", "umbrella", "gummy", "lime", "chili"]) await tap(`[data-act=topping][data-id=${t}]`);
  await tap('[data-step="6"]'); await tap('[data-act=pour]'); await sleep(400); await tap('[data-act=skip]');
  await waitFor(`DrinkMixer.state().phase==="served"`, 3000); await sleep(1200); await shot(LANG + "_" + P + "13_float_served");
  const bub = await ev(`[...document.querySelectorAll("#dyn circle")].filter(c=>+c.getAttribute("opacity")>0&&c.getAttribute("stroke")==="#ffffff").length`);
  ok(P + "CUJ-4 bubbles visible for MEGA fizz", bub >= 30, "bubbles=" + bub);
  await tap('[data-act=save]');
  ok(P + "CUJ-16 three saved", (await st()).inv === 3);
  // CUJ-25 the new treats each pour and serve
  for (const [pid, extra] of [["energy", "ombre"], ["sports", "marble"], ["coffee", "blend"], ["hotchoc", "layers"], ["lemonade", "spiral"], ["icedtea", "ombre"]]) {
    await tap('[data-act=reset]'); await waitFor(`DrinkMixer.state().phase==="choose"`, 5000);
    await tap(`[data-act=product][data-id=${pid}]`); await tap('[data-step="1"]');
    await tap('#pane [data-act=flavour]:nth-child(1)'); await tap('#pane [data-act=flavour]:nth-child(2)');
    await tap('[data-step="2"]'); await tap(`[data-act=mix][data-id=${extra}]`);
    if (pid !== "hotchoc") { await tap('[data-act=icetype][data-id=stars]'); if (await ev(`!!document.querySelector('[data-act=ice][data-id="4"]')`)) await tap('[data-act=ice][data-id="4"]'); else await tap('[data-act=l2][data-id="4"]'); }
    await tap('[data-step="6"]'); await tap('[data-act=pour]'); await sleep(300); await tap('[data-act=skip]');
    const okp = await waitFor(`DrinkMixer.state().phase==="served"`, 4000);
    s = await st(); ok(P + "CUJ-25 " + pid + " served (" + extra + ")", okp && s.order.startsWith(pid + "|") && s.order.split("|")[5] === extra, s.order);
    await sleep(700); await shot(LANG + "_" + P + "13_" + pid);
  }
  await tap('[data-act=save]');
  // CUJ-19 inventory with 1000+ drinks
  await ev("DrinkMixer.fillInventory(1000)");
  await tap('#invBtn'); await sleep(500);
  ok(P + "CUJ-19 inventory opens", await ev(`!document.querySelector("#inv").hidden`));
  const cells = await ev(`document.querySelectorAll("#invSpacer .icell").length`);
  ok(P + "CUJ-19 virtualised (few cells in DOM for 1003 drinks)", cells > 0 && cells < 80, "cells=" + cells);
  await sleep(600);
  await waitFor(`document.querySelectorAll("#invSpacer img[data-code]").length===0`, 5000);
  const imgsOk = await ev(`[...document.querySelectorAll("#invSpacer img")].slice(0,6).every(i=>i.complete&&i.naturalWidth>100)`);
  ok(P + "CUJ-19 thumbnails render", imgsOk);
  await shot(LANG + "_" + P + "14_inventory");
  await layoutChecks(P + "inventory");
  // smooth scrolling: scroll through the whole list in steps, measure the worst frame
  // one retry: with three Chromes running side by side a single frame can be starved by the other processes
  const fling = () => ev(`new Promise(res=>{const sc=document.querySelector("#invScroll");const max=sc.scrollHeight-sc.clientHeight;let i=0,last=performance.now(),worst=0,frames=0;
    function f(now){const dt=now-last;last=now;if(i>2)worst=Math.max(worst,dt);frames++;sc.scrollTop=Math.min(max,i*(max/120));i++;if(i<=124)requestAnimationFrame(f);else res({worst:Math.round(worst),max,cells:document.querySelectorAll("#invSpacer .icell").length});}
    requestAnimationFrame(f);})`);
  let perf = await fling();
  if (perf.worst >= 50) { await ev(`document.querySelector("#invScroll").scrollTop=0`); await sleep(1500); const p2 = await fling(); p2.firstTry = perf.worst; perf = p2; }
  ok(P + "CUJ-19 scroll through 1003 drinks, worst frame < 50 ms (fast fling, cold thumbnails)", perf.worst < 50, JSON.stringify(perf));
  await waitFor(`document.querySelectorAll("#invSpacer img[data-code]").length===0`, 5000); await sleep(300); await shot(LANG + "_" + P + "15_inventory_bottom");
  ok(P + "CUJ-19 thumbnails filled in after scrolling", (await ev(`document.querySelectorAll("#invSpacer img[data-code]").length`)) === 0);
  await ev(`document.querySelector("#invScroll").scrollTop=0`); await sleep(300);
  // CUJ-20 recipe card
  const firstNo = await ev(`document.querySelector("#invSpacer .icell").dataset.inv`);
  await tap('#invSpacer .icell');
  ok(P + "CUJ-20 recipe card shows how it was made", (await ev(`document.querySelector("#invDetail").innerText`)).includes(await say("howMade")));
  await shot(LANG + "_" + P + "16_recipe");
  await layoutChecks(P + "recipe");
  // CUJ-21 remove with confirm: cancel, then confirm
  await tap('[data-iact=remove]'); await shot(LANG + "_" + P + "17_confirm");
  ok(P + "CUJ-21 confirm question in " + LANG, (await ev(`document.querySelector(".confirm p").textContent`)) === (await say("confirmQ")));
  ok(P + "CUJ-21 confirmation shown", await ev(`!!document.querySelector("[data-iact=really]")`));
  await tap('[data-iact=keep]'); ok(P + "CUJ-21 cancel keeps it", (await st()).inv === 1004);
  await tap('[data-iact=remove]'); await tap('[data-iact=really]');
  ok(P + "CUJ-21 confirm removes it", (await st()).inv === 1003);
  ok(P + "CUJ-21 removed drink gone from the grid", !(await ev(`!!document.querySelector('#invSpacer [data-inv="${firstNo}"]')`)));
  const persisted = await ev(`JSON.parse(localStorage.getItem("fw.inv")).items.length`);
  ok(P + "CUJ-21 removal persisted", persisted === 1003);
  // CUJ-22 reproduce
  await tap('#invSpacer .icell');
  const code = await ev(`(()=>{const no=+document.querySelector("#invDetail")&&0;return null})()`);
  const want = await ev(`(()=>{const it=JSON.parse(localStorage.getItem("fw.inv")).items;return it[it.length-1][0]})()`);
  await tap('[data-iact=make]');
  s = await st(); ok(P + "CUJ-22 reproduce loads the exact recipe", s.order === want && s.step === 6 && s.phase === "choose", s.order + " vs " + want);
  await shot(LANG + "_" + P + "18_reproduced");
  // persistence across reload
  await send("Page.reload"); await sleep(900);
  ok(P + "CUJ-19 collection persists across reload", (await st()).inv === 1003);
  // CUJ-12 sound toggle
  await tap('#soundBtn'); ok(P + "CUJ-12 sound on", (await ev(`document.querySelector("#soundBtn").getAttribute("aria-pressed")`)) === "true");
  await tap('#soundBtn'); ok(P + "CUJ-12 sound off again", (await ev(`document.querySelector("#soundBtn").getAttribute("aria-pressed")`)) === "false");
  // CUJ-15 reduced motion
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await tap('#surpriseBtn'); await tap('[data-act=pour]'); const t0 = Date.now();
  ok(P + "CUJ-15 reduced motion: served quickly", await waitFor(`DrinkMixer.state().phase==="served"`, 4000), (Date.now() - t0) + " ms");
  ok(P + "CUJ-15 no confetti", (await ev(`document.querySelectorAll("#confetti i").length`)) === 0);
  await send("Emulation.setEmulatedMedia", { features: [] });
  ok(P + "no console errors", errors.length === 0, errors.slice(0, 5).join(" | "));
  ok(P + "no network requests outside the file", external.length === 0, external.slice(0, 3).join(" "));
  await send("Target.closeTarget", { targetId: tid }, null);
}
try {
  await connect();
  for (const v of which === "all" ? Object.keys(VIEWS) : [which]) await runView(v);
} catch (e) { results.push("FAIL harness: " + e.message); fails++; }
finally {
  try { ws.close(); } catch {}
  chrome.kill("SIGTERM"); await sleep(500); try { rmSync(prof, { recursive: true, force: true }); } catch {}
  console.log(results.join("\n"));
  if (touchRetries.length) console.log("note: " + touchRetries.length + " touch tap(s) were not acknowledged by Chrome and were done as a click: " + touchRetries.join(", "));
  console.log(fails ? `RESULT: ${fails} FAILED` : `RESULT: ALL ${results.length} PASSED`);
  process.exit(fails ? 1 : 0);
}
