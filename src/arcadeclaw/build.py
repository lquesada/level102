# builds docs/arcadeclaw/index.html from src/arcadeclaw/src.html + parts (see CONTRACT.md)
import os,re,urllib.parse
R='src/arcadeclaw/'
t=open('templates/topbar.html').read()
head=t[t.index('<!-- l102-topbar:start'):t.index('<!-- l102-topbar:head-end -->')+len('<!-- l102-topbar:head-end -->')]
body=t[t.index('<!-- BODY part'):t.index('<!-- l102-topbar:end -->')+len('<!-- l102-topbar:end -->')]
icon=open(R+'icon.svg').read() if os.path.exists(R+'icon.svg') else '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5a3418"/></svg>'
fav="data:image/svg+xml,"+urllib.parse.quote(icon,safe=' =:/,;()').replace('"','%22')
part=lambda n:open(R+'parts/'+n).read() if os.path.exists(R+'parts/'+n) else '/* '+n+' missing */'
s=open(R+'src.html').read()
for k,v in [('@@TOPBAR_HEAD@@',head),('@@TOPBAR_BODY@@',body),('@@FAVICON@@',fav),('@@ART@@',part('art.js')),('@@TOYS@@',part('toys.js')),('@@GAME@@',part('game.js'))]:
  s=s.replace(k,v)
os.makedirs('docs/arcadeclaw',exist_ok=True)
try:
  old=open('docs/arcadeclaw/index.html').read();m=re.search(r'<!-- l102-card[\s\S]*?<!-- /l102-card -->',old)
  if m:s=re.sub(r'(<link rel="icon"[^>]*>)',lambda k:k.group(1)+'\n'+m.group(0),s,count=1)
except FileNotFoundError:pass
open('docs/arcadeclaw/index.html','w').write(s);print(len(s),'bytes')
