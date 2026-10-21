// Drink Mixer: every ingredient and every amount visible in the drink.
// Usage (from the repo root): node tests/drinkmixer/visuals.mjs [sheets]   ("sheets" = only write the contact sheets)
// - contact sheets (one per option dimension) in scratch/screenshots/drinkmixer/sheet_*.png: LOOK at them
// - distinctness: recipes that differ only in one option render differently; more = more drawn elements
// - nothing hidden: in "everything" drinks, removing any one item's elements changes the thumbnail's pixels
// - worst case: everything picked renders without errors, pours in reasonable time, links stay short and exact
// - collection: 1,000 "everything" drinks scroll smoothly
import { pageUrl, shotsDir, sleep, checker } from "../lib/cdp.mjs";
import { launch, watchdog } from "./guard.mjs";
import { join } from "node:path";
watchdog(20);
const PAGE = pageUrl("drinkmixer"), SHOTS = shotsDir("drinkmixer");
const { ok, summary } = checker();
const onlySheets = process.argv[2] === "sheets";

// helpers installed in the page: recipe builders, rasteriser, element counts
const HELPERS = `(()=>{
  window.V={};
  V.base=(pid)=>{const o=freshState(pid);o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).slice(0,2).map(f=>f.id);o.sugar=0;o.ice=pid==="hotchoc"||PRODUCTS[pid].soft?0:2;return o;};
  V.code=(pid,ch)=>{const o=V.base(pid);ch&&ch(o);return encode(o);};
  V.all=(pid)=>{const o=freshState(pid);o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).map(f=>f.id);o.toppings=TOPPINGS.filter(t=>allowedTo(t,o)).map(t=>t.id);
    o.boosts=BOOSTS.map(b=>b.id);o.sweet=SWEETENERS.map(x=>x[0]).join(",");o.sugar=5;o.sour=3;o.spicy=4;o.salty=2;o.popc=2;o.l2=5;o.rim="rainbow";o.straw="stripe";o.ice=5;o.mix="layers";return o;};
  V.svg=(code,drop)=>{if(!thumbHold.isConnected)document.body.appendChild(thumbHold);const svg=thumbSVG(decode(code));if(drop)svg.querySelectorAll('[data-item="'+drop+'"]').forEach(e=>e.remove());return svg;};
  V.url=svg=>"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(svg));
  V.px=async(svg,W)=>{const im=new Image();im.src=V.url(svg);await im.decode();const c=document.createElement("canvas");c.width=W;c.height=Math.round(W*290/212); // same frame as the collection
    const x=c.getContext("2d");x.drawImage(im,0,0,c.width,c.height);return x.getImageData(0,0,c.width,c.height).data;};
  V.diff=(A,B,step)=>{step=step||60;let d=0;for(let i=0;i<A.length;i+=4)if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>step)d++;return d/(A.length/4);};
  V.count=(code,key)=>V.svg(code).querySelectorAll('[data-item="'+key+'"]').length;
  return 1;})()`;

const b = await launch({ url: PAGE, width: 1280, height: 900 });
await b.ev(HELPERS);

// ---------- contact sheets ----------
async function sheet(name, items, cols = 8) {
  // items: [{label, code}] -> a grid of thumbnails with captions, screenshotted
  const h = await b.ev(`(()=>{const items=${JSON.stringify(items)};document.body.style.cssText="overflow:visible;background:#1d1446;height:auto";
    document.body.innerHTML="";document.body.appendChild(thumbHold);document.body.innerHTML+='<div id="sheet" style="display:grid;grid-template-columns:repeat(${cols},150px);gap:6px;padding:8px;font:600 11px system-ui;color:#fff">'+
      items.map(it=>'<figure style="margin:0;background:#3d1f94;border-radius:10px;padding:2px;text-align:center"><img style="width:146px;height:200px" src="'+thumbURL(it.code)+'"><figcaption style="padding:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></figcaption></figure>').join("")+'</div>';
    [...document.querySelectorAll("figcaption")].forEach((f,i)=>f.textContent=items[i].label);document.body.appendChild(thumbHold);return document.querySelector("#sheet").getBoundingClientRect().height+20;})()`);
  await sleep(400);
  const W = cols * 156 + 16;
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: Math.ceil(h), deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await b.shot(join(SHOTS, "sheet_" + name + ".png"));
}
const sweeteners = await b.ev(`SWEETENERS.map(x=>x[0])`), boosts = await b.ev(`BOOSTS.map(x=>x.id)`), products = await b.ev("PRODUCT_ORDER");
const toppings = await b.ev(`TOPPINGS.map(t=>({id:t.id,kind:t.kind,p:PRODUCT_ORDER.find(p=>allowedTo(t,freshState(p))&&!PRODUCTS[p].soft)||PRODUCT_ORDER.find(p=>allowedTo(t,freshState(p)))}))`);
const C = (pid, js) => b.ev(`V.code(${JSON.stringify(pid)},o=>{${js}})`);
const L = async (arr) => { const out = []; for (const [label, pid, js] of arr) out.push({ label, code: await C(pid, js) }); return out; };

await sheet("sweeteners", await L([...sweeteners.map(s => [s + " 3", "lemonade", `o.sweet="${s}";o.sugar=3`]), ...[0, 1, 3, 5].map(l => ["honey " + l, "lemonade", `o.sweet="honey";o.sugar=${l}`]),
  ...[1, 5].map(l => ["sugar " + l, "soda", `o.sweet="sugar";o.sugar=${l}`]), ["all 5", "soda", `o.sweet="${sweeteners.join(",")}";o.sugar=5`], ["soft all 4", "soft", `o.sweet="${sweeteners.join(",")}";o.sugar=4`]]));
await sheet("boosts_light", await L(boosts.map(x => [x, "lemonade", `o.flavours=["lemon"];o.boosts=["${x}"]`])));
await sheet("boosts_dark", await L([...boosts.map(x => [x, "soda", `o.flavours=["cola"];o.boosts=["${x}"]`]), ["all boosts", "soda", `o.boosts=BOOSTS.map(b=>b.id)`], ["all (soft)", "soft", `o.boosts=BOOSTS.map(b=>b.id)`]]));
await sheet("scoops", await L([...toppings.filter(t => t.kind === "scoop").map(t => [t.id, "soda", `o.flavours=["cola"];o.toppings=["${t.id}"]`]), ["3 scoops", "soda", `o.flavours=["cola"];o.toppings=["scoop_van","scoop_str","scoop_mango"]`], ["all scoops", "smoothie", `o.toppings=TOPPINGS.filter(t=>t.kind==="scoop"&&allowedTo(t,o)).map(t=>t.id)`], ["all scoops boba", "boba", `o.toppings=TOPPINGS.filter(t=>t.kind==="scoop"&&allowedTo(t,o)).map(t=>t.id)`]]));
await sheet("toppings", await L(toppings.filter(t => t.kind !== "scoop").map(t => [t.id, t.p, `o.toppings=["${t.id}"]`])), 10);
await sheet("crazy", await L([...toppings.filter(t => t.kind === "crazy").map(t => [t.id, "soda", `o.toppings=["${t.id}"]`]), ["all crazy", "soda", `o.toppings=TOPPINGS.filter(t=>t.kind==="crazy").map(t=>t.id)`], ["all crazy soft", "soft", `o.toppings=TOPPINGS.filter(t=>t.kind==="crazy"&&allowedTo(t,o)).map(t=>t.id)`]]));
await sheet("tastes", await L([...[0, 1, 2, 3].map(l => ["sour " + l, "lemonade", `o.sour=${l}`]), ...[1, 2, 3, 4].map(l => ["spicy " + l, "soda", `o.spicy=${l}`]), ...[1, 2].map(l => ["salty " + l, "juice", `o.salty=${l}`]), ...[1, 2].map(l => ["popping " + l, "soda", `o.popc=${l}`]), ["all max (soft)", "soft", "o.sour=3;o.spicy=4;o.salty=2;o.popc=2"]]));
await sheet("options", await L([...(await b.ev("BASES.map(x=>x[0])")).map(x => ["base " + x, "boba", `o.base="${x}"`]), ...(await b.ev("MIXES.map(x=>x[0])")).map(x => ["mix " + x, "soda", `o.flavours=["cherry","lime","blueberry"];o.mix="${x}"`]),
  ...(await b.ev("ICE_TYPES.map(x=>x[0])")).map(x => ["ice " + x, "icedtea", `o.iceType="${x}";o.l2=4`]), ...[0, 2, 5].map(l => ["fizz " + l, "soda", `o.l2=${l}`]), ...(await b.ev("RIMS.map(x=>x[0])")).map(x => ["rim " + x, "lemonade", `o.rim="${x}"`]),
  ...(await b.ev("STRAWS.map(x=>x[0])")).map(x => ["straw " + x, "juice", `o.straw="${x}"`]), ...["S", "M", "L", "XL"].map(x => ["size " + x, "soda", `o.size="${x}"`]), ...["cone", "waffle", "choco", "cup"].map(x => ["soft " + x, "soft", `o.size="${x}"`])]), 10);
await sheet("many_flavours", await L([[ "soda all", "soda", `o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).map(f=>f.id)`], ["shake all blend", "shake", `o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).map(f=>f.id);o.mix="blend"`],
  ["soft all", "soft", `o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).map(f=>f.id)`], ...[1, 2, 3, 4, 6, 9].map(nf => ["soft " + nf + " fl l2=1", "soft", `o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).slice(0,${nf}).map(f=>f.id);o.l2=1`])]));
const everything = []; for (const p of products) everything.push({ label: "everything " + p, code: await b.ev(`encode(V.all(${JSON.stringify(p)}))`) });
await sheet("everything", everything, 7);
if (onlySheets) { await b.close(); process.exit(0); }

// ---------- distinctness: one option changes, the picture changes; more = more ----------
const dist = await b.ev(`(async()=>{const W=120, out=[], px=async c=>V.px(V.svg(c),W);
  const minPair=async(codes)=>{const P=[];for(const c of codes)P.push(await px(c));let min=1,at="";for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const d=V.diff(P[i],P[j]);if(d<min){min=d;at=i+"/"+j;}}return{min:+min.toFixed(4),at};};
  const C=(pid,f)=>V.code(pid,f);
  const dims={
    sweetener:SWEETENERS.map(x=>C("lemonade",o=>{o.flavours=["lemon"];o.sweet=x[0];o.sugar=3;})),
    boost:BOOSTS.map(x=>C("lemonade",o=>{o.flavours=["lemon"];o.boosts=[x.id];})),
    boostDark:BOOSTS.map(x=>C("soda",o=>{o.flavours=["cola"];o.boosts=[x.id];})),
    scoop:TOPPINGS.filter(t=>t.kind==="scoop").map(t=>C("soda",o=>{o.flavours=["cola"];o.toppings=[t.id];})),
    sour:[0,1,2,3].map(l=>C("lemonade",o=>{o.sour=l;})), spicy:[0,1,2,3,4].map(l=>C("soda",o=>{o.spicy=l;})),
    salty:[0,1,2].map(l=>C("juice",o=>{o.salty=l;})), popping:[0,1,2].map(l=>C("soda",o=>{o.popc=l;})),
    base:BASES.map(x=>C("boba",o=>{o.base=x[0];o.ice=0;})), mix:MIXES.map(x=>C("soda",o=>{o.flavours=["cherry","lime","blueberry"];o.mix=x[0];})),
    iceShape:ICE_TYPES.map(x=>C("icedtea",o=>{o.iceType=x[0];o.l2=4;})), fizz:[0,1,2,3,4,5].map(l=>C("soda",o=>{o.l2=l;})),
    rim:RIMS.map(x=>C("lemonade",o=>{o.rim=x[0];})), straw:STRAWS.map(x=>C("juice",o=>{o.straw=x[0];})),
    size:SIZES.drink.map(x=>C("soda",o=>{o.size=x[0];})), cone:SIZES.soft.map(x=>C("soft",o=>{o.size=x[0];})),
    treat:PRODUCT_ORDER.map(p=>C(p,()=>{}))};
  for(const k in dims)out.push({k,...await minPair(dims[k]),n:dims[k].length});
  // amounts: more = more drawn elements
  const amt=[];
  for(const sw of SWEETENERS.map(x=>x[0])){const c=[1,3,5].map(l=>V.count(C("lemonade",o=>{o.sweet=sw;o.sugar=l;}),"sw:"+sw));amt.push({k:"sugar "+sw,c,ok:c[0]>0&&c[0]<c[1]&&c[1]<c[2]});}
  for(const [k,lv,pid] of [["sour",[1,2,3],"lemonade"],["spicy",[1,2,4],"soda"],["salty",[1,2],"juice"],["popc",[1,2],"soda"]]){const c=lv.map(l=>V.count(C(pid,o=>{o[k]=l;}),"ta:"+k));amt.push({k,c,ok:c.every((v,i)=>v>0&&(!i||v>c[i-1]))});}
  // every topping changes the picture of its drink
  const top=[];for(const t of TOPPINGS){const pid=PRODUCT_ORDER.find(p=>!PRODUCTS[p].soft&&allowedTo(t,freshState(p)))||"soft";
    const a=await px(C(pid,()=>{})), b2=await px(C(pid,o=>{o.toppings=[t.id];}));top.push({id:t.id,pid,d:+V.diff(a,b2).toFixed(4)});}
  return{out,amt,top};})()`);
for (const d of dist.out) ok(`distinct ${d.k}: every option (${d.n}) looks different (closest pair ${d.at}: ${(d.min * 100).toFixed(2)}% of pixels)`, d.min > 0.0025, JSON.stringify(d));
for (const a of dist.amt) ok(`amount ${a.k}: more = more drawn (${a.c.join(" < ")})`, a.ok);
const weakTop = dist.top.filter(t => t.d < 0.004);
ok(`every topping (${dist.top.length}) visibly changes its drink`, weakTop.length === 0, weakTop.map(t => t.id + "@" + t.pid + "=" + t.d).join(", "));

// ---------- nothing hidden ----------
// a loaded drink (12 toppings, 4 boosts, 2 sweeteners, tastes): every item clearly visible (>= 0.08% of the thumbnail);
// "everything" drinks (dozens of items in one glass): no item fully covered (at least a few pixels of it show)
const LOADED = { soda: "o.flavours=['cherry','lime','blueberry'];o.toppings=['whipped','sprinkles','cherry','gummy','f_straw','marsh','sauce_choc','stars','wafer','lemon','goldfish','duck'];o.boosts=['vitc','vitd','iron','calcium'];o.sweet='sugar,honey';o.sugar=3;o.sour=2;o.spicy=2",
  boba: "o.flavours=['taro','mango','strawmilk'];o.toppings=['tapioca','popmango','lychee','foam','f_mango','scoop_ube','hearts','sauce_car','candycane','eyes','octopus'];o.boosts=['b12','protein','probio','chia'];o.sweet='honey,stevia';o.sugar=4;o.salty=1;o.popc=1",
  soft: "o.flavours=['vanilla','strawberry','chocolate'];o.toppings=['whipped','sprinkles','cherry','wafer','sauce_choc','gummy','f_blue','macaron','crown','dino'];o.boosts=['vitc','multi','iron','omega'];o.sweet='sugar,candy';o.sugar=3;o.sour=1" };
for (const [pid, js] of Object.entries(LOADED)) {
  const r = await b.ev(`(async()=>{const W=150, code=V.code(${JSON.stringify(pid)},o=>{${js}}), svg=V.svg(code), base=await V.px(svg,W);
    const keys=[...new Set([...svg.querySelectorAll("[data-item]")].map(e=>e.dataset.item))].filter(k=>/^(to|bo|sw|ta):/.test(k)), weak=[];
    for(const k of keys){const c=svg.cloneNode(true);c.querySelectorAll('[data-item="'+k+'"]').forEach(e=>e.remove());const d=V.diff(base,await V.px(c,W));if(d<0.0008)weak.push(k+"="+(d*100).toFixed(2)+"%");}
    return{n:keys.length,weak};})()`);
  ok(`loaded ${pid}: all ${r.n} items clearly visible at thumbnail size`, r.weak.length === 0, r.weak.join(", "));
}
for (const pid of ["soda", "boba", "shake", "smoothie", "hotchoc", "soft"]) {
  const r = await b.ev(`(async()=>{const W=150, code=encode(V.all(${JSON.stringify(pid)})), svg=V.svg(code), base=await V.px(svg,W);
    const keys=[...new Set([...svg.querySelectorAll("[data-item]")].map(e=>e.dataset.item))].filter(k=>/^(to|bo|sw|ta):/.test(k)), weak=[];
    for(const k of keys){const c=svg.cloneNode(true);c.querySelectorAll('[data-item="'+k+'"]').forEach(e=>e.remove());const d=V.diff(base,await V.px(c,W),30);if(d<0.00005)weak.push(k+"="+(d*100).toFixed(3)+"%");}
    const want=decode(code), missing=[...want.toppings.map(x=>"to:"+x),...want.boosts.map(x=>"bo:"+x),...sweetList(want).map(x=>"sw:"+x),"ta:sour","ta:spicy","ta:salty","ta:popc"].filter(k=>!keys.includes(k));
    return{n:keys.length,weak,missing};})()`);
  ok(`everything ${pid}: all ${r.n} items drawn (toppings, boosts, sweeteners, tastes)`, r.missing.length === 0, r.missing.join(", "));
  ok(`everything ${pid}: no item fully covered (removing any one of them changes the picture)`, r.weak.length === 0, r.weak.slice(0, 12).join(", "));
}

// ---------- worst case: every option at max / everything picked ----------
const worst = await b.ev(`(()=>{const out=[];for(const pid of PRODUCT_ORDER){const o=V.all(pid), t0=performance.now(), g=document.createElementNS(NS,"g");
    const sc=buildScene(o,g,{});for(let T=0;T<sc.duration+.5;T+=.5)sc.update(T,T);sc.update(Infinity,2);const ms=performance.now()-t0;
    const txt=drinkName(o)+recipeLines(o)+sc.events.map(e=>e.label).join("|");
    out.push({pid,dur:+sc.duration.toFixed(1),ev:sc.events.length,nodes:g.querySelectorAll("*").length,ms:Math.round(ms),bad:/undefined|NaN|null/.test(txt)});}return out;})()`);
ok(`worst case: every treat with everything renders, pour <= 20 s, checklist <= 40 lines, no "undefined"`, worst.every(w => w.dur <= 20 && w.ev <= 40 && !w.bad && w.nodes < 6000), JSON.stringify(worst));
const links = await b.ev(`(()=>{const name="🍓🍦🎉🧁🍭🍫🥤🍒🍌🍍🥝🍉🍇🍋🍊🍑🥥🍯🧋🍮🍪🍩🍰🎂🌈⭐💖✨🌟🔥💥🎈";const out=[];
  for(const pid of PRODUCT_ORDER){const o=V.all(pid);for(const mode of ["picked in list order","picked in a scrambled order"]){const oo=decode(encode(o));if(mode!=="picked in list order")oo.flavours=oo.flavours.map((f,i)=>[f,(i*37)%101]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
    const url=SHARE_BASE+"?d="+packLink(oo,name), back=readLink(url.split("?d=")[1]);
    out.push({pid,mode,len:url.length,exact:!!back&&encode(back.order)===encode(oo)&&back.name===cleanName(name)});}}
  const mixed=SHARE_BASE+"?d="+packLink(V.all("soft"),"Mega Fizz 🍓 Nr. 5 — ¡Olé! Größe ~");return{out,mixed:mixed.length,mixedBack:readLink(mixed.split("?d=")[1]).name};})()`);
ok(`links: "everything" + a 32-emoji name stays under 300 characters for every treat, in any pick order (max ${Math.max(...links.out.map(l => l.len))})`, links.out.every(l => l.len < 300), JSON.stringify(links.out.filter(l => l.len >= 300)));
ok(`links: "everything" round trips exactly (recipe and name)`, links.out.every(l => l.exact), JSON.stringify(links.out.filter(l => !l.exact)));
ok("links: names with accents / punctuation / emoji survive (cut to 32 characters)", links.mixedBack === "Mega Fizz 🍓 Nr. 5 — ¡Olé! Größe", links.mixedBack);
await b.close();

// ---------- collection: 1,000 "everything" drinks ----------
{
  const c = await launch({ url: PAGE, width: 360, height: 740, touch: true });
  await c.ev(HELPERS);
  await c.ev(`(()=>{Inv.items=[];Inv.serial=0;for(let i=0;i<1000;i++){const o=V.all(PRODUCT_ORDER[i%PRODUCT_ORDER.length]);Inv.serial++;Inv.items.push([encode(o),Math.floor(Date.now()/1000)-i,Inv.serial]);}Inv.persist();paintInvCount();document.querySelector("#invBtn").click();return Inv.items.length;})()`);
  await sleep(600);
  const fling = () => c.ev(`new Promise(res=>{const sc=document.querySelector("#invScroll");const max=sc.scrollHeight-sc.clientHeight;let i=0,last=performance.now(),worst=0;
    function f(now){const dt=now-last;last=now;if(i>2)worst=Math.max(worst,dt);sc.scrollTop=Math.min(max,i*(max/120));i++;if(i<=124)requestAnimationFrame(f);else res({worst:Math.round(worst),cells:document.querySelectorAll("#invSpacer .icell").length});}
    requestAnimationFrame(f);})`);
  let perf = await fling(); if (perf.worst >= 50) { await sleep(1500); perf = await fling(); }
  ok(`collection: 1,000 "everything" drinks, fling worst frame < 50 ms (${perf.worst} ms, ${perf.cells} cells in the page)`, perf.worst < 50 && perf.cells < 80, JSON.stringify(perf));
  let filled = false; for (let i = 0; i < 120 && !filled; i++) { await sleep(250); filled = await c.ev(`document.querySelectorAll("#invSpacer img[data-code]").length===0`); }
  ok("collection: thumbnails of the visible 'everything' drinks fill in at rest", filled);
  await c.shot(join(SHOTS, "visual_collection_everything.png"));
  ok("collection: no console errors", c.errors.length === 0, c.errors.join(" | "));
  await c.close();
}

// ---------- served screen: name, DRINK, SAVE, SHARE above the fold on a phone ----------
for (const [W, H] of [[360, 740], [320, 568]]) for (const lang of ["en-US", "de-DE"]) for (const fs of [1.1, 1.8]) {
  const c = await launch({ url: PAGE, width: W, height: H, touch: true, lang });
  await c.ev(`L102.setFs(${fs})`);
  await c.ev(`DrinkMixer.setOrder("boba|taro,mango|3|3|L|spiral|vitc|tapioca,strawwhip|honey|none|auto|milk|2|cubes|0|0|0|0");document.querySelector("[data-act=pour]").click();document.querySelector("[data-act=skip]").click();`);
  await sleep(1300);
  const r = await c.ev(`(()=>{const w=document.querySelector("#paneWrap").getBoundingClientRect();const inView=s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.top>=w.top-1&&r.bottom<=w.bottom+1&&r.width>0;};
    return{scroll:document.querySelector("#paneWrap").scrollTop,name:inView("#nameIn"),drink:inView("[data-act=drink]"),save:inView("[data-act=save]"),share:inView("[data-act=share]")};})()`);
  const tag = `served ${W}x${H} ${lang} fs ${fs}`;
  ok(`${tag}: name field, DRINK, SAVE and SHARE all visible without scrolling`, r.scroll === 0 && r.name && r.drink && r.save && r.share, JSON.stringify(r));
  await c.shot(join(SHOTS, `visual_served_${W}x${H}_${lang}_fs${String(fs).replace(".", "")}.png`));
  await c.close();
}

process.exit(summary() ? 1 : 0);
