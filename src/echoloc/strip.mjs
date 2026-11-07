// Echoloc: the published game without the cheat and debug code (Luis, 2026-11-07, version 1.0.1).
// The source keeps everything (cheat sidebar, test levels, labs, review tools); the builds for docs/ and itch.io get only the game.
//
//   node src/echoloc/strip.mjs in.js out.js        (build.py runs it)
//
// How:
//  1. The cheat switches are always off: every read of them becomes `false`.
//  2. A statement, array element or object property right after a /*DEV*/ comment is removed (array elements become null).
//  3. Code that can never run then is folded away (if(false)..., false&&..., false?a:b, !false...).
//  4. Top-level functions and constants that nothing uses any more are removed, again and again until nothing changes.
//  5. Check: the result uses no name the full game does not also take from the browser (a missing function = build error).
import fs from 'node:fs'; import path from 'node:path'; import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const req=createRequire(path.resolve(HERE,'..','..','scratch','echoloc','obf','package.json'));
const acorn=req('acorn'), escope=req('eslint-scope');
export const OFF=['cheatOn','debugView','god','freezeM','mapOn','peek'];   // the cheat switches: never on in the published game

const parse=src=>{ const comments=[]; const ast=acorn.parse(src,{ecmaVersion:2022,sourceType:'module',ranges:true,onComment:comments}); return {ast,comments}; };
const scopes=ast=>escope.analyze(ast,{ecmaVersion:2022,sourceType:'module'});
function walk(n,f,parent,key){ if(!n||typeof n.type!=='string') return; if(f(n,parent,key)===false) return;
  for(const k in n){ if(k==='range'||k==='start'||k==='end'||k==='loc') continue; const v=n[k];
    if(Array.isArray(v)) v.forEach(c=>c&&typeof c.type==='string'&&walk(c,f,n,k)); else if(v&&typeof v.type==='string') walk(v,f,n,k); } }
function apply(src,edits){ edits.sort((a,b)=>a[0]-b[0]||b[1]-a[1]); const keep=[]; let end=-1;   /* outermost edit wins */
  for(const e of edits){ if(e[0]>=end){ keep.push(e); end=e[1]; } else if(e[1]>end) throw new Error('overlapping edits at '+e[0]); }
  let out=''; let p=0; for(const [a,b,r] of keep){ out+=src.slice(p,a)+r; p=b; } return out+src.slice(p); }
const isLit=(n,v)=>n&&n.type==='Literal'&&n.value===v;
const pure=n=>!n||['Literal','FunctionExpression','ArrowFunctionExpression','Identifier','ThisExpression'].includes(n.type)
  ||n.type==='TemplateLiteral'&&n.expressions.every(pure)||n.type==='ArrayExpression'&&n.elements.every(e=>!e||pure(e))
  ||n.type==='ObjectExpression'&&n.properties.every(p=>p.type==='Property'&&!p.computed&&pure(p.value))
  ||n.type==='UnaryExpression'&&pure(n.argument)||n.type==='BinaryExpression'&&pure(n.left)&&pure(n.right);

// 1 + 2: the switches read as false, /*DEV*/ items removed
function stepOff(src){ const {ast,comments}=parse(src), sm=scopes(ast), edits=[];
  const g=sm.globalScope.childScopes[0]; for(const name of OFF){ const v=g.set.get(name); if(!v) continue;
    for(const r of v.references) if(r.isReadOnly()) edits.push([r.identifier.range[0],r.identifier.range[1],'false']); }
  for(const c of comments){ if(c.value.trim()!=='DEV') continue; let best=null;
    walk(ast,(n,parent,key)=>{ if(n.range[0]<c.end) return; if(best) return false; const gap=src.slice(c.end,n.range[0]); if(/\S/.test(gap)) return false; best={n,parent,key}; return false; });
    if(!best) throw new Error('/*DEV*/ marks nothing at '+c.start);
    const {n,parent,key}=best;
    if(/Statement$|Declaration$/.test(n.type)) edits.push([c.start,n.range[1],';']);
    else if(parent&&(parent.type==='ArrayExpression'||(parent.type==='CallExpression'||parent.type==='NewExpression')&&key==='arguments')) edits.push([c.start,n.range[1],'null']);
    else if(n.type==='Property'){ const ps=parent.properties, i=ps.indexOf(n); const b=i<ps.length-1?ps[i+1].range[0]:n.range[1]; edits.push([c.start,b,'']); }
    else throw new Error('/*DEV*/ before a '+n.type+' at '+c.start); }
  return apply(src,edits); }

// 3: code that can never run
function stepFold(src){ const {ast}=parse(src), edits=[];
  walk(ast,(n,parent,key)=>{
    const tf=t=>isLit(t,false)?false:isLit(t,true)?true:t&&t.type==='UnaryExpression'&&t.operator==='!'&&t.argument.type==='Literal'&&typeof t.argument.value==='boolean'?!t.argument.value:null;
    if(n.type==='IfStatement'){ const v=tf(n.test); if(v===null) return;
      const keep=v?n.consequent:n.alternate; edits.push([n.range[0],n.range[1],keep?(keep.type==='BlockStatement'?'{'+src.slice(keep.range[0]+1,keep.range[1]-1)+'}':src.slice(keep.range[0],keep.range[1])):';']); return false; }
    if(n.type==='LogicalExpression'){ const v=tf(n.left); if(v===null) return;
      if(n.operator==='&&'&&!v||n.operator==='||'&&v){ edits.push([n.range[0],n.range[1],String(v)]); return false; }
      if(n.operator==='&&'&&v||n.operator==='||'&&!v){ edits.push([n.range[0],n.range[1],'('+src.slice(n.right.range[0],n.right.range[1])+')']); return false; } }
    if(n.type==='ConditionalExpression'){ const v=tf(n.test); if(v===null) return; const k=v?n.consequent:n.alternate; edits.push([n.range[0],n.range[1],'('+src.slice(k.range[0],k.range[1])+')']); return false; }
    if(n.type==='UnaryExpression'&&n.operator==='!'&&n.argument.type==='Literal'&&typeof n.argument.value==='boolean'){ edits.push([n.range[0],n.range[1],String(!n.argument.value)]); return false; }
    if(n.type==='ExpressionStatement'&&n.expression.type==='Literal'&&typeof n.expression.value==='boolean'&&parent&&parent.type!=='Program'||n.type==='ExpressionStatement'&&n.expression.type==='Literal'&&typeof n.expression.value==='boolean'){ edits.push([n.range[0],n.range[1],';']); return false; }
  });
  return edits.length?apply(src,edits):src; }

// 4: top-level declarations nothing uses
function stepUnused(src){ const {ast}=parse(src), sm=scopes(ast), g=sm.globalScope.childScopes[0], edits=[];
  const owner=new Map();   // top-level declaration node -> its range
  const decls=[];
  for(const st of ast.body){
    if(st.type==='FunctionDeclaration') decls.push({name:st.id.name,range:st.range,stmt:st});
    else if(st.type==='VariableDeclaration') for(const d of st.declarations) if(d.id.type==='Identifier'&&pure(d.init)) decls.push({name:d.id.name,range:d.range,stmt:st,decl:d}); }
  const inside=(pos,r)=>pos>=r[0]&&pos<r[1];
  const removed=[];
  for(const D of decls){ const v=g.set.get(D.name); if(!v) continue;
    const used=v.references.some(r=>{ const p=r.identifier.range[0]; if(inside(p,D.range)) return false; return true; });
    if(!used) removed.push(D); }
  // one pass removes only those not used anywhere else (iterated by the caller)
  for(const D of removed){
    if(D.stmt.type==='FunctionDeclaration'){ edits.push([D.range[0],D.range[1],'']); continue; }
    const ds=D.stmt.declarations; if(ds.length===1){ edits.push([D.stmt.range[0],D.stmt.range[1],';']); continue; }
    const i=ds.indexOf(D.decl); if(i<ds.length-1) edits.push([D.decl.range[0],ds[i+1].range[0],'']); else edits.push([ds[i-1].range[1],D.decl.range[1],'']); }
  // two declarators of the same statement both removed: keep it simple, do them one per round
  const seen=new Set(), safe=[]; for(const e of edits){ const st=removed[edits.indexOf(e)].stmt; if(st.type==='VariableDeclaration'&&st.declarations.length>1){ if(seen.has(st)) continue; seen.add(st); } safe.push(e); }
  return {src:safe.length?apply(src,safe):src, names:removed.slice(0,safe.length).map(d=>d.name)}; }

export function through(src){ const {ast}=parse(src), sm=scopes(ast); return new Set(sm.globalScope.through.map(r=>r.identifier.name)); }

export function strip(full){ let s=stepOff(full); const gone=[];
  for(let k=0;k<60;k++){ const a=s; s=stepFold(s); const r=stepUnused(s); s=r.src; gone.push(...r.names); if(s===a) break; }
  const before=through(full), after=through(s), missing=[...after].filter(n=>!before.has(n));
  if(missing.length) throw new Error('the published game uses names that no longer exist: '+missing.join(', '));
  return {src:s,gone}; }

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const [inp,out]=process.argv.slice(2); const full=fs.readFileSync(inp,'utf8'); const r=strip(full);
  fs.writeFileSync(out,r.src); if(process.env.STRIP_LIST) fs.writeFileSync(process.env.STRIP_LIST,r.gone.sort().join('\n')+'\n');
  console.log(`strip: ${full.length} -> ${r.src.length} bytes, ${r.gone.length} unused declarations removed`); }
// WHY=name1,name2 node strip.mjs in out  -> which top-level code still uses each name in the published game
export function why(src,name){ const {ast}=parse(src), sm=scopes(ast), g=sm.globalScope.childScopes[0], v=g.set.get(name); if(!v) return ['(not declared)'];
  const lineOf=p=>src.slice(0,p).split('\n').length, out=new Set();
  for(const r of v.references){ const p=r.identifier.range[0]; const st=ast.body.find(b=>p>=b.range[0]&&p<b.range[1]); if(!st) continue;
    let nm=st.type==='FunctionDeclaration'?st.id.name:st.type==='VariableDeclaration'?(st.declarations.find(d=>p>=d.range[0]&&p<d.range[1])?.id.name||'?'):'top@'+lineOf(st.range[0]);
    if(nm!==name) out.add(nm); } return [...out]; }
if(process.env.WHY&&process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){ const s=fs.readFileSync(process.argv[3],'utf8'); for(const n of process.env.WHY.split(',')) console.log(n,'<-',why(s,n).join(' ')); }
