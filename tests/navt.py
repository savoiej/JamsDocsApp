import os
APP=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','apps','jamsnet','index.html')
import asyncio,json
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'harness.py')).read().split('async def main')[0])
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':900})
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.route(lambda u:u.startswith('https://'),lambda r:r.abort())
        html=open(APP).read().replace('<head>','<head><script>'+FAKE+'</script>',1)
        await pg.set_content(html);await pg.wait_for_timeout(150)
        # early click before network docs is ready
        await pg.evaluate("document.querySelector('[data-nlgo=tickets]').click()");await pg.wait_for_timeout(2500)
        f=pg.frames[1] if len(pg.frames)>1 else None
        print('early click lands on',f and await f.evaluate("S.view"))
        await f.evaluate("loadSample()");await pg.wait_for_timeout(1500)
        await pg.evaluate("document.querySelectorAll('#nav .navsec').forEach(s=>s.classList.remove('closed'))")
        items=await pg.evaluate("[...document.querySelectorAll('#nav [data-go],#nav [data-nlgo]')].map(b=>({go:b.dataset.go||'',nl:b.dataset.nlgo||'',t:b.textContent.trim()}))")
        bad=[]
        for it in items:
            sel=f"#nav [data-go='{it['go']}']" if it['go'] else f"#nav [data-nlgo='{it['nl']}']"
            await pg.evaluate(f"document.querySelector(\"{sel}\").click()");await pg.wait_for_timeout(500)
            crumb=await pg.inner_text('#topbar .crumb b')
            if it['go']:
                ok=await pg.evaluate(f"!document.querySelector('#v-{it['go']}').hidden && document.querySelector('#v-{it['go']}').innerHTML.length>50")
                h=await pg.evaluate(f"(document.querySelector('#v-{it['go']} h1')||{{}}).textContent||''")
            else:
                v=await f.evaluate("S.view");ok=v==it['nl'];h=await f.evaluate("(document.querySelector('#v-'+S.view+' h1')||{}).textContent||''")
                cur=await pg.evaluate("document.querySelector('#nav [aria-current]')?.dataset.nlgo||''")
                if cur!=it['nl']:bad.append(('highlight',it['t'],cur))
            if not ok:bad.append(('view',it['t'],h))
            print(f"{it['t'][:28]:28} → {h.strip()[:40]:40} | crumb {crumb}")
        print('BAD',bad);print(errs[:5]);await b.close()
asyncio.run(main())
