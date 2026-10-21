// Link-preview cards (WhatsApp, Telegram, social...): draws docs/card.jpg and docs/<game>/card.jpg (1200x630) from
// the home page icons, and writes the Open Graph / description tags into each page between
// <!-- l102-card --> and <!-- /l102-card --> (right after the favicon line).
// The page never loads card.jpg itself (it stays self-contained); only link previews fetch it.
// Usage (repo root): node tools/make_cards.mjs [home|<game> ...]   (no args = every page; NOMETA=1 = only the images)
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launch, ROOT, sleep } from "../tests/lib/cdp.mjs";

const SITE = "https://level102.com/";
// English text for the cards and tags (previews can't follow the reader's language). Add a line per new game.
const INFO = {
  home: { title: "level102", desc: "Free little games for phone, tablet and computer. They work offline, too.", bg: ["#ffe9f3", "#e6dcff"], ink: "#3a1d6e" },
  drinkmixer: { title: "Drink Mixer", desc: "Mix crazy drinks with every topping you like, give them a name and share them.", bg: ["#ffe3f0", "#ffd2e6"], ink: "#7a1747" },
  infinitedungeon: { title: "Infinite Dungeon", desc: "Fight your way through an endless dungeon train. How far can you go?", bg: ["#2a1a48", "#0e0918"], ink: "#ffe9a8" },
  fluid: { title: "Fluid", desc: "A pocket of glowing liquid: tilt and shake your phone, or drag it around.", bg: ["#1d2a66", "#070b1c"], ink: "#bfeaff" },
  arcadeclaw: { title: "Arcade Claw", desc: "A pixel-art claw machine: insert a coin, steer the claw and grab a plush toy.", bg: ["#2a1450", "#0b0716"], ink: "#ffe08a" },
  candyshop: { title: "Candy Shop", desc: "Fill your bag from a huge wall of candy jars, then pay at the counter.", bg: ["#ffeef6", "#ffd9ea"], ink: "#7a1747" },
};

const home = readFileSync(join(ROOT, "docs", "index.html"), "utf8");
const icons = {};
for (const m of home.matchAll(/<a class="game" href="([a-z0-9]+)\/">\s*<span class="icon( dark)?">\s*(<svg[\s\S]*?<\/svg>)/g))
  icons[m[1]] = { dark: !!m[2], svg: m[3].replace(/ width="84" height="84"/, "") };
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["home", ...Object.keys(icons)];
const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const tile = (g, size) => `<div class="tile${icons[g].dark ? " dark" : ""}" style="width:${size}px;height:${size}px">${icons[g].svg}</div>`;
function cardHtml(p) {
  const I = INFO[p], dark = p === "infinitedungeon" || p === "fluid" || p === "arcadeclaw";
  const art = p === "home" ? `<div class="row">${Object.keys(icons).map(g => tile(g, 170)).join("")}</div>` : tile(p, 400);
  return `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:radial-gradient(circle at 25% 30%,${I.bg[0]},${I.bg[1]});font-family:system-ui,"Segoe UI",Roboto,sans-serif;color:${I.ink};
  display:flex;align-items:center;gap:64px;padding:0 80px;box-sizing:border-box;${p === "home" ? "flex-direction:column;justify-content:center;gap:36px;text-align:center" : ""}}
.tile{flex:0 0 auto;border-radius:22%;background:#fff;box-shadow:0 18px 44px rgba(52,22,120,.3),0 0 0 10px #ff9d1c;display:flex;align-items:center;justify-content:center;overflow:hidden}
.tile.dark{background:linear-gradient(180deg,#2a1a48,#120c1c);box-shadow:0 18px 44px rgba(0,0,0,.5),0 0 0 10px #ffd84d}
.tile svg{width:86%;height:86%}.row{display:flex;gap:56px}
h1{margin:0;font-size:${p === "home" ? 110 : 92}px;line-height:1;font-weight:900;letter-spacing:-1px}
p{margin:22px 0 0;font-size:38px;line-height:1.25;font-weight:600;opacity:.85;max-width:${p === "home" ? 1000 : 620}px}
.url{display:inline-block;margin-top:30px;font-size:30px;font-weight:800;padding:10px 24px;border-radius:999px;
  background:${dark ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.75)"}}
</style><body>${p === "home" ? `<div><h1>${esc(I.title)}</h1><p>${esc(I.desc)}</p></div>${art}<div class="url">level102.com</div>`
    : `${art}<div><h1>${esc(I.title)}</h1><p>${esc(I.desc)}</p><div class="url">level102.com/${p}</div></div>`}</body>`;
}
function metaBlock(p) {
  const I = INFO[p], url = SITE + (p === "home" ? "" : p + "/");
  return `<!-- l102-card: link previews (made by tools/make_cards.mjs; the page never loads card.jpg) -->
<meta name="description" content="${esc(I.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="level102">
<meta property="og:title" content="${esc(I.title)}">
<meta property="og:description" content="${esc(I.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${url}card.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(I.title)}">
<meta name="twitter:card" content="summary_large_image">
<!-- /l102-card -->`;
}

const tmp = mkdtempSync(join(tmpdir(), "l102card-"));
for (const p of pages) {
  if (!INFO[p] || (p !== "home" && !icons[p])) { console.log("skip", p, "(add it to INFO and give it a home icon)"); continue; }
  const dir = p === "home" ? join(ROOT, "docs") : join(ROOT, "docs", p), f = join(tmp, p + ".html");
  writeFileSync(f, cardHtml(p));
  const b = await launch({ url: "file://" + f, width: 1200, height: 630 });
  await sleep(300);
  const { result } = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 88 });   // jpeg: WhatsApp wants < 300 KB
  writeFileSync(join(dir, "card.jpg"), Buffer.from(result.data, "base64")); await b.close();
  if (process.env.NOMETA) { console.log("card (image only)", p); continue; }
  const page = join(dir, "index.html");
  let html = readFileSync(page, "utf8");
  const block = metaBlock(p), re = /<!-- l102-card[\s\S]*?<!-- \/l102-card -->/;
  if (re.test(html)) html = html.replace(re, block);
  else html = html.replace(/(<link rel="icon"[^>]*>)/, `$1\n${block}`);
  if (!html.includes(block)) throw new Error("could not place the card tags in " + page);
  writeFileSync(page, html);
  console.log("card", p);
}
rmSync(tmp, { recursive: true, force: true });
