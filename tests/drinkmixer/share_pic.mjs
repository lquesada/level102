// Drink Mixer: SHARE sends a picture AND the link. Usage (from the repo root): node tests/drinkmixer/share_pic.mjs
// (run_cujs.mjs all runs it too). Covers: the PNG (size, dimensions, saved for a look: a simple drink, an "everything"
// drink, tricky / very long names), navigator.share({files:[png],title,text,url}) when canShare says yes, the fallback
// (link share or the copy dialog) with a working SAVE PICTURE download, cancel = nothing, and the served screen, the
// recipe card and the share dialog at every size, at text size 0.8 and 1.8, in every language.
import { pageUrl, shotsDir, sleep, checker } from "../lib/cdp.mjs";
import { launch, watchdog } from "./guard.mjs";
import { LAYOUT } from "./i18n_checks.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
watchdog(12);

const PAGE = pageUrl("drinkmixer"), SHOTS = shotsDir("drinkmixer");
const { ok, summary } = checker();
// stubs before the page's scripts. #mode=files: share + canShare(files) true; link: share, canShare false;
// none: no share at all; abort: the player cancels the share sheet. SAVE PICTURE downloads are caught at a.click().
const STUBS = `window.__alerts=0;window.alert=window.confirm=window.prompt=function(){window.__alerts++;};
  window.__mode=(location.hash.match(/mode=(\\w+)/)||[])[1]||"files";window.__shared=[];window.__dl=[];
  const def=(k,v)=>Object.defineProperty(Navigator.prototype,k,{value:v,configurable:true,writable:true});
  if(window.__mode==="none"){def("share",undefined);def("canShare",undefined);}
  else{def("share",function(d){window.__shared.push(d);return window.__mode==="abort"?Promise.reject(new DOMException("cancelled","AbortError")):Promise.resolve();});
    def("canShare",function(d){return window.__mode!=="link"&&!!d&&Array.isArray(d.files)&&d.files.every(f=>f instanceof File);});}
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl.push({href:this.href,name:this.download});return;}return click.call(this);};`;
async function open(opts) { const b = await launch({ ...opts, url: "about:blank" }); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: STUBS }); return b; }
async function go(b, url) { await b.send("Page.navigate", { url }); await sleep(700); }
async function press(b, sel, touch) {
  const p = await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (!p) { ok("control exists: " + sel, false); return false; }
  if (touch) await b.tap(p.x, p.y); else await b.click(p.x, p.y);
  await sleep(180); return true;
}
async function serveNow(b, touch) {
  for (let i = 0; i < 3 && !(await b.ev(`!!document.querySelector("[data-act=skip]")`)); i++) { await press(b, "[data-act=pour]", touch); await waitFor(b, `!!document.querySelector("[data-act=skip]")`, 1500); }
  await press(b, "[data-act=skip]", touch);
  for (let i = 0; i < 50 && (await b.ev("DrinkMixer.state().phase")) !== "served"; i++) await sleep(100); await sleep(500); }
async function waitFor(b, expr, ms = 4000) { for (let t = 0; t < ms; t += 100) { if (await b.ev(expr)) return true; await sleep(100); } return false; }
// a PNG blob/file in the page -> {size, w, h, png signature ok, base64}
const INFO = blobExpr => `(async()=>{const bl=${blobExpr};const by=new Uint8Array(await bl.arrayBuffer());const bm=await createImageBitmap(bl);
  let bin="";for(let i=0;i<by.length;i+=32768)bin+=String.fromCharCode.apply(null,by.subarray(i,i+32768));
  return{size:by.length,w:bm.width,h:bm.height,type:bl.type,name:bl.name||"",sig:by[0]===137&&by[1]===80&&by[2]===78&&by[3]===71,b64:btoa(bin)};})()`;
const pngOk = i => i && i.sig && i.type === "image/png" && i.w === 1080 && i.h === 1350 && i.size > 30000 && i.size < 6000000;
const save = (i, f) => { if (i && i.b64) writeFileSync(join(SHOTS, f), Buffer.from(i.b64, "base64")); };
const SIMPLE = "soda|cherry|3|3|M|layers|||sugar|none|auto|auto|2|cubes|0|0|0|0";
const EVERYTHING = `(()=>{const o=freshState("soft");o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).map(f=>f.id);o.toppings=TOPPINGS.filter(t=>allowedTo(t,o)).map(t=>t.id);
  o.boosts=BOOSTS.map(x=>x.id);o.sour=3;o.spicy=4;o.popc=2;o.sugar=5;return encode(o);})()`;
const EVERY_DRINK = `(()=>{const o=freshState("boba");o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).map(f=>f.id);o.toppings=TOPPINGS.filter(t=>allowedTo(t,o)).map(t=>t.id);
  o.boosts=BOOSTS.map(x=>x.id);o.mix="spiral";o.ice=3;o.rim=RIMS[RIMS.length-1][0];return encode(o);})()`;

// 1. picture + link through the share sheet (served screen and recipe card); the PNG itself
{
  const b = await open({ width: 360, height: 740, touch: true });
  await go(b, PAGE); await b.ev(`localStorage.clear()`); await go(b, PAGE + "?r=1#mode=files");
  await b.ev(`DrinkMixer.setOrder(${JSON.stringify(SIMPLE)})`); await serveNow(b, true);
  await press(b, "#nameIn", true); await b.send("Input.insertText", { text: "Cherry Pop" }); await b.key("Enter");
  await press(b, "[data-act=share]", true);
  ok("SHARE (served, file sharing supported): navigator.share called once", await waitFor(b, "window.__shared.length===1"));
  const want = await b.ev(`DrinkMixer.link(${JSON.stringify(SIMPLE)},"Cherry Pop")`);
  const sh = await b.ev(`(()=>{const d=window.__shared[0]||{};return{files:(d.files||[]).length,isFile:d.files&&d.files[0] instanceof File,name:d.files&&d.files[0].name,url:d.url,title:d.title,text:d.text};})()`);
  ok("SHARE (served): exactly one File drink.png + title + text + url = the ?d= link (also in the text)", sh.files === 1 && sh.isFile && sh.name === "drink.png" && sh.url === want && sh.title === "Cherry Pop" && /Cherry Pop/.test(sh.text) && sh.text.includes(want), JSON.stringify(sh));
  let info = await b.ev(INFO("window.__shared[0].files[0]"));
  ok("SHARE (served): the file is a real PNG, 1080x1350, sensible size", pngOk(info), JSON.stringify({ ...info, b64: undefined }));
  save(info, "sharepic_simple.png");
  ok("SHARE (served): no fallback dialog when the picture was shared", await b.ev(`document.querySelector("#shareDlg").hidden`));
  // the name is drawn in: a picture with another name differs
  const differ = await b.ev(`(async()=>{const a=await DrinkMixer.picture(${JSON.stringify(SIMPLE)},"Cherry Pop"),c=await DrinkMixer.picture(${JSON.stringify(SIMPLE)},"Totally Different");
    const x=new Uint8Array(await a.arrayBuffer()),y=new Uint8Array(await c.arrayBuffer());return x.length!==y.length||x.some((v,i)=>v!==y[i]);})()`);
  ok("picture: the drink's name is drawn in (another name -> another picture)", differ);
  // everything drinks
  for (const [k, ex] of [["everything_softserve", EVERYTHING], ["everything_boba", EVERY_DRINK]]) {
    const code = await b.ev(ex);
    info = await b.ev(INFO(`await DrinkMixer.picture(${JSON.stringify(code)},drinkName(decode(${JSON.stringify(code)})))`));
    ok(`picture (${k}: every ingredient): PNG 1080x1350`, pngOk(info), JSON.stringify({ ...info, b64: undefined }));
    save(info, `sharepic_${k}.png`);
  }
  // recipe card: SAVE, open the collection, SHARE from the card
  await press(b, "[data-act=save]", true); await b.ev(`window.__shared=[]`);
  await press(b, "#invBtn", true); await sleep(500); await press(b, "#invSpacer [data-inv]", true); await sleep(200);
  await press(b, "[data-iact=share]", true);
  ok("SHARE (recipe card): picture + link", await waitFor(b, "window.__shared.length===1") && await b.ev(`(()=>{const d=window.__shared[0];return d.files.length===1&&d.files[0].type==="image/png"&&d.url===${JSON.stringify(want)}&&d.title==="Cherry Pop";})()`));
  // cancelled
  await go(b, PAGE + "?r=2#mode=abort"); await b.ev(`DrinkMixer.setOrder(${JSON.stringify(SIMPLE)})`); await serveNow(b, true);
  await press(b, "[data-act=share]", true); await waitFor(b, "window.__shared.length===1"); await sleep(300);
  ok("SHARE cancelled by the player: no dialog, no error", (await b.ev(`window.__shared.length===1&&document.querySelector("#shareDlg").hidden`)) && b.errors.length === 0);
  ok("share sheet: no console errors, no network, no alerts", b.errors.length === 0 && b.requests.length === 0 && (await b.ev("window.__alerts")) === 0, [...b.errors, ...b.requests].join(" | ").slice(0, 300));
  await b.close();
}

// 2. tricky and very long names: drawn as text only, nothing injected, still one picture each
{
  const b = await open({ width: 1280, height: 800 });
  await go(b, PAGE + "#mode=files");
  const NAMES = [`<img src=x onerror=alert(1)>`, "<script>alert(2)</script>", "‮evil‬ rtl\u0007bell", "x".repeat(200),
    "Super Mega Ultra Extra Long Rainbow Volcano Fizz With Sprinkles And Everything On Top", "🍓🍦 Party! 🎉 Ñandú Größe"];
  let n = 0;
  for (const nm of NAMES) {
    await b.ev(`DrinkMixer.setOrder(${JSON.stringify(SIMPLE)})`); await serveNow(b, false);
    await b.ev(`(()=>{window.__shared=[];const f=document.querySelector("#nameIn");f.value=${JSON.stringify(nm)};f.dispatchEvent(new Event("input",{bubbles:true}));})()`);
    await press(b, "[data-act=share]", false);
    const okk = await waitFor(b, "window.__shared.length===1");
    const info = okk && await b.ev(INFO("window.__shared[0].files[0]"));
    const r = await b.ev(`({imgs:document.querySelectorAll("#app img,#app script,#shareDlg script").length,alerts:window.__alerts,title:window.__shared[0]&&window.__shared[0].title})`);
    ok(`tricky name ${JSON.stringify(nm.slice(0, 30))}: one PNG, nothing injected, title is the cleaned name`, pngOk(info) && r.imgs === 0 && r.alerts === 0 && r.title === (await b.ev(`cleanName(${JSON.stringify(nm)})`)), JSON.stringify(r));
    if (n === 0 || n === 3 || n === 4) save(info, `sharepic_name${n}.png`);
    n++;
    await press(b, "[data-act=tweak]", false);
  }
  // a very long generated / untrusted title straight into the drawing (bypassing the 32-character name cap)
  const info = await b.ev(INFO(`await DrinkMixer.picture(${JSON.stringify(SIMPLE)},"W".repeat(500)+"\\u0000\\u202E")`));
  ok("picture: a 500-character title still gives a normal PNG (length capped)", pngOk(info));
  save(info, "sharepic_500w.png");
  ok("tricky names: no console errors, no network, no alerts", b.errors.length === 0 && b.requests.length === 0 && (await b.ev("window.__alerts")) === 0, [...b.errors, ...b.requests].join(" | ").slice(0, 300));
  await b.close();
}

// 3. no file sharing: link share then the dialog offers the picture; no share at all: the dialog; SAVE PICTURE works
for (const mode of ["link", "none"]) {
  const b = await open({ width: 360, height: 740, touch: true });
  await go(b, PAGE + "?r=" + mode + "#mode=" + mode); await b.ev(`DrinkMixer.setOrder(${JSON.stringify(SIMPLE)})`); await serveNow(b, true);
  await press(b, "[data-act=share]", true);
  const want = await b.ev(`DrinkMixer.link(${JSON.stringify(SIMPLE)},"")`);
  ok(`fallback (${mode}): dialog opens with the link` + (mode === "link" ? " after navigator.share got the link (no files)" : ""), await waitFor(b, `!document.querySelector("#shareDlg").hidden`) &&
    (await b.ev(`document.querySelector("#shareUrl").value`)) === want &&
    (mode === "none" || await b.ev(`window.__shared.length===1&&!window.__shared[0].files&&window.__shared[0].url===${JSON.stringify(want)}`)));
  ok(`fallback (${mode}): picture preview shown`, await waitFor(b, `(()=>{const i=document.querySelector("#sharePic");return !i.hidden&&i.complete&&i.naturalWidth===1080;})()`));
  await press(b, "#picBtn", true);
  ok(`fallback (${mode}): SAVE PICTURE downloads drink.png`, await waitFor(b, "window.__dl.length===1") && (await b.ev(`window.__dl[0].name==="drink.png"&&window.__dl[0].href.startsWith("blob:")`)));
  ok(`fallback (${mode}): the download link is the picture's blob URL`, await b.ev(`sharePic.url===window.__dl[0].href`));
  const info = await b.ev(INFO(`sharePic.blob`)); // (fetch() of a blob: URL is refused from file:// pages)
  ok(`fallback (${mode}): the download is the PNG (1080x1350)`, pngOk(info), JSON.stringify({ ...info, b64: undefined }));
  ok(`fallback (${mode}): says Picture saved!`, (await b.ev(`document.querySelector("#copyMsg").textContent`)) === "Picture saved!");
  await b.shot(join(SHOTS, `sharepic_dialog_${mode}_phone.png`));
  ok(`fallback (${mode}): no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" | ").slice(0, 300));
  await b.close();
}

// 4. layout: served screen, recipe card and share dialog at every size, text size 0.8 and 1.8, in every language
const SIZES = { phone: [360, 740, true], small: [320, 568, true], land: [740, 360, true], tablet: [820, 1180, true], desktop: [1280, 800, false] };
const LANGS = [["en", "en-US"], ["es", "es-ES"], ["de", "de-DE"]];
const DLG = `(()=>{const bx=document.querySelector(".share-box").getBoundingClientRect(),bar=document.querySelector("#l102bar").getBoundingClientRect(),out={};
  out.inView=bx.top>=bar.bottom-.5&&bx.bottom<=innerHeight+1&&bx.left>=-1&&bx.right<=innerWidth+1;
  out.small=[];out.clipped=[];out.overlap=[];const bs=[...document.querySelectorAll(".share-box button")];
  bs.forEach(e=>{const r=e.getBoundingClientRect();if(r.width<43.5||r.height<43.5)out.small.push(e.id+" "+Math.round(r.width)+"x"+Math.round(r.height));
    if(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)out.clipped.push(e.id);});
  for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i].getBoundingClientRect(),c=bs[j].getBoundingClientRect();if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1)out.overlap.push(bs[i].id+"/"+bs[j].id);}
  const sb=document.querySelector(".share-box");out.reach=sb.scrollHeight<=sb.clientHeight+1||getComputedStyle(sb).overflowY==="auto";
  out.texts=bs.map(e=>e.textContent);out.overflowX=document.documentElement.scrollWidth>innerWidth+1;return out;})()`;
const bad = r => r.small.length || r.clipped.length || r.overflowX || r.pageScroll || !r.machineFits || !r.barOneRow || r.broken.length;
for (const [lang, os] of LANGS) for (const [v, [W, H, touch]] of Object.entries(SIZES)) {
  if (lang !== "en" && v !== "phone" && v !== "small") continue; // languages: the narrow screens are where long words break
  const b = await open({ width: W, height: H, touch, lang: os });
  await go(b, PAGE); await b.ev(`localStorage.clear()`);
  for (const fs of [0.8, 1.8]) {
    const tag = `${lang} ${v} fs${fs}`;
    await go(b, PAGE + "?r=" + fs + "#mode=none"); await b.ev(`L102.setFs(${fs});DrinkMixer.setOrder(${JSON.stringify(SIMPLE)})`); await sleep(500);
    await serveNow(b, touch);
    let r = await b.ev(LAYOUT);
    ok(`${tag}: served screen layout OK`, !bad(r), JSON.stringify(r).slice(0, 300));
    await press(b, "[data-act=save]", touch);
    await press(b, "[data-act=share]", touch);
    await waitFor(b, `!document.querySelector("#shareDlg").hidden`); await sleep(400);
    let d = await b.ev(DLG);
    const tr = await b.ev(`[i18n("copy"),i18n("picBtn"),i18n("close")]`);
    ok(`${tag}: share dialog fits, buttons >= 44px, no clipped / overlapping buttons, translated`, d.inView && d.reach && !d.small.length && !d.clipped.length && !d.overlap.length && !d.overflowX && JSON.stringify(d.texts) === JSON.stringify(tr) && (lang === "en" || tr[1] !== "SAVE PICTURE"), JSON.stringify(d).slice(0, 300));
    await press(b, "#picBtn", touch);
    ok(`${tag}: SAVE PICTURE works`, await waitFor(b, "window.__dl.length>0"));
    if (fs > 1 || v === "phone") await b.shot(join(SHOTS, `sharepic_dialog_${lang}_${v}_fs${String(fs).replace(".", "")}.png`));
    await press(b, "#shareClose", touch);
    // recipe card
    await press(b, "#invBtn", touch); await sleep(500); await press(b, "#invSpacer [data-inv]", touch); await sleep(300);
    r = await b.ev(LAYOUT);
    const card = await b.ev(`(()=>{const s=document.querySelector("[data-iact=share]").getBoundingClientRect();const box=document.querySelector(".inv-box").getBoundingClientRect();return s.width>=44&&s.height>=44&&s.left>=box.left-1&&s.right<=box.right+1;})()`);
    ok(`${tag}: recipe card layout OK, SHARE button inside the card`, card && !r.small.length && !r.clipped.length && !r.overflowX && !r.broken.length && r.underBar, JSON.stringify(r).slice(0, 300));
    await press(b, "[data-iact=share]", touch);
    await waitFor(b, `!document.querySelector("#shareDlg").hidden`); await sleep(300);
    d = await b.ev(DLG);
    ok(`${tag}: share dialog from the recipe card fits`, d.inView && !d.small.length && !d.clipped.length && !d.overlap.length, JSON.stringify(d).slice(0, 300));
    if (fs > 1 && lang === "en") await b.shot(join(SHOTS, `sharepic_card_dialog_${v}_fs18.png`));
    await press(b, "#shareClose", touch);
    if (fs > 1 && lang === "en") await b.shot(join(SHOTS, `sharepic_card_${v}_fs18.png`));
    await b.ev(`localStorage.removeItem("fw.inv")`);
  }
  ok(`${lang} ${(Object.keys(SIZES).find(k => SIZES[k][0] === W && SIZES[k][1] === H))}: no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" | ").slice(0, 300));
  await b.close();
}
process.exit(summary() ? 1 : 0);
