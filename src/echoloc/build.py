# builds docs/echoloc/index.html from src/echoloc/src.html: pastes the shared top bar verbatim + the favicon
import urllib.parse,os
t=open('templates/topbar.html').read()
head=t[t.index('<!-- l102-topbar:start'):t.index('<!-- l102-topbar:head-end -->')+len('<!-- l102-topbar:head-end -->')]
body=t[t.index('<!-- BODY part'):t.index('<!-- l102-topbar:end -->')+len('<!-- l102-topbar:end -->')]
icon=open('src/echoloc/icon.svg').read()
fav="data:image/svg+xml,"+urllib.parse.quote(icon,safe=' =:/,;#"()').replace('"','%22').replace('#','%23')
import glob,json as _j
_I={}
for _p in sorted(glob.glob('src/echoloc/i18n/*.json')):
  _c=os.path.basename(_p)[:-5]
  try: _I[_c]=_j.load(open(_p))
  except Exception as e: print('WARNING: skipping',_p,e)
_I=dict([('en',_I.pop('en'))]+sorted(_I.items()))   # English first
_HELP=''.join(f'<div data-lang="{c}">'+_I[c]['help']+'</div>' for c in ('en','es','de') if c in _I)   # the top bar's "?" (level102.com) shows the game's own help text
s=open('src/echoloc/src.html').read().replace('@@HELPTPL@@',_HELP).replace('@@I18N@@',_j.dumps(_I,ensure_ascii=False,separators=(',',':'))).replace('@@TOPBAR_HEAD@@',head).replace('@@TOPBAR_BODY@@',body).replace('@@FAVICON@@',fav)
import os,re;import base64; s=s.replace('@@GLYPHS@@','data:image/png;base64,'+base64.b64encode(open('src/echoloc/glyphs.png','rb').read()).decode())
os.makedirs('docs/echoloc',exist_ok=True)
# keep the link-preview block that tools/make_cards.mjs wrote
try:
  old=open('docs/echoloc/index.html').read();m=re.search(r'<!-- l102-card[\s\S]*?<!-- /l102-card -->',old)
  if m:s=re.sub(r'(<link rel="icon"[^>]*>)',lambda k:k.group(1)+'\n'+m.group(0),s,count=1)
except FileNotFoundError:pass
# docs/ gets the obfuscated game script; the tests and the simulator use the readable copy, because they call the game's functions
import subprocess,json
os.makedirs('scratch/echoloc/plain',exist_ok=True); open('scratch/echoloc/plain/index.html','w').write(s)
# the published game has no cheat or debug code (Luis, 2026-11-07): see src/echoloc/strip.mjs. The full game stays in plain/ for the tests;
# ship/ is the stripped game, readable (the ship tests use it); docs/ and itch.io get the stripped game, obfuscated.
OBF='scratch/echoloc/obf/node_modules/javascript-obfuscator/bin/javascript-obfuscator'
if os.path.exists(OBF):
  s=re.sub(r'/\*DEV\{\*/[\s\S]*?/\*\}DEV\*/','',s); s=re.sub(r'<!--DEV\{-->[\s\S]*?<!--\}DEV-->','',s)
  a=s.index("<script>\n'use strict';")+8; b=s.index('</script>',a)
  open('scratch/echoloc/obf/full.js','w').write(s[a:b])
  subprocess.check_call(['node','src/echoloc/strip.mjs','scratch/echoloc/obf/full.js','scratch/echoloc/obf/ship.js'])
  s=s[:a]+open('scratch/echoloc/obf/ship.js').read()+s[b:]
  os.makedirs('scratch/echoloc/ship',exist_ok=True); open('scratch/echoloc/ship/index.html','w').write(s)
else: print('WARNING: obfuscator (and the parser the strip needs) not installed: docs/ gets the full game')
if os.path.exists(OBF):
  a=s.index("<script>\n'use strict';")+8; b=s.index('</script>',a)
  open('scratch/echoloc/obf/in.js','w').write(s[a:b])
  # no flattening or dead code: the raycaster runs thousands of times per frame. Short names (Math.*, x, z, length...) stay inline for the same reason: the encoded table costs a lookup each time.
  cfg=dict(compact=True,target='browser',renameGlobals=True,identifierNamesGenerator='hexadecimal',stringArray=True,stringArrayWrappersCount=0,stringArrayCallsTransform=False,forceTransformStrings=['letmesee','letmecheat'],stringArrayThreshold=1,stringArrayEncoding=['base64'],stringArrayRotate=False,stringArrayShuffle=True,
    controlFlowFlattening=False,deadCodeInjection=False,selfDefending=False,splitStrings=False,unicodeEscapeSequence=False,
    reservedStrings=['^[A-Za-z0-9_]{1,12}$'])
  json.dump(cfg,open('scratch/echoloc/obf/cfg.json','w'))
  subprocess.check_call(['node',OBF,'scratch/echoloc/obf/in.js','--output','scratch/echoloc/obf/out.js','--config','scratch/echoloc/obf/cfg.json'],stdout=subprocess.DEVNULL)
  o=open('scratch/echoloc/obf/out.js').read(); assert '</script' not in o
  s=s[:a]+o+'\n'+s[b:]
else: print('WARNING: obfuscator not installed, docs/ gets the readable script')
open('docs/echoloc/index.html','w').write(s)
# itch.io build (user 2026-11-06): the same game, no level102.com top bar (it stays in the page, hidden, for the language/size/help API)
os.makedirs('scratch/echoloc/itch',exist_ok=True)
# itch.io: no level102.com top bar at all (user 2026-11-06). The game only needs a few things from it (bar height,
# text size, a language hint, help): a tiny stand-in gives them.
SHIM="""<style>:root{--l102-bar-h:0px;--fs:1.1}</style>
<script>(function(){var h=document.documentElement,fs=1.1;try{fs=parseFloat(localStorage.getItem('l102.fs'))||1.1;}catch(e){}h.style.setProperty('--fs',fs);
window.L102={lang:'en',fs:fs,langs:['en','es','de'],setLang:function(l){this.lang=l;},help:function(){},
 setFs:function(v){v=Math.max(.8,Math.min(1.8,v));this.fs=v;h.style.setProperty('--fs',v);try{localStorage.setItem('l102.fs',v);}catch(e){}}};})();</script>"""
it=re.sub(r'<!-- l102-card[\s\S]*?<!-- /l102-card -->','',s)
it=re.sub(r'<!-- l102-topbar:start[\s\S]*?<!-- l102-topbar:head-end -->',lambda m:SHIM,it,count=1)
it=re.sub(r'<!-- BODY part[\s\S]*?<!-- l102-topbar:end -->','',it,count=1)
it=re.sub(r'<!--[\s\S]*?-->','',it)   # no HTML comments
open('scratch/echoloc/itch/index.html','w').write(it)
import zipfile,re as _re
_v=_re.search(r"VERSION='([0-9.]+)'",open('src/echoloc/src.html').read()).group(1)
with zipfile.ZipFile(f'scratch/echoloc/itch/echoloc-itch-{_v}.zip','w',zipfile.ZIP_DEFLATED) as z: z.write('scratch/echoloc/itch/index.html','index.html')
print('itch zip: scratch/echoloc/itch/echoloc-itch-'+_v+'.zip')

print(len(s),"bytes")
