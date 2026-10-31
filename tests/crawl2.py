import os
APP=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','apps','jamsnet','index.html')
import asyncio,json,re
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'harness.py')).read().split('async def main')[0])
SKIP=re.compile(r'del|remove|void|discard|reset|clear|purge|wipe|print|pdf|csv|download|backup|export|send|issue|dictat|record|photo|upload|import|restore|sample|copy|share|scan|camera|qr|label|delete|unpin|admSeed|seed',re.I)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':900})
        errs=[];pg.on('pageerror',lambda e:errs.append('main:'+str(e)))
        await pg.route(lambda u:u.startswith('https://'),lambda r:r.abort())
        html=open(APP).read().replace('<head>','<head><script>'+FAKE+'</script>',1)
        await pg.set_content(html);await pg.wait_for_timeout(2500)
        await pg.click('[data-nlgo=overview]');await pg.wait_for_timeout(1200)
        f=pg.frames[1]
        await f.evaluate("window.__E=[];window.addEventListener('error',e=>__E.push(String(e.message)));window.addEventListener('unhandledrejection',e=>__E.push('rej:'+String(e.reason&&e.reason.message||e.reason)))")
        await f.click('[data-act=loadSample]');await pg.wait_for_timeout(1800)
        views=await f.evaluate("Object.keys(VIEWS)")
        rep={}
        for v in views:
            await f.evaluate(f"closeDialog();go('{v}')");await pg.wait_for_timeout(200)
            n=await f.evaluate(f"document.querySelectorAll('#v-{v} [data-act],#v-{v} [data-go]').length")
            for k in range(min(n,70)):
                d=await f.evaluate(f"""()=>{{const e=document.querySelectorAll('#v-{v} [data-act],#v-{v} [data-go]')[{k}];return e?{{act:e.dataset.act||'',go:e.dataset.go||'',txt:(e.textContent||'').trim().slice(0,30),dis:!!e.disabled,tag:e.tagName,type:e.type||''}}:null}}""")
                if not d or d['dis'] or SKIP.search(d['act']) or d['tag'] in ('INPUT','SELECT','TEXTAREA') or d['type']=='submit':continue
                b0=await f.evaluate("__E.length");m0=len(errs)
                await f.evaluate(f"(()=>{{const e=document.querySelectorAll('#v-{v} [data-act],#v-{v} [data-go]')[{k}];if(e)e.dispatchEvent(new MouseEvent('click',{{bubbles:true}}))}})()");await pg.wait_for_timeout(90)
                E=await f.evaluate(f"__E.slice({b0})")
                if E or len(errs)>m0:rep.setdefault(v,[]).append((d['act'] or 'go:'+d['go'],d['txt'],(E+errs[m0:])[:2]))
                await f.evaluate(f"closeDialog();if(S.view!=='{v}')go('{v}')");await pg.wait_for_timeout(30)
        print(json.dumps(rep,indent=1))
        await b.close()
asyncio.run(main())
