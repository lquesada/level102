// Drink Mixer: drink names and share links (?d=...). Usage (from the repo root): node tests/drinkmixer/share.mjs
// (run_cujs.mjs all runs it too). Covers: link round trip with tricky names, bad links, names as plain text (XSS),
// navigator.share and the copy-link fallback, naming on the served screen, renaming in the recipe card, old saves,
// and shared links opened at every size in every language straight on the first frame.
import { pageUrl, shotsDir, sleep, checker } from "../lib/cdp.mjs";
import { launch, watchdog } from "./guard.mjs";
watchdog(15);
import { join } from "node:path";

const PAGE = pageUrl("drinkmixer"), SHOTS = shotsDir("drinkmixer");
const { ok, summary } = checker();
const local = link => link.replace("https://level102.com/drinkmixer/", PAGE);
// stubs installed before the page's own scripts: catch any alert/confirm and record share / clipboard calls.
// Every share sheet here is link-only (picture sharing is share_pic.mjs), so the browser's own canShare is removed
// too: Chrome on macOS has a real one that accepts files, Chrome on Linux has none
const STUBS = `window.__alerts=0;window.alert=window.confirm=window.prompt=function(){window.__alerts++;};
  window.__mode=(location.hash.match(/mode=(\\w+)/)||[])[1]||"share";window.__shared=[];window.__clip=[];
  Object.defineProperty(Navigator.prototype,"canShare",{value:undefined,configurable:true});
  if(window.__mode==="none")Object.defineProperty(Navigator.prototype,"share",{value:undefined,configurable:true});
  else Object.defineProperty(Navigator.prototype,"share",{configurable:true,value:function(d){window.__shared.push(d);
    return window.__mode==="fail"?Promise.reject(new Error("no share target")):window.__mode==="abort"?Promise.reject(new DOMException("cancelled","AbortError")):Promise.resolve();}});
  try{Object.defineProperty(Navigator.prototype,"clipboard",{configurable:true,value:{writeText:function(t){window.__clip.push(t);return Promise.resolve();}}});}catch(e){}`;
async function open(opts) { const b = await launch({ ...opts, url: "about:blank" }); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: STUBS }); return b; }
async function go(b, url) { await b.send("Page.navigate", { url }); await sleep(700); }
async function press(b, sel, touch) {
  const p = await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (!p) { ok("control exists: " + sel, false); return false; }
  if (touch) await b.tap(p.x, p.y); else await b.click(p.x, p.y);
  await sleep(180); return true;
}
async function type(b, sel, text, touch) { await press(b, sel, touch); await b.ev(`(()=>{const f=document.querySelector(${JSON.stringify(sel)});f.select();})()`); await b.send("Input.insertText", { text }); await sleep(100); }
const state = b => b.ev("DrinkMixer.state()");
async function serveNow(b, touch) { await press(b, "[data-act=pour]", touch); await sleep(150); await press(b, "[data-act=skip]", touch);
  for (let i = 0; i < 50 && (await b.ev("DrinkMixer.state().phase")) !== "served"; i++) await sleep(100); await sleep(500); }
const NAMES = ["Volcano Fizz", "Ñandú Pingüino", "Überzuckerte Brause", "🍓🍦 Party! 🎉", `<img src=x onerror=alert(1)>`, `"quoted" & 'single'`,
  "\u202Eevil\u202C rtl", "tab\there\nnewline", "x".repeat(200), "  spaces   inside  ", "", "<script>alert(2)</script>"];
const STRIP = new RegExp("[" + [[0, 0x1f], [0x7f, 0x9f], [0x61c, 0x61c], [0x200b, 0x200b], [0x200e, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]].map(([a, b]) => "\\u" + a.toString(16).padStart(4, "0") + "-\\u" + b.toString(16).padStart(4, "0")).join("") + "]", "g");
const clean = s => { s = s.normalize("NFC").replace(STRIP, "").replace(/\s+/g, " ").trim();
  const c = Array.from(s); return c.length > 32 ? c.slice(0, 32).join("").trim() : s; };

// 1. round trip: random recipes x tricky names -> link -> fresh page load -> same recipe code and name, shown as text
{
  const b = await open({ width: 1280, height: 800 });
  await go(b, PAGE);
  const links = await b.ev(`(()=>{const out=[];const names=${JSON.stringify(NAMES)};
    for(let i=0;i<24;i++){surprise();const code=encode(order);out.push({code,name:names[i%names.length],link:DrinkMixer.link(code,names[i%names.length])});}return out;})()`);
  ok("links are absolute https://level102.com/drinkmixer/?d=<compact payload>, short", links.every(l => /^https:\/\/level102\.com\/drinkmixer\/\?d=[A-Za-z0-9_.~-]+$/.test(l.link) && l.link.length < 420), Math.max(...links.map(l => l.link.length)) + " chars max");
  let bad = [];
  for (const l of links) {
    await go(b, local(l.link));
    const r = await b.ev(`({s:DrinkMixer.state(),rec:document.querySelector(".receipt .name").textContent,cap:document.querySelector("#caption").textContent,
      imgs:document.querySelectorAll("#app img, #app script").length,alerts:window.__alerts})`);
    const want = clean(l.name);
    if (r.s.order !== l.code || r.s.name !== want || r.s.step !== 6 || r.s.phase !== "choose" || r.imgs || r.alerts || (want && (r.rec !== want || r.cap !== want)))
      bad.push(JSON.stringify({ want: [l.code, want], got: r }).slice(0, 300));
  }
  ok(`round trip: ${links.length} shared links load the exact recipe and name on the Order step`, bad.length === 0, bad.slice(0, 2).join(" | "));
  ok("round trip: tricky names are plain text (no element created, no alert), control / direction marks stripped, max 32 characters", bad.length === 0 && (await b.ev("window.__alerts")) === 0);
  const worst = await b.ev(`(()=>{const o=freshState("soft");o.flavours=FLAVOURS.map(f=>f.id);o.toppings=TOPPINGS.map(t=>t.id);o.boosts=BOOSTS.map(x=>x.id);
    o.sour=3;o.spicy=4;o.salty=2;o.popc=2;o.l2=5;o.sugar=5;const name="🍓🍦🎉🧁🍭🍫🥤🍒🍌🍍🥝🍉🍇🍋🍊🍑🥥🍯🧋🍮🍪🍩🍰🎂🌈⭐️💖✨🌟🔥💥🎈".slice(0,64);
    const all=SHARE_BASE+"?d="+packLink(o,name);o.flavours.reverse();const scr=SHARE_BASE+"?d="+packLink(o,name);
    return{all:all.length,scr:scr.length,name:Array.from(cleanName(name)).length,loads:!!readLink(all.split("?d=")[1])&&!!readLink(scr.split("?d=")[1])};})()`);
  ok("worst case: every flavour, topping and boost + a 32-character emoji name -> URL well under 300 characters", worst.all < 300 && worst.name === 32 && worst.loads, JSON.stringify(worst));
  ok("worst case with every flavour in a scrambled pour order still makes a working link", worst.scr < 420 && worst.loads, JSON.stringify(worst));
  const fav = await b.ev(`[...document.querySelectorAll('link[rel~="icon"]')].map(l=>l.getAttribute("href").slice(0,30))`);
  ok("favicon: exactly one rel=icon, an inline data:image/svg+xml (no request)", fav.length === 1 && fav[0].startsWith("data:image/svg+xml,"), JSON.stringify(fav));
  ok("round trip: no console errors, no network", b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" ").slice(0, 300));
  await b.close();
}

// 2. bad links: friendly message, normal machine, no console error
{
  const b = await open({ width: 360, height: 740, touch: true, lang: "es-ES" });
  await go(b, PAGE);
  const good = await b.ev(`DrinkMixer.link("soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0","Hi")`);
  const d = good.split("?d=")[1], body = d.slice(0, -1);
  // variants of a good link with a correct checksum, so each one is refused for its own reason
  const fix = async x => x + await b.ev(`linkSum(${JSON.stringify(x)})`);
  const cases = { garbage: "%%%***", empty: "", truncated: d.slice(0, Math.floor(d.length / 2) + 1), "cut last char": body, "typo (checksum)": d.slice(0, 5) + (d[5] === "B" ? "C" : "B") + d.slice(6),
    huge: "A".repeat(20000), "wrong version": await fix("3" + body.slice(1)), "unknown treat": await fix(body[0] + "_" + body.slice(2)),
    "sugar out of range": await fix(body.slice(0, 2) + "Z" + body.slice(3)), "size of another treat": await fix(body.slice(0, 4) + "E" + body.slice(5)),
    "only unknown flavours (newer version)": await fix(body.slice(0, 16) + "_9_8" + body.slice(body.indexOf("."))), "bad name (not UTF-8)": await fix(body.split(".")[0] + "..._w"),
    "html": "<b>" + d, "padding": d + "==" };
  for (const [k, v] of Object.entries(cases)) {
    await go(b, PAGE + "?d=" + encodeURIComponent(v));
    const r = await b.ev(`({s:DrinkMixer.state(),toast:document.querySelector("#toast").textContent,h:document.querySelector("#pane h2").textContent})`);
    ok(`bad link (${k}): normal machine, friendly toast in Spanish, nothing loaded`, k === "empty" ? !r.s.fromLink && r.s.step === 0 : (!r.s.fromLink && r.s.step === 0 && r.s.order.startsWith("soda||") && r.toast === "Ese enlace de bebida no funciona. Aquí tienes la máquina normal." && r.h === "¿Qué preparamos?"), JSON.stringify(r).slice(0, 200));
  }
  await b.shot(join(SHOTS, "share_bad_link_es_phone.png"));
  // unknown ids from a newer version are skipped, the rest still loads
  const newer = await fix(body.slice(0, 16) + "_9" + body.slice(16));
  await go(b, PAGE + "?d=" + newer);
  ok("link with an extra unknown flavour id (newer version): loads, unknown id ignored", (await state(b)).order === "soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0");
  ok("bad links: no console errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 300));
  await b.close();
}

// 3. naming on the served screen, SHARE (system sheet and fallback), collection names, rename, old saves
{
  const b = await open({ width: 360, height: 740, touch: true, lang: "en-US" });
  await go(b, PAGE);
  await b.ev(`localStorage.clear()`); await go(b, PAGE + "?r=1#mode=share");
  await b.ev(`DrinkMixer.setOrder("shake|strawberry,vanilla|3|3|M|layers|vitc|whipped,cherry|sugar|none|auto|auto|0|cubes|0|0|0|0")`);
  await serveNow(b, true);
  ok("served: name field, empty, placeholder = generated name", await b.ev(`(()=>{const f=document.querySelector("#nameIn");return !!f&&f.value===""&&f.placeholder===drinkName(order)&&f.getBoundingClientRect().height>=44;})()`));
  await type(b, "#nameIn", "Pink Cloud <b>9</b>", true);
  await b.key("Enter");
  ok("served: Enter closes the keyboard (field loses focus), page did not scroll", await b.ev(`document.activeElement.id!=="nameIn"&&document.scrollingElement.scrollTop===0`));
  await b.shot(join(SHOTS, "share_served_name_en_phone.png"));
  await press(b, "[data-act=share]", true);
  let sh = await b.ev("window.__shared");
  const want = await b.ev(`DrinkMixer.link(encode(order),"Pink Cloud <b>9</b>")`);
  ok("SHARE (served): navigator.share gets title = name, text with the name, url = link", sh.length === 1 && sh[0].url === want && sh[0].title === "Pink Cloud <b>9</b>" && sh[0].text.includes("Pink Cloud <b>9</b>") && sh[0].text.includes("Drink Mixer"), JSON.stringify(sh));
  // this share sheet cannot take files (no canShare): after the link, the dialog offers the picture too (share_pic.mjs)
  ok("SHARE (served, link-only share sheet): then the dialog offers SAVE PICTURE", await b.ev(`!document.querySelector("#shareDlg").hidden&&!!document.querySelector("#picBtn")`));
  await press(b, "#shareClose", true);
  await press(b, "[data-act=save]", true);
  let inv = await b.ev(`JSON.parse(localStorage.getItem("fw.inv")).items`);
  ok("SAVE stores the name with the drink ([code, time, serial, name])", inv.length === 1 && inv[0][3] === "Pink Cloud <b>9</b>" && inv[0][0] === (await state(b)).order, JSON.stringify(inv));
  await type(b, "#nameIn", "Pink Cloud", true);
  inv = await b.ev(`JSON.parse(localStorage.getItem("fw.inv")).items`);
  ok("editing the name after SAVE updates the saved drink", inv[0][3] === "Pink Cloud");
  // fallback dialog when there is no share sheet; copy button
  await go(b, local(want) + "#mode=none");
  await serveNow(b, true);
  ok("shared link: the name comes along to the served screen", (await b.ev(`document.querySelector("#nameIn").value`)) === "Pink Cloud <b>9</b>");
  await press(b, "[data-act=share]", true);
  const dlg = await b.ev(`({open:!document.querySelector("#shareDlg").hidden,url:document.querySelector("#shareUrl").value,ro:document.querySelector("#shareUrl").readOnly,mode:window.__mode,shared:window.__shared.length})`);
  ok("SHARE without a share sheet: dialog with the link in a read-only field", dlg.open && dlg.url === want && dlg.ro, JSON.stringify(dlg) + " want " + want);
  await press(b, "#copyBtn", true); await sleep(200);
  ok("COPY puts the link on the clipboard and says Copied!", (await b.ev("window.__clip"))[0] === want && (await b.ev(`document.querySelector("#copyMsg").textContent`)) === "Copied!");
  await b.shot(join(SHOTS, "share_fallback_dialog_en_phone.png"));
  await b.key("Escape");
  ok("Esc closes the dialog", await b.ev(`document.querySelector("#shareDlg").hidden`));
  await go(b, PAGE + "?r=2#mode=fail"); await b.ev(`DrinkMixer.setOrder("soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0")`);
  await serveNow(b, true); await press(b, "[data-act=share]", true); await sleep(200);
  ok("SHARE when the share sheet fails: falls back to the dialog", await b.ev(`!document.querySelector("#shareDlg").hidden`));
  await press(b, "#shareClose", true);
  await go(b, PAGE + "?r=3#mode=abort"); await b.ev(`DrinkMixer.setOrder("soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0")`);
  await serveNow(b, true); await press(b, "[data-act=share]", true); await sleep(200);
  ok("SHARE cancelled by the player: no dialog, nothing else happens", await b.ev(`document.querySelector("#shareDlg").hidden`));
  // collection: an old unnamed save, a named one, a junk 4th field
  await b.ev(`localStorage.setItem("fw.inv",JSON.stringify({serial:3,items:[["soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0",1700000000,1],
    ["juice|orange|3|0|M|layers|||sugar|none|auto|auto|1|cubes|0|0|0|0",1700000100,2,"Sunny <i>Juice</i>"],["slush|grape|3|3|M|layers|||sugar|none|auto|auto|0|cubes|0|0|0|0",1700000200,3,{"x":1}]]}))`);
  await go(b, PAGE + "?r=4#mode=share"); await press(b, "#invBtn", true); await sleep(500);
  const cells = await b.ev(`[...document.querySelectorAll("#invSpacer .icell")].sort((a,b)=>b.dataset.inv-a.dataset.inv).map(c=>({nm:c.querySelector(".nm").textContent,auto:c.querySelector(".nm").classList.contains("auto"),html:c.querySelector(".nm").innerHTML}))`);
  ok("collection: custom names shown as text; unnamed (old) saves show the generated name, marked", cells.length === 3 && cells[1].nm === "Sunny <i>Juice</i>" && !cells[1].auto && cells[1].html.includes("&lt;i&gt;") && cells[2].auto && cells[0].auto
    && cells[2].nm === (await b.ev(`drinkName(decode("soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0"))`)), JSON.stringify(cells));
  await b.shot(join(SHOTS, "share_collection_names_en_phone.png"));
  await press(b, '#invSpacer [data-inv="1"]', true);
  ok("recipe card (old save): generated name marked automatic, pencil button, SHARE, MAKE IT AGAIN, Remove", await b.ev(`!!document.querySelector("#nameRow .name.auto")&&!!document.querySelector("[data-iact=rename]")&&!!document.querySelector("[data-iact=share]")&&!!document.querySelector("[data-iact=make]")&&!!document.querySelector("[data-iact=remove]")`));
  await press(b, "[data-iact=rename]", true);
  ok("rename: an edit field opens, the only editable thing on the card", await b.ev(`document.activeElement.id==="renameIn"&&document.querySelectorAll("#invDetail input").length===1`));
  await b.send("Input.insertText", { text: "Old Faithful \u{1F964}" }); await sleep(100);
  await b.shot(join(SHOTS, "share_recipe_rename_en_phone.png"));
  await press(b, "[data-iact=nameSave]", true);
  ok("rename: saved, shown in the card and the header", await b.ev(`document.querySelector("#nameRow .name").textContent==="Old Faithful \u{1F964}"&&document.querySelector("#invTitle").textContent==="Old Faithful \u{1F964}"`));
  await press(b, "[data-iact=share]", true);
  sh = await b.ev("window.__shared");
  ok("SHARE (recipe card): link carries the recipe and the new name", sh.length === 1 && sh[0].url === (await b.ev(`DrinkMixer.link("soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0","Old Faithful \u{1F964}")`)));
  await sleep(200); await press(b, "#shareClose", true);
  await press(b, "[data-iact=rename]", true); await b.key("Escape");
  ok("rename: Esc cancels (card stays open)", await b.ev(`!document.querySelector("#renameIn")&&!document.querySelector("#invDetail").hidden`));
  await b.send("Page.reload"); await sleep(900);
  inv = await b.ev(`JSON.parse(localStorage.getItem("fw.inv")).items`);
  ok("rename persists after reload; the junk name field was dropped", inv.find(x => x[2] === 1)[3] === "Old Faithful \u{1F964}" && inv.find(x => x[2] === 3).length === 3, JSON.stringify(inv));
  await press(b, "#invBtn", true); await sleep(400); await press(b, '#invSpacer [data-inv="2"]', true); await press(b, "[data-iact=make]", true);
  const s = await state(b);
  ok("MAKE IT AGAIN loads the recipe and its name into the machine (Order step)", s.order === "juice|orange|3|0|M|layers|||sugar|none|auto|auto|1|cubes|0|0|0|0" && s.name === "Sunny <i>Juice</i>" && s.step === 6 && (await b.ev(`document.querySelector(".receipt .name").textContent`)) === "Sunny <i>Juice</i>");
  ok("names: no console errors, no alerts", b.errors.length === 0 && (await b.ev("window.__alerts")) === 0, b.errors.join(" | ").slice(0, 300));
  await b.close();
}

// 4. a shared link opened at every size in every language: the very first game frame already shows the drink
const VIEWS = { phone: [360, 740, true], land: [740, 360, true], desktop: [1280, 800, false] };
for (const [lang, os] of [["en", "en-US"], ["es", "es-ES"], ["de", "de-DE"]]) for (const [v, [W, H, touch]] of Object.entries(VIEWS)) {
  const b = await open({ width: W, height: H, touch, lang: os });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__ff=[];(function rec(){const p=document.getElementById("pane");
    window.__ff.push({name:p&&p.querySelector(".receipt .name")?p.querySelector(".receipt .name").textContent:null,game:!!(p&&p.firstChild),h:p&&p.querySelector("h2")?p.querySelector("h2").textContent:""});
    if(!(p&&p.firstChild)&&window.__ff.length<200)requestAnimationFrame(rec);})()` });
  const code = "boba|taro,mango,lychee|3|3|L|spiral|vitc,b12|tapioca,strawwhip,f_straw|honey|rainbow|auto|oat|3|stars|0|0|0|0";
  await go(b, PAGE);
  const link = await b.ev(`DrinkMixer.link(${JSON.stringify(code)},"Volcán Größe 🍓")`);
  await go(b, local(link));
  const ff = (await b.ev("window.__ff")).find(f => f.game), s = await state(b), canon = await b.ev(`encode(decode(${JSON.stringify(code)}))`);
  ok(`shared link ${lang} ${v}: first game frame already shows the friend's drink (no default machine first)`, ff && ff.name === "Volcán Größe 🍓" && !ff.h && s.order === canon && s.step === 6, JSON.stringify(ff));
  ok(`shared link ${lang} ${v}: friend's line, toast and caption in ${lang}`, await b.ev(`document.querySelector(".friend").textContent===i18n("friendLine")&&document.querySelector("#toast").textContent===i18n("friendDrink",{x:"Volcán Größe 🍓"})&&document.querySelector("#caption").textContent==="Volcán Größe 🍓"`));
  await b.shot(join(SHOTS, `share_link_opened_${lang}_${v}.png`));
  if (v === "phone") {
    await serveNow(b, touch);
    await b.shot(join(SHOTS, `share_served_${lang}_${v}.png`));
    ok(`shared link ${lang} ${v}: not saved until SAVE; then saved with the name`, (await state(b)).inv === 0 && (await press(b, "[data-act=save]", touch)) && (await b.ev(`JSON.parse(localStorage.getItem("fw.inv")).items[0][3]`)) === "Volcán Größe 🍓");
    await b.ev(`Object.defineProperty(Navigator.prototype,"share",{value:undefined,configurable:true});1`); await press(b, "[data-act=share]", touch);
    ok(`share dialog ${lang}: title and buttons in ${lang}`, await b.ev(`document.querySelector("#shareTitle").textContent===i18n("shareH")&&document.querySelector("#copyBtn").textContent===i18n("copy")`));
    await b.shot(join(SHOTS, `share_dialog_${lang}_${v}.png`));
  }
  ok(`shared link ${lang} ${v}: no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" ").slice(0, 200));
  await b.close();
}
process.exit(summary() ? 1 : 0);
