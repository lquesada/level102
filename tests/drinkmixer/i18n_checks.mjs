// In-page checks shared by the drinkmixer tests (strings evaluated inside docs/drinkmixer/index.html).

// Every visible text node / button aria-label in the game (not the shared top bar) that is an English UI or data string
// while the page is in Spanish or German. Words that are the same in both languages (loanwords) are not reported.
export const LEAKS = `(()=>{
  if(LANG==="en")return [];
  const en=new Set(), loc=new Set(), norm=s=>String(s).trim().toLowerCase();
  const vars={n:2,max:4,x:"",p:"",w:"",b:"",a:"",list:"",sw:"",amt:"",pct:false,u:3,no:5};
  for(const k in I18N.en){const v=I18N.en[k];if(typeof v==="string")en.add(norm(v.replace(/<[^>]+>/g,"")));}
  for(const k in I18N[LANG]){const v=I18N[LANG][k];if(typeof v==="string")loc.add(norm(v.replace(/<[^>]+>/g,"")));}
  for(const k in EN_SNAP){const v=EN_SNAP[k];(Array.isArray(v)?v.flat(2):[v]).forEach(s=>typeof s==="string"&&s&&en.add(norm(s)));}
  [...FLAVOURS,...BOOSTS,...TOPPINGS].forEach(x=>{en.add(norm(x.en));loc.add(norm(x.name));});
  PRODUCT_ORDER.forEach(id=>{const p=PRODUCTS[id];[p.name,p.short,p.desc].forEach(s=>loc.add(norm(s)));});
  Object.values(LEVEL2).forEach(L=>{loc.add(norm(L.label));L.names.forEach(s=>loc.add(norm(s)));});
  [SUGAR_NAMES,SOUR,SPICY,SALTY,POPC].forEach(a=>a.forEach(s=>loc.add(norm(s))));
  [BASES,MIXES,ICE_TYPES,SWEETENERS,RIMS,STRAWS,SIZES.drink,SIZES.soft,STEPS,CATS,TOP_CATS].forEach(a=>a.forEach(x=>loc.add(norm(x[1]))));
  const words=/\\b(the|your|and|pick|tap|order|next|pour|saved|save|drink|drinks|flavour|flavours|skip|edit|none|treat|treats|ready|remove|collection|sound)\\b/i;
  const out=[], roots=[document.querySelector("#app"),document.querySelector("#inv")];
  for(const root of roots){if(!root||root.hidden)continue;
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())){const s=n.nodeValue.replace(/\\u00AD/g,"").trim();if(!s||/^[0-9#%·/.,:\\s+\\-]+$/.test(s))continue;
      const el=n.parentElement;if(el.closest("[hidden]")||el.closest("svg"))continue;
      if((en.has(norm(s))&&!loc.has(norm(s)))||words.test(s))out.push(s.slice(0,60));}
    root.querySelectorAll("[aria-label]").forEach(e=>{const s=e.getAttribute("aria-label");if((en.has(norm(s))&&!loc.has(norm(s)))||words.test(s))out.push("aria: "+s.slice(0,60));});
  }
  if(words.test(document.title))out.push("title: "+document.title);
  return [...new Set(out)];
})()`;

// Every I18N key exists in all languages with the same type; every data item has es/de names; nothing in es/de is the
// same as English unless it is listed in SAME_AS_EN (loanwords); every string / template renders without "undefined".
export const AUDIT = `(()=>{
  const out={missing:[],extra:[],type:[],bad:[],same:[],counts:{}}, low=s=>String(s).trim().toLowerCase();
  const vars={n:2,max:4,x:"Xx",p:"Pp",w:"Ww",b:"Bb",a:"Aa",list:"Ll",sw:"Ss",amt:"Am",pct:false,u:3,no:5};
  for(const L of ["es","de"]){
    let n=0;
    for(const k in I18N.en){if(!(k in I18N[L]))out.missing.push(L+":ui."+k);else if(typeof I18N[L][k]!==typeof I18N.en[k])out.type.push(L+":ui."+k);}
    for(const k in I18N[L]){n++;if(!(k in I18N.en))out.extra.push(L+":ui."+k);
      const v=I18N[L][k], r=typeof v==="function"?v(vars):v;if(typeof r!=="string"||!r||/undefined|NaN|null/.test(r))out.bad.push(L+":ui."+k);
      const e=I18N.en[k];if(e!==undefined){const re=typeof e==="function"?e(vars):e;if(low(re)===low(r)&&!SAME_AS_EN[L].includes("ui."+k))out.same.push(L+":ui."+k+"="+r);}}
    const D=DATA_I18N[L], same=(key,a,b)=>{if(a&&low(a)===low(b)&&!SAME_AS_EN[L].includes(key))out.same.push(L+":"+key+"="+a);};
    const need={prod:PRODUCT_ORDER,fl:FLAVOURS.map(f=>f.id),bo:BOOSTS.map(b=>b.id),to:TOPPINGS.map(t=>t.id),base:BASES.map(b=>b[0]),mix:MIXES.map(m=>m[0]),
      ice:ICE_TYPES.map(x=>x[0]),iceadj:ICE_TYPES.map(x=>x[0]),sweet:SWEETENERS.map(x=>x[0]),rim:RIMS.map(x=>x[0]),straw:STRAWS.map(x=>x[0]),
      size:[...SIZES.drink,...SIZES.soft].map(x=>x[0]),step:STEPS.map(x=>x[0]),cat:CATS.map(x=>x[0]),tcat:TOP_CATS.map(x=>x[0]),l2:Object.keys(LEVEL2),mixw:["spiral","ombre","marble"]};
    for(const tab in need)for(const id of need[tab]){const v=D[tab]&&D[tab][id];n++;
      if(v===undefined||v===""&&tab!=="base"||Array.isArray(v)&&v.some(x=>x===undefined))out.missing.push(L+":"+tab+"."+id);}
    for(const tab of ["sugar","sour","spicy","salty","popc"])if(!D[tab]||D[tab].length!==EN_SNAP[tab].length)out.missing.push(L+":"+tab);
    Object.keys(LEVEL2).forEach(k=>{const v=D.l2[k];if(!v||v[1].length!==6)out.missing.push(L+":l2."+k+" names");
      else{same("l2."+k,v[0],EN_SNAP["l2."+k][0]);v[1].forEach((s,i)=>same("l2."+k+"."+i,s,EN_SNAP["l2."+k][1][i]));}});
    PRODUCT_ORDER.forEach(id=>{const v=D.prod[id],e=EN_SNAP["prod."+id];if(v){same("prod."+id,v[0],e[0]);same("prod."+id,v[2],e[2]);if(!["m","f","n"].includes(v[3]))out.missing.push(L+":prod."+id+" gender");}});
    const first=v=>Array.isArray(v)?v[0]:v;
    FLAVOURS.forEach(f=>same("fl."+f.id,first(D.fl[f.id]),f.en));BOOSTS.forEach(b=>same("bo."+b.id,D.bo[b.id],b.en));TOPPINGS.forEach(t=>same("to."+t.id,D.to[t.id],t.en));
    [[BASES,"base"],[MIXES,"mix"],[ICE_TYPES,"ice"],[SWEETENERS,"sweet"],[RIMS,"rim"],[STRAWS,"straw"],[STEPS,"step"],[CATS,"cat"],[TOP_CATS,"tcat"]].forEach(([arr,tab])=>
      arr.forEach((x,i)=>same(tab+"."+x[0],first(D[tab][x[0]]),EN_SNAP[tab][i])));
    SIZES.drink.forEach((x,i)=>same("size."+x[0],D.size[x[0]],EN_SNAP["size.drink"][i]));SIZES.soft.forEach((x,i)=>same("size."+x[0],D.size[x[0]],EN_SNAP["size.soft"][i]));
    ["sugar","sour","spicy","salty","popc"].forEach(tab=>(D[tab]||[]).forEach((s,i)=>same(tab+"."+i,s,EN_SNAP[tab][i])));
    out.counts[L]=n;
  }
  return out;
})()`;

// Layout: no page scroll / overflow, machine fits, game controls >= 44 px (the top bar's own small buttons are exempt),
// no text spilling out of a control, the bar is one row and nothing of the game sits under it.
export const LAYOUT = `(()=>{const out={small:[],clipped:[],overflowX:document.documentElement.scrollWidth>innerWidth+1,
    pageScroll:document.scrollingElement.scrollTop>0||document.scrollingElement.scrollHeight>innerHeight+1};
  const vis=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=="hidden"&&!e.closest("[hidden]")&&r.bottom>0&&r.top<innerHeight;};
  document.querySelectorAll("button").forEach(b=>{if(b.closest("#l102bar")||!vis(b))return;const r=b.getBoundingClientRect();
    if(r.width<43.5||r.height<43.5)out.small.push((b.id||b.className||b.textContent).toString().slice(0,30)+" "+Math.round(r.width)+"x"+Math.round(r.height));});
  document.querySelectorAll(".step,.chip,.card,.seg button,.btn,.pill,.pick,.rline .k,.rline .edit,.pane-title h2,.pane-title .hint,.group h3,.inv-t h2").forEach(e=>{if(!vis(e))return;
    if(e.scrollWidth>e.clientWidth+1)out.clipped.push((e.className+":"+e.textContent).slice(0,40)+" "+e.scrollWidth+">"+e.clientWidth);});
  // words split in the middle (a label narrower than its longest word)
  out.broken=[];const cv=document.createElement("canvas").getContext("2d");
  document.querySelectorAll(".card,.seg button,.chip,.step,.btn,.pick,.rline .k,.pane-title h2,.group h3").forEach(e=>{if(!vis(e))return;
    const cs=getComputedStyle(e), avail=e.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    [...e.querySelectorAll("span:not(.badge):not(.dot):not(.sw):not(.x)")].concat(e.querySelector("span")?[]:[e]).forEach(t=>{const c=getComputedStyle(t);
      cv.font=c.fontWeight+" "+c.fontSize+" "+c.fontFamily;let tx=c.textTransform==="uppercase"?t.textContent.toUpperCase():t.textContent;
      for(const w of tx.split(/[\\s\\-·,/\\u00AD]+/)){const ww=cv.measureText(w).width+(parseFloat(c.letterSpacing)||0)*w.length;if(w&&ww>avail+1)out.broken.push(w+" "+Math.round(ww)+">"+Math.round(avail));}});});
  const bar=document.querySelector("#l102bar"),br=bar.getBoundingClientRect();
  out.barOneRow=br.top===0&&br.height<=36&&[...bar.children].every(c=>{const r=c.getBoundingClientRect();return r.top>=br.top-1&&r.bottom<=br.bottom+1&&r.right<=innerWidth+1;});
  const m=document.querySelector(".machine").getBoundingClientRect();out.machineFits=m.bottom<=innerHeight+1&&m.right<=innerWidth+1;
  out.underBar=m.top>=br.bottom-.5;
  if(!document.querySelector("#inv").hidden)out.underBar=out.underBar&&document.querySelector(".inv-box").getBoundingClientRect().top>=br.bottom-.5;
  return out;})()`;
