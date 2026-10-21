// Drink Mixer: languages (first paint, OS fallback, switching in place, translation audit), text size A-/A+ and the
// shared top bar, at phone / sideways / desktop. Usage (from the repo root): node tests/drinkmixer/extras.mjs
// (run_cujs.mjs all runs it too, next to the main journeys).
import { pageUrl, shotsDir, sleep, checker } from "../lib/cdp.mjs";
import { launch, watchdog } from "./guard.mjs";
watchdog(15);
import { join } from "node:path";
import { LEAKS, AUDIT, LAYOUT } from "./i18n_checks.mjs";

const PAGE = pageUrl("drinkmixer"), SHOTS = shotsDir("drinkmixer");
const { ok, summary } = checker();
const VIEWS = { phone: [360, 740, true], land: [740, 360, true], desktop: [1280, 800, false] };
const OS = { en: "en-US", es: "es-ES", de: "de-DE" };
const FULL = "boba|taro,mango,lychee,strawberry|4|4|L|spiral|vitc,b12,multi|tapioca,strawwhip,scoop_van,f_straw,sprinkles|honey|rainbow|stripe|oat|4|crushed|2|3|1|1";

// press a control the way the player would (finger on touch screens, mouse on desktop)
async function press(b, sel, touch) {
  const p = await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:"nearest",inline:"nearest"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (!p) return false;
  if (touch) await b.tap(p.x, p.y); else await b.click(p.x, p.y);
  await sleep(160); return true;
}
const setLang = (b, l) => b.ev(`(()=>{const s=document.querySelector("#l102lang");s.value=${JSON.stringify(l)};s.dispatchEvent(new Event("change"));})()`);
const say = (b, key, vars) => b.ev(`i18n(${JSON.stringify(key)},${JSON.stringify(vars || {})})`);
async function layout(b, tag, lang) {
  const r = await b.ev(LAYOUT);
  ok(tag + ": no overflow, no page scroll, machine fits", !r.overflowX && !r.pageScroll && r.machineFits, JSON.stringify({ x: r.overflowX, s: r.pageScroll, fits: r.machineFits }));
  ok(tag + ": tap targets >= 44px (top bar exempt)", r.small.length === 0, r.small.slice(0, 5).join("; "));
  ok(tag + ": no text spilling out of controls", r.clipped.length === 0, r.clipped.slice(0, 4).join("; "));
  ok(tag + ": no word split in the middle", r.broken.length === 0, [...new Set(r.broken)].slice(0, 6).join("; "));
  ok(tag + ": top bar one row, game UI below it", r.barOneRow && r.underBar);
  if (lang !== "en") { const l = await b.ev(LEAKS); ok(tag + ": no English text on screen", l.length === 0, l.slice(0, 6).join(" | ")); }
}

// 1. first paint is already in the OS language (and fr falls back to English)
const ENGLISH_UI = ["What are we making?", "Pick a treat!", "Surprise me", "Collection", "Next", "Back to level102.com", "Fizzy Soda", "13 treats"];
for (const [os, want] of [["en-US", "en"], ["es-ES", "es"], ["de-DE", "de"], ["fr-FR", "en"]]) {
  const b = await launch({ url: "about:blank", width: 360, height: 740, touch: true, lang: os });
  // record the DOM at every frame from the very first one until the game has drawn its panel (before any later fix-up)
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{window.__ff=[];const rec=()=>{const p=document.getElementById("pane");
      window.__ff.push({lang:document.documentElement.lang,title:document.title,text:document.body?document.body.innerText:"",game:!!(p&&p.firstChild)});
      if(!(p&&p.firstChild)&&window.__ff.length<200)requestAnimationFrame(rec);};requestAnimationFrame(rec);})()` });
  await b.send("Page.navigate", { url: PAGE });
  for (let i = 0; i < 40; i++) { try { await b.shot(join(SHOTS, `firstframe_${os}.png`)); break; } catch { await sleep(25); } } // as early as Chrome can capture
  await sleep(900);
  const frames = await b.ev("window.__ff"), heading = await say(b, "treatH"), ff = frames.find(f => f.game);
  ok(`first paint ${os}: <html lang> is ${want} from the first frame`, frames.length && frames.every(f => f.lang === want) && (await b.ev("document.documentElement.lang")) === want, JSON.stringify(frames.map(f => f.lang)));
  ok(`first paint ${os}: the first frame showing the game is already in ${want}`, ff && ff.text.includes(heading) && ff.title === (await say(b, "title")), (ff ? ff.text.slice(0, 120) : "no frame").replace(/\n/g, " / "));
  if (want !== "en") {
    const eng = [...new Set(frames.flatMap(f => ENGLISH_UI.filter(s => f.text.includes(s) || f.title.includes("Drink Mixer"))))];
    ok(`first paint ${os}: no English in any frame (${frames.length} recorded)`, eng.length === 0, eng.join(", "));
    const l = await b.ev(LEAKS); ok(`first paint ${os}: no English text after load`, l.length === 0, l.join(" | "));
  }
  const NAME = { en: "Drink Mixer", es: "Mezclador de bebidas", de: "Getränke-Mixer" }[want];
  const nm = await b.ev(`({title:document.title,brand:document.querySelector(".brand span").textContent,old:/fizz\s*whizz|3000/i.test(document.title+document.body.innerText+[...document.querySelectorAll("[aria-label],[title],[alt],[placeholder]")].map(e=>[e.getAttribute("aria-label"),e.title,e.alt,e.placeholder].join(" ")).join(" "))})`);
  ok(`game name ${os}: <title> and the machine's logo say "${NAME}", no "FizzWhizz" anywhere`, nm.title === NAME && nm.brand === NAME && !nm.old, JSON.stringify(nm));
  ok(`first paint ${os}: no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  await b.close();
}

// 2. translation audit: every key in every language, every data item named, no accidental English
{
  const b = await launch({ url: PAGE, width: 800, height: 800 });
  const a = await b.ev(AUDIT);
  ok("i18n: every UI key exists in en/es/de with the same type", !a.missing.filter(x => x.includes(":ui.")).length && !a.extra.length && !a.type.length, [...a.missing, ...a.extra, ...a.type].slice(0, 8).join(", "));
  ok("i18n: every data item (treats, flavours, boosts, toppings, options) has es and de names", !a.missing.length, a.missing.slice(0, 10).join(", "));
  ok("i18n: every string and template renders (no undefined)", !a.bad.length, a.bad.slice(0, 8).join(", "));
  ok("i18n: nothing in es/de is left in English (except the listed loanwords)", !a.same.length, a.same.slice(0, 12).join(", "));
  // drink names: grammatical shapes per language on a few known recipes
  const names = await b.ev(`(()=>{const r={};for(const l of ["en","es","de"]){L102.setLang(l);r[l]=[
      "soda|cherry,mango|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0","lemonade|lemon|3|1|M|layers|||sugar|none|auto|auto|2|cubes|0|3|0|0",
      "soft|strawberry,vanilla|3|5|cone|layers|||sugar|none|auto|auto|0|cubes|0|0|0|0","hotchoc||3|3|M|layers|||sugar|none|auto|auto|0|cubes|0|0|0|0",
      "lemonade|orange,hibiscus|3|1|M|layers|||sugar|none|auto|milk|0|cubes|0|0|0|0"].map(c=>drinkName(decode(c)));}L102.setLang("en");return r;})()`);
  ok("names: Spanish noun first, 'de X y Y', adjectives agree", names.es[0] === "Refresco de cereza y mango" && names.es[1] === "Limonada superpicante de limón" && names.es[3] === "Bebida caliente misteriosa", names.es.join(" | "));
  ok("names: Spanish 'y' becomes 'e' before an i- sound", /naranja e hibisco/.test(names.es[4]), names.es[4]);
  ok("names: German compounds and adjective endings", names.de[0] === "Kirsch-Mango-Brause" && names.de[1] === "Feurige Zitronen-Limonade" && names.de[2] === "Erdbeer-Vanille-Softeis-Turm" && names.de[3] === "Geheimnisvolles Heißgetränk", names.de.join(" | "));
  ok("names: English unchanged", names.en[0] === "Cherry-Mango Soda" && names.en[2] === "Tower of Strawberry-Vanilla Soft-Serve" && names.en[3] === "Mystery Hot Drink", names.en.join(" | "));
  await b.close();
}

// 3. switching language in the bar re-renders in place and keeps every bit of state
{
  const b = await launch({ url: PAGE, width: 360, height: 740, touch: true, lang: "en-US" });
  await press(b, "[data-act=product][data-id=boba]", true); await press(b, "[data-act=next]", true);
  await press(b, "[data-act=cat][data-id=all]", true); await press(b, "[data-act=flavour][data-id=taro]", true); await press(b, "[data-act=flavour][data-id=mango]", true);
  await press(b, '[data-step="3"]', true); await press(b, "[data-act=sour][data-id=\"2\"]", true);
  const before = await b.ev("DrinkMixer.state()"), scroll = await b.ev(`document.querySelector("#paneWrap").scrollTop`);
  await setLang(b, "de"); await sleep(300);
  let s = await b.ev("DrinkMixer.state()");
  ok("switch mid-order en->de: <html lang>=de, saved, order/step/phase kept", (await b.ev("document.documentElement.lang")) === "de" && (await b.ev(`localStorage.getItem("l102.lang")`)) === "de" && JSON.stringify(s) === JSON.stringify(before), JSON.stringify(s));
  ok("switch mid-order: tab, heading, caption and bar in German", (await b.ev(`document.querySelector("#tab-taste").textContent.endsWith("Würze")&&document.querySelector("#pane h2").textContent==="Würze"&&document.querySelector("#caption").textContent===drinkName(order)&&/Weiter/.test(document.querySelector("#bar").textContent)`)));
  ok("switch mid-order: scroll position kept", Math.abs((await b.ev(`document.querySelector("#paneWrap").scrollTop`)) - scroll) <= 1);
  let l = await b.ev(LEAKS); ok("switch mid-order: no English left on screen", l.length === 0, l.join(" | "));
  await b.shot(join(SHOTS, "switch_1_midorder_de.png"));
  // during the pour: same checklist, same progress, new words
  await press(b, '[data-step="6"]', true); await press(b, "[data-act=pour]", true); await sleep(1500);
  const p0 = await b.ev(`({n:document.querySelectorAll("#plist li").length,ok:document.querySelectorAll("#plist li.ok").length})`);
  await setLang(b, "es"); await sleep(150);
  const p1 = await b.ev(`({n:document.querySelectorAll("#plist li").length,ok:document.querySelectorAll("#plist li.ok").length,first:document.querySelector("#plist li").textContent,phase:DrinkMixer.state().phase,h:document.querySelector(".pour-head h2").textContent})`);
  ok("switch while pouring de->es: still pouring, same checklist and progress, now in Spanish", p1.phase === "pour" && p1.n === p0.n && p1.ok >= p0.ok && p1.first === "Vaso listo" && p1.h.startsWith("Preparando"), JSON.stringify([p0, p1]));
  await b.shot(join(SHOTS, "switch_2_pouring_es.png"));
  ok("switch while pouring: still reaches served", await (async () => { for (let i = 0; i < 100; i++) { if ((await b.ev("DrinkMixer.state().phase")) === "served") return true; await sleep(200); } return false; })());
  await sleep(400); await press(b, "[data-act=save]", true);
  await setLang(b, "de"); await sleep(200);
  ok("switch when served es->de: ticket in German, SAVED stays disabled", await b.ev(`DrinkMixer.state().phase==="served"&&document.querySelector(".ticket .big").textContent.startsWith("Bestellung")&&document.querySelector("[data-act=save]").disabled&&/GESAMMELT/.test(document.querySelector("[data-act=save]").textContent)`));
  l = await b.ev(LEAKS); ok("switch when served: no English left on screen", l.length === 0, l.join(" | "));
  await b.shot(join(SHOTS, "switch_3_served_de.png"));
  // with the collection open: grid, then recipe card with the removal question showing
  await b.ev("DrinkMixer.fillInventory(40)"); await press(b, "#invBtn", true); await sleep(400);
  await b.ev(`document.querySelector("#invScroll").scrollTop=300`); await sleep(300);
  await setLang(b, "es"); await sleep(300);
  ok("switch with the collection open de->es: still open on the grid, scroll kept, Spanish titles", await b.ev(`!document.querySelector("#inv").hidden&&!document.querySelector("#invScroll").hidden&&document.querySelector("#invScroll").scrollTop>=290&&document.querySelector("#invTitle").textContent==="Mi colección"&&/bebidas guardadas/.test(document.querySelector("#invSub").textContent)`));
  const cellName = await b.ev(`(()=>{const c=document.querySelector("#invSpacer .icell");const it=JSON.parse(localStorage.getItem("fw.inv")).items.find(x=>x[2]==+c.dataset.inv);return c.querySelector(".nm").textContent===drinkName(decode(it[0]));})()`);
  ok("switch with the collection open: drink names in the grid re-made in Spanish", cellName);
  await press(b, "#invSpacer .icell", true); await press(b, "[data-iact=remove]", true);
  const inv0 = await b.ev("DrinkMixer.state().inv");
  await setLang(b, "en"); await sleep(300);
  ok("switch on a recipe card es->en: card and the removal question still showing, now in English", await b.ev(`!document.querySelector("#invDetail").hidden&&!!document.querySelector("[data-iact=really]")&&document.querySelector(".confirm p").textContent.startsWith("Remove this drink")&&/How it was made/.test(document.querySelector("#invDetail").innerText)`));
  await setLang(b, "de"); await sleep(300);
  ok("switch on a recipe card en->de: German card, nothing removed, saved drinks untouched", await b.ev(`!!document.querySelector("[data-iact=really]")&&/So wurde es gemacht/.test(document.querySelector("#invDetail").innerText)`) && (await b.ev("DrinkMixer.state().inv")) === inv0 && (await b.ev(`JSON.parse(localStorage.getItem("fw.inv")).items.length`)) === inv0);
  l = await b.ev(LEAKS); ok("switch on a recipe card: no English left on screen", l.length === 0, l.join(" | "));
  await b.shot(join(SHOTS, "switch_4_recipe_confirm_de.png"));
  await b.send("Page.reload"); await sleep(900);
  ok("chosen language survives a reload", (await b.ev("document.documentElement.lang")) === "de" && (await b.ev(`document.querySelector("#pane h2").textContent`)) === "Was machen wir?");
  ok("switching: no console errors, no network", b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  await b.close();
}

// 4. text size A-/A+ at both ends (0.8 .. 1.8, default 1.1), every screen, every size, every language; plus the top bar
async function sizeRun(lang, vname) {
  const [W, H, touch] = VIEWS[vname], tag = `${lang}_${vname}`;
  const b = await launch({ url: PAGE, width: W, height: H, touch, lang: OS[lang] });
  const back = await b.ev(`(()=>{const a=document.querySelector("#l102back");return{href:a.getAttribute("href"),text:a.textContent}})()`);
  ok(`${tag}: top bar back link to https://level102.com, in ${lang}`, back.href === "https://level102.com" && back.text === "‹ " + { en: "Back to level102.com", es: "Volver a level102.com", de: "Zurück zu level102.com" }[lang], JSON.stringify(back));
  const def = await b.ev(`[L102.fs,+getComputedStyle(document.documentElement).getPropertyValue("--fs")]`);
  ok(`${tag}: default text size is 1.1`, def[0] === 1.1 && def[1] === 1.1, JSON.stringify(def));
  for (const fs of [1.8, 0.8]) {
    for (let i = 0; i < 12; i++) await press(b, fs > 1 ? "#l102plus" : "#l102minus", touch);
    const got = await b.ev(`[L102.fs,getComputedStyle(document.documentElement).getPropertyValue("--fs").trim()]`);
    ok(`${tag} fs ${fs}: A${fs > 1 ? "+" : "−"} reaches ${fs} (and stops there)`, got[0] === fs && +got[1] === fs && (await b.ev(`document.querySelector(${JSON.stringify(fs > 1 ? "#l102plus" : "#l102minus")}).disabled`)), JSON.stringify(got));
    const px = await b.ev(`parseFloat(getComputedStyle(document.querySelector(".pane-title h2")).fontSize)`);
    ok(`${tag} fs ${fs}: game text scales (heading ${px}px)`, Math.abs(px - 18 * fs) < 0.6);
    const T = `${tag}_fs${String(fs).replace(".", "")}`;
    await layout(b, T + " first screen", lang); await b.shot(join(SHOTS, `fs_${T}_0_first.png`));
    await b.ev(`DrinkMixer.setOrder(${JSON.stringify(FULL)})`); await sleep(200);
    for (const st of [1, 2, 3, 4, 5, 6]) {
      await press(b, `[data-step="${st}"]`, touch); await sleep(150);
      await layout(b, `${T} step ${st + 1}`, lang);
      if (st === 2 || st === 3 || st === 6) await b.shot(join(SHOTS, `fs_${T}_${st}.png`));
    }
    await b.ev(`document.querySelector("#paneWrap").scrollTop=1e5`); await sleep(100); await layout(b, `${T} order (scrolled)`, lang);
    await press(b, "[data-act=pour]", touch); await sleep(900); await layout(b, `${T} pouring`, lang);
    await press(b, "[data-act=skip]", touch); await sleep(900);
    await layout(b, `${T} served`, lang); await b.shot(join(SHOTS, `fs_${T}_7_served.png`));
    await press(b, "[data-act=save]", touch);
    await b.ev("DrinkMixer.fillInventory(30)"); await press(b, "#invBtn", touch); await sleep(500);
    await layout(b, `${T} collection`, lang); await b.shot(join(SHOTS, `fs_${T}_8_collection.png`));
    await press(b, "#invSpacer .icell", touch); await press(b, "[data-iact=remove]", touch); await sleep(200);
    await b.ev(`document.querySelector("#invDetail").scrollTop=1e5`); await sleep(100);
    await layout(b, `${T} recipe card + confirm`, lang); await b.shot(join(SHOTS, `fs_${T}_9_recipe.png`));
    await press(b, "[data-iact=keep]", touch); await press(b, "#invClose", touch);
    if (fs > 1) {
      await b.send("Page.reload"); await sleep(900);
      ok(`${tag}: text size ${fs} persists after reload`, (await b.ev(`[L102.fs,+getComputedStyle(document.documentElement).getPropertyValue("--fs")]`)).every(v => v === fs));
    }
    await press(b, "[data-act=reset]", touch); await sleep(2200);
  }
  ok(`${tag}: no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" "));
  await b.close();
}
// narrowest phone, German, biggest text: bar in one row, nothing under it, game still fits
{
  const b = await launch({ url: PAGE, width: 320, height: 640, touch: true, lang: "de-DE" });
  for (let i = 0; i < 12; i++) await press(b, "#l102plus", true);
  ok("de 320x640 fs 1.8: text size reached 1.8", (await b.ev("L102.fs")) === 1.8);
  await layout(b, "de_320_fs18 first screen", "de"); await b.shot(join(SHOTS, "fs_de_320_fs18_0_first.png"));
  await b.ev(`DrinkMixer.setOrder(${JSON.stringify(FULL)})`); await sleep(300); await layout(b, "de_320_fs18 order", "de");
  await press(b, "[data-act=pour]", true); await press(b, "[data-act=skip]", true); await sleep(1200);
  await layout(b, "de_320_fs18 served", "de"); await b.shot(join(SHOTS, "fs_de_320_fs18_7_served.png"));
  ok("de 320x640 fs 1.8: no console errors", b.errors.length === 0, b.errors.join(" | "));
  await b.close();
}
const runs = []; for (const lang of ["de", "es", "en"]) for (const v of Object.keys(VIEWS)) runs.push([lang, v]);
for (let i = 0; i < runs.length; i += 3) await Promise.all(runs.slice(i, i + 3).map(r => sizeRun(...r)));

process.exit(summary() ? 1 : 0);
