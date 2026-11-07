# checks every src/echoloc/i18n/<code>.json against en.json: same keys, same shapes, same {placeholders}, same HTML tags
import json,re,sys,glob,os
D=os.path.dirname(os.path.abspath(__file__)); en=json.load(open(D+'/en.json'))
LANGS="en-GB es de fr it pt-BR pt-PT ru ro ca eu gl id ms sw ta te mr ne si mn ja zh zh-Hant ko eo hi ar bn ur vi tr nl pl ha cs uk sv sq sr-Latn kk hy fi da he hu no sk th el hr bg sl lt lv et fa fil mk bs be ka is".split()
ph=lambda s:sorted(re.findall(r'\{\w+\}',s)); tags=lambda s:sorted(re.findall(r'</?[a-z0-9]+',s))
def flat(v): return v if isinstance(v,list) else [v]
bad=0; want=sys.argv[1:] or LANGS
for c in want:
    p=f'{D}/{c}.json'
    if not os.path.exists(p): print('MISSING',c); bad+=1; continue
    try: t=json.load(open(p))
    except Exception as e: print('BADJSON',c,e); bad+=1; continue
    errs=[]
    if set(t)!=set(en): errs.append('keys: missing '+','.join(sorted(set(en)-set(t)))[:200]+' extra '+','.join(sorted(set(t)-set(en)))[:100])
    for k,v in en.items():
        if k not in t: continue
        a,b=flat(v),flat(t[k])
        if type(v)!=type(t[k]) or len(a)!=len(b): errs.append(k+': shape'); continue
        for x,y in zip(a,b):
            if not isinstance(y,str) or not y.strip(): errs.append(k+': empty'); continue
            if ph(x)!=ph(y): errs.append(k+': placeholders '+str(ph(y)))
            if tags(x)!=tags(y): errs.append(k+': tags')
    if errs: bad+=1; print('FAIL',c,'; '.join(errs)[:400])
print('checked',len(want),'bad',bad); sys.exit(1 if bad else 0)
