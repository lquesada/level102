// Fluid: liquid toy. Usage (repo root): node tests/fluid/run.mjs
// Checks every size, OS languages and text sizes: bar, favicon, texts, tap targets; the liquid stays in its vessel,
// follows keys / phone motion / drag, shape cycle full -> circle -> square -> full (saved), colour (saved), idle loop.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { launch, ROOT, sleep, checker, shotsDir } from "../lib/cdp.mjs";

const { ok, summary } = checker();
const URL = "file://" + join(ROOT, "docs", "fluid", "index.html"), SHOTS = shotsDir("fluid");
const VIEWS = { phone: [360, 740, true], small: [320, 568, true], land: [740, 360, true], tablet: [820, 1180, true], desktop: [1280, 800, false] };
const NAMES = { "en-US": "Fluid", "es-ES": "Fluido", "de-DE": "Flüssigkeit", "fr-FR": "Fluid" };
const ENGLISH = /Tilt and shake|Drag the liquid|Change shape|Change color|Shake\b/;

const html = readFileSync(join(ROOT, "docs", "fluid", "index.html"), "utf8");
ok("favicon right after <title>", /<title>[^<]*<\/title>\s*<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/.test(html));
ok("no external resources in the page", !/(src|href)="https?:\/\/(?!level102\.com)/.test(html.replace(/<meta[^>]*>/g, "")));

const UI = `(() => { const r = e => e.getBoundingClientRect(), bar = r(document.getElementById('l102bar')), st = r(document.getElementById('stage'));
  const btns = [...document.querySelectorAll('#tools button')].map(r), hint = document.getElementById('hint'), hr = r(hint);
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return { barRow: [...document.querySelectorAll('#l102bar > :not(.l102sp)')].every(e => r(e).top < 10), stageBelowBar: st.top >= bar.bottom - .5,
    small: btns.filter(b => b.width < 44 || b.height < 44).length, btnInside: btns.every(b => b.left >= 0 && b.right <= innerWidth && b.top >= st.top && b.bottom <= innerHeight),
    btnOverlap: btns.some((b, i) => btns.some((c, j) => i < j && hit(b, c))),
    hintOk: hint.classList.contains('off') || (hr.left >= 0 && hr.right <= innerWidth && hr.top >= st.top && !btns.some(b => hit(b, hr))),
    scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    texts: [document.title, document.getElementById('hText').textContent, ...[...document.querySelectorAll('#tools button')].map(b => b.getAttribute('aria-label'))].join(' | ') }; })()`;
const settle = async (ev, ms = 9000) => { for (let t = 0; t < ms; t += 300) { await sleep(300); if (await ev("FL.maxSpeed() < FL.S() * 6")) return true; } return false; };

// 1) every size x languages x text sizes: layout, texts, liquid in place
for (const [vname, [W, H, touch]] of Object.entries(VIEWS)) for (const lang of Object.keys(NAMES)) for (const fs of (vname === "phone" || vname === "desktop" ? [0.8, 1.8] : [1.1])) {
  if (fs !== 1.1 && lang === "fr-FR") continue;
  if (vname !== "phone" && vname !== "desktop" && lang !== "en-US" && lang !== "de-DE") continue;
  const b = await launch({ url: URL, width: W, height: H, touch, lang }), { ev } = b, tag = `${vname}_${lang}_${fs}`, T = s => `${tag}: ${s}`;
  try {
    ok(T("title translated on the first frame"), await ev("document.title") === NAMES[lang], await ev("document.title"));
    if (fs !== 1.1) { await ev(`localStorage.setItem('l102.fs','${fs}'); true`); await b.send("Page.reload", {}); await sleep(700); }
    const intro = await ev(`(() => { const el = document.getElementById('intro'), bs = [...el.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.getBoundingClientRect());
      return { shown: !el.hidden, text: el.textContent, small: bs.filter(r => r.height < 44 || r.width < 44).length, fits: bs.every(r => r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight) }; })()`);
    ok(T(touch ? "phone: a start card asks for a tap first (fits, big buttons, translated)" : "computer: no start card"), touch ? intro.shown && !intro.small && intro.fits && (lang.startsWith("en") || lang === "fr-FR" || !/Start|Tilt and shake/.test(intro.text)) : !intro.shown, JSON.stringify(intro));
    if (touch) { const r = await ev("(() => { const r = document.getElementById('iStart').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"); await b.tap(r[0], r[1]); await sleep(200);
      ok(T("tapping Start closes the card"), await ev("document.getElementById('intro').hidden")); }
    const u = await ev(UI);
    ok(T("bar one row, stage below it, nothing scrolls"), u.barRow && u.stageBelowBar && !u.scroll, JSON.stringify(u));
    ok(T("tool buttons >= 44px, on screen, not overlapping; hint clear of them"), !u.small && u.btnInside && !u.btnOverlap && u.hintOk, JSON.stringify(u));
    ok(T("texts translated (no English in es/de)"), lang.startsWith("en") || lang === "fr-FR" || !ENGLISH.test(u.texts), u.texts);
    await settle(ev);
    const m = await ev("({n: FL.n, t: FL.target(), out: FL.outside(3), com: FL.com(), size: FL.size()})");
    const paint = await ev(`(() => { const c = document.getElementById('liquid'), x = c.getContext('2d'), w = c.width, h = c.height; let n = 0, on = 0;
      const d = x.getImageData(0, 0, w, h).data; for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) { const px = Math.floor(w * (.08 + .84 * i / 39)), py = Math.floor(h * (.82 + .14 * j / 39)); n++; if (d[(py * w + px) * 4 + 3] > 200) on++; }
      return on / n; })()`);
    ok(T("the liquid is painted solid where it rests (no missing parts)"), paint > .95, String(paint));
    ok(T("liquid: the right amount, all inside the vessel, resting at the bottom"), m.n === m.t && m.n > 200 && m.out === 0 && m.com[1] > m.size[1] * .55, JSON.stringify(m));
    if (["phone_en-US_0.8", "phone_es-ES_1.8", "small_de-DE_1.1", "land_en-US_1.1", "tablet_de-DE_1.1", "desktop_de-DE_1.8"].includes(tag)) await b.shot(join(SHOTS, `${tag}.png`));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
}

// 2) interaction: keys, phone motion, shake, drag, shapes, colours, language switch, idle
for (const [vname, [W, H, touch]] of [["phone", VIEWS.phone], ["desktop", VIEWS.desktop], ["land", VIEWS.land]]) {
  const b = await launch({ url: URL, width: W, height: H, touch }), { ev, send } = b, T = s => `${vname}: ${s}`;
  try {
    if (touch) { await ev("document.getElementById('iStart').click(), true"); await sleep(100); }
    await settle(ev);
    const c0 = await ev("FL.com()");
    await ev("dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'})), true"); await sleep(1500);
    const c1 = await ev("FL.com()");
    ok(T("arrow left: the liquid flows left"), c1[0] < c0[0] - W * .08, JSON.stringify([c0, c1]));
    await ev("dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp'})), true"); await sleep(1500);
    const c2 = await ev("FL.com()");
    ok(T("arrow up: the liquid falls up"), c2[1] < c1[1] - H * .1 && await ev("FL.outside(3)") === 0, JSON.stringify([c1, c2]));
    await ev("dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'})), true"); await settle(ev);
    // phone motion: device tilted so gravity pulls to the right of the screen (portrait / angle 0)
    for (let i = 0; i < 25; i++) { await ev("dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:-9.6,y:1,z:1}})), true"); await sleep(40); }
    await sleep(800);
    const g = await ev("FL.gravity()"), c3 = await ev("FL.com()");
    if (touch) { // phone lying flat: the liquid spreads thinner and turns a bit see-through
      const before = await ev("FL.outside(-1e9)");   // = particle count, just to have a number
      const area0 = await ev(`(() => { const c = document.getElementById('liquid'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 20) n++; return n; })()`);
      for (let i = 0; i < 40; i++) { await ev("dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:0,y:.6,z:9.7}})), true"); await sleep(50); }
      const f = await ev("({ flat: FL.flat(), alphaMax: (() => { const c = document.getElementById('liquid'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let m = 0, n = 0; for (let i = 3; i < d.length; i += 64) { if (d[i] > m) m = d[i]; if (d[i] > 20) n++; } return [m, n]; })() })");
      ok(T("phone lying flat: liquid spreads over more area and is a bit see-through"), f.flat > .8 && f.alphaMax[0] < 230 && f.alphaMax[1] > area0 * 1.1, JSON.stringify([before, area0, f]));
      for (let i = 0; i < 30; i++) { await ev("dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:0,y:9.8,z:0}})), true"); await sleep(40); }
      await settle(ev); }
    ok(T("phone tilt (devicemotion) moves gravity and the liquid to the right"), g[0] > .8 && c3[0] > W * .55, JSON.stringify([g, c3]));
    // a hard shake: alternating strong sideways acceleration
    const s0 = await ev("FL.avgSpeed()");
    for (let i = 0; i < 16; i++) { await ev(`dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:${i % 2 ? 30 : -30},y:9.8,z:0}})), true`); await sleep(45); }
    const s1 = await ev("FL.avgSpeed()");
    ok(T("shaking the phone sloshes the liquid, nothing leaks"), s1 > s0 + 100 && await ev("FL.outside(3)") === 0, JSON.stringify([s0, s1]));
    for (let i = 0; i < 5; i++) { await ev("dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:0,y:9.8,z:0}})), true"); await sleep(50); }
    await settle(ev);
    // shake button
    const s2 = await ev("FL.avgSpeed()"); await ev("document.getElementById('bShake').click(), true"); await sleep(60);
    ok(T("shake button splashes the liquid"), await ev("FL.avgSpeed()") > s2 + 100);
    await settle(ev);
    // drag the liquid up with a finger / the mouse
    const top = await ev("FL.size()[1]"), y0 = H - 60, x0 = W * .5, before = await ev("FL.com()"), topBefore = await ev("(() => { let m = 1e9; for (let i = 0; i < FL.n; i++) m = Math.min(m, FL.pos(i)[1]); return m; })()");
    if (touch) await b.drag(x0, y0, 0, -(H * .45), 500);
    else { await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", clickCount: 1 });
      for (let i = 1; i <= 8; i++) { await sleep(20); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y: y0 - H * .45 * i / 8, button: "left", buttons: 1 }); }
      await sleep(500); const TOP = "(() => { let m = 1e9; for (let i = 0; i < FL.n; i++) m = Math.min(m, FL.pos(i)[1]); return m; })()", mid = await ev(TOP); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x0, y: y0 - H * .45, button: "left", clickCount: 1 });
      ok(T("dragging lifts part of the liquid (its top rises well above the rest)"), mid < topBefore - top * .15, JSON.stringify([topBefore, mid])); }
    if (touch) ok(T("dragging with a finger moves the liquid"), (await ev("FL.maxSpeed()")) > 100 || (await ev("FL.com()"))[1] < before[1] - 3);
    if (touch) { // touching an empty spot above the liquid pulls the nearest liquid to the finger
      await settle(ev); const c4 = await ev("FL.com()");
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: W * .5, y: H * .25, id: 3 }] }); await sleep(900);
      const c5 = await ev("FL.com()"); await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      ok(T("holding a finger on an empty spot pulls liquid to it"), c5[1] < c4[1] - H * .02, JSON.stringify([c4, c5])); }
    if (touch) { // two fingers at once: each pulls its own blob of liquid
      await settle(ev);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: W * .2, y: H * .3, id: 5 }, { x: W * .8, y: H * .3, id: 6 }] });
      for (let i = 1; i <= 6; i++) { await sleep(40); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: W * .2, y: H * .3 - i * 5, id: 5 }, { x: W * .8, y: H * .3 - i * 5, id: 6 }] }); }
      await sleep(900);
      const two = await ev(`(() => { const [w, h] = FL.size(), z = [0, 0]; for (let i = 0; i < FL.n; i++) { const p = FL.pos(i); if (p[1] < h * .45) z[p[0] < w / 2 ? 0 : 1]++; } return z; })()`);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      ok(T("multi-touch: two fingers each hold their own blob"), two[0] > 15 && two[1] > 15, JSON.stringify(two)); }
    await settle(ev);
    // shapes: full -> circle -> square -> full, liquid always inside, amount follows the vessel
    for (const want of ["circle", "square", "full"]) {
      await ev("document.getElementById('bShape').click(), true"); await sleep(700); await settle(ev, 12000); await sleep(400);
      const s = await ev(`({shape: FL.shape(), n: FL.n, t: FL.target(), out: FL.outside(3), v: (() => { const r = document.getElementById('vessel').getBoundingClientRect(); return [r.width, r.height, parseFloat(getComputedStyle(document.getElementById('vessel')).borderTopLeftRadius)]; })()})`);
      const shapeOk = want === "circle" ? Math.abs(s.v[0] - s.v[1]) < 2 && s.v[2] >= s.v[0] / 2 - 2 : want === "square" ? Math.abs(s.v[0] - s.v[1]) < 2 && s.v[2] < s.v[0] * .2 : s.v[0] > W * .9;
      ok(T(`shape button -> ${want}: vessel drawn, liquid inside, amount fits`), s.shape === want && shapeOk && s.out === 0 && Math.abs(s.n - s.t) <= 2, JSON.stringify(s));
      if (vname !== "land") await b.shot(join(SHOTS, `${vname}_shape_${want}.png`));
    }
    await ev("document.getElementById('bShape').click(), document.getElementById('bColor').click(), true"); await sleep(400);
    for (let i = 0; i < 30 && await ev("FL.n !== FL.target()"); i++) await sleep(200);   // the extra liquid drains out first
    const before2 = await ev("({shape: FL.shape(), color: FL.color(), n: FL.n})");
    await ev("document.getElementById('l102lang').value='de'; document.getElementById('l102lang').dispatchEvent(new Event('change')); true"); await sleep(200);
    const after = await ev("({shape: FL.shape(), color: FL.color(), n: FL.n, title: document.title, lbl: document.getElementById('bShape').getAttribute('aria-label')})");
    ok(T("language switch keeps the liquid, shape and colour; texts switch"), after.shape === before2.shape && after.color === before2.color && after.n === before2.n && after.title === "Flüssigkeit" && /Form ändern/.test(after.lbl), JSON.stringify([before2, after]));
    await b.send("Page.reload", {}); await sleep(600);
    for (let i = 0; i < 30 && !(await ev("!!(window.FL && document.readyState === 'complete')").catch(() => false)); i++) await sleep(150);
    if (touch) { await ev("document.getElementById('iStart').click(), true"); await sleep(100); }
    ok(T("shape and colour are remembered after a reload"), await ev("FL.shape()") === before2.shape && await ev("FL.color()") === before2.color);
    // idle: the loop sleeps once the liquid is still
    await settle(ev); let idle = false; for (let i = 0; i < 40 && !idle; i++) { await sleep(300); idle = !(await ev("FL.running()")); }
    ok(T("the loop sleeps when the liquid is still"), idle);
    await ev("FL.perf.reset(), document.getElementById('bShake').click(), true"); await sleep(1500);
    const pf = await ev("({avg: FL.perf.sum / FL.perf.frames, frames: FL.perf.frames})");
    ok(T("frame work stays small (avg < 10 ms here)"), pf.avg < 10 && pf.frames > 30, JSON.stringify(pf));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
}

// 2b) speed button: x1 -> x2 ... x6 -> x1, remembered; the liquid stays stable and inside at every speed
for (const [vname, [W, H, touch]] of [["phone", VIEWS.phone], ["desktop", VIEWS.desktop]]) {
  const b = await launch({ url: URL, width: W, height: H, touch }), { ev } = b, T = s => `${vname} speed: ${s}`;
  try {
    if (touch) await ev("document.getElementById('iStart').click(), true");
    ok(T("starts at x1"), await ev("FL.speed()") === 1 && await ev("document.getElementById('spdTxt').textContent") === "×1");
    for (const [want, txt] of [[1.5, "×1.5"], [2, "×2"], [3, "×3"], [1 / 3, "×0.33"], [.5, "×0.5"], [.75, "×0.75"], [1, "×1"]]) {
      await ev("document.getElementById('bSpeed').click(), true");
      const st = await ev("({ s: FL.speed(), t: document.getElementById('spdTxt').textContent, a: document.getElementById('bSpeed').getAttribute('aria-label') })");
      if (want === 3) { await ev("document.getElementById('bShake').click(), true"); await sleep(400); await settle(ev, 8000);
        const m = await ev("({ out: FL.outside(3), calm: FL.avgSpeed() })");
        ok(T("x3: shaken liquid stays inside and settles"), m.out === 0 && m.calm < 200, JSON.stringify(m)); }
      ok(T(`tap -> ${txt}`), Math.abs(st.s - want) < 1e-9 && st.t === txt && /Speed ×/.test(st.a), JSON.stringify(st));
    }
    await ev("document.getElementById('bSpeed').click(), document.getElementById('bSpeed').click(), true");
    await b.send("Page.reload", {}); await sleep(600);
    for (let i = 0; i < 30 && !(await ev("!!(window.FL && document.readyState === 'complete')").catch(() => false)); i++) await sleep(150);
    ok(T("remembered after a reload (x2)"), await ev("FL.speed()") === 2);
    // liquid amount: x1 -> x1.25 -> x1.5 -> x0.33 -> x0.5 -> x0.75 -> x1, the amount of liquid follows
    const base = await ev("FL.target()");
    for (const want of [1.25, 1.5, 1 / 3, .5, .75, 1]) {
      await ev("document.getElementById('bAmount').click(), true"); await sleep(200);
      const a = await ev("({ a: FL.amount(), t: FL.target(), lbl: document.getElementById('bAmount').getAttribute('aria-label') })");
      const fits = want > 1 ? a.t > base : Math.abs(a.t / base - want) < .08;   // above x1 the vessel may cap it
      ok(T(`liquid button -> x${+want.toFixed(2)}: amount follows, labelled`), Math.abs(a.a - want) < 1e-9 && /Liquid ×/.test(a.lbl) && fits, JSON.stringify([base, a]));
    }
    for (let i = 0; i < 40 && await ev("FL.n !== FL.target()"); i++) await sleep(200);
    ok(T("back at x1 liquid: the amount settles to the normal count"), await ev("FL.n === FL.target()") && await ev("FL.outside(3)") === 0);
    ok(T("keeps real time here (no particles dropped on a fast machine)"), await ev("FL.qual()") === 1, String(await ev("FL.realtime()")));
    ok(T("no console errors"), b.errors.length === 0, b.errors.join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
}

// 3) blocked storage: still works
{
  const b = await launch({ url: URL, width: 360, height: 740, touch: true });
  await b.ev("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}}); document.getElementById('iStart').click(); true");
  await b.ev("document.getElementById('bShape').click(), document.getElementById('bColor').click(), true"); await sleep(400);
  ok("blocked storage: shape and colour still change, no errors", await b.ev("FL.shape()") === "circle" && b.errors.length === 0, b.errors.join(" "));
  await b.close();
}
// 4) "Start in full screen": goes full screen and locks the rotation (a real tap = user gesture)
{
  const b = await launch({ url: URL, width: 412, height: 846, touch: true });
  await b.ev("window.__locks = []; screen.orientation.lock = o => (window.__locks.push(o), Promise.resolve()); screen.orientation.unlock = () => window.__locks.push('unlock'); true");
  const r = await b.ev("(() => { const r = document.getElementById('iFull').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
  await b.tap(r[0], r[1]); await sleep(700);
  const st = await b.ev("({ full: !!document.fullscreenElement, locks: window.__locks, intro: document.getElementById('intro').hidden })");
  ok("start in full screen: full screen on, rotation locked to the current direction", st.full && st.intro && st.locks[0] === "portrait-primary", JSON.stringify(st));
  await b.ev("document.exitFullscreen(), true"); await sleep(500);
  ok("leaving full screen unlocks the rotation", (await b.ev("window.__locks")).includes("unlock") && b.errors.length === 0, b.errors.join(" "));
  await b.close();
}
// 5) a slow phone: the game notices it can't keep real time and uses fewer particles (same speed everywhere)
{
  const b = await launch({ url: URL, width: 412, height: 846, touch: true });
  await sleep(800); await b.send("Emulation.setCPUThrottlingRate", { rate: 10 });
  await b.ev("document.getElementById('iStart').click(), true");
  for (let i = 0; i < 4; i++) { await b.ev("document.getElementById('bShake').click(), true"); await sleep(1500); }
  const r = await b.ev("({ q: FL.qual(), n: FL.n, out: FL.outside(3) })");
  ok("slow phone: fewer particles to keep real-time speed, liquid still inside", r.q < 1 && r.n < 715 && r.out === 0 && b.errors.length === 0, JSON.stringify(r) + b.errors.join(" "));
  await b.close();
}
process.exit(summary() ? 1 : 0);
