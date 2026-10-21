// Candy Shop (docs/candyshop/index.html): drives every main journey in headless Chrome at phone upright / small phone /
// phone sideways / tablet (touch) and desktop (mouse + keyboard), the shared top bar, en / es / de (+ fr -> en),
// both text-size ends, the physics (candies stay inside, LIFO, falling out, overflow), and paying at the counter.
// Usage (from the repo root): node tests/candyshop/run.mjs [journey|pay|physics|i18n|matrix|cover|coll|scroll|collsizes|all]
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { launch, pageUrl, shotsDir, sleep, checker } from "../lib/cdp.mjs";

const URL = pageUrl("candyshop"), SHOTS = shotsDir("candyshop");
const VIEWS = { phone: [360, 740, true], small: [320, 568, true], land: [740, 360, true], tablet: [820, 1180, true], desktop: [1280, 800, false], big: [2000, 1220, false] };
const LANGS = { en: "en-US", es: "es-ES", de: "de-DE" };
const TITLES = { en: "Candy Shop", es: "Tienda de golosinas", de: "Süßigkeitenladen" };
const which = process.argv[2] || "all";
const run = s => which === "all" || which === s;
const { ok, summary } = checker();
// English UI words that must never show up in the Spanish / German UI
const ENGLISH = /\b(the|and|tap|click|bag|box|cup|candy|candies|each|pay|wallet|change|start over|sound|pick|scroll|back to|keep|yes|empty|paid|missing|receipt|thank|enjoy|play again|coin|bill|Sugar Coins)\b/i;

const pt = (ev, sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; })()`);
async function press(b, touch, sel) { const p = await pt(b.ev, sel); if (!p) throw new Error("no element " + sel); if (touch) await b.tap(p[0], p[1]); else await b.click(p[0], p[1]); await sleep(60); return p; }
async function mouseDrag(b, x, y, dx, dy) {
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i++) { await sleep(16); await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + dx * i / 8, y: y + dy * i / 8, button: "left", buttons: 1 }); }
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", buttons: 0, clickCount: 1 });
}
const setLang = (ev, l) => ev(`(() => { const s = document.getElementById('l102lang'); s.value = '${l}'; s.dispatchEvent(new Event('change')); return true; })()`);
// visible text + labels of the page (everything a player can read or hear)
const VISIBLE = `(() => { const out = [document.title]; const vis = el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; };
  const walk = el => { for (const n of el.childNodes) { if (n.nodeType === 3) { if (n.parentElement && vis(n.parentElement) && n.textContent.trim()) out.push(n.textContent.trim()); } else if (n.nodeType === 1 && n.id !== 'l102bar' && vis(n)) walk(n); } };
  walk(document.getElementById('game'));
  for (const el of document.querySelectorAll('#game [aria-label], #game [title]')) { if (el.getAttribute('aria-label')) out.push(el.getAttribute('aria-label')); if (el.title) out.push(el.title); }
  return out.join(' | '); })()`;
const SMALL_TARGETS = `[...document.querySelectorAll('#game button')].filter(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  if (!r.width || cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.screen:not(.on)') || el.classList.contains('off')) return false; return r.width < 44 || r.height < 44; })
  .map(el => (el.id || el.className) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height))`;
// everything visible fits on screen, below the bar; labels / buttons are not clipped
const LAYOUT = `(() => { const r = el => el.getBoundingClientRect(), bar = r(document.getElementById('l102bar')), out = [], clip = [];
  const shown = el => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && r(el).width > 0 && !el.closest('.screen:not(.on)'); };
  const screen = document.querySelector('.screen.on');
  const sels = screen ? ['#' + screen.id + ' button', '#' + screen.id + ' h1', '#' + screen.id + ' p', '#counter #disp', '#counter #rcpt', '#counter #tray', '#counter #wallet', '#counter #cbox']
    : ['#band button', '#wall', '#arL', '#arR'];
  for (const s of sels) for (const el of document.querySelectorAll(s)) { if (!shown(el)) continue; const q = r(el);
    if (q.left < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1 || q.top < bar.bottom - 1) out.push((el.id || el.className || el.tagName) + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round));
    if (el.matches('button') && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) clip.push(el.id || el.className); }
  if (!screen) { const band = document.getElementById('band'); if (band.scrollWidth > band.clientWidth + 1) clip.push('band'); }
  const tags = [...document.querySelectorAll('.bin')].filter(b => { const t = b.querySelector('.tag'), n = b.querySelector('.nm'), p = b.querySelector('.pr');
    return t.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom + 1 || n.scrollWidth > n.clientWidth + 1 || p.getBoundingClientRect().right > t.getBoundingClientRect().right + 1; }).map(b => b.querySelector('.nm').textContent);
  if (screen && screen.id === 'counter') { const d = document.getElementById('disp'); if (d.scrollHeight > d.clientHeight + 2) clip.push('disp'); }
  return { out, clip, tags, overflowX: document.documentElement.scrollWidth > innerWidth, pageScroll: scrollY !== 0 || document.documentElement.scrollHeight > innerHeight + 1 }; })()`;
function layoutOk(T, tag, L) {
  ok(T(`${tag}: everything on screen and below the top bar`), L.out.length === 0, L.out.slice(0, 4).join("; "));
  ok(T(`${tag}: buttons not clipped`), L.clip.length === 0, L.clip.join(","));
  ok(T(`${tag}: bin names and prices fit their tags`), L.tags.length === 0, L.tags.slice(0, 5).join(" | "));
  ok(T(`${tag}: no page scroll / horizontal overflow`), !L.overflowX && !L.pageScroll);
}
const BAR = `(() => { const n = document.getElementById('l102bar'), r = n.getBoundingClientRect(), mid = c => { const q = c.getBoundingClientRect(); return q.top + q.height / 2; };
  const kids = [...n.children].filter(c => c.getBoundingClientRect().width > 0), link = document.getElementById('l102back');
  return { h: r.height, row: kids.every(c => Math.abs(mid(c) - mid(kids[0])) < 3 && c.getBoundingClientRect().right <= innerWidth + .5), href: link.getAttribute('href'), text: link.textContent,
    fav: (document.querySelector('link[rel=icon]') || {}).href || '', favAfterTitle: document.querySelector('title').nextElementSibling === document.querySelector('link[rel=icon]') }; })()`;

// ============================================================ main journeys at every size
for (const [name, [W, H, touch]] of Object.entries(VIEWS).filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
  if (!run("journey")) break;
  const b = await launch({ url: URL, width: W, height: H, touch });
  const { ev, shot } = b, T = s => `${name}: ${s}`;
  try {
    // first look
    ok(T("starts on the container choice"), await ev("CS.phase") === "choose" && await ev("getComputedStyle(document.getElementById('chooser')).display") === "flex");
    const bar = await ev(BAR);
    ok(T("top bar: back link to https://level102.com, one row"), bar.href === "https://level102.com" && /Back to level102\.com/.test(bar.text) && bar.row && bar.h <= 36, JSON.stringify(bar).slice(0, 120));
    ok(T("favicon: inline svg right after <title>"), bar.fav.startsWith("data:image/svg+xml") && bar.favAfterTitle);
    ok(T("title"), await ev("document.title") === "Candy Shop" && await ev("document.getElementById('chT').textContent") === "Candy Shop");
    ok(T("wallet shown: 25.00"), /25\.00/.test(await ev("document.getElementById('chWal').textContent")) && await ev("CS.wallet().reduce((a, b) => a + b, 0)") === 2500);
    layoutOk(T, "chooser", await ev(LAYOUT));
    await shot(join(SHOTS, `${name}_01_choose.png`));
    // pick the bag: it drops to the bottom
    await press(b, touch, '.card[data-c="bag"]'); await sleep(900);
    ok(T("tapping Bag opens the shop with a bag"), await ev("CS.phase") === "shop" && await ev("CS.ct") === "bag");
    const g = await ev("CS.geo()");
    ok(T("container sits at the bottom of the screen"), g.by > H * .6 && g.by < H, JSON.stringify(g));
    // tap bins
    // bins fully on screen, not behind the container or an arrow, in wall order
    const VIS = `[...document.querySelectorAll('.bin')].map(b => ({ i: +b.dataset.i, r: b.querySelector('canvas').getBoundingClientRect() })).filter(({ r }) => {
      const w = document.getElementById('wall').getBoundingClientRect(), c = document.getElementById('cont').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const under = el => { const q = el.getBoundingClientRect(); return x > q.left - 4 && x < q.right + 4 && y > q.top - 4 && y < q.bottom + 4; };
      return r.left >= w.left && r.right <= w.right && r.top >= w.top && r.bottom <= w.bottom && !under(document.getElementById('cont')) && !under(document.getElementById('arR')) && !under(document.getElementById('arL')); })
      .sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top).map(({ i, r }) => [i, r.left + r.width / 2, r.top + r.height / 2, r.left, r.right])`;
    const tapAt = async p => { if (touch) await b.tap(p[1], p[2]); else await b.click(p[1], p[2]); await sleep(80); return p; };
    const vis = await ev(VIS), kid = i => ev(`KINDS[${i}].id`);
    ok(T("several bins fully visible"), vis.length >= 2, vis.length);
    await tapAt(vis[0]); await sleep(50);
    const k0 = await kid(vis[0][0]), k1 = await kid(vis[1][0]);
    ok(T("tap a bin: one candy goes in"), await ev("CS.count()") === 1 && (await ev("CS.bag()"))[0] === k0);
    await tapAt(vis[1]); await tapAt(vis[1]); await tapAt(vis[0]);
    await sleep(1500);
    const ins = await ev("CS.inside()");
    ok(T("candies land inside the container walls"), ins.ok && ins.n === 4, JSON.stringify(ins));
    const want = await ev("(CS.total() / 100).toFixed(2)"), exp = await ev(`((KINDS[${vis[0][0]}].p + KINDS[${vis[1][0]}].p) * 2 / 100).toFixed(2)`);
    ok(T("the pay button shows the total"), await ev("CS.count()") === 4 && want === exp && JSON.stringify(await ev("CS.bag()")) === JSON.stringify([k0, k1, k1, k0]) && new RegExp(want.replace(".", "\\.")).test(await ev("document.getElementById('payA').textContent")), await ev("document.getElementById('payA').textContent") + " " + JSON.stringify([await ev("CS.bag()"), k0, k1, want, exp, vis.slice(0, 3)]));
    await shot(join(SHOTS, `${name}_02_shop.png`));
    const fill = await ev(`(() => { const w = document.getElementById('wall').getBoundingClientRect(), items = [...document.querySelectorAll('.bin, .sign')].map(e => e.getBoundingClientRect());
      let cov = 0, n = 0; for (let x = w.left + 2; x < w.right; x += 8) { n++; if (items.some(r => r.left <= x && r.right >= x && r.width > 0)) cov++; }
      return { cov: cov / n, h: w.height / innerHeight, rows: binGeo.rows, wide: CS.maxS() > 0 }; })()`);
    ok(T("the wall fills the screen: bins across ≥80% of the width, ≥40% of the height (the container stands below/beside it), scrolls sideways"), fill.cov >= .8 && fill.h >= .4 && fill.wide, JSON.stringify(fill));
    ok(T("shelf rows: " + fill.rows), name === "land" ? fill.rows === 1 : name === "phone" || name === "small" ? fill.rows === 2 : fill.rows >= 3, fill.rows);
    // scroll the wall
    const s0 = await ev("CS.sx()"), wr = await pt(ev, "#wall");
    if (touch) await b.drag(wr[0] + wr[2] * .2, wr[1], -wr[2] * .5, 0, 50); else await mouseDrag(b, wr[0] + wr[2] * .3, wr[1], -wr[2] * .4, 0);
    await sleep(700);
    const s1 = await ev("CS.sx()");
    ok(T(touch ? "swipe scrolls the wall" : "mouse drag scrolls the wall"), s1 > s0 + 50, `${s0} -> ${s1}`);
    ok(T("dragging the wall does not add candy"), await ev("CS.count()") === 4);
    if (!touch) {
      await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: wr[0], y: wr[1], deltaX: 0, deltaY: 300 }); await sleep(300);
      const s2 = await ev("CS.sx()"); ok(T("mouse wheel scrolls the wall"), s2 > s1 + 100, `${s1} -> ${s2}`);
      await b.key("ArrowLeft", "ArrowLeft"); await sleep(500);
      ok(T("arrow key scrolls the wall"), await ev("CS.sx()") < s2 - 50);
      await b.key("End", "End"); for (let i = 0; i < 30 && await ev("Math.abs(CS.sx() - CS.maxS()) >= 2"); i++) await sleep(100);
    } else {
      for (let i = 0; i < 200 && await ev("CS.sx() < CS.maxS() - 1"); i++) { await b.drag(wr[0] + wr[2] * .2, wr[1], -wr[2] * .5, 0, 20); await sleep(500); }
    }
    ok(T("can reach the end of the wall"), await ev("Math.abs(CS.sx() - CS.maxS()) < 2"), `${await ev("CS.sx()")} / ${await ev("CS.maxS()")}`);
    ok(T("right arrow hidden at the end"), await ev("document.getElementById('arR').classList.contains('off')"));
    ok(T("the last section is marked in the menu at the end"), await ev("[...document.querySelectorAll('#secbar .chip')].at(-1).classList.contains('on')"));
    const lastId = await ev("[...document.querySelectorAll('.bin')].sort((a, b) => parseFloat(b.style.left) - parseFloat(a.style.left) || parseFloat(b.style.top) - parseFloat(a.style.top))[0].dataset.i");
    const lastK = await kid(lastId), lv = (await ev(VIS)).find(v => v[0] === +lastId) || (await ev(VIS)).at(-1);
    const lp = await tapAt(lv); await sleep(60);
    ok(T("the last bin is on screen and adds its candy"), lp[4] <= W + 1 && (await ev("CS.bag()")).at(-1) === (lv[0] === +lastId ? lastK : await kid(lv[0])), JSON.stringify(lp) + " " + lastK);
    await shot(join(SHOTS, `${name}_03_end_of_wall.png`));
    // arrow button back to the start
    const sa = await ev("CS.sx()"), ww = (await pt(ev, "#wall"))[2];
    await press(b, touch, "#arL"); await sleep(600);
    ok(T("left arrow button scrolls back"), await ev("CS.sx()") <= Math.max(0, sa - ww * .5) + 1, `${sa} -> ${await ev("CS.sx()")}`);
    await ev("starget = 0, kick(), true"); await sleep(700);
    // tap the container: LIFO, the candy pops out and falls off the screen
    await sleep(800);
    const before = await ev("CS.bag()");
    await press(b, touch, "#cont"); await sleep(50);
    const after1 = await ev("CS.bag()");
    ok(T("tap the container: the last candy comes out (LIFO)"), after1.length === before.length - 1 && JSON.stringify(after1) === JSON.stringify(before.slice(0, -1)));
    const outK = before.at(-1), fl0 = await ev("CS.falling()");
    ok(T("it pops out of the container"), fl0.some(f => f.k === outK), JSON.stringify(fl0));
    await sleep(2600);
    const fl = await ev("CS.falling()");
    ok(T("then falls down out of view and is gone"), fl.length === 0, JSON.stringify(fl));
    await press(b, touch, "#cont"); await sleep(50);
    ok(T("again: the one before comes out"), JSON.stringify(await ev("CS.bag()")) === JSON.stringify(before.slice(0, -2)));
    // tap targets
    const small = await ev(SMALL_TARGETS);
    ok(T("game buttons are at least 44px"), small.length === 0, small.join("; "));
    layoutOk(T, "shop", await ev(LAYOUT));
    // reload keeps the container
    await ev("CS.add(5); CS.add(9); CS.finish(); true"); await sleep(400);
    const keep = await ev("JSON.stringify([CS.ct, CS.bag()])");
    await b.send("Page.reload", {}); await sleep(1300);
    ok(T("reload keeps the container and its candies (same order)"), await ev("JSON.stringify([CS.ct, CS.bag()])") === keep && await ev("CS.phase") === "shop", keep);
    ok(T("after reload they are inside the walls"), (await ev("CS.inside()")).ok);
    // change container: candies move along
    await press(b, touch, "#chg"); await sleep(200);
    ok(T("change container opens the choice with a way back"), await ev("CS.phase") === "choose" && await ev("getComputedStyle(document.getElementById('chBack')).display") !== "none");
    await shot(join(SHOTS, `${name}_04_change.png`));
    await press(b, touch, '.card[data-c="box"]'); await sleep(2500);
    ok(T("new container: box, same candies rain into it"), await ev("CS.ct") === "box" && await ev("JSON.stringify(CS.bag())") === JSON.stringify(JSON.parse(keep)[1]) && (await ev("CS.inside()")).ok);
    await shot(join(SHOTS, `${name}_05_box.png`));
    // pay button -> counter
    await press(b, touch, "#payBtn"); await sleep(400);
    ok(T("Pay opens the counter"), await ev("CS.phase") === "counter");
    const tot = await ev("CS.total()"), sumP = await ev("CS.bag().reduce((s, k) => s + CS.kinds().find(x => x.id === k).p, 0)");
    ok(T("register total = sum of the prices inside"), tot === sumP && (await ev("document.getElementById('dT').textContent")).includes((tot / 100).toFixed(2)), `${tot} ${sumP}`);
    layoutOk(T, "counter", await ev(LAYOUT));
    const small2 = await ev(SMALL_TARGETS);
    ok(T("counter buttons and money are at least 44px"), small2.length === 0, small2.join("; "));
    await shot(join(SHOTS, `${name}_06_counter.png`));
    await press(b, touch, "#backShop"); await sleep(200);
    ok(T("back to the shop"), await ev("CS.phase") === "shop");
    // start over: confirm, the box drops, back to the choice with a full wallet
    await press(b, touch, "#rst"); await sleep(150);
    ok(T("start over asks first"), await ev("getComputedStyle(document.getElementById('confirm')).display") === "flex");
    await press(b, touch, "#cfNo"); await sleep(100);
    ok(T("'no' keeps everything"), await ev("CS.count()") > 0 && await ev("CS.phase") === "shop");
    await press(b, touch, "#rst"); await sleep(100); await press(b, touch, "#cfYes"); await sleep(450);
    await shot(join(SHOTS, `${name}_07_drop.png`));
    await sleep(1300);
    ok(T("'yes' drops it and starts over: choice, empty, wallet 25"), await ev("CS.phase") === "choose" && await ev("CS.count()") === 0 && await ev("CS.ct") === null && await ev("CS.wallet().reduce((a, b) => a + b, 0)") === 2500 && await ev("CS.falling().length") === 0);
    await b.send("Page.reload", {}); await sleep(1100);
    ok(T("after start over a reload shows the choice again"), await ev("CS.phase") === "choose");
    // the top bar does not trigger game actions
    await press(b, touch, '.card[data-c="cup"]'); await sleep(900);
    const c0 = await ev("CS.count()");
    for (const id of ["l102plus", "l102minus", "l102back"]) { if (id === "l102back") { const p = await pt(ev, "#l102back"); await ev("document.getElementById('l102back').addEventListener('click', e => e.preventDefault()), true"); if (touch) await b.tap(p[0], p[1]); else await b.click(p[0], p[1]); } else await press(b, touch, "#" + id); await sleep(120); }
    ok(T("tapping the top bar does nothing in the game"), await ev("CS.count()") === c0 && await ev("CS.phase") === "shop" && await ev("L102.fs") === 1.1);
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 3).join(" | "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// ============================================================ paying at the counter, every language, phone / sideways / desktop
if (run("pay")) for (const [lg, os] of Object.entries(LANGS)) for (const vname of ["phone", "land", "desktop"]) {
  const [W, H, touch] = VIEWS[vname], b = await launch({ url: URL, width: W, height: H, touch, lang: os });
  const { ev, shot } = b, T = s => `pay ${vname} ${lg}: ${s}`, tag = `${vname}_${lg}`;
  const fmt = c => { const s = (c / 100).toFixed(2); return lg === "en" ? s : s.replace(".", ","); };
  const addKinds = async list => { for (const [id, n] of list) await ev(`(() => { const i = CS.binIndex('${id}'); for (let k = 0; k < ${n}; k++) CS.add(i); return true; })()`); await ev("CS.finish(), true"); };
  const coin = async (c, toTray = true) => { const id = await ev(`(() => { const m = [...document.querySelectorAll('${toTray ? "#walItems" : "#trayItems"} .money')].find(el => el.getAttribute('aria-label').includes('${fmt(c)}')); return m ? m.dataset.id : null; })()`);
    if (!id) throw new Error("no money " + c); await press(b, touch, `.money[data-id="${id}"]`); await sleep(120); };
  const disp = () => ev("({ t: document.getElementById('dT').textContent, p: document.getElementById('dP').textContent, s: document.getElementById('dStat').textContent, pay: !document.getElementById('doPay').disabled })");
  try {
    await press(b, touch, '.card[data-c="cup"]'); await sleep(900);
    // 1) exact amount: 5 gummy bears (0.10) + 2 lollipops (0.25) = 1.00
    await addKinds([["bear", 5], ["lolly", 2]]);
    await press(b, touch, "#payBtn"); await sleep(300);
    let d = await disp();
    ok(T("total 1.00 in the local format, nothing paid yet"), d.t.includes(fmt(100)) && d.p.includes(fmt(0)) && !d.pay, JSON.stringify(d));
    ok(T("receipt lists the candies"), await ev("document.querySelectorAll('#rlist li').length") === 2);
    const txt = await ev(VISIBLE);
    ok(T("no $ or € anywhere"), !/[$€£]/.test(txt));
    if (lg !== "en") ok(T("no English on the counter"), !ENGLISH.test(txt), (txt.match(ENGLISH) || [""])[0]);
    await coin(50); d = await disp();
    ok(T("not enough yet: shows what is missing, can't pay"), d.p.includes(fmt(50)) && d.s.includes(fmt(50)) && !d.pay, JSON.stringify(d));
    await press(b, touch, "#doPay"); await sleep(200);
    ok(T("Pay does nothing while money is missing"), await ev("CS.phase") === "counter");
    await coin(50, false); await sleep(100);
    ok(T("tap money on the counter: it goes back to the wallet"), await ev("CS.tray().length") === 0 && await ev("CS.wallet().length") === 11);
    for (const c of [20, 20, 50, 5, 5]) await coin(c);
    d = await disp();
    ok(T("exact amount: register says so, Pay enabled"), d.p.includes(fmt(100)) && d.pay, JSON.stringify(d));
    await shot(join(SHOTS, `pay_${tag}_1_exact.png`));
    await press(b, touch, "#doPay"); await sleep(400);
    await shot(join(SHOTS, `pay_${tag}_2_paying.png`));
    await sleep(1400);
    ok(T("paid: thank-you screen"), await ev("CS.phase") === "done" && await ev("document.getElementById('dnT').textContent") === { en: "Thank you!", es: "¡Gracias!", de: "Danke schön!" }[lg]);
    ok(T("exact: wallet is 24.00, no change"), await ev("CS.wallet().reduce((a, b) => a + b, 0)") === 2400 && (await ev("CS.lastPay()")).change === 0);
    layoutOk(T, "thank you", await ev(LAYOUT));
    await shot(join(SHOTS, `pay_${tag}_3_done.png`));
    await press(b, touch, "#again"); await sleep(300);
    ok(T("play again: choice + full wallet of 25 in mixed bills and coins"), await ev("CS.phase") === "choose" && await ev("CS.wallet().reduce((a, b) => a + b, 0)") === 2500 && await ev("new Set(CS.wallet()).size") >= 6);
    // 2) overpaying: 6 bears + 5 toffees = 1.35, pay with a 2 coin -> 0.65 change as 0.50 + 0.10 + 0.05
    await press(b, touch, '.card[data-c="bag"]'); await sleep(900);
    await addKinds([["bear", 6], ["toffee", 5]]);
    await press(b, touch, "#payBtn"); await sleep(300);
    await coin(200); d = await disp();
    ok(T("overpaying shows the change"), d.s.includes(fmt(65)) && d.pay, JSON.stringify(d));
    await press(b, touch, "#doPay"); await sleep(2200);
    const lp = await ev("CS.lastPay()"), wal = await ev("CS.wallet()");
    ok(T("change is correct and made of real coin values"), lp.change === 65 && JSON.stringify(lp.coins) === "[50,10,5]" && lp.coins.every(c => [2000, 1000, 500, 200, 100, 50, 20, 10, 5].includes(c)), JSON.stringify(lp));
    ok(T("change went back into the wallet"), wal.reduce((a, c) => a + c, 0) === 2500 - 135 && wal.includes(10), JSON.stringify(wal));
    await press(b, touch, "#again"); await sleep(300);
    // 3) too much: fill the box over 25, take candies out until it fits, then pay
    await press(b, touch, '.card[data-c="cup"]'); await sleep(900);
    for (let i = 0; i < 60 && await ev("CS.total()") <= 2560; i++) { await addKinds([["truffle", 3], ["bonbon", 3], ["jelly", 2]]); await sleep(150); await ev("CS.finish(), true"); }
    const over = await ev("CS.total()");
    ok(T("filled to more than 25"), over > 2500, over);
    await press(b, touch, "#payBtn"); await sleep(300);
    d = await disp();
    ok(T("too much: the register says so"), !d.pay && d.s.includes(fmt(await ev("CS.total()") - 2500)) && d.s.includes(fmt(2500)), JSON.stringify(d));
    await shot(join(SHOTS, `pay_${tag}_4_toomuch.png`));
    for (const c of await ev("CS.wallet()")) await ev(`CS.moveMoneyByValue(${c}, true)`);
    await sleep(500);
    ok(T("even with all the money on the counter you can't pay"), !(await disp()).pay && await ev("CS.tray().reduce((a, b) => a + b, 0)") === 2500);
    let n = 0; while (await ev("CS.total()") > 2500 && n < 60) { await press(b, touch, "#ccvBtn"); await sleep(140); n++; }
    await sleep(800);
    const fits = await ev("CS.total()"); d = await disp();
    ok(T("taking candies out (tap the container) until it fits -> Pay enabled"), fits <= 2500 && d.pay, `${fits} after ${n} taps ${JSON.stringify(d)}`);
    await shot(join(SHOTS, `pay_${tag}_5_fits.png`));
    await press(b, touch, "#doPay");
    for (let i = 0; i < 40 && await ev("CS.phase") !== "done"; i++) await sleep(150);
    const lp3 = await ev("CS.lastPay()");
    const ph3 = await ev("CS.phase");
    ok(T("paid with change"), ph3 === "done" && lp3.total <= 2500 && lp3.change === 2500 - lp3.total && lp3.coins.reduce((a, c) => a + c, 0) === 2500 - lp3.total, ph3 + " " + JSON.stringify(lp3).slice(0, 120));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 3).join(" | "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// ============================================================ physics: stress, overflow, frame time
if (run("physics")) {
  const b = await launch({ url: URL, width: 360, height: 740, touch: true });
  const { ev, shot } = b, T = s => `physics: ${s}`;
  try {
    await ev("choose('cup'); CS.finish(); true"); await sleep(900);
    // normal amounts of small candy never spill
    await ev("(() => { for (const id of ['jelly', 'bead', 'corn', 'heart', 'dragee', 'lemon', 'fruitdrop', 'leaf']) { const i = CS.binIndex(id); for (let k = 0; k < 10; k++) CS.add(i); } return true; })()");
    await sleep(3000); await ev("CS.finish(), true");
    ok(T("80 small candies: none spill"), await ev("CS.count()") === 80 && (await ev("CS.inside()")).ok, await ev("CS.count()"));
    // 150+ taps of everything, real time, stays stable
    await ev("CS.perf.reset(), true");
    for (let k = 0; k < 80; k++) { await ev(`CS.add(${(k * 7) % 51}), true`); await sleep(25); }
    await sleep(3500);
    const pf = await ev("({ avg: CS.perf.sum / CS.perf.frames, max: CS.perf.max, frames: CS.perf.frames })");
    await ev("CS.finish(), true");
    const ins = await ev("CS.inside()"), cnt = await ev("CS.count()");
    ok(T("160 candies tapped in: nothing escapes through the walls, no NaN"), ins.ok && ins.n === cnt, JSON.stringify(ins).slice(0, 200));
    ok(T("most candies stay in the container (the rest spilled out)"), cnt >= 80, `${cnt} in`);
    ok(T("frame time stays low (avg < 12 ms) with " + cnt + " candies"), pf.avg < 12, JSON.stringify(pf));
    ok(T("everything settles (sleeping bodies)"), await ev("CS.asleep()") >= cnt * .9, `${await ev("CS.asleep()")}/${cnt}`);
    await sleep(1500); await ev("CS.perf.reset(), true"); await sleep(600);
    ok(T("idle when settled: the loop stops"), await ev("CS.perf.frames") < 5, await ev("CS.perf.frames"));
    await shot(join(SHOTS, "physics_1_full_cup.png"));
    const tot = await ev("CS.total()"), sumP = await ev("CS.bag().reduce((s, k) => s + CS.kinds().find(x => x.id === k).p, 0)");
    ok(T("total = only what is inside"), tot === sumP);
    // overflow: a heap of big cheap marshmallows spills over the rim
    await ev("finishReset(); choose('bag'); CS.finish(); true"); await sleep(800);
    for (let k = 0; k < 90; k++) { await ev("CS.add(CS.binIndex('mallow')), true"); await sleep(30); }
    await sleep(4000); await ev("CS.finish(), true");
    const c2 = await ev("CS.count()");
    ok(T("90 big marshmallows overflow: some fall out"), c2 < 90 && (await ev("CS.inside()")).ok, `${c2} inside`);
    ok(T("spilled candy is not paid for"), await ev("CS.total()") === c2 * 5);
    await shot(join(SHOTS, "physics_2_overflow.png"));
    // every candy kind: name in all 3 languages, draws without errors
    const kinds = await ev("CS.kinds()");
    ok(T(`${kinds.length} candy kinds (150+)`), kinds.length >= 150);
    ok(T("every kind is in a section"), await ev("KINDS.every(k => SECS.some(s => s[0] === k.sec))"));
    ok(T("every kind has a name in en/es/de"), kinds.every(k => k.n.length === 3 && k.n.every(s => s && s.length > 2)), kinds.filter(k => !k.n.every(Boolean)).map(k => k.id).join());
    ok(T("prices are small and payable (5c steps, 5..25c)"), kinds.every(k => k.p % 5 === 0 && k.p >= 5 && k.p <= 25));
    ok(T("big and small sizes"), kinds.some(k => k.s > 1) && kinds.some(k => k.s < 1));
    ok(T("every candy variant draws"), await ev("CS.drawAll()") >= kinds.length);
    ok(T("lots of candy: ≥ 280 kinds in ≥ 16 sections, ids unique"), kinds.length >= 280 && (await ev("CS.secs()")).length >= 16 && new Set(kinds.map(k => k.id)).size === kinds.length, kinds.length + " kinds");
    const blank = await ev(`(() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d', { willReadFrequently: true }), bad = [];
      for (const k of KINDS) for (let v = 0; v < k.v.length; v++) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 64, 64); c.translate(32, 32); const s = 26 / Math.max(k.ex, k.ey); c.scale(s, s); c.save(); k.d(c, k.v[v], v); c.restore();
        const d = c.getImageData(0, 0, 64, 64).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; if (n < 150) bad.push(k.id + ':' + v + '=' + n); } return bad; })()`);
    ok(T("every kind and variant has visible art (no blank drawings)"), blank.length === 0, blank.slice(0, 8).join(" "));
    const secs = await ev("CS.secs().length"), unreached = [];
    for (let i = 0; i < secs; i++) {
      await ev(`chipEls[${i}].click(), true`); await sleep(650);
      const r = await ev(`(() => { const w = document.getElementById('wall').getBoundingClientRect(), s = signEls[${i}].getBoundingClientRect();
        return { vis: s.left >= w.left - 2 && s.left < w.right - 20, empty: !KINDS.some(k => k.sec === SECS[${i}][0]) }; })()`);
      if (!r.vis || r.empty) unreached.push(i + JSON.stringify(r));
    }
    ok(T("every section (" + secs + ") is reached from the chip bar and has candy"), unreached.length === 0, unreached.join(" "));
    ok(T("no console errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// ============================================================ languages: first frame, no English, switching keeps state
if (run("i18n")) for (const [os, want] of [["en-US", "en"], ["es-ES", "es"], ["de-DE", "de"], ["fr-FR", "en"]]) {
  const b = await launch({ url: URL, width: 360, height: 740, touch: true, lang: os });
  const { ev, shot } = b, T = s => `i18n ${os}: ${s}`;
  try {
    ok(T("language from the OS"), await ev("document.documentElement.lang") === want && await ev("L102.lang") === want);
    ok(T("title"), await ev("document.title") === TITLES[want] && await ev("document.getElementById('chT').textContent") === TITLES[want]);
    const txt = await ev(VISIBLE);
    if (want !== "en") ok(T("no English on the first screen"), !ENGLISH.test(txt), (txt.match(ENGLISH) || [""])[0]);
    ok(T("no $ or €"), !/[$€£]/.test(txt));
    await ev("choose('bag'); CS.finish(); for (let i = 0; i < 12; i++) CS.add(i * 4); CS.finish(); true"); await sleep(300);
    const txt2 = await ev(VISIBLE);
    if (want !== "en") ok(T("no English in the shop (bins, prices, buttons, labels)"), !ENGLISH.test(txt2), (txt2.match(ENGLISH) || [""])[0]);
    ok(T("prices in the local format"), await ev("document.querySelector('.bin .pr').textContent").then(s => want === "en" ? /0\.10/.test(s) : /0,10/.test(s)));
    await shot(join(SHOTS, `i18n_${os}_shop.png`));
    if (os === "es-ES") {
      const keep = await ev("JSON.stringify([CS.bag(), CS.ct])");
      await setLang(ev, "de"); await sleep(200);
      ok(T("switch to German in place: same candies"), await ev("JSON.stringify([CS.bag(), CS.ct])") === keep && await ev("document.title") === TITLES.de && await ev("document.querySelector('.bin .nm').textContent") === "Gummi­bärchen");
      await ev("openCounter(), true"); await sleep(200);
      await setLang(ev, "en"); await sleep(200);
      ok(T("switch on the counter: re-rendered, still on the counter"), await ev("CS.phase") === "counter" && /Total/.test(await ev("document.getElementById('dTl').textContent")) && await ev("JSON.stringify([CS.bag(), CS.ct])") === keep);
      await setLang(ev, "es"); await sleep(200);
      ok(T("back to Spanish"), /Total/.test(await ev("document.getElementById('dTl').textContent")) && /Ticket/.test(await ev("document.getElementById('rT').textContent")));
    }
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// ============================================================ layout matrix: every size x language x text-size end
if (run("matrix")) for (const [vname, [W, H, touch]] of Object.entries(VIEWS).filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) for (const [lg, os] of Object.entries(LANGS)) for (const fs of [0.8, 1.8]) {
  if (fs === 0.8 && lg === "de") continue;
  const b = await launch({ url: URL, width: W, height: H, touch, lang: os });
  const { ev, shot } = b, tag = `${vname}_${lg}_${fs}`, T = s => `matrix ${tag}: ${s}`;
  const shoot = ["phone_de_1.8", "phone_es_1.8", "small_de_1.8", "land_de_1.8", "land_es_0.8", "tablet_de_1.8", "desktop_de_1.8", "desktop_en_0.8"].includes(tag);
  try {
    await ev(`localStorage.setItem('l102.fs', '${fs}'); true`); await b.send("Page.reload", {}); await sleep(900);
    ok(T("language and text size applied"), await ev("L102.lang") === lg && await ev("L102.fs") === fs);
    const bar = await ev(BAR); ok(T("top bar one row"), bar.row && bar.h <= 36);
    layoutOk(T, "chooser", await ev(LAYOUT));
    if (shoot) await shot(join(SHOTS, `m_${tag}_1_choose.png`));
    await ev("choose('cup'); CS.finish(); for (let i = 0; i < 40; i++) CS.add(i); CS.finish(); true"); await sleep(400);
    layoutOk(T, "shop", await ev(LAYOUT));
    ok(T("shop: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    if (shoot) await shot(join(SHOTS, `m_${tag}_2_shop.png`));
    await ev("openCounter(); CS.moveMoneyByValue(1000, true); CS.moveMoneyByValue(200, true); CS.moveMoneyByValue(5, true); true"); await sleep(700);
    layoutOk(T, "counter", await ev(LAYOUT));
    ok(T("counter: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    if (shoot) await shot(join(SHOTS, `m_${tag}_3_counter.png`));
    const rc = await ev(`(() => { const c = document.getElementById('counter'), b = document.getElementById('rT'), l = document.getElementById('rlist');
      if (!c.classList.contains('rcol')) return { col: false, shown: getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().height > 0 };
      const h = b.getBoundingClientRect().height, label = b.textContent; b.click(); const open = getComputedStyle(l).display !== 'none' && l.querySelectorAll('li').length > 0;
      b.click(); return { col: true, h, label, open, closed: getComputedStyle(l).display === 'none' }; })()`);
    ok(T("receipt shown, or collapsed with a 44px toggle that opens it"), rc.col ? rc.h >= 44 && /\(40\)/.test(rc.label) && rc.open && rc.closed : rc.shown, JSON.stringify(rc));
    await ev("document.getElementById('rst2').click(), true"); await sleep(150);
    layoutOk(T, "confirm", await ev(LAYOUT));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// ============================================================ hints sit on the floating container: never over the buttons or the section bar
const COVER = `(() => { const hint = document.getElementById('hint'); if (!hint.classList.contains('on')) return ['hint not shown'];
  const h = hint.getBoundingClientRect(), c0 = document.getElementById('cont').getBoundingClientRect(), bad = [];
  // the container itself (rim down); an overflowing heap above the rim may be under the hint
  const c = { left: c0.left, right: c0.right, bottom: c0.bottom, top: Math.max(c0.top, CS.geo().rimY - CS.U() * 1.5 + c0.top - parseFloat(document.getElementById('cont').style.top)) };
  const hit = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
  if (hit(h, c)) bad.push('hint covers the container');
  if (Math.max(c.top - h.bottom, c.left - h.right, h.left - c.right) > 80) bad.push('hint far from the container');
  for (const el of document.querySelectorAll('#band button, #secbar, #arL, #arR')) { const r = el.getBoundingClientRect(); if (r.width && !el.classList.contains('off') && hit(h, r)) bad.push('hint covers ' + (el.id || el.className)); }
  if (h.left < 0 || h.right > innerWidth || h.bottom > innerHeight) bad.push('hint off screen');
  return bad; })()`;
if (run("cover")) for (const [vname, [W, H, touch]] of Object.entries(VIEWS)) for (const fs of [1.1, 1.8]) {
  const b = await launch({ url: URL, width: W, height: H, touch, lang: "de-DE" });
  const { ev, shot } = b, tag = `${vname}_${fs}`, T = s => `cover ${tag}: ${s}`;
  try {
    await ev(`localStorage.setItem('l102.fs', '${fs}'); true`); await b.send("Page.reload", {}); await sleep(900);
    await ev("choose('box'); CS.finish(); true"); await sleep(800);
    await ev("showHint(t('hint1'), 0, 'hint1'), true"); await sleep(300);
    let c = await ev(COVER); ok(T("first hint sits next to the container, not on it, clear of buttons and sections"), c.length === 0, c.join("; "));
    for (let k = 0; k < 120; k++) { await ev("CS.add(CS.binIndex('mallow')), true"); if (k % 3 === 0) await ev("CS.add(CS.binIndex('jaw')), true"); await sleep(18); }
    await sleep(3000); await ev("CS.finish(), true");
    await ev("showHint(STR[L102.lang].hint2(CS.ct), 0), true"); await sleep(300);
    c = await ev(COVER); ok(T("with an overflowing heap too"), c.length === 0, c.join("; ") + (c.length ? " " + JSON.stringify(await ev("({h:document.getElementById('hint').getBoundingClientRect().toJSON(),c:document.getElementById('cont').getBoundingClientRect().toJSON(),g:CS.geo(),U:CS.U()})")) : ""));
    if (["phone_1.8", "small_1.8", "land_1.1", "desktop_1.8", "big_1.1"].includes(tag)) await shot(join(SHOTS, `cover_${tag}.png`));
    ok(T("no console errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// ============================================================ save, collection (cs.inv), big view (rename with the pencil, remove with a confirmation), share a picture + link
const GAME_URL = "https://level102.com/candyshop/";
async function fillAndPay(ev, list, type = "bag") {
  await ev(`(() => { if (CS.phase !== 'choose') finishReset(); choose('${type}'); CS.finish(); for (const [id, n] of ${JSON.stringify(list)}) { const i = CS.binIndex(id); for (let k = 0; k < n; k++) CS.add(i); } CS.finish(); return true; })()`);
  await sleep(300);
  await ev("openCounter(); for (const c of CS.wallet()) CS.moveMoneyByValue(c, true); doPay(); true");
  for (let i = 0; i < 40 && await ev("CS.phase") !== "done"; i++) await sleep(150);
  await sleep(300);
}
// everything shown in a screen fits (content inside a scroller is checked through its scroller)
const FIT = id => `(() => { const sc = document.getElementById('${id}'), bar = document.getElementById('l102bar').getBoundingClientRect(), out = [], clip = [];
  for (const el of sc.querySelectorAll('button, h1, h2, p, input, label, .scrl, canvas, .drow')) { const cs = getComputedStyle(el), q = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || !q.width || el.closest('[hidden]') || el.id === 'confetti') continue;
    if (el.parentElement.closest('.scrl')) { if (el.matches('.th') && (el.scrollWidth > el.clientWidth + 2)) clip.push('th'); continue; }
    if (q.left < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1 || q.top < bar.bottom - 1) out.push((el.id || el.className || el.tagName) + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round));
    if (el.matches('button') && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) clip.push(el.id || el.className); }
  return { out, clip, overflowX: document.documentElement.scrollWidth > innerWidth, pageScroll: scrollY !== 0 }; })()`;
function fitOk(T, tag, F) {
  ok(T(`${tag}: everything on screen, below the top bar`), F.out.length === 0, F.out.slice(0, 4).join("; "));
  ok(T(`${tag}: buttons not clipped`), F.clip.length === 0, F.clip.join(","));
  ok(T(`${tag}: no page scroll`), !F.overflowX && !F.pageScroll);
}
const inkOf = sel => `(() => { const cv = document.querySelector(${JSON.stringify(sel)}); if (!cv || !cv.width) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n; })()`;
const sorted = a => JSON.stringify([...a].sort());
const pngSize = `async f => { const bm = await createImageBitmap(f); return [bm.width, bm.height]; }`;

if (run("coll")) for (const vname of ["phone", "desktop"]) {
  const [W, H, touch] = VIEWS[vname], b = await launch({ url: URL, width: W, height: H, touch });
  const { ev, shot } = b, T = s => `coll ${vname}: ${s}`;
  try {
    await fillAndPay(ev, [["bear", 3], ["dino", 2], ["cupcake", 2], ["pumpkin", 1]]);
    ok(T("paid: the done screen"), await ev("CS.phase") === "done");
    const d0 = await ev(`(() => { const g = id => document.getElementById(id), vis = id => getComputedStyle(g(id)).display !== 'none' && g(id).getBoundingClientRect().width > 0;
      return { ph: g('dnName').placeholder, save: vis('dnSave') && g('dnSave').textContent, share: vis('dnShare') && g('dnShare').textContent, coll: vis('dnColl') && g('dnColl').textContent, again: vis('again'), cv: g('doneCv').getBoundingClientRect().height }; })()`);
    ok(T("done screen: name field with a generated name, Save, Share, My collection, Play again"), d0.ph.length > 3 && d0.save === "Save" && d0.share === "Share" && d0.coll === "My collection" && d0.again && d0.cv >= 70, JSON.stringify(d0));
    fitOk(T, "done", await ev(FIT("done")));
    ok(T("done: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    const snap = await ev("CS.snap()");
    await press(b, touch, "#dnName"); await b.send("Input.insertText", { text: "Sweet Tower" }); await sleep(100);
    ok(T("typing in the name field"), await ev("document.activeElement.id") === "dnName" && await ev("document.getElementById('dnName').value") === "Sweet Tower");
    await shot(join(SHOTS, `coll_${vname}_1_done_name.png`));
    await press(b, touch, "#dnSave"); await sleep(200);
    const s1 = await ev(`(() => { const o = JSON.parse(localStorage.getItem('cs.inv')); return { v: o.v, n: o.items.length, name: o.items[0].n, c: o.items[0].c, t: o.items[0].t, img: /data:image/.test(localStorage.getItem('cs.inv')),
      dis: document.getElementById('dnSave').disabled, txt: document.getElementById('dnSave').textContent }; })()`);
    ok(T("Save: stored in cs.inv (versioned, layout data, no image) with the name; button says Saved! and is off"), s1.v === 1 && s1.n === 1 && s1.name === "Sweet Tower" && s1.c === "bag" && s1.t === await ev("CS.lastPay().total") && !s1.img && s1.dis && s1.txt === "Saved!", JSON.stringify(s1));
    ok(T("the saved layout redraws the same candies (count and kinds)"), sorted(await ev("CS.itemCandies(0).map(c => c[0])")) === sorted(snap) && snap.length === 8, JSON.stringify(snap));
    await press(b, touch, "#dnColl"); await sleep(400);
    const g1 = await ev(`(() => { const t = [...document.querySelectorAll('#clGrid .th')]; return { on: document.getElementById('coll').classList.contains('on'), n: t.length, name: t[0] && t[0].querySelector('.tn').textContent, title: document.getElementById('clT').textContent }; })()`);
    ok(T("My collection opens: one picture with its name"), g1.on && g1.n === 1 && g1.name === "Sweet Tower" && g1.title === "My collection", JSON.stringify(g1));
    ok(T("the thumbnail is drawn"), await ev(inkOf("#clGrid .th canvas")) > 200);
    fitOk(T, "collection", await ev(FIT("coll")));
    await shot(join(SHOTS, `coll_${vname}_2_grid.png`));
    await press(b, touch, "#clGrid .th"); await sleep(300);
    const v1 = await ev(`(() => { const g = id => document.getElementById(id); return { on: g('view').classList.contains('on'), name: g('vwName').textContent, li: g('vwList').querySelectorAll('li').length, tot: g('vwTot').textContent, date: g('vwDate').textContent, edit: g('vwEdit').getAttribute('aria-label') }; })()`);
    ok(T("tap it: the big view with name, pencil, what's inside, total, date"), v1.on && v1.name === "Sweet Tower" && v1.li === 4 && v1.tot.includes((await ev("CS.lastPay().total") / 100).toFixed(2)) && /8 candies/.test(v1.tot) && /Saved on/.test(v1.date) && v1.edit === "Rename", JSON.stringify(v1));
    ok(T("the big picture is drawn"), await ev(inkOf("#vwCv")) > 1000);
    fitOk(T, "big view", await ev(FIT("view")));
    ok(T("big view: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    await shot(join(SHOTS, `coll_${vname}_3_view.png`));
    // rename with the pencil
    await press(b, touch, "#vwEdit"); await sleep(150);
    ok(T("the pencil opens the name field with the name in it"), !(await ev("document.getElementById('vwForm').hidden")) && await ev("document.activeElement.id") === "vwIn" && await ev("document.getElementById('vwIn').value") === "Sweet Tower");
    fitOk(T, "renaming", await ev(FIT("view")));
    await ev("document.getElementById('vwIn').select(), true"); await b.send("Input.insertText", { text: "Candy Castle" });
    await shot(join(SHOTS, `coll_${vname}_4_rename.png`));
    if (vname === "desktop") await b.key("Enter", "Enter"); else await press(b, touch, "#vwOk");
    await sleep(200);
    ok(T("rename saved: shown and stored"), await ev("document.getElementById('vwName').textContent") === "Candy Castle" && await ev("JSON.parse(localStorage.getItem('cs.inv')).items[0].n") === "Candy Castle" && await ev("document.getElementById('vwForm').hidden"));
    await press(b, touch, "#vwBack"); await sleep(200);
    ok(T("back to the grid: the new name is on the thumbnail"), await ev("document.querySelector('#clGrid .th .tn').textContent") === "Candy Castle" && !(await ev("document.getElementById('view').classList.contains('on')")));
    await press(b, touch, "#clBack"); await sleep(200);
    ok(T("closing the collection goes back to the done screen"), await ev("CS.phase") === "done" && !(await ev("document.getElementById('coll').classList.contains('on')")));
    // share: picture + link
    await ev(`window.__sh = null; navigator.canShare = d => !!(d && d.files && d.files.length); navigator.share = async d => { const f = d.files && d.files[0];
      window.__sh = { n: d.files ? d.files.length : 0, type: f && f.type, name: f && f.name, size: f && f.size, url: d.url, text: d.text, title: d.title, wh: f ? await (${pngSize})(f) : null,
        data: f ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) : null }; }; true`);
    await press(b, touch, "#dnShare"); for (let i = 0; i < 80 && !(await ev("!!window.__sh")); i++) await sleep(100);
    const sh = await ev("window.__sh && Object.assign({}, window.__sh, { data: (window.__sh.data || '').slice(0, 30) })");
    ok(T("Share (device can share files): one 1080x1350 PNG + the game link (url and in the text) + the name"), sh && sh.n === 1 && sh.type === "image/png" && sh.name === "candy.png" && sh.size > 20000 && sh.wh[0] === 1080 && sh.wh[1] === 1350 && sh.url === GAME_URL && sh.title === "Candy Castle" && sh.text.includes("Candy Castle") && sh.text.includes(GAME_URL), JSON.stringify(sh));
    const png = await ev("window.__sh.data"); writeFileSync(join(SHOTS, `coll_${vname}_5_shared.png`), Buffer.from(png.split(",")[1], "base64"));
    // cancelled share: nothing happens
    await ev("navigator.share = async () => { throw new DOMException('cancel', 'AbortError'); }; window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push([this.download, this.href]); }; true");
    ok(T("cancelling the share sheet: no error, no download"), await ev("CS.share()") === "cancel" && await ev("window.__dl.length") === 0);
    // no file sharing: the picture is downloaded and the link copied
    await ev(`navigator.canShare = undefined; navigator.share = undefined; window.__clip = null; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async s => { window.__clip = s; } }, configurable: true }); } catch (e) {} true`);
    await press(b, touch, "#dnShare"); for (let i = 0; i < 80 && !(await ev("window.__dl.length")); i++) await sleep(100); await sleep(200);
    const dl = await ev(`(async () => { const [n, h] = window.__dl[0] || []; if (!h) return null; const bl = await (await fetch(h)).blob(); const sig = new Uint8Array(await bl.slice(0, 4).arrayBuffer());
      return { n, type: bl.type, size: bl.size, png: sig[1] === 80 && sig[2] === 78 && sig[3] === 71, clip: window.__clip, toast: document.getElementById('store').textContent, shown: getComputedStyle(document.getElementById('store')).display }; })()`);
    ok(T("Share without file sharing: downloads candy.png and copies the link, with a message"), dl && dl.n === "candy.png" && dl.png && dl.size > 20000 && dl.clip && dl.clip.includes(GAME_URL) && dl.shown === "block" && /Picture saved/.test(dl.toast), JSON.stringify(dl));
    // reload: the collection survives; remove asks first
    await b.send("Page.reload", {}); await sleep(1000);
    ok(T("after reload the collection is still there"), await ev("CS.inv().length") === 1 && await ev("CS.inv()[0].n") === "Candy Castle");
    ok(T("the collection opens from the first screen too"), await ev("CS.phase") === "choose" && await ev("getComputedStyle(document.getElementById('chColl')).display") !== "none");
    await press(b, touch, "#chColl"); await sleep(300);
    await press(b, touch, "#clGrid .th"); await sleep(300);
    await press(b, touch, "#vwDel"); await sleep(150);
    ok(T("Remove asks first"), await ev("document.getElementById('confirm').classList.contains('on')") && /Remove this one/.test(await ev("document.getElementById('cfT').textContent")));
    await shot(join(SHOTS, `coll_${vname}_6_remove_confirm.png`));
    await press(b, touch, "#cfNo"); await sleep(150);
    ok(T("'No' keeps it"), await ev("CS.inv().length") === 1 && await ev("document.getElementById('view').classList.contains('on')"));
    await press(b, touch, "#vwDel"); await sleep(150); await press(b, touch, "#cfYes"); await sleep(250);
    ok(T("'Yes' removes it: empty collection message"), await ev("JSON.parse(localStorage.getItem('cs.inv')).items.length") === 0 && !(await ev("document.getElementById('view').classList.contains('on')")) && await ev("getComputedStyle(document.getElementById('clEmpty')).display") !== "none");
    await shot(join(SHOTS, `coll_${vname}_7_empty.png`));
    await press(b, touch, "#clBack"); await sleep(200);
    // names are text, never html
    const XSS = `<img src=x onerror="window.__x=1">`;
    await fillAndPay(ev, [["gumball", 4]], "cup");
    await press(b, touch, "#dnName"); await b.send("Input.insertText", { text: XSS }); await press(b, touch, "#dnSave"); await sleep(150);
    await ev("CS.openColl(), CS.openView(CS.inv()[0].id), true"); await sleep(300);
    const x = await ev(`({ th: document.querySelector('#clGrid .th .tn').textContent, h: document.getElementById('vwName').textContent, img: document.querySelectorAll('#coll img, #view img').length, x: window.__x === 1 })`);
    ok(T("an html-looking name shows as plain text"), x.th === XSS.slice(0, 32) && x.h === XSS.slice(0, 32) && x.img === 0 && !x.x, JSON.stringify(x));
    ok(T("names are capped at 32 characters"), (await ev("CS.inv()[0].n")).length === 32);
    // Edit: the saved container goes back to the shop with every candy where it lay; paying again saves a NEW item, the name filled in
    const before = await ev("JSON.stringify(CS.inv()[0])"), want = await ev("CS.itemCandies(0)");
    const near = got => got.length === want.length && got.every((r, i) => r && Math.abs(r[0] - want[i][2]) < .02 && Math.abs(r[1] - want[i][3]) < .02);
    await press(b, touch, "#vwRedo"); await sleep(500); let rel = await ev("CS.rel()");
    ok(T("Edit: back in the shop with the same container and every candy where it lay"), await ev("CS.phase") === "shop" && await ev("CS.ct") === "cup" && near(rel) && !(await ev("document.getElementById('coll').classList.contains('on')")), JSON.stringify({ rel: rel.slice(0, 2), want: want.slice(0, 2) }));
    await shot(join(SHOTS, `coll_${vname}_8_edit.png`));
    await b.send("Page.reload", {}); await sleep(1000); rel = await ev("CS.rel()");
    ok(T("Edit: after a reload every candy is still where it lay"), await ev("CS.phase") === "shop" && near(rel), JSON.stringify(rel.slice(0, 2)));
    await ev("(() => { CS.add(CS.binIndex('jelly')); CS.finish(); CS.openColl(); CS.openView(CS.inv()[0].id); return true; })()"); await sleep(300);
    const n1 = await ev("CS.count()"); await press(b, touch, "#vwRedo"); await sleep(150);
    const ask = await ev("document.getElementById('confirm').classList.contains('on') && document.getElementById('cfT').textContent");
    await press(b, touch, "#cfNo"); await sleep(150);
    ok(T("Edit while filling another one asks first; No keeps what you have"), /Edit this one/.test(ask) && await ev("CS.count()") === n1 && n1 === want.length + 1 && await ev("document.getElementById('view').classList.contains('on')"), String(ask));
    await press(b, touch, "#vwRedo"); await sleep(150); await press(b, touch, "#cfYes"); await sleep(400);
    ok(T("Yes: the saved one is loaded"), await ev("CS.phase") === "shop" && await ev("CS.count()") === want.length && near(await ev("CS.rel()")));
    await ev("openCounter(); for (const c of CS.wallet()) CS.moveMoneyByValue(c, true); doPay(); true");
    for (let i = 0; i < 40 && await ev("CS.phase") !== "done"; i++) await sleep(150); await sleep(300);
    ok(T("after paying again the name is filled in"), await ev("document.getElementById('dnName').value") === XSS.slice(0, 32));
    await press(b, touch, "#dnSave"); await sleep(150);
    ok(T("Save adds a new item and the original stays as it was"), await ev("CS.inv().length") === 2 && await ev("JSON.stringify(CS.inv()[1])") === before && await ev("CS.inv()[0].n") === XSS.slice(0, 32));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 3).join(" | "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

if (run("coll")) {
  const b = await launch({ url: URL, width: 360, height: 740, touch: true });
  const { ev, shot } = b, T = s => `coll data: ${s}`;
  try {
    // old / broken data never crashes; unknown candy (a newer version) is skipped but kept
    const good = { id: "a1", n: "Old one", g: 5, c: "box", t: 25, d: 1700000000000, k: ["zzz_future", "bear"], p: [0, 0, 10, -50, 0, 1, 0, 100, -60, 30, 1, 99, 0, 0, 0] };
    const bads = ["not json {", "null", "[1,2]", JSON.stringify({ v: 99, items: [good] }), JSON.stringify({ v: 1, items: "x" }), JSON.stringify({ v: 1, items: [null, 5, "s", { c: "tank" }, { c: "bag", k: 1, p: [] }, good] })];
    const res = [];
    for (const raw of bads) { await ev(`localStorage.setItem('cs.inv', ${JSON.stringify(raw)}); CS.invReload(); CS.openColl(); CS.closeColl(); true`); res.push(await ev("CS.inv().length")); }
    ok(T("broken cs.inv data: no crash, only valid items load"), JSON.stringify(res) === "[0,0,0,0,0,1]" && b.errors.length === 0, JSON.stringify(res) + b.errors.join(" "));
    ok(T("unknown candy ids and bad variants are skipped when drawing"), JSON.stringify(await ev("CS.itemCandies(0).map(c => c[0])")) === '["bear"]');
    await ev("CS.openColl(), CS.openView('a1'), true"); await sleep(300);
    ok(T("an old item opens in the big view"), await ev("document.getElementById('vwName').textContent") === "Old one" && await ev(inkOf("#vwCv")) > 500);
    await ev("CS.closeColl(), true");
    await fillAndPay(ev, [["jelly", 5]]); await ev("CS.save(), true");
    ok(T("saving next to it keeps the unknown candy data (backward/forward compatible)"), await ev("JSON.parse(localStorage.getItem('cs.inv')).items.length") === 2 && /zzz_future/.test(await ev("localStorage.getItem('cs.inv')")));
    // 200 saves: fits in storage, opens fast, the grid scrolls
    const size = await ev(`(() => { const ids = KINDS.map(k => k.id), items = []; for (let i = 0; i < 200; i++) { const k = ids.slice((i * 7) % 250, (i * 7) % 250 + 12), p = [];
        for (let j = 0; j < 60; j++) p.push(j % k.length, 0, Math.round(Math.sin(j) * 300), -40 - (j % 10) * 60, (j * 37) % 628); items.push({ id: 'm' + i, n: 'Mix ' + i, g: i, c: ['bag', 'box', 'cup'][i % 3], t: 500 + i, d: Date.now() - i * 1000, k, p }); }
      const s = JSON.stringify({ v: 1, items }); localStorage.setItem('cs.inv', s); return s.length; })()`);
    ok(T("200 saved containers of 60 candies fit in storage (" + Math.round(size / 1024) + " KB)"), size < 2.5e6, size);
    await b.send("Page.reload", {}); await sleep(1000);
    const tOpen = await ev("(() => { const t0 = performance.now(); CS.openColl(); document.getElementById('clGrid').offsetHeight; return performance.now() - t0; })()");
    await sleep(400);
    ok(T("opening a collection of 200 is fast"), tOpen < 800 && await ev("document.querySelectorAll('#clGrid .th').length") === 200, Math.round(tOpen) + " ms");
    ok(T("only the visible thumbnails are drawn"), await ev("document.querySelectorAll('#clGrid .th[data-drawn]').length") < 60);
    await ev("document.getElementById('clGrid').scrollTop = 1e6, true"); await sleep(500);
    ok(T("scrolling down draws the last ones"), await ev("document.querySelector('#clGrid .th:last-child').dataset.drawn") === "1" && await ev("document.querySelector('#clGrid .th:last-child .tn').textContent") === "Mix 199");
    await shot(join(SHOTS, "coll_200.png"));
    ok(T("200: no errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" "));
    // full or blocked storage: a friendly message, never an error
    await ev("CS.closeColl(), localStorage.removeItem('cs.inv'), CS.invReload(), true");
    await fillAndPay(ev, [["mint", 3]]);
    await ev("Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; true");
    await press(b, true, "#dnSave"); await sleep(200);
    const full = await ev("({ msg: document.getElementById('store').textContent, shown: getComputedStyle(document.getElementById('store')).display, dis: document.getElementById('dnSave').disabled, n: CS.inv().length })");
    ok(T("storage full: Save shows a message, nothing breaks"), /can't be saved/.test(full.msg) && full.shown === "block" && !full.dis && full.n === 0 && b.errors.length === 0, JSON.stringify(full) + b.errors.join(" "));
    await shot(join(SHOTS, "coll_full.png"));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}

// done screen, collection and big view at every size, both text-size ends, es / de
// smooth wall: a freshly drawn bin is costly to paint, so at most one bin is drawn per frame while the wall moves,
// and once it rests every bin in view is drawn (a finger swipes it with touch events, CPU slowed 4x like a phone)
if (run("scroll")) for (const [vname, [W, H]] of [["phone", VIEWS.phone], ["tablet", VIEWS.tablet]]) {
  const b = await launch({ url: URL, width: W, height: H, touch: true }), { ev, send } = b, T = s => `scroll ${vname}: ${s}`;
  try {
    await sleep(900); await ev("choose('bag'); CS.finish(); true"); await sleep(1500); await send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await ev(`(() => { window.__per = []; let n = 0; const o = drawBinArt; drawBinArt = function () { if (wallMoving()) n++; return o.apply(this, arguments); };
      const tick = () => { if (n) window.__per.push(n); n = 0; requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
    const y = Math.round(H * .3);
    for (let k = 0; k < 4; k++) { await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: W * .85, y, id: 1 }] });
      for (let i = 1; i <= 15; i++) { await sleep(16); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: W * .85 - W * .7 * i / 15, y, id: 1 }] }); }
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(250); }
    const during = await ev("window.__per.slice()"); await send("Emulation.setCPUThrottlingRate", { rate: 1 }); await sleep(2500);
    const r = await ev("({ sx: CS.sx(), blank: [...document.querySelectorAll('#track .bin')].filter(el => { const q = el.getBoundingClientRect(); return q.right > 0 && q.left < innerWidth && el.querySelector('canvas').width <= 1; }).length })");
    ok(T("the wall moved"), r.sx > W, String(r.sx));
    ok(T("while the wall moves: never more than one bin drawn in a frame"), during.length > 0 && Math.max(...during) <= 1, JSON.stringify(during));
    ok(T("at rest: every bin in view is drawn"), r.blank === 0, String(r.blank));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}
if (run("collsizes")) for (const [vname, [W, H, touch]] of Object.entries(VIEWS).filter(([n]) => n !== "big")) for (const [lg, fs] of [["de", 1.8], ["es", 0.8], ["en", 1.8]]) {
  const b = await launch({ url: URL, width: W, height: H, touch, lang: LANGS[lg] });
  const { ev, shot } = b, tag = `${vname}_${lg}_${fs}`, T = s => `collsizes ${tag}: ${s}`, snap = lg !== "en" || vname === "small";
  try {
    await ev(`localStorage.setItem('l102.fs', '${fs}'); true`); await b.send("Page.reload", {}); await sleep(900);
    await fillAndPay(ev, [["lolly", 4], ["macaron", 6], ["snowman", 3], ["bear", 10]], "cup");
    fitOk(T, "done", await ev(FIT("done")));
    ok(T("done: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    ok(T("done: the picture of the container is shown"), await ev("document.getElementById('doneCv').getBoundingClientRect().height") >= 60);
    if (lg !== "en") { const txt = await ev(VISIBLE); ok(T("done: no English"), !ENGLISH.test(txt), (txt.match(ENGLISH) || [""])[0]); }
    if (snap) await shot(join(SHOTS, `cs_${tag}_1_done.png`));
    await ev("CS.save(); for (let i = 0; i < 4; i++) { const it = Object.assign({}, CS.inv()[0], { id: 'c' + i, n: i ? '' : 'Ein sehr langer Name für Süßes!', g: i * 977 }); CS.inv().push(it); } true");
    await ev("document.getElementById('dnColl').click(), true"); await sleep(400);
    fitOk(T, "collection", await ev(FIT("coll")));
    ok(T("collection: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    if (lg !== "en") { const txt = await ev(VISIBLE); ok(T("collection: no English"), !ENGLISH.test(txt), (txt.match(ENGLISH) || [""])[0]); }
    if (snap) await shot(join(SHOTS, `cs_${tag}_2_grid.png`));
    await ev("document.querySelectorAll('#clGrid .th')[1].click(), true"); await sleep(300);
    fitOk(T, "big view", await ev(FIT("view")));
    ok(T("big view: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    ok(T("big view: the picture has room"), await ev("document.getElementById('vwCv').getBoundingClientRect().height") >= 80, await ev("document.getElementById('vwCv').getBoundingClientRect().height"));
    if (lg !== "en") { const txt = await ev(VISIBLE); ok(T("big view: no English"), !ENGLISH.test(txt), (txt.match(ENGLISH) || [""])[0]); }
    if (snap) await shot(join(SHOTS, `cs_${tag}_3_view.png`));
    await ev("document.getElementById('vwEdit').click(), true"); await sleep(150);
    fitOk(T, "renaming", await ev(FIT("view")));
    ok(T("renaming: tap targets"), (await ev(SMALL_TARGETS)).length === 0, (await ev(SMALL_TARGETS)).join("; "));
    await ev("document.getElementById('vwOk').click(), true"); await sleep(100);
    await ev("document.getElementById('vwDel').click(), true"); await sleep(150);
    ok(T("remove confirmation fits"), (await ev(LAYOUT.replace("document.querySelector('.screen.on')", "document.getElementById('confirm')"))).out.length === 0);
    ok(T("switching language keeps the view and translates it"), await ev(`(() => { document.getElementById('cfNo').click(); const s = document.getElementById('l102lang'); s.value = '${lg === "de" ? "es" : "de"}'; s.dispatchEvent(new Event('change'));
      return document.getElementById('view').classList.contains('on') && document.getElementById('vwShare').textContent === '${lg === "de" ? "Compartir" : "Teilen"}'; })()`));
    ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
  } catch (e) { ok(T("ran without crashing"), false, e.stack); } finally { await b.close(); }
}
process.exit(summary() ? 1 : 0);
