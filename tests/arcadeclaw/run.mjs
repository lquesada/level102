// Arcade Claw. Usage (repo root): node tests/arcadeclaw/run.mjs [all|layout|play]
// Checks every size, OS languages and text sizes (bar, favicon, translated texts outside the machine, the machine fits),
// then plays: coins -> credits (max 9), joystick (touch drag, mouse, keys) moves the claw in x and depth and it wiggles,
// the red pointer, GRAB uses a credit, a forced win (dialog, translated, no new toy: the machine empties; an empty machine refills), a forced drop,
// toys stay inside the machine, machine texts don't change with the language, frame time.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { launch, ROOT, sleep, checker, shotsDir } from "../lib/cdp.mjs";

const { ok, summary } = checker();
const which = process.argv[2] || "all", run = s => which === "all" || which === s;
const URL = "file://" + join(ROOT, "docs", "arcadeclaw", "index.html"), SHOTS = shotsDir("arcadeclaw");
const VIEWS = { phone: [360, 740, true], small: [320, 568, true], land: [740, 360, true], tablet: [820, 1180, true], desktop: [1280, 800, false] };
const NAMES = { "en-US": "Arcade Claw", "es-ES": "Máquina de Gancho", "de-DE": "Greifautomat", "fr-FR": "Arcade Claw" };
const ENGLISH = /Tap the coin slot|Congrats|You got|Keep playing|Insert a coin|machine is empty|Start over|Yes, reset/;

const html = readFileSync(join(ROOT, "docs", "arcadeclaw", "index.html"), "utf8");
ok("favicon right after <title>", /<title>[^<]*<\/title>\s*<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/.test(html));
ok("no external resources in the page", !/(src|href)="https?:\/\/(?!level102\.com)/.test(html.replace(/<meta[^>]*>/g, "")));

const UI = `(() => { const r = e => e.getBoundingClientRect(), bar = r(document.getElementById('l102bar')), st = r(document.getElementById('stage')), c = r(document.getElementById('screen'));
  return { barRow: [...document.querySelectorAll('#l102bar > :not(.l102sp)')].every(e => r(e).top < 10), stageBelowBar: st.top >= bar.bottom - .5,
    fits: c.left >= st.left - .5 && c.right <= st.right + .5 && c.top >= st.top - .5 && c.bottom <= st.bottom + .5 && c.width > 150,
    pixelated: /pixelated|crisp/.test(getComputedStyle(document.getElementById('screen')).imageRendering),
    scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    hint: document.getElementById('hint').textContent, title: document.title }; })()`;
const tapAt = async (b, touch, x, y) => { if (touch) await b.tap(x, y); else await b.click(x, y); };
const tapMachine = async (b, touch, mx, my) => { const p = await b.ev(`AC.toScreen(${mx}, ${my})`); await tapAt(b, touch, p[0], p[1]); };
const waitFor = async (ev, expr, ms) => { for (let t = 0; t < ms; t += 200) { if (await ev(expr)) return true; await sleep(200); } return false; };

// 1) sizes x languages x text sizes
if (run("layout")) for (const [vname, [W, H, touch]] of Object.entries(VIEWS)) for (const lang of Object.keys(NAMES)) for (const fs of (vname === "phone" || vname === "desktop" ? [0.8, 1.8] : [1.1])) {
  if (fs !== 1.1 && lang === "fr-FR") continue;
  if (vname !== "phone" && vname !== "desktop" && lang !== "en-US" && lang !== "de-DE") continue;
  const b = await launch({ url: URL, width: W, height: H, touch, lang }), { ev } = b, tag = `${vname}_${lang}_${fs}`, T = s => `${tag}: ${s}`;
  try {
    ok(T("title translated on the first frame"), await ev("document.title") === NAMES[lang], await ev("document.title"));
    if (fs !== 1.1) { await ev(`localStorage.setItem('l102.fs','${fs}'); true`); await b.send("Page.reload", {}); await sleep(800); }
    await sleep(600);
    const u = await ev(UI);
    ok(T("bar one row, machine fits below it, pixelated, nothing scrolls"), u.barRow && u.stageBelowBar && u.fits && u.pixelated && !u.scroll, JSON.stringify(u));
    ok(T("hint translated (no English in es/de)"), lang.startsWith("en") || lang === "fr-FR" || !ENGLISH.test(u.hint), u.hint);
    const m = await ev("({ n: AC.toys(), out: AC.outside() })");
    ok(T("about 34 toys, all inside the machine"), m.n >= 30 && m.n <= 36 && m.out === 0, JSON.stringify(m));
    ok(T("no toy starts inside (or right behind) the prize box"), (await ev("AC.inBox()")).length === 0, JSON.stringify(await ev("AC.inBox()")));
    const sh = await ev("AC.shapes()");
    ok(T("varied toys: no retired rings, many different shapes, few repeats"), sh.retired === 0 && sh.shapes >= 25 && sh.most <= 3, JSON.stringify(sh));
    if (["phone_en-US_0.8", "phone_es-ES_1.8", "small_de-DE_1.1", "land_en-US_1.1", "tablet_de-DE_1.1", "desktop_de-DE_1.8"].includes(tag)) await b.shot(join(SHOTS, `${tag}.png`));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
}

// 2) playing
if (run("play")) for (const [vname, [W, H, touch], lang] of [["phone", VIEWS.phone, "es-ES"], ["desktop", VIEWS.desktop, "en-US"], ["land", VIEWS.land, "de-DE"]]) {
  const b = await launch({ url: URL, width: W, height: H, touch, lang }), { ev, send } = b, T = s => `${vname}: ${s}`;
  try {
    await sleep(900); const G = await ev("AC.G");
    // the cutest toys sit at the front
    const fr = await ev("AC.front()"), bk = await ev("AC.back()"), avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    ok(T("the cutest toys are at the front"), fr.length >= 5 && avg(fr) > avg(bk), JSON.stringify([avg(fr), avg(bk)]));
    // the pile has depth: toys spread over front, middle and back rows
    const zs = await ev("AC.depthRows()"), D = await ev("AC.D"), band = k => zs.filter(z => z >= k * D / 3 && z < (k + 1) * D / 3).length;
    ok(T("pile depth: toys in front, middle and back thirds"), band(0) >= 4 && band(1) >= 4 && band(2) >= 4 && Math.max(...zs) - Math.min(...zs) > D * .55, JSON.stringify([band(0), band(1), band(2)]));
    // starts parked over the prize box
    ok(T("the claw starts parked over the prize box, at its depth"), await ev("AC.parked()") && await ev("AC.claw().z >= 0 && AC.claw().z <= (AC.G.chute.z1 || 14)"), JSON.stringify(await ev("AC.claw()")));
    // no coin: touching the joystick (or an arrow key) puts a coin in by itself
    { const JJ = await ev("AC.toScreen(AC.G.joystick.cx, AC.G.joystick.cy)");
      await ev("document.getElementById('hint').classList.add('off'), true");
      if (touch) await b.drag(JJ[0], JJ[1], 40, -30, 500); else { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); await sleep(500); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); }
      await waitFor(ev, "AC.credits === 1", 2000);
      ok(T("no coin: the joystick puts a coin in by itself (1 credit, hint hidden)"), await ev("AC.credits") === 1 && await ev("document.getElementById('hint').classList.contains('off')"), String(await ev("AC.credits")));
      if (vname === "phone") await b.shot(join(SHOTS, "play_nudge.png")); }
    // coins: tap the slot; credits go up to 9 and no further
    await tapMachine(b, touch, (G.coin.x0 + G.coin.x1) / 2, (G.coin.y0 + G.coin.y1) / 2);
    await waitFor(ev, "AC.credits === 2", 2000);
    ok(T("tapping the coin slot adds a credit"), await ev("AC.credits") === 2);
    for (let i = 0; i < 10; i++) await ev("AC.coin(), true");
    await waitFor(ev, "AC.credits === 9", 8000); await sleep(800);
    ok(T("credits stop at 9"), await ev("AC.credits") === 9, String(await ev("AC.credits")));
    // joystick: drag right -> claw goes right and swings; drag up -> claw goes back (z grows)
    const c0 = await ev("AC.claw()"), J = await ev("AC.toScreen(AC.G.joystick.cx, AC.G.joystick.cy)");
    if (touch) { await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: J[0], y: J[1], id: 7 }] });
      for (let i = 1; i <= 6; i++) { await sleep(30); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: J[0] + i * 8, y: J[1] - i * 8, id: 7 }] }); }
      await sleep(700); await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    else { await send("Input.dispatchMouseEvent", { type: "mousePressed", x: J[0], y: J[1], button: "left", clickCount: 1 });
      for (let i = 1; i <= 6; i++) { await sleep(30); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: J[0] + i * 8, y: J[1] - i * 8, button: "left", buttons: 1 }); }
      await sleep(700); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: J[0] + 48, y: J[1] - 48, button: "left", clickCount: 1 }); }
    const c1 = await ev("AC.claw()");
    ok(T("joystick drag moves the claw right and back"), c1.x > c0.x + 10 && c1.z > c0.z + 5, JSON.stringify([c0, c1]));
    let maxSw = 0; for (let i = 0; i < 6; i++) { const c = await ev("AC.claw()"); maxSw = Math.max(maxSw, Math.abs(c.angX), Math.abs(c.angZ)); await sleep(60); }
    ok(T("the claw wiggles on its cable after moving"), maxSw > .03, String(maxSw));
    // keys
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 }); await sleep(600);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }); await sleep(500);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }); await sleep(300);
    const c2 = await ev("AC.claw()");
    ok(T("arrow keys move the claw left and to the front"), c2.x < c1.x - 10 && c2.z < c1.z - 5, JSON.stringify([c1, c2]));
    // aim at the middle of the pile; the pointer reaches the surface below
    await ev("AC.joy(1, 0), true"); await sleep(400); await ev("AC.joy(0, 0), true"); await sleep(900);
    const pt = await ev("AC.below()");
    ok(T("red pointer: from the claw down to the surface below"), pt.y > pt.tipY + 10, JSON.stringify(pt));
    if (vname === "phone") await b.shot(join(SHOTS, "play_aim.png"));
    // forced win (aim right over a toy first: the pile is random)
    await ev("AC.aimAtToy(), true"); await sleep(1500);
    const n0 = await ev("AC.toys()"), cr = await ev("AC.credits");
    await ev("AC.seed([0.9, 0.01]), true"); await tapMachine(b, touch, (G.grab.x0 + G.grab.x1) / 2, (G.grab.y0 + G.grab.y1) / 2);
    await sleep(300);
    ok(T("GRAB uses one credit"), await ev("AC.credits") === cr - 1 && await ev("AC.mode") !== "idle", String(await ev("AC.credits")));
    let won = false, held = false, pose = null; for (let t = 0; t < 30000 && !(await ev("AC.dialog()")); t += 200) { if (await ev("AC.claw().held")) { held = true; if (!pose && await ev("AC.mode") === "carry") { pose = await ev("AC.pose()"); if (vname === "phone") await b.shot(join(SHOTS, "play_hold.png")); } } if (await ev("AC.mode") === "idle" && t > 3000) break; await sleep(200); }
    if (pose) ok(T("grab pose: the toy's middle is held between the prong tips (not dangling below)"), Math.abs(pose.dx) < 3 && pose.dy > -7 && pose.dy < 5 && Math.abs(pose.dz) < 3 && pose.spread < pose.half + 3, JSON.stringify(pose));
    won = await ev("AC.dialog()");
    if (held && !won) { ok(T("a forced win ends in the prize dialog"), false, "held but no win: " + JSON.stringify(await ev("AC.dbg()"))); }
    else if (!held) { ok(T("the claw picked something up (aimed at the pile)"), false, JSON.stringify(await ev("AC.below()"))); }
    else {
      const d = await ev("({ t: document.getElementById('pTitle').textContent, p: document.getElementById('pText').textContent, b: document.getElementById('pOk').textContent, w: document.getElementById('pIcon').width })");
      ok(T("forced win: the prize dialog, translated, with the big pixel icon"), d.w > 60 && (lang.startsWith("en") ? /Congrats/.test(d.t) : !ENGLISH.test(d.t + d.p + d.b)), JSON.stringify(d));
      await b.shot(join(SHOTS, `play_win_${vname}.png`));
      await ev("document.getElementById('pOk').click(), true");
      await sleep(600);
      ok(T("after a win no new toy appears: one toy fewer in the machine"), await ev("AC.toys()") === n0 - 1 && await ev("AC.wins") === 1, `${n0} -> ${await ev("AC.toys()")}`);
    }
    await waitFor(ev, "AC.mode === 'idle'", 15000);
    ok(T("after a play the claw parks over the prize box, at its depth"), await ev("AC.parked()") && await ev("AC.claw().z <= (AC.G.chute.z1 || 14)"));
    // depth order: grab a toy in a back row that a front toy overlaps on screen; the front toy stays on top
    if (await ev("AC.credits") > 0 && await ev("AC.aimBehindFront()")) {
      await sleep(1200); await ev("AC.seed([0.9, 0.01]), AC.grab(), true"); let dc = null, seen = 0, inFront = [], boxBad = [];
      for (let t = 0; t < 12000 && !dc; t += 100) { await sleep(100); const m = await ev("AC.mode"); if (m === "grip" || m === "up") { const r = await ev("AC.depthCheck()"); if (r && r.checked > 20) dc = r; }
        if (m === "down" || m === "closing") { const s = await ev("AC.drawSets()"); if (s.target) { seen++; if (s.front.includes(s.target)) inFront.push(s); } if (s.clawZ - 1 > s.boxZ && !s.boxLater) boxBad.push(s); } }
      ok(T("going down: the toy under the claw is drawn behind its front prong"), seen > 0 && inFront.length === 0, JSON.stringify({ seen, inFront: inFront.slice(0, 2) }));
      ok(T("claw deeper than the prize box: the box is drawn over the toys behind it, not under them"), boxBad.length === 0, JSON.stringify(boxBad.slice(0, 2)));
      if (dc) ok(T("depth order: a toy in front covers the claw and the toy it grabs behind it"), dc.bad / dc.checked < .03, JSON.stringify(dc));
      for (let t = 0; t < 30000 && !(await ev("AC.dialog()")) && await ev("AC.mode") !== "idle"; t += 200) await sleep(200);
      if (await ev("AC.dialog()")) await ev("document.getElementById('pOk').click(), true");
      await waitFor(ev, "AC.mode === 'idle'", 15000); }
    // forced drop (the 1-in-3 roll): no prize
    await ev("AC.aimAtToy(), true"); await sleep(1500);
    const w0 = await ev("AC.wins"), nD = await ev("AC.toys()"); await ev("AC.seed([0.1, 0.01]), AC.grab(), true");
    await waitFor(ev, "AC.mode === 'carry' || AC.mode === 'release' || AC.mode === 'return'", 15000); await waitFor(ev, "AC.mode === 'idle'", 20000); await sleep(1500);
    ok(T("after a miss the claw parks again"), await ev("AC.parked()"));
    ok(T("forced drop: the claw lets go, no prize, toys stay inside"), await ev("AC.wins") === w0 && !(await ev("AC.dialog()")) && await ev("AC.outside()") === 0 && await ev("AC.toys()") === nD, JSON.stringify({ wins: await ev("AC.wins"), out: await ev("AC.outside()"), n: await ev("AC.toys()") }));
    // pushing: sweep the open claw low through the pile, both ways; contacts stay sane
    await ev("AC.sweep(AC.G.floorY - 24), AC.joy(1, 0), true"); await sleep(2600); await ev("AC.joy(-1, .7), true"); await sleep(2600); await ev("AC.joy(0, 0), true"); await sleep(1800);
    const hl = await ev("AC.health()"), outS = await ev("AC.outside()");
    ok(T("push sweep: no NaN, nothing outside, no big overlaps"), hl.nan === 0 && outS === 0 && hl.maxOv < 2, JSON.stringify({ ...hl, outS }));
    await ev("AC.endTest(), true");
    // machine texts don't depend on the language (ART never reads L102.lang)
    const hash = `(() => { const c = document.createElement('canvas'); c.width = ART.W; c.height = ART.H; const x = c.getContext('2d');
      ART.drawScene(x, { t: 1, clawX: 96, clawY: AC.G.clawTopY, clawZ: 10, clawAngle: 0, clawOpen: 0, joyX: 0, joyY: 0, grabDown: false, credits: 3, creditsFlash: 0, coinT: -1, busy: false }, { toys() {}, held() {} });
      const d = x.getImageData(0, 0, ART.W, ART.H).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; })()`;
    const h1 = await ev(hash); await ev("L102.setLang(L102.lang === 'de' ? 'es' : 'de'), true"); await sleep(100); const h2 = await ev(hash);
    ok(T("machine texts stay the same in every language"), h1 === h2);
    const pf = await ev("({ avg: AC.perf.sum / AC.perf.frames, frames: AC.perf.frames })");
    ok(T("frame work stays small (avg < 8 ms here)"), pf.avg < 8 && pf.frames > 100, JSON.stringify(pf));
    // an emptied machine stays empty (no refill) and says how to start again
    await ev("AC.emptyTest(), document.getElementById('pOk').click(), true"); await sleep(300);
    const em = await ev("({ n: AC.toys(), msg: document.getElementById('toast').textContent })");
    ok(T("an empty machine stays empty and says to reset it (translated)"), em.n === 0 && em.msg.length > 5 && (lang.startsWith("en") || !ENGLISH.test(em.msg)), JSON.stringify(em));
    // Reset (in the prizes): asks first; Cancel keeps everything; Yes starts a new game
    await ev("document.getElementById('prizesBtn').click(), true"); await sleep(200);
    await ev("document.getElementById('pzReset').click(), true"); await sleep(100);
    const ask = await ev("({ ask: !document.getElementById('pzAsk').hidden, row: document.getElementById('pzRow').hidden, t: document.getElementById('pzAskT').textContent, y: document.getElementById('pzYes').textContent, focus: document.activeElement.id })");
    ok(T("Reset asks for confirmation first (translated, focus on Cancel)"), ask.ask && ask.row && ask.focus === "pzNo" && (lang.startsWith("en") || !ENGLISH.test(ask.t + ask.y)), JSON.stringify(ask));
    if (vname === "phone") await b.shot(join(SHOTS, "reset_ask.png"));
    await ev("document.getElementById('pzNo').click(), true"); await sleep(100);
    ok(T("Cancel keeps everything"), await ev("AC.toys()") === 0 && await ev("AC.prizes().length") > 0 && await ev("document.getElementById('pzAsk').hidden"));
    await ev("document.getElementById('pzReset').click(), document.getElementById('pzYes').click(), true"); await sleep(300);
    const rs = await ev("({ n: AC.toys(), out: AC.outside(), box: AC.inBox().length, prizes: AC.prizes().length, wins: AC.wins, credits: AC.credits, dlg: !document.getElementById('prizesDlg').hidden })");
    ok(T("Yes: a full new machine, no prizes, no credits, dialog closed"), rs.n >= 30 && rs.n <= 36 && rs.out === 0 && rs.box === 0 && rs.prizes === 0 && rs.wins === 0 && rs.credits === 0 && !rs.dlg, JSON.stringify(rs));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
}
// 3) prizes this session: button on the panel opens a translated window; two wins are listed; a reload empties it
if (run("prizes")) {
  const b = await launch({ url: URL, width: 360, height: 740, touch: true, lang: "es-ES" }), { ev } = b, T = s => `prizes: ${s}`;
  try {
    await sleep(900);
    const btn = await ev("(() => { const r = document.getElementById('prizesBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height, document.getElementById('prizesBtn').getAttribute('aria-label')]; })()");
    ok(T("a real button over the panel's prizes spot, translated aria-label, big enough"), btn[2] >= 30 && btn[3] >= 30 && /premios/.test(btn[4]), JSON.stringify(btn));
    await b.tap(btn[0], btn[1]); await sleep(300);
    ok(T("empty window: friendly translated message"), await ev("!document.getElementById('prizesDlg').hidden && !document.getElementById('pzEmpty').hidden && /Todavía/.test(document.getElementById('pzEmpty').textContent)"));
    await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(200);
    ok(T("Esc closes it"), await ev("document.getElementById('prizesDlg').hidden"));
    // two real wins
    await ev("AC.coin(), AC.coin(), true"); await waitFor(ev, "AC.credits === 2", 4000);
    for (let k = 0; k < 2; k++) { await ev("AC.aimAtToy(), true"); await sleep(1200); await ev("AC.seed([0.9, 0.01]), AC.grab(), true");
      await waitFor(ev, "AC.dialog()", 35000); await ev("document.getElementById('pOk').click(), true"); await waitFor(ev, "AC.mode === 'idle'", 15000); }
    const list = await ev("AC.prizes()");
    ok(T("both wins are in the prizes list"), list.reduce((a, x) => a + x[1], 0) === 2, JSON.stringify(list));
    await b.tap(btn[0], btn[1]); await sleep(300);
    const items = await ev("[...document.querySelectorAll('#pzGrid .it')].map(e => e.textContent)");
    ok(T("the window lists them, names translated"), items.length >= 1 && items.length <= 2 && !items.some(x => /Nothing|Your prizes/.test(x)), JSON.stringify(items));
    await b.shot(join(SHOTS, "prizes_es.png"));
    await ev("document.getElementById('pzClose').click(), true");
    const pz0 = JSON.stringify(await ev("AC.prizes()")); await ev("AC.saveNow(), true");
    await b.send("Page.reload", {}); await sleep(900);
    ok(T("a reload keeps the prizes (saved)"), JSON.stringify(await ev("AC.prizes()")) === pz0 && pz0 !== "[]", pz0);
    ok(T("no console errors"), b.errors.length === 0, b.errors.join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
  // the window fits everywhere, at both text sizes, with many prizes
  for (const [vname, [W, H, touch]] of Object.entries(VIEWS)) for (const fs of [0.8, 1.8]) {
    const c = await launch({ url: URL, width: W, height: H, touch, lang: "de-DE" }), T2 = s => `prizes ${vname}_${fs}: ${s}`;
    await c.ev(`localStorage.setItem('l102.fs','${fs}'); true`); await c.send("Page.reload", {}); await sleep(900);
    await c.ev("TOYS.list.slice(0, 14).forEach(t => AC.addPrizeTest(t.id)), AC.addPrizeTest(TOYS.list[0].id), document.getElementById('prizesBtn').click(), true"); await sleep(300);
    const f = await c.ev(`(() => { const r = e => e.getBoundingClientRect(), st = r(document.getElementById('stage')), card = r(document.querySelector('#prizesDlg .card')), cl = r(document.getElementById('pzClose')), g = document.getElementById('pzGrid');
      return { fits: card.left >= st.left - .5 && card.right <= st.right + .5 && card.top >= st.top - .5 && card.bottom <= st.bottom + .5, close: cl.height >= 44 && cl.bottom <= st.bottom,
        btns: ['pzReset', 'pzClose'].every(id => { const e = document.getElementById(id), b = r(e); return e.scrollWidth <= e.clientWidth + 1 && b.height >= 44 && b.left >= card.left && b.right <= card.right && b.bottom <= card.bottom; }),
        items: g.children.length, x2: [...g.querySelectorAll('.n')].map(e => e.textContent), title: document.getElementById('pzTitle').textContent }; })()`);
    ok(T2("fits, close button reachable, newest first with ×2, translated"), f.fits && f.close && f.btns && f.items === 14 && f.x2.includes("×2") && f.title === "Deine Preise", JSON.stringify(f));
    if (vname === "small" || vname === "land") await c.shot(join(SHOTS, `prizes_${vname}_${fs}.png`));
    await c.ev("document.getElementById('pzReset').click(), true"); await sleep(100);
    const q = await c.ev(`(() => { const r = e => e.getBoundingClientRect(), st = r(document.getElementById('stage')), card = r(document.querySelector('#prizesDlg .card'));
      return { fits: card.top >= st.top - .5 && card.bottom <= st.bottom + .5, btns: ['pzNo', 'pzYes'].every(id => { const e = document.getElementById(id), b = r(e); return e.scrollWidth <= e.clientWidth + 1 && b.height >= 44 && b.left >= card.left && b.right <= card.right && b.bottom <= card.bottom; }) }; })()`);
    ok(T2("the reset question fits, both answers readable and tappable"), q.fits && q.btns, JSON.stringify(q));
    if (vname === "small" || vname === "land") await c.shot(join(SHOTS, `reset_${vname}_${fs}.png`));
    await c.ev("document.getElementById('pzNo').click(), true");
    await c.close();
  }
}
// 3) saved game: prizes, credits and every toy's place survive a reload; Reset is saved too; bad saves are ignored
if (run("save")) {
  const b = await launch({ url: URL, width: 360, height: 740, touch: true, lang: "de-DE" }), { ev } = b, T = s => `save: ${s}`;
  const reload = async () => { await b.send("Page.reload", {}); await sleep(1200); };
  try {
    await sleep(900);
    await ev("AC.addPrizeTest('panda'), AC.addPrizeTest('panda'), AC.addPrizeTest('duck'), AC.coin(), AC.coin(), true"); await sleep(1600);
    const st = async () => ev("({ toys: AC.state().map(p => [p[0], p[1], p[2]]), ids: AC.ids(), prizes: AC.prizes(), credits: AC.credits })");
    await ev("AC.saveNow(), true"); const s0 = await st(); await reload(); const s1 = await st();
    const moved = Math.max(...s0.toys.map((p, i) => s1.toys[i] ? Math.hypot(p[0] - s1.toys[i][0], p[1] - s1.toys[i][1], p[2] - s1.toys[i][2]) : 99));
    ok(T("after a reload: the same prizes, credits and toys, each where it was"), JSON.stringify(s0.prizes) === JSON.stringify(s1.prizes) && s0.credits === 2 && s1.credits === 2 && JSON.stringify(s0.ids) === JSON.stringify(s1.ids) && moved < 1.5, JSON.stringify({ p: [s0.prizes, s1.prizes], c: [s0.credits, s1.credits], n: [s0.ids.length, s1.ids.length], moved }));
    // the resting machine saves by itself (no explicit save)
    await ev("AC.emptyTest(), true"); await sleep(2500); await reload();
    ok(T("an emptied machine is saved by itself and stays empty after a reload, with a message"), await ev("AC.toys()") === 0 && (await ev("document.getElementById('toast').textContent")).length > 5);
    await ev("document.getElementById('prizesBtn').click(), document.getElementById('pzReset').click(), document.getElementById('pzYes').click(), true"); await sleep(300); await reload();
    ok(T("a reset is saved: after a reload the machine is full and there are no prizes"), await ev("AC.toys()") >= 30 && await ev("AC.prizes().length") === 0 && await ev("AC.credits") === 0);
    // a save from an older version: a toy stuck on the shelf right behind the prize box falls to the floor; retired rings still load
    await ev(`(() => { AC.saveNow(); const d = JSON.parse(localStorage.getItem(AC.SAVE_KEY)); d.toys[0] = [d.toys[0][0], 42, 195, 20, 0]; d.toys.push(["ring_pink", 120, 200, 30, 0]);
      d.won = [["ring_gold", 2], ["ring_blue", 1], ["panda", 1]]; localStorage.setItem(AC.SAVE_KEY, JSON.stringify(d)); return true; })()`); await reload(); await sleep(2500);
    const old = await ev("({ s: AC.state()[0], ids: AC.ids(), prizes: AC.prizes(), out: AC.outside() })");
    ok(T("old save: a toy floating behind the prize box falls down within reach"), old.s[1] > 214 && old.s[2] >= 20 && old.out === 0, JSON.stringify(old.s));
    ok(T("old save: ring prizes and a ring in the machine are kept"), JSON.stringify(old.prizes) === JSON.stringify([["ring_gold", 2], ["ring_blue", 1], ["panda", 1]]) && old.ids.includes("ring_pink"), JSON.stringify(old.prizes));
    // bad or hostile saves are ignored (a fresh machine, no errors)
    for (const bad of ["{oops", JSON.stringify({ v: 1, credits: 99, won: [["__proto__", 3], ["panda", -1], ["nope", 2]], toys: [["nope", 1, 2, 3, 0], ["panda", "x", 1, 1, 0], ["panda", NaN, 1, 1, 0]] }), JSON.stringify({ v: 7, toys: [], won: [] })]) {
      await ev(`localStorage.setItem(AC.SAVE_KEY, ${JSON.stringify(bad)}), true`); await reload();
      const r = await ev("({ n: AC.toys(), p: AC.prizes().length, c: AC.credits, out: AC.outside() })");
      ok(T("a broken save is ignored or cleaned: " + bad.slice(0, 24)), r.out === 0 && r.p === 0 && r.c <= 9 && r.n >= 30, JSON.stringify(r)); }
    // storage that refuses to save: a message once, the game keeps going
    await ev("Storage.prototype.setItem = () => { throw new Error('full'); }, AC.coin(), true"); await sleep(900); await ev("AC.saveNow(), true"); await sleep(100);
    const msg = await ev("document.getElementById('toast').textContent");
    ok(T("storage that is full or blocked shows a (translated) message"), /Speichern/.test(msg), msg);
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); }
  await b.close();
}

process.exit(summary() ? 1 : 0);
