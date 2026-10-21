// Renders a recipe for every treat x mix style x ice shape x taste mix with many toppings, checking for errors, and
// writes its name, recipe card and pour checklist in English, Spanish and German (no "undefined" anywhere).
// Usage (from the repo root): node tests/drinkmixer/smoke_all_options.mjs
import { launch } from "./cdp.mjs";
const { ev, close, errors } = await launch({ width: 800, height: 800 });
const r = await ev(`(()=>{const out=[];let i=0;
  for(const pid of PRODUCT_ORDER){const base=freshState(pid);
    const fl=FLAVOURS.filter(f=>allowedFl(f,base)).map(f=>f.id);
    const tl=TOPPINGS.filter(t=>allowedTo(t,base)).map(t=>t.id);
    for(let v=0;v<6;v++){const o=freshState(pid);
      o.flavours=fl.slice(v*3,v*3+maxFl(o)).length?fl.slice(v*3,v*3+maxFl(o)):fl.slice(0,maxFl(o));
      o.mix=o.flavours.length>1?MIXES[v%MIXES.length][0]:"layers";o.iceType=ICE_TYPES[v%ICE_TYPES.length][0];o.ice=v%6;o.l2=Math.max(LEVEL2[PRODUCTS[pid].l2].min,v%6);
      o.sour=v%4;o.spicy=(v+1)%5;o.salty=v%3;o.popc=v%3;o.base=BASES[v%BASES.length][0];o.rim=RIMS[v%RIMS.length][0];o.straw=STRAWS[v%STRAWS.length][0];
      o.sweet=SWEETENERS[v%SWEETENERS.length][0];o.size=(PRODUCTS[pid].soft?SIZES.soft:SIZES.drink)[v%(PRODUCTS[pid].soft?4:4)][0];
      const seen={};o.toppings=[];for(let k=0;k<tl.length&&o.toppings.length<MAX_TO;k++){const t=TO[tl[(k*7+v*5)%tl.length]];if(o.toppings.includes(t.id))continue;if(EXCLUSIVE[t.kind]&&seen[t.kind])continue;seen[t.kind]=1;o.toppings.push(t.id);}
      o.boosts=BOOSTS.slice(v,v+MAX_BO).map(b=>b.id);
      const res=DrinkMixer.renderTest(encode(o));if(res.code!==encode(o))out.push("roundtrip "+encode(o)+" -> "+res.code);i++;
      // the name, the recipe card and the pour checklist in every language
      for(const l of L102.langs){L102.setLang(l);const txt=[drinkName(o),recipeLines(o),buildScene(o,document.createElementNS(NS,"g"),{}).events.map(e=>e.label).join("|")].join(" ");
        if(/undefined|null|NaN|object Object/.test(txt))out.push(l+" text "+encode(o)+": "+txt.slice(0,120));}
      L102.setLang("en");}}
  // every topping icon, flavour icon and product icon renders
  TOPPINGS.forEach(t=>{const h=toppingIcon(t);if(!h||h.indexOf("<svg")<0||h.indexOf("undefined")>=0)out.push("icon "+t.id);});
  PRODUCT_ORDER.forEach(p=>{if(productIcon(p).indexOf("undefined")>=0)out.push("product icon "+p);});
  // soft-serve: every chosen flavour shows on the swirl at every swirl level and cone/cup; creams sit ON the top tier
  const sfl=FLAVOURS.filter(f=>allowedFl(f,freshState("soft"))).map(f=>f.id);let soft=0;
  for(let n=1;n<=4;n++)for(let l2=1;l2<=5;l2++)for(const sz of SIZES.soft.map(x=>x[0]))for(const cream of ["whipped","chocwhip","strawwhip"]){
    const o=freshState("soft");o.l2=l2;o.size=sz;o.flavours=sfl.slice(n*3,n*3+n);o.toppings=[cream];
    const g=document.createElementNS(NS,"g");buildScene(o,g,{}).update(Infinity,0);soft++;
    const tiers=[...g.querySelectorAll('rect[height="24"][rx="12"]')], fills=new Set(tiers.map(r=>r.getAttribute("fill")));
    const want=o.flavours.map(f=>mixCol(FL[f].color,"#fffaf0",PRODUCTS.soft.creamy));
    if(!want.every(c=>fills.has(c)))out.push("soft "+n+" flavours, level "+l2+", "+sz+": only "+fills.size+" colours on the swirl");
    const top=Math.min(...tiers.map(r=>+r.getAttribute("y")));
    const blob=[...g.querySelectorAll('ellipse[data-item="to:'+cream+'"]')].sort((a,b)=>b.getAttribute("cy")-a.getAttribute("cy"))[0];
    const bottom=blob?+blob.getAttribute("cy")+ +blob.getAttribute("ry"):NaN;
    if(!(bottom>=top+1&&bottom<=top+14))out.push("soft "+cream+" level "+l2+" "+sz+": cream bottom "+bottom+" vs swirl top "+top);}
  out.softChecked=soft;
  return{n:i,problems:out,soft};})()`);
console.log("soft-serve swirl/cream checks:", r.soft);
console.log("recipes rendered:", r.n, "problems:", r.problems.length ? r.problems.slice(0, 10).join(" | ") : "none");
console.log("console errors:", errors.length ? errors.slice(0, 8).join(" | ") : "none");
await close();
process.exit(r.problems.length || errors.length ? 1 : 0);
