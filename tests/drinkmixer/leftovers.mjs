// Drink Mixer: what is left in the glass after DRINK. Edible things and the liquid are eaten, things that only float
// go too (they would hang in mid-air); the straw / cap, the paper umbrella on the rim, googly eyes on the glass, the sea
// star on the wall and the octopus on the bottom stay where they are; picks keep their stick (it slides down and leans
// in the empty glass), the food on them is eaten. Usage (from the repo root): node tests/drinkmixer/leftovers.mjs
// (run_cujs.mjs all runs it too). Screenshots: scratch/screenshots/drinkmixer/leftovers_*.png
import { pageUrl, shotsDir, sleep, checker } from "../lib/cdp.mjs";
import { launch, watchdog } from "./guard.mjs";
import { join } from "node:path";
watchdog(8);
const PAGE = pageUrl("drinkmixer"), SHOTS = shotsDir("drinkmixer");
const { ok, summary } = checker();

// in-page helpers: build an order, serve it, read where every item is (in the cup's own coordinates)
const HELPERS = `(()=>{window.LO={};
  LO.make=(pid,tops,ch)=>{const o=freshState(pid);o.flavours=FLAVOURS.filter(f=>allowedFl(f,o)).slice(0,2).map(f=>f.id);
    o.toppings=tops.filter(id=>TO[id]&&allowedTo(TOPPINGS.find(t=>t.id===id),o));ch&&ch(o);return o;};
  LO.serve=(o)=>{DrinkMixer.setOrder(encode(o));document.querySelector("[data-act=pour]").click();document.querySelector("[data-act=skip]").click();return o.toppings;};
  LO.cup=()=>{const d=document.querySelector("#dyn");return [...d.children].find(g=>g.querySelector("[data-item]"));};
  LO.items=()=>{const cup=LO.cup(), inv=cup.getScreenCTM().inverse(), out={};
    cup.querySelectorAll("[data-item]").forEach(e=>{const k=e.getAttribute("data-item");if(out[k])return;
      const m=inv.multiply(e.getScreenCTM()), b=e.getBBox(), kept=e.closest("[data-keep]");
      const op=+getComputedStyle(e).opacity*(+(e.getAttribute("opacity")||1));
      out[k]={kept:!!kept, keepSelf:e.hasAttribute("data-keep"), masked:!!e.closest("[mask]"), m:[m.a,m.b,m.c,m.d,m.e,m.f].map(v=>+v.toFixed(2)),
        bb:[b.x,b.y,b.width,b.height].map(v=>+v.toFixed(1)), op,
        foot:(()=>{const p=new DOMPoint(0,0).matrixTransform(m);return[+p.x.toFixed(1),+p.y.toFixed(1)];})(),
        food:[...e.querySelectorAll("*")].filter(c=>c.hasAttribute("opacity")&&+c.getAttribute("opacity")===0).length};});
    const cp=cup.querySelector("clipPath path"), ib=cp?cp.getBBox():null; // the inside of the glass
    return{items:out, inner:ib&&{top:ib.y,bot:ib.y+ib.height,l:ib.x,r:ib.x+ib.width}};};
  LO.at=(p)=>{outro.dur=1e5;outro.start=performance.now()-outro.dur*1000*p;}; // frozen at p (screenshots take time)
  return 1;})()`;

const DRINK = ["umbrella", "flag", "grapepick", "olive", "lolly", "duck", "goldfish", "octopus", "eyes", "seastar", "planet", "dino", "crown", "f_straw", "lemon", "f_rasp", "cherry"];
const EATEN = ["to:f_straw", "to:lemon", "to:f_rasp", "to:cherry"], FLOATING = ["to:duck", "to:goldfish", "to:planet", "to:dino", "to:crown"];
const STAY = ["straw", "to:umbrella", "to:eyes", "to:seastar"], PICKS = ["to:flag", "to:grapepick", "to:olive", "to:lolly"];
const near = (a, b, d = 0.6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= d);

async function journey(b, tag, pid, tops, ch, touch, shots) {
  await b.ev(HELPERS);
  const picked = await b.ev(`LO.serve(LO.make(${JSON.stringify(pid)},${JSON.stringify(tops)},${ch || "null"}))`);
  await sleep(500);
  const before = await b.ev("LO.items()");
  if (shots) await b.shot(join(SHOTS, `leftovers_${tag}_1before.png`));
  const p = await b.ev(`(()=>{const e=document.querySelector("[data-act=drink]");const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (touch) await b.tap(p.x, p.y); else await b.click(p.x, p.y);
  await sleep(120);
  ok(`${tag}: DRINK starts the drinking animation`, (await b.ev("phase")) === "outro");
  await b.ev("LO.at(.55)"); await sleep(120);
  if (shots) await b.shot(join(SHOTS, `leftovers_${tag}_2drinking.png`));
  await b.ev("LO.at(.8)"); await sleep(60);
  if (shots) await b.shot(join(SHOTS, `leftovers_${tag}_3empty.png`));
  const after = await b.ev("LO.items()");
  return { picked, before, after };
}

const VIEWS = { phone: [360, 740, true], land: [740, 360, true], desktop: [1280, 800, false] };
for (const [vn, [W, H, touch]] of Object.entries(VIEWS)) {
  const b = await launch({ url: PAGE, width: W, height: H, touch });
  await sleep(700);
  // A. a lemonade with a straw, the umbrella, picks, toys and fruit
  const tag = `lemonade_${vn}`;
  const { picked, before, after } = await journey(b, tag, "lemonade", DRINK, `o=>{o.straw="stripe";}`, touch, true);
  const I = after.items, B = before.items, inn = after.inner;
  ok(`${tag}: test drink has every kind of item`, [...STAY, ...PICKS, ...EATEN, ...FLOATING, "to:octopus"].every(k => B[k]), JSON.stringify(picked));
  for (const k of STAY) ok(`${tag}: ${k} is not eaten and stays exactly where it was`, I[k] && I[k].kept && !I[k].masked && near(I[k].m, B[k].m) && near(I[k].bb, B[k].bb) && I[k].op > .9,
    JSON.stringify({ b: B[k] && [B[k].m, B[k].bb], a: I[k] && [I[k].m, I[k].bb, I[k].masked, I[k].op] }));
  for (const k of [...EATEN, ...FLOATING]) ok(`${tag}: ${k} is eaten / goes (masked away)`, I[k] && I[k].masked && !I[k].kept);
  ok(`${tag}: the liquid is eaten`, Object.keys(I).filter(k => k.startsWith("fl:")).every(k => I[k].masked));
  ok(`${tag}: the octopus stays and has sunk to the bottom`, I["to:octopus"].kept && !I["to:octopus"].masked && I["to:octopus"].m[5] >= B["to:octopus"].m[5] - .5 && Math.abs(I["to:octopus"].m[5] + 9 - (inn.bot - 2)) < 6,
    JSON.stringify([B["to:octopus"].m, I["to:octopus"].m, inn]));
  for (const k of PICKS) {
    const f = I[k].foot;
    ok(`${tag}: ${k}: the stick stays, its foot rests on the bottom of the glass (not in mid-air)`, I[k].kept && !I[k].masked && f[1] > inn.bot - 10 && f[1] <= inn.bot + 1 && f[0] > inn.l && f[0] < inn.r, JSON.stringify({ f, inn }));
  }
  ok(`${tag}: the food on the picks is eaten (grapes, olive, lollipop)`, ["to:grapepick", "to:olive", "to:lolly"].every(k => I[k].food >= 2) && I["to:flag"].food === 0,
    JSON.stringify(PICKS.map(k => I[k].food)));
  // a language switch while drinking keeps the animation and the leftovers
  await b.ev("LO.at(.8)");
  await b.ev(`(()=>{const s=document.querySelector("#l102lang");s.value="de";s.dispatchEvent(new Event("change"));})()`); await sleep(60);
  const L = await b.ev("LO.items()");
  ok(`${tag}: switching language while drinking keeps the leftovers`, (await b.ev("phase")) === "outro" && STAY.every(k => L.items[k] && L.items[k].kept && near(L.items[k].m, B[k].m)));
  await b.ev(`(()=>{const s=document.querySelector("#l102lang");s.value="en";s.dispatchEvent(new Event("change"));})()`);
  await b.ev("LO.at(1)"); await sleep(400);
  ok(`${tag}: afterwards a fresh, clean glass`, (await b.ev("phase")) === "choose" && (await b.ev(`!document.querySelector("#dyn [mask]")&&!document.querySelector("#dyn [data-keep][style*=opacity]")`)));
  if (vn === "desktop") {
    // B. with a cream mountain (picks stand in the cream, above the rim) and a cinnamon stick
    let r = await journey(b, "coffee_cream_desktop", "coffee", ["whipped", "cinnamon", "flag", "grapepick", "sauce_car", "sprinkles"], `o=>{o.straw="auto";}`, false, true);
    let I2 = r.after.items, n2 = r.after.inner;
    ok("coffee + cream: the cream, sauce and sprinkles are eaten", ["to:whipped", "to:sauce_car", "to:sprinkles"].every(k => I2[k] && I2[k].masked));
    for (const k of ["to:cinnamon", "to:flag", "to:grapepick"]) ok(`coffee + cream: ${k} slides down from the cream into the glass`, I2[k] && I2[k].kept && I2[k].foot[1] > n2.bot - 10 && I2[k].foot[1] > r.before.items[k].foot[1] + 20, JSON.stringify(I2[k] && [r.before.items[k].foot, I2[k].foot, n2]));
    ok("coffee + cream: the straw stays", I2.straw && I2.straw.kept && near(I2.straw.m, r.before.items.straw.m));
    await b.ev("LO.at(1)"); await sleep(400);
    // C. the sports bottle cap stays on
    r = await journey(b, "sports_cap_desktop", "sports", ["f_lemon", "duck"], `o=>{o.straw="auto";}`, false, true);
    ok("sports bottle: the cap stays on, the rest is drunk", r.after.items.straw && r.after.items.straw.kept && near(r.after.items.straw.m, r.before.items.straw.m) && Object.keys(r.after.items).filter(k => k.startsWith("fl:")).every(k => r.after.items[k].masked));
    await b.ev("LO.at(1)"); await sleep(400);
    // D. soft-serve in a cup: googly eyes on the cup stay; in a cone everything is eaten (the cone too)
    r = await journey(b, "softcup_desktop", "soft", ["eyes", "flag", "sprinkles"], `o=>{o.size="cup";}`, false, true);
    ok("soft-serve cup: googly eyes on the cup stay, the ice cream and the pick in it go", r.after.items["to:eyes"] && r.after.items["to:eyes"].kept && !r.after.items["to:eyes"].masked && r.after.items["to:flag"].masked && r.after.items["to:sprinkles"].masked,
      JSON.stringify(Object.fromEntries(Object.entries(r.after.items).map(([k, v]) => [k, [v.kept, v.masked]]))));
    await b.ev("LO.at(1)"); await sleep(400);
    r = await journey(b, "softcone_desktop", "soft", ["eyes", "flag"], `o=>{o.size="cone";}`, false, false);
    ok("soft-serve cone: nothing is left (no kept items)", Object.values(r.after.items).every(v => !v.kept && v.masked), JSON.stringify(Object.keys(r.after.items)));
    await b.ev("LO.at(1)"); await sleep(400);
  }
  ok(`${vn}: no console errors, no network`, b.errors.length === 0 && b.requests.length === 0, [...b.errors, ...b.requests].join(" ").slice(0, 300));
  await b.close();
}
process.exit(summary() ? 1 : 0);
