# builds docs/fluid/index.html from src/fluid/src.html: pastes the shared top bar verbatim + the favicon
import urllib.parse
t=open('templates/topbar.html').read()
head=t[t.index('<!-- l102-topbar:start'):t.index('<!-- l102-topbar:head-end -->')+len('<!-- l102-topbar:head-end -->')]
body=t[t.index('<!-- BODY part'):t.index('<!-- l102-topbar:end -->')+len('<!-- l102-topbar:end -->')]
icon=open('src/fluid/icon.svg').read()
fav="data:image/svg+xml,"+urllib.parse.quote(icon,safe=' =:/,;#"()').replace('"','%22').replace('#','%23')
s=open('src/fluid/src.html').read().replace('@@TOPBAR_HEAD@@',head).replace('@@TOPBAR_BODY@@',body).replace('@@FAVICON@@',fav)
import os,re;os.makedirs('docs/fluid',exist_ok=True)
# keep the link-preview block that tools/make_cards.mjs wrote
try:
  old=open('docs/fluid/index.html').read();m=re.search(r'<!-- l102-card[\s\S]*?<!-- /l102-card -->',old)
  if m:s=re.sub(r'(<link rel="icon"[^>]*>)',lambda k:k.group(1)+'\n'+m.group(0),s,count=1)
except FileNotFoundError:pass
open('docs/fluid/index.html','w').write(s)
print(len(s),"bytes")
