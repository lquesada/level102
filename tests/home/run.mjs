// Home page (docs/index.html): every icon links to an existing game, and every game links back to level102.com.
// Usage (from the repo root): node tests/home/run.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, ROOT, sleep, checker } from "../lib/cdp.mjs";

const { ok, summary } = checker();
const docs = join(ROOT, "docs");
const games = readdirSync(docs, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(docs, d.name, "index.html"))).map(d => d.name);

for (const [W, H, touch] of [[360, 740, true], [1280, 800, false]]) {
  const b = await launch({ url: "file://" + join(docs, "index.html"), width: W, height: H, touch });
  const r = await b.ev(`(() => { const links = [...document.querySelectorAll('a.game')];
    return { hrefs: links.map(a => a.getAttribute('href')), small: links.filter(a => { const r = a.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length,
      overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  await sleep(100);
  ok(`home ${W}x${H}: one icon per game in docs/`, games.every(g => r.hrefs.includes(g + "/")), "games: " + games.join(",") + " icons: " + r.hrefs.join(","));
  ok(`home ${W}x${H}: every icon opens an existing game`, r.hrefs.every(h => existsSync(join(docs, h, "index.html"))));
  ok(`home ${W}x${H}: icons are big enough to tap`, r.small === 0);
  ok(`home ${W}x${H}: no horizontal overflow`, !r.overflow);
  ok(`home ${W}x${H}: no console errors, no network requests`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  await b.close();
}
// the shared top bar (templates/topbar.html) must be pasted verbatim: head part + body part
const tpl = readFileSync(join(ROOT, "templates", "topbar.html"), "utf8");
const tplHead = tpl.slice(tpl.indexOf("<style>\n:root{--l102-bar-h"), tpl.indexOf("<!-- l102-topbar:head-end -->")).trim();
const tplBody = tpl.slice(tpl.indexOf('<nav class="l102bar"'), tpl.indexOf("<!-- l102-topbar:end -->")).trim();
for (const g of games) {
  const html = readFileSync(join(docs, g, "index.html"), "utf8");
  ok(`${g}: shared top bar head part pasted verbatim, inside <head>, before the game's own styles`, html.includes(tplHead) && html.indexOf(tplHead) < html.indexOf("</head>") && html.indexOf(tplHead) <= html.indexOf("<style>"));
  ok(`${g}: shared top bar body part pasted verbatim, first thing in <body>`, html.includes(tplBody) && /<body[^>]*>\s*(<!--[^]*?-->\s*)?<nav class="l102bar"/.test(html));
  ok(`${g}: has a 'Back to level102.com' link to https://level102.com`, /href="https:\/\/level102\.com\/?"[^>]*>[\s\S]{0,400}?Back to level102\.com/.test(html));
  ok(`${g}: has a mobile viewport meta tag`, /<meta[^>]+name="viewport"/.test(html));
}
// link previews (WhatsApp etc.): Open Graph tags + a 1200x630 JPEG card next to every page (made by tools/make_cards.mjs)
for (const page of ["", ...games]) {
  const html = readFileSync(join(docs, page, "index.html"), "utf8"), url = "https://level102.com/" + (page ? page + "/" : ""), tag = page || "home";
  const meta = p => (html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1];
  ok(`${tag}: link-preview tags (title, description, url, image)`, !!meta("og:title") && !!meta("og:description") && meta("og:url") === url && meta("og:image") === url + "card.jpg"
    && /<meta name="twitter:card" content="summary_large_image">/.test(html) && html.indexOf("og:image") < html.indexOf("</head>"), [meta("og:title"), meta("og:url"), meta("og:image")].join(" "));
  const card = join(docs, page, "card.jpg"), buf = existsSync(card) ? readFileSync(card) : null;
  let wh = null; if (buf) for (let i = 2; i < buf.length - 9; ) { if (buf[i] !== 0xff) break; const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) { wh = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; } i += 2 + len; }
  ok(`${tag}: card.jpg is a 1200x630 JPEG under 300 KB`, !!buf && buf[0] === 0xff && buf[1] === 0xd8 && wh && wh[0] === 1200 && wh[1] === 630 && buf.length < 300000, JSON.stringify([wh, buf && buf.length]));
}
// home page: shared top bar (language + text size; the back link is hidden there), labels per language
const homeHtml = readFileSync(join(docs, "index.html"), "utf8");
ok("home: shared top bar pasted verbatim (head + body)", homeHtml.includes(tplHead) && homeHtml.includes(tplBody));
const LABELS = { "en-US": ["Drink Mixer", "Infinite Dungeon", "Candy Shop", "Fluid", "Arcade Claw"], "es-ES": ["Mezclador de bebidas", "Mazmorra Infinita", "Tienda de golosinas", "Fluido", "Máquina de Gancho"], "de-DE": ["Getränke-Mixer", "Endloser Dungeon", "Süßigkeitenladen", "Flüssigkeit", "Greifautomat"], "fr-FR": ["Drink Mixer", "Infinite Dungeon", "Candy Shop", "Fluid", "Arcade Claw"] };
for (const [lang, want] of Object.entries(LABELS)) for (const [W, H, touch] of [[360, 740, true], [1280, 800, false]]) {
  const b = await launch({ url: "file://" + join(docs, "index.html"), width: W, height: H, touch, lang });
  const tag = `home ${lang} ${W}x${H}`;
  const r = await b.ev(`(() => { const r = el => el.getBoundingClientRect();
    return { lang: document.documentElement.lang, labels: [...document.querySelectorAll('[data-name]')].map(e => e.textContent),
      backHidden: getComputedStyle(document.getElementById('l102back')).visibility === 'hidden',
      barOneRow: [...document.querySelectorAll('#l102bar > :not(.l102sp)')].every(e => r(e).top < 10),
      h1BelowBar: r(document.querySelector('h1')).top >= r(document.getElementById('l102bar')).bottom }; })()`);
  ok(`${tag}: page language`, r.lang === lang.slice(0, 2) || (lang === "fr-FR" && r.lang === "en"), r.lang);
  ok(`${tag}: game labels translated`, JSON.stringify(r.labels) === JSON.stringify(want), r.labels.join(" | "));
  ok(`${tag}: back link hidden on the home page, bar one row, content below the bar`, r.backHidden && r.barOneRow && r.h1BelowBar);
  if (lang === "de-DE") {
    const before = await b.ev("parseFloat(getComputedStyle(document.querySelector('a.game')).fontSize)");
    for (let i = 0; i < 10; i++) await b.ev("document.getElementById('l102plus').click(), true");
    const big = await b.ev(`({ fs: L102.fs, size: parseFloat(getComputedStyle(document.querySelector('a.game')).fontSize), overflow: document.documentElement.scrollWidth > innerWidth })`);
    ok(`${tag}: A+ grows the text up to 1.8, no overflow`, big.fs === 1.8 && big.size > before && !big.overflow, JSON.stringify(big));
    await b.ev("document.getElementById('l102lang').value = 'es'; document.getElementById('l102lang').dispatchEvent(new Event('change')); true");
    ok(`${tag}: switching language relabels in place`, (await b.ev("document.querySelector('[data-name]').textContent")) === "Mezclador de bebidas");
    await b.shot(join(ROOT, "scratch", "screenshots", `home_${W}_switched_es_1.8.png`));
  } else await b.shot(join(ROOT, "scratch", "screenshots", `home_${lang}_${W}.png`));
  ok(`${tag}: no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  await b.close();
}
// full-screen button: in the bar on every page, translated, turns full screen on and off (real click = user gesture)
for (const page of ["", ...games]) for (const [W, H, touch] of [[320, 568, true], [1280, 800, false]]) {
  const b = await launch({ url: "file://" + join(docs, page, "index.html"), width: W, height: H, touch, lang: "es-ES" });
  const tag = `${page || "home"} ${W}x${H}`, st = () => b.ev(`(() => { const e = document.getElementById('l102full'), r = e && e.getBoundingClientRect();
    return e && { full: !!document.fullscreenElement, label: e.getAttribute('aria-label'), icon: document.getElementById('l102fullp').getAttribute('d'),
      inRow: r.top < 10 && r.right <= innerWidth && r.width >= 28, x: r.left + r.width / 2, y: r.top + r.height / 2,
      barOneRow: [...document.querySelectorAll('#l102bar > :not(.l102sp)')].every(el => el.getBoundingClientRect().top < 10) }; })()`);
  const s0 = await st();
  ok(`${tag}: full-screen button in the bar (one row), translated`, !!s0 && s0.inRow && s0.barOneRow && s0.label === "Pantalla completa" && !s0.full, JSON.stringify(s0));
  if (s0) {
    if (touch) await b.tap(s0.x, s0.y); else await b.click(s0.x, s0.y);
    let s1; for (let i = 0; i < 20; i++) { await sleep(100); s1 = await st(); if (s1.full) break; }
    ok(`${tag}: pressing it goes full screen, label and icon switch`, s1.full && s1.label === "Salir de pantalla completa" && s1.icon !== s0.icon, JSON.stringify(s1));
    if (touch) await b.tap(s1.x, s1.y); else await b.click(s1.x, s1.y);
    let s2; for (let i = 0; i < 20; i++) { await sleep(100); s2 = await st(); if (!s2.full) break; }
    ok(`${tag}: pressing it again leaves full screen`, !s2.full && s2.label === "Pantalla completa" && s2.icon === s0.icon, JSON.stringify(s2));
  }
  ok(`${tag}: full screen: no console errors`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  await b.close();
}
// download button: saves the page itself (one self-contained file) under a name taken from its folder
// (served over http like the real site: Chrome ignores the download attribute on file:// pages)
import { mkdtempSync, readdirSync as ls, rmSync as rm } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]), f = join(docs, path.endsWith("/") ? path + "index.html" : path);
  if (!f.startsWith(docs) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(readFileSync(f));
}).listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const origin = "http://127.0.0.1:" + server.address().port;
for (const page of ["", ...games]) {
  const file = join(docs, page, "index.html"), want = (page || "level102") + ".html";
  const b = await launch({ url: origin + "/" + (page ? page + "/" : ""), width: 360, height: 740, touch: true, lang: "es-ES" });
  const dir = mkdtempSync(join(tmpdir(), "l102dl-"));
  await b.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  const info = await b.ev(`(() => { const a = document.getElementById('l102dl'), r = a && a.getBoundingClientRect();
    return a && { name: a.getAttribute('download'), label: a.getAttribute('aria-label'), inRow: r.top < 10 && r.right <= innerWidth && r.width >= 28 }; })()`);
  ok(`${page || "home"}: download button in the bar (one row), translated label`, !!info && info.inRow && /Descargar/.test(info.label), JSON.stringify(info));
  ok(`${page || "home"}: download file name ${want}`, info && info.name === want, info && info.name);
  if (info) {
    await b.ev("document.getElementById('l102dl').click(), true");
    let got = null; for (let i = 0; i < 40 && !got; i++) { await sleep(150); got = ls(dir).find(f => f === want); }
    ok(`${page || "home"}: clicking it saves the page, byte-identical`, !!got && readFileSync(join(dir, got)).equals(readFileSync(file)), got || "no file");
  }
  rm(dir, { recursive: true, force: true });
  await b.close();
}
server.close();
process.exit(summary() ? 1 : 0);
