// Infinite Dungeon (docs/infinitedungeon/index.html): drives every main journey in headless Chrome
// at phone upright / phone sideways / tablet (touch) and desktop (mouse + keyboard), plus the shared top bar,
// the three languages (en / es / de) and both text-size ends.
// Usage (from the repo root): node tests/infinitedungeon/run.mjs [phone|land|tablet|desktop|i18n|matrix|small|all]
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { launch, pageUrl, shotsDir, sleep, checker, ROOT } from "../lib/cdp.mjs";

const URL = pageUrl("infinitedungeon"), SHOTS = shotsDir("infinitedungeon");
const VIEWS = { phone: [360, 740, true], land: [740, 360, true], tablet: [820, 1180, true], desktop: [1280, 800, false] };
const LANGS = { en: "en-US", es: "es-ES", de: "de-DE" };
const TITLES = { en: "Infinite Dungeon", es: "Mazmorra Infinita", de: "Endloser Dungeon" };
const which = process.argv[2] || "all";
const run = s => which === "all" || which === s;
const { ok, summary } = checker();

// English words that must never show up in the Spanish / German UI ("Dungeon", "Party", "Jackpot", "Robo",
// "Power-ups", "Pixel", "Turbo" are deliberate loanwords in German and are not in this list)
const ENGLISH = /\b(the|and|press|tap|Kills|Coins|Items|Size|Leave|Keep riding|HP|DMG|empty|ammo|defeated|Got|Equipped|Crystal Car|Pause[ds]|to start|any key|monsters?|weapons?|train|Back to)\b/;

// --- layout probe: everything on screen, below the bar, not overlapping each other
const LAYOUT = `(() => {
  const r = el => el && el.getBoundingClientRect(), vis = el => el && getComputedStyle(el).display !== 'none' && r(el).width > 0;
  const hit = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
  const bar = r(document.getElementById('l102bar')), out = [], overlap = [];
  const els = ['stats', 'inv', 'pauseBtn', 'log', 'wbar', 'ware', 'keys', 'pw', 'toasts'].map(id => document.getElementById(id)).filter(vis);
  const pbox = document.querySelector('#pausePanel .pbox'); if (vis(document.getElementById('pausePanel'))) els.push(pbox);
  for (const el of els) {
    const q = r(el);
    if (q.left < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1 || q.top < bar.bottom - .5) out.push((el.id || el.className) + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round));
  }
  const pairs = [['stats', 'inv'], ['stats', 'pauseBtn'], ['inv', 'pauseBtn'], ['log', 'wbar'], ['keys', 'wbar'], ['log', 'keys'], ['ware', 'wbar'], ['log', 'ware'],
    ['pw', 'wbar'], ['pw', 'toasts'], ['pw', 'stats'], ['pw', 'ware'], ['toasts', 'wbar'], ['toasts', 'stats'], ['toasts', 'ware'], ['toasts', 'pauseBtn'], ['pw', 'keys'], ['pw', 'log'], ['toasts', 'inv'], ['pw', 'inv']];
  for (const [a, b] of pairs) { const A = document.getElementById(a), B = document.getElementById(b); if (vis(A) && vis(B) && hit(r(A), r(B))) overlap.push(a + '/' + b); }
  const st = document.getElementById('stats'), lb = document.querySelector('#leave .box');
  const leaveOpen = getComputedStyle(document.getElementById('leave')).display === 'flex', lr = r(lb);
  const btns = [...document.querySelectorAll('#leave button')].map(b => ({ w: b.scrollWidth - b.clientWidth, r: r(b) }));
  const small = document.body.classList.contains('small'), row = st.querySelector('.hrow');
  return { out, overlap, statsClip: small ? !(row && row.getBoundingClientRect().height < 2.2 * parseFloat(getComputedStyle(row).fontSize)) : st.scrollWidth > st.clientWidth + 1,
    leave: leaveOpen ? { fits: lr.left >= 0 && lr.right <= innerWidth && lr.top >= bar.bottom - .5 && lr.bottom <= innerHeight, clip: lb.scrollHeight > lb.clientHeight + 1 || btns.some(b => b.w > 1 || b.r.right > lr.right || b.r.left < lr.left) } : null,
    canvas: drawnText.filter(d => d.w > cw - 8 || d.y < (barH() / ZOOM) || d.y > ch).map(d => d.t + ' w' + Math.round(d.w) + ' y' + Math.round(d.y)),
    // canvas message lines (screen px) must not sit under any visible HTML: weapon bar, ⏸, HUD, log, keys help, toast, power-ups, top bar
    textUnderHtml: (() => {
      const html = ['l102bar', 'wbar', 'pauseBtn', 'stats', 'inv', 'log', 'keys', 'toasts', 'pw'].map(id => document.getElementById(id))
        .filter(el => { const cs = getComputedStyle(el), q = r(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && q.width && q.height && (el.id !== 'toasts' || el.childElementCount); });
      const bad = [];
      for (const d of drawnText) {
        const box = { left: (cw / 2 - d.w / 2) * ZOOM, right: (cw / 2 + d.w / 2) * ZOOM, top: (d.y - d.size * .8) * ZOOM, bottom: (d.y + d.size * .2) * ZOOM };
        for (const el of html) if (hit(box, r(el))) bad.push(d.t.slice(0, 30) + ' / ' + el.id);
      }
      return bad;
    })(),
    overflowX: document.documentElement.scrollWidth > innerWidth };
})()`;
const layoutOk = (T, tag, L) => {
  ok(T(`${tag}: HUD inside the screen and below the top bar`), L.out.length === 0, L.out.join("; "));
  ok(T(`${tag}: HUD pieces do not overlap`), L.overlap.length === 0, L.overlap.join(","));
  ok(T(`${tag}: stats panel text not clipped`), !L.statsClip);
  ok(T(`${tag}: canvas text fits the screen (below the bar)`), L.canvas.length === 0, L.canvas.slice(0, 3).join(" | "));
  ok(T(`${tag}: canvas message text not under any HTML (weapon bar, ⏸, HUD...)`), L.textUnderHtml.length === 0, L.textUnderHtml.slice(0, 3).join(" | "));
  ok(T(`${tag}: no horizontal page overflow`), !L.overflowX);
  if (L.leave) ok(T(`${tag}: leave dialog fits, buttons not clipped`), L.leave.fits && !L.leave.clip, JSON.stringify(L.leave));
};
const visibleText = `(() => [document.body.innerText, ...['stats', 'log', 'toasts', 'ware'].map(id => document.getElementById(id).textContent), document.title, ...drawnText.map(d => d.t),
  ...[...document.querySelectorAll('[title],[aria-label]')].flatMap(el => [el.title, el.getAttribute('aria-label')])].filter(Boolean).join(' \\n '))()`;
const LOADUP = "for (const k of ITEM_KEYS) if (k !== 'monster') addItem(k); for (const k of DEAL_KEYS) if (k !== 'curse') buyDeal(k); G.armor = { head: 2, body: 4, arms: 1, legs: 3, shield: 2 }; G.coins = 1234; G.kills = 456; updateHUD(); G.player.invT = 999; true";

// ============================================================ main journeys, every screen size
for (const [name, [W, H, touch]] of Object.entries(VIEWS)) {
  if (!run(name)) continue;
  const b = await launch({ url: URL, width: W, height: H, touch });
  const { ev, key, click, tap, drag, shot } = b;
  const T = s => `${name}: ${s}`;
  const state = () => ev("G.state");
  const safe = () => ev("G.player.invT = 999, true");   // no random deaths while testing other things

  try {
    // --- first look + shared top bar
    ok(T("title screen"), await state() === "title");
    await shot(join(SHOTS, `${name}_01_title.png`));
    const bar = await ev(`(() => {
      const r = el => el && el.getBoundingClientRect(), hit = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const nav = document.getElementById('l102bar'), link = document.getElementById('l102back'), lr = r(link), br = r(nav);
      const top = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
      const kids = [...nav.children].filter(el => r(el).width > 0), tops = kids.map(el => Math.round(r(el).top + r(el).height / 2));
      const others = ['stats', 'inv', 'pauseBtn', 'log'].map(id => document.getElementById(id)).filter(el => el && getComputedStyle(el).display !== 'none');
      return { href: link.getAttribute('href'), text: link.textContent.trim(), onTop: top === link || link.contains(top), barH: br.height,
        oneRow: Math.max(...tops) - Math.min(...tops) <= 2 && kids.every(el => r(el).bottom <= br.bottom + 1 && r(el).right <= innerWidth),
        overlaps: others.filter(el => hit(br, r(el))).map(el => el.id), inView: lr.top >= 0 && lr.right <= innerWidth && lr.left >= 0,
        oldBar: !!document.getElementById('homebar'), overflowX: document.documentElement.scrollWidth > innerWidth,
        canvasFill: Math.abs(r(document.getElementById('c')).width - innerWidth) < 2 };
    })()`);
    ok(T("shared top bar present, back link points to https://level102.com"), bar.href === "https://level102.com", bar.href);
    ok(T("back link says 'Back to level102.com'"), /Back to level102\.com/.test(bar.text), bar.text);
    ok(T("back link visible and clickable (not covered)"), bar.inView && bar.onTop);
    ok(T("top bar is one row"), bar.oneRow && bar.barH <= 36, "h " + bar.barH);
    ok(T("top bar does not overlap the HUD"), bar.overlaps.length === 0, bar.overlaps.join(","));
    ok(T("the game's old home link is gone"), !bar.oldBar);
    ok(T("no horizontal page overflow"), !bar.overflowX);
    ok(T("game canvas fills the screen"), bar.canvasFill);

    // --- start
    if (touch) await tap(W * .5, H * .55); else await key("KeyD", "d");
    await sleep(200);
    ok(T("tap / key starts the ride"), await state() === "play");
    await safe();
    ok(T(touch ? "touch mode on (pause button + sticks)" : "desktop mode (keyboard hints shown)"),
      await ev(touch ? "document.body.classList.contains('touch') && getComputedStyle(document.getElementById('pauseBtn')).display !== 'none'" : "getComputedStyle(document.getElementById('keys')).display !== 'none'"));

    // --- move
    const a0 = await ev("[G.player.a, G.player.b]");
    if (touch) await drag(W * .2, H * .7, 60, 0, 700); else await key("ArrowRight", "ArrowRight", 700);
    await sleep(100);
    const a1 = await ev("[G.player.a, G.player.b]");
    ok(T("player moves"), Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) > .3, JSON.stringify([a0, a1]));
    await shot(join(SHOTS, `${name}_02_play.png`));

    // --- attack
    const s0 = await ev("G.swings + (G.player.swing > 0 ? 1 : 0)");
    if (touch) await drag(W * .8, H * .7, 40, -20, 500); else await click(W * .7, H * .5, 300);
    await sleep(50);
    ok(T("attack (tap / click toward a spot)"), await ev("G.swings") > s0 || await ev("G.player.swing > -0.5"));

    // --- weapons: give them all, switch with keys / the weapon bar
    await ev("for (const w of WEAPONS) G.weps[w.key] = w.kind === 'ammo' ? { ammo: w.max } : w.kind === 'mag' ? { mag: w.mag } : {}; updateHUD(); true");
    await sleep(100);
    if (touch) {
      const r = await ev("(() => { const el = document.querySelector('#wbar [data-w=bombs]'); el.scrollIntoView({ inline: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
      await tap(r[0], r[1]);
    } else await key("Digit8", "8");
    await sleep(100);
    ok(T(touch ? "tap the weapon bar to switch weapon" : "number key switches weapon"), await ev("G.wep") === "bombs", await ev("G.wep"));
    if (!touch) { await key("KeyE", "e"); await sleep(50); ok(T("E cycles weapons"), await ev("G.wep") !== "bombs"); }
    for (const w of await ev("WEAPONS.map(w => w.key)")) { await ev(`equip('${w}', true); G.player.atkCd = 0; playerAttack(true); true`); await sleep(120); }
    ok(T("every weapon fires without errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
    await ev("equip('sword', true); true");

    // --- tap targets on touch screens (the shared top bar is deliberately small)
    if (touch) {
      const small = await ev(`[...document.querySelectorAll('button, a, .ws')].filter(el => { const r = el.getBoundingClientRect(); return !el.closest('#l102bar') && r.width && getComputedStyle(el).display !== 'none' && (r.width < 32 || r.height < 26); }).map(el => (el.id || el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height))`);
      ok(T("on-screen controls are big enough to tap"), small.length === 0, small.join("; "));
    }

    // --- pause / resume
    if (touch) { const r = await ev("(() => { const r = document.getElementById('pauseBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"); await tap(r[0], r[1]); }
    else await key("Escape", "Escape");
    await sleep(150);
    ok(T("pause"), await ev("paused") === true);
    ok(T("pause panel with a Resume button shows"), await ev("getComputedStyle(document.getElementById('pausePanel')).display === 'flex' && document.getElementById('resumeBtn').getBoundingClientRect().height >= 44"));
    const tPaused = await ev("G.time"); await sleep(300);
    ok(T("game time stops while paused"), await ev("G.time") === tPaused);
    if (touch) { await tap(W * .5, H * .5); await sleep(100); ok(T("tapping inside the pause panel does not resume"), await ev("paused") === true); }
    if (touch) { const r = await ev("(() => { const r = document.getElementById('resumeBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"); await tap(r[0], r[1]); }
    else await key("Escape", "Escape");
    await sleep(150);
    ok(T("resume"), await ev("paused") === false);

    // --- next car through the door
    const d0 = await ev("G.depth");
    await ev("G.player.a = G.L - 1.5; G.player.b = MID; true");
    if (touch) await drag(W * .2, H * .7, 60, 0, 900); else await key("ArrowRight", "ArrowRight", 900);
    await sleep(1800);
    ok(T("walking into the door goes to the next car"), await ev("G.depth") === d0 + 1, `depth ${d0} -> ${await ev("G.depth")}`);
    await shot(join(SHOTS, `${name}_03_next_car.png`));

    // --- every item and every deal at once, then let the chaos run
    await ev("for (const k of ITEM_KEYS) if (k !== 'monster') addItem(k); for (const k of DEAL_KEYS) if (k !== 'curse') buyDeal(k); updateHUD(); G.player.invT = 999; true");
    for (let i = 0; i < 8; i++) { await ev("G.player.atkCd = 0; playerAttack(false); true"); await sleep(250); }
    ok(T("all items + all deals together: no errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
    await shot(join(SHOTS, `${name}_04_loaded.png`));
    await ev("addItem('monster'); true"); await sleep(800);
    ok(T("monster curse: no errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));

    // --- a few more cars (including the loop recolor)
    for (let i = 0; i < 3; i++) { await ev("nextCar(); true"); await sleep(1900); }
    ok(T("several cars in a row"), await ev("G.depth") >= d0 + 4 && b.errors.length === 0, "depth " + await ev("G.depth"));

    // --- leave the dungeon: ask, keep riding, ask again, leave
    await ev("askLeave(); true"); await sleep(150);
    ok(T("leave dialog shows"), await ev("getComputedStyle(document.getElementById('leave')).display") === "flex");
    await shot(join(SHOTS, `${name}_05_leave.png`));
    const clickEl = async id => { const r = await ev(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`); if (touch) await tap(r[0], r[1]); else await click(r[0], r[1]); await sleep(150); };
    await clickEl("leaveNo");
    ok(T("'Keep riding' closes it and play goes on"), await state() === "play" && await ev("paused") === false);
    await ev("askLeave(); true"); await sleep(150);
    await clickEl("leaveYes");
    ok(T("'Leave' ends the ride"), await state() === "left");
    await shot(join(SHOTS, `${name}_06_left.png`));

    // --- restart, then die, then restart again
    if (touch) await tap(W * .5, H * .5); else await key("KeyR", "r");
    await sleep(200);
    ok(T("restart after leaving"), await state() === "play" && await ev("G.depth") === 0);
    await ev("G.inv = {}; G.player.invT = 0; G.pw = {}; G.armor = {}; hurtPlayer(9999); true"); await sleep(300);
    ok(T("dying shows the game over"), await state() === "dead");
    await shot(join(SHOTS, `${name}_07_dead.png`));
    if (touch) await tap(W * .5, H * .5); else await key("KeyR", "r");
    await sleep(200);
    ok(T("restart after dying"), await state() === "play" && await ev("G.player.hp > 0"));

    ok(T("no console errors"), b.errors.length === 0, b.errors.slice(0, 3).join(" | "));
    ok(T("no network requests outside the file"), b.requests.length === 0, b.requests.slice(0, 3).join(" "));
  } catch (e) {
    ok(T("ran without crashing"), false, e.message);
  } finally {
    await b.close();
  }
}

// ============================================================ languages, top-bar interactions, text size
if (run("i18n") || run("desktop")) {
  // --- static scans of the file
  const html = readFileSync(join(ROOT, "docs", "infinitedungeon", "index.html"), "utf8");
  const FRANCHISE = /\b(Finn|Jake|BMO|Adventure Time|Ooo|Marceline|Bubblegum|Gunter|G[uü]nther|Lich|Rainicorn|NEPTR|Lumpy Space|Oh my glob|Princess Bubblegum|Ice King|Hora de Aventuras|Abenteuerzeit)\b/i;
  const fm = html.match(FRANCHISE);
  ok("i18n: no franchise names anywhere in the game file (any language)", !fm, fm && fm[0]);
  ok("i18n: no French in the game", !/\bfr\s*:|['"]fr['"]/.test(html));
  const icons = html.match(/<link[^>]+rel="icon"[^>]*>/g) || [];
  ok("favicon: exactly one rel=icon link, an inline data:image/svg+xml (no file, no network)", icons.length === 1 && /href="data:image\/svg\+xml,/.test(icons[0]) && html.indexOf(icons[0]) < html.indexOf("</head>"), icons.length + "");

  // --- per language: OS language picks it, first frame already translated
  for (const [lg, os] of [...Object.entries(LANGS), ["en", "fr-FR"]]) {
    const b = await launch({ url: URL, width: 1280, height: 800, lang: os });
    const T = s => `i18n ${os}: ${s}`;
    try {
      const r = await b.ev(`({ lang: document.documentElement.lang, L: L102.lang, title: document.title, ff: firstFrame,
        leave: document.getElementById('leaveT').textContent, keys: document.getElementById('keys').innerText, stats: document.getElementById('stats').textContent })`);
      ok(T(`<html lang> is ${lg}`), r.lang === lg && r.L === lg, r.lang);
      ok(T(`page title is "${TITLES[lg]}"`), r.title === TITLES[lg], r.title);
      ok(T("first frame already in that language"), r.ff && r.ff.lang === lg && r.ff.canvas.length > 3, JSON.stringify(r.ff && r.ff.canvas.slice(0, 2).map(d => d.t)));
      ok(T(`first frame title screen says "${TITLES[lg].toUpperCase()}"`), r.ff && r.ff.canvas.map(d => d.t).join(" ").includes(TITLES[lg].toUpperCase()), r.ff && r.ff.canvas[0].t);
      if (lg !== "en") {
        const first = [r.ff.html, ...r.ff.canvas.map(d => d.t)].join(" \n "), m = first.match(ENGLISH);
        ok(T("no English in the first frame (HTML + canvas)"), !m, m && first.slice(Math.max(0, m.index - 30), m.index + 30));
        // play a loaded run and open every screen, collecting everything visible
        await b.ev(`G.state = 'play'; ${LOADUP}`); await b.ev("G.items.push({ kind: 'deal', key: 'zoo', price: 99, a: G.player.a, b: G.player.b + .5, r: .15, z: 0, vz: 0 }); true");
        await b.ev("G.banner = { icon: '🗡️', title: () => ITEMS.sword.name, sub: () => ITEMS.sword.desc, t: 3 }; true");
        await sleep(300);
        let txt = await b.ev(visibleText);
        await b.ev("askLeave(); true"); await sleep(100); txt += await b.ev(visibleText);
        await b.ev("answerLeave(false); setPause(true); true"); await sleep(100); txt += await b.ev(visibleText);
        await b.ev("setPause(false); G.state = 'left'; true"); await sleep(100); txt += await b.ev(visibleText);
        await b.ev("G.state = 'dead'; true"); await sleep(100); txt += await b.ev(visibleText);
        const m2 = txt.match(ENGLISH);
        ok(T("no English in play / HUD / tooltips / leave / pause / end screens"), !m2, m2 && txt.slice(Math.max(0, m2.index - 40), m2.index + 40).replace(/\n/g, " "));
      } else ok(T("English text shown"), /Kills/.test(r.stats) && /Leave/.test(r.leave));
      ok(T("favicon loaded in the page: one inline SVG icon"), await b.ev("(() => { const l = document.querySelectorAll('link[rel=icon]'); return l.length === 1 && l[0].href.startsWith('data:image/svg+xml,'); })()"));
      ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
    } catch (e) { ok(T("ran without crashing"), false, e.message); } finally { await b.close(); }
  }

  // --- every key translated, every name/desc in es + de
  {
    const b = await launch({ url: URL, width: 1280, height: 800 });
    try {
      const r = await b.ev(`(() => {
        const SAME_OK = { de: ['pause', 'party', 'sold'], es: ['sold'] };   // "Pause" and "PARTY!" are German too; 'sold' is only icons + numbers
        const miss = [], same = [];
        for (const l of ['es', 'de']) for (const k in I18N.en) {
          const v = I18N[l][k]; if (v === undefined || v === '') { miss.push(l + '.' + k); continue; }
          if (JSON.stringify(v) === JSON.stringify(I18N.en[k]) && !SAME_OK[l].includes(k)) same.push(l + '.' + k);
        }
        const tables = { ITEMS, POWERS, DEALS, AFFIX, ARMOR_SLOTS, ETYPES };
        for (const l of ['es', 'de']) {
          const L = LOC[l];
          for (const tb in tables) for (const k in tables[tb]) {
            const v = L[tb] && L[tb][k], en = tables[tb][k]._en, hasDesc = en.desc !== undefined;
            if (!v || (hasDesc ? !(Array.isArray(v) && v[0] && v[1]) : !v)) { miss.push(l + '.' + tb + '.' + k); continue; }
            const nm = Array.isArray(v) ? v[0] : v;
            if (nm === en.name || (hasDesc && v[1] === en.desc)) same.push(l + '.' + tb + '.' + k);
          }
          for (const w of WEAPONS) { const v = L.WEAPONS[w.key]; if (!v || !v[0] || !v[1]) miss.push(l + '.WEAPONS.' + w.key); else if (v[0] === w._en.name || v[1] === w._en.desc) same.push(l + '.WEAPONS.' + w.key); }
          TIERS.forEach((T, i) => { if (T && !(L.TIERS[i - 1])) miss.push(l + '.TIERS.' + i); else if (T && L.TIERS[i - 1] === T._en.name) same.push(l + '.TIERS.' + i); });
          THEMES.forEach((T, i) => { if (!L.THEMES[i]) miss.push(l + '.THEMES.' + i); else if (L.THEMES[i] === T._en.name) same.push(l + '.THEMES.' + i); });
        }
        return { miss, same, nKeys: Object.keys(I18N.en).length };
      })()`);
      ok("i18n: every UI key exists in es and de", r.miss.length === 0, r.miss.slice(0, 8).join(", "));
      ok("i18n: no UI key or item/weapon/deal/power/armor/affix/monster/car name left in English", r.same.length === 0, r.same.slice(0, 8).join(", "));
      ok(`i18n: ${r.nKeys} UI keys checked`, r.nKeys > 80);
    } catch (e) { ok("i18n tables: ran without crashing", false, e.message); } finally { await b.close(); }
  }

  // --- switch language mid-run: state kept, everything re-rendered; bar interactions do not drive the game
  {
    const b = await launch({ url: URL, width: 1280, height: 800 });
    const { ev, key, click, shot } = b, T = s => `bar desktop: ${s}`;
    const center = async id => ev(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    try {
      // on the title screen: keys on the focused select do not start the game
      await ev("document.getElementById('l102lang').focus(); true");
      for (const k of [["ArrowDown", "ArrowDown"], ["Enter", "Enter"], ["Space", " "], ["KeyD", "d"]]) await key(...k);
      await sleep(150);
      ok(T("keys on the focused language picker do not start the game"), await ev("G.state") === "title", await ev("G.state"));
      await ev("document.activeElement.blur(); L102.setLang('en'); true");
      // start, then use the bar while playing
      await key("KeyD", "d"); await sleep(150);
      await ev("G.player.invT = 999; for (const w of WEAPONS) G.weps[w.key] = w.kind === 'ammo' ? { ammo: w.max } : w.kind === 'mag' ? { mag: w.mag } : {}; updateHUD(); true");
      const before = await ev("({ a: G.player.a, b: G.player.b, wep: G.wep, depth: G.depth })");
      await ev("document.getElementById('l102lang').focus(); true");
      await key("ArrowRight", "ArrowRight", 400); await key("Digit8", "8"); await key("Escape", "Escape"); await sleep(100);
      await ev("document.getElementById('l102lang').focus(); true"); await key("KeyR", "r"); await key("Escape", "Escape");
      await sleep(150);
      const after = await ev("({ a: G.player.a, b: G.player.b, wep: G.wep, depth: G.depth, state: G.state, paused })");
      ok(T("keys on the focused bar do not move the hero, switch weapon, pause or restart"),
        Math.hypot(after.a - before.a, after.b - before.b) < .05 && after.wep === before.wep && after.state === "play" && !after.paused, JSON.stringify([before, after]));
      ok(T("default text size is 1.1"), await ev("L102.fs") === 1.1 && await ev("getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()") === "1.1");
      const [px, py] = await center("l102plus");
      await click(px, py); await sleep(150);
      ok(T("clicking A+ makes text bigger and does not pause"), await ev("L102.fs") === 1.2 && await ev("paused") === false && await ev("G.state") === "play");
      await key("Space", " ", 120); await sleep(100);
      ok(T("after clicking A+, Space goes back to the game (not the button)"), await ev("L102.fs") === 1.2);
      const [mx, my] = await center("l102minus"); await click(mx, my); await sleep(100);
      ok(T("A− back to the default"), await ev("L102.fs") === 1.1);
      await b.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
      await ev("document.getElementById('l102dl').addEventListener('click', e => e.preventDefault(), { once: true }); true");   // no file actually saved here
      const [dx, dy] = await center("l102dl"); await click(dx, dy); await sleep(200);
      ok(T("clicking the download button does not pause, restart or start anything"), await ev("paused") === false && await ev("G.state") === "play" && await ev("G.depth") === 0);

      // switch language mid-run with the leave dialog open
      await ev(`G.depth = 7; ${LOADUP}; equip('staff', true); G.player.hp = 13; updateHUD(); true`);
      await ev("G.items.push({ kind: 'armor', slot: 'head', tier: 3, goose: true, a: G.player.a, b: G.player.b + .9, r: .15, z: 0, vz: 0 }); true");
      await sleep(200);
      await ev("G.banner = { icon: '🗡️', title: () => ITEMS.sword.name, sub: () => ITEMS.sword.desc, t: 3 }; true"); await sleep(150);
      await ev("askLeave(); true"); await sleep(100);
      const snap = () => ev("JSON.stringify({ depth: G.depth, hp: G.player.hp, inv: G.inv, wep: G.wep, coins: G.coins, kills: G.kills, armor: G.armor, state: G.state })");
      const s0 = await snap();
      await ev("(() => { const s = document.getElementById('l102lang'); s.value = 'de'; s.dispatchEvent(new Event('change')); return true; })()"); await sleep(200);
      const de = await ev(`({ lang: document.documentElement.lang, title: document.title, stats: document.getElementById('stats').innerText, leave: document.getElementById('leaveT').textContent,
        yes: document.getElementById('leaveYes').textContent, wtitle: document.querySelector('#wbar [data-w=sword]').title, inv: document.querySelector('#inv .it').title,
        ware: document.getElementById('ware').textContent, toast: [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent).join('|'), log: document.getElementById('log').textContent,
        keys: document.getElementById('keys').textContent, open: getComputedStyle(document.getElementById('leave')).display })`);
      ok(T("switching to German keeps the run (depth, hp, items, weapon, coins)"), await snap() === s0, s0);
      ok(T("German: HUD re-rendered"), /LP \d+\//.test(de.stats) && /Besiegt \d+/.test(de.stats) && /SCHADEN/.test(de.stats), de.stats);
      ok(T("German: open leave dialog re-rendered and still open"), de.open === "flex" && /Zug aussteigen/.test(de.leave) && /Aussteigen/.test(de.yes), de.leave);
      ok(T("German: weapon bar + inventory tooltips re-rendered"), /Heldenschwert/.test(de.wtitle) && /Zauberschwert/.test(de.inv), de.wtitle + " / " + de.inv);
      ok(T("German: shop box, toast, log and key help re-rendered"), /Kristallhelm/.test(de.ware) && /gratis/.test(de.ware) && /Zauberschwert/.test(de.toast) && /Zauberschwert/.test(de.log) && /Pfeiltasten/.test(de.keys), JSON.stringify([de.ware, de.toast, de.log.slice(0, 80)]));
      ok(T("German: page title"), de.title === TITLES.de && de.lang === "de");
      await shot(join(SHOTS, "bar_desktop_switch_de.png"));
      await ev("answerLeave(false); setPause(true); true"); await sleep(100);
      await ev("(() => { const s = document.getElementById('l102lang'); s.value = 'es'; s.dispatchEvent(new Event('change')); return true; })()"); await sleep(150);
      const es = await ev("({ stats: document.getElementById('stats').innerText, canvas: document.getElementById('ppT').textContent + ' ' + document.getElementById('resumeBtn').textContent + ' ' + document.getElementById('pstats').textContent, title: document.title })");
      ok(T("Spanish: HUD + open pause panel re-rendered"), /PV \d+\//.test(es.stats) && /Vencidos/.test(es.stats) && /PAUSA/.test(es.canvas) && /Seguir/.test(es.canvas) && /Vagón \d+/.test(es.canvas) && es.title === TITLES.es, es.canvas);
      ok(T("Spanish: run still intact"), await snap() === s0);
      ok(T("no console errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
    } catch (e) { ok(T("ran without crashing"), false, e.message); } finally { await b.close(); }
  }

  // --- text size persists after reload; touch: tapping the bar does not start or pause
  {
    const b = await launch({ url: URL, width: 360, height: 740, touch: true });
    const { ev, tap } = b, T = s => `bar phone: ${s}`;
    const center = async id => ev(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    try {
      const [px, py] = await center("l102plus");
      for (let i = 0; i < 9; i++) { await tap(px, py); await sleep(120); }
      ok(T("tapping A+ on the title screen does not start the game"), await ev("G.state") === "title");
      ok(T("A+ goes up to 1.8 and stops"), await ev("L102.fs") === 1.8 && await ev("document.getElementById('l102plus').disabled"));
      await tap(180, 400); await sleep(150);
      ok(T("tap on the game starts it"), await ev("G.state") === "play");
      const [mx, my] = await center("l102minus"); await tap(mx, my); await sleep(150);
      ok(T("tapping A− while playing does not pause or attack"), await ev("paused") === false && await ev("G.state") === "play" && await ev("L102.fs") === 1.7);
      await ev("L102.setFs(1.8); true");
      await b.send("Page.reload", {}); await sleep(1200);
      ok(T("text size 1.8 persists after reload"), await ev("L102.fs") === 1.8 && await ev("getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()") === "1.8");
      ok(T("canvas text scales with it"), await ev("firstFrame.canvas.some(d => d.t === 'tap to start' && d.size > 20 * 1.5)"), JSON.stringify(await ev("firstFrame.canvas.map(d => Math.round(d.size))")));
      ok(T("no console errors"), b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
    } catch (e) { ok(T("ran without crashing"), false, e.message); } finally { await b.close(); }
  }
}

// ============================================================ layout matrix: every size x language x text-size end
if (run("matrix")) {
  for (const [vname, [W, H, touch]] of Object.entries(VIEWS)) for (const [lg, os] of Object.entries(LANGS)) for (const fs of [0.8, 1.1, 1.8]) {
    const b = await launch({ url: URL, width: W, height: H, touch, lang: os });
    const { ev, shot } = b, tag = `${vname}_${lg}_${fs}`, T = s => `matrix ${tag}: ${s}`;
    try {
      await ev(`localStorage.setItem('l102.fs', '${fs}'); true`); await b.send("Page.reload", {}); await sleep(1000);
      if (touch) await ev("markTouch(); true");
      ok(T("language and text size applied"), await ev("L102.lang") === lg && await ev("L102.fs") === fs);
      layoutOk(T, "title", await ev(LAYOUT));
      const bar = await ev("(() => { const n = document.getElementById('l102bar'), r = n.getBoundingClientRect(), mid = c => { const q = c.getBoundingClientRect(); return q.top + q.height / 2; }; return { h: r.height, row: [...n.children].filter(c => c.getBoundingClientRect().height > 0).every(c => Math.abs(mid(c) - mid(n.children[0])) < 3 && c.getBoundingClientRect().right <= innerWidth) }; })()");
      ok(T("top bar one row"), bar.row && bar.h <= 36);
      const shoot = ["phone_es_1.8", "phone_de_1.8", "phone_de_0.8", "land_de_1.8", "land_es_0.8", "tablet_de_1.8", "desktop_de_1.8", "desktop_es_0.8", "desktop_en_1.1", "phone_en_1.1"].includes(tag);
      if (shoot) await shot(join(SHOTS, `m_${tag}_1_title.png`));
      await ev(`G.state = 'play'; G.depth = 9; G.level = 2; G.loop = 1; buildLevel(); ${LOADUP}; equip('bombs', true); true`);
      await ev("G.items.push({ kind: 'deal', key: 'zoo', price: 99, a: G.player.a, b: G.player.b + .5, r: .15, z: 0, vz: 0 }); for (let i = 0; i < 6; i++) log(() => t('storm', { n: 10 }), '#ff8a8a'); renderLog(); updateHUD(); true");
      await ev("G.banner = { icon: '🦉', title: () => ITEMS.feather.name, sub: () => ITEMS.feather.desc, t: 3 }; true");
      await sleep(300);
      layoutOk(T, "loaded HUD + shop box", await ev(LAYOUT));
      if (shoot) await shot(join(SHOTS, `m_${tag}_2_loaded.png`));
      await ev("askLeave(); true"); await sleep(150);
      layoutOk(T, "leave dialog", await ev(LAYOUT));
      if (shoot) await shot(join(SHOTS, `m_${tag}_3_leave.png`));
      await ev("answerLeave(false); setPause(true); true"); await sleep(100);
      layoutOk(T, "paused", await ev(LAYOUT));
      await ev("setPause(false); G.state = 'left'; true"); await sleep(100);
      layoutOk(T, "left the train", await ev(LAYOUT));
      if (shoot) await shot(join(SHOTS, `m_${tag}_4_left.png`));
      await ev("G.state = 'dead'; true"); await sleep(100);
      layoutOk(T, "game over", await ev(LAYOUT));
      if (shoot) await shot(join(SHOTS, `m_${tag}_5_dead.png`));
      await ev("G.state = 'play'; G.trans = { t: 1, looped: true, level: 1, loop: 2, built: true }; true"); await sleep(60);
      layoutOk(T, "car transition", await ev(LAYOUT));
      ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
    } catch (e) { ok(T("ran without crashing"), false, e.message); } finally { await b.close(); }
  }
}

// ============================================================ small phones: the playfield comes first
if (run("small")) {
  const SMALL = { phone: [360, 740], land: [740, 360], mini: [320, 568] };
  for (const [vname, [W, H]] of Object.entries(SMALL)) for (const [lg, os] of Object.entries(LANGS)) for (const fs of [0.8, 1.1, 1.8]) {
    const b = await launch({ url: URL, width: W, height: H, touch: true, lang: os });
    const { ev, tap, drag, shot } = b, tag = `${vname}_${lg}_${fs}`, T = s => `small ${tag}: ${s}`;
    const center = async sel => ev(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    const shoot = ["phone_de_1.8", "phone_es_1.1", "land_de_1.8", "mini_de_1.8", "mini_en_1.1", "land_es_1.1"].includes(tag);
    try {
      await ev(`localStorage.setItem('l102.fs', '${fs}'); true`); await b.send("Page.reload", {}); await sleep(1000);
      ok(T("small-screen mode on"), await ev("document.body.classList.contains('small')"));
      const bar = await ev(`(() => { const n = document.getElementById('l102bar'), r = n.getBoundingClientRect(), mid = c => { const q = c.getBoundingClientRect(); return q.top + q.height / 2; };
        const kids = [...n.children].filter(c => c.getBoundingClientRect().height > 0), dl = document.getElementById('l102dl').getBoundingClientRect();
        return { h: r.height, row: kids.every(c => Math.abs(mid(c) - mid(kids[0])) < 3 && c.getBoundingClientRect().right <= innerWidth && c.getBoundingClientRect().left >= 0), dl: dl.width > 0 && dl.right <= innerWidth,
          hudBelow: document.getElementById('hud').getBoundingClientRect().top >= r.bottom && document.getElementById('pauseBtn').getBoundingClientRect().top >= r.bottom }; })()`);
      ok(T("top bar (with download button) is one row, fully on screen, HUD below it"), bar.row && bar.dl && bar.h <= 36 && bar.hudBelow, JSON.stringify(bar));
      await tap(W * .5, H * .55); await sleep(150);
      // everything at once: all items, all deals, all power-ups, two identical pickups and one other
      await ev(`G.depth = 6; buildLevel(); ${LOADUP}; for (const k of POWER_KEYS) G.pw[k] = 60; G.items = G.items.filter(o => !o.price && !o.goose); updateHUD(); true`);
      for (const k of ["feather", "feather", "zoo"]) { await ev(`G.banner = { icon: '${k === "zoo" ? "🐾" : "🦉"}', title: () => ${k === "zoo" ? "DEALS.zoo" : "ITEMS.feather"}.name, sub: () => 'x', t: 3 }; true`); await sleep(60); }
      await ev(`G.banner = { icon: '🐾', title: () => DEALS.zoo.name, sub: () => 'x', t: 3 }; true`);
      await sleep(400);
      const r = await ev(`(() => {
        const R = el => el.getBoundingClientRect(), shown = el => { if (!el) return false; const cs = getComputedStyle(el), q = R(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && q.width > 0 && q.height > 0; };
        const ids = ['stats', 'inv', 'log', 'keys', 'ware', 'toasts', 'pw', 'leave', 'pausePanel', 'pauseBtn', 'wbar', 'pad'];
        const visible = ids.filter(id => shown(document.getElementById(id)) && (id !== 'toasts' || document.getElementById(id).childElementCount));
        const allowed = ['stats', 'pw', 'toasts', 'pauseBtn', 'wbar'];
        const row = document.querySelector('#stats .hrow'), kids = row ? [...row.children] : [], mid = el => R(el).top + R(el).height / 2;
        const [hx, hy] = P(G.player.a, G.player.b).map(v => v * ZOOM), covered = [];
        for (let x = hx - 60; x <= hx + 60; x += 12) for (let y = hy - 110; y <= hy + 30; y += 14) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const top = document.elementFromPoint(x, y); if (top && top.id !== 'c') covered.push((top.id || top.className || top.tagName) + '@' + Math.round(x) + ',' + Math.round(y));
        }
        const toasts = [...document.querySelectorAll('#toasts .toast')].filter(e => getComputedStyle(e).opacity > .1).map(e => e.textContent);
        const pws = [...document.querySelectorAll('#pw .pwi')], ws = [...document.querySelectorAll('#wbar .ws')];
        const owned = WEAPONS.filter(w => G.weps[w.key]).length;
        return { visible: visible.filter(id => !allowed.includes(id)), oneRow: !!row && kids.every(k => Math.abs(mid(k) - mid(kids[0])) < 4), hudH: R(document.getElementById('stats')).height,
          covered, toasts, pwRow: pws.length === Object.keys(G.pw).length && pws.every(e => Math.abs(R(e).top - R(pws[0]).top) < 2),
          ws: ws.length, owned, lock: document.querySelectorAll('#wbar .lock').length, small44: ws.filter(e => R(e).width < 44 || R(e).height < 44).length,
          invHidden: !shown(document.getElementById('inv')), nItems: ITEM_KEYS.filter(k => G.inv[k]).length };
      })()`);
      ok(T("HUD is one row"), r.oneRow);
      ok(T("HUD row is at most 15% of the screen height"), r.hudH <= H * .15, Math.round(r.hudH) + "px");
      ok(T("nothing but HUD row, power-ups, one toast, pause button and weapon bar on screen"), r.visible.length === 0, r.visible.join(","));
      ok(T("the hero is not covered by any HTML"), r.covered.length === 0, r.covered.slice(0, 4).join(" "));
      ok(T("at most one toast, duplicates merged"), r.toasts.length <= 1 && (r.toasts.length === 0 || /×2/.test(r.toasts[0])), JSON.stringify(r.toasts));
      ok(T("power-ups: one row of small icons"), r.pwRow);
      ok(T("weapon bar: only owned weapons, 44px each"), r.ws === r.owned && r.lock === 0 && r.small44 === 0, `${r.ws}/${r.owned} small ${r.small44}`);
      ok(T("item grid hidden during play"), r.invHidden);
      layoutOk(T, "loaded", await ev(LAYOUT));
      if (shoot) await shot(join(SHOTS, `s_${tag}_1_loaded.png`));
      // pause: stats + every owned item; tapping inside does not resume; Resume does
      const [px, py] = await center("#pauseBtn"); await tap(px, py); await sleep(200);
      const pz = await ev(`({ open: getComputedStyle(document.getElementById('pausePanel')).display === 'flex', items: document.querySelectorAll('#pinv button').length,
        sc: (s => s.scrollHeight - s.clientHeight)(document.querySelector('#pausePanel .pscroll')), stats: document.getElementById('pstats').textContent })`);
      ok(T("pause shows the panel with every owned item"), pz.open && pz.items === r.nItems, `${pz.items}/${r.nItems}`);
      ok(T("pause panel shows the stats taken out of the HUD"), /\d+\/\d+/.test(pz.stats) && pz.stats.includes(await ev("t('dmg')")) && pz.stats.includes(await ev("t('carNo', { n: G.depth + 1 })")));
      layoutOk(T, "pause panel", await ev(LAYOUT));
      if (pz.sc > 10) {
        const [sx, sy] = await center("#pausePanel .pscroll");
        await drag(sx, sy + 40, 0, -120, 200); await sleep(250);
        ok(T("pause panel scrolls with a finger"), await ev("document.querySelector('#pausePanel .pscroll').scrollTop") > 10);
      } else ok(T("pause panel fits without scrolling"), true);
      await ev("document.querySelector('#pausePanel .pscroll').scrollTop = 0; true"); await sleep(100);
      await ev("document.querySelector('#pinv button[data-k=goggles]').scrollIntoView({ block: 'nearest' }), true"); await sleep(100);
      const [ix, iy] = await center("#pinv button[data-k=goggles]"); await tap(ix, iy); await sleep(150);
      ok(T("tapping an item shows its name + description and keeps the game paused"),
        await ev("paused") === true && await ev("document.getElementById('pinfo').textContent.includes(ITEMS.goggles.name) && document.getElementById('pinfo').textContent.includes(ITEMS.goggles.desc)"));
      if (shoot) await shot(join(SHOTS, `s_${tag}_2_pause.png`));
      const [rx, ry] = await center("#resumeBtn"); await tap(rx, ry); await sleep(150);
      ok(T("Resume button resumes"), await ev("paused") === false && await ev("getComputedStyle(document.getElementById('pausePanel')).display") === "none");
      ok(T("no console errors, no network"), b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].slice(0, 2).join(" "));
    } catch (e) { ok(T("ran without crashing"), false, e.message); } finally { await b.close(); }
  }
}
process.exit(summary() ? 1 : 0);
